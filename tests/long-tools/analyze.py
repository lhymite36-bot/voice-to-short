import json, subprocess, sys, numpy as np
f = sys.argv[1]; meta = json.load(open(f + '.json'))
def run(cmd): return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
info = json.loads(run(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', f]))
fmt_dur = float(info['format']['duration'])
streams = [(s['codec_type'], s['codec_name'], s.get('width'), s.get('height')) for s in info['streams']]
# packets
pk = json.loads(run(['ffprobe', '-v', 'error', '-show_entries', 'packet=stream_index,pts_time,duration_time', '-of', 'json', f]))['packets']
vi = [s['index'] for s in info['streams'] if s['codec_type'] == 'video'][0]; ai = [s['index'] for s in info['streams'] if s['codec_type'] == 'audio'][0]
vp = np.array(sorted(float(p['pts_time']) for p in pk if p['stream_index'] == vi)); ap = np.array(sorted(float(p['pts_time']) for p in pk if p['stream_index'] == ai))
vg = np.diff(vp); ag = np.diff(ap)
adur = float(np.median(ag))  # Opus packet length (Chrome uses 60 ms)
ag_excess = ag - adur
joins = [o / 1000 for o in meta['offsets'][1:]] if meta.get('offsets') else []
def near(arr, gaps, t, w=1.0):
    idx = np.where((arr[:-1] > t - w) & (arr[:-1] < t + w))[0]; return float(gaps[idx].max()) if len(idx) else None
# audio beeps: 2600 Hz narrowband energy
sr = 8000
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-map', '0:a', '-af', 'bandpass=f=2600:width_type=h:w=120,bandpass=f=2600:width_type=h:w=120', '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'], capture_output=True, check=True).stdout
a = np.frombuffer(raw, np.int16).astype(np.float32) / 32768; win = int(sr * 0.005)
env = np.sqrt(np.convolve(a * a, np.ones(win) / win, mode='same')); thr = env.max() * 0.35
on = np.where((env[1:] > thr) & (env[:-1] <= thr))[0] / sr
beeps = []
for t in on:
    if not beeps or t - beeps[-1] > 0.5: beeps.append(float(t))
# video flashes: top-left square brightness per frame
out = run(['ffprobe', '-v', 'error', '-f', 'lavfi', '-i', 'movie=%s,crop=16:16:4:4,signalstats' % f, '-show_entries', 'frame=pts_time:frame_tags=lavfi.signalstats.YAVG', '-of', 'csv=p=0'])
fr = []
for line in out.strip().split('\n'):
    parts = line.split(',')
    if len(parts) >= 2 and parts[0] and parts[1]: fr.append((float(parts[0]), float(parts[1])))
flashes = []; prevb = False
for t, y in fr:
    b = y > 128
    if b and not prevb: flashes.append(t)
    prevb = b
probes = meta['probe']
rows = []
for p in probes:
    ab = min(beeps, key=lambda x: abs(x - p)) if beeps else None; vf = min(flashes, key=lambda x: abs(x - p)) if flashes else None
    rows.append({'expected': round(p, 3), 'audio': round(ab, 3) if ab is not None else None, 'video': round(vf, 3) if vf is not None else None, 'av_offset_ms': round((ab - vf) * 1000, 1) if ab is not None and vf is not None else None})
res = {'file': f, 'format_duration': fmt_dur, 'expected_duration': meta['plan']['total'], 'streams': streams,
  'video_packets': len(vp), 'fps_avg': round(len(vp) / fmt_dur, 2), 'video_max_gap_ms': round(float(vg.max()) * 1000, 1), 'video_gaps_over_50ms': int((vg > 0.05).sum()),
  'audio_packet_ms': round(adur * 1000, 1), 'audio_max_gap_beyond_packet_ms': round(float(ag_excess.max()) * 1000, 1), 'audio_last_pts': float(ap[-1]), 'video_last_pts': float(vp[-1]),
  'joins_s': joins, 'join_video_gap_ms': [round((near(vp, vg, j) or 0) * 1000, 1) for j in joins], 'join_audio_gap_beyond_packet_ms': [round((near(ap, ag_excess, j) or 0) * 1000, 1) for j in joins],
  'beeps_found': len(beeps), 'flashes_found': len(flashes), 'probes': rows,
  'max_abs_av_offset_ms': max(abs(r['av_offset_ms']) for r in rows if r['av_offset_ms'] is not None), 'max_abs_audio_vs_expected_ms': max(abs(r['audio'] - r['expected']) * 1000 for r in rows if r['audio'] is not None)}
json.dump(res, open(f + '.analysis.json', 'w'), indent=1)
print(json.dumps({k: v for k, v in res.items() if k != 'probes'}, indent=0)); print('probes:', json.dumps(rows))
