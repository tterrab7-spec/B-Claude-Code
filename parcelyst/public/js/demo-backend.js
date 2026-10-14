/*
 * In-browser backend used when the site is served statically (no Node server).
 * Same service code as the server, with a localStorage store. Accounts and data
 * live only in this browser; purchases apply instantly (no payment is taken).
 */
(function () {
  'use strict';
  var KEY = 'parcelyst-demo-v1', TOKEN = 'parcelyst-demo-token';
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  var mem = load() || { seq: 1, users: [], sessions: {}, usage: {}, analyses: [], searches: [], pipeline: [], imports: [], payments: [], leads: [], props: [] };
  function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* storage full or blocked: keep in memory */ } }
  function nextId() { return mem.seq++; }
  var demoProps = window.PSeed.generateAll();
  var byId = {}; demoProps.forEach(function (p) { byId[p.id] = p; });
  var norm = window.PService.normAddr;
  function clone(o) { return o ? JSON.parse(JSON.stringify(o)) : o; }
  function findUser(fn) { for (var i = 0; i < mem.users.length; i++) if (fn(mem.users[i])) return mem.users[i]; return null; }

  var store = {
    getUserByEmail: function (e) { return clone(findUser(function (u) { return u.email === e; })); },
    getUserById: function (id) { return clone(findUser(function (u) { return u.id === id; })); },
    getUserBySession: function (t) { var s = mem.sessions[t]; if (!s || s.exp < new Date().toISOString()) return null; return store.getUserById(s.userId); },
    createUser: function (u) { var r = Object.assign({ id: nextId(), createdAt: new Date().toISOString(), extraMarkets: 0 }, u); mem.users.push(r); save(); return clone(r); },
    updateUser: function (id, p) { var u = findUser(function (x) { return x.id === id; }); if (u) { Object.assign(u, p); save(); } },
    createSession: function (uid) { var t = Math.random().toString(36).slice(2) + Date.now().toString(36); var exp = new Date(Date.now() + 30 * 864e5).toISOString(); mem.sessions[t] = { userId: uid, exp: exp }; save(); return { token: t, exp: exp }; },
    deleteSession: function (t) { delete mem.sessions[t]; save(); },
    usageGet: function (uid, m, k) { return mem.usage[uid + '|' + m + '|' + k] || 0; },
    usageInc: function (uid, m, k, n) { var key = uid + '|' + m + '|' + k; mem.usage[key] = (mem.usage[key] || 0) + n; save(); },
    listProperties: function (market, ownerId) {
      var own = mem.props.filter(function (p) { return p.ownerId === ownerId && p.rec.market === market; }).map(function (p) { return p.rec; });
      var shared = demoProps.filter(function (p) { return p.market === market; });
      if (!own.length) return shared;
      var keys = {}; own.forEach(function (r) { keys[norm(r.address) + '|' + r.zip] = 1; });
      return own.concat(shared.filter(function (r) { return !keys[norm(r.address) + '|' + r.zip]; }));
    },
    findPropertyByAddress: function (n, zip, ownerId) {
      var own = mem.props.filter(function (p) { return p.ownerId === ownerId && norm(p.rec.address) === n && (!zip || p.rec.zip === zip); });
      if (own.length) return clone(own[0].rec);
      for (var i = 0; i < demoProps.length; i++) if (norm(demoProps[i].address) === n && (!zip || demoProps[i].zip === zip)) return clone(demoProps[i]);
      return null;
    },
    getProperty: function (id, ownerId) { if (byId[id]) return clone(byId[id]); var o = mem.props.filter(function (p) { return p.rec.id === id && p.ownerId === ownerId; })[0]; return o ? clone(o.rec) : null; },
    insertProperties: function (recs, ownerId) { recs.forEach(function (r) { mem.props.push({ ownerId: ownerId, rec: r }); }); save(); return recs.length; },
    insertAnalysis: function (a) { mem.analyses.push(Object.assign({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, clone(a))); save(); },
    getAnalysis: function (id) { return clone(mem.analyses.filter(function (a) { return a.id === id; })[0] || null); },
    getAnalysisByShare: function (t) { return clone(mem.analyses.filter(function (a) { return a.shareToken === t; })[0] || null); },
    listAnalyses: function (uid) { return clone(mem.analyses.filter(function (a) { return a.userId === uid; }).sort(function (a, b) { return a.updatedAt < b.updatedAt ? 1 : -1; })); },
    updateAnalysis: function (id, p) { var a = mem.analyses.filter(function (x) { return x.id === id; })[0]; if (a) { Object.assign(a, clone(p), { updatedAt: new Date().toISOString() }); save(); } },
    deleteAnalysis: function (id) { mem.analyses = mem.analyses.filter(function (a) { return a.id !== id; }); save(); },
    listSearches: function (uid) { return clone(mem.searches.filter(function (s) { return s.userId === uid; })); },
    insertSearch: function (s) { var r = Object.assign({ id: nextId(), createdAt: new Date().toISOString() }, clone(s)); mem.searches.push(r); save(); return r.id; },
    getSearch: function (id) { return clone(mem.searches.filter(function (s) { return s.id === id; })[0] || null); },
    updateSearch: function (id, p) { var s = mem.searches.filter(function (x) { return x.id === id; })[0]; if (s) { Object.assign(s, p); save(); } },
    deleteSearch: function (id) { mem.searches = mem.searches.filter(function (s) { return s.id !== id; }); save(); },
    listPipeline: function (uid) { return clone(mem.pipeline.filter(function (p) { return p.userId === uid; }).sort(function (a, b) { return a.updatedAt < b.updatedAt ? 1 : -1; })); },
    upsertPipeline: function (p) {
      var ex = mem.pipeline.filter(function (x) { return x.userId === p.userId && x.propertyId === p.propertyId; })[0];
      if (ex) { Object.assign(ex, { mode: p.mode, score: p.score, snapshot: p.snapshot, updatedAt: new Date().toISOString() }); save(); return ex.id; }
      var r = Object.assign({ id: nextId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, clone(p)); mem.pipeline.push(r); save(); return r.id;
    },
    getPipeline: function (id) { return clone(mem.pipeline.filter(function (p) { return p.id === id; })[0] || null); },
    updatePipeline: function (id, p) { var it = mem.pipeline.filter(function (x) { return x.id === id; })[0]; if (it) { Object.assign(it, p, { updatedAt: new Date().toISOString() }); save(); } },
    deletePipeline: function (id) { mem.pipeline = mem.pipeline.filter(function (p) { return p.id !== id; }); save(); },
    insertImport: function (i) { mem.imports.push(Object.assign({ id: nextId(), created_at: new Date().toISOString() }, i)); save(); },
    listImports: function (uid) { return clone(mem.imports.filter(function (i) { return i.userId === uid; })); },
    listPayments: function (uid) { return clone(mem.payments.filter(function (p) { return p.userId === uid; })); },
    listTeam: function (oid) { return clone(mem.users.filter(function (u) { return u.teamOwnerId === oid; })); },
    insertLead: function (l) { mem.leads.push(Object.assign({ created_at: new Date().toISOString() }, l)); save(); },
    adminStats: function () { return { users: mem.users.length, analyses: mem.analyses.length, leads: mem.leads }; }
  };

  function sha(s) {
    if (window.crypto && crypto.subtle) return crypto.subtle.digest('SHA-256', new TextEncoder().encode('parcelyst:' + s)).then(function (b) { return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join(''); });
    return Promise.resolve('plain:' + s);
  }

  var service = window.PService.createService(store, {
    mode: 'demo',
    hashPassword: sha,
    verifyPassword: function (pw, h) { return sha(pw).then(function (x) { return x === h; }); },
    providers: function () { return {}; },
    billingMode: function () { return 'demo'; },
    checkout: function (user, product) {
      var parts = product.split(':');
      if (parts[0] === 'plan') store.updateUser(user.id, { plan: parts[1], planInterval: parts[2], planStatus: 'active', planRenewsAt: new Date(Date.now() + (parts[2] === 'annual' ? 365 : 30) * 864e5).toISOString() });
      else if (parts[0] === 'pack') store.updateUser(user.id, { credits: (user.credits || 0) + window.PPlans.PACKS[parts[1]].credits });
      else if (parts[0] === 'addon') store.updateUser(user.id, { extraMarkets: (user.extraMarkets || 0) + 1 });
      else return Promise.reject(Object.assign(new Error('Unknown product'), { status: 400 }));
      mem.payments.push({ userId: user.id, product: product, amount_cents: 0, status: 'demo', created_at: new Date().toISOString() }); save();
      return Promise.resolve({ url: window.PUI.ROOT + 'app/account.html?purchased=' + encodeURIComponent(product), dev: true });
    }
  });

  function token() { try { return localStorage.getItem(TOKEN); } catch (e) { return window.__pdemoToken || null; } }
  function setToken(t) { try { if (t) localStorage.setItem(TOKEN, t); else localStorage.removeItem(TOKEN); } catch (e) { window.__pdemoToken = t; } }

  window.PDemoBackend = {
    handle: function (method, path, query, body) {
      return service.handle(method, path, query, body ? clone(body) : {}, { token: token(), baseUrl: location.origin + window.PUI.ROOT.replace(/\/$/, '') }).then(function (res) {
        if (res.session !== undefined) setToken(res.session ? res.session.token : null);
        return res;
      });
    }
  };
})();
