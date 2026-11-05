// Autopilot end-to-end in headless Chrome, no real network: real render + Buffer mode (mocked Buffer + GitHub)
// and direct-YouTube mode (mocked OAuth refresh + resumable upload). Gemini script/voice are stubbed.
// Usage: node tests/autopilot-e2e.js
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path');
const WWW = path.join(__dirname, '..', 'www'); const FIX = require('./fixtures/brain-vs-me.json');
const results = []; const ok = (n, c, x) => { results.push(!!c); console.log(c ? 'PASS' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x)); };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = path.join(WWW, p);
  if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  const seen = []; let ghBytes = 0; let ytBytes = 0;
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url()); const j = (st, b, h) => req.respond({ status: st, contentType: 'application/json', headers: Object.assign({ 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'Location, Range' }, h || {}), body: JSON.stringify(b) });
    if (req.method() === 'OPTIONS' && !/127\.0\.0\.1/.test(u.host)) return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.hostname === 'api.buffer.com') { const b = JSON.parse(req.postData()); seen.push('buffer:' + (b.query.match(/createPost|posts\(|channels\(|account/) || ['?'])[0]);
      if (/createPost/.test(b.query)) { seen.push(JSON.stringify(b.variables.input)); return j(200, { data: { createPost: { post: { id: 'P1', dueAt: b.variables.input.dueAt, status: 'scheduled' } } } }); }
      if (/posts\(/.test(b.query)) return j(200, { data: { posts: { edges: Array(global.queueN || 3).fill({ node: { id: 'x' } }) } } });
      if (/channels\(/.test(b.query)) return j(200, { data: { channels: [{ id: 'a'.repeat(24), name: 'Quiet Brain', displayName: 'Quiet Brain', service: 'youtube' }] } });
      return j(200, { data: { account: { organizations: [{ id: 'b'.repeat(24), name: 'Pedro' }] } } }); }
    if (u.hostname === 'api.github.com') { seen.push('gh:' + req.method()); return req.method() === 'GET' ? j(404, {}) : j(201, { id: 9 }); }
    if (u.hostname === 'uploads.github.com') { ghBytes = req.hasPostData() ? 1 : 0; seen.push('ghup:' + u.searchParams.get('name')); return j(201, { browser_download_url: 'https://github.com/pedro/qb-media/releases/download/vts-autopilot-media/' + u.searchParams.get('name') }); }
    if (u.hostname === 'oauth2.googleapis.com') { seen.push('yt:refresh'); return j(200, { access_token: 'AT', expires_in: 3600 }); }
    if (u.hostname === 'www.googleapis.com' && req.method() === 'POST') { seen.push('yt:init ' + req.postData()); return j(200, {}, { Location: 'https://www.googleapis.com/upload/session/xyz' }); }
    if (u.hostname === 'www.googleapis.com' && req.method() === 'PUT') { { const m = /\/(\d+)$/.exec(req.headers()['content-range'] || ''); ytBytes = m ? +m[1] : 0; } seen.push('yt:put ' + req.headers()['content-range']); return j(200, { id: 'VID42', status: { privacyStatus: 'public' } }); }
    if (u.hostname === 'generativelanguage.googleapis.com') return j(500, { error: { message: 'should be stubbed' } });
    req.continue();
  });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('vts.apiKey', 'AIzaTEST'); });
  await page.goto('http://127.0.0.1:' + srv.address().port + '/'); await page.waitForFunction(() => window.VTS && VTS.autopilot && VTS.makeShortHeadless && document.getElementById('ap-card'));
  ok('autopilot card is in Settings', await page.$('#ap-card') !== null);
  ok('defaults: Buffer method, 6/day', await page.evaluate(() => { const s = VTS.autopilot.settings(); return s.method === 'buffer' && s.perDay === 6 && s.times.join() === '09:00,11:00,13:00,16:00,19:00,21:00'; }));
  // stub Gemini script + voice (6 s of tone) so the real renderer runs
  await page.evaluate((fix) => {
    VTS.shortgen.generatePackage = async () => Object.assign({ script: fix.beats.map((b) => b.text).join(' '), title: 'Your brain at 3 a.m. be like', description: 'Rumination, explained.', hashtags: ['#Shorts', '#psychology'], hooks: [fix.textHook] }, fix);
    VTS.gemini.generateSpeech = VTS.gemini.generateDialogueSpeech = async () => { const sr = 24000; const n = sr * 6; const pcm = new Int16Array(n); for (let i = 0; i < n; i++) pcm[i] = Math.sin(i / 8) * 6000 * (Math.floor(i / 6000) % 2);
      return { blob: (function(){ const w = VTS.gemini.pcmToWav([new Uint8Array(pcm.buffer)], sr, 1); return w instanceof Blob ? w : new Blob([w], { type: "audio/wav" }); })(), model: 'stub' }; };
    localStorage.setItem('vts.ap.settings', JSON.stringify({ enabled: false, method: 'buffer', leadMin: 40 }));
    localStorage.setItem('vts.ap.sec.bufferKey', 'BUFKEY'); localStorage.setItem('vts.ap.sec.githubToken', 'GHTOKEN'); localStorage.setItem('vts.ap.ghRepo', JSON.stringify('pedro/qb-media'));
    localStorage.setItem('vts.ap.bufferChannel', JSON.stringify({ id: 'a'.repeat(24), name: 'Quiet Brain', service: 'youtube', organizationId: 'b'.repeat(24) }));
  }, FIX);
  const t0 = Date.now();
  const slotAt = Date.now() + 40 * 60000;
  const r1 = await page.evaluate(async (at) => { await VTS.autopilot.runSlot({ id: '2026-11-05T09:00', time: '09:00', at, runAt: at - 2400000 }, 'test'); return VTS.autopilot.getLog()[0]; }, slotAt);
  ok('Buffer mode: slot scheduled', r1.status === 'scheduled', { status: r1.status, error: r1.error, ms: Date.now() - t0 });
  ok('Buffer mode: queue checked before render, then GitHub upload, then createPost', seen.join('|').includes('buffer:posts(') && seen.some((s) => s.startsWith('ghup:short-')) && seen.includes('buffer:createPost'), seen.filter((s) => !s.startsWith('{')));
  const input = JSON.parse(seen.find((s) => s.startsWith('{')) || '{}');
  ok('Buffer post: customScheduled at slot, YouTube cat 24, public, not for kids, not AI', input.mode === 'customScheduled' && Math.abs(Date.parse(input.dueAt) - slotAt) < 1000 && input.metadata.youtube.categoryId === '24' && input.metadata.youtube.privacy === 'public' && input.metadata.youtube.madeForKids === false && input.metadata.youtube.isAiGenerated === false, input.metadata && input.metadata.youtube);
  const vsize = await page.evaluate(async () => { const p = (await VTS.db.all()).find((x) => x.autopilot && x.video); return p ? p.video.size : 0; });
  ok('rendered video (real render) was sent to the host', ghBytes === 1 && vsize > 20000, vsize);
  ok('library got the autopilot project', await page.evaluate(async () => (await VTS.db.all()).some((p) => p.autopilot && p.video && p.video.size > 0)));
  // queue full -> deferred, no render
  const before = seen.length;
  const r2 = await page.evaluate(async () => { const s = JSON.parse(localStorage.getItem('vts.ap.settings')); s.bufferLimit = 3; localStorage.setItem('vts.ap.settings', JSON.stringify(s)); await VTS.autopilot.runSlot({ id: '2026-11-05T11:00', time: '11:00', at: Date.now() + 2400000, runAt: Date.now() }, 'test'); return VTS.autopilot.getLog().find((e) => e.slot === '2026-11-05T11:00'); });
  ok('Buffer queue full -> deferred with retry time, nothing rendered/uploaded', r2.status === 'deferred' && !!r2.nextRetryAt && !seen.slice(before).some((s) => s.startsWith('ghup')), r2);
  // direct YouTube mode
  const r3 = await page.evaluate(async () => {
    localStorage.setItem('vts.ap.settings', JSON.stringify({ enabled: false, method: 'youtube' }));
    localStorage.setItem('vts.ap.clientId', JSON.stringify('123-abc.apps.googleusercontent.com')); localStorage.setItem('vts.ap.sec.refreshToken', 'RT'); localStorage.setItem('vts.ap.sec.clientSecret', 'SEC');
    await VTS.autopilot.runSlot({ id: '2026-11-05T13:00', time: '13:00', at: Date.now(), runAt: Date.now() }, 'test'); return VTS.autopilot.getLog().find((e) => e.slot === '2026-11-05T13:00');
  });
  ok('YouTube mode: posted with Shorts URL', r3.status === 'posted' && r3.videoUrl === 'https://youtube.com/shorts/VID42', r3);
  const init = seen.find((s) => s.startsWith('yt:init ')); const meta = init ? JSON.parse(init.slice(8)) : {};
  ok('YouTube init: public, madeForKids false, synthetic false, #shorts title', meta.status && meta.status.privacyStatus === 'public' && meta.status.selfDeclaredMadeForKids === false && meta.status.containsSyntheticMedia === false && /#shorts/.test(meta.snippet.title), meta.status);
  ok('YouTube: video bytes uploaded', ytBytes > 20000, ytBytes);
  ok('quota display counts the upload', await page.evaluate(() => VTS.apcore.quotaLeft(Date.now(), VTS.autopilot.getLog()).uploads === 5));
  // failure path: Gemini 503 is retried by withRetry then logged as retrying
  const r4 = await page.evaluate(async () => {
    VTS.shortgen.generatePackage = async () => { const e = new Error('The model is overloaded'); e.status = 503; throw e; };
    const orig = VTS.apcore.backoffMs; VTS.apcore.backoffMs = () => 5;
    await VTS.autopilot.runSlot({ id: '2026-11-05T16:00', time: '16:00', at: Date.now(), runAt: Date.now() }, 'test'); VTS.apcore.backoffMs = orig;
    return VTS.autopilot.getLog().find((e) => e.slot === '2026-11-05T16:00');
  });
  ok('Gemini 503 -> retrying with nextRetryAt', r4.status === 'retrying' && !!r4.nextRetryAt, { status: r4.status, error: r4.error });
  ok('log UI renders entries', await page.evaluate(() => document.querySelectorAll('#ap-log .ap-row').length >= 4));
  ok('no page errors', errors.length === 0, errors);
  await browser.close(); srv.close();
  const pass = results.filter(Boolean).length; console.log('\n' + pass + ' / ' + results.length + ' passed'); process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
