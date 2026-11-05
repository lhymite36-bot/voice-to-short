// Small, explicit bridge for the autopilot (no Node access in the page).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('vtsDesktop', {
  platform: 'desktop',
  secureGet: (k) => ipcRenderer.invoke('secure-get', k),
  secureSet: (k, v) => ipcRenderer.invoke('secure-set', k, v),
  secureDel: (k) => ipcRenderer.invoke('secure-del', k),
  secureKind: () => ipcRenderer.invoke('secure-kind'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  notify: (title, body) => ipcRenderer.invoke('notify', title, body),
  autopilotState: (on, startWithWindows) => ipcRenderer.invoke('autopilot-state', on, startWithWindows),
  runState: (running) => ipcRenderer.invoke('run-state', running),
  http: (req) => ipcRenderer.invoke('http', req),
  oauthStart: () => ipcRenderer.invoke('oauth-start'),
  oauthWait: () => ipcRenderer.invoke('oauth-wait'),
  decide3dStatus: (force) => ipcRenderer.invoke('decide-3d-status', force),
  decide3dRender: (req) => ipcRenderer.invoke('decide-3d-render', req),
  decide3dCancel: () => ipcRenderer.invoke('decide-3d-cancel'),
  onDecide3dProgress: (fn) => { const h = (e, ev) => fn(ev); ipcRenderer.on('decide-3d-progress', h); return () => ipcRenderer.removeListener('decide-3d-progress', h); },
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
  onCheck: (fn) => ipcRenderer.on('autopilot-check', (e, why) => fn(why)),
});
