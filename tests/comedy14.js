// v1.4 offline tests (headless Chrome, no network, no API key): funny formats, schema size, normalize, director
// (pattern interrupts, stickers, sound cues), audio synth/music/mix levels, idea bank, cover export, dialogue TTS chunking.
// Usage: node tests/comedy14.js
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const results = []; const ok = (name, cond, extra) => { results.push(cond); console.log(cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : typeof extra === 'string' ? extra : JSON.stringify(extra)); };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname); const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  const types = { '.js': 'text/javascript', '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png', '.ogg': 'audio/ogg', '.json': 'application/json' };
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
(async () => {
  await new Promise((r) => srv.listen(0, r)); const port = srv.address().port;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text() + ' ' + JSON.stringify(m.location())); }); page.on('requestfailed', (q) => errors.push('reqfail ' + q.url())); page.on('response', (q) => { if (q.status() >= 400) errors.push('HTTP ' + q.status() + ' ' + q.url()); });
  await page.goto('http://127.0.0.1:' + port + '/tests/frames14.html');
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'brain-vs-me.json'), 'utf8'));
  const r = await page.evaluate(async (fx) => {
    const out = {}; const S = window.VTS.shortgen; const R = window.VTS.render; const A = window.VTS.audiofx; const C = window.VTS.comedy; const I = window.VTS.ideas; const G = window.VTS.gemini;
    // tones / formats / prompts
    out.tones = Object.keys(S.TONES); out.formats = Object.keys(S.FORMATS);
    const pr = S.buildPrompt('why I overthink texts', { tone: 'sarcastic', format: 'brain-vs-me', humour: 3, length: '60' });
    out.promptOk = /Brain vs Me/i.test(pr) && /120/.test(pr) && S.isComedy({ tone: 'sarcastic', length: '60' }) && !S.isComedy({ tone: 'calm', format: 'classic', humour: 0, length: '60' }) && !S.isComedy({ tone: 'sarcastic', length: '600' });
    out.pov30 = /POV/.test(S.buildPrompt('texting anxiety', { tone: 'genz', format: 'pov', humour: 2, length: '30' })) && /70/.test(S.buildPrompt('x y z', { tone: 'genz', format: 'pov', length: '30' }));
    out.calmPlain = !/COMEDY|humour/i.test(S.buildPrompt('a b c', { tone: 'calm', format: 'classic', humour: 0, length: '60' }).slice(0, 400));
    out.len30 = S.lengthOf('30').sec === 30 && S.lengthOf('bogus').id === '60';
    // schema: small, no giant enums
    const sch = JSON.stringify(S.schemaWithScenes()); let maxEnum = 0;
    const enums = []; (function walk(o, k) { if (!o || typeof o !== 'object') return; if (Array.isArray(o.enum)) enums.push([k, o.enum.length]); Object.entries(o).forEach(([kk, v]) => walk(v, kk)); }(S.schemaWithScenes(), ''));
    const bi = S.schemaWithScenes().properties.beats.items.properties; maxEnum = Math.max(...['speaker', 'fx', 'sfx'].map((k) => (bi[k].enum || []).length)); out.enums = enums;
    const bp = S.schemaWithScenes().properties.beats.items.properties;
    out.schema = { chars: sch.length, maxEnum, fields: ['speaker', 'fx', 'fxText', 'sfx', 'sticker', 'punch'].every((k) => bp[k]), pkg: ['textHook', 'tiktokCaption', 'tiktokHashtags', 'cta'].every((k) => S.schemaWithScenes().properties[k]) };
    // normalize keeps the funny fields
    const raw = { hooks: ['Your brain at 3 a.m.', 'b', 'c'], script: fx.beats.map((b) => b.text).join(' '), beats: fx.beats, title: 'Brain vs Me', description: 'd', hashtags: ['#psychology', '#overthinking'], pinnedComment: 'p', thumbnailText: 'T',
      textHook: fx.textHook, tiktokCaption: 'my brain at 3am is a menace 💀', tiktokHashtags: ['#overthinking', '#psychology', '#brain', '#fyp', '#relatable', '#shorts', '#extra'], cta: fx.cta };
    const n = S.normalize(raw);
    out.norm = { textHook: n.textHook, cta: n.cta, tt: n.tiktokHashtags, yt: n.hashtags, sp: n.beats.map((b) => b.speaker).slice(0, 4), fx: n.beats.map((b) => b.fx).slice(0, 5), punch: n.beats.some((b) => b.punch) };
    // director
    const cv = document.getElementById('c'); cv.width = 1080; cv.height = 1920;
    const mk = (look) => { const rr = new R.Renderer(cv); rr.setup(Object.assign({ preset: 'warm', beats: fx.beats, speechStart: 0.3, speechEnd: 30.3, duration: 31.4, textHook: fx.textHook, ctaSticker: fx.cta, template: 'brain-vs-me', humour: 2 }, look)); return rr; };
    const punchy = mk({ intensity: 'punchy' }); const off = mk({ intensity: 'off' }); const chaotic = mk({ intensity: 'chaotic' });
    // every visual change counts as a pattern interrupt: camera cuts, overlays, shot changes, reaction stickers
    const ev = [0].concat(punchy.cx.cuts.map((c) => c.t), punchy.cx.fx.map((f) => f.start), (punchy.shots || []).map((s) => s.start), punchy.cx.stickers.map((s) => s.start), [punchy.o.speechEnd]).sort((x, y) => x - y);
    const gaps = ev.map((t, i) => (i ? t - ev[i - 1] : 0));
    out.dir = { punchy: punchy.cx.cuts.length, chaotic: chaotic.cx.cuts.length, off: off.cx.cuts.length, maxGap: Math.max(...gaps, 0), cues: punchy.cx.cues.map((c) => c.id), cueIdsValid: punchy.cx.cues.every((c) => A.SFX[c.id]),
      minCueGap: Math.min(...punchy.cx.cues.map((c, i, a) => (i ? c.t - a[i - 1].t : 9))), stickers: punchy.cx.stickers.map((s) => s.text), hookEnd: punchy.cx.hookEnd, cta: punchy.cx.cta,
      twoShot: punchy.timeline.filter((b) => b.sc && b.sc.count === 2).length, brain: punchy.timeline.some((b) => b.sc && (b.sc.cast1 === 'brain' || b.sc.cast2 === 'brain')) };
    await punchy.prepare(); let bad = 0; for (let t = 0; t < 31.4; t += 0.25) { try { punchy.draw(t); } catch (e) { bad++; out.drawErr = String(e); } } out.drawErrors = bad;
    // 16:9 and 1:1 still draw
    for (const a of ['16:9', '1:1']) { const [w, h] = R.frameSize(a, 0.5); cv.width = w; cv.height = h; const rr = mk({ intensity: 'punchy', aspect: a }); await rr.prepare(); try { for (let t = 0; t < 31; t += 0.5) rr.draw(t); out['draw' + a] = true; } catch (e) { out['draw' + a] = String(e); } }
    // audio: synths + music
    const sr = 48000; const stat = (arr) => { let pk = 0; let nan = 0; for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (!isFinite(v)) nan++; else pk = Math.max(pk, Math.abs(v)); } return { pk, nan }; };
    out.synth = {}; for (const id of ['whoosh', 'boom', 'scratch', 'boing', 'bruh', 'trombone', 'heartbeat', 'riser', 'typing', 'clock']) { const s = A.synth(id, sr); const st = stat(s); out.synth[id] = [s.length, +st.pk.toFixed(2), st.nan]; }
    out.music = {}; for (const [id] of A.MUSIC) { if (id === 'none') continue; const m = A.music(id, sr); const a = stat(m.L); const b = stat(m.R); out.music[id] = [+(m.loopLen / sr).toFixed(2), +Math.max(a.pk, b.pk).toFixed(2), a.nan + b.nan]; }
    // every SFX id loads (files over http, synths inline)
    out.sfxLoad = {}; for (const id of Object.keys(A.SFX)) { const s = await A.sample(id, sr); out.sfxLoad[id] = s ? s.data.length : 0; }
    // mix: 10 s voice (speech bursts at -12 dBFS), music + sfx; voice must stay >= 12 dB above music while talking
    const ac = R.audioCtx(); const vb = ac.createBuffer(1, 10 * sr, sr); const vd = vb.getChannelData(0);
    for (let i = 0; i < vd.length; i++) { const t = i / sr; const talk = (t % 2) < 1.4 ? 1 : 0; vd[i] = talk * 0.25 * Math.sin(2 * Math.PI * 180 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * t)); }
    const cues = [{ t: 0.5, id: 'whoosh' }, { t: 2.0, id: 'boom' }, { t: 4.1, id: 'pop' }, { t: 6.0, id: 'bruh' }, { t: 8.2, id: 'laugh' }];
    const mixed = await A.mix(vb, { total: 11, lead: 0.3, audioDur: 10, cues, music: 'quirky', musicVol: 0.5, sfxVol: 0.7, voiceVol: 1 });
    const L = mixed.getChannelData(0); const st = stat(L);
    const noVoice = await A.mix(ac.createBuffer(1, 10 * sr, sr), { total: 11, lead: 0.3, audioDur: 10, cues: [], music: 'quirky', musicVol: 0.5 });
    const ML = noVoice.getChannelData(0);
    // music level while the voice talks = music-only mix (ducked by the same activity) is not available; measure duck by mixing music under voice minus voice
    const rms = (a, s0, s1) => { let e = 0; for (let i = s0; i < s1; i++) e += a[i] * a[i]; return Math.sqrt(e / Math.max(1, s1 - s0)); };
    const i0 = Math.floor(1.0 * sr); const i1 = Math.floor(1.6 * sr); // voice active (0.3 lead + 0.7..1.3 s), no cue here
    const voiceOnly = new Float32Array(i1 - i0); for (let i = i0; i < i1; i++) voiceOnly[i - i0] = vd[i - Math.floor(0.3 * sr)];
    const resid = new Float32Array(i1 - i0); for (let i = i0; i < i1; i++) resid[i - i0] = L[i] - voiceOnly[i - i0];
    out.mix = { len: L.length / sr, peak: +st.pk.toFixed(3), nan: st.nan, placed: mixed.vtsInfo.placed, voiceRms: +rms(voiceOnly, 0, voiceOnly.length).toFixed(4), musicUnderVoice: +rms(resid, 0, resid.length).toFixed(4), musicAlone: +rms(ML, Math.floor(1.0 * sr), Math.floor(1.6 * sr)).toFixed(4) };
    out.mix.voiceOverMusicDb = +(20 * Math.log10(out.mix.voiceRms / Math.max(1e-6, out.mix.musicUnderVoice))).toFixed(1);
    // ideas
    out.ideas = { n: I.COUNT, cats: Object.keys(I.BANK).length, trends: I.TRENDS.length, badFormat: I.IDEAS.filter((x) => !S.FORMATS[x.format]).map((x) => x.text).slice(0, 3), surprise: !!I.surprise().text, trendIds: I.TRENDS.every((t) => S.FORMATS[t.id]) };
    // cover
    cv.width = 1080; cv.height = 1920;
    const blob = await C.cover(document.createElement('canvas'), { beats: fx.beats, look: { preset: 'warm', template: 'brain-vs-me' }, text: 'YOUR BRAIN AT 3 A.M. 💀', handle: '@quietbrainclub' });
    const bmp = await createImageBitmap(blob); out.cover = { type: blob.type, size: blob.size, w: bmp.width, h: bmp.height };
    // dialogue chunking keeps speaker labels
    const lines = [{ speaker: 'Me', text: 'one two three four five six seven eight nine ten' }, { speaker: 'Brain', text: 'eleven twelve thirteen' }, { speaker: 'Me', text: 'a b c d e f g h i j k l m n o' }];
    const ch = G.dialogueChunks(lines, 20); out.dlg = { chunks: ch.length, allLabelled: ch.every((c) => c.every((l) => l.speaker)), words: ch.flat().length };
    return out;
  }, fx);
  ok('7 tones incl. sarcastic/deadpan/genz/roast', ['sarcastic', 'deadpan', 'genz', 'roast', 'calm', 'bold', 'soft'].every((t) => r.tones.includes(t)), r.tones);
  ok('11 format templates', r.formats.length >= 11 && ['classic', 'brain-like', 'pov', 'nobody-me', 'expectation', 'brain-vs-me', 'rating', 'signs', 'therapist', 'myth-fact', 'storytime'].every((f) => r.formats.includes(f)), r.formats);
  ok('comedy prompt names the format + 60 s word range; routing is right', r.promptOk);
  ok('30 s POV prompt', r.pov30); ok('calm/classic/humour 0 keeps the plain prompt', r.calmPlain); ok('30 s length + safe fallback to 60', r.len30);
  ok('schema stays small (< 6000 chars); new enums <= 20; total enum values < 200', r.schema.chars < 6000 && r.schema.maxEnum <= 20 && r.enums.reduce((a, e) => a + e[1], 0) < 200, [r.schema, r.enums]);
  ok('schema has speaker/fx/fxText/sfx/sticker/punch + textHook/tiktok/cta', r.schema.fields && r.schema.pkg);
  ok('normalize keeps textHook + cta', r.norm.textHook === fx.textHook && r.norm.cta === fx.cta, r.norm);
  ok('TikTok hashtags <= 5, no #shorts; YouTube gets #Shorts', r.norm.tt.length <= 5 && !r.norm.tt.some((h) => /shorts/i.test(h)) && r.norm.yt.some((h) => /^#shorts$/i.test(h)), [r.norm.tt, r.norm.yt]);
  ok('normalize keeps speaker / fx / punch', r.norm.sp.includes('brain') && r.norm.fx.includes('notification') && r.norm.punch, r.norm);
  ok('pattern interrupts: punchy = a visual change every <= ~3.6 s, chaotic > punchy, off = none', r.dir.punchy >= 2 && r.dir.chaotic > r.dir.punchy && r.dir.off === 0 && r.dir.maxGap <= 3.6, r.dir);
  ok('sound cues valid and spaced >= 0.4 s', r.dir.cues.length >= 5 && r.dir.cueIdsValid && r.dir.minCueGap >= 0.4, r.dir.cues.join(' '));
  ok('stickers + hook + CTA planned', r.dir.stickers.length >= 2 && r.dir.hookEnd >= 1.6 && r.dir.hookEnd <= 2.6 && r.dir.cta, [r.dir.stickers, r.dir.hookEnd]);
  ok('Brain vs Me: two-shots with the Brain character', r.dir.twoShot >= 3 && r.dir.brain, r.dir.twoShot);
  ok('draws every 0.25 s without errors (9:16)', r.drawErrors === 0, r.drawErr || '');
  ok('draws 16:9 and 1:1', r['draw16:9'] === true && r['draw1:1'] === true, [r['draw16:9'], r['draw1:1']]);
  ok('synth SFX: no NaN, peak <= 1', Object.values(r.synth).every(([n, pk, nan]) => n > 1000 && pk <= 1 && pk > 0.05 && nan === 0), r.synth);
  ok('music loops: no NaN, peak <= 1, 4 bars', Object.values(r.music).every(([d, pk, nan]) => d > 4 && pk <= 1 && pk > 0.1 && nan === 0), r.music);
  ok('all SFX ids load', Object.values(r.sfxLoad).every((n) => n > 500), r.sfxLoad);
  ok('mix: no NaN, never clips (peak <= 1)', r.mix.nan === 0 && r.mix.peak <= 1, r.mix);
  ok('mix: all cues placed', r.mix.placed.length === 5, r.mix.placed);
  ok('mix: voice stays >= 12 dB above music while talking (ducked)', r.mix.voiceOverMusicDb >= 12 && r.mix.musicUnderVoice < r.mix.musicAlone * 1.05 + 1e-3, r.mix);
  ok('idea bank >= 100 ideas, all formats valid, surprise works', r.ideas.n >= 100 && r.ideas.badFormat.length === 0 && r.ideas.surprise && r.ideas.cats >= 10, r.ideas);
  ok('trending format cards >= 8 map to formats', r.ideas.trends >= 8 && r.ideas.trendIds, r.ideas.trends);
  ok('cover PNG export (1080x1920)', r.cover.type === 'image/png' && r.cover.size > 100000 && r.cover.w === 1080 && r.cover.h === 1920, r.cover);
  ok('dialogue TTS chunks keep speaker labels', r.dlg.chunks >= 2 && r.dlg.allLabelled && r.dlg.words === 3, r.dlg);
  const errs = errors.filter((e) => !/favicon/.test(e)); ok('no page errors', errs.length === 0, errs.slice(0, 3));
  const pass = results.filter(Boolean).length; console.log(pass + '/' + results.length + ' passed');
  await browser.close(); srv.close(); process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
