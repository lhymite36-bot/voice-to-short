// Reproduces the real Autopilot stalls in headless Chrome and checks they now fail fast (or recover) instead of hanging,
// plus generation fencing (late work from a cancelled/timed-out run can never upload or schedule).
// Usage: node tests/stalls-e2e.js            (WWW_DIR=/path/to/old/www to run the same scenarios against an older build)
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path');
const WWW = process.env.WWW_DIR || path.join(__dirname, '..', 'www'); const FIX = require('./fixtures/brain-vs-me.json');
const HANG_MS = +process.env.HANG_MS || 45000;
const results = []; const ok = (n, c, x) => { results.push(!!c); console.log(c ? 'PASS' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x)); };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = path.join(WWW, p);
  if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  const seen = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url()); const j = (st, b) => req.respond({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(b) });
    if (req.method() === 'OPTIONS' && !/127\.0\.0\.1/.test(u.host)) return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.hostname === 'api.buffer.com') { const b = JSON.parse(req.postData());
      if (/createPost/.test(b.query)) { seen.push('buffer:createPost'); return j(200, { data: { createPost: { post: { id: 'P1', dueAt: b.variables.input.dueAt, status: 'scheduled' } } } }); }
      return j(200, { data: { posts: { edges: [] } } }); }
    if (u.hostname === 'api.github.com') return req.method() === 'GET' ? j(200, { id: 9 }) : j(201, { id: 9 });
    if (u.hostname === 'uploads.github.com') { seen.push('ghup'); return j(201, { browser_download_url: 'https://github.com/x/y/releases/download/t/' + u.searchParams.get('name') }); }
    if (u.hostname === 'generativelanguage.googleapis.com') return j(500, { error: { message: 'stubbed' } });
    req.continue();
  });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('vts.apiKey', 'AIzaTEST'); });
  await page.goto('http://127.0.0.1:' + srv.address().port + '/'); await page.waitForFunction(() => window.VTS && VTS.autopilot && VTS.makeShortHeadless && VTS.render && VTS.encode);
  await page.evaluate((fix) => {
    window.FIX = fix;
    window.mkBuf = async (sec) => { const sr = 24000; const n = sr * sec; const pcm = new Int16Array(n); for (let i = 0; i < n; i++) pcm[i] = Math.sin(i / 8) * 6000 * (Math.floor(i / 6000) % 2);
      const w = VTS.gemini.pcmToWav([new Uint8Array(pcm.buffer)], sr, 1); return VTS.render.decodeBlob(w instanceof Blob ? w : new Blob([w], { type: 'audio/wav' })); };
    window.mkCanvas = () => { const [w, h] = VTS.render.frameSize('9:16', 1); const c = document.createElement('canvas'); c.width = w; c.height = h; c.style.cssText = 'position:fixed;left:-99999px'; document.body.appendChild(c); return c; };
    window.LOOK = { aspect: '9:16', preset: 'kurz', visual: 'scenes', anim: '2d', aiImages: false, sfx: false, music: 'none', textHook: fix.textHook || '' };
    window.within = (p, ms) => Promise.race([p.then((v) => ({ done: true, v }), (e) => ({ done: true, err: String(e && e.message || e) })), new Promise((r) => setTimeout(() => r({ done: false }), ms))]);
    localStorage.setItem('vts.ap.settings', JSON.stringify({ enabled: false, method: 'buffer', leadMin: 40 }));
    localStorage.setItem('vts.ap.sec.bufferKey', 'BUFKEY'); localStorage.setItem('vts.ap.sec.githubToken', 'GHTOKEN'); localStorage.setItem('vts.ap.ghRepo', JSON.stringify('pedro/qb-media'));
    localStorage.setItem('vts.ap.bufferChannel', JSON.stringify({ id: 'a'.repeat(24), name: 'Quiet Brain', service: 'youtube', organizationId: 'b'.repeat(24) }));
  }, FIX);

  // 1) Live (MediaRecorder) render: Android suspends/interrupts the AudioContext in the background -> clock freezes.
  const t1 = await page.evaluate(async (hang) => {
    const buf = await mkBuf(8); const ac = VTS.render.audioCtx(); const realResume = ac.resume.bind(ac); let maxP = 0; const t0 = Date.now();
    setTimeout(() => { ac.resume = () => Promise.resolve(); ac.suspend(); }, 2500);
    const r = await within(VTS.render.renderVideo({ canvas: mkCanvas(), buffer: buf, beats: FIX.beats, look: LOOK, format: 'auto', maxSeconds: 59, stallMs: 5000, onProgress: (p) => { maxP = Math.max(maxP, p); } }), hang);
    ac.resume = realResume; await realResume(); return Object.assign(r, { maxP: Math.round(maxP * 100), s: Math.round((Date.now() - t0) / 1000) });
  }, HANG_MS);
  ok('live render with frozen audio clock fails fast (was: stuck at N% forever)', t1.done && /audio clock stopped/.test(t1.err || ''), t1);

  // 2) AudioContext.resume() that never settles (no user gesture / background) -> live render must not wait forever.
  const t2 = await page.evaluate(async (hang) => {
    const buf = await mkBuf(6); const ac = VTS.render.audioCtx(); await ac.suspend(); const realResume = ac.resume.bind(ac); ac.resume = () => new Promise(() => {}); const t0 = Date.now();
    const r = await within(VTS.render.renderVideo({ canvas: mkCanvas(), buffer: buf, beats: FIX.beats, look: LOOK, format: 'auto', maxSeconds: 59 }), hang);
    ac.resume = realResume; await realResume(); return Object.assign(r, { s: Math.round((Date.now() - t0) / 1000) });
  }, HANG_MS);
  ok('live render when audio cannot start fails fast (was: await resume() forever)', t2.done && /audio could not start/.test(t2.err || ''), t2);

  // 3) WebCodecs: hardware encoder reclaimed mid-render (error callback, queue never drains) -> software retry.
  const t3 = await page.evaluate(async (hang) => {
    const Real = window.VideoEncoder; let reclaimed = 0;
    class Flaky { constructor(init) { this.init = init; this.real = new Real(init); this.n = 0; this.dead = false; this.ondequeue = null; }
      static isConfigSupported(c) { return Real.isConfigSupported(c); }
      configure(c) { this.hw = c.hardwareAcceleration !== 'prefer-software'; this.real.configure(c); }
      get encodeQueueSize() { return this.dead ? 10 : this.real.encodeQueueSize; } get state() { return this.dead ? 'configured' : this.real.state; }
      encode(f, o) { if (this.hw && ++this.n === 40) { this.dead = true; reclaimed++; setTimeout(() => this.init.error(new DOMException('Codec reclaimed due to inactivity.', 'QuotaExceededError')), 10); } if (!this.dead) this.real.encode(f, o); }
      addEventListener(t, f, o) { if (!this.dead) this.real.addEventListener(t, f, o); } removeEventListener(t, f) { this.real.removeEventListener(t, f); }
      flush() { return this.dead ? new Promise(() => {}) : this.real.flush(); } close() { try { this.real.close(); } catch (_) {} } }
    window.VideoEncoder = Flaky; const t0 = Date.now(); const diags = [];
    const buf = await mkBuf(6);
    const r = await within(VTS.encode.renderOffline({ canvas: mkCanvas(), buffer: buf, beats: FIX.beats, look: LOOK, maxSeconds: 59, stallMs: 4000, onDiag: (d) => diags.push(d.event) }), hang);
    window.VideoEncoder = Real;
    let info = null; if (r.v && r.v.blob) { const i = await VTS.encode.blobInfo(r.v.blob); info = { dur: Math.round(i.duration * 10) / 10, ok: VTS.encode.checkShort(i, 59.9).ok }; }
    return { done: r.done, err: r.err, reclaimed, retry: r.v && r.v.encoderRetry, info, diags, s: Math.round((Date.now() - t0) / 1000) };
  }, HANG_MS);
  ok('WebCodecs encoder reclaimed mid-render -> software retry, valid MP4 (was: waiting for dequeue forever)', t3.done && !t3.err && t3.info && t3.info.ok && /Codec reclaimed|no progress/.test(t3.retry || ''), t3);

  // 4) Fencing: a stalled render whose late result arrives after the watchdog stopped it must not upload/schedule.
  seen.length = 0;
  const t4 = await page.evaluate(async () => {
    const C = VTS.apcore; if (!C.LIMITS.stage) return { skip: 'no stage limits' }; const keep = C.LIMITS.noProgressMs; C.LIMITS.noProgressMs = 2000; const mk = VTS.makeShortHeadless;
    VTS.makeShortHeadless = (it, h) => new Promise((res) => { h.onStep('script'); h.onStep('voice'); h.onStep('render'); h.onProgress(0.31); setTimeout(() => res({ pkg: Object.assign({ title: 'late' }, FIX), blob: new Blob(['late']), mime: 'video/mp4', duration: 30, how: 'stub' }), 9000); });
    const t0 = Date.now(); await VTS.autopilot.runSlot({ id: '2026-11-07T09:00', time: '09:00', at: Date.now() + 2400000, runAt: Date.now() }, 'test'); const took = Date.now() - t0;
    await new Promise((r) => setTimeout(r, 6000)); VTS.makeShortHeadless = mk; C.LIMITS.noProgressMs = keep;
    const e = VTS.autopilot.getLog().find((x) => x.slot === '2026-11-07T09:00'); return { status: e.status, error: e.error, took, stages: Object.keys(e.stages || {}) };
  });
  ok('stalled render stopped by no-progress watchdog with stage diagnostics', t4.status === 'retrying' && /no progress/.test(t4.error) && /31%/.test(t4.error) && /render/.test(t4.error) && t4.took < 9000, t4);
  ok('late result of the stopped run did not upload or schedule (generation fence)', !seen.includes('ghup') && !seen.includes('buffer:createPost'), seen);

  // 5) Watchdog recovery supersedes a hung run; its late success must be dropped and must not reset the new run's state.
  seen.length = 0;
  const t5 = await page.evaluate(async () => {
    const C = VTS.apcore; if (!C.LIMITS.stage) return { skip: 1 }; const keep = [C.LIMITS.slotMs, C.LIMITS.noProgressMs]; C.LIMITS.slotMs = 2000; C.LIMITS.noProgressMs = 1e9; const mk = VTS.makeShortHeadless;
    VTS.makeShortHeadless = (it, h) => new Promise((res) => { h.onStep('script'); setTimeout(() => res({ pkg: Object.assign({ title: 'late' }, FIX), blob: new Blob(['late']), mime: 'video/mp4', duration: 30, how: 'stub' }), 6000); });
    const p = VTS.autopilot.runSlot({ id: '2026-11-07T11:00', time: '11:00', at: Date.now() + 2400000, runAt: Date.now() }, 'test');
    await new Promise((r) => setTimeout(r, 3000)); VTS.autopilot.recover();
    const after = VTS.autopilot.getLog().find((x) => x.slot === '2026-11-07T11:00');
    await p; await new Promise((r) => setTimeout(r, 4000)); VTS.makeShortHeadless = mk; C.LIMITS.slotMs = keep[0]; C.LIMITS.noProgressMs = keep[1];
    const fin = VTS.autopilot.getLog().find((x) => x.slot === '2026-11-07T11:00'); return { afterRecover: after.status, final: fin.status, error: fin.error };
  });
  ok('watchdog marks hung run failed; late success discarded', t5.afterRecover === 'failed' && t5.final === 'failed' && /Watchdog/.test(t5.error) && !seen.includes('ghup') && !seen.includes('buffer:createPost'), Object.assign({ seen }, t5));

  ok('no page errors', errors.length === 0, errors);
  await browser.close(); srv.close();
  const pass = results.filter(Boolean).length; console.log('\n' + pass + ' / ' + results.length + ' passed'); process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
