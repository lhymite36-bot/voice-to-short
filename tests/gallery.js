// Renders scene specs to PNGs for visual review: node tests/gallery.js [outDir] [preset]
const puppeteer = require('puppeteer-core');
const fs = require('fs'); const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'out', 'gallery'); const PRESET = process.argv[3] || 'teal';
fs.mkdirSync(OUT, { recursive: true });
const SPECS = JSON.parse(process.env.SPECS || 'null') || [
  ['bed-night', { setting: 'bedroom-night', pose: 'lying-awake', emotion: 'anxious', props: ['thought-bubbles', 'clock'], callout: '2:07 AM' }, 2.2],
  ['bed-phone', { setting: 'bedroom-night', pose: 'scrolling-phone', emotion: 'tired', props: ['zzz'] }, 1.5],
  ['brain', { setting: 'abstract-mind-space', pose: 'standing-thinking', emotion: 'surprised', props: ['brain', 'sparkles'], callout: 'Cortisol ↑' }, 1.6],
  ['phone', { setting: 'phone-screen', pose: 'scrolling-phone', emotion: 'neutral', props: ['heart'] }, 1.3],
  ['celebrate', { setting: 'park', pose: 'celebrating', emotion: 'happy', props: ['sparkles', 'confetti', 'sun'] }, 1.4],
  ['office', { setting: 'office', pose: 'talking', emotion: 'tired', props: ['coffee', 'checklist', 'clock'] }, 1.8],
  ['classroom', { setting: 'classroom', pose: 'talking', emotion: 'happy', props: ['lightbulb'] }, 1.2],
  ['street', { setting: 'street', pose: 'walking', emotion: 'calm', props: ['cloud'] }, 1.1],
  ['cafe', { setting: 'cafe', pose: 'talking', emotion: 'happy', props: ['coffee', 'speech-bubbles'], count: 2 }, 1.5],
  ['void-stress', { setting: 'void', pose: 'stressed', emotion: 'anxious', props: ['question-marks', 'weights'] }, 1.4],
  ['void-chains', { setting: 'void', pose: 'sitting-head-in-hands', emotion: 'sad', props: ['chains', 'cloud'] }, 1.4],
  ['meditate', { setting: 'abstract-mind-space', pose: 'meditating', emotion: 'calm', props: ['sparkles', 'heart'] }, 1.4],
  ['day-journal', { setting: 'bedroom-day', pose: 'standing-thinking', emotion: 'calm', props: ['notebook', 'lightbulb', 'mirror'] }, 1.6],
  ['park-run', { setting: 'park', pose: 'running', emotion: 'happy', props: ['stairs', 'arrows'] }, 1.3],
  ['sleep', { setting: 'bedroom-night', pose: 'sleeping', emotion: 'calm', props: ['zzz', 'moon', 'alarm'] }, 1.6],
  ['desk-sad', { setting: 'office', pose: 'sitting-head-in-hands', emotion: 'tired', props: ['battery', 'calendar'] }, 1.3],
];
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  const www = path.join(__dirname, '..', 'www');
  await page.goto('file://' + path.join(__dirname, 'gallery.html'));
  await page.evaluate(async () => { await document.fonts.load('900 60px Montserrat'); await document.fonts.load('700 60px Montserrat'); });
  for (const [name, raw, t] of SPECS) {
    const data = await page.evaluate(async (raw, t, preset) => {
      const S = window.VTS.scenes; const sc = S.normalizeScene(raw.line ? {} : raw, raw.line || '', 1, null);
      if (S.preload) { await S.preload([sc]); S.drawPreview(document.getElementById('c'), sc, preset, t); }
      const cv = document.getElementById('c'); const t0 = performance.now();
      S.drawPreview(cv, sc, preset, t);
      const t1 = performance.now(); for (let i = 0; i < 20; i++) S.drawPreview(cv, sc, preset, t + i / 30); const per = (performance.now() - t1) / 20;
      S.drawPreview(cv, sc, preset, t);
      return { url: cv.toDataURL('image/png'), first: performance.now() - t0, per, sc };
    }, raw, t, PRESET);
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data.url.split(',')[1], 'base64'));
    console.log(name, 'first', data.first.toFixed(0) + 'ms', 'per-frame', data.per.toFixed(1) + 'ms', JSON.stringify(data.sc));
  }
  await browser.close();
})();
