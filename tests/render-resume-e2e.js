// v1.11.6: Autopilot render must (a) keep full speed when the app is in the background (no throttled timers in the
// frame loop), and (b) resume from the last 2-second keyframe checkpoint when the video encoder dies mid-render,
// instead of restarting at 0 %. Runs in real headless Chrome WITH background throttling enabled (puppeteer turns it off
// by default) and the Montserrat/scene pipeline of the app.
// Usage: node tests/render-resume-e2e.js      (WWW_DIR=/path/to/old/www to compare against an older build)
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path');
const WWW = process.env.WWW_DIR || path.join(__dirname, '..', 'www'); const FIX = require('./fixtures/brain-vs-me.json');
const results = []; const ok = (n, c, x) => { results.push(!!c); console.log(c ? 'PASS' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x)); };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = path.join(WWW, p);
  if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
const SEC = +process.env.CLIP_SEC || 12;
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
    ignoreDefaultArgs: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const page = await browser.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.setRequestInterception(true);
  page.on('request', (req) => { const u = new URL(req.url()); if (!/127\.0\.0\.1/.test(u.host)) return req.respond({ status: 500, body: '' }); req.continue(); });
  await page.goto('http://127.0.0.1:' + srv.address().port + '/'); await page.waitForFunction(() => window.VTS && VTS.render && VTS.encode && VTS.gemini);
  await page.evaluate((fix) => {
    window.FIX = fix;
    window.mkBuf = async (sec) => { const sr = 24000; const n = sr * sec; const pcm = new Int16Array(n); for (let i = 0; i < n; i++) pcm[i] = Math.sin(i / 8) * 6000 * (Math.floor(i / 6000) % 2);
      const w = VTS.gemini.pcmToWav([new Uint8Array(pcm.buffer)], sr, 1); return VTS.render.decodeBlob(w instanceof Blob ? w : new Blob([w], { type: 'audio/wav' })); };
    window.mkCanvas = () => { const [w, h] = VTS.render.frameSize('9:16', 1); const c = document.createElement('canvas'); c.width = w; c.height = h; c.style.cssText = 'position:fixed;left:-99999px'; document.body.appendChild(c); return c; };
    window.LOOK = { aspect: '9:16', preset: 'kurz', visual: 'scenes', anim: '2d', aiImages: false, sfx: false, music: 'none', textHook: fix.textHook || '' };
    window.check = async (blob) => { const i = await VTS.encode.blobInfo(blob); return { dur: Math.round(i.duration * 10) / 10, ok: VTS.encode.checkShort(i, 59.9).ok }; };
  }, FIX);
  const render = (extra) => page.evaluate(async (sec, extra) => {
    const buf = await mkBuf(sec); const t0 = Date.now(); const diags = []; let hiddenFrames = 0;
    const o = { canvas: mkCanvas(), buffer: buf, beats: FIX.beats, look: LOOK, maxSeconds: 59, stallMs: 4000, onDiag: (d) => diags.push(d.event + (d.reason ? ' ' + d.reason : '')), onProgress: () => { if (document.hidden) hiddenFrames++; } };
    let Real = null; let killed = 0;
    if (extra && extra.killAt) { // first hardware encoder dies at frame killAt (codec reclaimed), replacements work
      Real = window.VideoEncoder;
      class Flaky { constructor(init) { this.init = init; this.real = new Real(init); this.n = 0; this.dead = false; this.ondequeue = null; this.victim = !killed; }
        static isConfigSupported(c) { return Real.isConfigSupported(c); }
        configure(c) { this.real.configure(c); }
        get encodeQueueSize() { return this.dead ? 10 : this.real.encodeQueueSize; } get state() { return this.dead ? 'configured' : this.real.state; }
        encode(f, op) { if (this.victim && ++this.n === extra.killAt) { this.dead = true; killed++; setTimeout(() => this.init.error(new DOMException('Codec reclaimed due to inactivity.', 'QuotaExceededError')), 10); } if (!this.dead) this.real.encode(f, op); }
        addEventListener(t, f, op) { if (!this.dead) this.real.addEventListener(t, f, op); } removeEventListener(t, f) { this.real.removeEventListener(t, f); }
        flush() { return this.dead ? new Promise(() => {}) : this.real.flush(); } close() { try { this.real.close(); } catch (_) {} } }
      window.VideoEncoder = Flaky;
    }
    let v = null; let err = null;
    try { v = await VTS.encode.renderOffline(o); } catch (e) { err = String(e && e.message || e); }
    if (Real) window.VideoEncoder = Real;
    return { err, s: Math.round((Date.now() - t0) / 100) / 10, hidden: document.hidden, hiddenFrames, killed, resumes: v && v.resumes, retry: v && v.encoderRetry, info: v && await check(v.blob), diags };
  }, SEC, extra || null);

  const vis = await render();
  ok('visible: offline render makes a valid MP4', !vis.err && vis.info && vis.info.ok && Math.abs(vis.info.dur - (SEC + 1)) < 2.5, vis);
  const res = await render({ killAt: 75 });
  ok('encoder reclaimed at frame 75 -> resumes from the 2 s keyframe checkpoint (not frame 0), valid MP4 of the right length',
    !res.err && res.killed === 1 && res.resumes === 1 && !res.retry && res.info && res.info.ok && Math.abs(res.info.dur - vis.info.dur) < 0.2 && res.diags.some((d) => /encoder-resume .*resuming at 60 /.test(d)), res);
  // hide the app: bring another tab to the front -> document.hidden, timers throttled to 1/s
  const other = await browser.newPage(); await other.bringToFront(); await new Promise((r) => setTimeout(r, 500));
  const hid = await render();
  ok('hidden (background-throttled) render finishes at close to visible speed (was ~1 s per 30 frames, ~1 min per 30 frames after 5 min hidden)', !hid.err && hid.hidden && hid.info && hid.info.ok && hid.s < Math.max(vis.s * 2, vis.s + 8), { visible_s: vis.s, hidden_s: hid.s, hid });
  const y = await page.evaluate(async () => { const t0 = performance.now(); if (!VTS.encode.yieldNow) return { hidden: document.hidden, ms: -1 }; for (let i = 0; i < 60; i++) await VTS.encode.yieldNow(); return { hidden: document.hidden, ms: Math.round(performance.now() - t0) }; });
  ok('yieldNow() is not throttled in a hidden page (60 yields)', y.hidden && y.ms >= 0 && y.ms < 1000, y);
  ok('no page errors', !errors.length, errors);
  await browser.close(); srv.close();
  console.log('\n' + results.filter(Boolean).length + ' / ' + results.length + ' passed'); process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
