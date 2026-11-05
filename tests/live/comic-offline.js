// v1.7 Comic Recap offline renderer: the app's own Renderer (visual 'comic') drawn frame by frame at 30 fps in headless
// Chrome + the app's SFX/music mixer, muxed with ffmpeg. Frame-exact; no Gemini calls.
// Usage: node tests/live/comic-offline.js <project.json> <voice.wav> <out.mp4>
//   project.json: { panels: [{ file, lines: [...], focus?, impact?, sfx? }], fx?, captionStyle?, music?, preset? }  (file paths relative to the json)
//   env FRAMES="1.2,5,9.5" also writes those frames as JPEGs next to <out>; INFO_ONLY=1 skips the video.
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const WWW = path.join(__dirname, '..', '..', 'www');
const [PROJ, AUDIO, OUT] = process.argv.slice(2);
if (!PROJ || !AUDIO || !OUT) { console.error('usage: comic-offline.js <project.json> <voice.wav> <out.mp4>'); process.exit(2); }
const proj = JSON.parse(fs.readFileSync(PROJ, 'utf8')); const base = path.dirname(path.resolve(PROJ));
const files = proj.panels.map((p) => path.resolve(base, p.file));
function serve() {
  const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
    let f = path.join(WWW, p); const m = /^\/__panel\/(\d+)$/.exec(p);
    if (p === '/__audio.wav') f = AUDIO; else if (m) f = files[Number(m[1])];
    const ok = f && fs.existsSync(f) && !fs.statSync(f).isDirectory() && (f.startsWith(WWW) || f === AUDIO || files.includes(f));
    if (!ok) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(f).toLowerCase()] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}
(async () => {
  const srv = await serve(); const ORIGIN = 'http://127.0.0.1:' + srv.address().port;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 0, args: ['--no-sandbox', '--disable-background-timer-throttling'] });
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/'); await page.waitForFunction(() => window.VTS && window.VTS.render && window.VTS.comic && window.VTS.audiofx);
  const info = await page.evaluate(async (proj) => {
    const V = window.VTS; const R = V.render; const CM = V.comic;
    const panels = [];
    for (let k = 0; k < proj.panels.length; k++) { const blob = await (await fetch('/__panel/' + k)).blob(); const bmp = await createImageBitmap(blob); const p = proj.panels[k]; panels.push({ blob, w: bmp.width, h: bmp.height, lines: p.lines || [], focus: p.focus || null, impact: !!p.impact, sfx: p.sfx || '' }); }
    const beats = CM.buildBeats(panels);
    const buf = await R.decodeBlob(await (await fetch('/__audio.wav')).blob());
    const P = R.plan(buf, Math.max(60, buf.duration + 2));
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; document.body.appendChild(c);
    const look = Object.assign({ preset: 'teal', aspect: '9:16', visual: 'comic', captionStyle: 'comic', captionCase: 'upper', progress: true, sfx: true, music: 'suspense', musicVol: 0.45, sfxVol: 0.75, voiceVol: 1, watermark: false, handle: '' }, proj.look || {});
    if (proj.captionStyle) look.captionStyle = proj.captionStyle; if (proj.music) look.music = proj.music;
    look.comic = { panels, fx: proj.fx || {} };
    try { await document.fonts.load('900 100px Montserrat'); await document.fonts.load('400 100px Bangers'); } catch (_) { /* ignore */ }
    const r = new R.Renderer(c); r.setup(Object.assign({}, look, { beats, speechStart: P.speechStart, speechEnd: P.speechEnd, duration: P.total, sections: null, speech: P.speech }));
    await r.prepare(); window.__r = r; window.__c = c;
    let mixWav = '';
    if (V.audiofx && r.cx && (look.sfx !== false || (look.music && look.music !== 'none'))) {
      const m = await V.audiofx.mix(buf, { total: P.total, lead: R.LEAD, audioDur: P.audioDur, cues: look.sfx === false ? [] : r.cx.cues, music: look.music || 'none', musicVol: look.musicVol, sfxVol: look.sfxVol, voiceVol: look.voiceVol });
      const nc = m.numberOfChannels; const L = m.length; const dv = new DataView(new ArrayBuffer(44 + L * nc * 2)); const ws = (o, t) => { for (let i = 0; i < t.length; i++) dv.setUint8(o + i, t.charCodeAt(i)); };
      ws(0, 'RIFF'); dv.setUint32(4, 36 + L * nc * 2, true); ws(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nc, true); dv.setUint32(24, m.sampleRate, true); dv.setUint32(28, m.sampleRate * nc * 2, true); dv.setUint16(32, nc * 2, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, L * nc * 2, true);
      const ch = []; for (let k = 0; k < nc; k++) ch.push(m.getChannelData(k)); let o = 44; for (let i = 0; i < L; i++) for (let k = 0; k < nc; k++) { dv.setInt16(o, Math.max(-1, Math.min(1, ch[k][i])) * 32767, true); o += 2; }
      const u = new Uint8Array(dv.buffer); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); mixWav = btoa(s);
    }
    const C = r.comic;
    return { total: P.total, aligned: !!r.timeline.aligned, beats: r.timeline.length, words: r.timeline.reduce((a, b) => a + b.words.length, 0),
      segs: C.segs.map((s) => ({ panel: s.panel, start: +s.start.toFixed(2), end: +s.end.toFixed(2), trans: s.trans, move: s.move, firstWord: s.first >= 0 ? +r.timeline[s.first].wordTimes[0].toFixed(2) : null, text: s.first >= 0 ? r.timeline.slice(s.first, s.last + 1).map((b) => b.text).join(' ') : '' })),
      impacts: C.impacts.map((i) => ({ t: +i.t.toFixed(2), text: i.text, audio: i.audio })), cues: r.cx.cues.map((q) => q.id + '@' + q.t.toFixed(2)),
      timeline: r.timeline.map((b) => ({ panel: b.panel, start: +b.start.toFixed(3), text: b.text, wordTimes: b.wordTimes.map((x) => +x.toFixed(3)) })), mixWav };
  }, proj);
  let AIN = AUDIO; let DELAY = true; if (info.mixWav) { AIN = OUT + '.mix.wav'; fs.writeFileSync(AIN, Buffer.from(info.mixWav, 'base64')); DELAY = false; } delete info.mixWav;
  fs.writeFileSync(OUT + '.timeline.json', JSON.stringify(info, null, 1));
  console.log('INFO', JSON.stringify({ total: info.total, aligned: info.aligned, beats: info.beats, segs: info.segs.map((s) => s.panel + '@' + s.start + ':' + s.trans + '/' + s.move), impacts: info.impacts, cues: info.cues.length }));
  const frames = (process.env.FRAMES || '').split(',').map(Number).filter((x) => isFinite(x) && x >= 0);
  for (const tt of frames) {
    const url = await page.evaluate((tt) => { for (let x = Math.max(0, tt - 0.5); x < tt; x += 1 / 30) window.__r.draw(x); window.__r.draw(tt); return window.__c.toDataURL('image/jpeg', 0.9); }, tt);
    fs.writeFileSync(OUT.replace(/\.mp4$/, '') + '.f' + tt.toFixed(2) + '.jpg', Buffer.from(url.split(',')[1], 'base64'));
  }
  if (!process.env.INFO_ONLY) {
    const N = Math.ceil(info.total * 30);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-i', AIN, '-af', DELAY ? 'adelay=300|300,apad' : 'apad', '-t', info.total.toFixed(3), '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-maxrate', '10M', '-bufsize', '20M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((ok) => ff.on('close', ok)); let drawMs = 0; let maxDraw = 0; const t0 = Date.now();
    for (let i = 0; i < N; i += 15) {
      const batch = await page.evaluate((i0, n, N) => { const out = []; let dm = 0; let mx = 0; for (let k = i0; k < Math.min(N, i0 + n); k++) { const a = performance.now(); window.__r.draw(k / 30); const d = performance.now() - a; dm += d; mx = Math.max(mx, d); out.push(window.__c.toDataURL('image/jpeg', 0.9).split(',')[1]); } return { out, dm, mx }; }, i, 15, N);
      drawMs += batch.dm; maxDraw = Math.max(maxDraw, batch.mx);
      for (const b64 of batch.out) { if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise((ok) => ff.stdin.once('drain', ok)); }
    }
    ff.stdin.end(); await done;
    console.log('DONE', OUT, 'frames', N, 'avgDrawMs', (drawMs / N).toFixed(1), 'maxDrawMs', maxDraw.toFixed(1), 'wall', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  if (AIN !== AUDIO) fs.unlinkSync(AIN);
  console.log('ERRORS', JSON.stringify(errors.slice(0, 10)));
  await browser.close(); srv.close();
  if (errors.length) process.exitCode = 1;
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
