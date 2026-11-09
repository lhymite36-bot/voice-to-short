/* Quiet Brain Studio store: pure, testable persistence for Shorts metrics and the topic queue.
   Browser: localStorage. Node tests: inject a Map-backed adapter. No secrets. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.VTS = root.VTS || {}; root.VTS.qbsStore = api; }
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const KEY = 'vts.qbs.v1';
  const EMPTY = () => ({
    version: 1,
    shorts: [],       // { ytId, title, publishedAt, durationSec, views, likes, comments, avgViewPercentage, avgViewDuration, engagedViews, earlyHold, endHold, retention, fetchedAt }
    topics: [],       // { id, text, format, length, source, videoId, commentId, score, createdAt, usedAt, status }
    comments: [],     // { id, videoId, text, likeCount, isQuestion, topicHint, fetchedAt }
    meta: { lastSyncAt: null, channelId: null, channelTitle: null },
  });

  function memoryAdapter(seed) {
    let raw = seed ? JSON.stringify(seed) : null;
    return {
      get() { return raw; },
      set(v) { raw = v; },
      clear() { raw = null; },
    };
  }

  function localStorageAdapter() {
    return {
      get() { try { return localStorage.getItem(KEY); } catch (_) { return null; } },
      set(v) { try { localStorage.setItem(KEY, v); } catch (_) { /* quota */ } },
      clear() { try { localStorage.removeItem(KEY); } catch (_) { /* ignore */ } },
    };
  }

  function createStore(adapter) {
    const ad = adapter || (typeof localStorage !== 'undefined' ? localStorageAdapter() : memoryAdapter());
    function load() {
      try {
        const raw = ad.get();
        if (!raw) return EMPTY();
        const o = JSON.parse(raw);
        if (!o || o.version !== 1) return EMPTY();
        return Object.assign(EMPTY(), o, {
          shorts: Array.isArray(o.shorts) ? o.shorts : [],
          topics: Array.isArray(o.topics) ? o.topics : [],
          comments: Array.isArray(o.comments) ? o.comments : [],
          meta: Object.assign(EMPTY().meta, o.meta || {}),
        });
      } catch (_) { return EMPTY(); }
    }
    function save(state) { ad.set(JSON.stringify(state)); return state; }

    function upsertShort(row) {
      const s = load();
      const i = s.shorts.findIndex((x) => x.ytId === row.ytId);
      const next = Object.assign({}, i >= 0 ? s.shorts[i] : {}, row);
      if (i >= 0) s.shorts[i] = next; else s.shorts.unshift(next);
      s.shorts = s.shorts.slice(0, 100);
      return save(s);
    }

    function listShorts() { return load().shorts.slice(); }

    function addTopics(items) {
      const s = load();
      const seen = new Set(s.topics.map((t) => norm(t.text)));
      (items || []).forEach((it) => {
        const text = String(it.text || '').trim();
        if (!text || seen.has(norm(text))) return;
        seen.add(norm(text));
        s.topics.unshift({
          id: it.id || ('t_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)),
          text,
          format: it.format || 'classic',
          length: it.length || '60',
          source: it.source || 'comment',
          videoId: it.videoId || null,
          commentId: it.commentId || null,
          score: +it.score || 0,
          createdAt: it.createdAt || new Date().toISOString(),
          usedAt: null,
          status: 'queued',
        });
      });
      s.topics = s.topics.slice(0, 200);
      return save(s);
    }

    function listTopics(status) {
      const all = load().topics;
      return status ? all.filter((t) => t.status === status) : all.slice();
    }

    function consumeTopic() {
      const s = load();
      const i = s.topics.findIndex((t) => t.status === 'queued');
      if (i < 0) return null;
      s.topics[i] = Object.assign({}, s.topics[i], { status: 'used', usedAt: new Date().toISOString() });
      save(s);
      return Object.assign({}, s.topics[i]);
    }

    function peekTopic() {
      return load().topics.find((t) => t.status === 'queued') || null;
    }

    function dismissTopic(id) {
      const s = load();
      const i = s.topics.findIndex((t) => t.id === id);
      if (i < 0) return s;
      s.topics[i] = Object.assign({}, s.topics[i], { status: 'dismissed' });
      return save(s);
    }

    function upsertComments(rows) {
      const s = load();
      const map = new Map(s.comments.map((c) => [c.id, c]));
      (rows || []).forEach((r) => {
        if (!r || !r.id) return;
        map.set(r.id, Object.assign({}, map.get(r.id) || {}, r));
      });
      s.comments = Array.from(map.values()).sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0)).slice(0, 500);
      return save(s);
    }

    function listComments(videoId) {
      const all = load().comments;
      return videoId ? all.filter((c) => c.videoId === videoId) : all.slice();
    }

    function setMeta(patch) {
      const s = load();
      s.meta = Object.assign({}, s.meta, patch);
      return save(s);
    }

    function getMeta() { return Object.assign({}, load().meta); }

    function clear() { ad.clear(); return EMPTY(); }

    function snapshot() { return load(); }

    return {
      KEY, EMPTY, load, save, snapshot, clear,
      upsertShort, listShorts,
      addTopics, listTopics, consumeTopic, peekTopic, dismissTopic,
      upsertComments, listComments,
      setMeta, getMeta,
    };
  }

  function norm(t) { return String(t || '').trim().toLowerCase().replace(/\s+/g, ' '); }

  function earlyHoldFromRetention(points) {
    const pts = Array.isArray(points) ? points : [];
    const early = pts.filter((p) => +p.elapsed <= 0.10);
    if (!early.length) return null;
    const sum = early.reduce((a, p) => a + (+p.audienceWatchRatio || 0), 0);
    return Math.round((sum / early.length) * 1000) / 1000;
  }

  function endHoldFromRetention(points) {
    const pts = Array.isArray(points) ? points : [];
    const end = pts.filter((p) => +p.elapsed >= 0.85);
    if (!end.length) return null;
    const sum = end.reduce((a, p) => a + (+p.audienceWatchRatio || 0), 0);
    return Math.round((sum / end.length) * 1000) / 1000;
  }

  return { createStore, memoryAdapter, localStorageAdapter, earlyHoldFromRetention, endHoldFromRetention, norm };
}));
