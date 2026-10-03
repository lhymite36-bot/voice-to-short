// v1.4.2 offline checks: empty Gemini replies (no text / SAFETY / RECITATION / OTHER / prompt blocked / unreadable body /
// timeout / quota) are retried, fall back across models and request shapes, and end in a plain, specific error.
// Mocks fetch; no network. Run: node tests/empty142.js
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const W = path.join(__dirname, '../www/js');
let handler = null; const sent = [];
const ctx = { console, setTimeout, clearTimeout, AbortController, TextEncoder, TextDecoder, atob, btoa, URL,
  fetch: async (u, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null; const model = (String(u).split('/models/')[1] || '').split(':')[0];
    if (!body) return { ok: true, status: 200, json: async () => ({ models: [] }) }; // GET /models (discovery)
    sent.push({ model, body });
    const out = await handler(model, body, sent.length, init && init.signal);
    if (out === 'HANG') return new Promise((res, rej) => init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }));
    const [status, data] = out;
    return { ok: status === 200, status, json: async () => { if (data === 'BROKEN') throw new SyntaxError('Unexpected end of JSON input'); return data; } };
  } };
ctx.window = ctx; ctx.self = ctx; ctx.localStorage = { getItem: () => null, setItem() {} };
vm.createContext(ctx);
for (const f of ['gemini.js', 'emoji-index.js', 'scenes.js', 'library.js', 'shortgen.js']) vm.runInContext(fs.readFileSync(path.join(W, f), 'utf8'), ctx, { filename: f });
const V = ctx.VTS; const S = V.shortgen; const G = V.gemini; let model = 'gemini-3.8-flash';
Object.assign(G.host, { getKey: () => 'test-key', getModel: () => model, setModel: (m) => { model = m; }, onModelSwitch() {}, onBusyFallback() {}, emptyBackoffMs: 0 });
const results = []; const ok = (n, c, x) => { results.push(!!c); console.log(c ? 'PASS' : 'FAIL', n, x || ''); };
const reply = (text) => [200, { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }];
const empty = (finish, extra) => [200, Object.assign({ candidates: [Object.assign({ finishReason: finish || 'STOP' }, finish === 'STOP' ? { content: { role: 'model' } } : {})] }, extra || {})];
const busy = [503, { error: { code: 503, message: 'This model is currently experiencing high demand.', status: 'UNAVAILABLE' } }];
const quota = [429, { error: { code: 429, message: 'You exceeded your current quota.', status: 'RESOURCE_EXHAUSTED' } }];
function pkgJSON(n) {
  const script = 'Your social battery just hit three percent. ' + Array.from({ length: n - 9 }, (_, i) => 'brain' + i).join(' ') + ' Comment your battery level.';
  const ws = script.split(' '); const beats = []; for (let i = 0; i < ws.length; i += 6) beats.push({ text: ws.slice(i, i + 6).join(' '), weight: 6, step: 0, speaker: i % 12 ? 'brain' : 'me' });
  return JSON.stringify({ hooks: ['Your social battery just hit three percent.', 'b', 'c'], script, beats, textHook: '3% LEFT', title: 't', description: 'd', hashtags: ['#psychology'], tiktokCaption: 'c?', tiktokHashtags: ['#introvert'], cta: 'Follow', pinnedComment: 'p', thumbnailText: '3%' });
}
const IDEA = 'Your social battery hitting 3% in the middle of a party';
const OPTS = { length: '120', tone: 'sarcastic', format: 'brain-like', humour: 3, platform: 'both', backoffMs: 0 };
const gen = () => S.generatePackage(IDEA, Object.assign({}, OPTS));
(async () => {
  // 1) one empty STOP reply -> same model retried with thinking off + safety relaxed -> works
  sent.length = 0; handler = async (m, b, n) => (n === 1 ? empty('STOP') : reply(pkgJSON(260)));
  let pkg = await gen();
  ok('empty STOP reply -> in-place retry succeeds', pkg && sent.length === 2 && sent[1].model === 'gemini-3.8-flash');
  ok('retry turns thinking down and relaxes safety (BLOCK_NONE, 4 categories)', sent[1].body.generationConfig.thinkingConfig.thinkingBudget === 0 && sent[1].body.safetySettings.length === 4 && sent[1].body.safetySettings.every((x) => x.threshold === 'BLOCK_NONE'));
  ok('first request unchanged (low thinking, no safety override)', sent[0].body.generationConfig.thinkingConfig.thinkingLevel === 'low' && !sent[0].body.safetySettings);

  // 2) empty (OTHER) twice on the first model -> next model
  sent.length = 0; handler = async (m) => (m === 'gemini-3.8-flash' ? empty('OTHER') : reply(pkgJSON(260)));
  pkg = await gen();
  ok('OTHER twice on one model -> falls back to the next model', pkg && sent.filter((x) => x.model === 'gemini-3.8-flash').length === 2 && sent[2].model === 'gemini-flash-latest');
  ok('model choice is not saved after an empty-reply fallback', model === 'gemini-3.8-flash');

  // 3) lite model rejects thinkingBudget 0 on the retry (bare 400) -> original config is resent
  model = 'gemini-3.5-flash-lite'; sent.length = 0;
  handler = async (m, b, n) => (n === 1 ? empty('STOP') : b.generationConfig.thinkingConfig && b.generationConfig.thinkingConfig.thinkingBudget === 0 ? [400, { error: { message: 'Request contains an invalid argument.', status: 'INVALID_ARGUMENT' } }] : reply(pkgJSON(260)));
  pkg = await gen();
  ok('retry 400 on a lite model -> resend original config, works', pkg && sent.length <= 3 && sent[1].body.generationConfig.thinkingConfig.thinkingLevel === 'low');
  model = 'gemini-3.8-flash';

  // 4) SAFETY on every model for humour 3 -> compact request with humour toned down + PG note + safety relaxed
  sent.length = 0; handler = async (m, b) => (/Unhinged|UNHINGED/i.test(JSON.stringify(b.contents)) && !/kind and PG/.test(JSON.stringify(b.contents)) ? empty('SAFETY') : reply(pkgJSON(260)));
  pkg = await gen();
  const soft = sent.find((x) => /kind and PG/.test(JSON.stringify(x.body.contents)));
  ok('SAFETY everywhere -> softer request (humour 2 + PG note + BLOCK_NONE) succeeds', pkg && soft && soft.body.safetySettings && soft.body.safetySettings[0].threshold === 'BLOCK_NONE', pkg && pkg.genInfo);
  ok('the first humour-3 prompt really says Unhinged (test is meaningful)', /unhinged/i.test(JSON.stringify(sent[0].body.contents)));

  // 5) SAFETY always -> clear message naming the humour level
  sent.length = 0; handler = async () => empty('SAFETY');
  try { await gen(); ok('always SAFETY throws', false); } catch (e) { ok('always SAFETY -> "blocked for safety, try a lower humour level"', /safety/i.test(e.message) && /humour/i.test(e.message) && !/empty response/.test(e.message), e.message); ok('details carry finishReason + models + attempt trail', /SAFETY/.test(e.details) && /compact/.test(e.details), e.details.slice(0, 140)); }

  // 6) prompt blocked (promptFeedback) -> no model hopping, softer prompt, then clear message
  sent.length = 0; handler = async () => [200, { promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } }];
  try { await gen(); ok('blocked throws', false); } catch (e) { ok('prompt blocked -> safety message, no 7-model hopping', /safety/i.test(e.message) && /PROHIBITED_CONTENT/.test(e.message) && sent.length <= 4, sent.length + ' calls: ' + e.message); }

  // 7) RECITATION everywhere -> its own message
  sent.length = 0; handler = async () => empty('RECITATION');
  try { await gen(); ok('recitation throws', false); } catch (e) { ok('RECITATION -> explains it, suggests rewording', /RECITATION/.test(e.message) && /reword/i.test(e.message)); }

  // 8) empty everywhere -> plain empty message (not the old bare text) with details
  sent.length = 0; handler = async () => empty('STOP');
  try { await gen(); ok('empty throws', false); } catch (e) { ok('empty on every model/shape -> plain message + details', /empty reply/i.test(e.message) && /finishReason/.test(e.details), e.message); }

  // 9) HTTP 200 with an unreadable/cut body -> treated as transient, next model
  sent.length = 0; handler = async (m, b, n) => (n === 1 ? [200, 'BROKEN'] : reply(pkgJSON(260)));
  pkg = await gen();
  ok('200 with unreadable body -> next model, works', pkg && sent.length === 2 && sent[1].model !== sent[0].model);

  // 10) timeout -> 504 -> next model; friendly text when all time out
  sent.length = 0; handler = async (m, b, n) => (n === 1 ? 'HANG' : reply('{"a":1}'));
  const t = await G.generate([{ role: 'user', parts: [{ text: 'x' }] }], { timeout: 50 });
  ok('timeout on one model -> next model answers', t === '{"a":1}' && sent.length === 2);
  sent.length = 0; handler = async () => 'HANG';
  try { await G.generate([{ role: 'user', parts: [{ text: 'x' }] }], { timeout: 30 }); } catch (e) { ok('timeouts everywhere -> "took too long" message', /too long/.test(G.friendlyError(e)), G.friendlyError(e).split('\n')[0]); }

  // 11) quota everywhere -> "free limit" message; busy everywhere -> overloaded message
  sent.length = 0; handler = async () => quota;
  try { await gen(); } catch (e) { ok('429 everywhere -> "Google\'s free limit ... wait a minute"', /free limit/.test(G.friendlyError(e)) && /wait a minute/i.test(G.friendlyError(e)), G.friendlyError(e).split('\n')[0]); }
  sent.length = 0; handler = async () => busy;
  try { await gen(); } catch (e) { ok('503 everywhere -> overloaded message', /overloaded|busy/i.test(G.friendlyError(e))); }

  // 12) safety on one model but busy elsewhere -> the safety reason wins in the message
  sent.length = 0; handler = async (m) => (m === 'gemini-3.8-flash' ? empty('SAFETY') : busy);
  try { await gen(); ok('mixed throws', false); } catch (e) { ok('mixed SAFETY + busy -> reports safety (the actionable reason)', /safety/i.test(G.friendlyError(e)), G.friendlyError(e).split('\n')[0]); }

  // 13) long path (5 min) outline: empty once -> retried
  sent.length = 0; let first = true; handler = async (m, b) => { if (first) { first = false; return empty('OTHER'); } return reply(JSON.stringify({ hooks: ['a', 'b', 'c'], title: 't', sections: [{ title: 's1', summary: 'x', points: ['p'] }, { title: 's2', summary: 'y', points: ['q'] }, { title: 's3', summary: 'z', points: ['r'] }], description: 'd', hashtags: ['#a'], pinnedComment: 'p', thumbnailText: 't' })); };
  const r13 = await S.generateLong(IDEA, { length: '300', tone: 'sarcastic', onPartial: async (p) => { if (p.outline) throw Object.assign(new Error('stop-here'), { stopHere: true }); } }).catch((e) => e);
  ok('long outline survives an empty reply', r13 && r13.stopHere, r13 && r13.message);

  const n = results.filter(Boolean).length; console.log(n + '/' + results.length + ' passed'); process.exit(n === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
