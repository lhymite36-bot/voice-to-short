// v1.3 end-to-end test (headless Chrome, mocked Gemini): keyword scenes, match badges, keyword picker, 4 frame shapes,
// long-video flow (outline -> sections with resume, chunked+cached AI voice, section teleprompter, segmented render with resume).
// Usage: node tests/e2e13.js   (needs /tmp/v13/{sketch,money}.{txt,wav} and /tmp/v13/sketch-24k.pcm from Piper)
const puppeteer = require('puppeteer-core');
const http = require('http'); const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const WWW = path.join(__dirname, '..', 'www'); const OUT = path.join(__dirname, 'out', 'v13'); fs.mkdirSync(OUT, { recursive: true });
const PREV = '/workspace/voice-to-short-previews/v1.3'; fs.mkdirSync(path.join(PREV, 'ratios'), { recursive: true });
const KEY = 'AQ.Ab8RN6FAKEFAKEFAKEFAKEFAKE_test-key';
const results = []; const ok = (name, cond, extra) => { results.push([cond ? 'PASS' : 'FAIL', name, extra || '']); console.log(cond ? 'PASS' : 'FAIL', name, extra || ''); };
const ONLY = process.env.ONLY || 'short,long';

// Mocked Gemini short package: Gemini-style keywords + a generic/wrong pose on some beats (the local lexicon must fix them).
function pkgFor(script, title, hooks, mocks) {
  const beats = []; let step = 0; let si = -1;
  for (const sent of script.match(/[^.!?]+[.!?]/g)) {
    const t = sent.trim(); const m = /^(One|Two|Three)\b/.exec(t); if (m) step = { One: 1, Two: 2, Three: 3 }[m[1]];
    const st = /^Follow/.test(t) ? 4 : step; if (!/^(One|Two|Three)\.$/.test(t)) si++;
    const mk = mocks[Math.min(mocks.length - 1, Math.max(0, si))];
    const w = t.split(/\s+/);
    for (let i = 0; i < w.length; i += 5) { let chunk = w.slice(i, i + 5); if (w.length - (i + 5) === 1) { chunk = w.slice(i); i++; } beats.push({ text: chunk.join(' '), weight: chunk.length, step: st, emphasis: '', visual: '', scene: JSON.parse(JSON.stringify(mk)) }); }
  }
  return { hooks, script, beats, title, description: 'A tiny habit that pays off.\nTry it this week.', hashtags: ['#habits', '#shorts'], pinnedComment: 'Will you try it?', thumbnailText: title.toUpperCase() };
}
const g = (setting, pose, keywords, objects, icon, props) => ({ setting, pose, emotion: 'happy', props: props || [], camera: 'static', callout: '', characters: 1, keywords, objects: objects || [], icon: icon || '' });
const SKETCH = pkgFor(fs.readFileSync('/tmp/v13/sketch.txt', 'utf8').trim(), 'Why you should sketch daily ✏️', ['Why you should sketch daily.', 'Five minutes of drawing changes everything.', 'Your sketchbook is a gym for your eyes.'], [
  g('office', 'talking', ['sketch'], ['sketchbook'], '✏️'), g('office', 'standing-thinking', ['pencil', 'sketchbook'], ['pencil', 'sketchbook'], '✏️'), g('office', 'talking', [], []),
  g('kitchen', 'drawing', ['draw', 'coffee mug'], ['mug'], '☕'), g('void', 'talking', ['mistakes'], [], ''), g('void', 'standing-thinking', ['hand', 'eyes'], [], '👀'),
  g('library', 'reading', ['month', 'pages'], ['sketchbook'], '📅'), g('bedroom-day', 'celebrating', ['progress', 'drawings'], [], '📈'), g('park', 'meditating', ['meditation'], [], '🧘'),
  g('office', 'talking', ['pencil'], ['pencil'], '✏️'), g('office', 'waving', ['follow'], [], '👋')]);
const MONEY = pkgFor(fs.readFileSync('/tmp/v13/money.txt', 'utf8').trim(), 'How to save money as a student 💸', ['How to save money as a student.', 'Broke by the 20th? Try this.', 'Students: steal these money habits.'], [
  g('classroom', 'talking', ['save money', 'student'], ['coins'], '💰'), g('void', 'standing-thinking', ['habits', 'budget'], [], ''), g('office', 'writing', ['track', 'rupee', 'notebook'], ['notebook'], '📒'),
  g('kitchen', 'cooking', ['cook', 'food', 'textbooks'], ['frying pan'], '🍳'), g('shop', 'shopping', ['discount', 'bus', 'cab'], ['shopping bags'], '🛍️'), g('bedroom-day', 'talking', ['cash', 'savings jar'], ['jar'], '🫙'),
  g('void', 'celebrating', ['savings', 'money'], ['coins'], '💰'), g('void', 'waving', ['follow', 'tips'], [], '👋')]);
// Long video mock: outline + 8 sections of real sentences (keywords vary so scenes vary).
const LONG_SECS = [
  ['Why sketching matters', 'Why should you sketch every day? Because drawing trains your eyes. A pencil and a sketchbook are all you need. In this video you will learn a simple daily routine.'],
  ['Pick your tools', 'Grab a cheap sketchbook and one soft pencil. Keep them in your bag. Put the sketchbook on your desk at night so you see it in the morning.'],
  ['The morning drawing', 'Every morning, draw your coffee mug before you drink it. Set a timer for five minutes. Do not erase anything. Just keep the pencil moving.'],
  ['Draw outside', 'On weekends, take your sketchbook to the park. Draw a tree, a dog or a bicycle. Sit on a bench and sketch people walking past.'],
  ['Learn from others', 'Visit a library and read a book about drawing. Watch a short tutorial on your laptop. Copy one master drawing each week.'],
  ['Stay consistent', 'Mark each day on a calendar when you sketch. Share one drawing with a friend on your phone. Celebrate every full week.'],
  ['Handle bad days', 'Some drawings will look terrible. That is fine. Breathe, stretch, and draw a simple cup or apple instead. Sleep well and try again tomorrow.'],
  ['Look back and grow', 'After a month, flip back through the pages and see your progress. Your hand now follows your eyes. So sharpen that pencil and start today. Follow for more tiny habits.'],
];
function sectionResp(i) {
  const text = LONG_SECS[i][1]; const beats = [];
  text.match(/[^.!?]+[.!?]/g).forEach((s) => { const w = s.trim().split(/\s+/); for (let k = 0; k < w.length; k += 5) { const chunk = w.slice(k, k + 5); beats.push({ text: chunk.join(' '), weight: chunk.length, step: i === 7 && /Follow/.test(s) ? 4 : 0, emphasis: '', visual: '', scene: g('office', 'talking', [], [], '') }); } });
  return { text, beats };
}
const OUTLINE = { hooks: ['Why should you sketch every day?', 'Draw for five minutes a day and watch this happen.', 'Your sketchbook is a gym for your eyes.'], title: 'Sketch daily: a 10-minute guide ✏️',
  sections: LONG_SECS.map(([t, x]) => ({ title: t, summary: x.split('.')[0], points: x.split('.').slice(1, 3).map((p) => p.trim()).filter(Boolean) })), description: 'A simple daily drawing habit.\nTools, routine and staying consistent.', hashtags: ['#sketching', '#drawing'], pinnedComment: 'What will you draw first?', thumbnailText: 'SKETCH DAILY' };

function serve() {
  const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
    const f = path.join(WWW, p);
    if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', f]).toString());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = await serve(); const ORIGIN = 'http://127.0.0.1:' + srv.address().port;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 0,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=/tmp/v13/sketch.wav', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.setRequestInterception(true);
  let PKG = SKETCH; const calls = []; const ttsCalls = []; let failSection = -1; let failTtsAt = -1;
  const PCM = fs.readFileSync('/tmp/v13/sketch-24k.pcm').subarray(0, 24000 * 2 * 12);
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.hostname !== 'generativelanguage.googleapis.com') return req.continue();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    const json = (status, obj) => req.respond({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(obj) });
    let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (_) { /* ignore */ }
    const m = /\/models\/([^:]+):generateContent$/.exec(u.pathname); const model = m && decodeURIComponent(m[1]);
    const text = body && body.contents && body.contents[0].parts[0].text || '';
    if (model && /tts/.test(model)) {
      ttsCalls.push({ model, text });
      if (failTtsAt === ttsCalls.length) return json(400, { error: { code: 400, message: 'Mock TTS failure', status: 'INVALID_ARGUMENT' } });
      return json(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: PCM.toString('base64') } }] }, finishReason: 'STOP' }] });
    }
    if (model && /image/.test(model)) return json(429, { error: { code: 429, message: 'quota, limit: 0', status: 'RESOURCE_EXHAUSTED' } });
    if (u.pathname.endsWith('/models')) return json(200, { models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }] });
    calls.push({ model, text: text.slice(0, 60) });
    const reply = (obj) => json(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }] });
    if (/^OUTLINE REQUEST/.test(text)) return reply(OUTLINE);
    const sm = /^SECTION REQUEST (\d+) of (\d+)/.exec(text);
    if (sm) { const i = Number(sm[1]) - 1; if (i === failSection) { failSection = -1; return json(400, { error: { code: 400, message: 'Mock section failure', status: 'INVALID_ARGUMENT' } }); } return reply(sectionResp(i)); }
    return reply(PKG);
  });
  const origClick = page.click.bind(page);
  page.click = async (sel) => { await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' })); await sleep(60); return origClick(sel); };
  const app = (fn, ...a) => page.evaluate(fn, ...a);
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });
  await page.goto(ORIGIN + '/'); await page.waitForSelector('#idea');
  await app((k) => { localStorage.setItem('vts.apiKey', k); localStorage.setItem('vts.handle', JSON.stringify('@sketchlab')); }, KEY);
  await page.reload(); await page.waitForSelector('#idea');

  // read a video out of the page in 8 MB pieces (works for blob or stored long renders)
  async function pullVideo(file) {
    const size = await app(async () => { const v = window.VTS.app.project.video; window.__vf = v.blob || await window.VTS.segments.openStore(v.stored.store).then((st) => st.reader(v.stored.name)).then((rd) => rd.file); return window.__vf.size; });
    const fd = fs.openSync(file, 'w'); const CH = 8 * 1024 * 1024;
    for (let off = 0; off < size; off += CH) {
      const b64 = await app(async (o, n) => { const b = window.__vf.slice(o, o + n); return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(b); }); }, off, Math.min(CH, size - off));
      fs.writeSync(fd, Buffer.from(b64, 'base64'));
    }
    fs.closeSync(fd); return size;
  }
  async function renderNow(timeout) {
    await page.click('#render');
    await page.waitForSelector('#render-progress:not(.hidden)');
    try { await page.waitForFunction(() => document.querySelector('#render-progress').classList.contains('hidden'), { timeout: timeout || 180000, polling: 500 }); } catch (e) { console.log('RENDER TIMEOUT', await app(() => document.querySelector('#render-label').textContent + ' | ' + document.querySelector('#render-bar').style.width + ' | ' + document.querySelector('#render-status').textContent), errors); throw e; }
    return app(() => { const v = window.VTS.app.project.video; return v && { w: v.width, h: v.height, d: v.duration, type: v.type, aspect: v.aspect, ms: v.renderMs, stored: v.stored, segments: v.segments, status: document.querySelector('#render-status').textContent }; });
  }
  async function beatTimes() {
    return app(async () => { const R = window.VTS.render; const p = window.VTS.app.project; const buf = R.trimBuffer(await R.decodeBlob(p.voice.blob), 58.9); const P = R.plan(buf);
      return R.buildTimeline(p.pkg.beats, P.speechStart, P.speechEnd).map((b, i) => ({ i, start: b.start, end: b.end, text: p.pkg.beats[i].text, pose: p.pkg.beats[i].scene.pose, setting: p.pkg.beats[i].scene.setting, props: p.pkg.beats[i].scene.props, icon: p.pkg.beats[i].scene.icon })); });
  }
  const frame = (file, t, out) => execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', t.toFixed(2), '-i', file, '-frames:v', '1', out]);

  if (ONLY.includes('short')) {
    // ---------- Sketch: keyword scenes ----------
    await page.type('#idea', 'why you should sketch daily, pencil, sketchbook, small drawings every morning');
    ok('length select: 6 options, default 30-60 s for 9:16', await app(() => document.querySelectorAll('#opt-length option').length === 7 && document.querySelector('#opt-length').value === '60'));
    await page.select('#opt-length', '1200');
    ok('20 min on 9:16 warns about the 3-min Shorts limit', /3 minutes/.test(await page.$eval('#length-note', (e) => e.textContent)), await page.$eval('#length-note', (e) => e.textContent.slice(0, 120)));
    await page.select('#opt-length', '60');
    await page.click('#generate'); await page.waitForSelector('#script-body:not(.hidden)', { timeout: 20000 });
    const sc = await app(() => window.VTS.app.project.pkg.beats.map((b) => ({ text: b.text, pose: b.scene.pose, setting: b.scene.setting, props: b.scene.props, icon: b.scene.icon, m: window.VTS.scenes.matchScore(b.text, b.scene) })));
    const pencilBeats = sc.filter((b) => /pencil|sketchbook/i.test(b.text));
    ok('pencil/sketchbook beats show drawing tools (lexicon override of a generic Gemini scene)', pencilBeats.length >= 2 && pencilBeats.every((b) => b.pose === 'drawing' || b.props.includes('pencil') || b.props.includes('sketchbook')), JSON.stringify(pencilBeats.map((b) => [b.text, b.pose, b.props.join('+')])));
    const mug = sc.find((b) => /coffee mug/i.test(b.text));
    ok('coffee mug beat shows a mug/coffee', !!mug && (mug.props.some((p) => /mug|coffee/.test(p)) || /coffee/.test(mug.pose) || mug.pose === 'drawing'), mug && JSON.stringify(mug));
    const scored = sc.filter((b) => b.m && b.m.score != null); const avg = scored.reduce((a, b) => a + b.m.score, 0) / scored.length;
    ok('keyword match average >= 70%', avg >= 70, avg.toFixed(0) + '% over ' + scored.length + ' scored beats');
    ok('match badges + summary rendered', (await page.$$eval('#beats .b-match', (e) => e.length)) === sc.length && /Keyword match/.test(await page.$eval('#match-summary', (e) => e.textContent)), await page.$eval('#match-summary', (e) => e.textContent));
    const card = await app(() => window.VTS.scenes.normalizeScene(null, 'The volcano erupted.', 0, null));
    ok('unknown keyword -> keyword icon card with emoji', card.setting === 'keyword-card' && card.icon === '1f30b', JSON.stringify({ s: card.setting, icon: card.icon, w: card.iconWord }));
    // low-match flag + picker
    const mi = sc.findIndex((b) => /coffee mug/i.test(b.text));
    await app((i) => { const b = window.VTS.app.project.pkg.beats[i]; b.scene = window.VTS.scenes.normalizeScene({ setting: 'bathroom', pose: 'showering', emotion: 'happy', props: [] }, 'zzz', 0, null); window.VTS.app.showStep('idea'); window.VTS.app.showStep('script'); }, mi);
    ok('mismatched scene is flagged ⚠', await app((i) => document.querySelectorAll('#beats .beat')[i].classList.contains('low') && /⚠/.test(document.querySelectorAll('#beats .beat')[i].querySelector('.b-match').textContent), mi));
    const bsel = '#beats .beat:nth-child(' + (mi + 1) + ')';
    await page.click(bsel + ' .b-scene-btn'); await page.waitForSelector(bsel + ' .sc-find');
    await page.type(bsel + ' .sc-find', 'coffee mug'); await page.click(bsel + ' .sc-find-go');
    let pb = await app((i) => window.VTS.app.project.pkg.beats[i].scene, mi);
    ok('picker: "coffee mug" puts a mug in the scene', pb.props.some((p) => /mug|coffee/.test(p)) || /coffee/.test(pb.pose), JSON.stringify({ pose: pb.pose, props: pb.props }));
    await page.type(bsel + ' .sc-find', 'giraffe'); await page.click(bsel + ' .sc-find-go');
    pb = await app((i) => window.VTS.app.project.pkg.beats[i].scene, mi);
    ok('picker: "giraffe" (not in library) -> giraffe icon card', pb.setting === 'keyword-card' && pb.icon === '1f992', JSON.stringify({ s: pb.setting, icon: pb.icon }));
    await page.type(bsel + ' .sc-find', 'Action · Drawing / sketching'); await page.click(bsel + ' .sc-find-go');
    pb = await app((i) => window.VTS.app.project.pkg.beats[i].scene, mi);
    ok('picker: action entry sets the action', pb.pose === 'drawing', pb.pose + ' @ ' + pb.setting);
    ok('picker datalist has props + actions + emoji', await app(() => { const o = Array.from(document.querySelectorAll('#kw-list option')).map((x) => x.value); return o.filter((x) => /^Prop/.test(x)).length >= 120 && o.filter((x) => /^Action/.test(x)).length >= 40 && o.filter((x) => /^Icon/.test(x)).length > 1000; }));
    await shot('01-script-match');
    // restore the scene from the lexicon for the render
    await app((i) => { const b = window.VTS.app.project.pkg.beats[i]; b.scene = window.VTS.scenes.normalizeScene(null, b.text, b.step, null); }, mi);
    // voice: import Piper sketch voice
    await page.click('.step[data-step=voice]');
    await (await page.$('#import-audio')).uploadFile('/tmp/v13/sketch.wav');
    await page.waitForFunction(() => window.VTS.app.project.voice && window.VTS.app.project.voice.source === 'import', { timeout: 10000 });
    await page.click('.step[data-step=render]'); await sleep(800);
    ok('frame shape buttons (4) with 9:16 default', await app(() => document.querySelectorAll('#aspect-seg button').length === 4 && document.querySelector('#aspect-seg button.on').dataset.v === '9:16'));
    const want = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080], '4:5': [1080, 1350] };
    const bt = await beatTimes(); const pT = bt.find((b) => b.pose === 'drawing' && /pencil|sketchbook/i.test(b.text)) || bt.find((b) => b.pose === 'drawing');
    for (const a of ['9:16', '16:9', '1:1', '4:5']) {
      await page.click('#aspect-seg button[data-v="' + a + '"]'); await sleep(500);
      if (a === '9:16') ok('render button names size + shape', /1080×1920 9:16/.test(await page.$eval('#render span', (e) => e.textContent)), await page.$eval('#render span', (e) => e.textContent));
      await shot('02-render-pane-' + a.replace(':', 'x'));
      const r = await renderNow(); ok('video remembers its shape ' + a, r.aspect === a);
      const f = path.join(OUT, 'sketch-' + a.replace(':', 'x') + (/mp4/.test(r.type) ? '.mp4' : '.webm')); await pullVideo(f);
      const pr = probe(f); const v = pr.streams.find((s) => s.codec_type === 'video'); const au = pr.streams.find((s) => s.codec_type === 'audio');
      ok('ffprobe ' + a + ' = ' + want[a].join('x') + ' with audio', v.width === want[a][0] && v.height === want[a][1] && !!au && Math.abs(Number(pr.format.duration) - r.d) < 0.6, v.width + 'x' + v.height + ' ' + v.codec_name + '/' + (au && au.codec_name) + ' ' + Number(pr.format.duration).toFixed(2) + ' s, render ' + (r.ms / 1000).toFixed(1) + ' s');
      frame(f, pT.start + 1.2, path.join(PREV, 'ratios', 'sketch-' + a.replace(':', 'x') + '.png'));
      if (a === '9:16') {
        fs.copyFileSync(f, path.join(PREV, 'why-you-should-sketch-daily' + path.extname(f)));
        const picks = [['sk-01-hook', bt[0]], ['sk-02-pencil-sketchbook', pT], ['sk-03-mug', bt.find((b) => /mug/i.test(b.text))], ['sk-04-pages', bt.find((b) => /pages/i.test(b.text))], ['sk-05-meditation', bt.find((b) => /meditation/i.test(b.text))], ['sk-06-cta', bt[bt.length - 1]]];
        picks.forEach(([n, b]) => { if (b) frame(f, Math.min(b.end - 0.1, b.start + 1.0), path.join(PREV, n + '.png')); });
      }
    }
    await page.click('#aspect-seg button[data-v="9:16"]');
    // ---------- Money sample ----------
    await page.click('#new-project'); PKG = MONEY;
    await page.type('#idea', 'how to save money as a student, track spending, cook at home, bus, savings jar');
    await page.click('#generate'); await page.waitForSelector('#script-body:not(.hidden)', { timeout: 20000 });
    const ms = await app(() => window.VTS.app.project.pkg.beats.map((b) => ({ text: b.text, pose: b.scene.pose, setting: b.scene.setting, props: b.scene.props, m: window.VTS.scenes.matchScore(b.text, b.scene) })));
    const pick = (re) => ms.find((b) => re.test(b.text)) || {};
    ok('money beats: cook->cooking, bus->bus, jar->savings, notebook->writing', /cook/.test(pick(/Cook at/).pose) && (pick(/bus/).setting === 'bus' || /bus/.test(pick(/bus/).pose) || (pick(/bus/).props || []).includes('bus')) && pick(/jar/).props.some((p) => /jar|coin|money/.test(p)), JSON.stringify([pick(/Cook at/), pick(/bus/), pick(/jar/)].map((b) => [b.text, b.pose, b.setting, (b.props || []).join('+')])));
    const mavg = ms.filter((b) => b.m && b.m.score != null).reduce((a, b, _, arr) => a + b.m.score / arr.length, 0);
    ok('money keyword match average >= 70%', mavg >= 70, mavg.toFixed(0) + '%');
    await page.click('.step[data-step=voice]');
    await (await page.$('#import-audio')).uploadFile('/tmp/v13/money.wav');
    await page.waitForFunction(() => window.VTS.app.project.voice && window.VTS.app.project.voice.source === 'import', { timeout: 10000 });
    await page.click('.step[data-step=render]'); await sleep(600);
    const r2 = await renderNow(); const f2 = path.join(OUT, 'money-9x16' + (/mp4/.test(r2.type) ? '.mp4' : '.webm')); await pullVideo(f2);
    const p2 = probe(f2); ok('money render 1080x1920 with audio', p2.streams.some((s) => s.width === 1080 && s.height === 1920) && p2.streams.some((s) => s.codec_type === 'audio'), Number(p2.format.duration).toFixed(2) + ' s');
    fs.copyFileSync(f2, path.join(PREV, 'how-to-save-money-as-a-student' + path.extname(f2)));
    const bt2 = await beatTimes();
    [['sm-01-hook', /save money/i], ['sm-02-notebook', /notebook/i], ['sm-03-cook', /Cook at/i], ['sm-04-textbooks', /textbooks/i], ['sm-05-discount', /discount/i], ['sm-06-bus', /bus/i], ['sm-07-jar', /jar/i], ['sm-08-big-money', /big money/i]].forEach(([n, re]) => { const b = bt2.find((x) => re.test(x.text)); if (b) frame(f2, Math.min(b.end - 0.1, b.start + 1.0), path.join(PREV, n + '.png')); });
    fs.writeFileSync(path.join(OUT, 'short-scenes.json'), JSON.stringify({ sketch: sc, money: ms, beatTimesSketch: bt, beatTimesMoney: bt2 }, null, 1));
  }

  if (ONLY.includes('long')) {
    // ---------- Long video flow ----------
    await page.click('#new-project'); calls.length = 0;
    await page.type('#idea', 'a 10 minute video about sketching daily: tools, morning routine, drawing outside, learning, consistency, bad days, progress');
    await page.select('#opt-length', '600');
    failSection = 2; // section 3 fails once (non-retryable) -> progress saved
    await page.click('#generate');
    await page.waitForFunction(() => /Progress is saved/.test(document.querySelector('#gen-status').textContent), { timeout: 30000 });
    const part = await app(() => ({ n: window.VTS.app.project.genPartial.sections.length, outline: !!window.VTS.app.project.genPartial.outline }));
    ok('long script: section failure keeps progress (outline + 2 sections saved)', part.outline && part.n === 2, JSON.stringify(part) + ' | ' + (await page.$eval('#gen-status', (e) => e.textContent)).slice(0, 140));
    const c0 = calls.length;
    await page.click('#generate');
    await page.waitForSelector('#script-body:not(.hidden)', { timeout: 30000 });
    const resumed = calls.slice(c0).map((c) => c.text.split('\n')[0]);
    ok('resume: outline + sections 1-2 not requested again', !resumed.some((t) => /OUTLINE|SECTION REQUEST [12] of/.test(t)) && resumed.length === 6 && /SECTION REQUEST 3 of 8/.test(resumed[0]), resumed.join(' | '));
    const lp = await app(() => { const p = window.VTS.app.project.pkg; return { long: p.long, secs: p.sections.length, beats: p.beats.length, chapters: p.beats.filter((b) => b.chapter).length, desc: /Chapters:/.test(p.description), settings: new Set(p.beats.map((b) => b.scene.setting)).size, actions: new Set(p.beats.map((b) => b.scene.pose)).size, partial: window.VTS.app.project.genPartial }; });
    ok('stitched long package: 8 sections, chapters, description chapters, varied scenes', lp.long && lp.secs === 8 && lp.chapters === 7 && lp.desc && lp.settings >= 6 && lp.actions >= 8 && !lp.partial, JSON.stringify(lp));
    ok('section filter shows one part at a time', await app(() => !document.querySelector('#beat-section-row').classList.contains('hidden') && document.querySelectorAll('#beat-section option').length === 8 && document.querySelectorAll('#beats .beat').length < window.VTS.app.project.pkg.beats.length));
    await page.select('#beat-section', '3'); await sleep(200);
    ok('section 4 beats listed', await app(() => Array.from(document.querySelectorAll('#beats .b-text')).some((e) => /park/.test(e.value))));
    ok('word target follows the 10 min length', /10 min/.test(await page.$eval('#script-est', (e) => e.textContent)), await page.$eval('#script-est', (e) => e.textContent));
    await shot('03-long-script');
    // AI voice in chunks with a failure then cached resume
    await page.click('.step[data-step=voice]');
    failTtsAt = ttsCalls.length + 4; const t0 = ttsCalls.length;
    await page.click('#ai-generate');
    await page.waitForFunction(() => /AI voice failed|Mock TTS/.test(document.querySelector('#voice-status').textContent), { timeout: 30000 });
    ok('AI voice: chunk 4 fails, error shown', ttsCalls.length - t0 === 4, (await page.$eval('#voice-status', (e) => e.textContent)).slice(0, 120));
    const t1 = ttsCalls.length;
    await page.click('#ai-generate');
    await page.waitForFunction(() => window.VTS.app.project.voice && window.VTS.app.project.voice.parts, { timeout: 30000 });
    const lv = await app(() => { const v = window.VTS.app.project.voice; return { parts: v.parts.length, d: v.duration, secs: new Set(v.parts.map((p) => p.section)).size }; });
    ok('AI voice resume: 3 cached chunks reused, 5 requested, 8 parts', ttsCalls.length - t1 === 5 && lv.parts === 8 && lv.secs === 8 && Math.abs(lv.d - 96) < 0.5, JSON.stringify(lv) + ' new calls=' + (ttsCalls.length - t1));
    ok('long voice plays as one lazily joined WAV', await app(() => !!document.querySelector('#take-audio').src));
    // Section teleprompter with pause/resume + retake
    await page.click('#opt-record'); await page.waitForSelector('#prompter:not(.hidden)');
    ok('teleprompter section mode', await app(() => !document.querySelector('#p-sections').classList.contains('hidden') && /Part 1 \/ 8/.test(document.querySelector('#p-sec-label').textContent) && document.querySelector('#p-max').textContent.includes('19:')));
    await page.click('#p-rec'); await sleep(2600 + 2000);
    await page.click('#p-pause'); await sleep(1200);
    const pausedState = await app(() => document.querySelector('#p-pause').textContent);
    await page.click('#p-pause'); await sleep(1500);
    await page.click('#p-rec'); await page.waitForSelector('#p-retake:not(.hidden)', { timeout: 8000 });
    ok('pause/resume during a take', /Resume/.test(pausedState));
    await page.click('#p-retake');
    await page.click('#p-rec'); await sleep(2600 + 2000); await page.click('#p-rec'); await page.waitForSelector('#p-use:not(.hidden)', { timeout: 8000 });
    await page.click('#p-use'); // next part
    ok('next part after a take', await app(() => /Part 2 \/ 8/.test(document.querySelector('#p-sec-label').textContent)));
    await page.click('#p-rec'); await sleep(2600 + 2000); await page.click('#p-rec'); await page.waitForSelector('#p-finish:not(.hidden)', { timeout: 8000 });
    await shot('04-teleprompter-sections');
    await page.click('#p-finish');
    await page.waitForFunction(() => window.VTS.app.project.voice && window.VTS.app.project.voice.source === 'mic', { timeout: 15000 });
    const mv = await app(() => { const v = window.VTS.app.project.voice; return { parts: v.parts.length, secs: v.parts.map((p) => p.section), d: v.duration }; });
    ok('section takes become voice parts', mv.parts === 2 && mv.secs.join() === '0,1' && mv.d > 3, JSON.stringify(mv));
    // back to the cached AI voice (0 new calls)
    const t2 = ttsCalls.length; await page.click('#ai-generate');
    await page.waitForFunction(() => window.VTS.app.project.voice && window.VTS.app.project.voice.source === 'gemini', { timeout: 30000 });
    ok('AI voice fully from cache (no requests)', ttsCalls.length === t2);
    // Segmented render (16:9, auto quality -> 720p) with cancel + resume
    await page.click('.step[data-step=render]'); await sleep(800);
    await page.click('#aspect-seg button[data-v="16:9"]'); await sleep(800);
    ok('long render note + preview of part 1', /parts/.test(await page.$eval('#render-note', (e) => e.textContent)) && /part 1/i.test(await page.$eval('#preview-time', (e) => e.textContent)), await page.$eval('#preview-time', (e) => e.textContent));
    await shot('05-long-render-pane');
    const rt0 = Date.now();
    await page.click('#render');
    await page.waitForFunction(() => { const s = window.VTS.app.project.renderState; return s && s.done && s.done.length === 1; }, { timeout: 200000, polling: 500 });
    await shot('06-long-rendering');
    const lbl = await page.$eval('#render-label', (e) => e.textContent);
    await page.click('#render-cancel');
    await page.waitForFunction(() => document.querySelector('#render-progress').classList.contains('hidden'), { timeout: 30000 });
    const btn = await page.$eval('#render span', (e) => e.textContent);
    ok('progress label with part + ETA; cancel keeps finished parts', /Part \d+ \/ \d+/.test(lbl) && /left/.test(lbl) && /Resume render \(1 \/ 2/.test(btn) && /paused/i.test(await page.$eval('#render-status', (e) => e.textContent)), lbl + ' | ' + btn);
    const lr = await renderNow(300000);
    const rtime = (Date.now() - rt0) / 1000;
    ok('resumed long render finished: stored WebM joined from 2 parts', lr && lr.stored && lr.stored.name && lr.segments === 2 && lr.w === 1280 && lr.h === 720, JSON.stringify(lr));
    const lf = path.join(OUT, 'long-ui-16x9.webm'); const lsz = await pullVideo(lf);
    const lpr = probe(lf); const expect = lv.d + 0.45 * 7 + 0.3 + 0.8;
    ok('ffprobe long UI render: 1280x720 VP8+Opus, full duration', lpr.streams.some((s) => s.codec_name === 'vp8' && s.width === 1280) && lpr.streams.some((s) => s.codec_name === 'opus') && Math.abs(Number(lpr.format.duration) - lr.d) < 0.5, Number(lpr.format.duration).toFixed(2) + ' s (plan ' + lr.d.toFixed(2) + ', voice ' + lv.d.toFixed(1) + ' + gaps ≈ ' + expect.toFixed(1) + ') ' + (lsz / 1048576).toFixed(1) + ' MB, wall ' + rtime.toFixed(0) + ' s');
    { const pk = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'packet=stream_index,pts_time', '-of', 'json', lf], { maxBuffer: 1 << 28 }).toString()).packets;
      const gaps = (i) => { const t = pk.filter((x) => x.stream_index === i).map((x) => Number(x.pts_time)).sort((x, y) => x - y); const d = t.slice(1).map((x, k) => x - t[k]); const med = d.slice().sort((x, y) => x - y)[d.length >> 1]; return { max: Math.max(...d) * 1000, med: med * 1000, last: t[t.length - 1] }; };
      const vi = lpr.streams.findIndex((x) => x.codec_type === 'video'); const ai = lpr.streams.findIndex((x) => x.codec_type === 'audio');
      const gv = gaps(vi); const ga = gaps(ai);
      ok('long UI render: no gaps at the join (packet spacing)', gv.max < 80 && ga.max - ga.med < 40 && Math.abs(gv.last - ga.last) < 0.3, 'video max gap ' + gv.max.toFixed(0) + ' ms, audio max gap ' + ga.max.toFixed(0) + ' ms (packet ' + ga.med.toFixed(0) + ' ms), last pts v/a ' + gv.last.toFixed(2) + '/' + ga.last.toFixed(2)); }
    frame(lf, 40, path.join(PREV, 'long', 'ui-16x9-long-flow.png'));
    ok('save/share stored file (web download path)', await app(async () => { document.querySelector('#save-video').click(); await new Promise((r) => setTimeout(r, 1500)); return !document.querySelector('#save-video').disabled; }));
    await page.click('.tab[data-view=library]'); await page.waitForSelector('.lib-item');
    ok('library shows 16:9 long video', /16:9/.test(await page.$eval('.lib-item:first-child .lib-meta', (e) => e.textContent)), await page.$eval('.lib-item:first-child .lib-meta', (e) => e.textContent));
    await shot('07-library');
  }
  ok('no page errors', errors.length === 0, errors.join(' | ').slice(0, 600));
  await browser.close(); srv.close();
  const failed = results.filter((r) => r[0] === 'FAIL');
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
