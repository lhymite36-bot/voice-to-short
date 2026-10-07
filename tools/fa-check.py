# Caption-sync check against ground truth (same method as docs/caption-sync.md): wav2vec2 CTC forced alignment of the
# caption words to the voice, compared with the word times the renderer used (<video>.timeline.json from
# tests/live/comic-offline.js). Needs torch + torchaudio (box: /workspace/.venv-fw/bin/python).
# Usage: python tools/fa-check.py <voice.wav> <timeline.json> [lead=0.3]
import sys, json, re, subprocess, numpy as np, torch, torchaudio
wav, tlf = sys.argv[1], sys.argv[2]; lead = float(sys.argv[3]) if len(sys.argv) > 3 else 0.3
torch.set_num_threads(4)
bundle = torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H
model = bundle.get_model(); labels = bundle.get_labels(); d = {c: i for i, c in enumerate(labels)}
NUM = {'0':'ZERO','1':'ONE','2':'TWO','3':'THREE','4':'FOUR','5':'FIVE','6':'SIX','7':'SEVEN','8':'EIGHT','9':'NINE'}
tl = json.load(open(tlf))['timeline']
words = []; times = []; first = []; panel = []
for b in tl:
    ws = b['text'].strip().split()
    for k, w in enumerate(ws): words.append(w); times.append(b['wordTimes'][k]); first.append(k == 0); panel.append(b['panel'])
toks = []; spans = []
for w in words:
    s = re.sub(r'\d', lambda m: NUM[m.group()], w.upper()); s = re.sub(r"[^A-Z']", '', s) or 'A'
    spans.append(len(toks)); toks += [d[c] for c in s] + [d['|']]
raw = subprocess.run(['ffmpeg','-v','error','-i',wav,'-ac','1','-ar',str(bundle.sample_rate),'-f','f32le','-'],capture_output=True,check=True).stdout
x = torch.from_numpy(np.frombuffer(raw, np.float32).copy())[None]
em = []
with torch.inference_mode():
    CH = bundle.sample_rate * 20
    for o in range(0, x.shape[1], CH):
        e, _ = model(x[:, o:o+CH]); em.append(e)
    em = torch.log_softmax(torch.cat(em, 1), -1)
T = em.shape[1]; sec_per = x.shape[1] / bundle.sample_rate / T
ali, _ = torchaudio.functional.forced_align(em, torch.tensor([toks], dtype=torch.int32), blank=0)
ali = ali[0].tolist(); ti = 0; firstf = {}; prev = 0
for f, lab in enumerate(ali):
    if lab != 0 and (lab != prev or f == 0 or ali[f-1] == 0):
        if ti < len(toks) and lab == toks[ti]: firstf[ti] = f; ti += 1
        elif ti + 1 < len(toks) and lab == toks[ti+1]: firstf[ti+1] = f; ti += 2
    prev = lab
err = []; berr = []
for i, w in enumerate(words):
    f = firstf.get(spans[i])
    if f is None: continue
    e = times[i] - (f * sec_per + lead); err.append(e)
    if first[i]: berr.append(e)
if len(sys.argv) > 4:
    for i, w in enumerate(words):
        f = firstf.get(spans[i]); print(i, panel[i], w, round(times[i], 2), None if f is None else round(f * sec_per + lead, 2))
a = np.abs(np.array(err)); b = np.abs(np.array(berr))
print(json.dumps({'words': len(words), 'aligned': len(err), 'mean_ms': round(1000 * float(np.mean(err))), 'mean_abs_ms': round(1000 * float(a.mean())), 'median_abs_ms': round(1000 * float(np.median(a))), 'p90_abs_ms': round(1000 * float(np.percentile(a, 90))), 'worst_ms': round(1000 * float(a.max())), 'beat_starts_within_100ms': round(float((b < 0.1).mean()), 2), 'beat_start_median_abs_ms': round(1000 * float(np.median(b)))}))
