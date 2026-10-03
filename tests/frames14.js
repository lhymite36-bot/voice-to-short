// Renders comedy frames without audio: node tests/frames14.js <fixture.json> <outDir> [times...] (env LOOK='{"captionStyle":"tiktok"}')
const puppeteer = require('puppeteer-core'); const fs = require('fs'); const path = require('path');
const fx = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const OUT = process.argv[3] || path.join(__dirname, 'out', 'frames14'); fs.mkdirSync(OUT, { recursive: true });
const TIMES = process.argv.slice(4).map(Number);
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage(); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text()); }); page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('file://' + path.join(__dirname, 'frames14.html'));
  const look = Object.assign({ preset: 'warm', captionStyle: 'tiktok', intensity: 'punchy', humour: 2, progress: true, loop: true, template: fx.format || 'brain-vs-me' }, JSON.parse(process.env.LOOK || '{}'));
  const info = await page.evaluate(async (fx, look) => {
    await document.fonts.load('900 60px Montserrat'); await document.fonts.load('800 60px Montserrat');
    const R = window.VTS.render; const cv = document.getElementById('c');
    const [w, h] = R.frameSize(look.aspect || '9:16', 1); cv.width = w; cv.height = h;
    const words = fx.beats.reduce((a, b) => a + b.text.split(/\s+/).length, 0); const dur = Number(fx.dur || words / 2.7);
    const r = new R.Renderer(cv); r.setup(Object.assign({}, look, { beats: fx.beats, speechStart: 0.3, speechEnd: 0.3 + dur, duration: dur + 1.1, textHook: fx.textHook, ctaSticker: fx.cta }));
    await r.prepare(); window.__r = r;
    return { dur: dur + 1.1, beats: r.timeline.map((b) => [b.start.toFixed(2), b.fxType, b.sc && b.sc.speaker, b.sc && b.sc.count, b.sc && b.sc.setting, b.sc && b.sc.emotion]), cuts: r.cx.cuts, cues: r.cx.cues, stickers: r.cx.stickers.map((s) => s.text) };
  }, fx, look);
  console.log(JSON.stringify({ dur: info.dur, cuts: info.cuts.length, cues: info.cues.map((c) => c.id + '@' + c.t.toFixed(1)).join(' '), stickers: info.stickers }));
  info.beats.forEach((b) => console.log(' beat', b.join(' | ')));
  const times = TIMES.length ? TIMES : Array.from({ length: 16 }, (_, k) => +(k * info.dur / 16 + 0.05).toFixed(2));
  // play frames in order from 0 so smoothing/loop snapshots behave like a real render
  let t = 0; const step = 1 / 15; const per = [];
  for (const tt of times) {
    const url = await page.evaluate((from, to, step) => { const r = window.__r; let ms = 0; let n = 0; for (let x = from; x < to; x += step) { const a = performance.now(); r.draw(x); ms += performance.now() - a; n++; } const a = performance.now(); r.draw(to); ms += performance.now() - a; n++; window.__ms = ms / n; return document.getElementById('c').toDataURL('image/jpeg', 0.85); }, t, tt, step);
    per.push(await page.evaluate(() => window.__ms)); t = tt;
    fs.writeFileSync(path.join(OUT, 'f_' + String(tt.toFixed(2)).padStart(6, '0') + '.jpg'), Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log('avg draw ms', (per.reduce((a, x) => a + x, 0) / per.length).toFixed(1));
  await browser.close();
})();
