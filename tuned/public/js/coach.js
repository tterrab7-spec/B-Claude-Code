// AI coach between visits. Uses Claude through the TUNED server when available;
// falls back to the built-in clinical rules coach when offline.
import { get } from './store.js';
import { SPRINTS, EXERCISES, exName, doseText } from './data.js';
import { sessionPlan, dropoutRisk, streak } from './engine.js';
import { api, health } from './api.js';
import { parseCheckin } from './voice.js';

const URGENT = /(numb|tingl).*(groin|saddle|inner thigh)|lost control of (my )?(bladder|bowel)|can.?t (pee|urinate)|chest (pain|pressure|tight)|short(ness)? of breath|passed out|faint|slurred|face droop/i;

export function context() {
  const s = get(), p = s.profile, sp = s.sprint;
  const def = sp ? SPRINTS[sp.id] : null;
  const plan = sp ? sessionPlan(sp) : null;
  const last = s.scores[s.scores.length - 1], first = s.scores[0];
  return {
    name: p?.name, age: p?.age, door: p?.door, program: def?.title, goal: def?.goal, quiet: s.quiet,
    painBaseline: p?.painBaseline,
    sessionsDone: sp?.sessions.length || 0, week: plan?.week, phase: plan?.phase,
    today: plan?.items.map(i => `${exName(i.id, s.quiet)} (${doseText(i.ex, i.mod)})`),
    recentLogs: sp?.sessions.slice(-5).map(x => ({ at: x.at.slice(0, 10), pain: x.pain, effort: x.effort, note: x.note })),
    recentChanges: sp?.changes.slice(-5).map(c => `${c.type}: ${exName(c.from, s.quiet)} -> ${exName(c.to, s.quiet)}`),
    bodyScore: last?.total, bodyScoreStart: first?.total, streakWeeks: streak(sp), risk: dropoutRisk(sp),
  };
}

export async function ask(text) {
  if (URGENT.test(text)) return urgent();
  const h = await health();
  if (h && h.coach) {
    try {
      const s = get();
      const history = s.coach.slice(-12).map(m => ({ role: m.role === 'me' ? 'user' : 'assistant', content: m.text }));
      const r = await api.post('coach', { userId: s.id, context: context(), history, message: text });
      if (r.text) return { text: r.text, actions: localActions(text), source: 'ai' };
    } catch (e) { /* fall through to rules */ }
  }
  return { ...rules(text), source: 'rules' };
}

function urgent() {
  return {
    text: 'Stop here. What you described needs a medical professional today, not an exercise program. If it came on suddenly or is severe, call 911 or go to the ER now. I have flagged this for your PT.',
    actions: [{ label: 'Call 911', href: 'tel:911' }], flag: 'urgent', source: 'rules',
  };
}

function localActions(text) {
  const c = parseCheckin(text);
  const out = [];
  if (c.pain != null && c.pain >= 6) out.push({ label: 'Make today easier', do: 'regress' });
  if (/visit|talk to|my pt|therapist|appointment/i.test(text)) out.push({ label: 'Request a video visit', do: 'visit' });
  return out;
}

const SWAPS = {
  band: 'No band? Use a towel for rows and pull-aparts (pull it tight against a door frame), or a backpack for loaded moves.',
  weight: 'No weights? Fill a backpack with books or use a gallon jug. Heavy carries work with grocery bags.',
  bench: 'No bench? A couch, chair or stairs work for split squats and step-ups.',
  floor: 'Can\'t get on the floor? Do bridges and dead bugs on the bed. We will build the floor-to-stand later.',
};

const WHY = {
  back: 'trains your trunk to hold position so the discs and joints stop taking the load your muscles should be taking',
  core: 'builds the bracing that protects your spine when you lift, carry or twist',
  hip: 'gets your hips doing their share so your back and knees stop picking up the slack',
  knee: 'loads the quad and tendon in a controlled way. Tendons get stronger when you load them, not when you rest them',
  ankle: 'builds the spring and stiffness you need for running, jumping and stairs',
  shoulder: 'strengthens the small stabilizers that keep the ball centered in the socket',
  neck: 'wakes up the deep neck muscles that hold your head up so the upper traps can stop clenching',
  thoracic: 'restores rotation in your upper back, which takes stress off your neck and low back',
  pelvic: 'retrains the muscles that control the bladder. Consistency matters more than intensity here',
  elbow: 'remodels the tendon. Slow lowering is the proven way to fix tennis and pickleball elbow',
  general: 'builds capacity. More capacity means fewer flare-ups',
};

function rules(text) {
  const s = get(), q = s.quiet;
  const t = text.toLowerCase();
  const sp = s.sprint, plan = sp ? sessionPlan(sp) : null;
  const c = parseCheckin(text);
  const name = s.profile?.name ? s.profile.name.split(' ')[0] : 'man';

  if (c.pain != null && /\b(pain|hurt|sore|ache|back|knee|shoulder|neck|feel|today|at a|it's|its|about)\b/.test(t) || /^\s*(10|[0-9])\s*$/.test(t)) {
    const base = s.profile?.painBaseline ?? 5;
    if (c.pain >= 7 || c.pain >= base + 2) return { text: `${c.pain}/10 is a flare, not a failure. Flares are part of the curve. Today: keep moving but drop the intensity. I can swap today's session to the easier versions right now. Walk 10 minutes, heat if it helps, and tell me tomorrow how it settled. If it is not trending down in 48 hours, your PT will check in.`, actions: [{ label: 'Make today easier', do: 'regress' }, { label: 'Request a video visit', do: 'visit' }] };
    if (c.pain <= 2) return { text: `${c.pain}/10. That is what we are building toward. ${c.sleep === 'poor' ? 'Rough sleep though, so keep the effort honest today.' : 'If today\'s session feels easy, log it as easy. Two easy sessions in a row and I will push you to the next level.'}`, actions: [{ label: 'Start today\'s session', do: 'session' }] };
    return { text: `Logged ${c.pain}/10${c.sleep === 'poor' ? ' on bad sleep' : ''}. Pain up to 5 during the session is acceptable as long as it settles back to where it started by the next morning. That is the rule we run on. ${plan ? `Today is ${plan.items.length} moves, about 25 minutes.` : ''}`, actions: [{ label: 'Start today\'s session', do: 'session' }] };
  }
  for (const k of Object.keys(SWAPS)) if (t.includes(k) && /(no|don.?t have|without|can.?t)/.test(t)) return { text: SWAPS[k] };
  if (/swap|replace|alternative|instead|substitute|can.?t do/.test(t) && plan) {
    const hit = plan.items.find(i => t.includes(exName(i.id, q).toLowerCase().split(' ')[0].toLowerCase()) || t.includes(i.ex.name.toLowerCase()));
    const target = hit || plan.items[0];
    const alt = target.ex.reg || Object.keys(EXERCISES).find(k => k !== target.id && EXERCISES[k].region === target.ex.region);
    return { text: `Swap ${exName(target.id, q)} for ${exName(alt, q)}: ${EXERCISES[alt].cues[0]}. Same goal, different path. Your PT will see the swap.` };
  }
  if (/why|what.*for|point of|does this/.test(t) && plan) {
    const hit = plan.items.find(i => t.includes(i.ex.name.toLowerCase().split(' ')[0].toLowerCase())) || plan.items[0];
    return { text: `${exName(hit.id, q)} ${WHY[hit.ex.region] || WHY.general}. Key cue: ${hit.ex.cues[hit.ex.cues.length - 1]}.` };
  }
  if (/tired|no time|busy|skip|don.?t feel like|travel/.test(t)) return { text: `Then we do the minimum. 10 minutes: the first two moves of today's session, then a 5-minute walk. Minimums keep the streak alive and the streak is what changes your body. Showing up beats a perfect session.`, actions: [{ label: 'Start the 10-minute version', do: 'session' }] };
  if (/score|number/.test(t)) {
    const a = s.scores[0]?.total, b = s.scores[s.scores.length - 1]?.total;
    return { text: a ? `Your Body Score is ${b}${b !== a ? `, ${b > a ? 'up' : 'down'} ${Math.abs(b - a)} from your first screen at ${a}` : ''}. It blends mobility, stability, control and symmetry. Re-screen at the end of week 2 and week 6, that is where you will see the jump.` : 'You have not taken a Body Score yet. It takes 5 minutes with your phone camera. Do it first, it sets the baseline everything else is measured against.', actions: a ? [] : [{ label: 'Take my Body Score', do: 'score' }] };
  }
  if (/today|next|what.*do|workout|session/.test(t) && plan) return { text: `Week ${plan.week}, ${plan.phase}. Today:\n${plan.items.map(i => `- ${exName(i.id, q)}: ${doseText(i.ex, i.mod)}`).join('\n')}`, actions: [{ label: 'Start session', do: 'session' }] };
  if (/visit|talk to|pt|therapist|appointment|human/.test(t)) return { text: 'You can book a video visit with your licensed PT. They see all your logs, scores and everything I have adjusted.', actions: [{ label: 'Request a video visit', do: 'visit' }] };
  const risk = dropoutRisk(sp);
  if (risk.level === 'high') return { text: `${name}, ${risk.reason.toLowerCase()}. This is exactly where most guys fall off. Not you. Do the 10-minute version today and you are back on track.`, actions: [{ label: 'Start the 10-minute version', do: 'session' }] };
  return { text: `Give me a pain number from 0 to 10 and how you slept, and I will tune today's session around it. You can also ask me why we are doing a move, ask for a swap, or tell me you are short on time.` };
}
