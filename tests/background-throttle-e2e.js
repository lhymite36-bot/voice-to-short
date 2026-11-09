// v1.11.6 regression test for "render timed out at 51% after 21m22s, 20m22s of it in background".
// Chrome / Android WebView apply INTENSIVE wake-up throttling to a page hidden for 5+ min: chained setTimeout() runs at most
// once per MINUTE. The 1.11.5 offline encoder yielded with setTimeout every 30 frames, so each second of video cost up to
// a minute in the background. Here the grace period is shortened to 10 s with a Chrome feature flag so it runs quickly.
// Usage: node tests/background-throttle-e2e.js     (WWW_DIR=/path/to/old/www shows the old behaviour: FAIL, minutes)
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path');
const WWW = process.env.WWW_DIR || path.join(__dirname, '..', 'www'); const FIX = require('./fixtures/brain-vs-me.json');
const LIMIT_S = +process.env.LIMIT_S || 60;
const srv = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = path.join(WWW, p);
  if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--enable-features=IntensiveWakeUpThrottling:grace_period_seconds/10'],
    ignoreDefaultArgs: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (req) => { const u = new URL(req.url()); if (!/127\.0\.0\.1/.test(u.host)) return req.respond({ status: 500, body: '' }); req.continue(); });
  await page.goto('http://127.0.0.1:' + srv.address().port + '/'); await page.waitForFunction(() => window.VTS && VTS.render && VTS.encode && VTS.gemini);
  const other = await browser.newPage(); await other.bringToFront();
  await new Promise((r) => setTimeout(r, 15000)); // past the (shortened) 5-minute grace period
  const r = await page.evaluate(async (fix, limit) => {
    const sr = 24000; const sec = 8; const pcm = new Int16Array(sr * sec); for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin(i / 8) * 6000;
    const w = VTS.gemini.pcmToWav([new Uint8Array(pcm.buffer)], sr, 1); const buf = await VTS.render.decodeBlob(w instanceof Blob ? w : new Blob([w], { type: 'audio/wav' }));
    const [cw, ch] = VTS.render.frameSize('9:16', 1); const c = document.createElement('canvas'); c.width = cw; c.height = ch; document.body.appendChild(c);
    // A phone's hardware encoder usually keeps up (queue never above 6), so the loop never waits on 'dequeue' events and its
    // only yields are the timer yields. Model that: report an empty encode queue.
    const Real = window.VideoEncoder;
    window.VideoEncoder = class extends Real { get encodeQueueSize() { return 0; } };
    const t0 = performance.now(); let maxP = 0;
    const job = VTS.encode.renderOffline({ canvas: c, buffer: buf, beats: fix.beats, look: { aspect: '9:16', preset: 'kurz', visual: 'scenes', anim: '2d', aiImages: false, sfx: false, music: 'none' }, maxSeconds: 59, onProgress: (p) => { maxP = Math.max(maxP, p); } });
    // NOTE: this watchdog itself is a (throttled) timer; it only decides when we stop waiting.
    const out = await Promise.race([job.then((v) => ({ done: true, size: v && v.blob.size })), new Promise((res) => setTimeout(() => res({ done: false }), limit * 1000 + 61000))]);
    window.VideoEncoder = Real;
    return Object.assign(out, { hidden: document.hidden, s: Math.round((performance.now() - t0) / 1000), progress: Math.round(maxP * 100) });
  }, FIX, LIMIT_S);
  const pass = r.hidden && r.done && r.s <= LIMIT_S;
  console.log(pass ? 'PASS' : 'FAIL', 'render of an 8 s clip in a page hidden past the intensive-throttling grace period finishes within ' + LIMIT_S + ' s', JSON.stringify(r));
  await browser.close(); srv.close(); process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
