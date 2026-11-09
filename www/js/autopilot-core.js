/* Autopilot core: pure, testable logic for self-running YouTube posting.
   Scheduling (IST slots, catch-up), retry/backoff, YouTube quota, OAuth (PKCE + loopback) and
   resumable-upload request building. No DOM, no network: fetch is injected. Works in the browser
   (window.VTS.apcore) and in Node (module.exports) for unit tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.VTS = root.VTS || {}; root.VTS.apcore = api; }
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const IST_OFFSET_MIN = 330; // India Standard Time, no daylight saving
  const DEFAULT_TIMES = ['09:00', '11:00', '13:00', '16:00', '19:00', '21:00'];
  const DEFAULTS = { enabled: false, method: 'buffer', leadMin: 0, perDay: 6, times: DEFAULT_TIMES.slice(), catchUpHours: 3, privacy: 'public', startWithWindows: false };
  // YouTube Data API v3 default project quota: 10,000 units/day; videos.insert = 1,600 units -> 6 uploads.
  const QUOTA = { daily: 10000, insert: 1600, list: 1 };
  const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];
  const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
  const TOKEN_URL = 'https://oauth2.googleapis.com/token';
  const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
  const CHANNEL_URL = 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true';

  // ---------- time / schedule ----------
  function parseTime(s) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); if (!m) return null; const h = +m[1]; const mi = +m[2]; if (h > 23 || mi > 59) return null; return h * 60 + mi; }
  function normTimes(times) {
    const mins = (Array.isArray(times) ? times : []).map(parseTime).filter((x) => x != null);
    return Array.from(new Set(mins)).sort((a, b) => a - b).map((m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
  }
  function normSettings(s) {
    const o = Object.assign({}, DEFAULTS, s || {});
    o.enabled = !!o.enabled; o.perDay = Math.max(1, Math.min(6, Math.round(+o.perDay || DEFAULTS.perDay)));
    o.times = normTimes(o.times); if (!o.times.length) o.times = DEFAULT_TIMES.slice();
    o.catchUpHours = Math.max(0, Math.min(24, +o.catchUpHours || 0));
    o.method = o.method === 'youtube' ? 'youtube' : 'buffer'; o.leadMin = Math.max(0, Math.min(180, +o.leadMin || 0));
    return o;
  }
  // IST calendar day key for a timestamp, e.g. "2026-11-05".
  function istDay(ms) { const d = new Date(ms + IST_OFFSET_MIN * 60000); return d.toISOString().slice(0, 10); }
  // Epoch ms for an IST day + "HH:MM".
  function istSlotMs(day, hhmm) { const [y, mo, d] = day.split('-').map(Number); const m = parseTime(hhmm); return Date.UTC(y, mo - 1, d, 0, m) - IST_OFFSET_MIN * 60000; }
  // The active slots for a day: the first perDay times.
  function slotsForDay(day, settings) { const s = normSettings(settings); const lead = (s.leadMin || 0) * 60000; return s.times.slice(0, s.perDay).map((t) => { const at = istSlotMs(day, t); return { id: day + 'T' + t, day, time: t, at, runAt: at - lead }; }); }
  function nextSlot(now, settings) {
    const today = istDay(now);
    for (let k = 0; k < 3; k++) { const day = istDay(istSlotMs(today, '12:00') + k * 86400000); const s = slotsForDay(day, settings).find((x) => x.runAt > now); if (s) return s; }
    return null;
  }
  // Slots that should run now: time has passed, not yet done (success or given up), within the catch-up window.
  // Only the newest missed slot is caught up (never a burst of several videos at once).
  function dueSlots(now, settings, log) {
    const s = normSettings(settings); if (!s.enabled) return [];
    // 'running' counts as busy unless it is stale (app killed / render hung) — recoverStale() turns those into retrying/failed.
    const done = new Set((log || []).filter((e) => e.status === 'posted' || e.status === 'scheduled' || e.status === 'failed' || e.status === 'skipped' || (e.status === 'running' && !isStale(e, now))).map((e) => e.slot));
    const waiting = new Map((log || []).filter((e) => e.nextRetryAt && (e.status === 'retrying' || e.status === 'deferred')).map((e) => [e.slot, Date.parse(e.nextRetryAt)]));
    const win = Math.max(s.catchUpHours * 3600000, 10 * 60000);
    const cands = [];
    [istDay(now - 86400000), istDay(now)].forEach((day) => slotsForDay(day, s).forEach((x) => { if (x.runAt <= now && now - x.at <= win && !done.has(x.id) && !(waiting.get(x.id) > now)) cands.push(x); }));
    cands.sort((a, b) => b.at - a.at);
    return cands.slice(0, 1);
  }

  // ---------- hang protection ----------
  // A whole slot (script + voice + render + upload + Buffer) normally takes 2–8 min. Anything still 'running'
  // with no progress beat for STALE_MS was killed (app closed, WebView frozen in the background) or hung.
  const LIMITS = { stage: { script: 6 * 60000, voice: 4 * 60000, decode: 60000, render: 12 * 60000, upload: 10 * 60000 }, noProgressMs: 120000, frozenGapMs: 90000, thawGraceMs: 90000, wallMs: 3 * 3600000, uploadStallMs: 60000, scriptMs: 6 * 60000, renderMs: 19 * 60000, uploadMs: 10 * 60000, bufferMs: 2 * 60000, slotMs: 30 * 60000, staleMs: 20 * 60000, maxShortSec: 70, bufferMaxSec: 179 };
  function lastBeat(e) { return Math.max(Date.parse(e && e.beat || '') || 0, Date.parse(e && e.time || '') || 0); }
  function isStale(e, now, ms) { return !!e && e.status === 'running' && (now - lastBeat(e)) > (ms || LIMITS.staleMs); }
  // Decide what to do with each stale 'running' row: retry once (re-using an uploaded video if there is one) or give up with a clear reason.
  // Returns patches for putLog; skip = the slot currently running in this process.
  function recoverStale(now, log, settings, skip) {
    const s = normSettings(settings); const win = Math.max(s.catchUpHours * 3600000, 10 * 60000); const out = [];
    (log || []).forEach((e) => {
      if (!isStale(e, now) || e.slot === skip) return;
      const at = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(e.slot) ? istSlotMs(e.slot.slice(0, 10), e.slot.slice(11)) : lastBeat(e);
      const stuckAt = (e.step ? ' at step "' + e.step + '"' : '') + (e.stage && e.stageAt ? ' (stage ' + e.stage + ' began ' + new Date(e.stageAt).toISOString().slice(11, 16) + ' UTC)' : '');
      const mins = Math.round((now - lastBeat(e)) / 60000);
      const fence = 'recovered-' + now.toString(36);
      if ((e.attempts || 1) < 2 && now - at <= win) out.push({ slot: e.slot, gen: fence, status: 'retrying', step: '', error: 'Previous try stopped' + stuckAt + ' with no progress for ' + mins + ' min (app closed or render stalled). Retrying once' + (e.videoUrl ? ' with the already-uploaded video.' : '.'), nextRetryAt: new Date(now).toISOString() });
      else out.push({ slot: e.slot, gen: fence, status: 'failed', step: '', error: 'Stopped' + stuckAt + ' with no progress for ' + mins + ' min (app closed or render stalled) and the slot is past its catch-up window. Marked failed so the next slots can run.', nextRetryAt: null });
    });
    return out;
  }
  // Freeze clock: Android can stop the app's JavaScript completely (phone asleep / Doze, app frozen in the background).
  // A heartbeat that should tick every few seconds and instead comes back after > gapMs means the app was frozen for that
  // long. Budgets (stage limits, no-progress, the 30-min slot watchdog) count ACTIVE time only, so a render that was frozen
  // and then thawed gets to continue instead of being killed the instant the phone wakes. (Hidden-page timer throttling
  // stretches a 5 s tick to at most ~60 s, which stays below gapMs, so it is not mistaken for a freeze.)
  function freezeClock(start, gapMs) {
    const g = gapMs || LIMITS.frozenGapMs; const spans = []; let last = start;
    return {
      tick(now) { const gap = now - last; last = now; if (gap > g) { spans.push([now - gap, now]); return gap; } return 0; },
      pendingGap(now) { return now - last > g ? now - last : 0; },
      frozenSince(since, now) { let f = 0; spans.forEach(([a, b]) => { const lo = Math.max(a, since); const hi = Math.min(b, now); if (hi > lo) f += hi - lo; }); const pg = now - last > g ? now - Math.max(last, since) : 0; return f + Math.max(0, pg); },
      activeSince(since, now) { return Math.max(0, now - since - this.frozenSince(since, now)); },
      get frozenMs() { return spans.reduce((t, [a, b]) => t + (b - a), 0); },
      get lastThaw() { return spans.length ? spans[spans.length - 1][1] : 0; },
      get count() { return spans.length; },
    };
  }
  // Close the previous stage and open the next one; returns a patch { stage, stageAt, stages } for the log row.
  function stagePatch(entry, name, now) {
    const st = Object.assign({}, (entry && entry.stages) || {}); const prevName = entry && entry.stage;
    if (prevName && st[prevName] && !st[prevName].ms) st[prevName] = Object.assign({}, st[prevName], { ms: now - Date.parse(st[prevName].at) });
    if (name) st[name] = { at: new Date(now).toISOString() };
    return { stage: name || '', stageAt: name ? new Date(now).toISOString() : null, stages: st };
  }
  // Human-readable timing summary, e.g. "script 41s, voice 18s, render 2m10s (stalled 31%), hidden 3m".
  function fmtMs(ms) { ms = Math.max(0, ms | 0); const m = Math.floor(ms / 60000); const s2 = Math.round((ms % 60000) / 1000); return m ? m + 'm' + (s2 ? s2 + 's' : '') : s2 + 's'; }
  function diagText(entry, now) {
    const e = entry || {}; const parts = [];
    Object.keys(e.stages || {}).forEach((k) => { const x = e.stages[k]; parts.push(k + ' ' + fmtMs(x.ms != null ? x.ms : now - Date.parse(x.at)) + (x.ms == null ? ' (unfinished)' : '')); });
    if (e.progress != null) parts.push('last progress ' + Math.round(e.progress * 100) + '%' + (e.progressAt ? ' ' + fmtMs(now - Date.parse(e.progressAt)) + ' ago' : ''));
    if (e.hiddenMs) parts.push('app in background ' + fmtMs(e.hiddenMs));
    if (e.frozenMs) parts.push('app frozen ' + fmtMs(e.frozenMs) + ' (phone asleep or Android paused the app)');
    if (e.checkpoint) parts.push('saved: ' + e.checkpoint);
    if (e.diag && e.diag.length) parts.push(e.diag.slice(-3).join('; '));
    return parts.join(', ');
  }
  class TimeoutError extends Error { constructor(what, ms) { super(what + ' timed out after ' + Math.round(ms / 60000) + ' min'); this.timeout = true; } }
  // Race a promise against a timer; on timeout call abort() (if given) and reject with a clear message (not retriable by withRetry).
  function withTimeout(p, ms, what, abort) {
    let t; const timer = new Promise((_, rej) => { t = setTimeout(() => { try { if (abort) abort(); } catch (_) { /* ignore */ } rej(new TimeoutError(what, ms)); }, ms); });
    return Promise.race([Promise.resolve(p), timer]).finally(() => clearTimeout(t));
  }
  // Buffer rejects YouTube Shorts over 3 min; we target ~40–70 s. Unknown / infinite durations (broken webm header) are also refused.
  function shortDurationProblem(sec, max) { const m = max || LIMITS.maxShortSec; if (!(sec > 0) || !isFinite(sec)) return 'video length unknown (' + sec + ')'; if (sec > m) return 'video is ' + Math.round(sec) + ' s, over the ' + m + ' s Short limit'; return ''; }
  function dayTag(ms) { return 'vts-autopilot-media-' + new Date(ms).toISOString().slice(0, 10).replace(/-/g, ''); }

  // ---------- quota ----------
  // YouTube quota resets at midnight Pacific Time.
  function ptDay(ms) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); }
    catch (_) { return new Date(ms - 8 * 3600000).toISOString().slice(0, 10); }
  }
  // Every upload attempt that reached YouTube (posted, or failed after the insert was accepted) costs 1,600 units.
  function quotaUsed(now, log) { const day = ptDay(now); return (log || []).filter((e) => e.uploadAttempted && ptDay(Date.parse(e.time)) === day).reduce((a, e) => a + QUOTA.insert * (e.uploadAttempts || 1), 0); }
  function quotaLeft(now, log, daily) { const cap = daily || QUOTA.daily; const used = quotaUsed(now, log); return { used, units: Math.max(0, cap - used), uploads: Math.max(0, Math.floor((cap - used) / QUOTA.insert)), resetsAt: nextPtMidnight(now) }; }
  function nextPtMidnight(now) { const d0 = ptDay(now); let t = now; for (let i = 0; i < 50 && ptDay(t) === d0; i++) t += 3600000; return t - (t % 3600000); }
  function quotaExceeded(err) { const r = err && (err.reason || ''); return err && err.status === 403 && /quotaExceeded|dailyLimitExceeded|uploadLimitExceeded/i.test(r + ' ' + (err.message || '')); }

  // ---------- retry ----------
  function isRetriable(err) {
    if (!err) return false;
    if (err.noRetry) return false; // e.g. voice already used its time budget: retry the slot later, not inside this run
    if (quotaExceeded(err)) return false;
    if (err.network || err.name === 'TypeError' || /network|failed to fetch|timeout|ECONN|ETIMEDOUT/i.test(err.message || '')) return true;
    const st = err.status || 0;
    return st === 408 || st === 429 || st === 500 || st === 502 || st === 503 || st === 504 || !!(err.overloaded);
  }
  // Exponential backoff with jitter: 20 s, 40 s, 80 s, 160 s, 300 s cap.
  function backoffMs(attempt, rnd) { const r = rnd ? rnd() : Math.random(); const base = Math.min(300000, 20000 * Math.pow(2, attempt)); return Math.round(base * (0.8 + 0.4 * r)); }
  async function withRetry(fn, opts) {
    const o = Object.assign({ tries: 5, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), rnd: Math.random, onWait: null }, opts || {});
    let last;
    for (let a = 0; a < o.tries; a++) {
      try { return await fn(a); } catch (e) {
        last = e; if (!isRetriable(e) || a === o.tries - 1) throw e;
        const ms = backoffMs(a, o.rnd); if (o.onWait) o.onWait(ms, a, e); await o.sleep(ms);
      }
    }
    throw last;
  }

  // ---------- ideas ----------
  function ideaKey(it) { return String((it && it.text) || it || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  // Pick an idea not used before; once the whole bank is used, start over with the least recently used.
  function pickIdea(ideas, used, rnd) {
    const r = rnd || Math.random; const u = used || [];
    const fresh = ideas.filter((it) => !u.includes(ideaKey(it)));
    if (fresh.length) return fresh[Math.floor(r() * fresh.length)];
    const order = new Map(u.map((k, i) => [k, i]));
    return ideas.slice().sort((a, b) => (order.get(ideaKey(a)) || 0) - (order.get(ideaKey(b)) || 0))[0] || null;
  }

  // ---------- metadata ----------
  const clip = (s, n) => { s = String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
  function buildMetadata(pkg, opts) {
    const o = opts || {}; pkg = pkg || {};
    const tagsIn = [].concat(pkg.hashtags || [], pkg.tags || []).map((t) => String(t).replace(/^#/, '').replace(/[^\p{L}\p{N}_]/gu, '')).filter(Boolean);
    const tags = Array.from(new Set(['shorts'].concat(tagsIn, ['psychology', 'quietbrain']))).slice(0, 15);
    let title = clip(pkg.title || pkg.textHook || o.fallbackTitle || 'Your brain does this', 90);
    if (!/#shorts/i.test(title)) title = clip(title, 91) + ' #shorts';
    const hashLine = tags.slice(0, 5).map((t) => '#' + t).join(' ');
    let desc = String(pkg.description || '').replace(/[<>]/g, '').trim();
    if (!/#shorts/i.test(desc)) desc = (desc ? desc + '\n\n' : '') + hashLine;
    if (o.handle) desc += '\n\nFollow ' + o.handle + ' for more brain stuff.';
    let tagChars = 0; const tagsOut = tags.filter((t) => { tagChars += t.length + 3; return tagChars <= 480; });
    return {
      snippet: { title, description: desc.slice(0, 4900), tags: tagsOut, categoryId: o.categoryId || '27', defaultLanguage: o.lang || 'en', defaultAudioLanguage: o.lang || 'en' },
      status: { privacyStatus: o.privacy || 'public', selfDeclaredMadeForKids: false, containsSyntheticMedia: false, embeddable: true, license: 'youtube' },
    };
  }

  // ---------- OAuth (installed app: PKCE + loopback redirect) ----------
  function b64url(bytes) { let s = ''; const b = new Uint8Array(bytes); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function getCrypto() { if (typeof crypto !== 'undefined' && crypto.subtle) return crypto; try { return require('crypto').webcrypto; } catch (_) { return null; } }
  async function pkcePair() {
    const c = getCrypto(); const v = new Uint8Array(48); c.getRandomValues(v);
    const verifier = b64url(v); const dig = await c.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return { verifier, challenge: b64url(dig), method: 'S256' };
  }
  function randomState() { const c = getCrypto(); const v = new Uint8Array(16); c.getRandomValues(v); return b64url(v); }
  function validClientId(id) { return /^[0-9]+-[a-z0-9_]+\.apps\.googleusercontent\.com$/i.test(String(id || '').trim()); }
  function buildAuthUrl(o) {
    const q = new URLSearchParams({ client_id: o.clientId, redirect_uri: o.redirectUri, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: o.state, code_challenge: o.challenge, code_challenge_method: 'S256' });
    return AUTH_URL + '?' + q.toString();
  }
  function form(obj) { return Object.entries(obj).filter(([, v]) => v != null && v !== '').map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&'); }
  function tokenRequest(o) { return { url: TOKEN_URL, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ code: o.code, client_id: o.clientId, client_secret: o.clientSecret, redirect_uri: o.redirectUri, grant_type: 'authorization_code', code_verifier: o.verifier }) }; }
  function refreshRequest(o) { return { url: TOKEN_URL, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ client_id: o.clientId, client_secret: o.clientSecret, refresh_token: o.refreshToken, grant_type: 'refresh_token' }) }; }

  // ---------- HTTP helpers ----------
  async function apiError(res, what) {
    let body = null; try { body = await res.json(); } catch (_) { /* not json */ }
    const er = body && body.error; const reason = er && er.errors && er.errors[0] && er.errors[0].reason || (typeof er === 'string' ? er : '');
    const msg = (er && er.message) || (body && body.error_description) || ('HTTP ' + res.status);
    const e = new Error(what + ': ' + msg); e.status = res.status; e.reason = reason; e.body = body; return e;
  }
  async function call(fetchFn, req) { try { return await fetchFn(req.url, { method: req.method, headers: req.headers, body: req.body }); } catch (e) { const er = new Error('Network error: ' + (e && e.message || e)); er.network = true; throw er; } }
  async function exchangeCode(fetchFn, o) { const res = await call(fetchFn, tokenRequest(o)); if (!res.ok) throw await apiError(res, 'Google sign-in'); return res.json(); }
  async function refreshAccess(fetchFn, o) {
    const res = await call(fetchFn, refreshRequest(o));
    if (!res.ok) { const e = await apiError(res, 'Google token refresh'); if (e.reason === 'invalid_grant' || (e.body && e.body.error === 'invalid_grant')) e.reconnect = true; throw e; }
    const j = await res.json(); return { accessToken: j.access_token, expiresAt: Date.now() + (j.expires_in || 3600) * 1000 - 60000 };
  }
  async function channelInfo(fetchFn, accessToken) {
    const res = await call(fetchFn, { url: CHANNEL_URL, method: 'GET', headers: { Authorization: 'Bearer ' + accessToken } });
    if (!res.ok) throw await apiError(res, 'YouTube channel');
    const j = await res.json(); const it = j.items && j.items[0];
    return it ? { id: it.id, title: it.snippet && it.snippet.title, customUrl: it.snippet && it.snippet.customUrl } : null;
  }

  // ---------- resumable upload ----------
  function uploadInitRequest(o) {
    return { url: UPLOAD_URL, method: 'POST', headers: { Authorization: 'Bearer ' + o.accessToken, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(o.size), 'X-Upload-Content-Type': o.mime || 'video/webm' }, body: JSON.stringify(o.metadata) };
  }
  function chunkRequest(o) {
    const end = Math.min(o.size, o.offset + o.chunk) - 1;
    return { url: o.sessionUrl, method: 'PUT', headers: { Authorization: 'Bearer ' + o.accessToken, 'Content-Range': 'bytes ' + o.offset + '-' + end + '/' + o.size }, start: o.offset, end: end + 1 };
  }
  function statusRequest(o) { return { url: o.sessionUrl, method: 'PUT', headers: { Authorization: 'Bearer ' + o.accessToken, 'Content-Range': 'bytes */' + o.size }, body: null }; }
  function rangeEnd(res) { const r = res.headers.get('Range') || res.headers.get('range'); const m = r && /bytes=0-(\d+)/.exec(r); return m ? +m[1] + 1 : 0; }
  // blob: anything with .size and .slice(a,b) (Blob in the browser, a Buffer-backed shim in tests).
  async function uploadVideo(fetchFn, o) {
    const chunk = o.chunk || 8 * 1024 * 1024; // multiple of 256 KiB
    const size = o.blob.size; const sleep = o.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const init = await withRetry(async () => {
      const res = await call(fetchFn, uploadInitRequest({ accessToken: o.accessToken, size, mime: o.mime, metadata: o.metadata }));
      if (!res.ok) throw await apiError(res, 'YouTube upload start');
      const url = res.headers.get('Location') || res.headers.get('location'); if (!url) throw new Error('YouTube did not return an upload URL.');
      return url;
    }, { tries: o.tries || 5, sleep, rnd: o.rnd, onWait: o.onWait });
    if (o.onSession) o.onSession(init);
    let offset = 0; let fails = 0;
    while (true) {
      const rq = chunkRequest({ sessionUrl: init, accessToken: o.accessToken, offset, size, chunk });
      let res;
      try { res = await call(fetchFn, { url: rq.url, method: rq.method, headers: rq.headers, body: o.blob.slice(rq.start, rq.end) }); }
      catch (e) { res = null; if (++fails > (o.tries || 5)) throw e; }
      if (res && (res.status === 200 || res.status === 201)) { const j = await res.json(); if (o.onProgress) o.onProgress(1); return j; }
      if (res && res.status === 308) { offset = rangeEnd(res); fails = 0; if (o.onProgress) o.onProgress(offset / size); continue; }
      if (res && !(res.status >= 500 || res.status === 429)) throw await apiError(res, 'YouTube upload');
      if (res && ++fails > (o.tries || 5)) throw await apiError(res, 'YouTube upload');
      await sleep(backoffMs(fails - 1, o.rnd));
      // ask YouTube how much it already has, then resume from there
      try { const st = await call(fetchFn, statusRequest({ sessionUrl: init, accessToken: o.accessToken, size })); if (st.status === 200 || st.status === 201) return st.json(); if (st.status === 308) offset = rangeEnd(st); } catch (_) { /* retry the chunk */ }
    }
  }

  // ---------- Buffer (default posting method) ----------
  // Buffer public GraphQL API (https://developers.buffer.com). Personal API key, no Google review needed.
  // http(req) -> { status, ok, json() } ; req = { url, method, headers, body } (native HTTP on Android/desktop: api.buffer.com has no CORS).
  const BUFFER_URL = 'https://api.buffer.com';
  const BUFFER_FREE_QUEUE = 10;
  function bufferRequest(apiKey, query, variables) { return { url: BUFFER_URL, method: 'POST', headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables: variables || {} }) }; }
  async function bufferCall(http, apiKey, query, variables) {
    let res; try { res = await http(bufferRequest(apiKey, query, variables)); } catch (e) { const er = new Error('Network error: ' + (e && e.message || e)); er.network = true; throw er; }
    let j = null; try { j = await res.json(); } catch (_) { /* ignore */ }
    if (res.status === 401 || res.status === 403) { const e = new Error('Buffer rejected the API key (check it in Settings).'); e.status = res.status; e.fatal = true; throw e; }
    if (!res.ok && !(j && j.data)) { const e = new Error('Buffer: HTTP ' + res.status + (j && j.errors && j.errors[0] ? ' ' + j.errors[0].message : '')); e.status = res.status; throw e; }
    if (j && j.errors && j.errors.length && !j.data) { const e = new Error('Buffer: ' + j.errors[0].message); e.status = 400; const code = j.errors[0].extensions && j.errors[0].extensions.code; if (code === 'UNAUTHORIZED' || code === 'UNAUTHENTICATED') { e.status = 401; e.fatal = true; } throw e; }
    return j.data;
  }
  const Q_ORGS = 'query { account { organizations { id name } } }';
  const Q_CHANNELS = 'query Ch($org: OrganizationId!) { channels(input: { organizationId: $org }) { id name displayName service isQueuePaused isDisconnected } }';
  const Q_QUEUE = 'query Q($org: OrganizationId!, $ch: [ChannelId!]) { posts(first: 100, input: { organizationId: $org, filter: { channelIds: $ch, status: [scheduled] } }) { edges { node { id dueAt } } } }';
  const M_CREATE = 'mutation P($input: CreatePostInput!) { createPost(input: $input) { ... on PostActionSuccess { post { id dueAt status } } ... on MutationError { message } } }';
  async function bufferChannels(http, apiKey) {
    const d = await bufferCall(http, apiKey, Q_ORGS); const orgs = (d.account && d.account.organizations) || []; const out = [];
    for (const o of orgs) { const c = await bufferCall(http, apiKey, Q_CHANNELS, { org: o.id }); (c.channels || []).forEach((ch) => out.push(Object.assign({ organizationId: o.id, organizationName: o.name }, ch))); }
    return out;
  }
  async function bufferQueueCount(http, apiKey, org, channelId) { const d = await bufferCall(http, apiKey, Q_QUEUE, { org, ch: [channelId] }); return ((d.posts && d.posts.edges) || []).length; }
  // YouTube Short via Buffer: video asset by public URL, scheduled at the slot time.
  function bufferPostInput(o) {
    const yt = buildMetadata(o.pkg, { handle: o.handle });
    return { channelId: o.channelId, schedulingType: 'automatic', mode: 'customScheduled', dueAt: new Date(o.dueAt).toISOString(), needsApproval: false,
      text: yt.snippet.description, assets: [{ video: { url: o.videoUrl, metadata: { title: yt.snippet.title } } }],
      metadata: { youtube: { title: yt.snippet.title, categoryId: '24', privacy: 'public', madeForKids: false, isAiGenerated: false, notifySubscribers: true, embeddable: true, license: 'youtube' } }, source: 'voice-to-short-autopilot' };
  }
  async function bufferCreatePost(http, apiKey, input) {
    const d = await bufferCall(http, apiKey, M_CREATE, { input }); const r = d.createPost || {};
    if (r.post) return r.post;
    const e = new Error('Buffer: ' + (r.message || 'could not create the post')); if (/limit|queue.*full|upgrade/i.test(r.message || '')) e.queueFull = true; else e.status = 400; throw e;
  }
  // When the queue is full, wait for a slot to free up (Buffer free plan: 10 scheduled posts per channel).
  function bufferCanQueue(count, limit) { return count < (limit || BUFFER_FREE_QUEUE); }

  // ---------- media hosts (pluggable) for Buffer, which only takes a public URL ----------
  // uploadFile(req) -> { status, json() } ; req = { url, method, headers, blob|path }.
  const HOSTS = {
    github: {
      label: 'GitHub release (public repo, your token)',
      // o: { token, repo: 'owner/name', tag, name, blob, size, mime }
      async upload(http, uploadFile, o) {
        if (!/^[\w.-]+\/[\w.-]+$/.test(o.repo || '')) throw Object.assign(new Error('Set the GitHub repo as owner/name in Settings.'), { fatal: true });
        const H = { Authorization: 'Bearer ' + o.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
        const tag = o.tag || 'vts-autopilot-media';
        const getRel = () => http({ url: 'https://api.github.com/repos/' + o.repo + '/releases/tags/' + tag, method: 'GET', headers: H });
        let rel = await getRel();
        const mk = () => http({ url: 'https://api.github.com/repos/' + o.repo + '/releases', method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: JSON.stringify({ tag_name: tag, name: 'Voice to Short autopilot media', body: 'Videos uploaded by Voice to Short autopilot so Buffer can fetch them. Safe to delete after they are posted.', prerelease: true, make_latest: 'false' }) });
        if (rel.status === 404) {
          let created = await mk();
          if (created.status === 422 || created.status === 409) {
            const again = await getRel(); // release made by a racing run?
            if (again.status < 300) created = again;
            else {
              // An empty repo (no commits) cannot have releases. Add a first commit (README) via the contents API, then retry.
              const readme = 'This repo holds videos uploaded by Voice to Short Autopilot so Buffer can fetch them.\nKeep it public. Old files in the "vts-autopilot-media" release can be deleted after they are posted.\n';
              const b64 = typeof btoa === 'function' ? btoa(readme) : Buffer.from(readme).toString('base64');
              const put = await http({ url: 'https://api.github.com/repos/' + o.repo + '/contents/README.md', method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: JSON.stringify({ message: 'Initial commit (Voice to Short autopilot media)', content: b64 }) });
              if (put.status === 401 || put.status === 403 || put.status === 404) throw Object.assign(new Error('The GitHub repo ' + o.repo + ' looks empty and the token cannot add a first file. Give the token Contents: Read and write on this repo, or add any file (e.g. a README) on github.com, then try again.'), { status: put.status, fatal: true });
              if (put.status >= 300 && put.status !== 422) throw Object.assign(new Error('The GitHub repo ' + o.repo + ' looks empty and adding a README failed (HTTP ' + put.status + ').'), { status: put.status });
              created = await mk();
              if (created.status === 422) created = await getRel();
              if (created.status === 422 && !o.tag && !o.noFallback) return HOSTS.github.upload(http, uploadFile, Object.assign({}, o, { tag: dayTag(o.now || Date.now()), noFallback: true }));
              if (created.status >= 300) throw Object.assign(new Error('GitHub would not create the media release in ' + o.repo + ' (HTTP ' + created.status + '), even after trying to add a README to the empty repo. Check the repo exists, is public, and the token has Contents: Read and write.'), { status: created.status, fatal: true });
            }
          }
          rel = created;
        }
        if (rel.status === 401 || rel.status === 403) throw Object.assign(new Error('GitHub rejected the token (it needs Contents: read and write on ' + o.repo + ').'), { status: rel.status, fatal: true });
        if (rel.status >= 300) {
          if (rel.status === 422 && !o.tag && !o.noFallback) return HOSTS.github.upload(http, uploadFile, Object.assign({}, o, { tag: dayTag(o.now || Date.now()), noFallback: true }));
          throw Object.assign(new Error('GitHub release ' + tag + ': HTTP ' + rel.status), { status: rel.status });
        }
        const r = await rel.json();
        const send = (nm) => uploadFile({ url: 'https://uploads.github.com/repos/' + o.repo + '/releases/' + r.id + '/assets?name=' + encodeURIComponent(nm), method: 'POST', headers: Object.assign({ 'Content-Type': o.mime || 'video/mp4' }, H), blob: o.blob, path: o.path, size: o.size });
        let up = await send(o.name);
        // 422 = name already used (or release full / invalid). Try once more with a unique suffix in the same release.
        if (up.status === 422) { const nm2 = o.name.replace(/(\.\w+)$/, '-' + Math.random().toString(36).slice(2, 8) + '$1'); up = await send(nm2); }
        if (up.status === 422) {
          // This release will not take more assets: switch to a dated release (vts-autopilot-media-YYYYMMDD) instead of failing the job.
          if (!o.tag && !o.noFallback) return HOSTS.github.upload(http, uploadFile, Object.assign({}, o, { tag: dayTag(o.now || Date.now()), noFallback: true }));
          throw Object.assign(new Error('GitHub upload: HTTP 422 on release ' + tag + ' (asset rejected even with a unique name).'), { status: 422 });
        }
        if (up.status >= 300) throw Object.assign(new Error('GitHub upload: HTTP ' + up.status), { status: up.status });
        const a = await up.json(); return a.browser_download_url;
      },
    },
  };
  const videoUrl = (id) => 'https://youtube.com/shorts/' + id;

  return { freezeClock, stagePatch, diagText, fmtMs, LIMITS, lastBeat, isStale, recoverStale, withTimeout, TimeoutError, shortDurationProblem, dayTag, IST_OFFSET_MIN, DEFAULTS, DEFAULT_TIMES, QUOTA, SCOPES, AUTH_URL, TOKEN_URL, UPLOAD_URL, CHANNEL_URL,
    parseTime, normTimes, normSettings, istDay, istSlotMs, slotsForDay, nextSlot, dueSlots,
    ptDay, quotaUsed, quotaLeft, nextPtMidnight, quotaExceeded, isRetriable, backoffMs, withRetry,
    ideaKey, pickIdea, buildMetadata, b64url, pkcePair, randomState, validClientId, buildAuthUrl, form, tokenRequest, refreshRequest,
    BUFFER_URL, BUFFER_FREE_QUEUE, bufferRequest, bufferCall, bufferChannels, bufferQueueCount, bufferPostInput, bufferCreatePost, bufferCanQueue, HOSTS,
    apiError, exchangeCode, refreshAccess, channelInfo, uploadInitRequest, chunkRequest, statusRequest, uploadVideo, videoUrl };
}));
