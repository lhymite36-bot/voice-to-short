// Loads the app's Gemini client + script generator in Node (no DOM) and calls the LIVE API with GEMINI_API_KEY.
// Never prints the key: all output goes through redact().
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const W = path.join(__dirname, '../../www/js');
const log = []; const ctx = { console, setTimeout, clearTimeout, AbortController, TextEncoder, TextDecoder, atob, btoa, Blob, URL, fetch: async (u, init) => {
  const body = init && init.body ? JSON.parse(init.body) : null; const r = await fetch(u, init);
  log.push({ url: String(u).replace(/key=[^&]+/, 'key=REDACTED').split('/models/')[1] || u, status: r.status, gen: body && body.generationConfig });
  return r; } };
ctx.window = ctx; ctx.self = ctx; ctx.localStorage = { getItem: () => null, setItem() {} };
vm.createContext(ctx);
for (const f of ['gemini.js', 'emoji-index.js', 'scenes.js', 'library.js', 'shortgen.js']) vm.runInContext(fs.readFileSync(path.join(W, f), 'utf8'), ctx, { filename: f });
const V = ctx.VTS; let model = process.env.MODEL || V.gemini.DEFAULT_MODEL;
Object.assign(V.gemini.host, { getKey: () => process.env.GEMINI_API_KEY, getModel: () => model, setModel: (m) => { model = m; }, onModelSwitch: (a, b) => console.log('model switch', a, '->', b) });
const red = (s) => V.gemini.redact(String(s)).split(process.env.GEMINI_API_KEY).join('REDACTED');
module.exports = { V, log, red, getModel: () => model };
