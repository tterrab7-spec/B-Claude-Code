/*
 * Parcelyst API service. One implementation of every endpoint, used by:
 *   - the Node server (SQLite store, Stripe, live data providers)
 *   - the in-browser demo backend (localStorage store) when the site is hosted statically
 *
 * createService(store, hooks) -> { handle(method, path, query, body, ctx) }
 * ctx: { token, baseUrl }   result: { status, json | csv, session?: {token, exp} | null (clear) }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./engine.js'), require('./markets.js'), require('./plans.js'), require('./scoring.js'), require('./defaults.js'), require('./csv.js'));
  } else root.PService = factory(root.PEngine, root.PMarkets, root.PPlans, root.PScoring, root.PDefaults, root.PCsv);
})(typeof self !== 'undefined' ? self : this, function (PEngine, PMarkets, PPlans, PScoring, PDefaults, PCsv) {
  'use strict';

  function HttpError(status, msg, code, extra) { var e = new Error(msg); e.status = status; e.code = code; e.extra = extra; return e; }
  function monthKey(d) { d = d || new Date(); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
  function rid() { var s = ''; for (var i = 0; i < 12; i++) s += 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]; return s; }
  var SUFFIX = { street: 'st', avenue: 'ave', drive: 'dr', road: 'rd', lane: 'ln', court: 'ct', boulevard: 'blvd', place: 'pl', circle: 'cir', parkway: 'pkwy', highway: 'hwy', terrace: 'ter', trail: 'trl' };
  function normAddr(a) {
    return String(a || '').toLowerCase().split(',')[0].replace(/[.#]/g, ' ').replace(/\s+/g, ' ').trim()
      .split(' ').map(function (w) { return SUFFIX[w] || w; }).join(' ');
  }
  function zipOf(a) { var m = String(a || '').match(/\b(\d{5})(?:-\d{4})?\b\s*$/); return m ? m[1] : null; }
  function bool(v) { return v === true || v === 'true' || v === '1' || v === 1; }
  function numq(v) { var n = parseFloat(v); return isNaN(n) ? undefined : n; }
  function list(v) { if (!v) return []; return Array.isArray(v) ? v : String(v).split(',').map(function (x) { return x.trim(); }).filter(Boolean); }

  function summaryOf(result) {
    var m = result.metrics || {};
    return { score: result.score, verdict: result.verdict.label, tone: result.verdict.tone, price: result.assumptions.price,
      cap: m.cap !== undefined ? m.cap : null, cfMonthly: m.cfMonthly !== undefined ? m.cfMonthly : null, irr: m.irr !== undefined ? m.irr : (m.leveredIrr !== undefined ? m.leveredIrr : null),
      lots: m.lots || null, address: result.assumptions.address, city: result.assumptions.city, state: result.assumptions.state };
  }

  function createService(store, hooks) {
    hooks = hooks || {};
    var mode = hooks.mode || 'server';

    function planOf(user) { var owner = user && user.teamOwnerId ? store.getUserById(user.teamOwnerId) || user : user; return PPlans.plan(owner ? owner.plan : 'free'); }
    function ownerOf(user) { return user && user.teamOwnerId ? store.getUserById(user.teamOwnerId) || user : user; }
    function usage(user, metric) { return store.usageGet(ownerOf(user).id, monthKey(), metric); }
    function remaining(user, metric) { return Math.max(0, planOf(user).limits[metric] - usage(user, metric)); }
    function consume(user, metric, n) {
      var lim = planOf(user).limits[metric];
      var used = usage(user, metric);
      if (used + (n || 1) > lim) throw HttpError(402, 'You have used your ' + lim + ' monthly ' + metric + ' on the ' + planOf(user).name + ' plan.', 'limit', { metric: metric, limit: lim, used: used });
      store.usageInc(ownerOf(user).id, monthKey(), metric, n || 1);
    }
    function allowedMarkets(user) {
      var p = planOf(user), owner = ownerOf(user);
      if (p.limits.markets >= 99) return PMarkets.MARKETS.map(function (m) { return m.id; });
      var cap = p.limits.markets + (owner.extraMarkets || 0);
      return (owner.markets || []).slice(0, cap);
    }
    function ensureMarket(user, marketId) {
      var p = planOf(user), owner = ownerOf(user);
      if (p.limits.markets >= 99) return true;
      var cap = p.limits.markets + (owner.extraMarkets || 0);
      var cur = owner.markets || [];
      if (cur.indexOf(marketId) !== -1 && cur.indexOf(marketId) < cap) return true;
      if (cur.length < cap) { store.updateUser(owner.id, { markets: cur.concat([marketId]) }); return true; }
      return false;
    }
    function meOut(user) {
      if (!user) return null;
      var p = planOf(user), owner = ownerOf(user), u = {};
      ['lookups', 'analyses', 'reports', 'exports'].forEach(function (k) { u[k] = { used: usage(user, k), limit: p.limits[k] >= PPlans.UNLIMITED ? null : p.limits[k] }; });
      return {
        id: user.id, email: user.email, name: user.name, role: user.role, isAdmin: !!user.isAdmin,
        plan: owner.plan, planName: p.name, planInterval: owner.planInterval || null, planStatus: owner.planStatus || 'active', planRenewsAt: owner.planRenewsAt || null,
        credits: user.credits || 0, markets: allowedMarkets(user), marketSlots: p.limits.markets >= 99 ? null : p.limits.markets + (owner.extraMarkets || 0),
        features: p.features, usage: u, branding: user.branding || {}, teamOwnerId: user.teamOwnerId || null, seats: p.limits.seats
      };
    }
    function requireUser(ctx) { if (!ctx.user) throw HttpError(401, 'Sign in required', 'auth'); return ctx.user; }

    function recordsFor(user, market) { return store.listProperties(market, user ? ownerOf(user).id : null); }

    async function rates() {
      if (hooks.liveRates) { try { return await hooks.liveRates(PMarkets.RATES_FALLBACK); } catch (e) { /* fall through */ } }
      return { rates: Object.assign({}, PMarkets.RATES_FALLBACK), sources: { mortgage30: 'Freddie Mac PMMS reference ' + (PMarkets.RATES_FALLBACK.mortgage30 * 100).toFixed(2) + '% (' + PMarkets.RATES_FALLBACK.asOf + ')' }, live: false };
    }

    function maskRecord(r) {
      return Object.assign({}, r, { address: String(r.address || '').replace(/^\d+/, '•••'), ownerName: r.ownerName ? r.ownerName.replace(/[A-Za-z]/g, function (c, i) { return i < 1 ? c : '•'; }) : null, mailingAddress: null, phone: null, email: null, masked: true });
    }

    function filtersFrom(q) {
      return {
        market: q.market, assetGroup: q.assetGroup || 'all', assetTypes: list(q.assetTypes), locality: q.locality, zips: list(q.zips),
        minScore: numq(q.minScore), minEquity: numq(q.minEquity), minYearsOwned: numq(q.minYearsOwned), minValue: numq(q.minValue), maxValue: numq(q.maxValue), minAcres: numq(q.minAcres),
        absentee: bool(q.absentee), outOfState: bool(q.outOfState), taxDelinquent: bool(q.taxDelinquent), preforeclosure: bool(q.preforeclosure), probate: bool(q.probate), vacant: bool(q.vacant), expired: bool(q.expired),
        q: q.q, sort: q.sort
      };
    }
    var MODE_FEATURE = { investor: 'finder', agent: 'prospector', land: 'landFinder' };

    function runSearch(user, q) {
      var mode2 = q.mode || 'investor';
      if (!MODE_FEATURE[mode2]) throw HttpError(400, 'Unknown mode');
      var market = q.market || (PMarkets.MARKETS[0].id);
      if (!PMarkets.byId(market)) throw HttpError(400, 'Unknown market');
      var f = filtersFrom(q); f.market = market;
      var p = planOf(user);
      var preview = !user || !p.features[MODE_FEATURE[mode2]];
      var lockedMarket = false;
      if (!preview && !ensureMarket(user, market)) { preview = true; lockedMarket = true; }
      var res = PScoring.search(recordsFor(user, market), mode2, f);
      return { mode: mode2, market: market, filters: f, results: res, preview: preview, lockedMarket: lockedMarket };
    }

    var routes = [];
    function route(method, pattern, fn) {
      var keys = [];
      var re = new RegExp('^' + pattern.replace(/:(\w+)/g, function (_, k) { keys.push(k); return '([^/]+)'; }) + '$');
      routes.push({ method: method, re: re, keys: keys, fn: fn });
    }

    // ---------- meta ----------
    route('GET', '/api/health', function () { return { ok: true, mode: mode }; });
    route('GET', '/api/config', async function () {
      var r = await rates();
      return { mode: mode, markets: PMarkets.MARKETS.map(function (m) { return { id: m.id, name: m.name, state: m.state, msa: m.msa, status: m.status, localities: m.localities.map(function (l) { return { id: l.id, name: l.name, zips: l.zips }; }) }; }),
        plans: PPlans.PLANS, packs: PPlans.PACKS, addons: PPlans.ADDONS, providers: hooks.providers ? hooks.providers() : {}, billing: hooks.billingMode ? hooks.billingMode() : 'demo', rates: r.rates, rateSources: r.sources, ratesLive: r.live,
        listTypes: Object.keys(PCsv.LIST_TYPES).map(function (k) { return { id: k, label: PCsv.LIST_TYPES[k].label }; }), assetTypes: PScoring.ASSET_TYPES,
        partner: hooks.partner || null };
    });
    route('GET', '/api/rates', async function () { return rates(); });

    // ---------- auth ----------
    route('POST', '/api/auth/signup', async function (ctx, b) {
      var email = String(b.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw HttpError(400, 'Enter a valid email');
      if (String(b.password || '').length < 8) throw HttpError(400, 'Password must be at least 8 characters');
      if (store.getUserByEmail(email)) throw HttpError(409, 'An account with that email already exists. Sign in instead.');
      var hash = await hooks.hashPassword(b.password);
      var role = ['investor', 'agent', 'developer', 'broker', 'lender'].indexOf(b.role) !== -1 ? b.role : 'investor';
      var user = store.createUser({ email: email, name: String(b.name || '').slice(0, 120), passHash: hash, role: role, plan: 'free', credits: 0, markets: [], branding: {} });
      var s = store.createSession(user.id);
      return { _session: s, user: meOut(user) };
    });
    route('POST', '/api/auth/login', async function (ctx, b) {
      var user = store.getUserByEmail(String(b.email || '').trim().toLowerCase());
      if (!user || !(await hooks.verifyPassword(String(b.password || ''), user.passHash))) throw HttpError(401, 'Email or password is incorrect');
      var s = store.createSession(user.id);
      return { _session: s, user: meOut(user) };
    });
    route('POST', '/api/auth/logout', function (ctx) { if (ctx.token) store.deleteSession(ctx.token); return { _session: null, ok: true }; });
    route('GET', '/api/me', function (ctx) { return { user: meOut(ctx.user) }; });
    route('PUT', '/api/me', function (ctx, b) {
      var u = requireUser(ctx), patch = {};
      if (b.name !== undefined) patch.name = String(b.name).slice(0, 120);
      if (b.role) patch.role = b.role;
      if (b.branding) patch.branding = { name: b.branding.name, title: b.branding.title, brokerage: b.branding.brokerage, phone: b.branding.phone, email: b.branding.email, photoUrl: b.branding.photoUrl, license: b.branding.license, color: b.branding.color };
      if (b.markets) {
        var p = planOf(u), owner = ownerOf(u);
        if (owner.id !== u.id) throw HttpError(403, 'Only the account owner can change markets');
        var cap = p.limits.markets >= 99 ? 99 : p.limits.markets + (owner.extraMarkets || 0);
        patch.markets = list(b.markets).filter(function (m) { return !!PMarkets.byId(m); }).slice(0, cap);
      }
      store.updateUser(u.id, patch);
      return { user: meOut(store.getUserById(u.id)) };
    });

    // ---------- lookup + analysis ----------
    route('POST', '/api/lookup', async function (ctx, b) {
      var address = String(b.address || '').trim();
      if (address.length < 5) throw HttpError(400, 'Enter a full street address');
      var n = normAddr(address), zip = zipOf(address);
      var local = store.findPropertyByAddress(n, zip, ctx.user ? ownerOf(ctx.user).id : null);
      var record = local, tried = [], errors = [], external = false;
      var providersOn = hooks.providers ? hooks.providers() : {};
      var anyPaid = providersOn.rentcast || providersOn.attom || providersOn.regrid;
      if (hooks.lookupExternal && (!local || local.source === 'demo' || b.refresh)) {
        if (anyPaid && ctx.user) consume(ctx.user, 'lookups');
        if (anyPaid && !ctx.user) { /* anonymous visitors only get free geocoding */ }
        var ext = await hooks.lookupExternal(address, { paid: !!(anyPaid && ctx.user) });
        tried = ext.tried; errors = ext.errors;
        if (ext.record) { record = Object.assign({}, local && local.source === 'demo' ? {} : (local || {}), ext.record); external = true; if (hooks.saveProperty && ext.record.source !== 'geocode') hooks.saveProperty(record); }
      } else if (ctx.user && local) store.usageInc(ownerOf(ctx.user).id, monthKey(), 'lookups', 0);
      if (!record) return { record: null, tried: tried, errors: errors, message: 'No record found. Enter the details manually; every field is editable.' };
      if (!record.market) { var loc = PDefaults.locate(record); if (loc && loc.market) { record.market = loc.market.id; if (loc.locality) { record.locality = loc.locality.id; record.localityName = loc.locality.name; } } }
      var r = await rates();
      var kind = b.kind || PDefaults.kindOf(record);
      var inputs = PDefaults.build(record, { rates: r.rates, rateSources: r.sources, kind: kind });
      var scores = { investor: PScoring.investorScore(record), agent: PScoring.agentScore(record), land: PScoring.landScore(record) };
      return { record: record, inputs: inputs, kind: kind, scores: scores, external: external, tried: tried, errors: errors, inMarket: !!record.market };
    });

    route('POST', '/api/analyze', function (ctx, b) {
      var inputs = b.inputs || {};
      var result = PEngine.analyze(inputs);
      if (!ctx.user || b.save === false) return { id: null, result: result, saved: false };
      var title = String(b.title || [inputs.address, inputs.city].filter(Boolean).join(', ') || 'Untitled analysis').slice(0, 200);
      if (b.id) {
        var ex = store.getAnalysis(b.id);
        if (!ex || ex.userId !== ctx.user.id) throw HttpError(404, 'Not found');
        store.updateAnalysis(b.id, { inputs: inputs, title: title, summary: summaryOf(result), kind: inputs.kind || 'residential' });
        return { id: b.id, result: result, saved: true };
      }
      consume(ctx.user, 'analyses');
      var id = rid();
      store.insertAnalysis({ id: id, userId: ctx.user.id, kind: inputs.kind || 'residential', title: title, inputs: inputs, summary: summaryOf(result), unlocked: false });
      return { id: id, result: result, saved: true };
    });
    route('GET', '/api/analyses', function (ctx) {
      var u = requireUser(ctx);
      return { analyses: store.listAnalyses(u.id).map(function (a) { return { id: a.id, title: a.title, kind: a.kind, summary: a.summary, unlocked: a.unlocked, shareToken: a.shareToken, createdAt: a.createdAt, updatedAt: a.updatedAt }; }) };
    });
    function loadOwned(ctx, id) { var u = requireUser(ctx); var a = store.getAnalysis(id); if (!a || a.userId !== u.id) throw HttpError(404, 'Analysis not found'); return a; }
    route('GET', '/api/analyses/:id', function (ctx, b, p) {
      var a = loadOwned(ctx, p.id), plan = planOf(ctx.user);
      return { analysis: a, result: PEngine.analyze(a.inputs), unlocked: !!a.unlocked, canUnlock: { allowance: remaining(ctx.user, 'reports'), credits: ctx.user.credits || 0 }, branding: plan.features.branding ? ctx.user.branding : null };
    });
    route('DELETE', '/api/analyses/:id', function (ctx, b, p) { loadOwned(ctx, p.id); store.deleteAnalysis(p.id); return { ok: true }; });
    route('POST', '/api/analyses/:id/unlock', function (ctx, b, p) {
      var a = loadOwned(ctx, p.id), u = ctx.user;
      if (a.unlocked) return { unlocked: true, via: 'already' };
      if (remaining(u, 'reports') > 0) { consume(u, 'reports'); store.updateAnalysis(a.id, { unlocked: true }); return { unlocked: true, via: 'plan' }; }
      if ((u.credits || 0) > 0) { store.updateUser(u.id, { credits: u.credits - 1 }); store.updateAnalysis(a.id, { unlocked: true }); return { unlocked: true, via: 'credit', creditsLeft: u.credits - 1 }; }
      throw HttpError(402, 'Buy a report or upgrade to unlock the full report.', 'paywall');
    });
    route('POST', '/api/analyses/:id/share', function (ctx, b, p) {
      var a = loadOwned(ctx, p.id);
      if (!a.unlocked) throw HttpError(402, 'Unlock the full report before sharing it.', 'paywall');
      var t = a.shareToken || rid() + rid();
      if (!a.shareToken) store.updateAnalysis(a.id, { shareToken: t });
      return { token: t, url: (ctx.baseUrl || '') + '/r.html?t=' + t };
    });
    route('GET', '/api/shared/:token', function (ctx, b, p) {
      var a = store.getAnalysisByShare(p.token);
      if (!a) throw HttpError(404, 'This report link is no longer active.');
      var owner = store.getUserById(a.userId);
      var plan = planOf(owner);
      return { analysis: { id: a.id, title: a.title, kind: a.kind, inputs: a.inputs, createdAt: a.createdAt }, result: PEngine.analyze(a.inputs), branding: plan.features.branding && owner ? owner.branding : null };
    });

    // ---------- finder / prospector / land ----------
    route('GET', '/api/search', function (ctx, b, p, q) {
      var s = runSearch(ctx.user, q);
      var page = Math.max(1, parseInt(q.page || '1', 10)), size = Math.min(100, Math.max(5, parseInt(q.pageSize || '25', 10)));
      var total = s.results.length;
      var rows = s.preview ? s.results.slice(0, 8) : s.results.slice((page - 1) * size, page * size);
      var stats = { total: total, hot: s.results.filter(function (x) { return x.score >= 60; }).length, warm: s.results.filter(function (x) { return x.score >= 40 && x.score < 60; }).length,
        demo: s.results.length ? s.results.filter(function (x) { return x.record.source === 'demo'; }).length : 0 };
      return { mode: s.mode, market: s.market, page: page, pageSize: size, total: total, stats: stats, preview: s.preview, lockedMarket: s.lockedMarket,
        results: rows.map(function (x) { return { score: x.score, signals: x.signals, record: s.preview ? maskRecord(x.record) : x.record }; }) };
    });
    route('GET', '/api/search/export', function (ctx, b, p, q) {
      var u = requireUser(ctx);
      var s = runSearch(u, q);
      if (s.preview) throw HttpError(402, 'Exports are included with Investor, Agent and Pro plans.', 'paywall');
      var max = Math.min(remaining(u, 'exports'), parseInt(q.limit || '5000', 10));
      if (max <= 0) throw HttpError(402, 'You have used this month\'s export rows.', 'limit');
      var rows = s.results.slice(0, max);
      consume(u, 'exports', rows.length);
      var cols = [
        { label: 'Score', get: function (x) { return x.score; } }, { label: 'Signals', get: function (x) { return x.signals.filter(function (s2) { return s2.points > 0; }).map(function (s2) { return s2.label; }).join('; '); } },
        { label: 'Property Address', get: function (x) { return x.record.address; } }, { label: 'City', get: function (x) { return x.record.city; } }, { label: 'State', get: function (x) { return x.record.state; } }, { label: 'Zip', get: function (x) { return x.record.zip; } },
        { label: 'Asset Type', get: function (x) { return x.record.assetType; } }, { label: 'Owner Name', get: function (x) { return x.record.ownerName; } }, { label: 'Owner Type', get: function (x) { return x.record.ownerType; } },
        { label: 'Mailing Address', get: function (x) { return x.record.mailingAddress; } }, { label: 'Est. Value', get: function (x) { return x.record.estValue; } }, { label: 'Est. Equity %', get: function (x) { return x.record.equityPct !== undefined && x.record.equityPct !== null ? Math.round(x.record.equityPct * 100) : ''; } },
        { label: 'Last Sale Date', get: function (x) { return x.record.lastSaleDate; } }, { label: 'Last Sale Price', get: function (x) { return x.record.lastSalePrice; } },
        { label: 'Beds', get: function (x) { return x.record.beds; } }, { label: 'Baths', get: function (x) { return x.record.baths; } }, { label: 'SqFt', get: function (x) { return x.record.sqft || x.record.buildingSf; } }, { label: 'Acres', get: function (x) { return x.record.lotAcres; } },
        { label: 'Zoning', get: function (x) { return x.record.zoning; } }, { label: 'Phone', get: function (x) { return x.record.phone; } }, { label: 'Email', get: function (x) { return x.record.email; } }, { label: 'Source', get: function (x) { return x.record.source; } }
      ];
      return { _csv: PCsv.toCsv(rows, cols), _filename: 'parcelyst-' + s.mode + '-' + s.market + '.csv' };
    });
    route('GET', '/api/property/:id', async function (ctx, b, p) {
      var rec = store.getProperty(decodeURIComponent(p.id), ctx.user ? ownerOf(ctx.user).id : null);
      if (!rec) throw HttpError(404, 'Property not found');
      var feat = planOf(ctx.user).features;
      var visible = ctx.user && (feat.finder || feat.prospector || feat.landFinder);
      var r = await rates();
      return { record: visible ? rec : maskRecord(rec), masked: !visible, inputs: PDefaults.build(rec, { rates: r.rates, rateSources: r.sources }), kind: PDefaults.kindOf(rec),
        scores: { investor: PScoring.investorScore(rec), agent: PScoring.agentScore(rec), land: PScoring.landScore(rec) } };
    });

    // ---------- saved searches ----------
    route('GET', '/api/searches', function (ctx) { return { searches: store.listSearches(requireUser(ctx).id) }; });
    route('POST', '/api/searches', function (ctx, b) {
      var u = requireUser(ctx), lim = planOf(u).limits.savedSearches;
      if (store.listSearches(u.id).length >= lim) throw HttpError(402, 'Your plan includes ' + lim + ' saved searches.', 'limit');
      var s = runSearch(u, Object.assign({}, b.filters, { mode: b.mode }));
      var id = store.insertSearch({ userId: u.id, name: String(b.name || 'Saved search').slice(0, 100), mode: b.mode || 'investor', filters: b.filters || {}, lastCount: s.results.length, lastRun: new Date().toISOString() });
      return { id: id };
    });
    route('POST', '/api/searches/:id/run', function (ctx, b, p) {
      var u = requireUser(ctx), s = store.getSearch(+p.id);
      if (!s || s.userId !== u.id) throw HttpError(404, 'Not found');
      var r = runSearch(u, Object.assign({}, s.filters, { mode: s.mode }));
      var delta = r.results.length - (s.lastCount || 0);
      store.updateSearch(s.id, { lastCount: r.results.length, lastRun: new Date().toISOString() });
      return { count: r.results.length, newSinceLast: Math.max(0, delta) };
    });
    route('DELETE', '/api/searches/:id', function (ctx, b, p) { var u = requireUser(ctx), s = store.getSearch(+p.id); if (!s || s.userId !== u.id) throw HttpError(404, 'Not found'); store.deleteSearch(s.id); return { ok: true }; });

    // ---------- pipeline ----------
    var STAGES = ['New', 'Researching', 'Contacted', 'Appointment', 'Offer / Listing Pitch', 'Under Contract', 'Won', 'Dead'];
    route('GET', '/api/pipeline', function (ctx) { return { stages: STAGES, items: store.listPipeline(requireUser(ctx).id) }; });
    route('POST', '/api/pipeline', function (ctx, b) {
      var u = requireUser(ctx), f = planOf(u).features;
      if (!f.finder && !f.prospector) throw HttpError(402, 'The pipeline is included with paid plans.', 'paywall');
      var rec = store.getProperty(b.propertyId, ownerOf(u).id);
      if (!rec) throw HttpError(404, 'Property not found');
      var sc = PScoring.score(rec, b.mode || 'investor');
      var id = store.upsertPipeline({ userId: u.id, propertyId: rec.id, mode: b.mode || 'investor', stage: STAGES.indexOf(b.stage) !== -1 ? b.stage : 'New', note: b.note || '', score: sc.score, snapshot: { address: rec.address, city: rec.city, state: rec.state, zip: rec.zip, assetType: rec.assetType, ownerName: rec.ownerName, estValue: rec.estValue, mailingAddress: rec.mailingAddress, phone: rec.phone || null, signals: sc.signals.slice(0, 4).map(function (s2) { return s2.label; }) } });
      return { id: id };
    });
    route('PUT', '/api/pipeline/:id', function (ctx, b, p) {
      var u = requireUser(ctx), it = store.getPipeline(+p.id);
      if (!it || it.userId !== u.id) throw HttpError(404, 'Not found');
      var patch = {}; if (b.stage && STAGES.indexOf(b.stage) !== -1) patch.stage = b.stage; if (b.note !== undefined) patch.note = String(b.note).slice(0, 2000);
      store.updatePipeline(it.id, patch); return { ok: true };
    });
    route('DELETE', '/api/pipeline/:id', function (ctx, b, p) { var u = requireUser(ctx), it = store.getPipeline(+p.id); if (!it || it.userId !== u.id) throw HttpError(404, 'Not found'); store.deletePipeline(it.id); return { ok: true }; });

    // ---------- imports ----------
    route('POST', '/api/import', function (ctx, b) {
      var u = requireUser(ctx), f = planOf(u).features;
      if (!f.finder && !f.prospector) throw HttpError(402, 'List import is included with paid plans.', 'paywall');
      if (!b.csv || String(b.csv).length > 25 * 1024 * 1024) throw HttpError(400, 'Attach a CSV under 25 MB');
      var out = PCsv.toRecords(b.csv, { listType: b.listType, market: b.market, filename: b.filename });
      if (b.preview) return { headers: out.headers, mapping: out.mapping, count: out.records.length, skipped: out.skipped, sample: out.records.slice(0, 8), inMarket: out.records.filter(function (r) { return r.market; }).length };
      var n = store.insertProperties(out.records, ownerOf(u).id);
      store.insertImport({ userId: u.id, filename: b.filename || 'upload.csv', market: b.market || null, rows: n });
      return { imported: n, skipped: out.skipped, mapping: out.mapping };
    });
    route('GET', '/api/imports', function (ctx) { return { imports: store.listImports(requireUser(ctx).id) }; });

    // ---------- billing ----------
    route('POST', '/api/billing/checkout', async function (ctx, b) {
      var u = requireUser(ctx);
      if (!hooks.checkout) throw HttpError(503, 'Billing unavailable');
      return await hooks.checkout(u, String(b.product || ''), ctx.baseUrl || '');
    });
    route('POST', '/api/billing/portal', async function (ctx) { var u = requireUser(ctx); if (!hooks.portal) throw HttpError(400, 'No billing portal in demo mode'); return await hooks.portal(u, ctx.baseUrl || ''); });
    route('GET', '/api/billing/payments', function (ctx) { return { payments: store.listPayments(requireUser(ctx).id) }; });

    // ---------- team ----------
    route('GET', '/api/team', function (ctx) { var u = requireUser(ctx), owner = ownerOf(u); return { owner: { id: owner.id, email: owner.email, name: owner.name }, members: store.listTeam(owner.id).map(function (m) { return { id: m.id, email: m.email, name: m.name }; }), seats: planOf(u).limits.seats }; });
    route('POST', '/api/team', async function (ctx, b) {
      var u = requireUser(ctx);
      if (u.teamOwnerId) throw HttpError(403, 'Only the account owner can add teammates');
      var seats = planOf(u).limits.seats, members = store.listTeam(u.id);
      if (members.length + 1 >= seats) throw HttpError(402, 'Your plan includes ' + seats + ' seats.', 'limit');
      var email = String(b.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw HttpError(400, 'Enter a valid email');
      var ex = store.getUserByEmail(email), temp = null;
      if (ex) { if (ex.plan !== 'free') throw HttpError(409, 'That user has their own paid plan'); store.updateUser(ex.id, { teamOwnerId: u.id }); }
      else { temp = rid(); store.createUser({ email: email, name: b.name || '', passHash: await hooks.hashPassword(temp), role: u.role, plan: 'free', credits: 0, markets: [], branding: {}, teamOwnerId: u.id }); }
      return { ok: true, tempPassword: temp };
    });
    route('DELETE', '/api/team/:id', function (ctx, b, p) { var u = requireUser(ctx), m = store.getUserById(+p.id); if (!m || m.teamOwnerId !== u.id) throw HttpError(404, 'Not found'); store.updateUser(m.id, { teamOwnerId: null }); return { ok: true }; });

    // ---------- leads (contact, CPA referral, enterprise) ----------
    route('POST', '/api/leads', function (ctx, b) {
      if (!b.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) throw HttpError(400, 'Enter a valid email');
      store.insertLead({ kind: ['contact', 'tax-referral', 'enterprise', 'market-request'].indexOf(b.kind) !== -1 ? b.kind : 'contact', name: String(b.name || '').slice(0, 120), email: String(b.email).slice(0, 200), phone: String(b.phone || '').slice(0, 40), message: String(b.message || '').slice(0, 4000), meta: b.meta || {} });
      if (hooks.onLead) hooks.onLead(b);
      return { ok: true };
    });

    // ---------- admin ----------
    route('GET', '/api/admin/stats', function (ctx) { var u = requireUser(ctx); if (!u.isAdmin) throw HttpError(403, 'Admin only'); return store.adminStats(); });

    async function handle(method, path, query, body, ctx) {
      ctx = ctx || {};
      ctx.user = ctx.token ? store.getUserBySession(ctx.token) : null;
      for (var i = 0; i < routes.length; i++) {
        var r = routes[i];
        if (r.method !== method) continue;
        var m = path.match(r.re);
        if (!m) continue;
        var params = {}; r.keys.forEach(function (k, j) { params[k] = decodeURIComponent(m[j + 1]); });
        try {
          var out = await r.fn(ctx, body || {}, params, query || {});
          var res = { status: 200 };
          if (out && out._csv !== undefined) { res.csv = out._csv; res.filename = out._filename; return res; }
          if (out && out._session !== undefined) { res.session = out._session; delete out._session; }
          res.json = out;
          return res;
        } catch (e) {
          if (!e.status) { if (hooks.log) hooks.log(e); return { status: 500, json: { error: 'Something went wrong. Try again.' } }; }
          return { status: e.status, json: Object.assign({ error: e.message, code: e.code || null }, e.extra || {}) };
        }
      }
      return { status: 404, json: { error: 'Not found' } };
    }

    return { handle: handle, normAddr: normAddr, monthKey: monthKey, STAGES: STAGES };
  }

  return { createService: createService, normAddr: normAddr };
});
