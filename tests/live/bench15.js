// v1.5 frame bench + frame dump: node tests/live/bench15.js <pkg.json> <aspect> <anim> <motion> <outPrefix> [audio.wav]
// Draws frames with a forced GPU->CPU sync (getImageData) so 3D cost is honest; dumps 6 frames spread over the video.
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path');
const WWW = path.join(__dirname, '..', '..', 'www');
const [PKG, ASPECT, ANIM, MOTION, OUT, AUDIO] = process.argv.slice(2);
(async () => {
  const pk0 = JSON.parse(fs.readFileSync(PKG, 'utf8')); const pkg = pk0.pkg || pk0;
  const srv = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; let f = path.join(WWW, p); if (p === '/__audio.wav' && AUDIO) f = AUDIO; if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 0, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://127.0.0.1:' + srv.address().port + '/'); await page.waitForFunction(() => window.VTS && window.VTS.three3d);
  const res = await page.evaluate(async (pkg, aspect, anim, motion, hasAudio) => {
    const R = window.VTS.render; let buf;
    if (hasAudio) buf = await R.decodeBlob(await (await fetch('/__audio.wav')).blob());
    else { const words = (pkg.beats || []).reduce((n, b) => n + String(b.text || '').split(/\s+/).length, 0); const dur = Math.max(20, words / 2.6); const ac = R.audioCtx(); buf = ac.createBuffer(1, Math.floor(dur * 24000), 24000); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = 0.2 * Math.sin(i / 24000 * 2 * Math.PI * 160) * (0.5 + 0.5 * Math.sin(i / 24000 * 2 * Math.PI * 3)); }
    const P = R.plan(buf, Math.max(60, buf.duration + 2)); const [cw, ch] = R.frameSize(aspect, 1);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; document.body.appendChild(c);
    const look = { preset: 'teal', aspect, visual: 'scenes', captionStyle: 'tiktok', captionCase: 'upper', intensity: 'punchy', hook: true, cta: true, autoEmoji: true, loop: true, progress: true, sfx: false, music: 'none', textHook: pkg.textHook || '', ctaSticker: 'Follow for more', template: 'classic', humour: 2, stepLabel: 'STEP', anim, motion, handle: '@QuietBrain' };
    const r = new R.Renderer(c); r.setup(Object.assign({}, look, { beats: pkg.beats, speechStart: P.speechStart, speechEnd: P.speechEnd, duration: P.total, sections: pkg.sections || null, speech: P.speech }));
    r.env = window.VTS.motion.envelopeFromBuffer(buf); await r.prepare();
    const ctx = c.getContext('2d'); const ts = []; const T = P.total;
    for (let i = 0; i < 90; i++) ts.push(Math.min(T - 0.1, T * 0.3 + i / 30));
    const times = []; for (const t of ts) { const a = performance.now(); r.draw(t); ctx.getImageData(0, 0, 1, 1); times.push(performance.now() - a); }
    times.sort((a, b) => a - b); const shots = [];
    for (let k = 0; k < 6; k++) { const t = 1.2 + (T - 3) * k / 5; r.draw(t); shots.push({ t, d: c.toDataURL('image/jpeg', 0.85).split(',')[1] }); }
    return { T, used3d: !!r.used3d, fail: window.VTS.three3d.failed, w: cw, h: ch, sections: (pkg.sections || []).length, avg: times.reduce((a, b) => a + b, 0) / times.length, p50: times[45], p90: times[81], max: times[89], shots };
  }, pkg, ASPECT, ANIM, MOTION, !!AUDIO);
  res.shots.forEach((s, k) => fs.writeFileSync(OUT + '_' + k + '.jpg', Buffer.from(s.d, 'base64')));
  delete res.shots; console.log('BENCH', path.basename(OUT), JSON.stringify(res, (k, v) => typeof v === 'number' ? Math.round(v * 10) / 10 : v)); console.log('ERRORS', JSON.stringify(errors.slice(0, 5)));
  await browser.close(); srv.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
