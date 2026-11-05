// v1.9 regression tests (headless Chrome, no network, no API key): story order prompt, "other" speaker,
// stickers that must match the spoken line, Kurzgesagt default palette, natural arm/hand drawing.
// Usage: node tests/fixes19.js
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path');
const WWW = path.join(__dirname, '..', 'www');
const results = []; const ok = (n, c, x) => { results.push(!!c); console.log(c ? 'PASS' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x)); };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = path.join(WWW, p);
  if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://127.0.0.1:' + srv.address().port + '/'); await page.waitForFunction(() => window.VTS && VTS.render && VTS.comedy && VTS.shortgen);
  const r = await page.evaluate(async () => {
    const TAU0 = Math.PI * 2; const C = VTS.comedy; const G = VTS.shortgen; const R = VTS.render; const o = {};
    o.prompt = G.buildComedyPrompt('the barber asks me a question', { tone: 'sarcastic', format: 'brain-vs-me', humour: 2 });
    o.barber = C.normSpeaker('barber'); o.cashier = C.normSpeaker('Cashier'); o.me = C.normSpeaker('me');
    o.fix = G.fixSpeaker({ speaker: 'me', text: 'Sir, I am holding scissors near your ears, use words.' }).speaker;
    o.keep = G.fixSpeaker({ speaker: 'me', text: 'Best I can do is a muffled thumbs up.' }).speaker;
    o.fitParalyzed = C.stickerFits('NOT AGAIN', 'How am I supposed to know, I am currently paralyzed by fear and cape fabric.');
    o.fitEvery = C.stickerFits('NOT AGAIN', 'Every single time.');
    o.fitEmoji = C.stickerFits('💀', 'anything');
    o.fitWait = C.stickerFits('WAIT WHAT', 'They do this all day.');
    o.kurz = !!R.PRESETS.kurz;
    // director: panicking beat with a non-matching line must not get NOT AGAIN
    const ac = R.audioCtx(); const buf = ac.createBuffer(1, 24000 * 8, 24000); const P = R.plan(buf, 60);
    const c = document.createElement('canvas'); c.width = 540; c.height = 960;
    const beats = [{ text: 'Do you like the length?', speaker: 'other', weight: 5, step: 0, scene: { setting: 'shop', pose: 'talking', emotion: 'neutral', props: [] } },
      { text: 'I am currently paralyzed by fear and cape fabric.', speaker: 'me', weight: 9, step: 0, punch: true, scene: { setting: 'shop', pose: 'stressed', emotion: 'panicking', props: [] } },
      { text: 'Every single time.', speaker: 'me', weight: 3, step: 0, scene: { setting: 'shop', pose: 'stressed', emotion: 'panicking', props: [] } }];
    const rr = new R.Renderer(c); rr.setup({ preset: 'kurz', aspect: '9:16', visual: 'scenes', captionStyle: 'tiktok', intensity: 'punchy', humour: 2, anim: '2d', motion: 'smooth', template: 'brain-vs-me', beats, speechStart: P.speechStart, speechEnd: P.speechEnd, duration: P.total, sections: null });
    await rr.prepare(); for (let t = 0; t < 6; t += 0.5) rr.draw(t);
    o.stickers = (rr.cx && rr.cx.stickers || []).map((s) => s.text + '@' + s.beat);
    o.cast = rr.timeline.map((b) => b.sc && [b.sc.cast1, b.sc.cast2].join('+'));
    o.order = rr.timeline.map((b) => b.text); o.starts = rr.timeline.map((b) => b.start);
    // v1.9 motion polish
    const S = VTS.scenes; const ps = (u) => S.poseSpec('walking', u / 1.15, { facing: 1 });
    const st = [0.05, 0.15, 0.25, 0.35, 0.45].map((u) => ps(u).legL); o.stanceY = st.every((f) => f.y === 190);
    const dx = st.slice(1).map((f, i) => f.x - st[i].x); o.stanceSteady = dx.every((d) => d < 0 && Math.abs(d - dx[0]) < 0.5);
    o.hipBob = [0, 0.25, 0.5].map((u) => ps(u).hipY);
    const bl = []; for (let t = 0; t < 30; t += 1 / 60) bl.push(S.blinkAt(t)); let starts = []; bl.forEach((v, i) => { if (v < 0.5 && (i === 0 || bl[i - 1] >= 0.5)) starts.push(i / 60); });
    const gaps = starts.slice(1).map((x, i) => +(x - starts[i]).toFixed(2)); o.blinkCount = starts.length; o.blinkIrregular = new Set(gaps.map((g) => Math.round(g * 5))).size > 2;
    const sr = 24000; const b2 = R.audioCtx().createBuffer(1, sr, sr); const ch = b2.getChannelData(0); for (let i = 0; i < sr; i++) ch[i] = i < sr / 2 ? 0.5 * Math.sin(i / sr * TAU0 * 150) : 0.5 * (Math.random() * 2 - 1);
    const env = VTS.motion.envelopeFromBuffer(b2); o.zLow = VTS.motion.zcrAt(env, 0.25); o.zHigh = VTS.motion.zcrAt(env, 0.75);
    const r2 = new R.Renderer(c); r2.setup({ preset: 'kurz', aspect: '9:16', visual: 'scenes', intensity: 'punchy', humour: 2, anim: '2d', motion: 'smooth', beats: beats.concat([{ text: 'Narrator here: totally fine.', speaker: 'narrator', weight: 4, step: 0, scene: { setting: 'void', pose: 'standing-thinking', emotion: 'calm', props: [] } }]), speechStart: P.speechStart, speechEnd: P.speechEnd, duration: P.total, sections: null });
    o.kurzTr = (r2.shots || []).map((s) => s.transition);
    return o;
  });
  ok('prompt demands chronological story order', /STORY ORDER/.test(r.prompt) && /other = anyone else/.test(r.prompt));
  ok('barber/cashier -> other speaker', r.barber === 'other' && r.cashier === 'other' && r.me === 'me', [r.barber, r.cashier]);
  ok('"Sir, ..." line reassigned to other', r.fix === 'other' && r.keep === 'me', [r.fix, r.keep]);
  ok('NOT AGAIN never on a non-matching line', !r.fitParalyzed && r.fitEvery && r.fitEmoji && !r.fitWait);
  ok('director: no NOT AGAIN on the "paralyzed" beat', !r.stickers.includes('NOT AGAIN@1'), r.stickers);
  ok('other speaker gets a second cast member', r.cast[0] === 'me+other', r.cast);
  ok('timeline keeps beat order', r.order.join('|') === ['Do you like the length?', 'I am currently paralyzed by fear and cape fabric.', 'Every single time.'].join('|') && r.starts.every((s, i) => !i || s >= r.starts[i - 1]), r.starts);
  ok('Kurzgesagt preset exists', r.kurz);
  ok('walk: planted foot stays on the ground and moves back at a steady speed (no sliding)', r.stanceY && r.stanceSteady);
  ok('walk: hips dip at contact and rise at passing', r.hipBob[0] > r.hipBob[1] && Math.abs(r.hipBob[0] - r.hipBob[2]) < 0.5, r.hipBob);
  ok('blinks are irregular (not a metronome) and natural rate', r.blinkCount >= 5 && r.blinkCount <= 16 && r.blinkIrregular, r.blinkCount);
  ok('lip-sync brightness: vowel-like tone narrow, hiss wide', r.zHigh > r.zLow + 0.3, [r.zLow, r.zHigh]);
  ok('Kurzgesagt look uses calm transitions only (no glitch/whip)', r.kurzTr.length > 0 && !r.kurzTr.some((x) => x === 'glitch' || x === 'whip'), r.kurzTr);
  ok('no page errors', !errors.length, errors);
  // anatomy: elbow chooser in scenes.js keeps elbows below/outside the shoulder-hand line
  const src = fs.readFileSync(path.join(WWW, 'js', 'scenes.js'), 'utf8');
  ok('arms use naturalElbow + forearm-aligned hands', /naturalElbow\(sx, sy, A\.x, A\.y, side\)/.test(src) && /this\.hand\(ctx, el, A, side, pal\)/.test(src));
  console.log(results.filter(Boolean).length + '/' + results.length + ' passed');
  await browser.close(); srv.close(); process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
