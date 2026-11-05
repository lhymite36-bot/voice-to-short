// LIVE Comic Recap script (+ optional voice) in headless Chrome with $GEMINI_API_KEY (never printed).
// Usage: node tests/live/comic-live.js <panels.json> <outDir> [--tts]
//   Sends the panels to the app's vision script writer (VTS.comic.writeScript, normal model fallback) and writes
//   <outDir>/recap.json (same format as tests/fixtures/comic-recap.json, ready for comic-offline.js).
//   --tts also makes ONE Gemini TTS request (dramatic narrator) -> <outDir>/voice.wav. Uses 1 request of the daily voice quota.
//   --voice-only: <panels.json> already has the lines (e.g. a recap.json from an earlier run): skip the script, only make the voice.
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path');
const WWW = path.join(__dirname, '..', '..', 'www'); const KEY = process.env.GEMINI_API_KEY; if (!KEY) throw new Error('no GEMINI_API_KEY');
const [PROJ, OUTDIR] = process.argv.slice(2).filter((a) => !a.startsWith('--')); const VOICE_ONLY = process.argv.includes('--voice-only'); const TTS = VOICE_ONLY || process.argv.includes('--tts');
const proj = JSON.parse(fs.readFileSync(PROJ, 'utf8')); const base = path.dirname(path.resolve(PROJ)); const files = proj.panels.map((p) => path.resolve(base, p.file));
fs.mkdirSync(OUTDIR, { recursive: true });
const red = (s) => String(s).split(KEY).join('REDACTED');
function serve() {
  const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.ogg': 'audio/ogg' };
  const srv = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const m = /^\/__panel\/(\d+)$/.exec(p); const f = m ? files[Number(m[1])] : path.join(WWW, p);
    if (!f || (!m && !f.startsWith(WWW)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(f).toLowerCase()] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}
(async () => {
  const srv = await serve(); const ORIGIN = 'http://127.0.0.1:' + srv.address().port;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 0, args: ['--no-sandbox'] });
  const page = await browser.newPage(); page.on('console', (m) => { if (/error|warn/.test(m.type())) console.log('page:', red(m.text()).slice(0, 300)); });
  await page.goto(ORIGIN + '/'); await page.waitForFunction(() => window.VTS && window.VTS.app); await page.evaluate((k) => localStorage.setItem('vts.apiKey', k), KEY); await page.reload(); await page.waitForFunction(() => window.VTS && window.VTS.app && window.VTS.comic);
  const t0 = Date.now();
  const res = await page.evaluate(async (n, o, tts, given) => {
    const V = window.VTS; const CM = V.comic; const G = V.gemini; const panels = []; const meta = [];
    for (let k = 0; k < n; k++) { const b = await (await fetch('/__panel/' + k)).blob(); panels.push(await CM.importImage(new File([b], 'p' + k + '.jpg', { type: b.type }))); }
    let out;
    if (given) out = { title: given.title, description: given.description, hashtags: given.hashtags || [], tiktokCaption: given.tiktokCaption || '', missing: [], panels: given.panels.map((p) => ({ lines: p.lines, focus: p.focus || null, impact: !!p.impact, sfx: p.sfx || '' })) };
    else { try { out = await CM.writeScript(panels, Object.assign({ onMeta: (m) => meta.push(m) }, o)); } catch (e) { return { error: G.friendlyError(e), details: e && e.details }; } }
    out.panels.forEach((q, k) => Object.assign(panels[k], { lines: q.lines, focus: q.focus, impact: q.impact, sfx: q.sfx }));
    const pkg = CM.makePkg(panels, { title: out.title, description: out.description, hashtags: out.hashtags, tiktokCaption: out.tiktokCaption });
    const r = { out, model: G.host.getModel(), script: pkg.script, words: CM.wordCount(pkg.script), beats: pkg.beats.length };
    if (tts) {
      try {
        const st = { style: 'dramatic storyteller narrating an epic comic: deep, intense and cinematic, building suspense, short punchy pauses before reveals, rising energy on action, never cheesy', prefix: 'Narrate like a dramatic, intense, cinematic storyteller' };
        const sp = await G.generateSpeech(pkg.script, { voice: o.voice || 'Algenib', style: st.style, prefix: st.prefix, maxWords: 260 });
        const u8 = new Uint8Array(await sp.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
        Object.assign(r, { wav: btoa(s), ttsModel: sp.model, chunks: sp.chunks });
      } catch (e) { r.ttsError = G.friendlyError(e); r.ttsQuota = !!(e && e.quota); }
    }
    return r;
  }, files.length, { title: proj.title || '', notes: proj.notes || '', length: proj.length || '60', language: 'English', voice: process.env.VOICE }, TTS, VOICE_ONLY ? proj : null);
  if (res.error) { console.log('SCRIPT FAILED', red(res.error), red(res.details || '')); await browser.close(); srv.close(); process.exit(1); }
  const recap = { title: res.out.title, model: VOICE_ONLY ? proj.model : res.model, description: res.out.description, hashtags: res.out.hashtags, tiktokCaption: res.out.tiktokCaption,
    panels: proj.panels.map((p, k) => ({ file: path.relative(path.resolve(OUTDIR), files[k]), lines: res.out.panels[k].lines, focus: res.out.panels[k].focus, impact: res.out.panels[k].impact, sfx: res.out.panels[k].sfx })), fx: proj.fx || {} };
  fs.writeFileSync(path.join(OUTDIR, 'recap.json'), JSON.stringify(recap, null, 1));
  console.log('SCRIPT', res.model, res.words + ' words', res.beats + ' beats', ((Date.now() - t0) / 1000).toFixed(0) + 's', 'missing:', JSON.stringify(res.out.missing));
  console.log('TITLE', res.out.title); recap.panels.forEach((p, k) => console.log('P' + (k + 1) + (p.impact ? ' [' + p.sfx + ']' : ''), p.lines.join(' / ')));
  if (TTS) { if (res.wav) { fs.writeFileSync(path.join(OUTDIR, 'voice.wav'), Buffer.from(res.wav, 'base64')); console.log('VOICE', res.ttsModel, res.chunks + ' request(s)'); } else console.log('VOICE FAILED', res.ttsQuota ? '(quota)' : '', red(res.ttsError)); }
  await browser.close(); srv.close();
})().catch((e) => { console.error('FATAL', red(e && e.stack || e)); process.exit(1); });
