// v1.7 Comic Recap UI test in headless Chrome (no network: Gemini is mocked and only used for the "Write the recap" path).
// Mode switch, multi-select upload, reorder/remove, own script, Gemini (mocked vision) script, silent voice, preview,
// effects, persistence across reload, library badge, and the default Short mode staying intact. Run: node tests/comic-ui.js
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path');
const WWW = path.join(__dirname, '..', 'www'); const FIX = path.join(__dirname, 'fixtures');
const proj = JSON.parse(fs.readFileSync(path.join(FIX, 'comic-recap.json'), 'utf8'));
const files = proj.panels.map((p) => path.join(FIX, p.file));
let pass = 0; let fail = 0; const ok = (name, cond, extra) => { console.log(cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); if (cond) pass++; else fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function serve() {
  const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.ogg': 'audio/ogg' };
  const srv = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = path.join(WWW, p); if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}
(async () => {
  const srv = await serve(); const ORIGIN = 'http://127.0.0.1:' + srv.address().port;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage(); await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const shot = async (n) => { if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await page.screenshot({ path: path.join(process.env.SHOTS, n + '.png'), fullPage: true }); } };
  const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept());
  // Mock Gemini: a vision request with inline panels -> a scene-by-scene recap JSON.
  let geminiCalls = 0; let sawImages = 0; let promptText = '';
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (!/generativelanguage\.googleapis\.com/.test(u)) { req.continue(); return; }
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
    if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: cors }); return; }
    geminiCalls++;
    let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (_) { /* ignore */ }
    const parts = (body.contents && body.contents[0] && body.contents[0].parts) || [];
    const imgs = parts.filter((p) => p.inlineData).length; if (imgs) { sawImages = imgs; promptText = parts.filter((p) => p.text).map((p) => p.text).join('\n'); }
    const out = { title: 'The Council framed its own hero', hook: 'The Council just sentenced its own hero.', panels: proj.panels.map((p, k) => ({ panel: k + 1, lines: p.lines, focus_x: 0.5, focus_y: 0.4, impact: !!p.impact, sfx: p.sfx || '' })), description: 'A hero framed. A partner betrayed.', hashtags: ['#comics', '#comicrecap', '#storytime'], tiktok_caption: 'He was framed 😳' };
    req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] }, finishReason: 'STOP' }], usageMetadata: {} }) });
  });
  await page.goto(ORIGIN + '/'); await page.waitForFunction(() => window.VTS && window.VTS.app && window.VTS.app.project);
  await page.evaluate(() => localStorage.setItem('vts.apiKey', 'AQ.FAKE_comic_ui_test_key_123456'));
  // Default mode is untouched
  let st = await page.evaluate(() => ({ mode: window.VTS.app.project.mode, on: document.querySelector('#mode-seg button.on').dataset.v, ideaVisible: !!document.getElementById('idea').offsetParent, genVisible: !!document.getElementById('generate').offsetParent, comicHidden: !document.getElementById('comic-generate').offsetParent, step1: document.querySelector('.step[data-step=idea] span').textContent }));
  ok('default project is a Voice Short with the usual idea step', st.mode === 'short' && st.on === 'short' && st.ideaVisible && st.genVisible && st.comicHidden && st.step1 === 'Idea', st);
  // Switch to Comic Recap
  await page.click('#mode-seg button[data-v=comic]'); await sleep(200);
  st = await page.evaluate(() => ({ mode: window.VTS.app.project.mode, cap: window.VTS.app.project.look.captionStyle, ideaHidden: !document.getElementById('idea').offsetParent, addVisible: !!document.getElementById('comic-add').offsetParent, step1: document.querySelector('.step[data-step=idea] span').textContent }));
  ok('Comic Recap tab switches the create flow', st.mode === 'comic' && st.cap === 'comic' && st.ideaHidden && st.addVisible && st.step1 === 'Panels', st);
  // Multi-select upload (8 panels + 1 extra to remove)
  const input = await page.$('#comic-files'); await input.uploadFile(...files, files[0]);
  await page.waitForFunction(() => document.querySelectorAll('#comic-grid li').length === 9, { timeout: 30000 });
  ok('multi-select adds every picked image as a panel', true);
  st = await page.evaluate(() => window.VTS.app.project.comic.panels.map((p) => [p.w, p.h, p.blob && p.blob.type]));
  ok('panels are stored as downscaled JPEGs (≤1600 px)', st.every(([w, h, t]) => Math.max(w, h) <= 1600 && t === 'image/jpeg'), st.slice(0, 3));
  // files are sorted by name, so the duplicate of 01 sits at index 1: remove it
  await page.click('#comic-grid li:nth-child(2) [data-a=x]'); await sleep(150);
  // reorder: move panel 2 right then back left
  const names0 = await page.evaluate(() => window.VTS.app.project.comic.panels.map((p) => p.name));
  await page.click('#comic-grid li:nth-child(2) [data-a=r]'); await sleep(100);
  const names1 = await page.evaluate(() => window.VTS.app.project.comic.panels.map((p) => p.name));
  await page.click('#comic-grid li:nth-child(3) [data-a=l]'); await sleep(100);
  const names2 = await page.evaluate(() => window.VTS.app.project.comic.panels.map((p) => p.name));
  ok('remove + reorder panels', names0.length === 8 && names1[1] === names0[2] && names1[2] === names0[1] && JSON.stringify(names2) === JSON.stringify(names0), { names0, names1 });
  ok('panel order matches the fixture', names0.map((n) => n.replace(/\..*$/, '')).join() === proj.panels.map((p) => path.basename(p.file).replace(/\..*$/, '')).join(), names0);
  await shot('1-panels');
  await page.type('#comic-title', 'The Ember Warden'); await page.click('#comic-len-seg button[data-v="60"]');
  // Own script path
  const hit = await page.evaluate(() => { const b = document.getElementById('comic-own'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { top: el && (el.id || el.className), r: [r.x, r.y, r.width, r.height] }; });
  if (hit.top !== 'comic-own') console.log('note: element over the button', JSON.stringify(hit));
  await page.click('#comic-own'); await sleep(300);
  st = await page.evaluate(() => ({ step: window.VTS.app.project.step, rows: document.querySelectorAll('#comic-lines li').length, hooksHidden: !document.getElementById('hooks').offsetParent, voiceDisabled: document.querySelector('.step[data-step=voice]').disabled }));
  ok('“Write my own script” opens one editor per panel (voice locked until there are lines)', st.step === 'script' && st.rows === 8 && st.hooksHidden && st.voiceDisabled, st);
  const tas = await page.$$('#comic-lines textarea');
  for (let k = 0; k < tas.length; k++) { await tas[k].click(); await page.keyboard.type(proj.panels[k].lines.join('\n')); }
  await sleep(600);
  st = await page.evaluate(() => { const P = window.VTS.app.project; return { beats: P.pkg.beats.length, panelsInBeats: Array.from(new Set(P.pkg.beats.map((b) => b.panel))), script: P.pkg.script.slice(0, 60), hook: P.pkg.hooks[0], stars: /\*/.test(P.pkg.script), badge: document.getElementById('comic-word-badge').textContent }; });
  ok('typed lines become panel-tagged caption beats (stars never reach the voice)', st.beats > 8 && st.panelsInBeats.join() === '0,1,2,3,4,5,6,7' && !st.stars && /^The Council just sentenced/.test(st.hook), st);
  // Gemini (mocked) path: rewrite the recap from the panels
  await page.evaluate(() => { window.VTS.app.showStep('idea'); }); await sleep(100);
  await page.click('#comic-generate');
  await page.waitForFunction(() => !document.getElementById('script-loading').offsetParent && document.querySelectorAll('#comic-lines li').length === 8, { timeout: 60000 });
  st = await page.evaluate(() => { const P = window.VTS.app.project; return { title: P.pkg.title, tags: P.pkg.hashtags, impact: P.comic.panels.map((p) => p.impact ? 1 : 0).join(''), focus: P.comic.panels[0].focus, step: P.step }; });
  ok('“Write the recap” sends every panel image to Gemini (vision) and maps lines per panel', geminiCalls >= 1 && sawImages === 8 && /scene by scene/i.test(promptText) && st.title === 'The Council framed its own hero' && st.impact === '00010001' && st.step === 'script', Object.assign({ geminiCalls, sawImages }, st));
  await shot('2-script');
  // Voice: dramatic default + silent voice
  await page.evaluate(() => window.VTS.app.showStep('voice')); await sleep(200);
  st = await page.evaluate(() => ({ opt0: document.getElementById('ai-style').options[0].textContent, hasDramatic: !!document.querySelector('#ai-style option[value=dramatic]'), v2hidden: document.getElementById('ai-voice2-row').classList.contains('hidden') }));
  ok('voice step offers the dramatic narrator', /Dramatic/.test(st.opt0) && st.hasDramatic && st.v2hidden, st);
  await page.click('#opt-silent'); await page.waitForFunction(() => window.VTS.app.project.voice, { timeout: 10000 });
  // Render pane
  await page.evaluate(() => window.VTS.app.showStep('render'));
  await page.waitForFunction(() => document.getElementById('preview-time').textContent.includes(':'), { timeout: 30000 }); await sleep(1500);
  st = await page.evaluate(() => {
    const cv = document.getElementById('preview'); const x = cv.getContext('2d'); const d = x.getImageData(0, 0, cv.width, cv.height).data; let lit = 0; for (let i = 0; i < d.length; i += 400) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++;
    return { w: cv.width, h: cv.height, lit, fxVisible: !!document.getElementById('comic-fx-card').offsetParent, aspectHidden: !document.getElementById('aspect-seg').offsetParent, animHidden: !document.getElementById('anim-seg').offsetParent, swatches: document.querySelectorAll('#cx-colors button').length, comicCap: document.querySelector('#cap-style button.on').dataset.v, btn: document.querySelector('#render span').textContent };
  });
  ok('render step: 9:16 preview of the comic, effects card, short-only rows hidden', st.w === 540 && st.h === 960 && st.lit > 200 && st.fxVisible && st.aspectHidden && st.animHidden && st.swatches >= 5 && st.comicCap === 'comic' && /comic recap/.test(st.btn), st);
  await shot('3-render');
  await page.click('#cx-colors button[data-v="#3fa9ff"]'); await sleep(300); await page.click('#cx-trans button[data-v=flash]'); await sleep(300);
  st = await page.evaluate(() => window.VTS.app.project.comic.fx);
  ok('effect choices are saved on the project', st.color === '#3fa9ff' && st.transitions === 'flash' && st.glow === true, st);
  // preview frame where panel 4 (impact) is narrated shows the clash panel
  st = await page.evaluate(async () => { const P = window.VTS.app.project; const R = window.VTS.render; const c = document.createElement('canvas'); c.width = 270; c.height = 480; const r = new R.Renderer(c); const buf = R.silentBuffer(Math.max(8, window.VTS.comic.wordCount(P.pkg.script) / 2.5)); const pl = R.plan(buf, 180); r.setup(Object.assign({}, P.look, { visual: 'comic', aspect: '9:16', comic: { panels: P.comic.panels, fx: P.comic.fx }, beats: P.pkg.beats, speechStart: pl.speechStart, speechEnd: pl.speechEnd, duration: pl.total, speech: pl.speech })); await r.prepare(); const segs = r.comic.segs.map((s) => ({ p: s.panel, a: +s.start.toFixed(2), b: +s.end.toFixed(2) })); const tl = r.timeline; const bad = tl.filter((b) => { const s = r.comic.segs.find((q) => b.start + 0.01 >= q.start && b.start + 0.01 < q.end); return !s || s.panel !== b.panel; }).length; return { segs, bad, n: tl.length }; });
  ok('every caption beat is spoken while its own panel is on screen', st.bad === 0 && st.segs.length === 8 && st.segs.map((s) => s.p).join() === '0,1,2,3,4,5,6,7', st);
  // Persistence across reload
  await sleep(800); await page.reload(); await page.waitForFunction(() => window.VTS && window.VTS.app && window.VTS.app.project && window.VTS.app.project.comic, { timeout: 20000 });
  st = await page.evaluate(() => { const P = window.VTS.app.project; return { mode: P.mode, panels: P.comic.panels.length, blob: P.comic.panels[0].blob instanceof Blob, lines: P.comic.panels[3].lines.length, color: P.comic.fx.color, cls: document.getElementById('view-create').classList.contains('mode-comic') }; });
  ok('comic project (panels, lines, effects) survives a reload', st.mode === 'comic' && st.panels === 8 && st.blob && st.lines >= 1 && st.color === '#3fa9ff' && st.cls, st);
  // Library badge
  await page.evaluate(() => window.VTS.app.showView('library')); await page.waitForFunction(() => document.querySelector('#library .badge.comic'), { timeout: 10000 });
  st = await page.evaluate(() => document.querySelector('#library .badge.comic').textContent);
  ok('library shows the recap with a Comic badge', /Comic · 8 panels/.test(st), st);
  // Back to Voice Short: a new short project, comic saved
  await page.evaluate(() => window.VTS.app.showView('create')); await page.click('#mode-seg button[data-v=short]'); await sleep(300);
  st = await page.evaluate(() => ({ mode: window.VTS.app.project.mode, ideaVisible: !!document.getElementById('idea').offsetParent, aspectSeg: document.querySelectorAll('#aspect-seg button').length, step1: document.querySelector('.step[data-step=idea] span').textContent }));
  ok('switching back gives a normal Voice Short (comic recap kept in the library)', st.mode === 'short' && st.ideaVisible && st.step1 === 'Idea', st);
  ok('no page errors', errors.length === 0, errors.slice(0, 5));
  console.log(pass + '/' + (pass + fail) + ' passed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
