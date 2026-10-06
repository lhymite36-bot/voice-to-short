// v1.6 preview tool: renders stills (and optional short clips) of scene specs through the app's real Renderer
// (2D style, smooth motion, captions on) in headless Chrome with a silent soundtrack. No network, no API key.
// Usage: node tests/live/stills16.js <specs.json> <outDir>   specs: [{ name, beats:[{text, scene, speaker, fx, fxText}], dur, times:[s...], clip:true, look:{} }]
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path'); const { spawnSync } = require('child_process');
const WWW = path.join(__dirname, '..', '..', 'www'); const [SPECS, OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const specs = JSON.parse(fs.readFileSync(SPECS, 'utf8'));
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = path.join(WWW, p); if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const ORIGIN = 'http://127.0.0.1:' + srv.address().port;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 0, args: ['--no-sandbox', '--disable-background-timer-throttling'] });
  const page = await browser.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/'); await page.waitForFunction(() => window.VTS && window.VTS.render && window.VTS.motion);
  await page.evaluate(async () => { try { await document.fonts.load('800 100px Montserrat'); await document.fonts.load('900 100px Montserrat'); } catch (_) { /* */ } });
  for (const sp of specs) {
    const res = await page.evaluate(async (sp) => {
      const R = window.VTS.render; const ac = R.audioCtx(); const dur = sp.dur || 4; const buf = ac.createBuffer(1, Math.floor(dur * 24000), 24000);
      const P = R.plan(buf, Math.max(60, dur + 2)); const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
      const look = Object.assign({ preset: 'teal', aspect: '9:16', visual: 'scenes', captionStyle: 'tiktok', captionCase: 'upper', intensity: 'punchy', hook: false, cta: false, autoEmoji: true, loop: false, progress: false, sfx: false, music: 'none', textHook: '', template: 'classic', humour: 2, stepLabel: 'STEP', anim: '2d', motion: 'smooth', handle: '' }, sp.look || {});
      const beats = sp.beats.map((b) => Object.assign({ weight: String(b.text).split(/\s+/).length, step: 0 }, b));
      const r = new R.Renderer(c); r.setup(Object.assign({}, look, { beats, speechStart: P.speechStart, speechEnd: P.speechEnd, duration: P.total, sections: null }));
      await r.prepare(); window.__r = r; window.__c = c;
      const out = []; for (const t of sp.times || [1.5]) { r.draw(t); out.push(c.toDataURL('image/jpeg', 0.88).split(',')[1]); }
      const scs = r.timeline.map((b) => b.sc && { setting: b.sc.setting, pose: b.sc.pose, emotion: b.sc.emotion, count: b.sc.count, behind: b.sc.behind, weather: b.sc.weather, props: b.sc.props });
      let ms = 0; for (let k = 0; k < 15; k++) { const a = performance.now(); r.draw(1 + k / 30); ms += performance.now() - a; }
      return { out, scs, total: P.total, ms: ms / 15 };
    }, sp);
    res.out.forEach((b64, i) => fs.writeFileSync(path.join(OUT, sp.name + (res.out.length > 1 ? '-' + i : '') + '.jpg'), Buffer.from(b64, 'base64')));
    console.log(sp.name, 'drawMs', res.ms.toFixed(1), JSON.stringify(res.scs));
    if (sp.clip) {
      const N = Math.round((sp.clipSec || Math.min(5, res.total)) * 30); const dir = path.join(OUT, '.f-' + sp.name); fs.mkdirSync(dir, { recursive: true });
      for (let i = 0; i < N; i += 15) { const fr = await page.evaluate((i0, n, N) => { const o = []; for (let k = i0; k < Math.min(N, i0 + n); k++) { window.__r.draw(k / 30); o.push(window.__c.toDataURL('image/jpeg', 0.85).split(',')[1]); } return o; }, i, 15, N); fr.forEach((b, k) => fs.writeFileSync(path.join(dir, String(i + k).padStart(4, '0') + '.jpg'), Buffer.from(b, 'base64'))); }
      spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, '%04d.jpg'), '-vf', 'scale=540:960', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', path.join(OUT, sp.name + '.mp4')]);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  console.log('ERRORS', JSON.stringify(errors.slice(0, 10)));
  await browser.close(); srv.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
