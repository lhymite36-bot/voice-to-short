// Unit tests for www/js/autopilot-core.js (scheduling, retry, quota, OAuth + upload request building). Run: node tests/autopilot.js
'use strict';
const assert = require('assert');
const C = require('../www/js/autopilot-core.js');
let n = 0; const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const IST = (s) => Date.parse(s + '+05:30');
const S = { enabled: true };

test('default settings: 6/day at 9,11,13,16,19,21 IST', () => {
  const s = C.normSettings({}); assert.strictEqual(s.perDay, 6); assert.deepStrictEqual(s.times, ['09:00', '11:00', '13:00', '16:00', '19:00', '21:00']); assert.strictEqual(s.enabled, false);
});
test('slot times convert IST to UTC correctly', () => {
  const sl = C.slotsForDay('2026-11-05', S); assert.strictEqual(sl.length, 6);
  assert.strictEqual(new Date(sl[0].at).toISOString(), '2026-11-05T03:30:00.000Z');
  assert.strictEqual(new Date(sl[5].at).toISOString(), '2026-11-05T15:30:00.000Z');
});
test('perDay limits slots and times are sorted/deduped/validated', () => {
  const s = { enabled: true, perDay: 2, times: ['21:00', '9:00', '09:00', '25:00', 'x'] };
  assert.deepStrictEqual(C.slotsForDay('2026-11-05', s).map((x) => x.time), ['09:00', '21:00']);
  assert.strictEqual(C.normSettings({ perDay: 40 }).perDay, 6);
});
test('nextSlot: same day, then rolls to tomorrow', () => {
  assert.strictEqual(C.nextSlot(IST('2026-11-05T10:00:00'), S).id, '2026-11-05T11:00');
  assert.strictEqual(C.nextSlot(IST('2026-11-05T22:00:00'), S).id, '2026-11-06T09:00');
  assert.strictEqual(C.nextSlot(IST('2026-11-05T23:59:00'), S).id, '2026-11-06T09:00');
});
test('dueSlots: disabled -> nothing', () => { assert.deepStrictEqual(C.dueSlots(IST('2026-11-05T09:01:00'), { enabled: false }, []), []); });
test('dueSlots: slot just passed is due, done slot is not', () => {
  const now = IST('2026-11-05T09:02:00');
  assert.strictEqual(C.dueSlots(now, S, [])[0].id, '2026-11-05T09:00');
  assert.deepStrictEqual(C.dueSlots(now, S, [{ slot: '2026-11-05T09:00', status: 'posted' }]), []);
  assert.strictEqual(C.dueSlots(now, S, [{ slot: '2026-11-05T09:00', status: 'retrying' }]).length, 1);
});
test('catch-up after PC wakes: only newest missed slot within window', () => {
  const now = IST('2026-11-05T13:30:00'); // 9 and 11 missed, 13 missed recently
  const d = C.dueSlots(now, Object.assign({ catchUpHours: 3 }, S), []); assert.strictEqual(d.length, 1); assert.strictEqual(d[0].id, '2026-11-05T13:00');
  assert.deepStrictEqual(C.dueSlots(IST('2026-11-05T15:30:00'), { enabled: true, catchUpHours: 1 }, [{ slot: '2026-11-05T13:00', status: 'posted' }]), []);
  assert.strictEqual(C.dueSlots(IST('2026-11-06T00:30:00'), Object.assign({ catchUpHours: 4 }, S), [])[0].id, '2026-11-05T21:00'); // across midnight
});
test('quota: 6 uploads/day, resets at Pacific midnight', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  assert.strictEqual(C.quotaLeft(now, []).uploads, 6);
  const log = [1, 2, 3, 4].map((i) => ({ time: new Date(now - i * 600000).toISOString(), uploadAttempted: true, status: 'posted' }));
  log.push({ time: new Date(now).toISOString(), status: 'failed' }); // never reached YouTube -> free
  const q = C.quotaLeft(now, log); assert.strictEqual(q.used, 6400); assert.strictEqual(q.uploads, 2);
  assert.strictEqual(C.ptDay(Date.parse('2026-11-05T07:59:00Z')), '2026-11-04'); assert.strictEqual(C.ptDay(Date.parse('2026-11-05T08:01:00Z')), '2026-11-05');
  assert.strictEqual(C.quotaLeft(Date.parse('2026-11-06T09:00:00Z'), log).uploads, 6);
  assert.ok(C.quotaLeft(now, log).resetsAt > now);
});
test('quotaExceeded is detected and not retried', () => {
  const e = { status: 403, reason: 'quotaExceeded' }; assert.ok(C.quotaExceeded(e)); assert.ok(!C.isRetriable(e));
});
test('retriable: network, 429, 5xx, Gemini 503; not 400/401', () => {
  assert.ok(C.isRetriable({ network: true })); assert.ok(C.isRetriable({ status: 503 })); assert.ok(C.isRetriable({ status: 429 })); assert.ok(C.isRetriable(new TypeError('Failed to fetch')));
  assert.ok(!C.isRetriable({ status: 400 })); assert.ok(!C.isRetriable({ status: 401 }));
});
test('backoff grows and caps at 5 min', () => {
  const r = () => 0.5; assert.strictEqual(C.backoffMs(0, r), 20000); assert.strictEqual(C.backoffMs(1, r), 40000); assert.strictEqual(C.backoffMs(10, r), 300000);
});
test('withRetry retries 503 then succeeds; gives up on 400', async () => {
  const waits = []; let k = 0;
  const v = await C.withRetry(async () => { if (k++ < 2) { const e = new Error('overloaded'); e.status = 503; throw e; } return 'ok'; }, { sleep: async (ms) => waits.push(ms), rnd: () => 0.5 });
  assert.strictEqual(v, 'ok'); assert.deepStrictEqual(waits, [20000, 40000]);
  let calls = 0; await assert.rejects(C.withRetry(async () => { calls++; const e = new Error('bad'); e.status = 400; throw e; }, { sleep: async () => {} })); assert.strictEqual(calls, 1);
  calls = 0; await assert.rejects(C.withRetry(async () => { calls++; const e = new Error('x'); e.status = 503; throw e; }, { tries: 3, sleep: async () => {} })); assert.strictEqual(calls, 3);
});
test('pickIdea avoids repeats, then recycles least recently used', () => {
  const ideas = [{ text: 'A' }, { text: 'B' }, { text: 'C' }];
  for (let i = 0; i < 30; i++) assert.strictEqual(C.pickIdea(ideas, ['a', 'b']).text, 'C');
  assert.strictEqual(C.pickIdea(ideas, ['b', 'c', 'a']).text, 'B');
});
test('metadata: #shorts title, tags, public, not for kids, not synthetic', () => {
  const m = C.buildMetadata({ title: 'Why your brain replays 2014 at 3am', description: 'Rumination explained.', hashtags: ['#Shorts', '#psychology', '#overthinking'] }, { handle: '@QuietBrainClub' });
  assert.ok(/#shorts$/.test(m.snippet.title)); assert.ok(m.snippet.title.length <= 100);
  assert.ok(m.snippet.tags.includes('shorts') && m.snippet.tags.includes('overthinking'));
  assert.ok(m.snippet.description.includes('#shorts') || m.snippet.description.includes('#Shorts'));
  assert.deepStrictEqual([m.status.privacyStatus, m.status.selfDeclaredMadeForKids, m.status.containsSyntheticMedia], ['public', false, false]);
  const long = C.buildMetadata({ title: 'x'.repeat(300) }); assert.ok(long.snippet.title.length <= 100); assert.ok(/#shorts$/.test(long.snippet.title));
  assert.ok(!/[<>]/.test(C.buildMetadata({ title: 'a <b> c' }).snippet.title));
});
test('OAuth URL: PKCE, offline, both scopes, loopback redirect', async () => {
  const p = await C.pkcePair(); assert.ok(p.verifier.length >= 43 && p.challenge.length === 43);
  const u = new URL(C.buildAuthUrl({ clientId: '123-abc.apps.googleusercontent.com', redirectUri: 'http://127.0.0.1:5555', state: 's1', challenge: p.challenge }));
  assert.strictEqual(u.searchParams.get('access_type'), 'offline'); assert.strictEqual(u.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(u.searchParams.get('scope').includes('youtube.upload') && u.searchParams.get('scope').includes('youtube.readonly'));
  assert.strictEqual(u.searchParams.get('redirect_uri'), 'http://127.0.0.1:5555');
  assert.ok(C.validClientId('123-abc.apps.googleusercontent.com')); assert.ok(!C.validClientId('nope'));
  const t = C.tokenRequest({ code: 'c/1', clientId: 'id', clientSecret: 'sec', redirectUri: 'http://127.0.0.1:5555', verifier: 'v' });
  assert.ok(t.body.includes('grant_type=authorization_code') && t.body.includes('code=c%2F1') && t.body.includes('code_verifier=v'));
  assert.ok(C.refreshRequest({ clientId: 'id', refreshToken: 'r' }).body.includes('grant_type=refresh_token'));
});
test('refresh: invalid_grant flags reconnect', async () => {
  const f = async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }) });
  await assert.rejects(C.refreshAccess(f, { clientId: 'i', refreshToken: 'r' }), (e) => e.reconnect === true);
});

// --- mocked YouTube resumable upload ---
function hdr(o) { const m = new Map(Object.entries(o || {}).map(([k, v]) => [k.toLowerCase(), v])); return { get: (k) => m.get(k.toLowerCase()) || null }; }
function fakeBlob(size) { return { size, slice: (a, b) => ({ size: b - a, a, b }) }; }
function mockYouTube(opts) {
  const o = opts || {}; const calls = []; let have = 0; let initFails = o.initFails || 0; let chunkFails = o.chunkFails || 0;
  const f = async (url, init) => {
    calls.push({ url, init });
    if (o.offline && calls.length <= o.offline) throw new TypeError('Failed to fetch');
    if (init.method === 'POST') {
      if (initFails-- > 0) return { ok: false, status: 503, headers: hdr(), json: async () => ({ error: { message: 'Backend Error', errors: [{ reason: 'backendError' }] } }) };
      if (o.quota) return { ok: false, status: 403, headers: hdr(), json: async () => ({ error: { message: 'quota', errors: [{ reason: 'quotaExceeded' }] } }) };
      return { ok: true, status: 200, headers: hdr({ Location: 'https://upload.example/session1' }), json: async () => ({}) };
    }
    const cr = init.headers['Content-Range'];
    if (/\*\//.test(cr)) return { ok: false, status: 308, headers: hdr(have ? { Range: 'bytes=0-' + (have - 1) } : {}), json: async () => ({}) };
    if (chunkFails-- > 0) return { ok: false, status: 503, headers: hdr(), json: async () => ({}) };
    const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(cr); const end = +m[2] + 1; const total = +m[3];
    assert.strictEqual(+m[1], have, 'chunk must start where YouTube left off');
    have = end;
    if (end >= total) return { ok: true, status: 200, headers: hdr(), json: async () => ({ id: 'VID123', status: { privacyStatus: 'public' } }) };
    return { ok: false, status: 308, headers: hdr({ Range: 'bytes=0-' + (end - 1) }), json: async () => ({}) };
  };
  return { f, calls };
}
const meta = C.buildMetadata({ title: 'T' });
test('upload: init request carries metadata + size headers', async () => {
  const yt = mockYouTube(); const r = await C.uploadVideo(yt.f, { accessToken: 'AT', blob: fakeBlob(20 * 1048576), mime: 'video/webm', metadata: meta, sleep: async () => {} });
  assert.strictEqual(r.id, 'VID123');
  const init = yt.calls[0]; assert.ok(init.url.startsWith('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status'));
  assert.strictEqual(init.init.headers.Authorization, 'Bearer AT'); assert.strictEqual(init.init.headers['X-Upload-Content-Length'], String(20 * 1048576));
  assert.deepStrictEqual(JSON.parse(init.init.body).status, meta.status);
  assert.strictEqual(yt.calls.length, 1 + 3); // 8 MiB chunks: 3 PUTs
  assert.strictEqual(yt.calls[1].init.headers['Content-Range'], 'bytes 0-8388607/20971520');
});
test('upload: retries 503 on start and mid-upload, resumes from server offset', async () => {
  const yt = mockYouTube({ initFails: 2, chunkFails: 1 }); const waits = [];
  const r = await C.uploadVideo(yt.f, { accessToken: 'AT', blob: fakeBlob(10 * 1048576), metadata: meta, sleep: async (ms) => waits.push(ms), rnd: () => 0.5 });
  assert.strictEqual(r.id, 'VID123'); assert.ok(waits.length >= 3);
  assert.ok(yt.calls.some((c) => /\*\//.test(c.init.headers['Content-Range'] || '')), 'asks for upload status before resuming');
});
test('upload: network drop is retried', async () => {
  const yt = mockYouTube({ offline: 1 }); const r = await C.uploadVideo(yt.f, { accessToken: 'AT', blob: fakeBlob(1000), metadata: meta, sleep: async () => {} }); assert.strictEqual(r.id, 'VID123');
});
test('upload: quotaExceeded fails fast', async () => {
  const yt = mockYouTube({ quota: true });
  await assert.rejects(C.uploadVideo(yt.f, { accessToken: 'AT', blob: fakeBlob(1000), metadata: meta, sleep: async () => {} }), (e) => C.quotaExceeded(e));
  assert.strictEqual(yt.calls.length, 1);
});
test('channelInfo parses the channel title', async () => {
  const f = async (url, init) => { assert.ok(url.includes('mine=true')); assert.strictEqual(init.headers.Authorization, 'Bearer AT'); return { ok: true, status: 200, json: async () => ({ items: [{ id: 'UC1', snippet: { title: 'Quiet Brain', customUrl: '@quietbrain' } }] }) }; };
  assert.deepStrictEqual(await C.channelInfo(f, 'AT'), { id: 'UC1', title: 'Quiet Brain', customUrl: '@quietbrain' });
});

// --- Buffer mode (default) ---
function jres(status, body, headers) { return { status, ok: status >= 200 && status < 300, headers: hdr(headers), json: async () => body }; }
test('settings default to Buffer; lead time moves the run before the slot', () => {
  assert.strictEqual(C.normSettings({}).method, 'buffer');
  const s = { enabled: true, leadMin: 40 }; const sl = C.slotsForDay('2026-11-05', s)[0];
  assert.strictEqual(sl.at - sl.runAt, 40 * 60000);
  assert.strictEqual(C.dueSlots(IST('2026-11-05T08:25:00'), s, [])[0].id, '2026-11-05T09:00');
  assert.deepStrictEqual(C.dueSlots(IST('2026-11-05T08:10:00'), s, []), []);
  assert.strictEqual(C.nextSlot(IST('2026-11-05T08:30:00'), s).id, '2026-11-05T11:00');
});
test('deferred / retrying slots wait for nextRetryAt', () => {
  const now = IST('2026-11-05T09:10:00');
  assert.deepStrictEqual(C.dueSlots(now, S, [{ slot: '2026-11-05T09:00', status: 'deferred', nextRetryAt: new Date(now + 60000).toISOString() }]), []);
  assert.strictEqual(C.dueSlots(now, S, [{ slot: '2026-11-05T09:00', status: 'deferred', nextRetryAt: new Date(now - 60000).toISOString() }]).length, 1);
  assert.deepStrictEqual(C.dueSlots(now, S, [{ slot: '2026-11-05T09:00', status: 'scheduled' }]), []);
});
test('Buffer post input: customScheduled, YouTube category 24, public, not for kids, not AI', () => {
  const inp = C.bufferPostInput({ channelId: 'c'.repeat(24), pkg: { title: 'Brain at 3am', description: 'd', hashtags: ['#psychology'] }, videoUrl: 'https://github.com/o/r/releases/download/t/a.mp4', dueAt: Date.parse('2026-11-05T03:30:00Z') });
  assert.strictEqual(inp.mode, 'customScheduled'); assert.strictEqual(inp.schedulingType, 'automatic'); assert.strictEqual(inp.dueAt, '2026-11-05T03:30:00.000Z');
  assert.deepStrictEqual(inp.metadata.youtube, { title: inp.metadata.youtube.title, categoryId: '24', privacy: 'public', madeForKids: false, isAiGenerated: false, notifySubscribers: true, embeddable: true, license: 'youtube' });
  assert.ok(/#shorts$/.test(inp.metadata.youtube.title)); assert.strictEqual(inp.assets[0].video.url, 'https://github.com/o/r/releases/download/t/a.mp4');
});
test('Buffer: lists channels across orgs, counts queue, creates post', async () => {
  const calls = [];
  const http = async (req) => { calls.push(req); assert.strictEqual(req.headers.Authorization, 'Bearer KEY'); const b = JSON.parse(req.body);
    if (/account/.test(b.query)) return jres(200, { data: { account: { organizations: [{ id: 'o1', name: 'Pedro' }] } } });
    if (/channels\(/.test(b.query)) return jres(200, { data: { channels: [{ id: 'ch1', name: 'Quiet Brain', service: 'youtube' }, { id: 'ch2', name: 'x', service: 'twitter' }] } });
    if (/posts\(/.test(b.query)) { assert.deepStrictEqual(b.variables.ch, ['ch1']); return jres(200, { data: { posts: { edges: Array(10).fill({ node: { id: 'p' } }) } } }); }
    if (/createPost/.test(b.query)) return jres(200, { data: { createPost: { post: { id: 'P1', dueAt: b.variables.input.dueAt, status: 'scheduled' } } } });
  };
  const ch = await C.bufferChannels(http, 'KEY'); assert.strictEqual(ch.length, 2); assert.strictEqual(ch[0].organizationId, 'o1');
  const n = await C.bufferQueueCount(http, 'KEY', 'o1', 'ch1'); assert.strictEqual(n, 10);
  assert.ok(!C.bufferCanQueue(n)); assert.ok(C.bufferCanQueue(9));
  const p = await C.bufferCreatePost(http, 'KEY', { channelId: 'ch1' }); assert.strictEqual(p.id, 'P1');
});
test('Buffer: MutationError limit -> queueFull; bad key -> fatal; 503 retriable', async () => {
  const lim = async () => jres(200, { data: { createPost: { message: 'You have reached the queue limit for your plan' } } });
  await assert.rejects(C.bufferCreatePost(lim, 'K', {}), (e) => e.queueFull === true);
  await assert.rejects(C.bufferCall(async () => jres(401, {}), 'K', 'q'), (e) => e.fatal === true);
  await assert.rejects(C.bufferCall(async () => jres(503, {}), 'K', 'q'), (e) => C.isRetriable(e));
  await assert.rejects(C.bufferCall(async () => { throw new Error('offline'); }, 'K', 'q'), (e) => C.isRetriable(e));
});
test('GitHub host: creates the media release if missing, uploads, returns public URL', async () => {
  const seen = [];
  const http = async (req) => { seen.push(req.method + ' ' + req.url);
    if (req.method === 'GET') return jres(404, {});
    const b = JSON.parse(req.body); assert.strictEqual(b.tag_name, 'vts-autopilot-media'); assert.strictEqual(b.make_latest, 'false'); assert.strictEqual(b.prerelease, true);
    return jres(201, { id: 77 }); };
  const up = async (req) => { assert.ok(req.url.startsWith('https://uploads.github.com/repos/pedro/qb-media/releases/77/assets?name=short-1.mp4')); assert.strictEqual(req.headers['Content-Type'], 'video/mp4'); return jres(201, { browser_download_url: 'https://github.com/pedro/qb-media/releases/download/vts-autopilot-media/short-1.mp4' }); };
  const url = await C.HOSTS.github.upload(http, up, { token: 'T', repo: 'pedro/qb-media', name: 'short-1.mp4', blob: fakeBlob(10), mime: 'video/mp4' });
  assert.strictEqual(url, 'https://github.com/pedro/qb-media/releases/download/vts-autopilot-media/short-1.mp4'); assert.strictEqual(seen.length, 2);
  await assert.rejects(C.HOSTS.github.upload(http, up, { token: 'T', repo: 'bad repo' }), (e) => e.fatal);
  await assert.rejects(C.HOSTS.github.upload(async () => jres(401, {}), up, { token: 'T', repo: 'a/b', name: 'x' }), (e) => e.fatal);
});

(async () => {
  let fail = 0;
  for (const [name, fn] of tests) { try { await fn(); n++; console.log('ok  ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n   ' + (e && e.stack || e)); } }
  console.log('\n' + n + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
