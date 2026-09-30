// Long-video render test: node tests/long.js <name> <aspect> <scale> <outFile> [interruptAfter]
const puppeteer = require('puppeteer-core'); const fs = require('fs'); const { execSync } = require('child_process');
const [name, aspect, scale, outFile, interruptAfter] = process.argv.slice(2);
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 0,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const page = await browser.newPage();
  page.on('console', (m) => console.log('page:', m.text().slice(0, 300)));
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('http://127.0.0.1:8765/tests/long.html' + '?seg=' + (process.env.SEG || '') + '&clock=' + (process.env.CLOCK || ''));
  const pid = browser.process().pid; const rss = [];
  const sample = () => { try { const out = execSync("ps -o rss= --ppid " + pid + " ; ps -o rss= -p " + pid).toString(); const kb = out.split(/\s+/).filter(Boolean).map(Number).reduce((a, b) => a + b, 0); rss.push(kb / 1024); } catch (_) { /* ignore */ } };
  // include grandchildren (chrome zygote tree)
  const sampleTree = () => { try { const all = execSync('ps -eo pid=,ppid=,rss=').toString().trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number)); const kids = new Set([pid]); let grew = true; while (grew) { grew = false; all.forEach(([p, pp]) => { if (kids.has(pp) && !kids.has(p)) { kids.add(p); grew = true; } }); } rss.push(all.filter(([p]) => kids.has(p)).reduce((a, x) => a + x[2], 0) / 1024); } catch (_) { sample(); } };
  const timer = setInterval(sampleTree, 5000);
  const t0 = Date.now();
  const res = await page.evaluate((cfg) => window.runLong(cfg), { name, aspect, scale: Number(scale), interruptAfter: interruptAfter ? Number(interruptAfter) : 0, keep: !!process.env.KEEP, segSec: process.env.SEG ? Number(process.env.SEG) : 75 });
  clearInterval(timer);
  res.rssMaxMB = Math.max(...rss); res.rssAvgMB = rss.reduce((a, b) => a + b, 0) / rss.length; res.wallTotal = (Date.now() - t0) / 1000;
  // stream the joined file out in 8 MB pieces
  const fd = fs.openSync(outFile, 'w'); const CH = 8 * 1024 * 1024;
  for (let off = 0; off < res.size; off += CH) { const b64 = await page.evaluate((o, n) => window.readFinal(o, n), off, Math.min(CH, res.size - off)); fs.writeSync(fd, Buffer.from(b64, 'base64')); }
  fs.closeSync(fd);
  if (process.env.KEEP) for (const sg of res.segments) { const nm = 'seg-' + String(sg.k).padStart(3, '0') + '.webm'; const sz = await page.evaluate((n) => window.readNamed(n, -1), nm); const fd2 = fs.openSync(outFile + '.seg' + sg.k + '.webm', 'w'); for (let off = 0; off < sz; off += CH) { const b64 = await page.evaluate((n, o, l) => window.readNamed(n, o, l), nm, off, Math.min(CH, sz - off)); fs.writeSync(fd2, Buffer.from(b64, 'base64')); } fs.closeSync(fd2); }
  fs.writeFileSync(outFile + '.json', JSON.stringify(res, null, 1));
  console.log('RESULT', JSON.stringify(Object.assign({}, res, { segmentsDetail: res.segments, probe: res.probe.length })));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
