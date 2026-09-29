// Renders assets/icon.svg into web + Android launcher icons and splash screens using headless Chrome.
// Usage: CHROME=/usr/bin/google-chrome node scripts/make-icons.js
const puppeteer = require('puppeteer-core');
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'assets/icon.svg'), 'utf8');
const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const defs = (inner.match(/<defs>[\s\S]*?<\/defs>/) || [''])[0];
const bg = (inner.match(/<g id="bg">[\s\S]*?<\/g>/) || [''])[0];
const fg = (inner.match(/<g id="fg"[\s\S]*<\/g>\s*$/) || [''])[0];
function doc(size, { shape = 'square', fgScale = 1, withBg = true, bgColor = null } = {}) {
  const clip = shape === 'circle' ? '<clipPath id="c"><circle cx="512" cy="512" r="512"/></clipPath>' : shape === 'rounded' ? '<clipPath id="c"><rect width="1024" height="1024" rx="230"/></clipPath>' : '';
  const s = fgScale; const off = 512 * (1 - s);
  return `<!doctype html><html><body style="margin:0;background:${bgColor || 'transparent'}"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
    <defs>${defs.replace(/<\/?defs>/g, '')}${clip}</defs>
    <g ${clip ? 'clip-path="url(#c)"' : ''}>${withBg ? bg : ''}<g transform="translate(${off} ${off}) scale(${s})">${fg}</g></g></svg></body></html>`;
}
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  async function shot(file, size, opts, pageW, pageH) {
    await page.setViewport({ width: pageW || size, height: pageH || size, deviceScaleFactor: 1 });
    if (pageW) {
      await page.setContent(`<!doctype html><html><body style="margin:0;width:${pageW}px;height:${pageH}px;background:#0a0a10;display:grid;place-items:center">${doc(size, opts).replace(/^[\s\S]*?<svg/, '<svg').replace(/<\/body>[\s\S]*$/, '')}</body></html>`);
    } else await page.setContent(doc(size, opts));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: pageW || size, height: pageH || size } });
  }
  const www = path.join(root, 'www/icons');
  await shot(path.join(www, 'icon-192.png'), 192, { shape: 'rounded' });
  await shot(path.join(www, 'icon-512.png'), 512, { shape: 'rounded' });
  await shot(path.join(www, 'maskable-192.png'), 192, { fgScale: 0.8 });
  await shot(path.join(www, 'maskable-512.png'), 512, { fgScale: 0.8 });
  await shot(path.join(www, 'apple-touch-icon.png'), 180, { fgScale: 0.9 });
  await shot(path.join(root, 'assets/icon-1024.png'), 1024, { shape: 'rounded' });
  const res = path.join(root, 'android/app/src/main/res');
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    await shot(path.join(res, 'mipmap-' + d, 'ic_launcher.png'), Math.round(48 * k), { shape: 'rounded', fgScale: 0.92 });
    await shot(path.join(res, 'mipmap-' + d, 'ic_launcher_round.png'), Math.round(48 * k), { shape: 'circle', fgScale: 0.86 });
    // Adaptive foreground: 108dp canvas, content inside the 66dp safe zone.
    await shot(path.join(res, 'mipmap-' + d, 'ic_launcher_foreground.png'), Math.round(108 * k), { withBg: false, fgScale: 0.62 });
  }
  // Splash screens (keep existing file sizes).
  const walk = (dir) => fs.readdirSync(dir).flatMap((f) => { const p = path.join(dir, f); return fs.statSync(p).isDirectory() ? walk(p) : [p]; });
  for (const f of walk(res).filter((p) => /splash\.png$/.test(p))) {
    const b = fs.readFileSync(f); const w = b.readUInt32BE(16); const h = b.readUInt32BE(20);
    await shot(f, Math.round(Math.min(w, h) * 0.32), { shape: 'rounded' }, w, h);
  }
  await browser.close();
  console.log('icons done');
})();
