// Voice to Short desktop shell: serves ../www on 127.0.0.1 (secure context for mic, OPFS, MediaRecorder).
// v1.10: YouTube autopilot — tray icon, optional start with Windows, encrypted token storage (safeStorage),
// OAuth loopback sign-in, and a catch-up check when the PC wakes.
const { net, app, BrowserWindow, session, shell, Tray, Menu, nativeImage, ipcMain, safeStorage, Notification, powerMonitor } = require('electron');
const http = require('http'); const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const ROOT = app.isPackaged ? path.join(process.resourcesPath, 'www') : path.join(__dirname, '..', 'www');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.webp':'image/webp', '.jpg':'image/jpeg', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.ogg':'audio/ogg', '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf', '.txt':'text/plain' };
function serve() { return new Promise((res) => { const s = http.createServer((req, rsp) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.normalize(path.join(ROOT, p)); if (!f.startsWith(ROOT)) { rsp.writeHead(403); return rsp.end(); }
  fs.readFile(f, (e, d) => { if (e) { rsp.writeHead(404); return rsp.end(); } rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); rsp.end(d); });
}); s.listen(47821, '127.0.0.1', () => res(47821)).on('error', () => s.listen(0, '127.0.0.1', () => res(s.address().port))); }); }

let win = null; let tray = null; let quitting = false; let autopilotOn = false;
const hiddenStart = process.argv.includes('--hidden');
const SECURE_FILE = () => path.join(app.getPath('userData'), 'secure.json');
function readSecure() { try { return JSON.parse(fs.readFileSync(SECURE_FILE(), 'utf8')); } catch (_) { return {}; } }
function writeSecure(o) { fs.writeFileSync(SECURE_FILE(), JSON.stringify(o), { mode: 0o600 }); }
function enc(v) { return safeStorage.isEncryptionAvailable() ? 'e:' + safeStorage.encryptString(v).toString('base64') : 'p:' + Buffer.from(v).toString('base64'); }
function dec(v) { if (!v) return null; if (v.startsWith('e:')) return safeStorage.decryptString(Buffer.from(v.slice(2), 'base64')); return Buffer.from(v.slice(2), 'base64').toString(); }

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

function showWin() { if (!win) return; win.show(); win.focus(); }
function makeTray() {
  if (tray) return;
  const icon = nativeImage.createFromPath(path.join(ROOT, 'icons', 'icon-192.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon); tray.setToolTip('Voice to Short');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Voice to Short', click: showWin },
    { label: 'Check autopilot now', click: () => win && win.webContents.send('autopilot-check', 'tray') },
    { type: 'separator' },
    { label: 'Quit (autopilot stops)', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWin);
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(['media', 'clipboard-sanitized-write', 'notifications'].includes(perm)));
  const port = await serve();
  win = new BrowserWindow({ width: 480, height: 900, title: 'Voice to Short', autoHideMenuBar: true, show: !hiddenStart,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.js') } });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.on('close', (e) => { if (autopilotOn && !quitting) { e.preventDefault(); win.hide(); } });
  win.loadURL(`http://127.0.0.1:${port}/index.html`);
  makeTray();
  // Catch up on missed slots when the PC wakes or unlocks.
  ['resume', 'unlock-screen'].forEach((ev) => powerMonitor.on(ev, () => setTimeout(() => win && win.webContents.send('autopilot-check', ev), 15000)));
});
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (!autopilotOn) app.quit(); });

// ---------- IPC for js/autopilot.js ----------
ipcMain.handle('secure-get', (e, k) => { try { return dec(readSecure()[k]); } catch (_) { return null; } });
ipcMain.handle('secure-set', (e, k, v) => { const o = readSecure(); o[k] = enc(String(v)); writeSecure(o); return true; });
ipcMain.handle('secure-del', (e, k) => { const o = readSecure(); delete o[k]; writeSecure(o); return true; });
ipcMain.handle('secure-kind', () => (safeStorage.isEncryptionAvailable() ? 'Windows DPAPI (safeStorage)' : 'plain file'));
ipcMain.handle('open-external', (e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return true; });
ipcMain.handle('notify', (e, title, body) => { if (Notification.isSupported()) new Notification({ title, body, icon: path.join(ROOT, 'icons', 'icon-192.png') }).show(); return true; });
ipcMain.handle('autopilot-state', (e, on, startWithWindows) => {
  autopilotOn = !!on;
  if (process.platform === 'win32' || process.platform === 'darwin') app.setLoginItemSettings({ openAtLogin: !!(on && startWithWindows), args: ['--hidden'] });
  return { openAtLogin: app.getLoginItemSettings().openAtLogin };
});
ipcMain.handle('run-state', (e, running) => { if (tray) tray.setToolTip(running ? 'Voice to Short — autopilot is posting a Short…' : 'Voice to Short'); return true; });
// OAuth loopback: a one-shot server on a random 127.0.0.1 port catches ?code=…
let oauth = null;
ipcMain.handle('oauth-start', () => new Promise((resolve, reject) => {
  if (oauth && oauth.server) try { oauth.server.close(); } catch (_) { /* ignore */ }
  oauth = { waiters: [], result: null };
  const srv = http.createServer((req, rsp) => {
    const u = new URL(req.url, 'http://127.0.0.1'); const code = u.searchParams.get('code'); const error = u.searchParams.get('error');
    if (!code && !error) { rsp.writeHead(404); return rsp.end(); }
    rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    rsp.end('<html><body style="font-family:sans-serif;padding:24px"><h2>' + (code ? 'YouTube connected.' : 'Sign-in failed.') + '</h2><p>You can close this tab and go back to Voice to Short.</p></body></html>');
    oauth.result = { code, error, state: u.searchParams.get('state') }; oauth.waiters.forEach((w) => w(oauth.result)); srv.close(); showWin();
  });
  srv.listen(0, '127.0.0.1', () => { oauth.server = srv; resolve({ redirectUri: 'http://127.0.0.1:' + srv.address().port }); }).on('error', reject);
  setTimeout(() => { try { srv.close(); } catch (_) { /* ignore */ } }, 5 * 60 * 1000);
}));
ipcMain.handle('oauth-wait', () => new Promise((resolve) => { if (!oauth) return resolve({ error: 'not_started' }); if (oauth.result) return resolve(oauth.result); oauth.waiters.push(resolve); setTimeout(() => resolve({ error: 'timeout' }), 5 * 60 * 1000); }));

// Native HTTP for hosts without CORS (Buffer API, GitHub uploads). Allow-listed.
const ALLOWED = ['https://api.buffer.com', 'https://api.github.com/', 'https://uploads.github.com/'];
ipcMain.handle('http', async (e, req) => {
  if (!ALLOWED.some((a) => String(req.url).startsWith(a))) throw new Error('URL not allowed');
  const body = req.bytes ? Buffer.from(req.bytes) : req.body;
  // v1.11.6: never wait forever on a dead connection (uploads: 15 min, API calls: 2 min); the Autopilot retries the upload.
  const ac = new AbortController(); const ms = req.bytes ? 15 * 60000 : 120000; const t = setTimeout(() => ac.abort(), ms);
  try {
    const res = await net.fetch(req.url, { method: req.method || 'GET', headers: req.headers || {}, body: req.method === 'GET' ? undefined : body, signal: ac.signal });
    return { status: res.status, body: await res.text() };
  } catch (err) { throw new Error(ac.signal.aborted ? 'Network error: request timed out after ' + Math.round(ms / 60000) + ' min' : 'Network error: ' + (err && err.message || err)); }
  finally { clearTimeout(t); }
});

// ---------- Decide 3D (v1.11.1): run tools/decide (Gemini TTS → SFX → Blender EEVEE → ffmpeg assemble) ----------
const { spawn, execFileSync } = require('child_process');
const DECIDE_TOOLS = () => app.isPackaged ? path.join(process.resourcesPath, 'tools', 'decide') : path.join(__dirname, '..', 'tools', 'decide');
function which(cmd, args) {
  try { const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8', windowsHide: true, timeout: 8000 }).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    for (const p of out) { if (/WindowsApps/i.test(p) && /python/i.test(cmd)) continue; if (args) { try { execFileSync(p, args, { windowsHide: true, timeout: 15000, stdio: 'ignore' }); } catch (_) { continue; } } return p; } } catch (_) { /* none */ }
  return null;
}
function findBlender() {
  const c = which('blender'); if (c) return c;
  const roots = process.platform === 'win32' ? [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean) : ['/Applications', '/usr/local/bin', '/opt'];
  const found = [];
  for (const r of roots) {
    const bf = path.join(r, 'Blender Foundation');
    try { for (const d of fs.readdirSync(bf)) { const exe = path.join(bf, d, 'blender.exe'); if (fs.existsSync(exe)) found.push({ exe, v: parseFloat((d.match(/(\d+(\.\d+)?)/) || [0, 0])[1]) }); } } catch (_) { /* ignore */ }
    try { const st = path.join(r, 'Steam', 'steamapps', 'common', 'Blender', 'blender.exe'); if (fs.existsSync(st)) found.push({ exe: st, v: 99 }); } catch (_) { /* ignore */ }
    if (process.platform === 'darwin') { const m = path.join(r, 'Blender.app', 'Contents', 'MacOS', 'Blender'); if (fs.existsSync(m)) found.push({ exe: m, v: 99 }); }
  }
  found.sort((a, b) => b.v - a.v); return found.length ? found[0].exe : null;
}
// assemble.py needs a modern ffmpeg with drawtext/zoompan/tpad + libx264. Old builds on PATH are skipped.
function ffmpegGood(p) { try { const f = execFileSync(p, ['-hide_banner', '-filters'], { encoding: 'utf8', windowsHide: true, timeout: 20000, maxBuffer: 8 << 20 }); return /drawtext/.test(f) && /zoompan/.test(f) && /tpad/.test(f); } catch (_) { return false; } }
const FF_DIR = () => path.join(app.getPath('userData'), 'ffmpeg');
function findLocalFfmpeg() {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const walk = (d, depth) => { if (depth > 3) return null; let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return null; }
    for (const en of ents) { const p = path.join(d, en.name); if (en.isFile() && en.name.toLowerCase() === exe) return p; }
    for (const en of ents) if (en.isDirectory()) { const r = walk(path.join(d, en.name), depth + 1); if (r) return r; } return null; };
  return walk(FF_DIR(), 0);
}
function findFfmpeg() {
  const sys = (() => { try { return execFileSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { encoding: 'utf8', windowsHide: true, timeout: 8000 }).split(/\r?\n/).map((x) => x.trim()).filter(Boolean); } catch (_) { return []; } })();
  const loc = findLocalFfmpeg(); const cands = (loc ? [loc] : []).concat(sys);
  for (const c of cands) { const probe = path.join(path.dirname(c), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'); if (fs.existsSync(probe) && ffmpegGood(c)) return { ffmpeg: c, ffprobe: probe }; }
  return { ffmpeg: null, ffprobe: null, oldFfmpeg: sys[0] || null };
}
const FF_URL = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip';
async function downloadFfmpeg(send) {
  if (process.platform !== 'win32') throw new Error('Install ffmpeg (brew/apt) — auto-download is Windows-only.');
  fs.mkdirSync(FF_DIR(), { recursive: true }); const zip = path.join(FF_DIR(), 'ffmpeg.zip');
  const res = await net.fetch(FF_URL); if (!res.ok) throw new Error('ffmpeg download failed: HTTP ' + res.status);
  const total = Number(res.headers.get('content-length')) || 0; let got = 0; const out = fs.createWriteStream(zip); const rd = res.body.getReader();
  for (;;) { const { done, value } = await rd.read(); if (done) break; got += value.length; out.write(Buffer.from(value)); if (total) send({ step: 'ffmpeg', label: `Downloading free ffmpeg (one time) ${Math.round(got / 1048576)}/${Math.round(total / 1048576)} MB…`, pct: 0 }); }
  await new Promise((r) => out.end(r));
  send({ step: 'ffmpeg', label: 'Unpacking ffmpeg…', pct: 0 });
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${FF_DIR().replace(/'/g, "''")}' -Force`], { windowsHide: true, timeout: 10 * 60 * 1000 });
  try { fs.unlinkSync(zip); } catch (_) { /* ignore */ }
}
let decideTools = null;
function decideDetect(force) {
  if (decideTools && !force) return decideTools;
  const py = which('python', ['--version']) || which('python3', ['--version']) || which('py', ['--version']);
  const blender = findBlender();
  let blenderVersion = null; if (blender) { try { blenderVersion = (execFileSync(blender, ['-b', '--version'], { encoding: 'utf8', windowsHide: true, timeout: 60000 }).match(/Blender\s+([\d.]+)/) || [])[1] || null; } catch (_) { /* ignore */ } }
  decideTools = { blender, blenderVersion, python: py, node: which('node', ['--version']), ...findFfmpeg(), tools: DECIDE_TOOLS(), toolsOk: fs.existsSync(path.join(DECIDE_TOOLS(), 'render_scenes.py')) };
  decideTools.missing = ['blender', 'python', 'node'].filter((k) => !decideTools[k]);
  decideTools.ffmpegAuto = !decideTools.ffmpeg && process.platform === 'win32'; // fetched on first render
  if (!decideTools.ffmpeg && !decideTools.ffmpegAuto) decideTools.missing.push('ffmpeg');
  decideTools.ready = decideTools.toolsOk && decideTools.missing.length === 0;
  return decideTools;
}
ipcMain.handle('decide-3d-status', (e, force) => decideDetect(!!force));
let decideJob = null;
ipcMain.handle('decide-3d-cancel', () => { if (decideJob) { decideJob.cancelled = true; try { if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(decideJob.child.pid), '/T', '/F'], { windowsHide: true }); else decideJob.child.kill('SIGTERM'); } catch (_) { /* ignore */ } } return true; });
ipcMain.handle('decide-3d-render', async (e, req) => {
  if (decideJob) throw new Error('A Decide 3D render is already running.');
  const t = decideDetect(true);
  if (!t.ready) throw new Error(!t.blender ? 'Blender not found. Install free Blender 4 or 5 from blender.org, then tap Check again.' : 'Missing: ' + t.missing.join(', '));
  const key = String((req && req.geminiKey) || '').trim();
  if (!key) throw new Error('Add your Gemini API key in Settings (used for the multi-voice cast).');
  const sender = e.sender; const send = (ev) => { try { if (!sender.isDestroyed()) sender.send('decide-3d-progress', ev); } catch (_) { /* ignore */ } };
  if (!t.ffmpeg) { await downloadFfmpeg(send); Object.assign(t, findFfmpeg()); decideTools = null; if (!t.ffmpeg) throw new Error('ffmpeg download did not produce a working ffmpeg.'); }
  const work = path.join(app.getPath('userData'), 'decide', 'job-' + Date.now());
  fs.mkdirSync(work, { recursive: true });
  fs.writeFileSync(path.join(work, 'script.json'), typeof req.script === 'string' ? req.script : JSON.stringify(req.script, null, 2));
  const env = Object.assign({}, process.env, { DECIDE_WORK: work, DECIDE_OUT: 'decide.mp4', GEMINI_API_KEY: key, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' });
  // put ffmpeg dir first on PATH so assemble.py's bare 'ffmpeg'/'ffprobe' resolve
  env.PATH = path.dirname(t.ffmpeg) + path.delimiter + (env.PATH || env.Path || ''); if (process.platform === 'win32') env.Path = env.PATH;
  const T = t.tools; const pyArgs = /[\\/]py(\.exe)?$/i.test(t.python) ? ['-3'] : [];
  const steps = [
    { name: 'voices', label: 'Voicing the cast (Gemini TTS)…', cmd: t.node, args: [path.join(T, 'gen_tts.mjs')], w: 15 },
    { name: 'sfx', label: 'Making horror SFX…', cmd: t.python, args: [...pyArgs, path.join(T, 'gen_sfx.py')], w: 3 },
    { name: 'blender', label: 'Rendering 3D scenes in Blender EEVEE…', cmd: t.blender, args: ['-b', '--factory-startup', '-P', path.join(T, 'render_scenes.py')], w: 62 },
    { name: 'assemble', label: 'Assembling A/B pills, captions and audio…', cmd: t.python, args: [...pyArgs, path.join(T, 'assemble.py')], w: 20 },
  ];
  const totalShots = 19; let base = 0; const log = fs.createWriteStream(path.join(work, 'pipeline.log'));
  decideJob = { cancelled: false, child: null };
  try {
    for (const s of steps) {
      send({ step: s.name, label: s.label, pct: base });
      let shots = 0; let clips = 0; let tail = '';
      const code = await new Promise((resolve, reject) => {
        const ch = spawn(s.cmd, s.args, { cwd: work, env, windowsHide: true });
        decideJob.child = ch;
        const onData = (d) => { const txt = d.toString(); log.write(txt); tail = (tail + txt).slice(-3000);
          if (s.name === 'blender') { const m = txt.match(/^RENDER /gm); if (m) { shots += m.length; send({ step: s.name, label: `Rendering 3D scenes in Blender EEVEE… shot ${Math.min(shots, totalShots)}/${totalShots}`, pct: base + s.w * Math.min(1, (shots - 1) / totalShots) }); } }
          if (s.name === 'assemble') { const m = txt.match(/^CLIP /gm); if (m) { clips += m.length; send({ step: s.name, label: `Assembling… clip ${clips}`, pct: base + s.w * Math.min(0.9, clips / 20) }); } }
          if (s.name === 'voices') { const m = txt.match(/\bOK\b|saved|wrote/gi); if (m) send({ step: s.name, label: s.label, pct: base + s.w * 0.5 }); } };
        ch.stdout.on('data', onData); ch.stderr.on('data', onData);
        ch.on('error', reject); ch.on('close', resolve);
      });
      if (decideJob.cancelled) throw new Error('Cancelled');
      if (code !== 0) { const hint = /NO_KEY/.test(tail) ? 'Gemini key missing.' : /429|quota|RESOURCE_EXHAUSTED/i.test(tail) ? 'Gemini TTS quota hit — try again later (free tier resets daily).' : ''; throw new Error(`${s.name} step failed (code ${code}). ${hint} Log: ${path.join(work, 'pipeline.log')}\n${tail.split(/\r?\n/).filter(Boolean).slice(-4).join('\n')}`); }
      base += s.w;
    }
    const out = path.join(work, 'decide.mp4'); const buf = fs.readFileSync(out);
    send({ step: 'done', label: 'Done', pct: 100 });
    return { path: out, size: buf.length, bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.length), work };
  } finally { try { log.end(); } catch (_) { /* ignore */ } decideJob = null; }
});
ipcMain.handle('show-in-folder', (e, p) => { if (p && p.startsWith(app.getPath('userData'))) shell.showItemInFolder(p); return true; });
