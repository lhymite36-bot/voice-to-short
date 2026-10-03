// v1.4.1 offline checks: cut-off (MAX_TOKENS) script replies are continued / repaired / retried, thinking is kept low,
// unsupported thinking fields are dropped. Mocks fetch; no network. Run: node tests/truncation141.js
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const W = path.join(__dirname, '../www/js');
let handler = null; const sent = [];
const ctx = { console, setTimeout, clearTimeout, AbortController, TextEncoder, TextDecoder, atob, btoa, URL,
  fetch: async (u, init) => { const body = init && init.body ? JSON.parse(init.body) : null; sent.push({ u: String(u), body }); const [status, data] = await handler(String(u), body, sent.length); return { ok: status === 200, status, json: async () => data }; } };
ctx.window = ctx; ctx.self = ctx; ctx.localStorage = { getItem: () => null, setItem() {} };
vm.createContext(ctx);
for (const f of ['gemini.js', 'emoji-index.js', 'scenes.js', 'library.js', 'shortgen.js']) vm.runInContext(fs.readFileSync(path.join(W, f), 'utf8'), ctx, { filename: f });
const V = ctx.VTS; const S = V.shortgen; let model = 'gemini-3.8-flash';
Object.assign(V.gemini.host, { getKey: () => 'test-key', getModel: () => model, setModel: (m) => { model = m; }, onModelSwitch() {}, onBusyFallback() {} });
const results = []; const ok = (n, c, x) => { results.push(!!c); console.log(c ? 'PASS' : 'FAIL', n, x || ''); };
const reply = (text, finish, thoughts) => [200, { candidates: [{ content: { parts: [{ text }] }, finishReason: finish || 'STOP' }], usageMetadata: { thoughtsTokenCount: thoughts || 0 } }];

const words = (n, w) => Array.from({ length: n }, (_, i) => (w || 'word') + i).join(' ');
function fullPkg(nWords) {
  const script = 'Your social battery just hit three percent. ' + words(nWords - 7) + ' Comment your number.';
  const ws = script.split(' '); const beats = [];
  for (let i = 0; i < ws.length; i += 6) beats.push({ text: ws.slice(i, i + 6).join(' '), weight: Math.min(6, ws.length - i), step: 0, speaker: i % 12 ? 'brain' : 'me', fx: 'none', sfx: 'pop', scene: { setting: 'party', pose: 'standing-thinking', emotion: 'tired', props: ['social-battery'], camera: 'static' } });
  return { hooks: ['Your social battery just hit three percent.', 'POV: the party is still going.', 'Why you suddenly want to leave'], script, beats, textHook: 'SOCIAL BATTERY: 3%', title: 'Social battery at 3%', description: 'd', hashtags: ['#psychology'], tiktokCaption: 'Which % are you at?', tiktokHashtags: ['#introvert'], cta: 'Follow if your battery dies too', pinnedComment: 'p', thumbnailText: '3% LEFT' };
}
(async () => {
  // --- repairJSON ---
  const j = JSON.stringify(fullPkg(260));
  const cut = j.slice(0, Math.floor(j.length * 0.6));
  const rep = JSON.parse(S.repairJSON(cut));
  ok('repairJSON closes a reply cut inside the beats', rep && rep.script && Array.isArray(rep.beats) && rep.beats.length > 3);
  const cut2 = '{ "hooks": [ "Your social battery just hit three percent mid-party.", "POV: ...", "Why you suddenly want to';
  const r2 = JSON.parse(S.repairJSON(cut2));
  ok('repairJSON closes the exact reported cut-off (inside hooks)', Array.isArray(r2.hooks) && r2.hooks.length >= 2, JSON.stringify(r2).slice(0, 90));
  ok('repairJSON leaves complete JSON alone', S.repairJSON(j) === j);
  let fuzzOk = 0; const N = 60; for (let k = 1; k <= N; k++) { const c = j.slice(0, Math.floor(j.length * k / (N + 1))); try { JSON.parse(S.repairJSON(c)); fuzzOk++; } catch (_) {} }
  ok('repairJSON yields valid JSON at 60 cut points', fuzzOk === N, fuzzOk + '/' + N);
  // --- joinContinuation ---
  ok('joinContinuation removes a repeated overlap', S.joinContinuation(j.slice(0, 500), j.slice(480)) === j);
  ok('joinContinuation plain append', S.joinContinuation(j.slice(0, 500), j.slice(500)) === j);
  ok('completeBeats extends beats to cover a script', (() => { const p = S.normalize(Object.assign(fullPkg(260), { beats: fullPkg(260).beats.slice(0, 10) })); return S.wordCount(p.beats.map((b) => b.text).join(' ')) >= S.wordCount(p.script) - 2 && p.beats[0].speaker === 'me'; })());

  // --- request shape: low thinking + big budget + timeout ---
  sent.length = 0; handler = async () => reply(JSON.stringify(fullPkg(270)));
  let pkg = await S.generatePackage('Your social battery hitting 3% in the middle of a party', { length: '120', tone: 'sarcastic', format: 'classic', humour: 3, platform: 'both' });
  const g0 = sent[0].body.generationConfig;
  ok('script call sends thinkingConfig low + maxOutputTokens >= 16384', g0.thinkingConfig && g0.thinkingConfig.thinkingLevel === 'low' && g0.maxOutputTokens >= 16384, JSON.stringify(g0.thinkingConfig) + ' ' + g0.maxOutputTokens);
  ok('scene-mode schema drops redundant "visual"', !('visual' in sent[0].body.generationConfig.responseSchema.properties.beats.items.properties));
  ok('normal 2-min reply: one call, ok', sent.length === 1 && pkg.beats.length > 20 && pkg.textHook);

  // --- the 1.4.0 bug: MAX_TOKENS after huge thinking -> continuation completes it ---
  sent.length = 0; const full = JSON.stringify(fullPkg(270));
  handler = async (u, body, n) => n === 1 ? reply(full.slice(0, 1800), 'MAX_TOKENS', 13176) : reply(full.slice(1800));
  pkg = await S.generatePackage('Your social battery hitting 3% in the middle of a party', { length: '120', tone: 'sarcastic', format: 'classic', humour: 3 });
  ok('MAX_TOKENS reply is auto-continued and concatenated', sent.length === 2 && S.wordCount(pkg.script) >= 260 && /continued/.test(pkg.genInfo), pkg.genInfo);
  ok('continuation call has no JSON schema (plain text)', !sent[1].body.generationConfig.responseSchema && sent[1].body.contents.length === 3);

  // --- continuation fails -> repair keeps the script + beats ---
  sent.length = 0; handler = async (u, body, n) => n === 1 ? reply(full.slice(0, Math.floor(full.length * 0.7)), 'MAX_TOKENS') : [503, { error: { message: 'high demand', status: 'UNAVAILABLE' } }];
  pkg = await S.generatePackage('idea', { length: '120', tone: 'sarcastic', format: 'classic', humour: 3 });
  ok('when continuing fails, JSON repair rescues the package', pkg && S.wordCount(pkg.script) >= 200 && /repaired/.test(pkg.genInfo), pkg.genInfo);

  // --- cut inside hooks (no script) -> compact retry ---
  sent.length = 0; handler = async (u, body, n) => n <= 3 ? reply(cut2, 'MAX_TOKENS') : reply(JSON.stringify(fullPkg(270)));
  pkg = await S.generatePackage('idea', { length: '120', tone: 'sarcastic', format: 'classic', humour: 3 });
  const comp = sent.find((x) => /compact/.test(JSON.stringify(x.body.contents)));
  ok('no usable script -> compact retry without scene objects', pkg && comp && !comp.body.generationConfig.responseSchema.properties.beats.items.properties.scene, pkg && pkg.genInfo);
  ok('compact package still gets scenes (inferred locally)', pkg.beats.every((b) => b.scene && b.scene.setting));

  // --- everything cut -> split path (text first, then beats) ---
  sent.length = 0; const meta = fullPkg(270); const beatsOnly = { beats: meta.beats.map((b) => ({ text: b.text, weight: b.weight, step: b.step, speaker: b.speaker })) }; delete meta.beats;
  handler = async (u, body) => { const s = JSON.stringify(body.contents); if (/EXCEPT/.test(s)) return reply(JSON.stringify(meta)); if (/Split this voiceover/.test(s)) return reply(JSON.stringify(beatsOnly)); return reply('{"hooks": ["a', 'MAX_TOKENS'); };
  pkg = await S.generatePackage('idea', { length: '120', tone: 'sarcastic', format: 'brain-vs-me', humour: 3 });
  ok('last resort: split generation (text + beats calls)', pkg && pkg.beats.length > 20 && pkg.beats.some((b) => b.speaker === 'brain') && /beats:/.test(pkg.genInfo), pkg && pkg.genInfo);

  // --- unsupported thinking field: dropped, request retried ---
  sent.length = 0; handler = async (u, body) => body.generationConfig.thinkingConfig && body.generationConfig.thinkingConfig.thinkingLevel ? [400, { error: { message: 'Thinking level LOW is not supported for this model.', status: 'INVALID_ARGUMENT' } }] : body.generationConfig.thinkingConfig ? [400, { error: { message: 'thinking_budget is not supported', status: 'INVALID_ARGUMENT' } }] : reply(JSON.stringify(fullPkg(130)));
  pkg = await S.generatePackage('idea', { length: '60', tone: 'sarcastic', format: 'pov', humour: 3 });
  ok('400 on thinkingConfig -> other form -> none, still succeeds', pkg && sent.length === 3 && !sent[2].body.generationConfig.thinkingConfig);
  model = 'gemini-2.5-flash'; sent.length = 0; handler = async () => reply(JSON.stringify(fullPkg(80)));
  await S.generatePackage('idea', { length: '30', tone: 'sarcastic', format: 'pov', humour: 3 });
  ok('2.x models get thinkingBudget instead of thinkingLevel', sent[0].body.generationConfig.thinkingConfig.thinkingBudget === 1024);
  model = 'gemini-3.8-flash';

  // --- total failure gives diagnostic details ---
  sent.length = 0; handler = async () => reply('{"hooks": ["a', 'MAX_TOKENS');
  try { await S.generatePackage('idea', { length: '120', tone: 'sarcastic', format: 'classic', humour: 3 }); ok('total failure throws', false); } catch (e) { ok('total failure: friendly error with finishReason trail', /unexpected format/.test(e.message) && /MAX_TOKENS/.test(e.details), e.details.slice(0, 120)); }
  const n = results.filter(Boolean).length; console.log(n + '/' + results.length + ' passed'); process.exit(n === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
