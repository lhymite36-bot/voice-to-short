/* YouTube Analytics + Data API helpers for Quiet Brain Studio.
   Pure / injectable fetch. No secrets. Retention, avg %, views, likes, comments. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.VTS = root.VTS || {}; root.VTS.qbsAnalytics = api; }
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const DATA = 'https://www.googleapis.com/youtube/v3';
  const ANALYTICS = 'https://youtubeanalytics.googleapis.com/v2/reports';

  async function apiError(res, what) {
    let body = null; try { body = await res.json(); } catch (_) { /* ignore */ }
    const er = body && body.error;
    const reason = er && er.errors && er.errors[0] && er.errors[0].reason || (typeof er === 'string' ? er : '');
    const msg = (er && er.message) || ('HTTP ' + res.status);
    const e = new Error(what + ': ' + msg); e.status = res.status; e.reason = reason; e.body = body; return e;
  }

  async function getJson(fetchFn, url, accessToken, what) {
    const res = await fetchFn(url, { method: 'GET', headers: { Authorization: 'Bearer ' + accessToken } });
    if (!res.ok) throw await apiError(res, what);
    return res.json();
  }

  function isoDate(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }

  function parseDurationSec(iso) {
    if (!iso || typeof iso !== 'string') return null;
    const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
    if (!m) return null;
    return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
  }

  function isLikelyShort(v) {
    const sec = parseDurationSec(v.contentDetails && v.contentDetails.duration);
    if (sec == null) return true;
    return sec > 0 && sec <= 180;
  }

  async function channelUploadsPlaylist(fetchFn, accessToken) {
    const j = await getJson(fetchFn, DATA + '/channels?part=contentDetails,snippet&mine=true', accessToken, 'YouTube channel');
    const it = j.items && j.items[0];
    if (!it) return null;
    return {
      id: it.id,
      title: it.snippet && it.snippet.title,
      uploadsId: it.contentDetails && it.contentDetails.relatedPlaylists && it.contentDetails.relatedPlaylists.uploads,
    };
  }

  async function listRecentUploads(fetchFn, accessToken, opts) {
    const o = opts || {};
    const max = Math.max(1, Math.min(50, o.max || 25));
    const ch = o.channel || await channelUploadsPlaylist(fetchFn, accessToken);
    if (!ch || !ch.uploadsId) return { channel: ch, videos: [] };
    const pl = await getJson(fetchFn,
      DATA + '/playlistItems?part=snippet,contentDetails&maxResults=' + max + '&playlistId=' + encodeURIComponent(ch.uploadsId),
      accessToken, 'YouTube uploads');
    const ids = (pl.items || []).map((it) => it.contentDetails && it.contentDetails.videoId).filter(Boolean);
    if (!ids.length) return { channel: ch, videos: [] };
    const det = await getJson(fetchFn,
      DATA + '/videos?part=snippet,statistics,contentDetails&id=' + ids.map(encodeURIComponent).join(','),
      accessToken, 'YouTube videos');
    const videos = (det.items || []).filter(isLikelyShort).map((v) => ({
      ytId: v.id,
      title: v.snippet && v.snippet.title,
      publishedAt: v.snippet && v.snippet.publishedAt,
      durationSec: parseDurationSec(v.contentDetails && v.contentDetails.duration),
      views: +(v.statistics && v.statistics.viewCount) || 0,
      likes: +(v.statistics && v.statistics.likeCount) || 0,
      comments: +(v.statistics && v.statistics.commentCount) || 0,
    }));
    return { channel: ch, videos };
  }

  function analyticsUrl(params) {
    return ANALYTICS + '?' + new URLSearchParams(params).toString();
  }

  async function videoSummaryMetrics(fetchFn, accessToken, videoIds, opts) {
    const o = opts || {};
    const ids = (videoIds || []).filter(Boolean);
    if (!ids.length) return [];
    const end = o.endDate || isoDate(Date.now() - 86400000);
    const start = o.startDate || isoDate(Date.now() - 28 * 86400000);
    const out = [];
    for (let i = 0; i < ids.length; i += 20) {
      const chunk = ids.slice(i, i + 20);
      const base = {
        ids: 'channel==MINE', startDate: start, endDate: end,
        dimensions: 'video', filters: 'video==' + chunk.join(','), sort: '-views',
      };
      let j;
      try {
        j = await getJson(fetchFn, analyticsUrl(Object.assign({}, base, {
          metrics: 'views,likes,comments,averageViewDuration,averageViewPercentage,engagedViews',
        })), accessToken, 'YouTube Analytics');
      } catch (e) {
        if (e.status === 400) {
          j = await getJson(fetchFn, analyticsUrl(Object.assign({}, base, {
            metrics: 'views,likes,comments,averageViewDuration,averageViewPercentage',
          })), accessToken, 'YouTube Analytics');
        } else throw e;
      }
      const headers = (j.columnHeaders || []).map((h) => h.name);
      (j.rows || []).forEach((row) => {
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = row[idx]; });
        out.push({
          ytId: obj.video,
          views: +obj.views || 0,
          likes: +obj.likes || 0,
          comments: +obj.comments || 0,
          avgViewDuration: +obj.averageViewDuration || 0,
          avgViewPercentage: +obj.averageViewPercentage || 0,
          engagedViews: obj.engagedViews != null ? +obj.engagedViews : null,
        });
      });
    }
    return out;
  }

  async function videoRetention(fetchFn, accessToken, videoId, opts) {
    const o = opts || {};
    const end = o.endDate || isoDate(Date.now() - 86400000);
    const start = o.startDate || isoDate(Date.now() - 28 * 86400000);
    const j = await getJson(fetchFn, analyticsUrl({
      ids: 'channel==MINE', startDate: start, endDate: end,
      metrics: 'audienceWatchRatio,relativeRetentionPerformance',
      dimensions: 'elapsedVideoTimeRatio',
      filters: 'video==' + videoId,
    }), accessToken, 'YouTube retention');
    const headers = (j.columnHeaders || []).map((h) => h.name);
    return (j.rows || []).map((row) => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = row[idx]; });
      return {
        elapsed: +obj.elapsedVideoTimeRatio,
        audienceWatchRatio: +obj.audienceWatchRatio,
        relativeRetentionPerformance: +obj.relativeRetentionPerformance,
      };
    });
  }

  return {
    DATA, ANALYTICS, isoDate, parseDurationSec, isLikelyShort,
    channelUploadsPlaylist, listRecentUploads, videoSummaryMetrics, videoRetention, analyticsUrl, getJson, apiError,
  };
}));
