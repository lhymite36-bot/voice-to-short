/* Orchestrates a Studio sync: list Shorts → analytics → retention → comments → topics. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.VTS = root.VTS || {}; root.VTS.qbsSync = api; }
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  async function syncStudio(deps, opts) {
    const o = opts || {};
    const fetchFn = deps.fetchFn;
    const token = deps.accessToken;
    const store = deps.store;
    const A = deps.analytics;
    const Cm = deps.comments;
    const hold = deps.hold || {};
    const onProgress = deps.onProgress || function () {};
    if (!fetchFn || !token || !store || !A || !Cm) throw new Error('syncStudio: missing deps');

    onProgress('Listing recent Shorts…');
    const listed = await A.listRecentUploads(fetchFn, token, { max: o.maxVideos || 15 });
    if (listed.channel) store.setMeta({ channelId: listed.channel.id, channelTitle: listed.channel.title });
    const videos = listed.videos || [];
    if (!videos.length) {
      store.setMeta({ lastSyncAt: new Date().toISOString() });
      return { videos: 0, topics: 0, comments: 0 };
    }

    videos.forEach((v) => store.upsertShort(Object.assign({ fetchedAt: new Date().toISOString() }, v)));

    onProgress('Reading Analytics…');
    const ids = videos.map((v) => v.ytId);
    let metrics = [];
    try { metrics = await A.videoSummaryMetrics(fetchFn, token, ids, o); }
    catch (e) { onProgress('Analytics summary skipped: ' + (e.message || e)); }

    const byId = {};
    metrics.forEach((m) => { byId[m.ytId] = m; });

    const maxRetention = Math.max(0, Math.min(10, o.maxRetention == null ? 5 : o.maxRetention));
    for (let i = 0; i < Math.min(videos.length, maxRetention); i++) {
      const v = videos[i];
      onProgress('Retention ' + (i + 1) + '/' + Math.min(videos.length, maxRetention) + '…');
      try {
        const points = await A.videoRetention(fetchFn, token, v.ytId, o);
        const early = (hold.earlyHoldFromRetention || function () { return null; })(points);
        const end = (hold.endHoldFromRetention || function () { return null; })(points);
        const m = byId[v.ytId] || {};
        store.upsertShort({
          ytId: v.ytId,
          title: v.title,
          publishedAt: v.publishedAt,
          durationSec: v.durationSec,
          views: m.views != null ? m.views : v.views,
          likes: m.likes != null ? m.likes : v.likes,
          comments: m.comments != null ? m.comments : v.comments,
          avgViewPercentage: m.avgViewPercentage,
          avgViewDuration: m.avgViewDuration,
          engagedViews: m.engagedViews,
          earlyHold: early,
          endHold: end,
          retention: points,
          fetchedAt: new Date().toISOString(),
        });
      } catch (e) {
        const m = byId[v.ytId] || {};
        store.upsertShort(Object.assign({}, v, m, { fetchedAt: new Date().toISOString(), retentionError: e.message || String(e) }));
      }
    }

    // Apply metrics for videos without retention pull
    videos.forEach((v) => {
      if (!byId[v.ytId]) return;
      const m = byId[v.ytId];
      store.upsertShort({
        ytId: v.ytId,
        views: m.views,
        likes: m.likes,
        comments: m.comments,
        avgViewPercentage: m.avgViewPercentage,
        avgViewDuration: m.avgViewDuration,
        engagedViews: m.engagedViews,
        fetchedAt: new Date().toISOString(),
      });
    });

    onProgress('Mining comments…');
    const titleByVideo = {};
    videos.forEach((v) => { titleByVideo[v.ytId] = v.title; });
    const maxCommentVideos = Math.max(0, Math.min(10, o.maxCommentVideos == null ? 5 : o.maxCommentVideos));
    let allComments = [];
    for (let i = 0; i < Math.min(videos.length, maxCommentVideos); i++) {
      const v = videos[i];
      if (!(v.comments > 0)) continue;
      try {
        const rows = await Cm.listCommentThreads(fetchFn, token, v.ytId, { maxPages: o.commentPages || 1, maxResults: 50 });
        allComments = allComments.concat(rows.map((r) => Object.assign({}, r, { isQuestion: Cm.isQuestion(r.text) })));
      } catch (e) {
        onProgress('Comments on ' + v.ytId + ' skipped: ' + (e.message || e));
      }
    }
    if (allComments.length) store.upsertComments(allComments);
    const topics = Cm.mineTopics(allComments, { titleByVideo, limit: o.topicLimit || 30 });
    if (topics.length) store.addTopics(topics);
    store.setMeta({ lastSyncAt: new Date().toISOString() });
    onProgress('Done.');
    return { videos: videos.length, topics: topics.length, comments: allComments.length, channel: listed.channel };
  }

  return { syncStudio };
}));
