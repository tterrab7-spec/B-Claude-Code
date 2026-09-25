import sys, json, soundfile as sf
from kokoro_onnx import Kokoro
k = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")
text, out, voice = sys.argv[1], sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else "am_michael")
speed = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
samples, sr = k.create(text, voice=voice, speed=speed, lang="en-us")
sf.write(out, samples, sr)
print(json.dumps({"seconds": len(samples)/sr, "sr": sr}))
