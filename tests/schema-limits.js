// Offline guard (v1.3.1): Gemini answers a bare "400 INVALID_ARGUMENT" when a responseSchema has very large enums.
// Live tests showed the 310-value props enum failing on every model; 51 poses / 20 settings are fine.
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const ctx = { console, setTimeout, clearTimeout }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['gemini.js', 'emoji-index.js', 'scenes.js', 'library.js', 'shortgen.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../www/js', f), 'utf8'), ctx);
const S = ctx.VTS.shortgen; let bad = 0;
function walk(o, p) { if (!o || typeof o !== 'object') return; if (Array.isArray(o.enum) && o.enum.length > 60) { bad++; console.log('FAIL enum too large', p, o.enum.length); } for (const k in o) walk(o[k], p + '.' + k); }
for (const [n, s] of Object.entries({ short: S.schemaWithScenes(), outline: S.OUTLINE_SCHEMA, section: S.sectionSchema(), scene: S.sceneSchema() })) { walk(s, n); const len = JSON.stringify(s).length; console.log(n, 'schema chars', len); if (len > 6000) { bad++; console.log('FAIL schema too large', n); } }
console.log(bad ? 'FAIL' : 'PASS schema limits'); process.exit(bad ? 1 : 0);
