// v1.11.6 Autopilot: (1) an app freeze (phone asleep / Android paused the WebView) in the middle of a render no longer
// gets the run killed the moment the app wakes: budgets count active time, the render continues, and the log shows how
// long the app was frozen (1.11.5 showed the stale "58s in background" and stopped it as "stuck at 3%").
// (2) checkpoint + resume: a retry re-uses the saved script + voice, or the finished video, instead of starting over.
// Usage: node tests/freeze-resume-e2e.js      (WWW_DIR=/path/to/old/www to run against an older build)
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path');
const WWW = process.env.WWW_DIR || path.join(__dirname, '..', 'www'); const FIX = require('./fixtures/brain-vs-me.json');
const results = []; const ok = (n, c, x) => { results.push(!!c); console.log(c ? 'PASS' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x)); };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = path.join(WWW, p);
  if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  const seen = []; global.ghStatus = 201;
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url()); const j = (st, b) => req.respond({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(b) });
    if (req.method() === 'OPTIONS' && !/127\.0\.0\.1/.test(u.host)) return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.hostname === 'api.buffer.com') { const b = JSON.parse(req.postData());
      if (/createPost/.test(b.query)) { seen.push('buffer:createPost'); return j(200, { data: { createPost: { post: { id: 'P1', dueAt: b.variables.input.dueAt, status: 'scheduled' } } } }); }
      return j(200, { data: { posts: { edges: [] } } }); }
    if (u.hostname === 'api.github.com') return req.method() === 'GET' ? j(200, { id: 9 }) : j(201, { id: 9 });
    if (u.hostname === 'uploads.github.com') { seen.push('ghup:' + global.ghStatus); return global.ghStatus === 201 ? j(201, { browser_download_url: 'https://github.com/x/y/releases/download/t/' + u.searchParams.get('name') }) : j(global.ghStatus, { message: 'Bad credentials' }); }
    if (u.hostname === 'generativelanguage.googleapis.com') return j(500, { error: { message: 'should be stubbed' } });
    req.continue();
  });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('vts.apiKey', 'AIzaTEST'); });
  await page.goto('http://127.0.0.1:' + srv.address().port + '/'); await page.waitForFunction(() => window.VTS && VTS.autopilot && VTS.makeShortHeadless && VTS.encode);
  await page.evaluate((fix) => {
    window.calls = { script: 0, voice: 0 };
    VTS.shortgen.generatePackage = async () => { calls.script++; return Object.assign({ script: fix.beats.map((b) => b.text).join(' '), title: 'Your brain at 3 a.m. be like', description: 'Rumination, explained.', hashtags: ['#Shorts'], hooks: [fix.textHook] }, fix); };
    VTS.gemini.generateSpeech = VTS.gemini.generateDialogueSpeech = async () => { calls.voice++; const sr = 24000; const n = sr * 8; const pcm = new Int16Array(n); for (let i = 0; i < n; i++) pcm[i] = Math.sin(i / 8) * 6000 * (Math.floor(i / 6000) % 2);
      const w = VTS.gemini.pcmToWav([new Uint8Array(pcm.buffer)], sr, 1); return { blob: w instanceof Blob ? w : new Blob([w], { type: 'audio/wav' }), model: 'stub' }; };
    localStorage.setItem('vts.ap.settings', JSON.stringify({ enabled: false, method: 'buffer', leadMin: 40 }));
    localStorage.setItem('vts.ap.sec.bufferKey', 'BUFKEY'); localStorage.setItem('vts.ap.sec.githubToken', 'GHTOKEN'); localStorage.setItem('vts.ap.ghRepo', JSON.stringify('pedro/qb-media'));
    localStorage.setItem('vts.ap.bufferChannel', JSON.stringify({ id: 'a'.repeat(24), name: 'Quiet Brain', service: 'youtube', organizationId: 'b'.repeat(24) }));
    window.slot = (id) => { const now = Date.now(); return { id, time: new Date(now + 600000 + 330 * 60000).toISOString().slice(11, 16), at: now + 10 * 60000, runAt: now }; };
  }, FIX);

  // 1) 41-minute freeze in the middle of the render (modelled by moving the clock forward 41 min at ~25 % progress:
  //    to the page that is exactly what a frozen-then-thawed app sees).
  const f = await page.evaluate(async () => {
    const realNow = Date.now.bind(Date); let off = 0; Date.now = () => realNow() + off;
    const R0 = VTS.encode.renderOffline; let froze = false;
    VTS.encode.renderOffline = (o) => R0(Object.assign({}, o, { onProgress: (p, t, T) => { if (!froze && p > 0.25) { froze = true; off = 41 * 60000; } if (o.onProgress) o.onProgress(p, t, T); } }));
    await VTS.autopilot.runSlot(slot('manual-freeze'), 'manual');
    VTS.encode.renderOffline = R0; Date.now = realNow;
    const e = VTS.autopilot.getLog().find((x) => x.slot === 'manual-freeze'); return { status: e.status, error: e.error, frozenMs: e.frozenMs, diag: e.diag, froze };
  });
  ok('41-min freeze mid-render: run continues and is scheduled (was: killed as "no progress / stuck at N%")', f.froze && f.status === 'scheduled', f);
  ok('log row records how long the app was frozen', f.frozenMs >= 40 * 60000 && (f.diag || []).some((d) => /app was frozen 41m/.test(d)), { frozenMs: f.frozenMs, diag: f.diag });

  // 2) checkpoint: render fails for good after script + voice -> retry re-uses script + voice (no new Gemini calls)
  const c1 = await page.evaluate(async () => {
    const R0 = VTS.encode.renderOffline; const V0 = VTS.render.renderVideo; const c0 = Object.assign({}, calls);
    VTS.encode.renderOffline = async () => { throw Object.assign(new Error('Render stalled: test encoder died'), { encoderStall: true }); };
    VTS.render.renderVideo = async () => { throw Object.assign(new Error('Render stalled: test recorder died'), { renderStall: true }); };
    await VTS.autopilot.runSlot(slot('manual-ckpt'), 'manual');
    VTS.encode.renderOffline = R0; VTS.render.renderVideo = V0;
    const e1 = VTS.autopilot.getLog().find((x) => x.slot === 'manual-ckpt');
    const a = { status: e1.status, checkpoint: e1.checkpoint, projectId: !!e1.projectId, script: calls.script - c0.script, voice: calls.voice - c0.voice };
    await VTS.autopilot.runSlot(slot('manual-ckpt'), 'manual');
    const e2 = VTS.autopilot.getLog().find((x) => x.slot === 'manual-ckpt');
    return { first: a, second: { status: e2.status, error: e2.error, checkpoint: e2.checkpoint, diag: e2.diag, script: calls.script - c0.script, voice: calls.voice - c0.voice } };
  });
  ok('render failure keeps the script + voice checkpoint', c1.first.status === 'retrying' && c1.first.checkpoint === 'script + voice' && c1.first.projectId && c1.first.script === 1 && c1.first.voice >= 1, c1.first);
  ok('retry re-uses script + voice: no new script/voice calls, renders and schedules', c1.second.status === 'scheduled' && c1.second.script === 1 && c1.second.voice === c1.first.voice && (c1.second.diag || []).some((d) => /re-using script \+ voice/.test(d)), c1.second);

  // 3) upload fails after a good render -> retry re-uses the finished video (no re-render)
  global.ghStatus = 401;
  const c2 = await page.evaluate(async () => {
    const c0 = Object.assign({}, calls); let renders = 0; const R0 = VTS.encode.renderOffline; VTS.encode.renderOffline = (o) => { renders++; return R0(o); };
    await VTS.autopilot.runSlot(slot('manual-up'), 'manual');
    const e1 = VTS.autopilot.getLog().find((x) => x.slot === 'manual-up'); const a = { status: e1.status, checkpoint: e1.checkpoint, renders };
    window.__go = true; return { a, c0 };
  });
  global.ghStatus = 201;
  const c3 = await page.evaluate(async (c0) => {
    let renders = 0; const R0 = VTS.encode.renderOffline; VTS.encode.renderOffline = (o) => { renders++; return R0(o); };
    await VTS.autopilot.runSlot(slot('manual-up'), 'manual'); VTS.encode.renderOffline = R0;
    const e2 = VTS.autopilot.getLog().find((x) => x.slot === 'manual-up');
    return { status: e2.status, error: e2.error, renders, renderer: e2.renderer, script: calls.script - c0.script, diag: e2.diag };
  }, c2.c0);
  ok('upload failure keeps the finished-video checkpoint', c2.a.checkpoint === 'video' && c2.a.renders === 1, c2.a);
  ok('retry re-uses the rendered video: no re-render, no new script, scheduled', c3.status === 'scheduled' && c3.renders === 0 && c3.script === 1 && /re-used from earlier try/.test(c3.renderer || ''), c3);
  ok('no page errors', !errors.length, errors);
  await browser.close(); srv.close();
  console.log('\n' + results.filter(Boolean).length + ' / ' + results.length + ' passed'); process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
