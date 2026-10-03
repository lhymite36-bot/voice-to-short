// v1.5 real-time render check through the app's own renderVideo (MediaRecorder), like the phone does.
// node tests/live/rt15.js <pkg.json> <audio.wav> <aspect> <anim> <motion> <out.webm> [maxSec=12]
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path');
const WWW = path.join(__dirname, '..', '..', 'www');
const [PKG, AUDIO, ASPECT, ANIM, MOTION, OUT, MAXS = '12'] = process.argv.slice(2);
(async () => {
  const pk0 = JSON.parse(fs.readFileSync(PKG, 'utf8')); const pkg = pk0.pkg || pk0;
  const srv = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; let f = path.join(WWW, p); if (p === '/__audio.wav') f = AUDIO; if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 0, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://127.0.0.1:' + srv.address().port + '/'); await page.waitForFunction(() => window.VTS && window.VTS.three3d);
  const res = await page.evaluate(async (pkg, aspect, anim, motion, maxs) => {
    const R = window.VTS.render; const b0 = await R.decodeBlob(await (await fetch('/__audio.wav')).blob());
    const ac = R.audioCtx(); const n = Math.min(b0.length, Math.floor(maxs * b0.sampleRate)); const buf = ac.createBuffer(1, n, b0.sampleRate); buf.copyToChannel(b0.getChannelData(0).subarray(0, n), 0);
    const [cw, ch] = R.frameSize(aspect, 1); const c = document.createElement('canvas'); c.width = cw; c.height = ch; document.body.appendChild(c);
    const look = { preset: 'teal', aspect, visual: 'scenes', captionStyle: 'tiktok', captionCase: 'upper', intensity: 'punchy', hook: true, cta: true, autoEmoji: true, loop: true, progress: true, sfx: true, music: 'quirky', textHook: pkg.textHook || '', ctaSticker: 'Follow for more', template: 'classic', humour: 2, stepLabel: 'STEP', anim, motion, handle: '@QuietBrain' };
    const out = await R.renderVideo({ canvas: c, buffer: buf, beats: pkg.beats, look, maxSeconds: 60, format: 'auto' });
    const ab = await out.blob.arrayBuffer(); let s = ''; const u = new Uint8Array(ab); for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
    return { b64: btoa(s), mime: out.mime, duration: out.duration, frames: out.frames, fps: out.fps, avgDrawMs: out.avgDrawMs, maxDrawMs: out.maxDrawMs, w: out.width, h: out.height, used3d: !!(out.scenes !== undefined) };
  }, pkg, ASPECT, ANIM, MOTION, Number(MAXS));
  fs.writeFileSync(OUT, Buffer.from(res.b64, 'base64')); delete res.b64;
  console.log('RT', path.basename(OUT), JSON.stringify(res, (k, v) => typeof v === 'number' ? Math.round(v * 10) / 10 : v)); console.log('ERRORS', JSON.stringify(errors.slice(0, 5)));
  await browser.close(); srv.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
