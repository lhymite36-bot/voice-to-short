/* Autopilot runtime: makes and posts Shorts on a schedule with no outside help.
   Method "buffer" (default): render -> upload the mp4 to a public host (GitHub release) -> Buffer post scheduled at the slot.
   Method "youtube": render -> YouTube Data API resumable upload (needs the user's own Google OAuth client).
   Android: AlarmManager opens the app at each slot (Autopilot native plugin). Desktop: tray + timer + wake catch-up. */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {});
  const C = VTS.apcore; if (!C) return;
  const cap = window.Capacitor;
  const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const NP = isNative ? ((cap.Plugins && cap.Plugins.Autopilot) || (cap.registerPlugin && cap.registerPlugin('Autopilot'))) : null;
  const D = window.vtsDesktop || null;
  const PLATFORM = NP ? 'android' : D ? 'desktop' : 'web';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const LS = { settings: 'vts.ap.settings', log: 'vts.ap.log', used: 'vts.ap.used', clientId: 'vts.ap.clientId', channel: 'vts.ap.channel', buffer: 'vts.ap.bufferChannel', ghRepo: 'vts.ap.ghRepo', host: 'vts.ap.host' };
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* full */ } };
  const settings = () => C.normSettings(load(LS.settings, {}));

  // ---------- secure storage (Android Keystore / Windows DPAPI; web: localStorage, with a warning) ----------
  const secure = {
    async get(k) { if (NP) return (await NP.secureGet({ key: k })).value || null; if (D) return D.secureGet(k); return localStorage.getItem('vts.ap.sec.' + k); },
    async set(k, v) { if (NP) return NP.secureSet({ key: k, value: v }); if (D) return D.secureSet(k, v); localStorage.setItem('vts.ap.sec.' + k, v); },
    async del(k) { if (NP) return NP.secureDel({ key: k }); if (D) return D.secureDel(k); localStorage.removeItem('vts.ap.sec.' + k); },
    kind: () => (NP ? 'Android Keystore (encrypted)' : D ? 'Windows encrypted storage' : 'browser storage (not encrypted)'),
  };

  // ---------- HTTP ----------
  const wrap = (r) => ({ status: r.status, ok: r.status >= 200 && r.status < 300, headers: { get: () => null }, json: async () => JSON.parse(r.body || 'null') });
  // JSON calls to Buffer / GitHub (no CORS there): native on Android + desktop.
  async function nhttp(req) {
    if (NP) return wrap(await NP.http({ url: req.url, method: req.method, headers: req.headers, body: req.body }));
    if (D) return wrap(await D.http({ url: req.url, method: req.method, headers: req.headers, body: req.body }));
    return fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
  }
  async function nupload(req) {
    if (NP) {
      const name = 'ap-upload-' + Date.now() + '.mp4';
      const uri = await VTS.native.writeBlob(name, 'CACHE', req.blob);
      return wrap(await NP.uploadFile({ url: req.url, method: req.method, headers: req.headers, path: uri, deleteAfter: true }));
    }
    if (D) return wrap(await D.http({ url: req.url, method: req.method, headers: req.headers, bytes: new Uint8Array(await req.blob.arrayBuffer()) }));
    return fetch(req.url, { method: req.method, headers: req.headers, body: req.blob });
  }
  const notify = async (title, body) => {
    try { if (NP) return await NP.notify({ title, body }); if (D) return await D.notify(title, body); if (window.Notification && Notification.permission === 'granted') new Notification(title, { body }); } catch (_) { /* ignore */ }
  };

  // ---------- post log ----------
  const getLog = () => load(LS.log, []);
  function putLog(entry) { if (entry.status === 'running' || (current && entry.slot === current)) entry.beat = new Date().toISOString(); const log = getLog(); const i = log.findIndex((e) => e.slot === entry.slot); if (i >= 0) log[i] = Object.assign(log[i], entry); else log.unshift(entry); save(LS.log, log.slice(0, 300)); paint(); return entry; }

  // ---------- YouTube OAuth ----------
  async function connectYouTube() {
    const clientId = String(load(LS.clientId, '') || '').trim(); const secret = await secure.get('clientSecret');
    if (!C.validClientId(clientId)) throw new Error('Paste your OAuth client ID first (it ends in .apps.googleusercontent.com).');
    if (!D && !NP) throw new Error('Connect YouTube from the Android or Windows app.');
    const bridge = NP || D;
    const { redirectUri } = await bridge.oauthStart();
    const pk = await C.pkcePair(); const state = C.randomState();
    const url = C.buildAuthUrl({ clientId, redirectUri, state, challenge: pk.challenge });
    if (NP) await NP.openExternal({ url }); else await D.openExternal(url);
    const r = await bridge.oauthWait();
    if (!r || r.error || !r.code) throw new Error('Google sign-in did not finish' + (r && r.error ? ' (' + r.error + ')' : '') + '.');
    if (r.state !== state) throw new Error('Sign-in state mismatch; try again.');
    const tok = await C.exchangeCode(fetch.bind(window), { code: r.code, clientId, clientSecret: secret || '', redirectUri, verifier: pk.verifier });
    if (!tok.refresh_token) throw new Error('Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and connect again.');
    await secure.set('refreshToken', tok.refresh_token);
    const ch = await C.channelInfo(fetch.bind(window), tok.access_token).catch(() => null);
    save(LS.channel, ch); return ch;
  }
  let access = null;
  async function accessToken() {
    if (access && access.expiresAt > Date.now()) return access.accessToken;
    const rt = await secure.get('refreshToken'); if (!rt) throw Object.assign(new Error('YouTube is not connected.'), { fatal: true });
    try { access = await C.refreshAccess(fetch.bind(window), { clientId: load(LS.clientId, ''), clientSecret: (await secure.get('clientSecret')) || '', refreshToken: rt }); }
    catch (e) { if (e.reconnect) { e.fatal = true; e.message = 'YouTube access expired or was revoked — tap Connect YouTube again. (Google expires Testing-mode tokens after 7 days.)'; } throw e; }
    return access.accessToken;
  }

  // ---------- one run ----------
  let running = false; let current = '';
  function pickIdea() { const ideas = (VTS.ideas && VTS.ideas.IDEAS) || []; const used = load(LS.used, []); const it = C.pickIdea(ideas, used); if (it) save(LS.used, used.filter((k) => k !== C.ideaKey(it)).concat([C.ideaKey(it)]).slice(-1000)); return it; }
  const stamp = (slot) => slot.id.replace(/[^0-9T]/g, '').replace('T', '-');

  // Abort controller of the run in progress, so a watchdog (or a timeout) can stop a hung render.
  let ctl = null; let runStartedAt = 0;
  async function runSlot(slot, why) {
    const s = settings(); const prev = getLog().find((e) => e.slot === slot.id) || {};
    const attempt = (prev.attempts || 0) + 1;
    const L = C.LIMITS;
    running = true; current = slot.id; runStartedAt = Date.now(); ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const entry = putLog({ slot: slot.id, time: new Date().toISOString(), method: s.method, status: 'running', attempts: attempt, title: prev.title || '', why });
    const abort = () => { try { if (ctl) ctl.abort(); } catch (_) { /* ignore */ } };
    try { if (NP) await NP.runStart({ text: 'Making the ' + slot.time + ' IST Short…' }); if (D) D.runState(true); } catch (_) { /* ignore */ }
    try {
      // Buffer: check the queue before spending Gemini quota on a render.
      let bufKey = null; let bch = null;
      if (s.method === 'buffer') {
        bufKey = await secure.get('bufferKey'); bch = load(LS.buffer, null);
        if (!bufKey || !bch) throw Object.assign(new Error('Buffer is not set up (API key + channel in Settings).'), { fatal: true });
        const n = await C.withTimeout(C.bufferQueueCount(nhttp, bufKey, bch.organizationId, bch.id), L.bufferMs, 'Buffer queue check');
        if (!C.bufferCanQueue(n, s.bufferLimit)) {
          const late = Date.now() - slot.at > s.catchUpHours * 3600000;
          putLog({ slot: slot.id, status: late ? 'skipped' : 'deferred', error: 'Buffer queue is full (' + n + ' scheduled; free plan allows 10). Will try again in 30 min.', nextRetryAt: new Date(Date.now() + 30 * 60000).toISOString() });
          if (late) notify('Autopilot skipped a Short', 'Buffer queue stayed full for the ' + slot.time + ' IST slot.');
          return;
        }
        // Video already on GitHub from an earlier try (Buffer step failed): only retry Buffer, never re-render.
        if (prev.videoUrl && prev.pkg) {
          putLog({ slot: slot.id, step: 'buffer (re-using uploaded video)' });
          const dueAt = Math.max(slot.at, Date.now() + 10 * 60000);
          const post = await C.withTimeout(C.withRetry(() => C.bufferCreatePost(nhttp, bufKey, C.bufferPostInput({ channelId: bch.id, pkg: prev.pkg, videoUrl: prev.videoUrl, dueAt, handle: (localStorage.getItem('vts.handle') || '').replace(/"/g, '') })), { tries: 3 }), L.bufferMs * 3, 'Buffer scheduling');
          putLog({ slot: slot.id, status: 'scheduled', step: '', error: '', bufferPostId: post.id, dueAt: new Date(dueAt).toISOString(), nextRetryAt: null });
          notify('Short scheduled in Buffer', '“' + (prev.title || '') + '” goes out at ' + slot.time + ' IST.');
          return;
        }
      } else {
        const q = C.quotaLeft(Date.now(), getLog()); if (q.uploads < 1) { putLog({ slot: slot.id, status: 'deferred', error: 'YouTube daily upload quota used up; waiting for the reset.', nextRetryAt: new Date(q.resetsAt + 60000).toISOString() }); return; }
        await accessToken();
      }
      const it = prev.idea ? prev.idea : pickIdea(); if (!it) throw Object.assign(new Error('Idea bank is empty.'), { fatal: true });
      putLog({ slot: slot.id, idea: it, title: it.text.slice(0, 80), step: 'script' });
      // Script + voice + render must finish in renderMs + scriptMs, or the run is aborted and marked failed/retrying (no more endless "running (render)").
      const made = await C.withTimeout(C.withRetry(() => VTS.makeShortHeadless(it, { signal: ctl ? ctl.signal : undefined, onStep: (st) => putLog({ slot: slot.id, step: st }), onProgress: (p) => { if (Date.now() - (lastBeatAt || 0) > 15000) { lastBeatAt = Date.now(); putLog({ slot: slot.id, step: 'render ' + Math.round(p * 100) + '%' }); } } }), { tries: 3, onWait: (ms) => putLog({ slot: slot.id, step: 'waiting ' + Math.round(ms / 1000) + ' s (Gemini busy)' }) }), L.renderMs + L.scriptMs, 'Making the Short (script/voice/render)', abort);
      const durProblem = C.shortDurationProblem(made.duration, L.maxShortSec);
      if (durProblem) throw Object.assign(new Error('Not uploaded: ' + durProblem + ' (Buffer rejects YouTube Shorts over 3 min). Renderer: ' + (made.how || '?') + '.'), { fatal: true });
      const title = C.buildMetadata(made.pkg).snippet.title; putLog({ slot: slot.id, title, step: 'upload', duration: Math.round(made.duration * 10) / 10, renderer: made.how });
      if (s.method === 'buffer') {
        const host = C.HOSTS[load(LS.host, 'github')] || C.HOSTS.github;
        const ext = /webm/.test(made.mime) ? 'webm' : 'mp4'; const name = 'short-' + stamp(slot) + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6) + '.' + ext;
        const ghToken = await secure.get('githubToken'); if (!ghToken) throw Object.assign(new Error('Add a GitHub token for the video host (Settings).'), { fatal: true });
        const videoUrl = await C.withTimeout(C.withRetry(() => host.upload(nhttp, nupload, { token: ghToken, repo: load(LS.ghRepo, ''), name, blob: made.blob, size: made.blob.size, mime: made.mime }), { tries: 3 }), L.uploadMs, 'GitHub video upload');
        // Remember the upload (and the package) right away so a Buffer failure retries only Buffer.
        putLog({ slot: slot.id, videoUrl, pkg: made.pkg, step: 'buffer' });
        const dueAt = Math.max(slot.at, Date.now() + 10 * 60000);
        const post = await C.withTimeout(C.withRetry(() => C.bufferCreatePost(nhttp, bufKey, C.bufferPostInput({ channelId: bch.id, pkg: made.pkg, videoUrl, dueAt, handle: (localStorage.getItem('vts.handle') || '').replace(/"/g, '') })), { tries: 3 }), L.bufferMs * 3, 'Buffer scheduling');
        putLog({ slot: slot.id, status: 'scheduled', step: '', error: '', videoUrl, bufferPostId: post.id, dueAt: new Date(dueAt).toISOString(), nextRetryAt: null });
        notify('Short scheduled in Buffer', '“' + title + '” goes out at ' + slot.time + ' IST.');
      } else {
        const tokenNow = await accessToken();
        putLog({ slot: slot.id, uploadAttempted: true, uploadAttempts: (prev.uploadAttempts || 0) + 1 });
        const v = await C.withTimeout(C.uploadVideo(fetch.bind(window), { accessToken: tokenNow, blob: made.blob, mime: made.mime, metadata: C.buildMetadata(made.pkg, { handle: (localStorage.getItem('vts.handle') || '').replace(/"/g, '') }), onProgress: (p) => putLog({ slot: slot.id, step: 'upload ' + Math.round(p * 100) + '%' }) }), L.uploadMs, 'YouTube upload');
        const priv = v.status && v.status.privacyStatus;
        putLog({ slot: slot.id, status: 'posted', step: '', error: priv && priv !== 'public' ? 'YouTube set this video to ' + priv + ' (unverified app — see the audit guide).' : '', videoUrl: C.videoUrl(v.id), videoId: v.id, nextRetryAt: null });
        notify('Short posted to YouTube', '“' + title + '”' + (priv && priv !== 'public' ? ' (locked ' + priv + ' by YouTube)' : ''));
      }
    } catch (e) {
      const cur = getLog().find((x) => x.slot === slot.id) || {};
      // A timeout counts as one retriable try; uploaded-but-not-scheduled videos always get Buffer retries (cheap, no re-render).
      const retriable = !e.fatal && (C.isRetriable(e) || e.queueFull || e.timeout || !!cur.videoUrl) && attempt < (cur.videoUrl ? 5 : 3);
      const where = cur.step ? ' [at ' + cur.step + ']' : '';
      const msg = ((e.timeout ? e.message : '') || (VTS.gemini && VTS.gemini.friendlyError ? VTS.gemini.friendlyError(e) : '') || e.message || String(e)) + where;
      putLog({ slot: slot.id, status: retriable ? 'retrying' : 'failed', step: '', error: msg, nextRetryAt: retriable ? new Date(Date.now() + C.backoffMs(attempt + 1)).toISOString() : null });
      if (!retriable) notify('Autopilot could not post a Short', msg.slice(0, 180));
    } finally {
      running = false; current = ''; ctl = null; runStartedAt = 0;
      try { if (D) D.runState(false); } catch (_) { /* ignore */ }
      void entry;
    }
  }
  let lastBeatAt = 0;
  // Turn stale "running" rows (app was killed mid-render, or a hung run) into retrying/failed; and unstick this process if its own run hung.
  function recover() {
    if (running && runStartedAt && Date.now() - runStartedAt > C.LIMITS.slotMs) {
      const slotId = current; try { if (ctl) ctl.abort(); } catch (_) { /* ignore */ }
      putLog({ slot: slotId, status: 'failed', step: '', error: 'Watchdog: this run was still going after ' + Math.round(C.LIMITS.slotMs / 60000) + ' min and was stopped.', nextRetryAt: null });
      running = false; current = ''; ctl = null; runStartedAt = 0;
    }
    C.recoverStale(Date.now(), getLog(), settings(), running ? current : null).forEach((p) => putLog(p));
  }

  // ---------- scheduler ----------
  async function check(why) {
    try { recover(); } catch (_) { /* ignore */ }
    if (running) return;
    const s = settings(); if (!s.enabled) { await endRun(); return; }
    const due = C.dueSlots(Date.now(), s, getLog());
    if (due.length) await runSlot(due[0], why || 'timer');
    await endRun();
  }
  async function endRun() {
    try {
      if (NP) {
        await NP.runEnd();
        const w = getLog().map((e) => e.nextRetryAt && (e.status === 'retrying' || e.status === 'deferred') ? Date.parse(e.nextRetryAt) : 0).filter((t) => t > Date.now()).sort((a, b) => a - b)[0];
        if (w && settings().enabled) await NP.wakeAt({ at: w + 30000 });
      }
    } catch (_) { /* ignore */ }
    try { if (NP) { const r = await NP.status(); armed = r; } } catch (_) { /* ignore */ }
    paint();
  }
  let armed = null;
  async function arm() {
    const s = settings();
    try {
      if (NP) armed = await NP.schedule({ enabled: s.enabled, times: s.times.join(','), perDay: s.perDay });
      if (D) await D.autopilotState(s.enabled, s.startWithWindows);
    } catch (_) { /* ignore */ }
    paint();
  }

  // ---------- UI ----------
  const GUIDE_BUFFER = '<ol class="small"><li>Open <a href="https://publish.buffer.com/settings/api" target="_blank" rel="noopener">Buffer → Settings → API</a> and create a personal API key. Paste it below.</li><li>Tap <b>Load channels</b> and pick your YouTube channel (it must already be connected in Buffer).</li><li>Buffer needs a public link to each video. Create a <b>public</b> GitHub repo (e.g. <code>qb-media</code>), then a <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">fine-grained token</a> with access to only that repo and <b>Contents: Read and write</b>. Paste the repo (owner/name) and token below.</li><li>Turn Autopilot on. Each Short is made about 40 min before its time and scheduled in Buffer for the exact time.</li></ol><p class="small muted">Buffer mode needs <b>no Google review</b>: Buffer is already approved by YouTube, so Shorts go out public. Free Buffer plan: max 10 queued posts per channel — extra Shorts wait and retry.</p>';
  const GUIDE_YT = '<ol class="small"><li>Go to <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Google Cloud Console</a> and create a project (free, no card needed).</li><li>APIs &amp; Services → Library → enable <b>YouTube Data API v3</b>.</li><li>APIs &amp; Services → OAuth consent screen: User type <b>External</b>, app name “Voice to Short”, your Gmail as support + developer email. Leave it in <b>Testing</b> and add your own Gmail (the one that owns the channel) under <b>Test users</b>. Scopes: youtube.upload and youtube.readonly.</li><li>APIs &amp; Services → Credentials → Create credentials → OAuth client ID → Application type <b>Desktop app</b>. Copy the <b>Client ID</b> and <b>Client secret</b> into the boxes below (they stay on this device). The same client works on the phone and the PC.</li><li>Tap <b>Connect YouTube</b>, pick the Quiet Brain account, allow access.</li></ol><p class="small warn-text">⚠️ Google locks uploads from unverified apps to <b>private</b> until the app passes Google’s YouTube API audit. Also, in Testing mode Google expires the sign-in after 7 days, so you would reconnect weekly. See docs/youtube-audit.md for the audit form text. Buffer mode avoids both.</p>';
  function card() {
    const host = $('view-settings'); if (!host || $('ap-card')) return;
    const el = document.createElement('div'); el.className = 'card'; el.id = 'ap-card';
    el.innerHTML = '<div class="card-head"><h2>Autopilot: post Shorts by itself</h2></div>' +
      '<p class="small muted">Writes, voices, renders and posts Shorts on a schedule — no Grok Bot needed. ' + (PLATFORM === 'android' ? 'The phone opens the app at each time (keep it charged; allow the battery exemption).' : PLATFORM === 'desktop' ? 'Runs from the tray while the PC is on, and catches up after sleep.' : 'Use the Android or Windows app for Autopilot.') + '</p>' +
      '<label class="switch"><input type="checkbox" id="ap-on"><span>Autopilot on</span></label>' +
      '<label class="field"><span>Post with</span><select id="ap-method"><option value="buffer">Buffer (recommended, no Google review)</option><option value="youtube">Direct to YouTube (needs your Google OAuth client)</option></select></label>' +
      '<label class="field"><span>Shorts per day</span><select id="ap-per">' + [1, 2, 3, 4, 5, 6].map((n) => '<option>' + n + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>Post times (IST, 24 h, comma-separated)</span><input id="ap-times" type="text" spellcheck="false"></label>' +
      '<p class="small muted">Ideas come from the idea bank (no repeats until all ' + ((VTS.ideas && VTS.ideas.COUNT) || '') + ' are used). Style: default Kurzgesagt look, 2D, 9:16.</p>' +
      (PLATFORM === 'desktop' ? '<label class="switch"><input type="checkbox" id="ap-boot"><span>Start with Windows (in the tray)</span></label>' : '') +
      (PLATFORM === 'android' ? '<button type="button" class="btn" id="ap-battery">Allow background running (battery, alarms, notifications)</button>' : '') +
      '<div id="ap-buffer"><h3>Buffer</h3><details><summary>How to set up Buffer (5 min)</summary>' + GUIDE_BUFFER + '</details>' +
      '<label class="field"><span>Buffer API key</span><input id="ap-bkey" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your Buffer API key"></label>' +
      '<div class="actions wrap"><button type="button" class="btn" id="ap-bload">Load channels</button></div><select id="ap-bch"></select>' +
      '<label class="field"><span>Video host</span><select id="ap-host"><option value="github">GitHub release (public repo)</option></select></label>' +
      '<label class="field"><span>GitHub repo (owner/name, public)</span><input id="ap-repo" type="text" spellcheck="false" placeholder="yourname/qb-media"></label>' +
      '<label class="field"><span>GitHub token</span><input id="ap-gtok" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…"></label></div>' +
      '<div id="ap-yt"><h3>Direct YouTube</h3><details><summary>How to create your free Google OAuth client</summary>' + GUIDE_YT + '</details>' +
      '<label class="field"><span>OAuth client ID</span><input id="ap-cid" type="text" spellcheck="false" placeholder="1234-abc.apps.googleusercontent.com"></label>' +
      '<label class="field"><span>OAuth client secret</span><input id="ap-csec" type="password" autocomplete="off" spellcheck="false" placeholder="GOCSPX-…"></label>' +
      '<div class="actions wrap"><button type="button" class="btn primary" id="ap-connect">Connect YouTube</button><button type="button" class="btn ghost" id="ap-disconnect">Disconnect</button></div><p class="hint" id="ap-ytstate"></p></div>' +
      '<div class="actions wrap"><button type="button" class="btn primary" id="ap-save">Save autopilot settings</button><button type="button" class="btn" id="ap-now">Post one now (test)</button></div>' +
      '<p class="hint" id="ap-state"></p><h3>Post log</h3><div id="ap-log" class="small"></div>' +
      '<p class="small muted">Keys and tokens are stored only on this device (' + secure.kind() + ').</p>';
    host.insertBefore(el, host.children[2] || null);
    const s = settings();
    $('ap-on').checked = s.enabled; $('ap-method').value = s.method; $('ap-per').value = String(s.perDay); $('ap-times').value = s.times.join(', ');
    if ($('ap-boot')) $('ap-boot').checked = !!s.startWithWindows;
    $('ap-cid').value = load(LS.clientId, ''); $('ap-repo').value = load(LS.ghRepo, ''); $('ap-host').value = load(LS.host, 'github');
    const bc = load(LS.buffer, null); if (bc) $('ap-bch').innerHTML = '<option value="' + esc(bc.id) + '">' + esc(bc.name + ' (' + bc.service + ')') + '</option>';
    $('ap-method').addEventListener('change', paint);
    $('ap-save').addEventListener('click', saveAll);
    $('ap-bload').addEventListener('click', loadChannels);
    $('ap-connect').addEventListener('click', async () => { await saveAll(true); state('Opening Google sign-in…'); try { const ch = await connectYouTube(); state('YouTube connected' + (ch ? ': ' + ch.title : '') + '.'); } catch (e) { state(e.message, true); } paint(); });
    $('ap-disconnect').addEventListener('click', async () => { await secure.del('refreshToken'); save(LS.channel, null); access = null; paint(); });
    $('ap-now').addEventListener('click', async () => { await saveAll(true); if (running) return; const now = Date.now(); const slot = { id: 'manual-' + new Date(now).toISOString().slice(0, 16), time: new Date(now + 600000 + 330 * 60000).toISOString().slice(11, 16), at: now + 10 * 60000, runAt: now }; state('Making a test Short now…'); await runSlot(slot, 'manual'); await endRun(); });
    if ($('ap-battery')) $('ap-battery').addEventListener('click', () => NP.requestBatteryExemption().then(() => setTimeout(endRun, 3000)));
    paint();
  }
  function state(t, err) { const el = $('ap-state'); if (el) { el.textContent = t || ''; el.style.color = err ? 'var(--err, #ff6b6b)' : ''; } }
  async function saveAll(quiet) {
    const s = settings();
    s.enabled = $('ap-on').checked; s.method = $('ap-method').value; s.perDay = +$('ap-per').value; s.times = C.normTimes($('ap-times').value.split(/[,\s]+/));
    s.leadMin = s.method === 'buffer' ? 40 : 0; if ($('ap-boot')) s.startWithWindows = $('ap-boot').checked;
    save(LS.settings, C.normSettings(s));
    save(LS.clientId, $('ap-cid').value.trim()); save(LS.ghRepo, $('ap-repo').value.trim()); save(LS.host, $('ap-host').value);
    const sel = $('ap-bch'); const opt = sel.options[sel.selectedIndex]; if (opt && opt.dataset.ch) save(LS.buffer, JSON.parse(opt.dataset.ch));
    for (const [id, k] of [['ap-bkey', 'bufferKey'], ['ap-gtok', 'githubToken'], ['ap-csec', 'clientSecret']]) { const v = $(id).value.trim(); if (v) { await secure.set(k, v); $(id).value = ''; $(id).placeholder = 'Saved on this device ✓ (paste to replace)'; } }
    await arm(); if (!quiet) state('Saved.'); paint();
    if (s.enabled) setTimeout(() => check('save'), 1000);
  }
  async function loadChannels() {
    const k = $('ap-bkey').value.trim(); if (k) await secure.set('bufferKey', k);
    const key = k || await secure.get('bufferKey'); if (!key) { state('Paste your Buffer API key first.', true); return; }
    state('Loading Buffer channels…');
    try {
      const list = await C.bufferChannels(nhttp, key); const sel = $('ap-bch'); sel.innerHTML = '';
      list.forEach((ch) => { const o = new Option((ch.service === 'youtube' ? '▶ ' : '') + (ch.displayName || ch.name) + ' (' + ch.service + ')', ch.id); o.dataset.ch = JSON.stringify({ id: ch.id, name: ch.displayName || ch.name, service: ch.service, organizationId: ch.organizationId }); sel.add(o); });
      const yt = list.find((c) => c.service === 'youtube' && /quiet/i.test(c.displayName || c.name)) || list.find((c) => c.service === 'youtube'); if (yt) sel.value = yt.id;
      state(list.length ? 'Pick your YouTube channel, then Save.' : 'No channels in this Buffer account.');
    } catch (e) { state(e.message, true); }
  }
  async function paint() {
    if (!$('ap-card')) return;
    const s = settings(); const m = $('ap-method').value || s.method;
    $('ap-buffer').classList.toggle('hidden', m !== 'buffer'); $('ap-yt').classList.toggle('hidden', m !== 'youtube');
    const rt = m === 'youtube' ? await secure.get('refreshToken').catch(() => null) : null; const ch = load(LS.channel, null);
    if ($('ap-ytstate')) $('ap-ytstate').textContent = rt ? 'Connected' + (ch ? ' to ' + ch.title : '') + '.' : 'Not connected.';
    const log = getLog(); const nx = C.nextSlot(Date.now(), s);
    let st = s.enabled ? 'On · next: ' + (nx ? nx.day + ' ' + nx.time + ' IST' : '—') : 'Off';
    if (m === 'youtube') { const q = C.quotaLeft(Date.now(), log); st += ' · YouTube uploads left today: ' + q.uploads + ' of 6'; }
    if (armed && PLATFORM === 'android') { if (armed.batteryExempt === false) st += ' · ⚠️ battery optimisation is on'; if (armed.exact === false) st += ' · ⚠️ exact alarms not allowed'; if (armed.notifications === false) st += ' · notifications off'; }
    if (running) st += ' · working on ' + current + '…';
    if (!$('ap-state').textContent || /^On|^Off/.test($('ap-state').textContent)) state(st);
    const badge = { posted: '✅', scheduled: '🗓️', running: '⏳', retrying: '🔁', deferred: '⏸️', failed: '❌', skipped: '⏭️' };
    $('ap-log').innerHTML = log.length ? log.slice(0, 25).map((e) => '<div class="ap-row">' + (badge[e.status] || '•') + ' <b>' + esc(e.slot) + '</b> ' + esc(e.status) + (e.step ? ' (' + esc(e.step) + ')' : '') + ' — ' + esc(e.title || '') +
      (e.videoUrl ? ' · <a href="' + esc(e.videoUrl) + '" target="_blank" rel="noopener">video</a>' : '') + (e.error ? '<br><span class="muted">' + esc(e.error) + '</span>' : '') + '</div>').join('') : '<p class="muted">Nothing posted yet.</p>';
  }

  // ---------- boot ----------
  function boot() {
    card(); arm();
    if (D && D.onCheck) D.onCheck((why) => check(why));
    if (NP) { NP.addListener('autopilotFire', () => check('alarm')); document.addEventListener('resume', () => check('resume')); }
    setTimeout(() => check('start'), 4000);
    if (PLATFORM !== 'web') setInterval(() => check('timer'), 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
  VTS.autopilot = { check, runSlot, recover, settings, getLog, connectYouTube, PLATFORM };
}());
