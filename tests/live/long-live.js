// LIVE long-video pipeline (v1.5.0; env ANIM=2d|3d, MOTION=smooth|classic): env ASPECT (default 16:9), retries long script + voice (resume from saved progress).
// LIVE end-to-end in headless Chrome with the real Gemini key from $GEMINI_API_KEY (never printed).
// v1.4: env TONE (default sarcastic), FORMAT (default classic), HUMOUR (default 2).
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
    userDataDir: process.env.PROFILE || undefined, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage(); await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = []; page.on('pageerror', (e) => errors.push(red(e))); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(red('console: ' + m.text())); });
  page.on('dialog', (d) => d.accept());
  const api = []; page.on('response', (r) => { const u = r.url(); if (u.includes('generativelanguage')) { const m = /models\/([^:?]+)(:\w+)?/.exec(u); if (r.request().method() !== 'OPTIONS') { const e = (m ? m[1] + (m[2] || '') : 'models') + ' ' + r.status(); api.push(e); console.log(t(), 'api', e); } } });
  const app = (fn, ...a) => page.evaluate(fn, ...a);
  const click = async (sel) => { await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' })); await sleep(80); await page.click(sel); };
  await page.goto(ORIGIN + '/'); await page.waitForSelector('#idea');
  await app((k) => { localStorage.setItem('vts.apiKey', k); }, KEY); await page.reload(); await page.waitForSelector('#idea');
  await page.type('#idea', IDEA); await page.select('#opt-length', LEN);
  await app((tone) => { const b = document.querySelector('#tone-seg [data-v="' + tone + '"]'); if (b) b.click(); }, process.env.TONE || 'sarcastic');
  await page.select('#opt-template', process.env.FORMAT || 'classic');
  await app((h) => { const el = document.querySelector('#opt-humour'); el.value = h; el.dispatchEvent(new Event('input', { bubbles: true })); }, process.env.HUMOUR || '2');
  const PKGF = process.env.PKG_FILE;
  if (PKGF) { const pk0 = JSON.parse(fs.readFileSync(PKGF, 'utf8')); const pk = pk0.pkg || pk0; await app((x) => { const P = window.VTS.app.project; P.pkg = x; window.VTS.app.renderAll(); }, pk); console.log(t(), 'PKG injected from', PKGF, pk.beats.length, 'beats'); }
  for (let a = 1; a <= 8 && !PKGF; a++) {
    await click('#generate');
    const hb = setInterval(async () => { try { console.log(t(), 'gen', red(await page.$eval('#script-loading-text', (e) => e.textContent))); } catch (_) {} }, 30000);
    await page.waitForFunction(() => (window.VTS.app.project.pkg && !document.querySelector('#script-body').classList.contains('hidden')) || /err/.test(document.querySelector('#gen-status').className), { timeout: 1800000, polling: 1000 });
    clearInterval(hb);
    if (await app(() => !!window.VTS.app.project.pkg)) break;
    console.log(t(), 'GEN ERROR attempt', a, red(await page.$eval('#gen-status', (e) => e.textContent)));
    await app(() => { document.querySelector('#gen-status').className = 'status'; });
    await sleep(a * 20000);
  }
  const pkg = await app(() => { const p = window.VTS.app.project.pkg; return p && { textHook: p.textHook, cta: p.cta, tiktokCaption: p.tiktokCaption, tiktokHashtags: p.tiktokHashtags, ytHashtags: p.hashtags, speakers: p.beats.map((b) => b.speaker || '-').join(','), fx: p.beats.map((b) => b.fx || '-').join(','), stickers: p.beats.map((b) => b.sticker).filter(Boolean), words: window.VTS.shortgen.wordCount(p.script), beats: p.beats.length, title: p.title, hook: p.hooks[0], model: localStorage.getItem('vts.model'), low: p.beats.filter((b) => b.scene && window.VTS.scenes.matchScore(b.text, b.scene) < 0.5).length, poses: new Set(p.beats.map((b) => b.scene && b.scene.pose)).size, settings: new Set(p.beats.map((b) => b.scene && b.scene.setting)).size }; });
  console.log(t(), 'SCRIPT', JSON.stringify(pkg), '| gen-status:', red(await page.$eval('#gen-status', (e) => e.textContent)));
  if (!pkg) throw new Error('script failed');
  fs.writeFileSync(OUTF + '.pkg.json', JSON.stringify(await app(() => window.VTS.app.project.pkg), null, 1));
  await click('.step[data-step=voice]');
  for (let a = 1; a <= 6; a++) {
    await click('#ai-generate');
    const hb = setInterval(async () => { try { console.log(t(), 'voice', red(await page.$eval('#voice-status', (e) => e.textContent.slice(0, 160)))); } catch (_) {} }, 30000);
    await page.waitForFunction(() => (window.VTS.app.project.voice && window.VTS.app.project.voice.source === 'gemini') || /fail|error|quota|limit|could not|busy/i.test(document.querySelector('#voice-status').textContent), { timeout: 2700000, polling: 2000 });
    clearInterval(hb);
    if (await app(() => !!(window.VTS.app.project.voice && window.VTS.app.project.voice.source === 'gemini'))) break;
    console.log(t(), 'VOICE ERROR attempt', a, red(await page.$eval('#voice-status', (e) => e.textContent.slice(0, 400))));
    if (a === 6) break; await app(() => { document.querySelector('#voice-status').textContent = ''; }); await sleep(Math.min(120000, a * 30000));
  }
  const voice = await app(() => { const v = window.VTS.app.project.voice; return { src: v && v.source, d: v && v.duration, model: v && v.ttsModel, tv: v && v.ttsVoice, status: document.querySelector('#voice-status').textContent.slice(0, 200) }; });
  console.log(t(), 'VOICE', red(JSON.stringify(voice)));
  if (voice.src !== 'gemini') throw new Error('voice failed');
  // Long scripts have no speaker field: let the Brain character join the scene whenever the narration talks about "your brain".
  const nb = await app(() => { let n = 0; window.VTS.app.project.pkg.beats.forEach((b) => { if (/\b(your|my|the|our) brain\b|\bbrain\b/i.test(b.text)) { b.speaker = 'brain'; n++; } }); return n + '/' + window.VTS.app.project.pkg.beats.length; });
  console.log(t(), 'brain beats', nb);
  await click('.step[data-step=render]'); await sleep(800); await click('#aspect-seg button[data-v="' + (process.env.ASPECT || '16:9') + '"]'); await sleep(300); await page.select('#opt-quality', process.env.QUALITY || '1080'); await sleep(300); if (process.env.ANIM === '3d' && !process.env.FORCE3D) { console.log('ANIM=3d: the box only has software WebGL (~3 fps real time), so long videos stay 2D here; set FORCE3D=1 to try anyway'); process.env.ANIM = '2d'; } await click('#anim-seg button[data-v="' + (process.env.ANIM || '2d') + '"]'); await sleep(200); if ((process.env.ANIM || '2d') === '2d') { await click('#motion-seg button[data-v="' + (process.env.MOTION || 'smooth') + '"]'); await sleep(200); } console.log('ANIM', process.env.ANIM || '2d', 'MOTION', process.env.MOTION || 'smooth');
  // Box default: offline frame-exact render (avoids MediaRecorder WebM join bugs on long videos). Set RENDER_MODE=app for in-app recorder.
  const OFFLINE = (process.env.RENDER_MODE || 'offline') === 'offline';
  let v; let look; let file; let size;
  if (OFFLINE) {
    // Export voice WAV (PCM parts joined) then render via preview-offline.js -> MP4+AAC
    const vb64 = await app(async () => {
      const V = window.VTS.app; const voice = V.project.voice;
      let blob = null;
      if (voice && voice.blob) blob = voice.blob;
      else if (voice && voice.parts && voice.parts.length) {
        const pcm = voice.parts.every((x) => x.pcm && x.rate === voice.parts[0].rate);
        if (pcm) {
          const rate = voice.parts[0].rate; const ch = voice.parts[0].channels || 1;
          const pieces = []; let total = 0;
          for (const x of voice.parts) { const ab = await x.pcm.arrayBuffer(); pieces.push(new Uint8Array(ab)); total += ab.byteLength; }
          const pcmBytes = new Uint8Array(total); let o = 0; for (const p of pieces) { pcmBytes.set(p, o); o += p.length; }
          const dv = new DataView(new ArrayBuffer(44 + pcmBytes.length));
          const ws = (off, t) => { for (let i = 0; i < t.length; i++) dv.setUint8(off + i, t.charCodeAt(i)); };
          ws(0, 'RIFF'); dv.setUint32(4, 36 + pcmBytes.length, true); ws(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, pcmBytes.length, true);
          new Uint8Array(dv.buffer, 44).set(pcmBytes);
          blob = new Blob([dv.buffer], { type: 'audio/wav' });
        } else if (voice.parts.length === 1) blob = voice.parts[0].blob;
        else blob = new Blob(voice.parts.map((x) => x.blob).filter(Boolean));
      }
      if (!blob) throw new Error('no voice blob to export');
      return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
    });
    const voiceFile = OUTF + '.voice.wav'; fs.writeFileSync(voiceFile, Buffer.from(vb64, 'base64'));
    console.log(t(), 'VOICE_WAV', voiceFile, fs.statSync(voiceFile).size);
    const fullLook = await app((aspect, anim, motion) => Object.assign({}, window.VTS.app.project.look, { textHook: window.VTS.app.project.pkg.textHook || '', ctaSticker: window.VTS.app.project.pkg.cta || '', aspect, anim, motion }), process.env.ASPECT || '16:9', process.env.ANIM || '2d', process.env.MOTION || 'smooth');
    look = { cap: fullLook.captionStyle, intensity: fullLook.intensity, music: fullLook.music, sfx: fullLook.sfx, loop: fullLook.loop, progress: fullLook.progress };
    file = OUTF + '.mp4'; const t0r = Date.now();
    const aspect = process.env.ASPECT || '16:9';
    const outp = execFileSync('node', [path.join(__dirname, 'preview-offline.js'), OUTF + '.pkg.json', voiceFile, file, aspect, process.env.ANIM || '2d', process.env.MOTION || 'smooth'], { env: Object.assign({}, process.env, { LOOK_JSON: JSON.stringify(fullLook) }), maxBuffer: 64 * 1024 * 1024 }).toString();
    console.log(outp.trim().split('\n').map((l) => l.slice(0, 400)).join('\n'));
    if (!/DONE/.test(outp)) throw new Error('offline render failed');
    size = fs.statSync(file).size;
    const [fw, fh] = aspect === '16:9' ? [1920, 1080] : aspect === '1:1' ? [1080, 1080] : [1080, 1920];
    v = { w: fw, h: fh, type: 'video/mp4', ms: Date.now() - t0r, mode: 'offline-frame-exact', d: voice.d, anim: process.env.ANIM || '2d' };
    console.log(t(), 'RENDER', JSON.stringify(v)); console.log('LOOK', JSON.stringify(look));
  } else {
  const rhb = setInterval(async () => { try { console.log(t(), 'render', await page.$eval('#render-label', (e) => e.textContent.slice(0, 120))); } catch (_) {} }, 60000);
  await click('#render'); await page.waitForSelector('#render-progress:not(.hidden)');
  await page.waitForFunction(() => document.querySelector('#render-progress').classList.contains('hidden'), { timeout: 5400000, polling: 2000 }); clearInterval(rhb);
  v = await app(() => { const v = window.VTS.app.project.video; return v && { w: v.width, h: v.height, d: v.duration, type: v.type, ms: v.renderMs, fps: v.fps, drawMs: v.avgDrawMs, mix: v.audioMix, cues: v.cues, cuts: v.cuts, status: document.querySelector('#render-status').textContent.slice(0, 160) }; });
  console.log(t(), 'RENDER', JSON.stringify(v));
  look = await app(() => { const l = window.VTS.app.project.look; return { cap: l.captionStyle, intensity: l.intensity, music: l.music, sfx: l.sfx, loop: l.loop, progress: l.progress }; }); console.log('LOOK', JSON.stringify(look));
  const parts = await app(() => { const v = window.VTS.app.project.video; return v && v.parts ? v.parts.map((x) => (typeof x === 'string' ? x : x.name)) : null; });
  if (parts) {
    console.log(t(), 'PARTS', parts.length, 'exporting for ffmpeg join');
    const listed = await app(async () => {
      const kind = (window.VTS.app.project.video.stored && window.VTS.app.project.video.stored.store) || 'opfs';
      const st = await window.VTS.segments.openStore(kind);
      const out = {};
      for (const nm of arguments[0]) {
        try { const rd = await st.reader(nm); out[nm] = rd.size; window['__vf_' + nm] = rd.file; } catch (e) { out[nm] = 'ERR:' + (e && e.message); }
      }
      return out;
    }, parts);
    console.log(t(), 'PART_SIZES', JSON.stringify(listed));
    for (let k = 0; k < parts.length; k++) {
      const nm = parts[k];
      const psize = await app(async (nm) => { const f = window['__vf_' + nm]; if (!f) return 0; window.__vf = f; return f.size; }, nm);
      const pf = OUTF + '.part' + String(k + 1).padStart(2, '0') + '.webm'; const fdp = fs.openSync(pf, 'w');
      for (let off = 0; off < psize; off += 8388608) { const b64 = await app(async (o, n) => { const b = window.__vf.slice(o, o + n); return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(b); }); }, off, Math.min(8388608, psize - off)); fs.writeSync(fdp, Buffer.from(b64, 'base64')); }
      fs.closeSync(fdp); console.log(t(), 'part', pf, psize);
    }
    fs.writeFileSync(OUTF + '.json', JSON.stringify({ pkg, voice, video: v, parts, api, errors }, null, 1));
    await browser.close(); srv.close(); process.exit(0);
  }
  const ext = /mp4/.test(v.type) ? '.mp4' : '.webm'; file = OUTF + ext;
  size = await app(async () => { const v = window.VTS.app.project.video; window.__vf = v.blob || await window.VTS.segments.openStore(v.stored.store).then((st) => st.reader(v.stored.name)).then((rd) => rd.file); return window.__vf.size; });
  const fd = fs.openSync(file, 'w'); const CH = 8 * 1024 * 1024;
  for (let off = 0; off < size; off += CH) { const b64 = await app(async (o, n) => { const b = window.__vf.slice(o, o + n); return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(b); }); }, off, Math.min(CH, size - off)); fs.writeSync(fd, Buffer.from(b64, 'base64')); }
  fs.closeSync(fd);
  }
  const pr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,duration:format=duration', '-of', 'json', file]).toString());
  console.log(t(), 'FILE', file, size, JSON.stringify(pr));
  console.log('API', JSON.stringify(api)); console.log('ERRORS', JSON.stringify(errors));
  fs.writeFileSync(OUTF + '.json', JSON.stringify({ pkg, voice, video: v, file, probe: pr, api, errors }, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.log('FATAL', red(e && e.stack || e)); process.exit(1); });
