// Operator configuration. Edit here, no code changes needed elsewhere.
export const CONFIG = {
  brand: 'TUNED',
  tagline: 'Keep your body running so you can keep doing what you love.',
  supportEmail: 'team@tuned.health',

  // Launch partner. Shows a co-brand strip when someone arrives with ?ref=<code>.
  partners: {
    DADBACK: { name: 'The Dad Back', kind: 'creator', door: 'life', option: 'dad', url: 'https://www.instagram.com/thedadback' },
  },

  // Pricing. Swap the checkout URLs for Stripe Payment Links when they exist.
  plans: [
    { id: 'free', name: 'Body Score', price: 0, per: '', blurb: 'Your number, free. Re-screen anytime.',
      features: ['5-minute camera movement screen', 'Body Score with 4-part breakdown', 'One starter session'], checkout: null },
    { id: 'member', name: 'TUNED Membership', price: 39, per: '/mo', blurb: 'The full engine, every program.', featured: true,
      features: ['Every 6-week Sprint, back to back', 'AI coach with form checks and voice check-ins', 'Squads, challenges and leaderboards', 'Licensed PT reviews your progress', 'Cancel anytime'], checkout: '' },
    { id: 'sprint', name: 'Sprint + PT', price: 249, per: ' one-time', blurb: 'One Sprint with 3 live PT video visits.',
      features: ['6-week Sprint with a finish line', 'Intake, mid-point and discharge video visits', 'Kit discount included', 'HSA / FSA eligible'], checkout: '' },
  ],
  kit: { name: 'TUNED Kit', price: 79, items: ['3 loop bands', 'Long resistance band with door anchor', 'Mini band', 'Dowel', 'Kit-only follow-along sessions'], checkout: '' },

  // RTM billing estimates per code, in dollars. Placeholders: replace with your
  // contracted or locality-adjusted Medicare rates before using them for planning.
  rtmRates: { '98975': 20, '98977': 44, '98985': 44, '98979': 26, '98980': 50, '98981': 40 },

  // Clinician licensure. Patients in other states are flagged for routing.
  ptStates: ['VA', 'NC', 'MD', 'DC', 'TX'],
};
