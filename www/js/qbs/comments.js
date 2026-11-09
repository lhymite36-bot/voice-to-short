/* Comment miner: turn viewer questions into Autopilot topic ideas.
   Pure heuristics (no LLM required for M2). Injectable. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.VTS = root.VTS || {}; root.VTS.qbsComments = api; }
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const DATA = 'https://www.googleapis.com/youtube/v3';

  async function apiError(res, what) {
    let body = null; try { body = await res.json(); } catch (_) { /* ignore */ }
    const er = body && body.error;
    const reason = er && er.errors && er.errors[0] && er.errors[0].reason || '';
    const msg = (er && er.message) || ('HTTP ' + res.status);
    const e = new Error(what + ': ' + msg); e.status = res.status; e.reason = reason; e.body = body; return e;
  }

  async function listCommentThreads(fetchFn, accessToken, videoId, opts) {
    const o = opts || {};
    const maxPages = Math.max(1, Math.min(5, o.maxPages || 2));
    const maxResults = Math.max(1, Math.min(100, o.maxResults || 50));
    const out = [];
    let pageToken = '';
    for (let p = 0; p < maxPages; p++) {
      let url = DATA + '/commentThreads?part=snippet&order=relevance&maxResults=' + maxResults +
        '&videoId=' + encodeURIComponent(videoId) + '&textFormat=plainText';
      if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
      const res = await fetchFn(url, { method: 'GET', headers: { Authorization: 'Bearer ' + accessToken } });
      if (!res.ok) throw await apiError(res, 'YouTube comments');
      const j = await res.json();
      (j.items || []).forEach((it) => {
        const top = it.snippet && it.snippet.topLevelComment && it.snippet.topLevelComment.snippet;
        if (!top) return;
        out.push({
          id: it.id,
          videoId,
          text: String(top.textDisplay || top.textOriginal || '').trim(),
          likeCount: +top.likeCount || 0,
          author: top.authorDisplayName || '',
          publishedAt: top.publishedAt || null,
        });
      });
      pageToken = j.nextPageToken || '';
      if (!pageToken) break;
    }
    return out;
  }

  const Q_START = /^(how|what|why|when|where|who|which|is|are|do|does|did|can|could|should|would|will|am)\b/i;
  const Q_PHRASE = /\b(how (do|does|can|to)|what (is|are|if)|why (do|does|is|are)|anyone else|does anyone|is it normal|am i the only)\b/i;

  function isQuestion(text) {
    const t = String(text || '').trim();
    if (!t || t.length < 8 || t.length > 280) return false;
    if (/https?:\/\//i.test(t)) return false; // skip link spam
    if (/\?/.test(t)) return true;
    if (Q_START.test(t) || Q_PHRASE.test(t)) return true;
    return false;
  }

  function cleanQuestion(text) {
    let t = String(text || '').replace(/\s+/g, ' ').trim();
    t = t.replace(/^[@#]\w+\s+/g, '');
    // strip emoji spam at edges lightly
    t = t.replace(/^[\u{1F300}-\u{1FAFF}\s]+/u, '').replace(/[\u{1F300}-\u{1FAFF}\s]+$/u, '').trim();
    if (t.length > 160) t = t.slice(0, 157) + '…';
    return t;
  }

  // Turn a question comment into a Short idea line Autopilot / Gemini can use.
  function questionToTopic(comment, videoTitle) {
    const q = cleanQuestion(comment && comment.text);
    if (!q || !isQuestion(q)) return null;
    let text = q;
    if (!/\?$/.test(text)) text += '?';
    // Prefer framing as a psychology Short idea
    if (!/brain|psych|overthink|anxiet|habit|sleep|attach|dopamine|therapy/i.test(text) && videoTitle) {
      text = text + ' (from comments on “' + String(videoTitle).slice(0, 40) + '”)';
    }
    const likes = +(comment.likeCount) || 0;
    return {
      text,
      format: guessFormat(text),
      length: '60',
      source: 'comment',
      videoId: comment.videoId || null,
      commentId: comment.id || null,
      score: likes + (/\?/.test(q) ? 1 : 0),
    };
  }

  function guessFormat(text) {
    const t = text.toLowerCase();
    if (/\bmyth\b|\bfact\b/.test(t)) return 'myth-fact';
    if (/\bsigns?\b/.test(t)) return 'signs';
    if (/\bpov\b/.test(t)) return 'pov';
    if (/brain/.test(t)) return 'brain-vs-me';
    if (/why\b|how\b/.test(t)) return 'classic';
    return 'classic';
  }

  function mineTopics(comments, opts) {
    const o = opts || {};
    const titleByVideo = o.titleByVideo || {};
    const out = [];
    const seen = new Set();
    (comments || []).forEach((c) => {
      const marked = Object.assign({}, c, { isQuestion: isQuestion(c.text) });
      if (!marked.isQuestion) return;
      const topic = questionToTopic(marked, titleByVideo[c.videoId]);
      if (!topic) return;
      const key = topic.text.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) return;
      seen.add(key);
      out.push(topic);
    });
    out.sort((a, b) => (b.score || 0) - (a.score || 0));
    return out.slice(0, o.limit || 50);
  }

  return {
    listCommentThreads, isQuestion, cleanQuestion, questionToTopic, guessFormat, mineTopics,
  };
}));
