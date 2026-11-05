#!/usr/bin/env python3
"""Assemble Decide showcase Short with A/B choice UI, rewind, captions."""
import json, subprocess, wave, math, os, sys, re
from pathlib import Path

ROOT = Path(os.environ.get('DECIDE_WORK', '/workspace/decide'))
AUDIO, SCENES, CLIPS, TXT, ASSETS = ROOT/'audio', ROOT/'scenes', ROOT/'clips', ROOT/'txt', ROOT/'assets'
OUT = ROOT/os.environ.get('DECIDE_OUT', 'decide-showcase.mp4')
script = json.loads((ROOT/'script.json').read_text())

for d in (CLIPS, TXT, ASSETS):
    d.mkdir(parents=True, exist_ok=True)
for p in list(CLIPS.iterdir()) + list(TXT.iterdir()):
    if p.is_file(): p.unlink()

W, H, FPS = 1080, 1920, 30
FONT = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
FONT_I = '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'
FONT_S = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
for cand, var in [
    ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'FONT'),
    ('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', 'FONT_I'),
]:
    if not Path(locals()[var] if False else cand).exists():
        pass
if not Path(FONT).exists(): FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
if sys.platform == 'win32' or not Path(FONT).exists():
    for cand in (r'C:\Windows\Fonts\arialbd.ttf', r'C:\Windows\Fonts\segoeuib.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'):
        if Path(cand).exists(): FONT = cand; break

def ffp(p):
    # path safe for ffmpeg filter option values (Windows drive colon + backslashes)
    return str(p).replace('\\', '/').replace(':', '\\:')

if not Path(FONT_I).exists(): FONT_I = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'

def run(cmd, check=True):
    print('+', ' '.join(str(c) for c in cmd[:8]), '...')
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if check and r.returncode != 0:
        print(r.stdout[-4000:]); raise SystemExit(f'fail rc={r.returncode}')
    return r

def wav_dur(path):
    with wave.open(str(path),'r') as w: return w.getnframes()/float(w.getframerate())

def write_txt(name, content):
    p = TXT/name; p.write_text(content, encoding='utf-8'); return p

SCENE_MAP = {
    'black_hook': None, 'black_rewind': None, 'black_question': None,
    'desk_monitor': 'desk_monitor', 'desk_radio': 'desk_radio', 'desk_choice': 'desk_choice',
    'corridor_walk': 'corridor_walk', 'foodcourt_empty': 'foodcourt_empty',
    'foodcourt_smile': 'foodcourt_smile', 'foodcourt_fail': 'foodcourt_fail',
    'desk_monitor_glitch': 'desk_monitor_glitch', 'desk_monitor_empty': 'desk_monitor_empty',
    'desk_stand': 'desk_stand', 'corridor_beam': 'corridor_beam',
    'staff_door': 'staff_door', 'breakroom_faces': 'breakroom_faces',
    'breakroom_close': 'breakroom_close', 'cliff_choice': 'cliff_choice',
}

KNOWN_SHOTS = [v for v in SCENE_MAP.values() if v]
KEYWORDS = [('glitch','desk_monitor_glitch'), ('empty','desk_monitor_empty'), ('radio','desk_radio'), ('monitor','desk_monitor'),
            ('camera','desk_monitor'), ('desk','desk_choice'), ('stand','desk_stand'), ('beam','corridor_beam'), ('flash','corridor_beam'),
            ('corridor','corridor_walk'), ('hall','corridor_walk'), ('walk','corridor_walk'), ('food','foodcourt_empty'), ('smile','foodcourt_smile'),
            ('fail','foodcourt_fail'), ('door','staff_door'), ('staff','staff_door'), ('exit','staff_door'), ('break','breakroom_faces'),
            ('face','breakroom_faces'), ('close','breakroom_close'), ('cliff','cliff_choice'), ('end','cliff_choice'), ('choice','desk_choice')]
_rot = [0]
def map_scene(name):
    n = str(name or 'black').lower()
    if n in SCENE_MAP: return SCENE_MAP[n]
    if n.startswith('black'): return None
    for k, v in KEYWORDS:
        if k in n: return v
    _rot[0] += 1
    return KNOWN_SHOTS[_rot[0] % len(KNOWN_SHOTS)]

def make_png(out, draws):
    run(['ffmpeg','-y','-f','lavfi','-i',f'color=c=black@0.0:s={W}x{H},format=rgba','-vf',','.join(draws),'-frames:v','1',str(out)])

def pill(y, key, label, color, dim=False):
    lp = write_txt(f'pill_{key}_{abs(hash(label))%99999}.txt', str(label).upper()[:28])
    a = '0.35' if dim else '0.92'
    return [f"drawbox=x=140:y={y}:w=800:h=110:color=black@{a}:t=fill",
            f"drawbox=x=140:y={y}:w=800:h=110:color={color}@0.95:t=5",
            f"drawbox=x=160:y={y+20}:w=70:h=70:color={color}@1.0:t=fill",
            f"drawtext=fontfile='{ffp(FONT)}':text='{key}':x=180:y={y+28}:fontsize=64:fontcolor={color}:borderw=4:bordercolor=black",
            f"drawtext=fontfile='{ffp(FONT)}':textfile='{ffp(lp)}':x=255:y={y+34}:fontsize=50:fontcolor=white@{'0.45' if dim else '1'}:borderw=4:bordercolor=black"]

def ensure_assets():
    ch_all = script.get('choices') or {}
    if isinstance(ch_all, list): script['choices'] = {str(c.get('id') or f'c{i+1}'): c for i, c in enumerate(ch_all)}
    # Generate choice pills / rewind / badge for custom scripts (showcase ships its own PNGs).
    for cid, ch in (script.get('choices') or {}).items():
        opts = {o.get('key'): o for o in ch.get('options', [])}
        A = opts.get('A', {'label': 'A', 'color': '#E23D28'}); B = opts.get('B', {'label': 'B', 'color': '#2ECC71'})
        ca = str(A.get('color') or '#E23D28').replace('#','0x'); cb = str(B.get('color') or '#2ECC71').replace('#','0x')
        p = ASSETS/f'choice_{cid}.png'
        if not p.exists(): make_png(p, pill(300,'A',A.get('label',''),ca) + pill(1500,'B',B.get('label',''),cb))
        for key in ('A','B'):
            q = ASSETS/f'choice_{cid}_{key}.png'
            if not q.exists(): make_png(q, pill(300,'A',A.get('label',''),ca, dim=key!='A') + pill(1500,'B',B.get('label',''),cb, dim=key!='B'))
    r = ASSETS/'rewind.png'
    if not r.exists():
        make_png(r, [f"drawtext=fontfile='{ffp(FONT)}':text='<< REWIND':x=(w-text_w)/2:y=h*0.45:fontsize=110:fontcolor=white:borderw=6:bordercolor=0xE23D28"])
    b = ASSETS/'series_badge.png'
    if not b.exists():
        t = write_txt('badge.txt', (str(script.get('series') or script.get('title') or 'DECIDE')).upper()[:30])
        make_png(b, [f"drawbox=x=0:y=120:w=iw:h=120:color=black@0.55:t=fill",
                     f"drawtext=fontfile='{ffp(FONT)}':textfile='{ffp(t)}':x=(w-text_w)/2:y=150:fontsize=60:fontcolor=white"])

UI_OVERLAY = {
    'choice': 'choice_c1.png',
    'choice_lock': None,  # resolved per choiceKey
    'rewind': 'rewind.png',
    'cliffhanger': 'choice_c2.png',
}

segments = []
t = 0.0
for line in script['lines']:
    wav = AUDIO/f"{line['id']}.wav"
    if not wav.exists():
        raise SystemExit(f'missing audio {wav}')
    vd = wav_dur(wav)
    pad = 0.55 if line.get('ui') in ('choice','cliffhanger','rewind') else 0.4
    if str(line['scene']).startswith('black'): pad = 0.5
    pre_black = 0.0
    if line.get('ui') == 'rewind':
        pre_black = 0.15
    dur = max(vd + pad, float(line.get('dur') or 0))
    if line.get('ui') in ('choice','cliffhanger'):
        dur = max(dur, 4.0)  # hold pills readable
    segments.append({**line, 'wav':str(wav), 'voice_dur':vd, 'dur':dur,
                     'start': t+pre_black, 'pre_black':pre_black,
                     'scene_dir': map_scene(line['scene'])})
    t += pre_black + dur
total = t
print('TOTAL_DUR', round(total,2), 'segments', len(segments))

def caption_filters(seg):
    filters = []
    # series badge on early scenes
    if seg['id'] in ('hook','s1'):
        badge = ASSETS/'series_badge.png'
        if badge.exists():
            # overlay handled separately via multi-input; skip here
            pass
    cap = seg.get('caption') or ''
    # Split highlight words for colored second line if present
    highlights = seg.get('highlight') or []
    # Main caption - big center
    y = 'h*0.62' if seg.get('ui') in ('choice','cliffhanger') else 'h*0.70'
    if seg.get('ui') == 'rewind':
        # rewind overlay carries text
        return filters
    cap_path = write_txt(f'{seg["id"]}_cap.txt', cap)
    alpha = f"if(lt(t\\,0.2)\\,t/0.2\\,if(gt(t\\,{seg['dur']}-0.3)\\,({seg['dur']}-t)/0.3\\,1))"
    # Word-sized font
    fs = 56 if len(cap) < 28 else (48 if len(cap) < 42 else 40)
    filters.append(
        f"drawtext=fontfile='{ffp(FONT)}':textfile='{ffp(cap_path)}':x=(w-text_w)/2:y={y}:fontsize={fs}:"
        f"fontcolor=white:borderw=3:bordercolor=black@0.75:alpha='{alpha}'"
    )
    if highlights:
        # accent line under caption — highlight phrase in teal/red for horror
        hi = ' '.join(highlights)
        color = '0xFF4D4D' if seg.get('ui') in ('choice_lock',) and seg.get('choiceKey')=='A' else '0x2ECC71'
        if 'die' in hi.lower() or 'SEE YOU' in hi or 'dies' in hi.lower() or "weren't" in hi.lower():
            color = '0xFF3B3B'
        hi_path = write_txt(f'{seg["id"]}_hi.txt', hi)
        alpha2 = f"if(lt(t\\,0.35)\\,0\\,if(lt(t\\,0.6)\\,(t-0.35)/0.25\\,if(gt(t\\,{seg['dur']}-0.3)\\,({seg['dur']}-t)/0.3\\,1)))"
        filters.append(
            f"drawtext=fontfile='{ffp(FONT)}':textfile='{ffp(hi_path)}':x=(w-text_w)/2:y={y}+62:fontsize=40:"
            f"fontcolor={color}:borderw=2:bordercolor=black@0.7:alpha='{alpha2}'"
        )
    return filters

def resolve_ui_png(seg):
    ui = seg.get('ui')
    if not ui: return None
    if ui == 'choice_lock':
        key = seg.get('choiceKey') or 'A'
        cid = seg.get('choiceId') or 'c1'
        p = ASSETS/f'choice_{cid}_{key}.png'
        if p.exists(): return p
        return ASSETS/f'choice_{cid}.png'
    name = UI_OVERLAY.get(ui)
    if name:
        p = ASSETS/name
        return p if p.exists() else None
    return None

ensure_assets()
clip_list = []
for i, seg in enumerate(segments):
    if seg['pre_black'] > 0:
        bp = CLIPS/f'{i:02d}_black.mp4'
        run(['ffmpeg','-y','-f','lavfi','-i',f'color=c=black:s={W}x{H}:r={FPS}',
             '-t', f"{seg['pre_black']:.3f}", '-c:v','libx264','-pix_fmt','yuv420p',
             '-preset','veryfast','-crf','17', str(bp)])
        clip_list.append(bp)

    outp = CLIPS/f"{i:02d}_{seg['id']}.mp4"
    overlays = caption_filters(seg)
    ui_png = resolve_ui_png(seg)
    badge = ASSETS/'series_badge.png' if seg['id'] in ('hook','s1') and (ASSETS/'series_badge.png').exists() else None

    # Build base video
    base = CLIPS/f'{i:02d}_{seg["id"]}_base.mp4'
    if seg['scene_dir'] is None:
        run(['ffmpeg','-y','-f','lavfi','-i',f'color=c=black:s={W}x{H}:r={FPS}',
             '-t', f"{seg['dur']:.3f}", '-c:v','libx264','-pix_fmt','yuv420p',
             '-preset','veryfast','-crf','17', str(base)])
    else:
        seq = SCENES/seg['scene_dir']
        frames = sorted(seq.glob('f*.png'))
        if not frames:
            print('WARN missing scene', seg['scene_dir'], '→ black')
            run(['ffmpeg','-y','-f','lavfi','-i',f'color=c=#0a0a10:s={W}x{H}:r={FPS}',
                 '-t', f"{seg['dur']:.3f}", '-c:v','libx264','-pix_fmt','yuv420p',
                 '-preset','veryfast','-crf','17', str(base)])
        else:
            n = len(frames)
            anim = CLIPS/f'{i:02d}_{seg["id"]}_anim.mp4'
            in_fps = max(3.0, n / 2.4)
            run(['ffmpeg','-y','-framerate', f'{in_fps:.4f}', '-i', str(seq/'f%04d.png'),
                 '-vf', f'scale={W}:{H}:flags=lanczos,fps={FPS}',
                 '-c:v','libx264','-pix_fmt','yuv420p','-preset','veryfast','-crf','17', str(anim)])
            pad = max(0.0, seg['dur'] - 2.4)
            vf = (
                f"tpad=stop_mode=clone:stop_duration={pad:.3f},"
                f"trim=duration={seg['dur']:.3f},setpts=PTS-STARTPTS,"
                f"scale={W}:{H},"
                f"zoompan=z='min(1.06\\,1+0.00035*on)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{H}:fps={FPS}"
            )
            # slight vignette
            vf += ",vignette=PI/4"
            run(['ffmpeg','-y','-i', str(anim), '-t', f"{seg['dur']:.3f}", '-vf', vf,
                 '-c:v','libx264','-pix_fmt','yuv420p','-preset','veryfast','-crf','17',
                 '-r', str(FPS), str(base)])

    # Composite UI overlays + captions
    inputs = ['-i', str(base)]
    fc = []
    vlabel = '[0:v]'
    idx = 1
    if badge:
        inputs += ['-i', str(badge)]
        fc.append(f'[{idx}:v]scale={W}:{H}[b]'); idx += 1
        fc.append(f'{vlabel}[b]overlay=0:0:format=auto[v1]')
        vlabel = '[v1]'
    if ui_png:
        inputs += ['-i', str(ui_png)]
        fc.append(f'[{idx}:v]scale={W}:{H}[u]'); idx += 1
        # fade UI in
        fc.append(f'{vlabel}[u]overlay=0:0:format=auto:enable=\'gte(t,0.15)\'[v2]')
        vlabel = '[v2]'
    # apply drawtext chain
    if overlays:
        # strip labels from vlabel for filter chain
        chain_in = vlabel.strip('[]') if vlabel.startswith('[') else '0:v'
        # Actually use labeled chain
        cur = vlabel
        for j, filt in enumerate(overlays):
            outl = f'[t{j}]'
            # filt is drawtext=... without input prefix
            fc.append(f'{cur}{filt}{outl}')
            cur = outl
        vlabel = cur
    if fc:
        # map final
        fc_str = ';'.join(fc)
        run(['ffmpeg','-y', *inputs, '-filter_complex', fc_str, '-map', vlabel,
             '-t', f"{seg['dur']:.3f}", '-c:v','libx264','-pix_fmt','yuv420p',
             '-preset','veryfast','-crf','17', '-r', str(FPS), str(outp)])
    else:
        run(['ffmpeg','-y','-i', str(base), '-t', f"{seg['dur']:.3f}",
             '-c:v','libx264','-pix_fmt','yuv420p','-preset','veryfast','-crf','17', str(outp)])

    d = float(subprocess.check_output(['ffprobe','-v','quiet','-show_entries','format=duration','-of','csv=p=0',str(outp)], text=True).strip() or 0)
    print('CLIP', outp.name, 'want', round(seg['dur'],2), 'got', round(d,2), 'ui', seg.get('ui'))
    clip_list.append(outp)

concat_txt = CLIPS/'concat.txt'
concat_txt.write_text(''.join(f"file '{str(c).replace(chr(92), '/')}'\n" for c in clip_list))
video_raw = CLIPS/'video_raw.mp4'
run(['ffmpeg','-y','-f','concat','-safe','0','-i', str(concat_txt),
     '-c:v','libx264','-pix_fmt','yuv420p','-preset','fast','-crf','17','-r',str(FPS), str(video_raw)])
vd = float(subprocess.check_output(['ffprobe','-v','quiet','-show_entries','format=duration','-of','csv=p=0',str(video_raw)], text=True))
print('VIDEO_RAW', vd)

# Audio mix
filter_parts = []
cmd = ['ffmpeg','-y','-i', str(AUDIO/'drone.wav')]
idx = 1
voice_labels=[]
for i, seg in enumerate(segments):
    cmd += ['-i', seg['wav']]
    delay_ms = int(round(seg['start']*1000))
    lab=f'v{i}'
    vol = 1.25 if seg['speaker']=='narrator' else 1.35
    filter_parts.append(f'[{idx}]adelay={delay_ms}|{delay_ms},volume={vol}[{lab}]')
    voice_labels.append(f'[{lab}]'); idx += 1

def find_seg(sid):
    for s in segments:
        if s['id']==sid: return s
    return None

sfx_map = []
def add_sfx(name, start, vol):
    sfx_map.append((name, start, vol))

if find_seg('s1'): add_sfx('sfx_static.wav', find_seg('s1')['start']+0.3, 0.45)
if find_seg('s3'): add_sfx('sfx_chime.wav', find_seg('s3')['start']+0.2, 0.55)
if find_seg('a1'): add_sfx('sfx_steps.wav', find_seg('a1')['start']+0.3, 0.7)
if find_seg('a2'): add_sfx('sfx_tray.wav', find_seg('a2')['start']+1.5, 0.75)
if find_seg('a4'): add_sfx('sfx_heart.wav', find_seg('a4')['start'], 0.6)
if find_seg('rw'): add_sfx('sfx_rewind.wav', find_seg('rw')['start'], 0.9)
if find_seg('b2'): add_sfx('sfx_glitch.wav', find_seg('b2')['start']+0.2, 0.7)
if find_seg('b3'): add_sfx('sfx_glitch.wav', find_seg('b3')['start']+0.5, 0.55)
if find_seg('b5'): add_sfx('sfx_steps.wav', find_seg('b5')['start']+0.2, 0.65)
if find_seg('b6'):
    add_sfx('sfx_creak.wav', find_seg('b6')['start']+0.3, 0.7)
    add_sfx('sfx_led.wav', find_seg('b6')['start']+2.0, 0.8)
if find_seg('b7'): add_sfx('sfx_heart.wav', find_seg('b7')['start'], 0.5)
if find_seg('endq'): add_sfx('sfx_chime.wav', find_seg('endq')['start']+0.15, 0.6)

sfx_labels=[]
for j,(name,start,vol) in enumerate(sfx_map):
    p = AUDIO/name
    if not p.exists(): continue
    cmd += ['-i', str(p)]
    delay_ms=int(round(start*1000)); lab=f's{j}'
    filter_parts.append(f'[{idx}]adelay={delay_ms}|{delay_ms},volume={vol}[{lab}]')
    sfx_labels.append(f'[{lab}]'); idx += 1

filter_parts.insert(0, f'[0]volume=0.18,atrim=0:{total:.3f},asetpts=PTS-STARTPTS[d]')
all_in=['[d]']+voice_labels+sfx_labels
filter_parts.append(''.join(all_in)+f'amix=inputs={len(all_in)}:duration=longest:dropout_transition=0:normalize=0[mix]')
filter_parts.append('[mix]dynaudnorm=f=75:g=15,alimiter=limit=0.95[aout]')
audio_out = CLIPS/'mix.wav'
cmd += ['-filter_complex', ';'.join(filter_parts), '-map','[aout]','-t',f'{total:.3f}', str(audio_out)]
run(cmd)

run(['ffmpeg','-y','-i', str(video_raw), '-i', str(audio_out),
     '-c:v','libx264','-pix_fmt','yuv420p','-profile:v','high','-level','4.1',
     '-preset','medium','-crf','17','-r',str(FPS),
     '-c:a','aac','-b:a','192k','-ar','44100','-ac','2',
     '-movflags','+faststart',
     '-t', f'{min(total, vd):.3f}',
     str(OUT)])
print('OUT', OUT, 'bytes', OUT.stat().st_size)

# stills
STILLS = ROOT/'stills'
STILLS.mkdir(exist_ok=True)
for tsec, name in [(2,'01-hook'), (12,'02-choice'), (28,'03-branchA'), (40,'04-rewind'),
                   (55,'05-glitch'), (75,'06-staff'), (95,'07-cliff')]:
    if tsec < total:
        run(['ffmpeg','-y','-ss',str(tsec),'-i',str(OUT),'-frames:v','1', str(STILLS/f'{name}.jpg')], check=False)
print('STILLS_DONE')
