import json, sys, subprocess, wave, os, math
import numpy as np
name = sys.argv[1]; secs = json.load(open('/tmp/long/%s.json' % name))
os.makedirs('/tmp/long/%s' % name, exist_ok=True)
pcm = []; spans = []; t = 0.0; sr = 22050
for i, s in enumerate(secs):
    f = '/tmp/long/%s/sec%03d.wav' % (name, i)
    if not os.path.exists(f):
        subprocess.run(['/tmp/piperenv/bin/piper', '-m', '/tmp/piper/en_US-lessac-medium.onnx', '-f', f, '--length-scale', '1.08', '--sentence-silence', '0.3'], input=' '.join(s['lines']).encode(), check=True, capture_output=True)
    w = wave.open(f); sr = w.getframerate(); a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    a = np.concatenate([a, np.zeros(int(sr * 0.35), np.float32)])
    spans.append([t, t + len(a) / sr]); t += len(a) / sr; pcm.append(a)
full = np.concatenate(pcm); dur = len(full) / sr
probes = [1.5] + [x for x in np.arange(60, dur - 5, 60)] + [dur - 2.0]
for p in probes:
    n = int(0.1 * sr); tt = np.arange(n) / sr; tone = 0.55 * np.sin(2 * math.pi * 2600 * tt) * np.minimum(1, np.minimum(tt, 0.1 - tt) / 0.005)
    i0 = int(p * sr); full[i0:i0 + n] = full[i0:i0 + n] * 0.3 + tone
# write per-section wavs with probes mixed
for i, (a, b) in enumerate(spans):
    seg = full[int(round(a * sr)):int(round(b * sr))]
    w = wave.open('/tmp/long/%s/mix%03d.wav' % (name, i), 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(seg, -1, 1) * 32767).astype(np.int16).tobytes()); w.close()
json.dump({'sr': sr, 'duration': dur, 'spans': spans, 'probes': [float(p) for p in probes], 'n': len(spans)}, open('/tmp/long/%s-meta.json' % name, 'w'))
print(name, 'duration %.1f s' % dur, 'sections', len(spans), 'probes', len(probes))
