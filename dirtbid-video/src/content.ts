/**
 * Every word that appears on screen lives in this file.
 * Edit the script here without touching animation code.
 */
export const content = {
  hook: {
    line1: "You're about to buy land.",
    line2: 'Do you know what the dirt costs?',
    parcelLabel: 'PARCEL 0417-22 · 38.6 AC · UNKNOWN',
  },

  problem: {
    headline: 'Most developers make an offer before they know.',
    risks: [
      {label: 'Bad soil', icon: 'soil'},
      {label: 'Import / export', icon: 'haul'},
      {label: 'Cut and fill', icon: 'cutfill'},
      {label: 'High water table', icon: 'water'},
      {label: 'Shallow rock', icon: 'rock'},
      {label: 'Stormwater and BMP', icon: 'storm'},
      {label: 'Offsite utilities', icon: 'utility'},
      {label: 'Turn lanes and entrances', icon: 'road'},
    ] as const,
    pileLabel: 'UNPRICED RISK',
  },

  stakes: {
    headline: 'One soil surprise can erase your whole margin.',
    changeOrder: 250000,
    changeOrderLabel: 'unbudgeted change order',
    proForma: {
      title: 'PRO FORMA',
      bars: [
        {label: 'Land', value: 62},
        {label: 'Site work', value: 78},
        {label: 'Soft costs', value: 40},
        {label: 'Profit', value: 46},
      ],
      profitAfter: -38,
    },
    headline2: 'And you already paid the civil. And the geotech. And the survey.',
    receipt: {
      items: [
        {label: 'Civil engineering', amount: 48500},
        {label: 'Geotechnical', amount: 22000},
        {label: 'Boundary + topo survey', amount: 9800},
      ],
      totalLabel: 'Spent before you know if the site works',
    },
  },

  turn: {
    tagline: 'Price the dirt before you price the deal.',
  },

  product: {
    beatA: {
      kicker: '01 · SOIL',
      callouts: ['Marine clay', 'Hydrologic group D', 'Water table 18 in.'],
      source: 'Official USDA-NRCS soil survey',
      units: ['MkB', 'Bh', 'Do', 'Ur', 'Cl', 'Sf'],
    },
    beatB: {
      kicker: '02 · ESTIMATE',
      lineItems: [
        {code: '31 23 00', name: 'Earthwork · cut / fill', amount: 412000},
        {code: '31 25 00', name: 'Erosion & sediment control', amount: 86500},
        {code: '33 41 00', name: 'Storm drainage + BMP', amount: 318000},
        {code: '33 11 00', name: 'Water + sanitary', amount: 520000},
        {code: '32 11 00', name: 'Roads · base + paving', amount: 388000},
      ],
      subtotalLabel: 'Direct cost subtotal',
      markups: [
        {label: 'Mobilization', pct: 0.04},
        {label: 'Contingency', pct: 0.1},
        {label: 'Overhead', pct: 0.08},
        {label: 'Profit', pct: 0.1},
        {label: 'Bond', pct: 0.015},
        {label: 'Insurance', pct: 0.012},
      ],
      totalLabel: 'Site work estimate',
      caption: 'CSI-organized. Regionally priced. Defensible line by line.',
    },
    beatC: {
      kicker: '03 · SPEED',
      before: '3 weeks',
      beforeLabel: 'typical due diligence',
      after: '30 min',
      afterLabel: 'with DirtBid',
      line1: 'Three weeks of due diligence. In under 30 minutes.',
      line2: 'Before you sign the contract.',
    },
  },

  partners: {
    headline: 'And the team to get it built.',
    subline: 'Vetted partners at every step — matched to your state and your region.',
    verified: 'Verified Partner',
    /** Placeholder firm names. Invented, not real companies. */
    stages: [
      {stage: 'Land screening', firm: 'Northgate Land Advisors'},
      {stage: 'Survey', firm: 'Baseline & Meridian Surveying'},
      {stage: 'Civil engineering', firm: 'Ridgeway Civil Group'},
      {stage: 'Geotech + environmental', firm: 'Substrata Geo-Environmental'},
      {stage: 'Title', firm: 'Fieldstone Title Company'},
      {stage: 'Land use attorney', firm: 'Harlan & Voss, Land Use Law'},
      {stage: 'Financing', firm: 'Bluestone Development Capital'},
      {stage: 'Insurance', firm: 'Ashgrove Risk & Surety'},
      {stage: 'Site work contractor', firm: 'Ironhill Sitework & Grading'},
    ],
    payoffLabel: 'RAW DIRT TO FINISHED PLAN',
    payoffStats: '34 LOTS · 2,140 LF ROAD · GRADED',
  },

  cta: {
    headline: 'Screen your next parcel free.',
    domain: 'dirtbidai.com',
    sub: 'Free soil report. No credit card.',
    states: 'Virginia · Maryland · North Carolina · Texas',
  },

  brand: {
    wordmarkA: 'Dirt',
    wordmarkB: 'Bid',
  },
} as const;
