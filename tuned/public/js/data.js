// TUNED clinical content. Every program runs on this one library.
// Dosage: sets x reps, or sets x secs. `prog` / `reg` point to the harder / easier
// variant the progression engine swaps in. `form` names a camera form-check model.

export const EXERCISES = {
  // ---- Breath / reset
  breath9090: { name: '90/90 Breathing', region: 'core', sets: 1, secs: 90,
    cues: ['On your back, feet on a wall, knees and hips at 90 degrees', 'Breathe in through the nose, ribs expand sideways', 'Long exhale until the ribs drop. Feel your low back flatten'], qname: 'Reset breathing' },
  catCamel: { name: 'Cat-Camel', region: 'back', sets: 1, reps: 10,
    cues: ['Hands and knees', 'Round the spine slowly, then let it sag', 'Move through the range you own, no forcing'] },
  pelvicTilt: { name: 'Pelvic Tilts', region: 'back', sets: 2, reps: 12,
    cues: ['On your back, knees bent', 'Flatten your low back into the floor, then release', 'Small, slow, pain-free'] , prog: 'deadBug' },
  deadBug: { name: 'Dead Bug', region: 'core', sets: 3, reps: 8, perSide: true,
    cues: ['Low back stays heavy on the floor', 'Reach opposite arm and leg long', 'Exhale as you reach'], reg: 'pelvicTilt', prog: 'deadBugHold' },
  deadBugHold: { name: 'Dead Bug with Band Pull', region: 'core', sets: 3, reps: 8, perSide: true,
    cues: ['Band anchored overhead, arms pulling down', 'Extend legs alternately', 'Rib cage stays down'], reg: 'deadBug' },
  birdDog: { name: 'Bird Dog', region: 'back', sets: 3, reps: 8, perSide: true,
    cues: ['Hands under shoulders, knees under hips', 'Reach opposite arm and leg, hold 3 seconds', 'Imagine a glass of water on your low back'], prog: 'birdDogRow' },
  birdDogRow: { name: 'Bird Dog Row', region: 'back', sets: 3, reps: 8, perSide: true,
    cues: ['Bird dog position, light dumbbell in the down hand', 'Row without rotating the hips'], reg: 'birdDog' },
  mcgillCurl: { name: 'McGill Curl-Up', region: 'core', sets: 3, reps: 6,
    cues: ['One knee bent, hands under your low back', 'Lift head and shoulders an inch as one unit', 'Hold 8 seconds. Neck stays neutral'] },
  gluteBridge: { name: 'Glute Bridge', region: 'hip', sets: 3, reps: 12,
    cues: ['Feet flat, hip width', 'Drive through heels, squeeze glutes at the top', 'Ribs down, do not arch the low back'], prog: 'slBridge', qname: 'Bridge' },
  slBridge: { name: 'Single-Leg Bridge', region: 'hip', sets: 3, reps: 8, perSide: true,
    cues: ['One foot planted, other knee hugged or leg extended', 'Hips stay level'], reg: 'gluteBridge' },
  sidePlankKnee: { name: 'Side Plank (Knees)', region: 'core', sets: 3, secs: 20, perSide: true,
    cues: ['Elbow under shoulder, knees bent', 'Straight line knees to head'], prog: 'sidePlank' },
  sidePlank: { name: 'Side Plank', region: 'core', sets: 3, secs: 30, perSide: true,
    cues: ['Feet stacked or staggered', 'Push the floor away, hips high'], reg: 'sidePlankKnee' },
  hipHinge: { name: 'Dowel Hip Hinge', region: 'back', sets: 3, reps: 10, form: 'hinge',
    cues: ['Dowel touching head, upper back and tailbone', 'Push hips back, soft knees', 'Keep all three contact points'], prog: 'kbDeadlift' },
  kbDeadlift: { name: 'Kettlebell Deadlift', region: 'back', sets: 3, reps: 8, form: 'hinge',
    cues: ['Bell between the feet', 'Hips back, flat back, grip and stand tall', 'Lockout with glutes, not your low back'], reg: 'hipHinge', prog: 'rdl' },
  rdl: { name: 'Romanian Deadlift', region: 'back', sets: 3, reps: 8, form: 'hinge',
    cues: ['Weights at the hips, soft knees', 'Slide down the thighs until hamstrings load', 'Drive hips forward to stand'], reg: 'kbDeadlift' },
  boxSquat: { name: 'Box Squat', region: 'knee', sets: 3, reps: 10, form: 'squat',
    cues: ['Sit back to a chair or bench', 'Tap, do not plop', 'Knees track over toes'], prog: 'gobletSquat' },
  gobletSquat: { name: 'Goblet Squat', region: 'knee', sets: 3, reps: 10, form: 'squat',
    cues: ['Weight at chest, elbows down', 'Sit between the heels', 'Chest proud, knees out'], reg: 'boxSquat', prog: 'frontSquat' },
  frontSquat: { name: 'Front Squat / Heavy Goblet', region: 'knee', sets: 4, reps: 6, form: 'squat',
    cues: ['Brace before you descend', 'Full depth you can control', 'Drive up through mid-foot'], reg: 'gobletSquat' },
  suitcaseCarry: { name: 'Suitcase Carry', region: 'core', sets: 3, secs: 40, perSide: true,
    cues: ['Heavy weight in one hand', 'Walk tall, shoulders level', 'Do not lean toward or away from the weight'], prog: 'farmerCarry' },
  farmerCarry: { name: 'Farmer Carry', region: 'core', sets: 3, secs: 45,
    cues: ['Heavy in both hands', 'Short quick steps, tall posture'], reg: 'suitcaseCarry' },
  walk: { name: 'Brisk Walk', region: 'general', sets: 1, mins: 20,
    cues: ['Pace where you can talk but not sing', 'Arms swinging, long spine'], prog: 'walkHills' },
  walkHills: { name: 'Hill or Incline Walk', region: 'general', sets: 1, mins: 25,
    cues: ['Find an incline or a hill route', 'Steady breathing'], reg: 'walk' },
  hipFlexor: { name: 'Half-Kneeling Hip Flexor Stretch', region: 'hip', sets: 2, secs: 40, perSide: true,
    cues: ['Back knee down, tuck the tailbone', 'Squeeze the back glute', 'Feel the front of the hip, not the low back'] },
  openBook: { name: 'Open Book Rotation', region: 'thoracic', sets: 2, reps: 8, perSide: true,
    cues: ['Lie on your side, knees stacked at 90', 'Open the top arm and chest to the ceiling', 'Follow the hand with your eyes'] },
  pallof: { name: 'Pallof Press', region: 'core', sets: 3, reps: 10, perSide: true,
    cues: ['Band anchored at chest height to your side', 'Press straight out and resist the twist', 'Hold 2 seconds out front'] },
  // ---- Knee
  quadSet: { name: 'Quad Sets', region: 'knee', sets: 3, reps: 10,
    cues: ['Leg straight, towel under the knee', 'Tighten the thigh to press the knee down', 'Hold 5 seconds'], prog: 'slr' },
  slr: { name: 'Straight Leg Raise', region: 'knee', sets: 3, reps: 10, perSide: true,
    cues: ['Lock the knee straight with a quad set first', 'Lift to the height of the other knee'], reg: 'quadSet', prog: 'spanishSquat' },
  spanishSquat: { name: 'Spanish Squat Hold', region: 'knee', sets: 4, secs: 30,
    cues: ['Band behind both knees anchored in front', 'Sit back with shins vertical', 'Quads burn, knees should not hurt'], reg: 'slr', prog: 'splitSquat' },
  wallSit: { name: 'Wall Sit', region: 'knee', sets: 3, secs: 30,
    cues: ['Back on the wall, slide down to a pain-free depth', 'Weight through the heels'] },
  stepUp: { name: 'Step-Up', region: 'knee', sets: 3, reps: 10, perSide: true,
    cues: ['Whole foot on the step', 'Drive through the top leg, do not push off the bottom', 'Knee tracks over the second toe'], prog: 'stepDown' },
  stepDown: { name: 'Lateral Step-Down', region: 'knee', sets: 3, reps: 8, perSide: true,
    cues: ['Stand on a step, lower the other heel to tap the floor', 'Slow 3-second lower', 'Knee stays in line with the toes'], reg: 'stepUp' },
  splitSquat: { name: 'Split Squat', region: 'knee', sets: 3, reps: 8, perSide: true, form: 'squat',
    cues: ['Long stance, back heel up', 'Drop the back knee straight down', 'Front knee can travel past the toes'], reg: 'spanishSquat', prog: 'rfess' },
  rfess: { name: 'Rear-Foot Elevated Split Squat', region: 'knee', sets: 3, reps: 8, perSide: true, form: 'squat',
    cues: ['Back foot on a bench', 'Control the descent, drive up'], reg: 'splitSquat' },
  calfRaise: { name: 'Calf Raise', region: 'ankle', sets: 3, reps: 15,
    cues: ['Full range, pause at the top', 'Slow 3-second lower'], prog: 'slCalfRaise' },
  slCalfRaise: { name: 'Single-Leg Calf Raise', region: 'ankle', sets: 3, reps: 12, perSide: true,
    cues: ['Fingertip support only', 'Heel all the way up, all the way down'], reg: 'calfRaise' },
  slRDL: { name: 'Single-Leg RDL', region: 'hip', sets: 3, reps: 8, perSide: true, form: 'hinge',
    cues: ['Hinge on one leg, back leg reaches long', 'Hips stay square to the floor'] },
  bandWalk: { name: 'Lateral Band Walk', region: 'hip', sets: 3, reps: 12, perSide: true,
    cues: ['Band above knees or at the ankles', 'Quarter squat, toes forward', 'Step wide, do not let the feet snap together'] },
  slBalance: { name: 'Single-Leg Balance', region: 'ankle', sets: 3, secs: 30, perSide: true,
    cues: ['Soft knee, tall posture', 'Progress: eyes closed or on a pillow'] },
  // ---- Shoulder / neck
  wallSlide: { name: 'Wall Slides', region: 'shoulder', sets: 3, reps: 10,
    cues: ['Forearms on the wall', 'Slide up while pushing gently into the wall', 'No shrugging'], form: 'overhead' },
  bandRow: { name: 'Band Row', region: 'shoulder', sets: 3, reps: 12,
    cues: ['Squeeze shoulder blades back and down', 'Elbows to the ribs'] },
  bandER: { name: 'Band External Rotation', region: 'shoulder', sets: 3, reps: 12, perSide: true,
    cues: ['Elbow pinned to your side, towel roll under it', 'Rotate the forearm out slowly'], prog: 'er90' },
  er90: { name: 'External Rotation at 90', region: 'shoulder', sets: 3, reps: 10, perSide: true,
    cues: ['Elbow at shoulder height', 'Rotate up like a goalpost'], reg: 'bandER' },
  facePull: { name: 'Face Pull', region: 'shoulder', sets: 3, reps: 12,
    cues: ['Band at face height', 'Pull to the eyes with thumbs back'] },
  pullApart: { name: 'Band Pull-Apart', region: 'shoulder', sets: 3, reps: 15,
    cues: ['Arms straight at chest height', 'Pull the band to your chest'] },
  scapPushup: { name: 'Scap Push-Up', region: 'shoulder', sets: 3, reps: 10,
    cues: ['Plank or incline position, arms straight', 'Let the chest sink between the shoulder blades, then push away'] },
  proneYT: { name: 'Prone Y-T Raises', region: 'shoulder', sets: 2, reps: 10,
    cues: ['Face down on a bench or floor', 'Thumbs up, lift the arms into a Y, then a T'] },
  landminePress: { name: 'Landmine Press', region: 'shoulder', sets: 3, reps: 8, perSide: true,
    cues: ['Half kneeling, bar in one hand', 'Press up and forward, reach at the top'], form: 'overhead' },
  chinTuck: { name: 'Chin Tucks', region: 'neck', sets: 3, reps: 10,
    cues: ['Make a double chin, eyes level', 'Hold 5 seconds'], prog: 'chinTuckLift' },
  chinTuckLift: { name: 'Supine Chin Tuck Lift', region: 'neck', sets: 3, reps: 8,
    cues: ['Lying down, tuck, then lift the head an inch', 'Hold 5 seconds'], reg: 'chinTuck' },
  levatorStretch: { name: 'Levator Scapulae Stretch', region: 'neck', sets: 2, secs: 30, perSide: true,
    cues: ['Look toward the armpit', 'Gentle hand assist, shoulder down'] },
  neckIso: { name: 'Neck Isometrics', region: 'neck', sets: 2, reps: 5,
    cues: ['Hand on the forehead, sides, back of head', 'Push gently 30%, hold 5 seconds, no movement'] },
  thoracicExt: { name: 'Thoracic Extension over Chair', region: 'thoracic', sets: 2, reps: 10,
    cues: ['Sit, hands behind head', 'Extend the upper back over the chair back'] },
  // ---- Sport specific
  hip9090: { name: '90/90 Hip Switches', region: 'hip', sets: 2, reps: 8, perSide: true,
    cues: ['Seated, both knees at 90 degrees', 'Rotate the knees side to side without hands if you can'] },
  mbRotation: { name: 'Med Ball Rotational Throw', region: 'core', sets: 3, reps: 6, perSide: true,
    cues: ['Load the back hip', 'Rotate hips then chest then arms', 'Throw into a wall'] },
  wristEcc: { name: 'Wrist Extensor Eccentrics', region: 'elbow', sets: 3, reps: 15, perSide: true,
    cues: ['Forearm on a table, palm down, light weight', 'Lift with the other hand, lower slowly over 4 seconds'] },
  splitStep: { name: 'Split-Step Drill', region: 'general', sets: 4, secs: 30,
    cues: ['Small hop to a wide athletic stance', 'React left, right, forward'] },
  aSkip: { name: 'A-Skips', region: 'general', sets: 3, reps: 20,
    cues: ['Knee up, toe up', 'Strike under the hip'] },
  pogo: { name: 'Pogo Hops', region: 'ankle', sets: 3, reps: 20,
    cues: ['Stiff ankles, quick ground contact', 'Stay tall'], reg: 'calfRaise' },
  slHop: { name: 'Single-Leg Hop and Stick', region: 'knee', sets: 3, reps: 5, perSide: true,
    cues: ['Hop forward, stick the landing for 2 seconds', 'Knee over toes on landing'] },
  lateralBound: { name: 'Lateral Bound and Stick', region: 'hip', sets: 3, reps: 6, perSide: true,
    cues: ['Bound sideways, land soft on one leg', 'Hold the landing 2 seconds'] },
  landing: { name: 'Drop Landing', region: 'knee', sets: 3, reps: 6,
    cues: ['Step off a low box', 'Land quiet on both feet, knees out, hips back'] },
  copenhagen: { name: 'Copenhagen Plank (Short Lever)', region: 'hip', sets: 3, secs: 15, perSide: true,
    cues: ['Side plank with top knee on a bench', 'Squeeze the inner thigh to lift'] },
  pushup: { name: 'Push-Up', region: 'shoulder', sets: 3, reps: 10,
    cues: ['Hands under shoulders, body in one line', 'Elbows 45 degrees'] },
  // ---- Daily life / work
  floorToStand: { name: 'Floor-to-Stand', region: 'general', sets: 3, reps: 5,
    cues: ['From lying on the floor, get up any way you can', 'Then try with fewer hand touches'] },
  liftMechanics: { name: 'Lift Mechanics Practice', region: 'back', sets: 3, reps: 8, form: 'hinge',
    cues: ['Box at the floor, feet around it', 'Hinge, brace, lift close to the body', 'Turn with the feet, not the spine'] },
  overheadReach: { name: 'Overhead Carry', region: 'shoulder', sets: 3, secs: 30,
    cues: ['Light weight locked out overhead', 'Ribs down, biceps by the ear'] },
  deskBreak: { name: '2-Minute Desk Reset', region: 'general', sets: 1, mins: 2,
    cues: ['Stand up, 10 chin tucks, 10 shoulder rolls', '5 standing back bends, 5 hip hinges'] },
  seatedTwist: { name: 'Seated Thoracic Twist', region: 'thoracic', sets: 2, reps: 8, perSide: true,
    cues: ['Sit tall, arms crossed', 'Rotate from the ribs, hips stay still'] },
  ruckStep: { name: 'Loaded Step-Up', region: 'knee', sets: 3, reps: 10, perSide: true,
    cues: ['Pack or vest on', 'Controlled up and down'] },
  // ---- Pelvic (Quiet Mode track). Names are neutral by design.
  pfQuick: { name: 'Pelvic Floor Quick Contractions', qname: 'Quick holds', region: 'pelvic', sets: 3, reps: 10,
    cues: ['Squeeze as if stopping the flow of urine and holding in gas', 'Lift and let go fully, 1 second each', 'Do not hold your breath or squeeze your glutes'] },
  pfLong: { name: 'Pelvic Floor Long Holds', qname: 'Long holds', region: 'pelvic', sets: 3, reps: 10,
    cues: ['Squeeze and lift, hold 5 seconds, fully relax 5 seconds', 'Work up to 10-second holds', 'Breathe normally throughout'] },
  pfKnack: { name: 'The Knack', qname: 'Pre-brace', region: 'pelvic', sets: 1, reps: 10,
    cues: ['Contract the pelvic floor right before you cough, sneeze, stand or lift', 'Practice with a fake cough 10 times'] },
  pfStanding: { name: 'Standing Pelvic Floor Holds', qname: 'Standing holds', region: 'pelvic', sets: 3, reps: 10,
    cues: ['Same squeeze in standing, the hardest position', 'Hold 5-10 seconds'] },
  pfWalk: { name: 'Pelvic Floor Holds While Walking', qname: 'Moving holds', region: 'pelvic', sets: 3, reps: 5,
    cues: ['Gentle 30% hold for 10 steps', 'Relax for 10 steps'] },
  pfBridge: { name: 'Bridge with Pelvic Floor Contraction', qname: 'Bridge hold', region: 'pelvic', sets: 3, reps: 10,
    cues: ['Contract the pelvic floor first, then lift the hips', 'Lower and fully relax'] },
};

// A Sprint = 6 weeks, 3 two-week phases, A/B sessions alternating, 4 sessions a week.
// Day 14 re-score exists because men drop off around week 3 without visible proof.
const P = (calm, build, load) => [calm, build, load];

export const SPRINTS = {
  back40: {
    title: 'Fix Your Back in 6 Weeks', short: 'Back', door: 'pain',
    goal: 'Bend, lift and sleep without your back running the show.',
    outcome: 'Pain under 3/10 and a deadlift pattern you trust.',
    phases: P(
      { name: 'Calm it down', A: ['breath9090', 'catCamel', 'pelvicTilt', 'gluteBridge', 'walk'], B: ['breath9090', 'birdDog', 'sidePlankKnee', 'hipFlexor', 'walk'] },
      { name: 'Build the base', A: ['catCamel', 'deadBug', 'mcgillCurl', 'gluteBridge', 'hipHinge'], B: ['birdDog', 'sidePlankKnee', 'boxSquat', 'suitcaseCarry', 'walk'] },
      { name: 'Load it up', A: ['mcgillCurl', 'deadBug', 'kbDeadlift', 'suitcaseCarry', 'walkHills'], B: ['birdDog', 'sidePlank', 'gobletSquat', 'pallof', 'farmerCarry'] }) },
  knee: {
    title: 'Bulletproof Knees in 6 Weeks', short: 'Knee', door: 'pain',
    goal: 'Stairs, squats and the court without the knee talking back.',
    outcome: 'Full-depth squat and stairs at 2/10 or less.',
    phases: P(
      { name: 'Calm it down', A: ['quadSet', 'slr', 'gluteBridge', 'calfRaise', 'walk'], B: ['spanishSquat', 'bandWalk', 'slBalance', 'calfRaise'] },
      { name: 'Build the base', A: ['spanishSquat', 'boxSquat', 'stepUp', 'calfRaise'], B: ['wallSit', 'slBridge', 'bandWalk', 'slBalance'] },
      { name: 'Load it up', A: ['gobletSquat', 'splitSquat', 'stepDown', 'slCalfRaise'], B: ['spanishSquat', 'slRDL', 'stepDown', 'landing'] }) },
  shoulder: {
    title: 'Fix Your Shoulder in 6 Weeks', short: 'Shoulder', door: 'pain',
    goal: 'Reach overhead, press and sleep on that side again.',
    outcome: 'Pain-free overhead reach and pressing.',
    phases: P(
      { name: 'Calm it down', A: ['scapPushup', 'bandRow', 'bandER', 'wallSlide'], B: ['thoracicExt', 'openBook', 'bandER', 'pullApart'] },
      { name: 'Build the base', A: ['bandRow', 'facePull', 'er90', 'wallSlide'], B: ['proneYT', 'scapPushup', 'pullApart', 'openBook'] },
      { name: 'Load it up', A: ['landminePress', 'facePull', 'er90', 'pushup'], B: ['proneYT', 'bandRow', 'overheadReach', 'farmerCarry'] }) },
  neck: {
    title: 'Unlock Your Neck in 6 Weeks', short: 'Neck', door: 'pain',
    goal: 'Turn your head, check the blind spot and finish the workday loose.',
    outcome: 'Full rotation both ways and no end-of-day headache.',
    phases: P(
      { name: 'Calm it down', A: ['chinTuck', 'levatorStretch', 'thoracicExt', 'bandRow'], B: ['chinTuck', 'openBook', 'pullApart', 'walk'] },
      { name: 'Build the base', A: ['chinTuckLift', 'neckIso', 'bandRow', 'thoracicExt'], B: ['chinTuck', 'facePull', 'proneYT', 'openBook'] },
      { name: 'Load it up', A: ['chinTuckLift', 'neckIso', 'facePull', 'farmerCarry'], B: ['proneYT', 'bandRow', 'pushup', 'seatedTwist'] }) },
  golf: {
    title: 'Add Turn, Not Pain: Golf Sprint', short: 'Golf', door: 'sport',
    goal: 'More rotation, a quieter back and the last 6 holes as good as the first.',
    outcome: 'Measured gain in rotation and hip mobility, back pain-free through 18.',
    phases: P(
      { name: 'Unlock rotation', A: ['openBook', 'hip9090', 'catCamel', 'gluteBridge'], B: ['seatedTwist', 'hipFlexor', 'birdDog', 'pallof'] },
      { name: 'Own the positions', A: ['hip9090', 'slRDL', 'pallof', 'sidePlank'], B: ['openBook', 'gobletSquat', 'slBalance', 'deadBug'] },
      { name: 'Add speed', A: ['mbRotation', 'slRDL', 'pallof', 'kbDeadlift'], B: ['mbRotation', 'lateralBound', 'sidePlank', 'openBook'] }) },
  lifting: {
    title: 'Lift Heavy Again: Strength Sprint', short: 'Lifting', door: 'sport',
    goal: 'Get back under the bar without the tweak coming back.',
    outcome: 'Pain-free hinge and squat at working weight.',
    phases: P(
      { name: 'Reset patterns', A: ['breath9090', 'hipHinge', 'boxSquat', 'birdDog', 'pullApart'], B: ['catCamel', 'gluteBridge', 'deadBug', 'facePull', 'suitcaseCarry'] },
      { name: 'Rebuild', A: ['kbDeadlift', 'gobletSquat', 'pallof', 'bandRow'], B: ['slRDL', 'splitSquat', 'sidePlank', 'facePull'] },
      { name: 'Back under load', A: ['rdl', 'frontSquat', 'farmerCarry', 'pushup'], B: ['kbDeadlift', 'rfess', 'copenhagen', 'landminePress'] }) },
  running: {
    title: 'Run Without the Ache: Running Sprint', short: 'Running', door: 'sport',
    goal: 'Stack miles without the knee, shin or Achilles flaring.',
    outcome: 'Pain-free 5K and better single-leg control.',
    phases: P(
      { name: 'Calm and load', A: ['calfRaise', 'gluteBridge', 'slBalance', 'bandWalk'], B: ['spanishSquat', 'slBridge', 'hipFlexor', 'walk'] },
      { name: 'Build capacity', A: ['slCalfRaise', 'stepDown', 'slRDL', 'aSkip'], B: ['splitSquat', 'copenhagen', 'sidePlank', 'pogo'] },
      { name: 'Spring', A: ['slCalfRaise', 'rfess', 'pogo', 'slHop'], B: ['stepDown', 'slRDL', 'aSkip', 'lateralBound'] }) },
  pickleball: {
    title: 'Court Ready: Pickleball Sprint', short: 'Pickleball', door: 'sport',
    goal: 'Move side to side without the knee, calf or elbow giving out.',
    outcome: 'Pain-free elbow and quicker lateral movement.',
    phases: P(
      { name: 'Calm it down', A: ['wristEcc', 'calfRaise', 'bandWalk', 'gluteBridge'], B: ['wristEcc', 'slBalance', 'bandER', 'walk'] },
      { name: 'Build', A: ['wristEcc', 'stepUp', 'bandWalk', 'pallof'], B: ['slCalfRaise', 'splitSquat', 'facePull', 'splitStep'] },
      { name: 'Quick feet', A: ['wristEcc', 'lateralBound', 'splitStep', 'slCalfRaise'], B: ['stepDown', 'mbRotation', 'splitStep', 'copenhagen'] }) },
  basketball: {
    title: 'Back on the Court: Hoops Sprint', short: 'Basketball', door: 'sport',
    goal: 'Cut, jump and land without rolling the ankle or the knee giving out.',
    outcome: 'Clean single-leg landings and no pain on hard cuts.',
    phases: P(
      { name: 'Foundation', A: ['calfRaise', 'slBalance', 'gluteBridge', 'bandWalk'], B: ['spanishSquat', 'slBridge', 'sidePlankKnee', 'landing'] },
      { name: 'Build', A: ['slCalfRaise', 'stepDown', 'landing', 'copenhagen'], B: ['splitSquat', 'slRDL', 'pogo', 'lateralBound'] },
      { name: 'Explode', A: ['rfess', 'slHop', 'lateralBound', 'pogo'], B: ['gobletSquat', 'slHop', 'splitStep', 'copenhagen'] }) },
  over40: {
    title: 'Stay in the Game: 40+ Sprint', short: '40+', door: 'life',
    goal: 'Keep the strength, balance and mobility you will want at 60.',
    outcome: 'Higher Body Score and a floor-to-stand with no hands.',
    phases: P(
      { name: 'Wake it up', A: ['breath9090', 'catCamel', 'gluteBridge', 'boxSquat', 'walk'], B: ['birdDog', 'slBalance', 'wallSlide', 'floorToStand'] },
      { name: 'Build', A: ['gobletSquat', 'hipHinge', 'bandRow', 'suitcaseCarry'], B: ['stepUp', 'slBalance', 'pushup', 'floorToStand'] },
      { name: 'Strong', A: ['kbDeadlift', 'splitSquat', 'farmerCarry', 'pushup'], B: ['gobletSquat', 'stepDown', 'pallof', 'walkHills'] }) },
  dad: {
    title: 'Keep Up With Your Kids: Dad Sprint', short: 'Dad', door: 'life',
    goal: 'Get on the floor, lift them, chase them and still feel good tomorrow.',
    outcome: 'Pain-free lifting, carrying and floor play.',
    phases: P(
      { name: 'Reset', A: ['breath9090', 'catCamel', 'gluteBridge', 'boxSquat', 'walk'], B: ['birdDog', 'hipFlexor', 'floorToStand', 'suitcaseCarry'] },
      { name: 'Build', A: ['gobletSquat', 'hipHinge', 'pallof', 'suitcaseCarry'], B: ['stepUp', 'floorToStand', 'bandRow', 'sidePlankKnee'] },
      { name: 'Dad strength', A: ['kbDeadlift', 'splitSquat', 'farmerCarry', 'overheadReach'], B: ['gobletSquat', 'floorToStand', 'lateralBound', 'pushup'] }) },
  postop: {
    title: 'Comeback Sprint: After Surgery', short: 'Post-op', door: 'life', needsClearance: true,
    goal: 'Follow your surgeon\'s protocol with a PT in your pocket.',
    outcome: 'Hit every protocol milestone on schedule.',
    phases: P(
      { name: 'Protect', A: ['breath9090', 'quadSet', 'gluteBridge', 'walk'], B: ['breath9090', 'pelvicTilt', 'slr', 'walk'] },
      { name: 'Restore', A: ['spanishSquat', 'boxSquat', 'bandRow', 'walk'], B: ['slBalance', 'stepUp', 'birdDog', 'calfRaise'] },
      { name: 'Return', A: ['gobletSquat', 'stepDown', 'suitcaseCarry', 'walkHills'], B: ['splitSquat', 'slRDL', 'pallof', 'walkHills'] }) },
  pelvic: {
    title: 'Core Program', short: 'Core', door: 'life', quiet: true,
    goal: 'Regain control after prostate treatment, privately.',
    outcome: 'Fewer pads per day and confidence when you cough, lift or stand.',
    phases: P(
      { name: 'Find it', A: ['breath9090', 'pfQuick', 'pfLong', 'gluteBridge'], B: ['breath9090', 'pfLong', 'pfKnack', 'walk'] },
      { name: 'Strengthen', A: ['pfLong', 'pfQuick', 'pfBridge', 'pfKnack'], B: ['pfStanding', 'pfQuick', 'boxSquat', 'walk'] },
      { name: 'Real life', A: ['pfStanding', 'pfWalk', 'pfKnack', 'gobletSquat'], B: ['pfStanding', 'pfQuick', 'suitcaseCarry', 'walkHills'] }) },
  trades: {
    title: 'Built for the Job: Trades Sprint', short: 'Trades', door: 'work',
    goal: 'Lift, kneel and work overhead all week without paying for it on Saturday.',
    outcome: 'Pain-free lifting mechanics and overhead work.',
    phases: P(
      { name: 'Reset', A: ['catCamel', 'birdDog', 'hipHinge', 'bandRow'], B: ['openBook', 'gluteBridge', 'wallSlide', 'suitcaseCarry'] },
      { name: 'Build', A: ['liftMechanics', 'gobletSquat', 'facePull', 'sidePlank'], B: ['kbDeadlift', 'stepUp', 'bandER', 'farmerCarry'] },
      { name: 'Job strong', A: ['liftMechanics', 'rdl', 'overheadReach', 'farmerCarry'], B: ['splitSquat', 'landminePress', 'pallof', 'suitcaseCarry'] }) },
  desk: {
    title: 'Undo the Desk: 6-Week Sprint', short: 'Desk', door: 'work',
    goal: 'Stop the neck, low back and hip tightness that comes from 9 hours sitting.',
    outcome: 'Less stiffness at 5 PM and a better posture score.',
    phases: P(
      { name: 'Unlock', A: ['deskBreak', 'chinTuck', 'thoracicExt', 'hipFlexor'], B: ['deskBreak', 'openBook', 'gluteBridge', 'walk'] },
      { name: 'Build', A: ['chinTuckLift', 'facePull', 'deadBug', 'hipFlexor'], B: ['seatedTwist', 'bandRow', 'gobletSquat', 'walk'] },
      { name: 'Strong at the desk', A: ['proneYT', 'kbDeadlift', 'pallof', 'deskBreak'], B: ['facePull', 'splitSquat', 'sidePlank', 'walkHills'] }) },
  trucker: {
    title: 'Road Ready: Driver Sprint', short: 'Driver', door: 'work',
    goal: 'Back and hips that survive long hauls. Most of it can be done at a truck stop.',
    outcome: 'Less pain after a full shift behind the wheel.',
    phases: P(
      { name: 'Undo the seat', A: ['hipFlexor', 'seatedTwist', 'catCamel', 'walk'], B: ['chinTuck', 'gluteBridge', 'openBook', 'walk'] },
      { name: 'Build', A: ['boxSquat', 'birdDog', 'bandRow', 'walk'], B: ['hipHinge', 'sidePlankKnee', 'hipFlexor', 'suitcaseCarry'] },
      { name: 'Road strong', A: ['gobletSquat', 'kbDeadlift', 'pallof', 'walkHills'], B: ['stepUp', 'sidePlank', 'facePull', 'farmerCarry'] }) },
  responder: {
    title: 'Duty Ready: First Responder Sprint', short: 'Responder', door: 'work',
    goal: 'Carry gear, drag, lift and respond without the back or knees breaking down.',
    outcome: 'Pain-free under load with better single-leg strength.',
    phases: P(
      { name: 'Reset', A: ['breath9090', 'birdDog', 'gluteBridge', 'bandRow'], B: ['openBook', 'deadBug', 'stepUp', 'walk'] },
      { name: 'Build', A: ['kbDeadlift', 'splitSquat', 'pallof', 'suitcaseCarry'], B: ['gobletSquat', 'slRDL', 'facePull', 'farmerCarry'] },
      { name: 'Load carriage', A: ['rdl', 'ruckStep', 'farmerCarry', 'copenhagen'], B: ['frontSquat', 'liftMechanics', 'suitcaseCarry', 'lateralBound'] }) },
  military: {
    title: 'Mission Ready: Active Duty Sprint', short: 'Active Duty', door: 'service',
    goal: 'Ruck, run and pass the fitness test without the profile.',
    outcome: 'Pain-free loaded movement and a stronger fitness test.',
    phases: P(
      { name: 'Reset', A: ['birdDog', 'gluteBridge', 'calfRaise', 'bandRow'], B: ['openBook', 'deadBug', 'stepUp', 'slBalance'] },
      { name: 'Build', A: ['kbDeadlift', 'splitSquat', 'pushup', 'suitcaseCarry'], B: ['slRDL', 'stepDown', 'facePull', 'pogo'] },
      { name: 'Ruck ready', A: ['rdl', 'ruckStep', 'farmerCarry', 'pushup'], B: ['rfess', 'slHop', 'copenhagen', 'aSkip'] }) },
  veteran: {
    title: 'Still Serving Your Body: Veteran Sprint', short: 'Veteran', door: 'service',
    goal: 'Old injuries, new strength. Move like you did before the miles caught up.',
    outcome: 'Less daily pain and a higher Body Score.',
    phases: P(
      { name: 'Calm it down', A: ['breath9090', 'catCamel', 'gluteBridge', 'quadSet', 'walk'], B: ['birdDog', 'chinTuck', 'spanishSquat', 'walk'] },
      { name: 'Build', A: ['boxSquat', 'hipHinge', 'bandRow', 'suitcaseCarry'], B: ['stepUp', 'deadBug', 'facePull', 'slBalance'] },
      { name: 'Strong', A: ['gobletSquat', 'kbDeadlift', 'farmerCarry', 'pushup'], B: ['splitSquat', 'pallof', 'landminePress', 'walkHills'] }) },
};

// Front doors. Every man enters through the problem he already has.
export const DOORS = [
  { id: 'pain', label: 'Something hurts', blurb: 'Back, knee, shoulder or neck', launch: true, options: [
    { id: 'back40', label: 'Low back', icon: 'back' }, { id: 'knee', label: 'Knee', icon: 'knee' },
    { id: 'shoulder', label: 'Shoulder', icon: 'shoulder' }, { id: 'neck', label: 'Neck', icon: 'neck' }] },
  { id: 'sport', label: 'I play', blurb: 'Golf, lifting, running, pickleball, hoops', launch: true, options: [
    { id: 'golf', label: 'Golf' }, { id: 'lifting', label: 'Lifting' }, { id: 'running', label: 'Running' },
    { id: 'pickleball', label: 'Pickleball' }, { id: 'basketball', label: 'Basketball' }] },
  { id: 'life', label: 'Where I am in life', blurb: '40+, dads, after surgery, private health', options: [
    { id: 'over40', label: '40 and up' }, { id: 'dad', label: 'Keeping up with my kids' },
    { id: 'postop', label: 'Coming back from surgery' }, { id: 'pelvic', label: 'Private (after prostate treatment)', quiet: true }] },
  { id: 'work', label: 'What I do for work', blurb: 'Trades, desk, drivers, first responders', options: [
    { id: 'trades', label: 'Trades / physical job' }, { id: 'desk', label: 'Desk job' },
    { id: 'trucker', label: 'Driver / trucker' }, { id: 'responder', label: 'First responder' }] },
  { id: 'service', label: 'I serve or served', blurb: 'Active duty and veterans', options: [
    { id: 'military', label: 'Active duty' }, { id: 'veteran', label: 'Veteran' }] },
];

// Screening questions that stop the program and route to a physician.
export const RED_FLAGS = [
  { id: 'bladder', q: 'New trouble controlling your bladder or bowels, or numbness in the groin or inner thighs?', urgent: true, skipFor: ['pelvic'] },
  { id: 'chest', q: 'Chest pain, chest pressure or shortness of breath with activity?', urgent: true },
  { id: 'weakness', q: 'A leg or arm getting weaker, or foot drop, that is getting worse?', urgent: true },
  { id: 'trauma', q: 'Did this start with a fall, car accident or hard impact in the last 6 weeks?' },
  { id: 'systemic', q: 'Unexplained weight loss, fever, or a history of cancer?' },
  { id: 'night', q: 'Severe pain at night that does not change no matter how you lie?' },
];

export const US_STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');

// PT-built content (custom exercises, custom programs, video links) is merged into
// the same tables at runtime, so every screen and the engine treat it like built-ins.
const BUILTIN_EX = new Set(Object.keys(EXERCISES));
const BUILTIN_SPRINTS = new Set(Object.keys(SPRINTS));
export const isBuiltinExercise = id => BUILTIN_EX.has(id);
export const isBuiltinProgram = id => BUILTIN_SPRINTS.has(id);

export function registerLibrary(lib) {
  if (!lib) return;
  Object.entries(lib.exercises || {}).forEach(([id, e]) => { if (!BUILTIN_EX.has(id)) EXERCISES[id] = { ...e, custom: true }; });
  Object.entries(lib.videos || {}).forEach(([id, url]) => { if (EXERCISES[id]) EXERCISES[id] = { ...EXERCISES[id], video: url || undefined }; });
  Object.entries(lib.programs || {}).forEach(([id, p]) => { if (!BUILTIN_SPRINTS.has(id)) SPRINTS[id] = { ...p, custom: true }; });
}

// A program item is an exercise id, or { id, sets, reps, secs, mins, note } for a PT prescription.
export const itemId = it => (typeof it === 'string' ? it : it.id);

export function exName(id, quiet) {
  const e = EXERCISES[id];
  if (!e) return id;
  return quiet && e.qname ? e.qname : e.name;
}

export function doseText(e, mod = {}) {
  const sets = (e.sets || 1) + (mod.sets || 0);
  const side = e.perSide ? ' / side' : '';
  if (e.mins) return `${e.mins + (mod.mins || 0)} min`;
  if (e.secs) return `${sets} x ${e.secs + (mod.secs || 0)} sec${side}`;
  return `${sets} x ${e.reps + (mod.reps || 0)}${side}`;
}
