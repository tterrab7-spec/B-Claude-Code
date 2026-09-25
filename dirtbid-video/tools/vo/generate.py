"""Generate every voiceover line with Kokoro and write durations to public/audio/vo/manifest.json."""
import json, os, sys, numpy as np, soundfile as sf
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tts'))
from kokoro_onnx import Kokoro
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.abspath(os.path.join(here, '..', '..'))
script = json.load(open(os.path.join(here, 'script.json')))
k = Kokoro(os.path.join(root, 'tools/tts/kokoro-v1.0.onnx'), os.path.join(root, 'tools/tts/voices-v1.0.bin'))
out_dir = os.path.join(root, 'public/audio/vo')
os.makedirs(out_dir, exist_ok=True)
manifest = []
for line in script['lines']:
    voice = line.get('voice', script['voice'])
    speed = line.get('speed', script['speed'])
    samples, sr = k.create(line['text'], voice=voice, speed=speed, lang='en-us')
    # trim leading/trailing silence below -45 dBFS, keep 60 ms pad
    thr = 10 ** (-45 / 20)
    idx = np.where(np.abs(samples) > thr)[0]
    if len(idx):
        a = max(0, idx[0] - int(0.06 * sr)); b = min(len(samples), idx[-1] + int(0.08 * sr))
        samples = samples[a:b]
    # peak normalize to -3 dBFS
    peak = np.max(np.abs(samples)) or 1.0
    samples = samples / peak * (10 ** (-3 / 20))
    path = os.path.join(out_dir, f"{line['id']}.wav")
    sf.write(path, samples, sr)
    d = len(samples) / sr
    manifest.append({**line, 'file': f"audio/vo/{line['id']}.wav", 'seconds': round(d, 3)})
    print(f"{line['id']} {d:5.2f}s  {line['text']}")
json.dump(manifest, open(os.path.join(out_dir, 'manifest.json'), 'w'), indent=2)
print('total', round(sum(m['seconds'] for m in manifest), 2), 's')
