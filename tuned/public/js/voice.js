// Voice in and out using the browser's built-in speech engines.
let muted = false;
try { muted = localStorage.getItem('tuned.pref.mute') === '1'; } catch (e) {}

export function setMuted(v) { muted = v; try { localStorage.setItem('tuned.pref.mute', v ? '1' : '0'); } catch (e) {} if (v) speechSynthesis?.cancel(); }
export function isMuted() { return muted; }

export function speak(text) {
  if (muted || !('speechSynthesis' in window) || !text) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02; u.pitch = 0.95;
    const v = speechSynthesis.getVoices().find(v => /en-US/.test(v.lang) && /male|daniel|alex|fred|aaron|guy/i.test(v.name)) || speechSynthesis.getVoices().find(v => /^en/.test(v.lang));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) {}
}

export const canListen = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);

// One-shot dictation. Resolves with the transcript.
export function listen({ onInterim } = {}) {
  return new Promise((resolve, reject) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return reject(new Error('Voice input is not supported in this browser. Try Chrome or Safari.'));
    const r = new SR();
    r.lang = 'en-US'; r.interimResults = true; r.maxAlternatives = 1;
    let final = '';
    r.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
      }
      onInterim?.(final + interim);
    };
    r.onerror = e => reject(new Error(e.error === 'not-allowed' ? 'Microphone permission was blocked.' : 'Did not catch that. Try again.'));
    r.onend = () => resolve(final.trim());
    r.start();
  });
}

// Pull structured check-in data out of free speech: "back's about a 4 today, slept bad".
export function parseCheckin(text) {
  const t = text.toLowerCase();
  const words = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  let pain = null;
  const m = t.match(/\b(10|[0-9])\b(?:\s*(?:out of|\/)\s*10)?/) || t.match(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  if (m) pain = isNaN(+m[1]) ? words[m[1]] : +m[1];
  if (pain == null && /no pain|pain[- ]free|feel(?:s|ing)? (?:great|good)/.test(t)) pain = 1;
  const sleep = /slept (bad|terrible|poor)|no sleep|didn.t sleep|rough night/.test(t) ? 'poor' : /slept (great|well|good)/.test(t) ? 'good' : null;
  const worse = /worse|flare|tweak|hurt more|sharp|shooting/.test(t);
  const better = /better|improv|loose|less pain/.test(t);
  return { pain, sleep, worse, better };
}
