// End-to-end test in headless Chrome with a mocked Gemini API.
// Usage: node tests/e2e.js [voice.wav]   (needs google-chrome, ffmpeg/ffprobe for the checks in check-video.sh)
const puppeteer = require('puppeteer-core');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WWW = path.join(__dirname, '..', 'www');
const OUT = path.join(__dirname, 'out');
const VOICE = process.argv[2] || '/tmp/vts-voice.wav';
const KEY = 'AQ.Ab8RN6FAKEFAKEFAKEFAKEFAKE_test-key';
fs.mkdirSync(OUT, { recursive: true });
const results = []; const ok = (name, cond, extra) => { results.push([cond ? 'PASS' : 'FAIL', name, extra || '']); console.log(cond ? 'PASS' : 'FAIL', name, extra || ''); };

const SCRIPT = 'Your brain replays embarrassing moments at night for a reason. It thinks rehearsing them will protect you. Here is how to stop the loop. One. Name it. Say quietly, this is just my brain rehearsing, and I am safe right now. Two. Write one sentence about what you learned from that moment, then close the notebook and let it go. Three. Breathe out longer than you breathe in, for one full minute. Your nervous system hears that long exhale as safety, and the replay fades. Save this for tonight.';
const VISUALS = ['Dark bedroom, phone glow on the ceiling', 'Hands writing in a journal, window light', 'Notebook closing on a desk', 'Ocean waves in slow motion', 'Cosy bed with a warm lamp'];
function makeBeats(script) {
  const out = []; let step = 0;
  for (const sent of script.match(/[^.!?]+[.!?]/g)) {
    const t = sent.trim(); const m = /^(One|Two|Three)\b/.exec(t);
    if (m) step = { One: 1, Two: 2, Three: 3 }[m[1]];
    const st = /^Save this/.test(t) ? 4 : step;
    const w = t.split(/\s+/);
    for (let i = 0; i < w.length; i += 4) {
      let chunk = w.slice(i, i + 4); if (w.length - (i + 4) === 1) { chunk = w.slice(i); i++; }
      const text = chunk.join(' ');
      const longest = chunk.map((x) => x.replace(/[^A-Za-z]/g, '')).sort((a, b) => b.length - a.length)[0];
      out.push({ text, weight: chunk.length, step: st, emphasis: longest.length > 5 ? longest : '', visual: VISUALS[st] });
    }
  }
  return out;
}
const PKG = {
  hooks: ['Your brain replays embarrassing moments at night for a reason.', 'Why do cringe memories hit hardest at 2 a.m.?', 'Stop losing sleep over things nobody remembers.'],
  script: SCRIPT,
  beats: makeBeats(SCRIPT),
  title: 'Why your brain replays cringe moments at night 🌙',
  description: 'Those 2 a.m. cringe replays are your brain rehearsing, not punishing you.\nTry these 3 steps tonight.\nSave this for the next time it happens.',
  hashtags: ['#psychology', '#selfhelp', '#overthinking', '#sleep', '#mentalhealth', '#shorts'],
  pinnedComment: 'What memory does your brain love to replay? No judgement 👇',
  thumbnailText: 'STOP THE 2AM REPLAY',
};

function serve() {
  const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
    const f = path.join(WWW, p);
    if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

(async () => {
  const srv = await serve();
  const ORIGIN = 'http://127.0.0.1:' + srv.address().port;
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--use-file-for-fake-audio-capture=' + VOICE, '--enable-gpu-rasterization', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') { if (!/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); }; });
  page.on('dialog', (d) => d.accept());
  page.on('response', (r) => { if (r.status() >= 400 && !/generativelanguage/.test(r.url())) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.setRequestInterception(true);
  const calls = []; let failFirstModel = false;
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.hostname !== 'generativelanguage.googleapis.com') return req.continue();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    const json = (status, obj) => req.respond({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(obj) });
    const h = req.headers(); let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (_) { /* ignore */ }
    const m = /\/models\/([^:]+):generateContent$/.exec(u.pathname); const model = m && decodeURIComponent(m[1]);
    calls.push({ path: u.pathname, query: u.search, key: h['x-goog-api-key'], model, body });
    if (u.pathname.endsWith('/models')) return json(200, { models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }] });
    if (failFirstModel && model === 'gemini-3.8-flash') return json(404, { error: { code: 404, message: 'models/gemini-3.8-flash is not found for API version v1beta, or is not supported for generateContent.', status: 'NOT_FOUND' } });
    if (/^gemini-2\./.test(model)) return json(401, { error: { code: 401, message: 'Request had invalid authentication credentials.', status: 'UNAUTHENTICATED', details: [{ reason: 'ACCESS_TOKEN_TYPE_UNSUPPORTED' }] } });
    return json(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(PKG) }] }, finishReason: 'STOP' }] });
  });

  const origClick = page.click.bind(page);
  page.click = async (sel) => { await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' })); await new Promise((r) => setTimeout(r, 60)); return origClick(sel); };
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });
  const app = (fn, ...a) => page.evaluate(fn, ...a);
  await page.goto(ORIGIN + '/');
  await page.waitForSelector('#idea');
  await shot('01-idea-empty');

  // Settings: save key
  await page.click('.tab[data-view=settings]');
  await page.type('#api-key', KEY);
  await page.click('#api-key-save');
  ok('key saved', (await app(() => localStorage.getItem('vts.apiKey'))) === KEY);
  await page.type('#s-handle', 'calmmindlab'); await page.$eval('#s-handle', (e) => e.dispatchEvent(new Event('change')));
  ok('handle normalised', (await app(() => JSON.parse(localStorage.getItem('vts.handle')))) === '@calmmindlab');
  await shot('05-settings');

  // Idea -> script
  await page.click('.tab[data-view=create]');
  await page.type('#idea', 'so like why do we replay embarrassing stuff at night, I want three things people can do, breathing, journaling, naming it');
  await shot('02-idea-typed');
  failFirstModel = true;
  await page.click('#generate');
  await page.waitForSelector('#script-body:not(.hidden)', { timeout: 20000 });
  const gen = calls.filter((c) => c.model);
  ok('fallback: 3.8-flash 404 then retried', gen.length >= 2 && gen[0].model === 'gemini-3.8-flash' && gen[1].model === 'gemini-flash-latest', gen.map((c) => c.model).join(' > '));
  ok('AQ. key sent in x-goog-api-key header (not in URL)', gen.every((c) => c.key === KEY) && gen.every((c) => !/key=/.test(c.query)));
  const gc = gen[gen.length - 1].body.generationConfig;
  ok('structured JSON output requested', gc.responseMimeType === 'application/json' && !!gc.responseSchema && gc.responseSchema.required.includes('beats'));
  ok('model switched + saved', (await app(() => JSON.parse(localStorage.getItem('vts.model')))) === 'gemini-flash-latest');
  failFirstModel = false;
  const nHooks = await page.$$eval('#hooks .hook', (e) => e.length);
  const nBeats = await page.$$eval('#beats .beat', (e) => e.length);
  ok('3 hooks rendered', nHooks === 3); ok('beats rendered', nBeats === PKG.beats.length, String(nBeats));
  ok('word badge ok (80-110)', /ok/.test(await page.$eval('#word-badge', (e) => e.className)), await page.$eval('#word-badge', (e) => e.textContent));
  ok('hashtags field', (await page.$eval('#f-hashtags', (e) => e.value)).includes('#psychology'));
  await shot('03-script');

  // Editing
  await page.click('#hooks .hook:nth-child(2)');
  let pkg = await app(() => window.VTS.app.project.pkg);
  ok('hook 2 applied to script', pkg.hookIndex === 1 && pkg.script.startsWith(PKG.hooks[1]), pkg.script.slice(0, 60));
  ok('hook beats rebuilt', pkg.beats[0].step === 0 && PKG.hooks[1].startsWith(pkg.beats[0].text.split(' ')[0]));
  await page.click('#hooks .hook:nth-child(1)');
  await page.$eval('#f-title', (e) => { e.value = 'Stop the 2 a.m. cringe replay 🌙'; e.dispatchEvent(new Event('input')); });
  await page.$eval('#beats .beat:nth-child(5) .b-text', (e) => { e.value = 'One. Name the loop out loud.'; e.dispatchEvent(new Event('input')); });
  await page.$eval('#f-hashtags', (e) => { e.value = 'psychology selfhelp #overthinking sleep shorts'; e.dispatchEvent(new Event('change')); });
  pkg = await app(() => window.VTS.app.project.pkg);
  ok('title edited', pkg.title === 'Stop the 2 a.m. cringe replay 🌙');
  ok('beat edited', pkg.beats.some((b) => b.text === 'One. Name the loop out loud.'));
  await page.$eval('#beats .beat:nth-child(5) .b-text', (e) => { e.value = 'One. Name it.'; e.dispatchEvent(new Event('input')); });
  ok('hashtags normalised', pkg.hashtags.join(' ') === '#psychology #selfhelp #overthinking #sleep #shorts', pkg.hashtags.join(' '));
  // Script edit + rebuild captions
  await page.$eval('#script', (e) => { e.value = e.value + ' '; e.dispatchEvent(new Event('input')); });
  ok('rebuild button appears', !(await page.$eval('#rebuild-beats', (e) => e.classList.contains('hidden'))));
  await page.click('#rebuild-beats');
  pkg = await app(() => window.VTS.app.project.pkg);
  const steps = Array.from(new Set(pkg.beats.map((b) => b.step)));
  ok('rebuilt beats cover hook/1/2/3/CTA', [0, 1, 2, 3, 4].every((s) => steps.includes(s)), steps.join(','));

  // Voice: teleprompter recording with the fake mic (plays the sample wav)
  await page.click('.step[data-step=voice]');
  await shot('06-voice');
  await page.click('#opt-record');
  await page.waitForSelector('#prompter:not(.hidden)');
  await page.click('#p-rec');
  await new Promise((r) => setTimeout(r, 2700 + 5000));
  await shot('07-teleprompter');
  const scrolled = await page.$eval('#p-scroll', (e) => e.scrollTop);
  ok('teleprompter scrolls while recording', scrolled > 20, 'scrollTop=' + scrolled);
  await page.click('#p-rec');
  await page.waitForSelector('#p-use:not(.hidden)', { timeout: 8000 });
  await page.click('#p-use');
  await page.waitForFunction(() => window.VTS.app.project.voice && window.VTS.app.project.voice.source === 'mic', { timeout: 10000 });
  const mv = await app(() => ({ d: window.VTS.app.project.voice.duration, t: window.VTS.app.project.voice.mime, s: window.VTS.app.project.voice.blob.size }));
  ok('teleprompter take recorded (MediaRecorder)', mv.d > 3 && mv.s > 5000, JSON.stringify(mv));

  // Import the full sample voice for the render test
  const input = await page.$('#import-audio');
  await input.uploadFile(VOICE);
  await page.waitForFunction(() => window.VTS.app.project.voice && window.VTS.app.project.voice.source === 'import', { timeout: 10000 });
  ok('audio import', true, (await app(() => window.VTS.app.project.voice.duration)).toFixed(2) + ' s');

  // Render (Teal & Orange, auto format)
  await page.click('.step[data-step=render]');
  await new Promise((r) => setTimeout(r, 1200));
  await shot('08-render-pane');
  const fmt = await app(() => window.VTS.render.pickVideoType('auto'));
  ok('MediaRecorder format picked', !!fmt, fmt);
  async function renderAndSave(name) {
    await page.click('#render');
    await page.waitForSelector('#render-progress:not(.hidden)');
    await new Promise((r) => setTimeout(r, 4000));
    await shot('09-rendering-' + name);
    await page.waitForFunction(() => !document.querySelector('#result-card').classList.contains('hidden') && !window.VTS.app.project.video.stale && document.querySelector('#render-progress').classList.contains('hidden'), { timeout: 120000, polling: 500 });
    const info = await app(async () => {
      const v = window.VTS.app.project.video;
      const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(v.blob); });
      return { b64, type: v.type, mime: v.mime, size: v.size, duration: v.duration, ms: v.renderMs, frames: v.frames };
    });
    const ext = /mp4/.test(info.type) ? 'mp4' : 'webm';
    const file = path.join(OUT, name + '.' + ext);
    fs.writeFileSync(file, Buffer.from(info.b64, 'base64'));
    ok('render ' + name + ' produced file', info.size > 100000, file + ' ' + (info.size / 1048576).toFixed(1) + ' MB, ' + info.mime + ', ' + info.duration.toFixed(1) + ' s, ' + info.frames + ' frames drawn, took ' + (info.ms / 1000).toFixed(1) + ' s');
    return file;
  }
  const f1 = await renderAndSave('render-teal');
  await shot('10-result');

  // Second render: Moody Film, WebM, karaoke captions, watermark on
  await page.click('#grades .grade:nth-child(2)');
  await page.click('#cap-style button[data-v=karaoke]');
  await page.click('#opt-watermark');
  await page.select('#opt-format', 'webm');
  const f2 = await renderAndSave('render-moody');
  // Third: Warm Soft back on auto
  await page.click('#grades .grade:nth-child(3)');
  await page.click('#cap-style button[data-v=pop]');
  await page.select('#opt-format', 'auto');
  const f3 = await renderAndSave('render-warm');

  // Library: listed, re-edit, delete
  await page.click('.tab[data-view=library]');
  await page.waitForSelector('.lib-item');
  await shot('11-library');
  ok('library lists project', (await page.$$eval('.lib-item', (e) => e.length)) === 1);
  ok('library has thumbnail', !!(await page.$('.lib-item img.lib-thumb')));
  await page.click('.lib-item [data-a=open]');
  ok('re-edit opens render step', await page.waitForFunction(() => window.VTS.app.project.step === 'render' && document.querySelector('#view-create').classList.contains('active') && document.querySelector('#pane-render').classList.contains('active'), { timeout: 5000 }).then(() => true, () => false));
  // Create a second project and delete it
  await page.click('#new-project');
  await page.type('#idea', 'temporary project to delete');
  await new Promise((r) => setTimeout(r, 800));
  await page.click('.tab[data-view=library]');
  await page.waitForFunction(() => document.querySelectorAll('.lib-item').length === 2);
  await page.click('.lib-item:first-child [data-a=del]');
  await page.waitForFunction(() => document.querySelectorAll('.lib-item').length === 1);
  ok('delete project', true);
  // Backup export (web download) works without error
  await page.click('.tab[data-view=settings]');
  await page.click('#export-data');
  await new Promise((r) => setTimeout(r, 500));
  ok('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  fs.writeFileSync(path.join(OUT, 'files.json'), JSON.stringify([f1, f2, f3]));
  await browser.close(); srv.close();
  const failed = results.filter((r) => r[0] === 'FAIL');
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
