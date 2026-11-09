// node tests/qbs/sync.js — end-to-end sync with mocked APIs
'use strict';
const assert = require('assert');
const Store = require('../../www/js/qbs/store.js');
const A = require('../../www/js/qbs/analytics.js');
const Cm = require('../../www/js/qbs/comments.js');
const Sync = require('../../www/js/qbs/sync.js');

function jsonRes(obj, status) {
  return { ok: status == null || (status >= 200 && status < 300), status: status || 200, json: async () => obj };
}

(async () => {
  const store = Store.createStore(Store.memoryAdapter());
  const fetchFn = async (url) => {
    if (url.includes('/channels?')) return jsonRes({ items: [{ id: 'CH', snippet: { title: 'Quiet Brain' }, contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] });
    if (url.includes('/playlistItems?')) return jsonRes({ items: [{ contentDetails: { videoId: 's1' } }] });
    if (url.includes('/videos?')) return jsonRes({ items: [{ id: 's1', snippet: { title: 'Overthinking', publishedAt: '2026-10-01T00:00:00Z' }, statistics: { viewCount: '200', likeCount: '20', commentCount: '3' }, contentDetails: { duration: 'PT40S' } }] });
    if (url.includes('youtubeanalytics.googleapis.com') && url.includes('elapsedVideoTimeRatio')) {
      return jsonRes({ columnHeaders: [{ name: 'elapsedVideoTimeRatio' }, { name: 'audienceWatchRatio' }, { name: 'relativeRetentionPerformance' }], rows: [[0.05, 0.9, 0.6], [0.9, 0.4, 0.3]] });
    }
    if (url.includes('youtubeanalytics.googleapis.com')) {
      return jsonRes({ columnHeaders: [{ name: 'video' }, { name: 'views' }, { name: 'likes' }, { name: 'comments' }, { name: 'averageViewDuration' }, { name: 'averageViewPercentage' }, { name: 'engagedViews' }], rows: [['s1', 180, 18, 3, 22, 71.5, 120]] });
    }
    if (url.includes('commentThreads')) {
      return jsonRes({ items: [
        { id: 'c1', snippet: { topLevelComment: { snippet: { textDisplay: 'How do I stop rumination at night?', likeCount: 6 } } } },
        { id: 'c2', snippet: { topLevelComment: { snippet: { textDisplay: 'great video', likeCount: 1 } } } },
      ] });
    }
    throw new Error('unexpected url ' + url);
  };

  const result = await Sync.syncStudio({
    fetchFn, accessToken: 'tok', store, analytics: A, comments: Cm,
    hold: { earlyHoldFromRetention: Store.earlyHoldFromRetention, endHoldFromRetention: Store.endHoldFromRetention },
  }, { maxVideos: 5, maxRetention: 1, maxCommentVideos: 1 });

  assert.strictEqual(result.videos, 1);
  assert.ok(result.topics >= 1);
  const short = store.listShorts()[0];
  assert.strictEqual(short.ytId, 's1');
  assert.strictEqual(short.avgViewPercentage, 71.5);
  assert.ok(short.earlyHold > 0.8);
  const topic = store.peekTopic();
  assert.ok(topic && /rumination|stop/i.test(topic.text));
  const consumed = store.consumeTopic();
  assert.ok(consumed.text);
  assert.strictEqual(store.peekTopic(), null);
  console.log('ok qbs/sync end-to-end');
  console.log('1 qbs/sync tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
