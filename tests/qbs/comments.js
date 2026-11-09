// node tests/qbs/comments.js
'use strict';
const assert = require('assert');
const C = require('../../www/js/qbs/comments.js');
let n = 0; const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('isQuestion heuristics', () => {
  assert.ok(C.isQuestion('Why does my brain do this at 3am?'));
  assert.ok(C.isQuestion('How do I stop overthinking texts'));
  assert.ok(C.isQuestion('is it normal to feel this anxious'));
  assert.ok(!C.isQuestion('nice video'));
  assert.ok(!C.isQuestion('http://spam.example/x'));
  assert.ok(!C.isQuestion('ok'));
});

test('mineTopics from mock comments', () => {
  const comments = [
    { id: '1', videoId: 'v1', text: 'Why do I overthink every text?', likeCount: 5 },
    { id: '2', videoId: 'v1', text: 'lol so true', likeCount: 2 },
    { id: '3', videoId: 'v1', text: 'Why do I overthink every text?', likeCount: 1 }, // dup
    { id: '4', videoId: 'v2', text: 'How can I sleep better when anxious?', likeCount: 8 },
  ];
  const topics = C.mineTopics(comments, { titleByVideo: { v1: 'Brain vs Me', v2: 'Sleep debt' } });
  assert.ok(topics.length >= 2);
  assert.ok(topics[0].score >= topics[1].score);
  assert.ok(topics.some((t) => /sleep/i.test(t.text)));
});

test('listCommentThreads pages once', async () => {
  const fetchFn = async (url) => {
    assert.ok(url.includes('commentThreads'));
    assert.ok(url.includes('videoId=abc'));
    return {
      ok: true, status: 200,
      json: async () => ({
        items: [{
          id: 'c1',
          snippet: { topLevelComment: { snippet: { textDisplay: 'Why is this so relatable?', likeCount: 3, authorDisplayName: 'x', publishedAt: '2026-11-01T00:00:00Z' } } },
        }],
      }),
    };
  };
  const rows = await C.listCommentThreads(fetchFn, 'tok', 'abc', { maxPages: 1 });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].text.includes('relatable'), true);
});

(async () => {
  for (const [name, fn] of tests) { await fn(); n++; console.log('ok', name); }
  console.log(n + ' qbs/comments tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
