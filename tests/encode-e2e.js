// v1.10.1: Autopilot renders frame-exact with WebCodecs into a flat MP4 (correct duration, <= 59 s), even when the page is hidden.
// Checks the output with ffprobe. Usage: node tests/encode-e2e.js
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const WWW = path.join(__dirname, '..', 'www'); const FIX = require('./fixtures/brain-vs-me.json'); const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const ok = (n, c, x) => { results.push(!!c); console.log(c ? 'PASS' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x)); };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = path.join(WWW, p);
  if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-count_packets', '-of', 'json', f]).toString());
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluateOnNewDocument(() => { localStorage.setItem('vts.apiKey', 'AIzaTEST'); });
  await page.goto('http://127.0.0.1:' + srv.address().port + '/'); await page.waitForFunction(() => window.VTS && VTS.makeShortHeadless && VTS.encode);
  ok('WebCodecs + muxer available', await page.evaluate(() => VTS.encode.supported()));
  await page.exposeFunction('saveOut', (name, b64) => fs.writeFileSync(path.join(OUT, name), Buffer.from(b64, 'base64')));
  for (const [secs, name] of [[40, 'ap-40s.mp4'], [75, 'ap-75s.mp4']]) {
    const r = await page.evaluate(async (fix, secs, name) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); // like a locked phone / hidden window
      VTS.shortgen.generatePackage = async () => Object.assign({ script: fix.beats.map((b) => b.text).join(' '), title: 'T', hashtags: [] }, JSON.parse(JSON.stringify(fix)));
      VTS.gemini.generateSpeech = VTS.gemini.generateDialogueSpeech = async () => { const sr = 24000; const n = sr * secs; const pcm = new Int16Array(n); for (let i = 0; i < n; i++) pcm[i] = Math.sin(i / 9) * 5000 * (Math.floor(i / 7000) % 2); return { blob: VTS.gemini.pcmToWav([new Uint8Array(pcm.buffer)], sr, 1), model: 'stub' }; };
      const t0 = performance.now(); const m = await VTS.makeShortHeadless({ text: 'test idea ' + secs, format: 'brain-vs-me', length: '60' });
      const b = new Uint8Array(await m.blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); await window.saveOut(name, btoa(s));
      return { how: m.how, duration: m.duration, mime: m.mime, size: m.blob.size, ms: Math.round(performance.now() - t0) };
    }, FIX, secs, name);
    const p = probe(path.join(OUT, name)); const v = p.streams.find((x) => x.codec_type === 'video'); const a = p.streams.find((x) => x.codec_type === 'audio');
    const dur = +p.format.duration; const raw = fs.readFileSync(path.join(OUT, name));
    ok(secs + ' s voice: rendered with WebCodecs, hidden page', r.how === 'webcodecs', r);
    ok(secs + ' s voice: ffprobe mp4, h264 1080x1920 + audio', /mp4/.test(p.format.format_name) && v.codec_name === 'h264' && v.width === 1080 && v.height === 1920 && !!a, { v: v.codec_name, a: a && a.codec_name });
    ok(secs + ' s voice: real duration matches header, <= 59 s', dur > 5 && dur <= 59.5 && Math.abs(dur - r.duration) < 0.6 && Math.abs(+v.duration - +a.duration) < 0.6, { dur, video: v.duration, audio: a.duration, app: r.duration });
    ok(secs + ' s voice: ~30 fps, every frame present', Math.abs(+v.nb_read_packets - Math.round(+v.duration * 30)) <= 2, { frames: v.nb_read_packets });
    const info = require('../www/js/encode.js').mp4Info(new Uint8Array(raw)); const chk = require('../www/js/encode.js').checkShort(info);
    ok(secs + ' s voice: flat MP4 (no moof), moov before mdat, header duration set, passes the pre-upload check', !info.boxes.includes('moof') && info.moovBeforeMdat && info.mvhdDuration > 5 && chk.ok, { boxes: info.boxes, mvhd: info.mvhdDuration, chk });
  }
  ok('no page errors', errors.length === 0, errors);
  await browser.close(); srv.close();
  const pass = results.filter(Boolean).length; console.log('\n' + pass + ' / ' + results.length + ' passed'); process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
