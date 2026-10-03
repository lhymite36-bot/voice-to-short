// LIVE full-UI check of "Write my Short" in headless Chrome with GEMINI_API_KEY (never printed).
// Usage: RUNS=3 node tests/live/ui-live.js [format] [humour] [length] [tone]
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path');
const WWW = path.join(__dirname, '../../www'); const KEY = process.env.GEMINI_API_KEY;
const [format = 'brain-like', humour = '3', length = '120', tone = ''] = process.argv.slice(2); const RUNS = Number(process.env.RUNS || 3);
const red = (s) => String(s).split(KEY).join('REDACTED');
const srv = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = path.join(WWW, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } const t = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' }[path.extname(f)]; res.writeHead(200, t ? { 'content-type': t } : {}); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise((r) => srv.listen(0, r)); const O = 'http://127.0.0.1:' + srv.address().port;
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage(); await page.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((k) => { if (!localStorage.getItem('vts.apiKey')) { localStorage.setItem('vts.apiKey', k); localStorage.setItem('vts.aspect', '"9:16"'); } }, KEY);
  const calls = []; const pageErrs = [];
  page.on('pageerror', (e) => pageErrs.push(red(e.message))); page.on('dialog', (d) => d.accept());
  page.on('response', async (r) => { const u = r.url(); if (!/generateContent/.test(u) || r.request().method() !== 'POST') return; const m = u.split('/models/')[1].split(':')[0]; let fin = null; let chars = 0; let block = null;
    try { const d = await r.json(); const c = d.candidates && d.candidates[0]; fin = c && c.finishReason; block = d.promptFeedback && d.promptFeedback.blockReason; chars = c && c.content && c.content.parts ? c.content.parts.filter((p) => !p.thought).map((p) => p.text || '').join('').length : 0; } catch (_) {}
    calls.push({ m, s: r.status(), fin, chars, block }); });
  await page.goto(process.env.BASE || (O + '/')); await page.waitForSelector('#idea');
  const all = [];
  for (let run = 1; run <= RUNS; run++) {
    calls.length = 0; const t0 = Date.now();
    if (run > 1) { await page.evaluate(() => document.querySelector('#new-project').click()); await page.waitForSelector('#idea'); }
    await page.evaluate((format, humour, length, tone) => {
      const set = (id, v, ev) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event(ev || 'change', { bubbles: true })); };
      if (tone) { const b = document.querySelector('#tone-seg [data-v="' + tone + '"]'); if (b) b.click(); }
      document.querySelector('#platform-seg [data-v="both"]').click(); // platform preset first (it sets 60 s), then her choices
      set('opt-template', format); set('opt-humour', humour, 'input'); set('opt-humour', humour, 'change'); set('opt-length', length);
      const idea = document.getElementById('idea'); idea.value = 'Your social battery hitting 3% in the middle of a party'; idea.dispatchEvent(new Event('input', { bubbles: true }));
    }, format, humour, length, tone);
    const settings = await page.evaluate(() => { const P = window.VTS.app.project; return { tone: P.tone, format: P.template, humour: P.humour, platform: P.platform, length: P.length || document.getElementById('opt-length').value, aspect: P.look && P.look.aspect }; });
    await page.evaluate(() => document.querySelector('#generate').click());
    const texts = new Set(); let outcome = null;
    while (Date.now() - t0 < 480000) {
      await new Promise((r) => setTimeout(r, 1000));
      const st = await page.evaluate(() => ({ ok: !document.getElementById('script-body').classList.contains('hidden') && !!(window.VTS.app.project.pkg), err: (document.getElementById('gen-status').className.includes('err') && document.getElementById('gen-status').textContent) || '', lt: (document.getElementById('script-loading-text') || {}).textContent || '' }));
      if (st.lt) texts.add(st.lt);
      if (st.ok) { outcome = 'ok'; break; } if (st.err) { outcome = 'ERROR: ' + red(st.err); break; }
    }
    const pkg = await page.evaluate(() => { const p = window.VTS.app.project.pkg; return p ? { words: window.VTS.shortgen.wordCount(p.script), beats: p.beats.length, textHook: p.textHook, tt: !!p.tiktokCaption, ytTags: (p.hashtags || []).length, cta: p.cta, brainLines: p.beats.filter((b) => b.speaker === 'brain').length, info: p.genInfo } : null; });
    const r = { run, settings, outcome: outcome || 'TIMEOUT', secs: Math.round((Date.now() - t0) / 1000), pkg, calls: calls.slice(), loading: Array.from(texts) };
    all.push(r); console.log(JSON.stringify(r));
    if (run < RUNS) await new Promise((r2) => setTimeout(r2, Number(process.env.GAP || 20000)));
  }
  console.log('pageErrors', JSON.stringify(pageErrs)); console.log('SUMMARY', all.filter((r) => r.outcome === 'ok').length + '/' + all.length + ' ok');
  await browser.close(); srv.close();
})();
