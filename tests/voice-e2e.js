// Deterministic reproduction of the "[at voice]" stall: Gemini TTS requests that never answer.
// Shows the old model-fallback chain stacking one full timeout per model, and checks the capped Autopilot voice path.
// Usage: node tests/voice-e2e.js   (FULL=0 skips the ~3.5 min end-to-end Autopilot run)
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path');
const WWW = path.join(__dirname, '..', 'www'); const FIX = require('./fixtures/brain-vs-me.json');
const results = []; const ok = (n, c, x) => { results.push(!!c); console.log(c ? 'PASS' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x)); };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = path.join(WWW, p);
  if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  const tts = []; const seen = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url()); const j = (st, b) => req.respond({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(b) });
    if (req.method() === 'OPTIONS' && !/127\.0\.0\.1/.test(u.host)) return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.hostname === 'generativelanguage.googleapis.com') {
      if (/\/models$/.test(u.pathname) || u.pathname.endsWith('/models')) return j(200, { models: ['gemini-9-flash-tts', 'gemini-9-lite-tts', 'gemini-8-flash-tts', 'gemini-8-lite-tts'].map((n) => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) });
      tts.push({ model: decodeURIComponent(u.pathname.split('/models/')[1] || '').split(':')[0], at: Date.now() }); return; // never answer (hung TTS)
    }
    if (u.hostname === 'api.buffer.com') { const b = JSON.parse(req.postData()); if (/createPost/.test(b.query)) seen.push('createPost'); return j(200, { data: { posts: { edges: [] } } }); }
    if (/github\.com$/.test(u.hostname)) { seen.push('gh'); return j(500, {}); }
    req.continue();
  });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('vts.apiKey', 'AIzaTEST'); });
  await page.goto('http://127.0.0.1:' + srv.address().port + '/'); await page.waitForFunction(() => window.VTS && VTS.autopilot && VTS.gemini && VTS.makeShortHeadless);

  // A) Uncapped chain (what 1.11.3/1.11.4 Autopilot used): every model times out in turn, then 4 discovered models.
  tts.length = 0;
  const a = await page.evaluate(async () => { const t0 = Date.now(); try { await VTS.gemini.generateSpeech('Short test line for the voice.', { voice: 'Kore', timeout: 300 }); return { err: null }; } catch (e) { return { err: e.message, ms: Date.now() - t0 }; } });
  const aReq = tts.length;
  ok('uncapped TTS chain makes one full-timeout request per model (' + aReq + ' requests per chunk)', aReq >= 9, { a, models: tts.map((x) => x.model) });
  console.log('   => with the production timeouts (dialogue 60 s per model, then single voice 120 s per model) one chunk can take up to ' + Math.round((aReq * 60 + aReq * 120) / 60) + ' min, past the 19 min (1.11.3) and 4 min voice (1.11.4) limits');

  // B) Capped: maxTimeouts 2 -> exactly 2 requests, clear actionable error, flagged not-retry-in-run.
  tts.length = 0;
  const b = await page.evaluate(async () => { try { await VTS.gemini.generateSpeech('Short test line for the voice.', { voice: 'Kore', timeout: 300, maxTimeouts: 2 }); return {}; } catch (e) { return { msg: e.message, voiceTimeout: !!e.voiceTimeout, noRetry: !!e.noRetry, retriable: VTS.apcore.isRetriable(e) }; } });
  ok('capped TTS: 2 requests then "Gemini voice did not answer" with per-model timings', tts.length === 2 && /did not answer: 2 requests timed out/.test(b.msg || '') && /0s/.test(b.msg) && b.voiceTimeout && b.retriable === false, Object.assign({ requests: tts.length }, b));

  // C) Deadline also caps it.
  tts.length = 0;
  const c = await page.evaluate(async () => { try { await VTS.gemini.generateSpeech('x y z', { voice: 'Kore', timeout: 400, deadline: Date.now() + 600 }); return {}; } catch (e) { return { msg: e.message }; } });
  ok('voice deadline stops the chain', tts.length <= 2 && /time budget/.test(c.msg || ''), Object.assign({ requests: tts.length }, c));

  // D) Outer abort cancels the in-flight request immediately (was: ran on until its own timeout).
  tts.length = 0;
  const d = await page.evaluate(async () => { const ac = new AbortController(); setTimeout(() => ac.abort(), 300); const t0 = Date.now(); try { await VTS.gemini.generateSpeech('x', { voice: 'Kore', timeout: 60000, signal: ac.signal }); return {}; } catch (e) { return { msg: e.message, aborted: !!e.aborted, ms: Date.now() - t0 }; } });
  ok('abort signal cancels the TTS request at once', d.aborted && d.ms < 2000 && tts.length === 1, Object.assign({ requests: tts.length }, d));

  ok('build version shown in Settings and matches package.json', await page.evaluate((v) => VTS.autopilot.BUILD === v && /^v/.test(document.getElementById('ap-state').textContent) && document.getElementById('ap-state').textContent.includes('v' + v), require_v()), null);

  // E) Full Autopilot run with hung TTS (real timeouts): voice fails clearly in ~3.5 min, no upload, build stamped.
  if (process.env.FULL !== '0') {
    tts.length = 0; seen.length = 0;
    const e = await page.evaluate(async (fix) => {
      VTS.shortgen.generatePackage = async () => Object.assign({ script: fix.beats.map((x) => x.text).join(' '), title: 'Voice hang test', description: 'd', hashtags: ['#Shorts'] }, fix);
      localStorage.setItem('vts.ap.settings', JSON.stringify({ enabled: false, method: 'buffer', leadMin: 40 }));
      localStorage.setItem('vts.ap.sec.bufferKey', 'BUFKEY'); localStorage.setItem('vts.ap.sec.githubToken', 'GHTOKEN'); localStorage.setItem('vts.ap.ghRepo', JSON.stringify('pedro/qb-media'));
      localStorage.setItem('vts.ap.bufferChannel', JSON.stringify({ id: 'a'.repeat(24), name: 'Quiet Brain', service: 'youtube', organizationId: 'b'.repeat(24) }));
      const t0 = Date.now(); await VTS.autopilot.runSlot({ id: '2026-11-07T16:00', time: '16:00', at: Date.now() + 2400000, runAt: Date.now() }, 'test');
      const r = VTS.autopilot.getLog().find((x) => x.slot === '2026-11-07T16:00'); return { ms: Date.now() - t0, status: r.status, error: r.error, build: r.build, voiceMs: r.stages && r.stages.voice && r.stages.voice.ms, diag: r.diag };
    }, FIX);
    ok('Autopilot with hung TTS: retrying with clear voice error inside the 4 min voice stage, build stamped, nothing uploaded',
      e.status === 'retrying' && /Gemini voice did not answer/.test(e.error) && e.voiceMs < 240000 && e.build && tts.length === 3 && !seen.length, Object.assign({ ttsRequests: tts.length }, e));
  }
  ok('no page errors', errors.length === 0, errors);
  await browser.close(); srv.close();
  const pass = results.filter(Boolean).length; console.log('\n' + pass + ' / ' + results.length + ' passed'); process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
function require_v() { return require('../package.json').version; }
