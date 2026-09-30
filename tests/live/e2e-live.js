// LIVE end-to-end in headless Chrome with the real Gemini key from $GEMINI_API_KEY (never printed).
// idea -> Write my Short -> AI voice (Gemini TTS) -> render 9:16, then ffprobe. Usage: node tests/live/e2e-live.js <len> <outfile>
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const WWW = path.join(__dirname, '..', '..', 'www'); const KEY = process.env.GEMINI_API_KEY; if (!KEY) throw new Error('no key');
const LEN = process.argv[2] || '120'; const OUTF = process.argv[3] || '/tmp/live/live-' + LEN;
const IDEA = process.env.IDEA || 'why we procrastinate on things that matter, it is about feelings not laziness, and three small tricks to start today like the two minute rule';
const red = (s) => String(s).split(KEY).join('REDACTED');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function serve() {
  const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
  const srv = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = path.join(WWW, p);
    if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}
(async () => {
  const srv = await serve(); const ORIGIN = 'http://127.0.0.1:' + srv.address().port; const T0 = Date.now(); const t = () => ((Date.now() - T0) / 1000).toFixed(1) + 's';
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 0,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const page = await browser.newPage(); await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = []; page.on('pageerror', (e) => errors.push(red(e))); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(red('console: ' + m.text())); });
  page.on('dialog', (d) => d.accept());
  const api = []; page.on('response', (r) => { const u = r.url(); if (u.includes('generativelanguage')) { const m = /models\/([^:?]+)(:\w+)?/.exec(u); if (r.request().method() !== 'OPTIONS') { const e = (m ? m[1] + (m[2] || '') : 'models') + ' ' + r.status(); api.push(e); console.log(t(), 'api', e); } } });
  const app = (fn, ...a) => page.evaluate(fn, ...a);
  const click = async (sel) => { await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' })); await sleep(80); await page.click(sel); };
  await page.goto(ORIGIN + '/'); await page.waitForSelector('#idea');
  await app((k) => { localStorage.setItem('vts.apiKey', k); }, KEY); await page.reload(); await page.waitForSelector('#idea');
  await page.type('#idea', IDEA); await page.select('#opt-length', LEN);
  await app(() => { const b = document.querySelector('#tone-seg [data-v="calm"]'); if (b) b.click(); });
  await click('#generate');
  await page.waitForFunction(() => (window.VTS.app.project.pkg && !document.querySelector('#script-body').classList.contains('hidden')) || /err/.test(document.querySelector('#gen-status').className), { timeout: 900000, polling: 1000 });
  const pkg = await app(() => { const p = window.VTS.app.project.pkg; return p && { words: window.VTS.shortgen.wordCount(p.script), beats: p.beats.length, title: p.title, hook: p.hooks[0], model: localStorage.getItem('vts.model'), low: p.beats.filter((b) => b.scene && window.VTS.scenes.matchScore(b.text, b.scene) < 0.5).length, poses: new Set(p.beats.map((b) => b.scene && b.scene.pose)).size, settings: new Set(p.beats.map((b) => b.scene && b.scene.setting)).size }; });
  console.log(t(), 'SCRIPT', JSON.stringify(pkg), '| gen-status:', red(await page.$eval('#gen-status', (e) => e.textContent)));
  if (!pkg) throw new Error('script failed');
  await click('.step[data-step=voice]'); await click('#ai-generate');
  await page.waitForFunction(() => (window.VTS.app.project.voice && window.VTS.app.project.voice.source === 'gemini') || /fail|error|quota/i.test(document.querySelector('#voice-status').textContent), { timeout: 900000, polling: 1000 });
  const voice = await app(() => { const v = window.VTS.app.project.voice; return { src: v && v.source, d: v && v.duration, model: v && v.model, status: document.querySelector('#voice-status').textContent.slice(0, 200) }; });
  console.log(t(), 'VOICE', red(JSON.stringify(voice)));
  if (voice.src !== 'gemini') throw new Error('voice failed');
  await click('.step[data-step=render]'); await sleep(800); await click('#aspect-seg button[data-v="9:16"]'); await sleep(300);
  await click('#render'); await page.waitForSelector('#render-progress:not(.hidden)');
  await page.waitForFunction(() => document.querySelector('#render-progress').classList.contains('hidden'), { timeout: 1800000, polling: 1000 });
  const v = await app(() => { const v = window.VTS.app.project.video; return v && { w: v.width, h: v.height, d: v.duration, type: v.type, ms: v.renderMs, status: document.querySelector('#render-status').textContent.slice(0, 160) }; });
  console.log(t(), 'RENDER', JSON.stringify(v));
  const ext = /mp4/.test(v.type) ? '.mp4' : '.webm'; const file = OUTF + ext;
  const size = await app(async () => { const v = window.VTS.app.project.video; window.__vf = v.blob || await window.VTS.segments.openStore(v.stored.store).then((st) => st.reader(v.stored.name)).then((rd) => rd.file); return window.__vf.size; });
  const fd = fs.openSync(file, 'w'); const CH = 8 * 1024 * 1024;
  for (let off = 0; off < size; off += CH) { const b64 = await app(async (o, n) => { const b = window.__vf.slice(o, o + n); return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(b); }); }, off, Math.min(CH, size - off)); fs.writeSync(fd, Buffer.from(b64, 'base64')); }
  fs.closeSync(fd);
  const pr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,duration:format=duration', '-of', 'json', file]).toString());
  console.log(t(), 'FILE', file, size, JSON.stringify(pr));
  console.log('API', JSON.stringify(api)); console.log('ERRORS', JSON.stringify(errors));
  fs.writeFileSync(OUTF + '.json', JSON.stringify({ pkg, voice, video: v, file, probe: pr, api, errors }, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.log('FATAL', red(e && e.stack || e)); process.exit(1); });
