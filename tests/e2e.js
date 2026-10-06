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

const SCRIPT = fs.readFileSync('/tmp/overthink.txt', 'utf8').trim();
const PREVIEWS = path.join(OUT, 'v12-regression-previews');
fs.mkdirSync(PREVIEWS, { recursive: true });
// The scene plan Gemini would return, one per sentence (hand-written mock of the structured output).
const SENT_SCENES = [
  { setting: 'bedroom-night', pose: 'lying-awake', emotion: 'anxious', props: ['clock', 'thought-bubbles', 'moon'], camera: 'zoom-in', callout: '2:07 AM', characters: 1 },
  { setting: 'abstract-mind-space', pose: 'standing-thinking', emotion: 'surprised', props: ['brain', 'sparkles'], camera: 'static', callout: '', characters: 1 },
  { setting: 'abstract-mind-space', pose: 'stressed', emotion: 'anxious', props: ['brain', 'question-marks', 'cloud'], camera: 'shake', callout: '', characters: 1 },
  { setting: 'bedroom-night', pose: 'sitting-head-in-hands', emotion: 'sad', props: ['thought-bubbles', 'speech-bubbles'], camera: 'zoom-in', callout: 'Replay #47', characters: 1 },
  { setting: 'phone-screen', pose: 'scrolling-phone', emotion: 'tired', props: ['phone', 'battery'], camera: 'static', callout: '1:43 AM', characters: 1 },
  { setting: 'void', pose: 'standing-thinking', emotion: 'happy', props: ['lightbulb'], camera: 'zoom-in', callout: '', characters: 1 },
  { setting: 'office', pose: 'talking', emotion: 'calm', props: ['notebook', 'checklist'], camera: 'static', callout: 'Brain dump', characters: 1 },
  { setting: 'office', pose: 'talking', emotion: 'calm', props: ['notebook', 'checklist'], camera: 'static', callout: 'Brain dump', characters: 1 },
  { setting: 'bedroom-night', pose: 'walking', emotion: 'calm', props: ['phone', 'arrows', 'moon'], camera: 'pan', callout: 'Phone out', characters: 1 },
  { setting: 'park', pose: 'meditating', emotion: 'calm', props: ['cloud', 'sparkles'], camera: 'static', callout: 'Exhale 6s', characters: 1 },
  { setting: 'bedroom-night', pose: 'sleeping', emotion: 'calm', props: ['zzz', 'moon'], camera: 'zoom-in', callout: '', characters: 1 },
  { setting: 'park', pose: 'celebrating', emotion: 'happy', props: ['heart', 'sparkles', 'confetti'], camera: 'static', callout: '', characters: 1 },
];
function makeBeats(script) {
  const out = []; let step = 0; let si = -1;
  for (const sent of script.match(/[^.!?]+[.!?]/g)) {
    const t = sent.trim(); const m = /^(One|Two|Three)\b/.exec(t);
    if (m) step = { One: 1, Two: 2, Three: 3 }[m[1]];
    const st = /^Follow/.test(t) ? 4 : step;
    if (!/^(One|Two|Three)\.$/.test(t)) si = Math.min(SENT_SCENES.length - 1, si + 1);
    const w = t.split(/\s+/);
    for (let i = 0; i < w.length; i += 4) {
      let chunk = w.slice(i, i + 4); if (w.length - (i + 4) === 1) { chunk = w.slice(i); i++; }
      const text = chunk.join(' ');
      const longest = chunk.map((x) => x.replace(/[^A-Za-z]/g, '')).sort((a, b) => b.length - a.length)[0];
      out.push({ text, weight: chunk.length, step: st, emphasis: longest.length > 5 ? longest : '', visual: 'animated scene', scene: JSON.parse(JSON.stringify(SENT_SCENES[Math.max(0, si)])) });
    }
  }
  return out;
}
const PKG = {
  hooks: ['Why do you overthink at night?', 'Your brain saves its worst thoughts for 2 a.m.', 'This is why you cannot switch off at night.'],
  script: SCRIPT,
  beats: makeBeats(SCRIPT),
  title: 'Why you overthink at night (and how to stop) 🌙',
  description: 'At night your brain finally has no distractions, so every unfinished worry gets loud.\nTry these 3 steps tonight.\nSave this for the next time it happens.',
  hashtags: ['#psychology', '#selfhelp', '#overthinking', '#sleep', '#mentalhealth', '#shorts'],
  pinnedComment: 'What keeps your brain busy at night? No judgement 👇',
  thumbnailText: 'WHY YOU OVERTHINK AT NIGHT',
};
// A small PNG "illustration" for the image-model mock (solid 9:16 gradient-ish image made with raw zlib).
function makePng(w, h) {
  const zlib = require('zlib');
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 40 + (x * 150 / w) | 0; raw[o + 1] = 60 + (y * 120 / h) | 0; raw[o + 2] = 140; } }
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = makePng(288, 512);

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
  const calls = []; let failFirstModel = false; let ttsMode = 'wav'; const ttsCalls = []; let imageMode = 'quota'; const imageCalls = [];
  const PCM = fs.readFileSync(process.env.PCM || '/tmp/vts-voice-24k.pcm');
  const wavOf = (pcm) => { const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40); return Buffer.concat([h, pcm]); };
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.hostname !== 'generativelanguage.googleapis.com') return req.continue();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    const json = (status, obj) => req.respond({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(obj) });
    const h = req.headers(); let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (_) { /* ignore */ }
    const m = /\/models\/([^:]+):generateContent$/.exec(u.pathname); const model = m && decodeURIComponent(m[1]);
    if (model && /tts/.test(model)) {
      ttsCalls.push({ model, key: h['x-goog-api-key'], query: u.search, body });
      const audio = (mime, buf) => json(200, { candidates: [{ content: { role: 'model', parts: [{ inlineData: { mimeType: mime, data: buf.toString('base64') } }] }, finishReason: 'STOP' }] });
      if (ttsMode === 'quota') return json(429, { error: { code: 429, message: 'You exceeded your current quota, please check your plan and billing details.', status: 'RESOURCE_EXHAUSTED' } });
      if (ttsMode === 'wav') return audio('audio/wav', wavOf(PCM.subarray(0, 24000 * 2 * 3)));
      if (ttsMode === 'fallback') {
        if (model === 'gemini-3.8-flash-tts') return json(404, { error: { code: 404, message: 'models/gemini-3.8-flash-tts is not found for API version v1beta, or is not supported for generateContent.', status: 'NOT_FOUND' } });
        return audio('audio/L16;codec=pcm;rate=24000', PCM);
      }
      if (ttsMode === 'legacy31') {
        if (model !== 'gemini-3.1-flash-tts-preview') return json(404, { error: { code: 404, message: 'models/' + model + ' is not found for API version v1beta.', status: 'NOT_FOUND' } });
        return audio('audio/L16;codec=pcm;rate=24000', PCM.subarray(0, 48000));
      }
    }
    if (model && /image/.test(model)) {
      imageCalls.push({ model, key: h['x-goog-api-key'], body });
      if (imageMode === 'quota') return json(429, { error: { code: 429, message: 'You exceeded your current quota, please check your plan and billing details. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: ' + model, status: 'RESOURCE_EXHAUSTED' } });
      if (imageMode === 'png') {
        if (model === 'gemini-3.1-flash-lite-image') return json(404, { error: { code: 404, message: 'models/' + model + ' is not found for API version v1beta.', status: 'NOT_FOUND' } });
        return json(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG.toString('base64') } }] }, finishReason: 'STOP' }] });
      }
    }
    calls.push({ path: u.pathname, query: u.search, key: h['x-goog-api-key'], model, body });
    const promptText = body && body.contents && body.contents[0] && body.contents[0].parts && body.contents[0].parts[0].text || '';
    if (/Suggest a NEW, different animated scene/.test(promptText)) return json(200, { candidates: [{ content: { parts: [{ text: JSON.stringify({ setting: 'park', pose: 'dancing-wildly', emotion: 'ecstatic', props: ['unicorn', 'sun', 'sparkles'], camera: 'dolly', callout: 'Fresh air', characters: 1 }) }] }, finishReason: 'STOP' }] });
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
  const scs = gc.responseSchema.properties.beats.items.properties.scene;
  ok('beat schema has scene spec with vocab enums', !!scs && scs.properties.setting.enum.length >= 10 && (scs.properties.pose.enum ? scs.properties.pose.enum.length >= 11 : /walking-toward/.test(gen[gen.length - 1].body.contents[0].parts[0].text)) /* v1.6: 65 poses > Gemini's 60-value enum limit, so ids are listed in the prompt */ && scs.properties.emotion.enum.length >= 8 && !scs.properties.props.items.enum /* v1.3.1: 310-value enum made Google reject the request (400); ids are listed in the prompt */ && gc.responseSchema.properties.beats.items.required.includes('scene'), scs && [scs.properties.setting.enum.length, (scs.properties.pose.enum || []).length, scs.properties.emotion.enum.length].join('/'));
  ok('prompt asks for literal, continuous scenes', /Keep the SAME setting/.test(gen[gen.length - 1].body.contents[0].parts[0].text));
  ok('model switched + saved', (await app(() => JSON.parse(localStorage.getItem('vts.model')))) === 'gemini-flash-latest');
  failFirstModel = false;
  const nHooks = await page.$$eval('#hooks .hook', (e) => e.length);
  const nBeats = await page.$$eval('#beats .beat', (e) => e.length);
  const sc0 = await app(() => window.VTS.app.project.pkg.beats.map((b) => b.scene));
  ok('every beat has a validated scene', sc0.every((x) => x.setting && x.pose && x.emotion && Array.isArray(x.props)) && sc0[0].setting === 'bedroom-night' && sc0[0].pose === 'lying-awake', sc0[0] && JSON.stringify(sc0[0]));
  const norm = await app(() => window.VTS.scenes.normalizeScene({ setting: 'moon base', pose: 'flying', emotion: 'ecstatic', props: ['unicorn', 'Clock', 'thought bubble'], camera: 'dolly zoom', callout: 'x'.repeat(60) }, 'I lie awake at night overthinking', 0, null));
  const V = await app(() => ({ S: window.VTS.scenes.SET_IDS, P: window.VTS.scenes.POSE_IDS, E: window.VTS.scenes.EMO_IDS, R: window.VTS.scenes.PROP_IDS, C: window.VTS.scenes.CAM_IDS }));
  ok('unknown scene values fall back gracefully', V.S.includes(norm.setting) && V.P.includes(norm.pose) && V.E.includes(norm.emotion) && V.C.includes(norm.camera) && norm.props.every((x) => V.R.includes(x)) && norm.props.includes('clock') && norm.callout.length <= 28, JSON.stringify(norm));
  ok('vocabulary sizes (settings/poses/emotions/props)', V.S.length >= 10 && V.P.length >= 11 && V.E.length >= 8 && V.R.length >= 25, [V.S.length, V.P.length, V.E.length, V.R.length].join('/'));
  // Scene editor on beat 1
  await page.click('#beats .beat:nth-child(1) .b-scene-btn');
  await page.waitForSelector('#beats .beat:nth-child(1) .b-scene:not(.hidden) canvas.sc-prev');
  const painted = await page.$eval('#beats .beat:nth-child(1) canvas.sc-prev', (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 30) n++; return n; });
  ok('scene editor opens with preview', painted > 50, 'lit samples=' + painted);
  await shot('03b-scene-editor');
  await page.select('#beats .beat:nth-child(1) select[data-f=setting]', 'cafe');
  ok('scene dropdown edit applied', (await app(() => window.VTS.app.project.pkg.beats[0].scene.setting)) === 'cafe');
  await page.click('#beats .beat:nth-child(1) .sc-regen');
  await page.waitForFunction(() => window.VTS.app.project.pkg.beats[0].scene.setting === 'park', { timeout: 10000 }).catch(() => {});
  const rg = await app(() => window.VTS.app.project.pkg.beats[0].scene);
  ok('Regenerate scene (Gemini) + validation of odd values', rg.setting === 'park' && V.P.includes(rg.pose) && V.E.includes(rg.emotion) && rg.props.includes('sun') && !rg.props.includes('unicorn') && V.C.includes(rg.camera), JSON.stringify(rg));
  await app((s) => { window.VTS.app.project.pkg.beats[0].scene = s; }, sc0[0]);
  await page.click('#vis-seg-script button[data-v=classic]');
  ok('visual style toggle -> classic hides scene editors', (await app(() => window.VTS.app.project.look.visual)) === 'classic' && !(await page.$('#beats .b-scene-btn')) && !!(await page.$('#beats .b-visual')));
  await page.click('#vis-seg-script button[data-v=scenes]');
  ok('visual style back to animated scenes (default)', (await app(() => window.VTS.app.project.look.visual)) === 'scenes' && !!(await page.$('#beats .b-scene-btn')));
  ok('3 hooks rendered', nHooks === 3); ok('beats rendered', nBeats === PKG.beats.length, String(nBeats));
  ok('word badge counts words (v1.4: ~60 s target is 120-140 words, so 101 words shows as a bit short)', /101 words/.test(await page.$eval('#word-badge', (e) => e.textContent)) && /(ok|warn)/.test(await page.$eval('#word-badge', (e) => e.className)), await page.$eval('#word-badge', (e) => e.textContent));
  ok('hashtags field', (await page.$eval('#f-hashtags', (e) => e.value)).includes('#psychology'));
  await shot('03-script');

  // Editing
  await page.click('#hooks .hook:nth-child(2)');
  let pkg = await app(() => window.VTS.app.project.pkg);
  ok('hook 2 applied to script', pkg.hookIndex === 1 && pkg.script.startsWith(PKG.hooks[1]), pkg.script.slice(0, 60));
  ok('hook beats rebuilt', pkg.beats[0].step === 0 && PKG.hooks[1].startsWith(pkg.beats[0].text.split(' ')[0]));
  ok('hook beats keep a scene', pkg.beats.every((b) => b.scene && b.scene.setting));
  await page.click('#hooks .hook:nth-child(1)');
  await page.$eval('#f-title', (e) => { e.value = 'Stop the 2 a.m. cringe replay 🌙'; e.dispatchEvent(new Event('input')); });
  const b5 = await page.$$eval('#beats .b-text', (es) => es[Math.min(4, es.length - 1)].value);
  await page.$$eval('#beats .b-text', (es) => { const e = es[Math.min(4, es.length - 1)]; e.value = 'One. Name the loop out loud.'; e.dispatchEvent(new Event('input')); });
  await page.$eval('#f-hashtags', (e) => { e.value = 'psychology selfhelp #overthinking sleep shorts'; e.dispatchEvent(new Event('change')); });
  pkg = await app(() => window.VTS.app.project.pkg);
  ok('title edited', pkg.title === 'Stop the 2 a.m. cringe replay 🌙');
  ok('beat edited', pkg.beats.some((b) => b.text === 'One. Name the loop out loud.'));
  await page.$$eval('#beats .b-text', (es, v) => { const e = es[Math.min(4, es.length - 1)]; e.value = v; e.dispatchEvent(new Event('input')); }, b5);
  ok('hashtags normalised', pkg.hashtags.join(' ') === '#psychology #selfhelp #overthinking #sleep #shorts', pkg.hashtags.join(' '));
  // Script edit + rebuild captions
  await page.$eval('#script', (e) => { e.value = e.value + ' '; e.dispatchEvent(new Event('input')); });
  ok('rebuild button appears', !(await page.$eval('#rebuild-beats', (e) => e.classList.contains('hidden'))));
  await page.click('#rebuild-beats');
  pkg = await app(() => window.VTS.app.project.pkg);
  const steps = Array.from(new Set(pkg.beats.map((b) => b.step)));
  ok('rebuilt beats cover hook/1/2/3/CTA', [0, 1, 2, 3, 4].every((s) => steps.includes(s)), steps.join(','));
  ok('rebuilt beats keep scenes', pkg.beats.every((b) => b.scene && b.scene.setting) && pkg.beats[0].scene.setting === 'bedroom-night', pkg.beats[0].scene && pkg.beats[0].scene.setting);
  // restore the planned scenes exactly (the rebuild maps them proportionally) so the sample render matches the mocked plan
  await app((beats) => { window.VTS.app.project.pkg.beats = beats; }, PKG.beats);

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

  // ---- AI voice (Gemini TTS) ----
  ok('AI voice card is first + recommended', await app(() => { const g = document.querySelector('#pane-voice .option-group'); return g && g.id === 'opt-ai' && /Recommended/.test(g.textContent); }));
  ok('30 prebuilt voices listed', (await page.$$eval('#ai-voices .voice', (e) => e.length)) === 30);
  // 1) per-voice preview (API returns a WAV)
  ttsMode = 'wav'; let n0 = ttsCalls.length;
  await page.click('#ai-voices .voice[data-voice=Charon] .v-play');
  await page.waitForFunction(() => document.querySelector('#ai-voices .voice[data-voice=Charon] .v-play').classList.contains('playing'), { timeout: 10000 });
  const pv = ttsCalls[n0];
  ok('preview request shape (AUDIO + prebuiltVoiceConfig + speech_metadata style; v1.4 default tone = sarcastic)', pv && pv.body.generationConfig.responseModalities[0] === 'AUDIO' && pv.body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName === 'Charon' && /calm|sarcastic/.test(pv.body.contents[0].parts[0].speech_metadata.style) && pv.key === KEY && !/key=/.test(pv.query), JSON.stringify(pv && pv.body).slice(0, 260));
  await page.click('#ai-voices .voice[data-voice=Charon] .v-play'); // stop
  // 2) quota on every model -> clear message
  ttsMode = 'quota'; n0 = ttsCalls.length;
  await page.click('#ai-generate');
  await page.waitForFunction(() => /quota/i.test(document.querySelector('#voice-status').textContent), { timeout: 15000 });
  const qmsg = await page.$eval('#voice-status', (e) => e.textContent);
  ok('429 -> quota message with retry-later + record-own-voice + Details', /try again/i.test(qmsg) && /record your own voice/i.test(qmsg) && /Details: HTTP 429/.test(qmsg), qmsg.replace(/\s+/g, ' ').slice(0, 220));
  ok('quota: each model tried once', ttsCalls.length - n0 >= 2 && new Set(ttsCalls.slice(n0).map((c) => c.model)).size === ttsCalls.length - n0, ttsCalls.slice(n0).map((c) => c.model).join(' > '));
  await shot('06b-voice-quota');
  // 3) pick Kore + Bold, 3.8-flash-tts 404 -> falls back to 3.8-flash-lite-tts returning raw L16 PCM
  ttsMode = 'fallback'; n0 = ttsCalls.length;
  await page.click('#ai-voices .voice[data-voice=Kore]');
  await page.select('#ai-style', 'bold');
  ok('chosen voice saved in settings', (await app(() => JSON.parse(localStorage.getItem('vts.ttsVoice')))) === 'Kore');
  await page.click('#ai-generate');
  await page.waitForFunction(() => window.VTS.app.project.voice && window.VTS.app.project.voice.source === 'gemini', { timeout: 20000 });
  const gv = await app(() => { const v = window.VTS.app.project.voice; return { d: v.duration, voice: v.ttsVoice, model: v.ttsModel, type: v.blob.type, size: v.blob.size }; });
  const gcalls = ttsCalls.slice(n0);
  ok('TTS fallback 3.8-flash-tts -> 3.8-flash-lite-tts', gcalls[0].model === 'gemini-3.8-flash-tts' && gcalls[1].model === 'gemini-3.8-flash-lite-tts' && gv.model === 'gemini-3.8-flash-lite-tts', gcalls.map((c) => c.model).join(' > '));
  ok('PCM wrapped into WAV voice track', gv.type === 'audio/wav' && Math.abs(gv.d - PCM.length / 48000) < 0.05 && gv.voice === 'Kore', JSON.stringify(gv));
  ok('bold style sent', /bold/.test(gcalls[1].body.contents[0].parts[0].speech_metadata.style) && gcalls[1].body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName === 'Kore');
  ok('working TTS model remembered', (await app(() => JSON.parse(localStorage.getItem('vts.ttsModel')))) === 'gemini-3.8-flash-lite-tts');
  ok('take card shows playback + regenerate', await app(() => !document.querySelector('#take-card').classList.contains('hidden') && !!document.querySelector('#take-audio').src && !document.querySelector('#ai-regenerate').classList.contains('hidden')));
  await shot('06c-voice-ai-ready');
  // 4) long script is chunked and concatenated
  n0 = ttsCalls.length;
  const long = await app(async () => { const txt = Array.from({ length: 30 }, (_, i) => 'This is sentence number ' + (i + 1) + ' of a very long script for testing.').join(' ');
    const r = await window.VTS.gemini.generateSpeech(txt, { voice: 'Kore', style: 'calm' }); const buf = await window.VTS.render.decodeBlob(r.blob); return { chunks: r.chunks, dur: buf.duration }; });
  ok('long script chunked + concatenated', long.chunks >= 3 && ttsCalls.length - n0 === long.chunks && Math.abs(long.dur - (long.chunks * PCM.length / 48000 + (long.chunks - 1) * 0.18)) < 0.1, JSON.stringify(long));
  // 5) older preview model gets a spoken style prefix instead of speech_metadata
  ttsMode = 'legacy31'; n0 = ttsCalls.length;
  const leg = await app(async () => { const r = await window.VTS.gemini.ttsRequest('Hello there.', { model: 'gemini-3.1-flash-tts-preview', voice: 'Puck', style: 'soft', prefix: 'Say in a soft, gentle, soothing voice' }); return { model: r.model, rate: r.rate, bytes: r.pcm.length }; });
  const lc = ttsCalls[n0];
  ok('3.1 preview model: style as spoken prefix', leg.model === 'gemini-3.1-flash-tts-preview' && /^Say in a soft, gentle, soothing voice: Hello there\./.test(lc.body.contents[0].parts[0].text) && !lc.body.contents[0].parts[0].speech_metadata, lc.body.contents[0].parts[0].text);
  await app(() => localStorage.setItem('vts.ttsModel', JSON.stringify('gemini-3.8-flash-lite-tts')));
  ttsMode = 'fallback';

  // Render (Teal & Orange, auto format)
  await page.click('.step[data-step=render]');
  await new Promise((r) => setTimeout(r, 1200));
  await shot('08-render-pane');
  const fmt = await app(() => window.VTS.render.pickVideoType('auto'));
  ok('MediaRecorder format picked', !!fmt, fmt);
  let lastInfo = null;
  async function renderAndSave(name) {
    await page.click('#render');
    await page.waitForSelector('#render-progress:not(.hidden)');
    await new Promise((r) => setTimeout(r, 4000));
    await shot('09-rendering-' + name);
    await page.waitForFunction(() => !document.querySelector('#result-card').classList.contains('hidden') && !window.VTS.app.project.video.stale && document.querySelector('#render-progress').classList.contains('hidden'), { timeout: 120000, polling: 500 });
    const info = await app(async () => {
      const v = window.VTS.app.project.video;
      const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(v.blob); });
      return { b64, type: v.type, mime: v.mime, size: v.size, duration: v.duration, ms: v.renderMs, frames: v.frames, fps: v.fps, avgDrawMs: v.avgDrawMs, visual: v.visual, illustrated: v.illustrated, status: document.querySelector('#render-status').textContent };
    });
    const ext = /mp4/.test(info.type) ? 'mp4' : 'webm';
    const file = path.join(OUT, name + '.' + ext);
    fs.writeFileSync(file, Buffer.from(info.b64, 'base64'));
    ok('render ' + name + ' produced file', info.size > 100000, file + ' ' + (info.size / 1048576).toFixed(1) + ' MB, ' + info.mime + ', ' + info.duration.toFixed(1) + ' s, ' + info.frames + ' frames drawn (' + (info.fps || 0).toFixed(1) + ' fps, avg draw ' + (info.avgDrawMs || 0).toFixed(1) + ' ms), took ' + (info.ms / 1000).toFixed(1) + ' s, visual=' + info.visual);
    info.file = file; lastInfo = info;
    return file;
  }
  // AI illustrations ON, but every image model returns 429 (no free tier) -> silent fallback to the built-in scenes
  await page.click('#opt-ai-images');
  ok('AI illustrations toggle default OFF, labelled as quota', (await app(() => window.VTS.app.project.look.aiImages)) === true && /quota/i.test(await page.$eval('#ai-img-row', (e) => e.textContent)));
  imageMode = 'quota'; const i0 = imageCalls.length;
  const f1 = await renderAndSave('render-teal');
  const t1 = lastInfo;
  ok('image quota -> silent fallback to built-in scenes', imageCalls.length - i0 >= 2 && t1.visual === 'scenes' && !t1.illustrated && /built-in animated scenes/.test(t1.status) && !/fail/i.test(t1.status), imageCalls.slice(i0).map((c) => c.model).join(' > ') + ' | ' + t1.status.slice(0, 160));
  ok('image request shape (IMAGE modality, 9:16, style prompt)', imageCalls[i0] && imageCalls[i0].body.generationConfig.responseModalities[0] === 'IMAGE' && imageCalls[i0].body.generationConfig.imageConfig.aspectRatio === '9:16' && /Flat 2D vector illustration/.test(imageCalls[i0].body.contents[0].parts[0].text) && imageCalls[i0].key === KEY);
  // Synchronous benchmark: draw frames across the whole timeline at 1080x1920, forcing a GPU flush each frame.
  const bench = await app(async (beats) => {
    const R = window.VTS.render; const out = {};
    for (const visual of ['scenes', 'classic']) {
      const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; const r = new R.Renderer(c); const ctx = c.getContext('2d');
      r.setup({ preset: 'teal', captionStyle: 'pop', captionCase: 'upper', visual, beats, speechStart: 0.3, speechEnd: 34.8, duration: 35.6 });
      await r.prepare(); for (let t = 0; t < 35.6; t += 1) r.draw(t); ctx.getImageData(0, 0, 1, 1);
      const N = 360; const t0 = performance.now(); let worst = 0;
      for (let k = 0; k < N; k++) { const f0 = performance.now(); r.draw(0.2 + k * 35 / N); ctx.getImageData(0, 0, 1, 1); worst = Math.max(worst, performance.now() - f0); }
      const ms = (performance.now() - t0) / N; out[visual] = { ms, fps: 1000 / ms, worst };
    }
    return out;
  }, PKG.beats);
  ok('scene renderer keeps up with realtime (sync bench >= 30 fps at 1080x1920)', bench.scenes.fps >= 30, 'scenes ' + bench.scenes.ms.toFixed(1) + ' ms/frame (' + bench.scenes.fps.toFixed(0) + ' fps, worst ' + bench.scenes.worst.toFixed(0) + ' ms) vs classic ' + bench.classic.ms.toFixed(1) + ' ms/frame (' + bench.classic.fps.toFixed(0) + ' fps); live render drew ' + t1.fps.toFixed(1) + ' fps (headless rAF-limited)');
  fs.writeFileSync(path.join(OUT, 'bench.json'), JSON.stringify({ bench, live: { fps: t1.fps, avgDrawMs: t1.avgDrawMs, frames: t1.frames } }, null, 1));
  await page.click('#opt-ai-images');
  // Save sample + preview frames from the actual render
  fs.copyFileSync(f1, path.join(PREVIEWS, 'why-you-overthink-at-night.' + path.extname(f1).slice(1)));
  const beatTimes = await app(async () => {
    const R = window.VTS.render; const p = window.VTS.app.project; const buf = R.trimBuffer(await R.decodeBlob(p.voice.blob), 58.9); const P = R.plan(buf);
    return R.buildTimeline(p.pkg.beats, P.speechStart, P.speechEnd).map((b, i) => ({ i, start: b.start, end: b.end, setting: p.pkg.beats[i].scene.setting, pose: p.pkg.beats[i].scene.pose }));
  });
  const want = [['01-bed-lying-awake', (b) => b.pose === 'lying-awake'], ['02-mind-space-brain', (b) => b.setting === 'abstract-mind-space' && b.pose === 'stressed'], ['03-phone-scrolling', (b) => b.setting === 'phone-screen'],
    ['04-office-brain-dump', (b) => b.setting === 'office'], ['05-park-meditating', (b) => b.pose === 'meditating'], ['06-celebration-cta', (b) => b.pose === 'celebrating']];
  const { execFileSync } = require('child_process'); let savedFrames = 0;
  for (const [name, fn] of want) {
    const bs = beatTimes.filter(fn); if (!bs.length) continue;
    const t = Math.min(bs[bs.length - 1].end - 0.15, bs[0].start + 1.3);
    try { execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', t.toFixed(2), '-i', f1, '-frames:v', '1', path.join(PREVIEWS, name + '.png')]); savedFrames++; } catch (e) { console.log('frame', name, e.message); }
  }
  ok('preview frames saved', savedFrames === 6, PREVIEWS);
  fs.writeFileSync(path.join(OUT, 'beat-times.json'), JSON.stringify(beatTimes, null, 1));
  // AI illustration path with a working image model (3.1-flash-lite-image 404 -> 3.1-flash-image returns a PNG)
  imageMode = 'png';
  const ai = await app(async (sc) => {
    localStorage.removeItem('vts.imageModel');
    const blob = await window.VTS.gemini.generateImage('Flat 2D vector illustration test', { aspectRatio: '9:16' });
    const R = window.VTS.render; const c = document.createElement('canvas'); c.width = 540; c.height = 960;
    const r = new R.Renderer(c);
    const beats = [{ text: 'Why do you overthink', weight: 4, step: 0, scene: sc, aiImage: blob }, { text: 'at night?', weight: 2, step: 0, scene: sc, aiImage: blob }];
    r.setup({ preset: 'teal', captionStyle: 'pop', captionCase: 'upper', visual: 'scenes', aiImages: true, beats, speechStart: 0.3, speechEnd: 3.3, duration: 3.6 });
    const n = await r.prepare(); r.draw(1.4);
    return { type: blob.type, size: blob.size, model: blob.model, n, saved: JSON.parse(localStorage.getItem('vts.imageModel')), png: c.toDataURL('image/png').split(',')[1] };
  }, PKG.beats[0].scene);
  ok('AI illustration generated + animated (fallback chain, remembered model)', ai.type === 'image/png' && ai.n >= 1 && ai.model === 'gemini-3.1-flash-image' && ai.saved === 'gemini-3.1-flash-image', JSON.stringify(Object.assign({}, ai, { png: undefined })));
  fs.writeFileSync(path.join(OUT, 'ai-illustration-mock-frame.png'), Buffer.from(ai.png, 'base64'));
  await shot('10-result');

  // Second render: captions only (classic), Moody Film, WebM, karaoke captions, watermark on
  await page.click('#vis-seg-render button[data-v=classic]');
  await page.click('#grades .grade:nth-child(2)');
  await page.click('#cap-style button[data-v=karaoke]');
  await page.click('#opt-watermark');
  await page.select('#opt-format', 'webm');
  const f2 = await renderAndSave('render-moody');
  ok('classic captions-only render still works', lastInfo.visual === 'classic');
  await page.click('#vis-seg-render button[data-v=scenes]');
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
  fs.writeFileSync(path.join(OUT, 'files.json'), JSON.stringify([f1, f2]));
  await browser.close(); srv.close();
  const failed = results.filter((r) => r[0] === 'FAIL');
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
