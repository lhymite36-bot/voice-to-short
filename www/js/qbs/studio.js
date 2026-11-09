/* Quiet Brain Studio UI: recent Shorts stats + comment-sourced topics for Autopilot. */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {});
  const StoreApi = VTS.qbsStore;
  const A = VTS.qbsAnalytics;
  const Cm = VTS.qbsComments;
  const Sync = VTS.qbsSync;
  if (!StoreApi || !A || !Cm || !Sync) return;

  const store = StoreApi.createStore();
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pct = (n) => (n == null || n !== n) ? '—' : (Math.round(n * 10) / 10) + '%';
  const num = (n) => (n == null ? '—' : String(n));

  function status(msg, err) {
    const el = $('qbs-status');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = err ? 'var(--err, #ff6b6b)' : '';
  }

  function paint() {
    const meta = store.getMeta();
    const shorts = store.listShorts();
    const topics = store.listTopics('queued');
    const host = $('qbs-shorts');
    const th = $('qbs-topics');
    const metaEl = $('qbs-meta');
    if (metaEl) {
      metaEl.textContent = (meta.channelTitle ? meta.channelTitle + ' · ' : '') +
        (meta.lastSyncAt ? 'Last sync ' + new Date(meta.lastSyncAt).toLocaleString() : 'Not synced yet') +
        ' · ' + topics.length + ' topic' + (topics.length === 1 ? '' : 's') + ' queued for Autopilot';
    }
    if (host) {
      if (!shorts.length) host.innerHTML = '<p class="muted small">No Shorts loaded yet. Connect YouTube (with analytics scopes) and tap Refresh.</p>';
      else host.innerHTML = shorts.slice(0, 20).map((s) =>
        '<div class="qbs-row">' +
          '<div class="qbs-title"><a href="https://youtube.com/shorts/' + esc(s.ytId) + '" target="_blank" rel="noopener">' + esc(s.title || s.ytId) + '</a></div>' +
          '<div class="qbs-metrics small">' +
            '<span>' + num(s.views) + ' views</span>' +
            '<span>' + num(s.likes) + ' likes</span>' +
            '<span>' + num(s.comments) + ' comments</span>' +
            '<span>avg ' + pct(s.avgViewPercentage) + '</span>' +
            '<span>early hold ' + (s.earlyHold == null ? '—' : Math.round(s.earlyHold * 100) + '%') + '</span>' +
          '</div>' +
        '</div>'
      ).join('');
    }
    if (th) {
      if (!topics.length) th.innerHTML = '<p class="muted small">No question topics yet. Refresh after viewers leave comments, or they will appear here for Autopilot.</p>';
      else th.innerHTML = topics.slice(0, 30).map((t) =>
        '<div class="qbs-topic" data-id="' + esc(t.id) + '">' +
          '<div>' + esc(t.text) + '</div>' +
          '<div class="small muted">' + esc(t.format || 'classic') + (t.score ? ' · score ' + t.score : '') +
            ' · <button type="button" class="link-btn qbs-dismiss" data-id="' + esc(t.id) + '">Dismiss</button></div>' +
        '</div>'
      ).join('');
      th.querySelectorAll('.qbs-dismiss').forEach((btn) => btn.addEventListener('click', () => {
        store.dismissTopic(btn.getAttribute('data-id'));
        paint();
      }));
    }
  }

  async function refresh() {
    const ap = VTS.autopilot;
    if (!ap || !ap.getAccessToken) {
      status('Open Settings → Autopilot → Direct YouTube, connect once (Studio reuses that sign-in), then try again.', true);
      return;
    }
    status('Signing in…');
    let token;
    try { token = await ap.getAccessToken(); }
    catch (e) {
      status((e && e.message) || 'Connect YouTube in Autopilot settings first (Direct YouTube).', true);
      return;
    }
    status('Syncing…');
    try {
      const result = await Sync.syncStudio({
        fetchFn: fetch.bind(window),
        accessToken: token,
        store,
        analytics: A,
        comments: Cm,
        hold: { earlyHoldFromRetention: StoreApi.earlyHoldFromRetention, endHoldFromRetention: StoreApi.endHoldFromRetention },
        onProgress: (m) => status(m),
      }, { maxVideos: 12, maxRetention: 5, maxCommentVideos: 5 });
      paint();
      status('Synced ' + result.videos + ' Shorts · ' + result.comments + ' comments · ' + result.topics + ' new topics.');
    } catch (e) {
      paint();
      status((e && e.message) || String(e), true);
    }
  }

  function mount() {
    if ($('qbs-card') || !$('view-studio')) return;
    const el = document.createElement('div');
    el.id = 'qbs-card';
    el.className = 'card';
    el.innerHTML =
      '<div class="card-head"><h2>Quiet Brain Studio</h2><span class="badge">M2</span></div>' +
      '<p class="small muted">Reads your Shorts’ retention, average % viewed, views, likes and comments. Turns viewer questions into a topic queue Autopilot can use. Needs a one-time YouTube re-sign-in with analytics + comments scopes (same OAuth client as Direct YouTube).</p>' +
      '<p class="small muted" id="qbs-meta"></p>' +
      '<div class="actions wrap">' +
        '<button type="button" class="btn primary" id="qbs-refresh">Refresh stats &amp; comments</button>' +
      '</div>' +
      '<p class="hint" id="qbs-status"></p>' +
      '<h3>Recent Shorts</h3><div id="qbs-shorts"></div>' +
      '<h3>Suggested topics (from comments)</h3><div id="qbs-topics"></div>' +
      '<p class="small muted">Viewed vs Swiped Away is Studio-only and is not available via the API; early hold uses the first ~10% of the retention curve instead.</p>';
    $('view-studio').appendChild(el);
    $('qbs-refresh').addEventListener('click', refresh);
    paint();
  }

  function consumeTopic() { return store.consumeTopic(); }
  function peekTopic() { return store.peekTopic(); }

  function boot() {
    mount();
    // Re-paint when switching to the Studio tab
    document.querySelectorAll('.tab[data-view="studio"]').forEach((tab) => {
      tab.addEventListener('click', () => setTimeout(paint, 0));
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);

  VTS.qbs = {
    store, consumeTopic, peekTopic, refresh, paint,
    BUILD: '1.12.0',
  };
}());
