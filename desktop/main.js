// Voice to Short desktop shell: serves ../www on 127.0.0.1 (secure context for mic, OPFS, MediaRecorder).
const { app, BrowserWindow, session, shell } = require('electron');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = app.isPackaged ? path.join(process.resourcesPath, 'www') : path.join(__dirname, '..', 'www');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.webp':'image/webp', '.jpg':'image/jpeg', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.ogg':'audio/ogg', '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf', '.txt':'text/plain' };
function serve() { return new Promise((res) => { const s = http.createServer((req, rsp) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.normalize(path.join(ROOT, p)); if (!f.startsWith(ROOT)) { rsp.writeHead(403); return rsp.end(); }
  fs.readFile(f, (e, d) => { if (e) { rsp.writeHead(404); return rsp.end(); } rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); rsp.end(d); });
}); s.listen(47821, '127.0.0.1', () => res(47821)).on('error', () => s.listen(0, '127.0.0.1', () => res(s.address().port))); }); }
if (!app.requestSingleInstanceLock()) app.quit();
app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(['media', 'clipboard-sanitized-write', 'notifications'].includes(perm)));
  const port = await serve();
  const win = new BrowserWindow({ width: 480, height: 900, title: 'Voice to Short', autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true } });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL(`http://127.0.0.1:${port}/index.html`);
});
app.on('window-all-closed', () => app.quit());
