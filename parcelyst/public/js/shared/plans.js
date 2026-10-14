/*
 * Plans, credit packs and add-ons. Single source of truth for the pricing page,
 * the paywall, usage limits on the server, and Stripe checkout.
 * Stripe price IDs come from env (STRIPE_PRICE_<KEY>) so nothing here is secret.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PPlans = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var UNLIMITED = 1e9;

  var PLANS = {
    free: {
      id: 'free', name: 'Free', monthly: 0, annualMonthly: 0,
      tagline: 'Run the numbers on any address.',
      limits: { lookups: 5, analyses: 5, reports: 0, exports: 0, savedSearches: 0, markets: 0, seats: 1 },
      features: { finder: false, prospector: false, landFinder: false, branding: false, share: false, rentRoll: true, landResidual: true },
      bullets: ['5 property analyses / month', 'Residential, commercial and land underwriting', 'On-screen results with every assumption editable', 'Buy single reports any time']
    },
    investor: {
      id: 'investor', name: 'Investor', monthly: 79, annualMonthly: 66,
      tagline: 'Find off-market deals and underwrite them fast.',
      limits: { lookups: 150, analyses: UNLIMITED, reports: 20, exports: 1000, savedSearches: 10, markets: 1, seats: 1 },
      features: { finder: true, prospector: false, landFinder: false, branding: false, share: true, rentRoll: true, landResidual: true },
      bullets: ['Unlimited analyses, 150 live property pulls / mo', '20 full PDF reports / mo', 'Off-market Deal Finder in 1 market', 'Motivation signals: absentee, equity, tax-delinquent, pre-foreclosure, probate, vacancy', 'Pipeline + 1,000 CSV export rows / mo', 'County list import (unlimited)']
    },
    agent: {
      id: 'agent', name: 'Agent', monthly: 149, annualMonthly: 124,
      tagline: 'Know who lists next. Win the listing with a better report.',
      limits: { lookups: 200, analyses: UNLIMITED, reports: 40, exports: 2500, savedSearches: 20, markets: 1, seats: 1 },
      features: { finder: true, prospector: true, landFinder: false, branding: true, share: true, rentRoll: true, landResidual: true },
      bullets: ['Everything in Investor', 'Listing Prospector: likely-to-list scoring for residential and commercial', '40 branded client reports / mo with your name, photo and contact', 'Shareable report links for buyers and sellers', '2,500 export rows / mo'],
      popular: true
    },
    pro: {
      id: 'pro', name: 'Pro', monthly: 299, annualMonthly: 249,
      tagline: 'Commercial, land and every market, for teams.',
      limits: { lookups: 500, analyses: UNLIMITED, reports: 120, exports: 15000, savedSearches: 100, markets: 99, seats: 3 },
      features: { finder: true, prospector: true, landFinder: true, branding: true, share: true, rentRoll: true, landResidual: true },
      bullets: ['Everything in Agent', 'All live markets', 'Land Finder + lot-yield residual analysis', 'Commercial rent-roll underwriting with rollover, TI/LC and debt sizing', '3 seats, 120 reports, 15,000 export rows / mo', 'Priority data refresh']
    },
    enterprise: {
      id: 'enterprise', name: 'Brokerage & Enterprise', monthly: null, annualMonthly: null,
      tagline: 'White-label, API and custom markets.',
      limits: { lookups: UNLIMITED, analyses: UNLIMITED, reports: UNLIMITED, exports: UNLIMITED, savedSearches: UNLIMITED, markets: 99, seats: 25 },
      features: { finder: true, prospector: true, landFinder: true, branding: true, share: true, rentRoll: true, landResidual: true },
      bullets: ['White-label reports on your domain', 'Team territories and lead routing', 'API access', 'New market onboarding', 'From $999 / month']
    }
  };

  var PACKS = {
    report1: { id: 'report1', name: 'Single Report', price: 29, credits: 1, bullets: ['1 full investment report (PDF + share link)', 'Residential, commercial or land', 'Credits never expire'] },
    report5: { id: 'report5', name: '5-Report Pack', price: 99, credits: 5, bullets: ['5 full investment reports', '$19.80 per report', 'Credits never expire'], popular: true },
    report15: { id: 'report15', name: '15-Report Pack', price: 225, credits: 15, bullets: ['15 full investment reports', '$15 per report', 'Credits never expire'] }
  };

  var ADDONS = {
    market: { id: 'market', name: 'Additional market', price: 39, unit: '/mo', note: 'Add Deal Finder + Prospector coverage in another live market.' },
    exclusiveZip: { id: 'exclusiveZip', name: 'Exclusive ZIP (agents)', price: 99, unit: '/mo per ZIP', note: 'Be the only Parcelyst agent seeing likely-to-list scores in a ZIP. Limited to one agent per ZIP.' },
    skiptrace: { id: 'skiptrace', name: 'Skip tracing', price: 0.15, unit: '/record', note: 'Owner phone + email append, billed only on hits.' },
    extraReport: { id: 'extraReport', name: 'Extra report (subscribers)', price: 9, unit: '/report', note: 'After your monthly allowance.' }
  };

  function plan(id) { return PLANS[id] || PLANS.free; }
  function can(planId, feature) { return !!plan(planId).features[feature]; }
  function limit(planId, key) { return plan(planId).limits[key]; }

  return { PLANS: PLANS, PACKS: PACKS, ADDONS: ADDONS, plan: plan, can: can, limit: limit, UNLIMITED: UNLIMITED };
});
