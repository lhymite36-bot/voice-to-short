// v1.5 preview renderer: draws the app's real Renderer frame by frame (30 fps, not real time) in headless Chrome and muxes with ffmpeg.
// Used for before/after previews and frame checks without spending Gemini quota.
// Usage: node tests/live/preview-offline.js <pkg.json> <audio.wav> <out.mp4> [aspect=9:16] [anim=2d] [motion=smooth] [maxSec]
// env LOOK_JSON='{...}' overrides the look (e.g. the app project's look); with sfx/music on, the app's own mixer builds the soundtrack.
// Also the daily pipeline's frame-exact renderer for ANIM=3d on the box (software WebGL is too slow for the app's real-time recorder).
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const WWW = path.join(__dirname, '..', '..', 'www');
const [PKG, AUDIO, OUT, ASPECT = '9:16', ANIM = '2d', MOTION = 'smooth', MAXS] = process.argv.slice(2);
function serve() {
  const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.wav': 'audio/wav' };
  const srv = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; let f = path.join(WWW, p); if (p === '/__audio.wav') f = AUDIO;
    if ((!f.startsWith(WWW) && f !== AUDIO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}
(async () => {
  const pk0 = JSON.parse(fs.readFileSync(PKG, 'utf8')); const pkg = pk0.pkg || pk0;
  const srv = await serve(); const ORIGIN = 'http://127.0.0.1:' + srv.address().port;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 0,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling'] });
  const page = await browser.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/'); await page.waitForFunction(() => window.VTS && window.VTS.render && window.VTS.motion && window.VTS.three3d);
  const LOOKX = process.env.LOOK_JSON ? JSON.parse(process.env.LOOK_JSON) : {}; if (LOOKX.handle === undefined) LOOKX.handle = process.env.HANDLE || 'Quiet Brain'; if (process.env.CAPTION_STYLE) LOOKX.captionStyle = process.env.CAPTION_STYLE; if (process.env.TEXT_STYLE) LOOKX.textStyle = process.env.TEXT_STYLE;
  const info = await page.evaluate(async (pkg, aspect, anim, motion, maxs, lookx) => {
    const R = window.VTS.render; const buf0 = await R.decodeBlob(await (await fetch('/__audio.wav')).blob());
    let buf = buf0; if (maxs && buf0.duration > maxs) { const ac = R.audioCtx(); const n = Math.floor(maxs * buf0.sampleRate); buf = ac.createBuffer(1, n, buf0.sampleRate); buf.copyToChannel(buf0.getChannelData(0).subarray(0, n), 0); }
    const P = R.plan(buf, Math.max(60, buf.duration + 2));
    const [cw, ch] = R.frameSize(aspect, 1); const c = document.createElement('canvas'); c.width = cw; c.height = ch; document.body.appendChild(c);
    const look = { preset: 'teal', aspect, visual: 'scenes', captionStyle: 'tiktok', captionCase: 'upper', intensity: 'punchy', hook: true, cta: true, autoEmoji: true, loop: true, progress: true, sfx: false, music: 'none',
      textHook: pkg.textHook || '', ctaSticker: pkg.cta || 'Follow if your brain does this too 🧠', template: 'classic', humour: 2, stepLabel: 'STEP', anim, motion, handle: '' };
    Object.assign(look, lookx, { aspect, anim, motion, visual: lookx.visual || 'scenes' });
    try { await document.fonts.load('800 100px Montserrat'); await document.fonts.load('900 100px Montserrat'); } catch (_) { /* ignore */ }
    const r = new R.Renderer(c); r.setup(Object.assign({}, look, { beats: pkg.beats, speechStart: P.speechStart, speechEnd: P.speechEnd, duration: P.total, sections: null, speech: P.speech }));
    r.env = window.VTS.motion.envelopeFromBuffer(buf); await r.prepare(); window.__r = r; window.__c = c;
    let mixWav = '';
    if (window.VTS.audiofx && r.cx && (look.sfx !== false || (look.music && look.music !== 'none'))) {
      const m = await window.VTS.audiofx.mix(buf, { total: P.total, lead: 0.3, audioDur: P.audioDur, cues: look.sfx === false ? [] : r.cx.cues, music: look.music || 'none', musicVol: look.musicVol, sfxVol: look.sfxVol, voiceVol: look.voiceVol });
      const nc = m.numberOfChannels; const L = m.length; const dv = new DataView(new ArrayBuffer(44 + L * nc * 2)); const ws = (o, t) => { for (let i = 0; i < t.length; i++) dv.setUint8(o + i, t.charCodeAt(i)); };
      ws(0, 'RIFF'); dv.setUint32(4, 36 + L * nc * 2, true); ws(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nc, true); dv.setUint32(24, m.sampleRate, true); dv.setUint32(28, m.sampleRate * nc * 2, true); dv.setUint16(32, nc * 2, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, L * nc * 2, true);
      const ch = []; for (let k = 0; k < nc; k++) ch.push(m.getChannelData(k)); let o = 44; for (let i = 0; i < L; i++) for (let k = 0; k < nc; k++) { dv.setInt16(o, Math.max(-1, Math.min(1, ch[k][i])) * 32767, true); o += 2; }
      const u = new Uint8Array(dv.buffer); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); mixWav = btoa(s);
    }
    return { total: P.total, w: cw, h: ch, used3d: !!r.used3d, fail3d: window.VTS.three3d.failed, fx: r.cx ? r.cx.fx.map((f) => f.type + (f.auto ? '*' : '') + '@' + f.start.toFixed(1)) : [], shots: (r.shots || []).map((s) => s.transition), pops: (r.pops || []).length, mixWav };
  }, pkg, ASPECT, ANIM, MOTION, MAXS ? Number(MAXS) : 0, LOOKX);
  let AIN = AUDIO; let DELAY = !process.env.NO_DELAY; if (info.mixWav) { AIN = OUT + '.mix.wav'; fs.writeFileSync(AIN, Buffer.from(info.mixWav, 'base64')); DELAY = false; } delete info.mixWav;
  console.log('INFO', JSON.stringify(info));
  const N = Math.ceil(info.total * 30);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-i', AIN, '-af', DELAY ? 'adelay=300|300,apad' : 'apad', '-t', info.total.toFixed(3), '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-maxrate', '10M', '-bufsize', '20M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok) => ff.on('close', ok)); let drawMs = 0; let maxDraw = 0; const t0 = Date.now();
  for (let i = 0; i < N; i += 15) {
    const batch = await page.evaluate((i0, n, N) => { const out = []; let dm = 0; let mx = 0; for (let k = i0; k < Math.min(N, i0 + n); k++) { const a = performance.now(); window.__r.draw(k / 30); const d = performance.now() - a; dm += d; mx = Math.max(mx, d); out.push(window.__c.toDataURL('image/jpeg', 0.9).split(',')[1]); } return { out, dm, mx }; }, i, 15, N);
    drawMs += batch.dm; maxDraw = Math.max(maxDraw, batch.mx);
    for (const b64 of batch.out) { if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise((ok) => ff.stdin.once('drain', ok)); }
  }
  ff.stdin.end(); await done; if (AIN !== AUDIO) fs.unlinkSync(AIN);
  console.log('DONE', OUT, 'frames', N, 'avgDrawMs', (drawMs / N).toFixed(1), 'maxDrawMs', maxDraw.toFixed(1), 'wall', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  console.log('ERRORS', JSON.stringify(errors.slice(0, 10)));
  await browser.close(); srv.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
