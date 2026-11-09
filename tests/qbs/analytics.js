// node tests/qbs/analytics.js — mocked YouTube Data + Analytics
'use strict';
const assert = require('assert');
const A = require('../../www/js/qbs/analytics.js');
let n = 0; const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function jsonRes(obj, status) {
  return { ok: status == null || (status >= 200 && status < 300), status: status || 200, json: async () => obj };
}

test('parseDurationSec + isLikelyShort', () => {
  assert.strictEqual(A.parseDurationSec('PT45S'), 45);
  assert.strictEqual(A.parseDurationSec('PT1M30S'), 90);
  assert.ok(A.isLikelyShort({ contentDetails: { duration: 'PT59S' } }));
  assert.ok(!A.isLikelyShort({ contentDetails: { duration: 'PT10M' } }));
});

test('listRecentUploads filters to Shorts and maps stats', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (url.includes('/channels?')) return jsonRes({ items: [{ id: 'CH', snippet: { title: 'Quiet Brain' }, contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] });
    if (url.includes('/playlistItems?')) return jsonRes({ items: [
      { contentDetails: { videoId: 'short1' } },
      { contentDetails: { videoId: 'long1' } },
    ] });
    if (url.includes('/videos?')) return jsonRes({ items: [
      { id: 'short1', snippet: { title: 'Brain at 3am', publishedAt: '2026-11-01T00:00:00Z' }, statistics: { viewCount: '100', likeCount: '9', commentCount: '4' }, contentDetails: { duration: 'PT42S' } },
      { id: 'long1', snippet: { title: 'Long', publishedAt: '2026-11-01T00:00:00Z' }, statistics: { viewCount: '5' }, contentDetails: { duration: 'PT12M' } },
    ] });
    throw new Error('unexpected ' + url);
  };
  const r = await A.listRecentUploads(fetchFn, 'tok');
  assert.strictEqual(r.channel.title, 'Quiet Brain');
  assert.strictEqual(r.videos.length, 1);
  assert.strictEqual(r.videos[0].ytId, 'short1');
  assert.strictEqual(r.videos[0].views, 100);
  assert.strictEqual(r.videos[0].comments, 4);
});

test('videoSummaryMetrics maps rows; falls back without engagedViews', async () => {
  let round = 0;
  const fetchFn = async (url) => {
    round++;
    if (round === 1) return jsonRes({ error: { message: 'Unknown metric engagedViews', errors: [{ reason: 'badRequest' }] } }, 400);
    assert.ok(!url.includes('engagedViews'));
    return jsonRes({
      columnHeaders: [
        { name: 'video' }, { name: 'views' }, { name: 'likes' }, { name: 'comments' },
        { name: 'averageViewDuration' }, { name: 'averageViewPercentage' },
      ],
      rows: [['vid1', 50, 3, 2, 12.5, 64.2]],
    });
  };
  const rows = await A.videoSummaryMetrics(fetchFn, 'tok', ['vid1']);
  assert.strictEqual(rows[0].ytId, 'vid1');
  assert.strictEqual(rows[0].avgViewPercentage, 64.2);
  assert.strictEqual(rows[0].comments, 2);
});

test('videoRetention parses curve', async () => {
  const fetchFn = async () => jsonRes({
    columnHeaders: [{ name: 'elapsedVideoTimeRatio' }, { name: 'audienceWatchRatio' }, { name: 'relativeRetentionPerformance' }],
    rows: [[0.05, 0.95, 0.7], [0.5, 0.5, 0.4], [1, 0.3, 0.2]],
  });
  const pts = await A.videoRetention(fetchFn, 'tok', 'vid1');
  assert.strictEqual(pts.length, 3);
  assert.strictEqual(pts[0].audienceWatchRatio, 0.95);
});

(async () => {
  for (const [name, fn] of tests) { await fn(); n++; console.log('ok', name); }
  console.log(n + ' qbs/analytics tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
