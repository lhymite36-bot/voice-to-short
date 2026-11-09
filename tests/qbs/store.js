// node tests/qbs/store.js
'use strict';
const assert = require('assert');
const S = require('../../www/js/qbs/store.js');
let n = 0; const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('empty store + upsert short', () => {
  const st = S.createStore(S.memoryAdapter());
  st.upsertShort({ ytId: 'abc', title: 'T', views: 10 });
  assert.strictEqual(st.listShorts().length, 1);
  st.upsertShort({ ytId: 'abc', views: 20, likes: 3 });
  assert.strictEqual(st.listShorts()[0].views, 20);
  assert.strictEqual(st.listShorts()[0].title, 'T');
});

test('topics queue: add, peek, consume, dismiss, dedupe', () => {
  const st = S.createStore(S.memoryAdapter());
  st.addTopics([{ text: 'Why do I overthink texts?', format: 'classic', score: 2 }]);
  st.addTopics([{ text: 'Why do I overthink texts?', score: 9 }]); // dedupe
  assert.strictEqual(st.listTopics('queued').length, 1);
  assert.strictEqual(st.peekTopic().text.includes('overthink'), true);
  const used = st.consumeTopic();
  assert.strictEqual(used.status, 'used');
  assert.strictEqual(st.peekTopic(), null);
  st.addTopics([{ text: 'Is it normal to feel this?', id: 'x1' }]);
  st.dismissTopic('x1');
  assert.strictEqual(st.listTopics('queued').length, 0);
  assert.strictEqual(st.listTopics('dismissed').length, 1);
});

test('early/end hold from retention points', () => {
  const pts = [
    { elapsed: 0.05, audienceWatchRatio: 0.9 },
    { elapsed: 0.1, audienceWatchRatio: 0.8 },
    { elapsed: 0.5, audienceWatchRatio: 0.5 },
    { elapsed: 0.9, audienceWatchRatio: 0.4 },
    { elapsed: 1.0, audienceWatchRatio: 0.35 },
  ];
  assert.strictEqual(S.earlyHoldFromRetention(pts), 0.85);
  assert.ok(S.endHoldFromRetention(pts) > 0.3);
});

(async () => {
  for (const [name, fn] of tests) {
    await fn();
    n++;
    console.log('ok', name);
  }
  console.log(n + ' qbs/store tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
