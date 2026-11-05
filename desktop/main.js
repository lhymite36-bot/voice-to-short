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
  const res = await net.fetch(req.url, { method: req.method || 'GET', headers: req.headers || {}, body: req.method === 'GET' ? undefined : body });
  return { status: res.status, body: await res.text() };
});
