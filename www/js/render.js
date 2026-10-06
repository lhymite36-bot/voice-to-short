/* Canvas renderer for colour-graded caption videos (9:16, 16:9, 1:1, 4:5) + MediaRecorder export.
   Long videos (up to 20 min) are recorded in segments streamed to disk, then joined by a streaming WebM remuxer. */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {});
  const W = 1080; const H = 1920;
  const FONT = 'Montserrat, "Arial Black", "Roboto", sans-serif';
  const MAX_SECONDS = 60; // default Short cap (9:16); longer lengths pass maxSeconds
  const MAX_LONG = 20 * 60;
  const ASPECTS = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080], '4:5': [1080, 1350] };
  const ASPECT_LABELS = { '9:16': 'Vertical 9:16 (Shorts, Reels, TikTok)', '16:9': 'Landscape 16:9 (YouTube)', '1:1': 'Square 1:1', '4:5': 'Portrait 4:5 (Instagram feed)' };
  function frameSize(aspect, scale) { const d = ASPECTS[aspect] || ASPECTS['9:16']; const k = scale || 1; return [Math.round(d[0] * k / 2) * 2, Math.round(d[1] * k / 2) * 2]; }
  // Where things go for each frame shape (design units: the frame's own 1080-based size).
  function layoutFor(aspect, scenes) {
    const [DW, DH] = ASPECTS[aspect] || ASPECTS['9:16'];
    const L = { aspect: ASPECTS[aspect] ? aspect : '9:16', DW, DH, card: null, band: false };
    if (L.aspect === '9:16') {
      Object.assign(L, { cap: { cx: 540, cy: scenes ? 500 : 1030, maxW: 900, size: 1, lines: 3 }, step: [540, 272], cta: [540, 790], wm: [540, 200], band: scenes, classicY: 1 });
    } else if (L.aspect === '16:9') {
      // scene on the left (world x 0–1080, y 760–1840 at 1:1), captions panel on the right
      Object.assign(L, { card: scenes ? { x: 0, y: 0, w: 1080, h: 1080, cropY: 760, k: 1, edge: 'right' } : null,
        cap: scenes ? { cx: 1500, cy: 560, maxW: 720, size: 0.8, lines: 4 } : { cx: 960, cy: 560, maxW: 1500, size: 1, lines: 2 },
        step: scenes ? [1500, 190] : [960, 150], cta: scenes ? [1500, 900] : [960, 900], wm: scenes ? [1500, 1030] : [960, 1030], classicY: 1080 / 1920 });
    } else { // 1:1 and 4:5: caption strip on top, scene card below
      const sq = L.aspect === '1:1'; const top = sq ? 300 : 360; const ch = DH - top - (sq ? 30 : 40); const k = ch / 1080; const cw = 1080 * k;
      Object.assign(L, { card: scenes ? { x: (DW - cw) / 2, y: top, w: cw, h: ch, cropY: 760, k, edge: 'round' } : null,
        cap: scenes ? { cx: 540, cy: top / 2 + 8, maxW: 980, size: sq ? 0.66 : 0.72, lines: 2 } : { cx: 540, cy: DH * 0.5, maxW: 940, size: sq ? 0.8 : 0.9, lines: 3 },
        step: scenes ? [540, top + 52] : [540, DH * 0.14], cta: scenes ? [540, top + ch - 120] : [540, DH * 0.78], wm: scenes ? [540, top + ch - 20] : [540, DH - 26], classicY: DH / 1920 });
    }
    return L;
  }
  const LEAD = 0.3; const TAIL = 0.8;

  const PRESETS = {
    teal: { name: 'Teal & Orange', bg: '#04161b', blobs: ['#0d7377', '#0a3d4a', '#ff7b39', '#ffb45e', '#0e5560'], hi: '#ffb347', text: '#ffffff',
      filter: 'contrast(1.12) saturate(1.18)', shadowTint: '#00424d', shadowAmt: 0.35, highTint: '#ff9b4a', highAmt: 0.10, lift: 0, grain: 0.07, vignette: 0.62, particles: '#ffd2a1' },
    moody: { name: 'Moody Film', bg: '#0f110d', blobs: ['#2b3a2d', '#50482f', '#8b6a44', '#1d2b2f', '#3e4a3a'], hi: '#e9c27a', text: '#f3eee4',
      filter: 'contrast(0.96) saturate(0.72) sepia(0.12)', shadowTint: '#173c38', shadowAmt: 0.4, highTint: '#d69a5c', highAmt: 0.12, lift: 0.07, grain: 0.13, vignette: 0.78, particles: '#e9c27a' },
    warm: { name: 'Warm Soft', bg: '#2e1622', blobs: ['#f4a582', '#e46f73', '#ffd3a5', '#9b5c8f', '#f7b7a3'], hi: '#fff0a0', text: '#ffffff',
      filter: 'contrast(0.92) saturate(1.06) brightness(1.04)', shadowTint: '#5b2a4a', shadowAmt: 0.25, highTint: '#ffcf9e', highAmt: 0.14, lift: 0.04, grain: 0.05, vignette: 0.42, particles: '#fff3d6' },
    mono: { name: 'Clean Mono', bg: '#070708', blobs: ['#3b3b41', '#18181c', '#8d8d95', '#26262b', '#5a5a61'], hi: '#ffffff', text: '#bdbdc4',
      filter: 'grayscale(1) contrast(1.18)', shadowTint: '#000000', shadowAmt: 0.2, highTint: '#ffffff', highAmt: 0.04, lift: 0.02, grain: 0.08, vignette: 0.6, particles: '#ffffff' },
    neon: { name: 'Night Neon', bg: '#08051a', blobs: ['#6d28d9', '#db2777', '#0891b2', '#1e1b4b', '#9333ea'], hi: '#67e8f9', text: '#ffffff',
      filter: 'contrast(1.1) saturate(1.25)', shadowTint: '#1e1068', shadowAmt: 0.3, highTint: '#f0abfc', highAmt: 0.08, lift: 0, grain: 0.06, vignette: 0.6, particles: '#a5f3fc' },
    sage: { name: 'Calm Sage', bg: '#0e1c16', blobs: ['#4a7c59', '#a3b18a', '#dad7cd', '#2f4a3b', '#6b8f71'], hi: '#fef3c7', text: '#ffffff',
      filter: 'contrast(0.98) saturate(0.9)', shadowTint: '#1b3a2c', shadowAmt: 0.3, highTint: '#f5e6c8', highAmt: 0.1, lift: 0.04, grain: 0.07, vignette: 0.55, particles: '#fef3c7' },
  };

  // Deterministic pseudo-random for particles.
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const easeOutBack = (x) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  function hexA(hex, a) {
    const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function makeCanvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }

  // ---------- timeline: caption timing locked to the voice ----------
  // Captions used to be spread over the speech span by word count (beat.weight). TTS reads with dramatic pauses, speaker
  // changes and its own pace, so that estimate ran up to ~5 s ahead of / behind the voice. Now the decoded voice itself
  // drives the timing: a 10 ms loudness profile of the actual audio -> pauses -> every word mapped onto real speech.
  const PROF_RATE = 100;
  // Tuned on 10 posted Shorts against forced alignment: pause ≥ 90 ms below 5% of the voice's loud level; gap costs for
  // mid-phrase / comma / sentence end / beat end / speaker change; cost to treat a pause as mid-word; duration-fit weight.
  const ALIGN = { minPause: 0.09, thrK: 0.05, gap: [3.0, 0.9, 0.25, 0.08, 0], ignBase: 0.6, ignK: 3, ignSpan: 0.35, segA: 6, segB: 4, lead: 0 };
  // Loudness profile of the voice (audio time 0 = voice start; `lead` = where the voice starts in the video).
  function speechProfile(buf, lead) {
    if (!buf || !buf.getChannelData) return null;
    const ch = buf.getChannelData(0); const sr = buf.sampleRate; const hop = Math.max(1, Math.round(sr / PROF_RATE));
    const n = Math.ceil(ch.length / hop); const v = new Float32Array(n);
    for (let k = 0; k < n; k++) { const a = k * hop; const b = Math.min(ch.length, a + hop); let s = 0; for (let j = a; j < b; j++) s += ch[j] * ch[j]; v[k] = Math.sqrt(s / Math.max(1, b - a)); }
    return finishProfile(v, lead);
  }
  function finishProfile(v, lead) {
    const n = v.length; if (!n) return null;
    const sample = []; for (let k = 0; k < n; k += Math.max(1, Math.floor(n / 4000))) sample.push(v[k]); sample.sort((a, b) => a - b);
    const p95 = sample[Math.floor(sample.length * 0.95)] || 0; if (p95 < 0.003) return null; // silent / no voice
    return { rate: PROF_RATE, v, thr: Math.max(0.0035, p95 * ALIGN.thrK), lead: lead == null ? LEAD : lead };
  }
  // Rough spoken length of a word (syllables), for spreading words over a stretch of real speech.
  function wordLen(w) {
    const raw = String(w).replace(/[^\p{L}\p{N}]/gu, '');
    if (!raw) return 0.3;
    if (/^\d+$/.test(raw)) return 0.4 + raw.length * 1.3;
    if (/^[A-Z]{2,5}$/.test(raw)) return 0.4 + raw.length; // acronyms are spelled out (POV, CEO)
    const l = raw.toLowerCase(); let syl = (l.match(/[aeiouy]+/g) || []).length;
    if (syl > 1 && /[^aeiouy]e$/.test(l) && !/[^aeiouy]le$/.test(l)) syl--;
    return 0.4 + Math.max(1, syl);
  }
  // Pauses (audio time) inside [a, b]: runs below the threshold of at least minDur seconds.
  function findPauses(prof, a, b, minDur, thr) {
    const R0 = prof.rate; const v = prof.v; const out = []; const i0 = Math.max(0, Math.floor(a * R0)); const i1 = Math.min(v.length, Math.ceil(b * R0));
    let k = i0; while (k < i1 && v[k] <= thr) k++; // skip leading silence
    let run = -1;
    for (; k < i1; k++) {
      if (v[k] <= thr) { if (run < 0) run = k; } else if (run >= 0) { if ((k - run) / R0 >= minDur) out.push({ s: run / R0, e: k / R0 }); run = -1; }
    }
    return out; // a trailing run is the end of speech, not a pause
  }
  // Word onsets (video time) for the flattened words of `list`, aligned to the voice in `prof` between speechStart/End.
  function alignWords(list, speechStart, speechEnd, prof) {
    const L = prof.lead; let a = Math.max(0, speechStart - L); let b = Math.max(a + 0.1, speechEnd - L);
    { // tighten to the first/last loud frame (span edges may sit in silence, e.g. section boundaries)
      const v = prof.v; const R0 = prof.rate; let i = Math.floor(a * R0); let e = Math.min(v.length, Math.ceil(b * R0)) - 1;
      while (i < e && v[i] <= prof.thr) i++; while (e > i && v[e] <= prof.thr) e--;
      if (e - i > 10) { a = i / R0; b = (e + 1) / R0; }
    }
    const words = []; list.forEach((bt, bi) => { const ws = String(bt.text).trim().split(/\s+/); ws.forEach((w, wi) => {
      const last = wi === ws.length - 1; const gap = last ? (bi < list.length - 1 && (list[bi + 1].speaker || '') !== (bt.speaker || '') ? 4 : 3) : /[.!?…]["')\]]*$/.test(w) ? 2 : /[,;:—–-]["')\]]*$/.test(w) ? 1 : 0;
      words.push({ len: wordLen(w), gap, beat: bi }); }); });
    const n = words.length; if (!n) return null;
    const P = findPauses(prof, a, b, ALIGN.minPause, prof.thr);
    const res = dpAlign(words, a, b, P, ALIGN); if (!res) return null;
    const onset = res.onset;
    for (let k = 0; k < n; k++) onset[k] = L + onset[k] + ALIGN.lead;
    return { onset, words, segs: res.segs.length, pauses: P.length };
  }
  // Monotonic DP: which pauses fall between which words. Each stretch between used pauses must fit its words at the
  // read's average pace (log-ratio cost); pauses prefer beat ends / punctuation; skipping a long pause is costly.
  // Words inside a stretch are spread by syllables over its voiced time. Returns onsets in audio time.
  function dpAlign(words, a, b, P, C) {
    const n = words.length; const m = P.length;
    const pauseDur = P.map((p) => p.e - p.s); const totalPause = pauseDur.reduce((x, y) => x + y, 0);
    const speech = (b - a) - totalPause; if (speech <= 0.1 || !n) return null;
    const cum = [0]; words.forEach((w) => cum.push(cum[cum.length - 1] + w.len));
    const rate = speech / cum[n]; // seconds per syllable-unit, across this span
    const GAP_COST = C.gap; // mid-phrase, comma, sentence end, beat end, speaker change
    const ign = (p) => C.ignBase + C.ignK * Math.min(1, Math.max(0, pauseDur[p] - C.minPause) / C.ignSpan); // ignoring a long pause is costly
    const segCost = (i, j, dur) => { const E = rate * (cum[j] - cum[i]); const r = Math.log(Math.max(0.03, dur) / Math.max(0.03, E)); return r * r * (C.segA + Math.sqrt(j - i) * C.segB); };
    const segStart = (p) => (p < 0 ? a : P[p].e); const segEnd = (p) => (p >= m ? b : P[p].s);
    const voiced = (p0, p1) => { let d = segEnd(p1) - segStart(p0); for (let q = p0 + 1; q < p1; q++) d -= pauseDur[q]; return d; };
    const ignCost = (p0, p1) => { let c = 0; for (let q = p0 + 1; q < p1; q++) c += ign(q); return c; };
    const Vat = []; { let before = 0; for (let q = 0; q < m; q++) { Vat.push(P[q].s - a - before); before += pauseDur[q]; } } // voiced time before each pause
    // dp[p][j]: pause p is used and falls right after word j-1
    const BACK = 8; const INF = 1e18;
    const dp = Array.from({ length: m + 1 }, () => new Float64Array(n + 1).fill(INF)); const from = Array.from({ length: m + 1 }, () => new Int32Array((n + 1) * 2).fill(-2));
    for (let p = 0; p <= m; p++) {
      const last = p === m;
      for (let j = 1; j <= n; j++) {
        if (last && j !== n) continue; if (!last && j === n) continue;
        if (!last) { const E = rate * cum[j]; if (Math.abs(E - Vat[p]) > Math.max(4, 0.4 * Vat[p])) continue; } // far off the average pace: impossible
        const gc = last ? 0 : GAP_COST[words[j - 1].gap];
        let best = p - BACK <= 0 ? segCost(0, j, voiced(-1, p)) + ignCost(-1, p) : INF; let bp = -1; let bj = 0;
        for (let p0 = Math.max(0, p - BACK); p0 < p; p0++) {
          const row = dp[p0]; const vd = voiced(p0, p); const ic = ignCost(p0, p);
          // only word counts that could plausibly fill this stretch (pace within 3.5x of the average)
          const lo = vd / (3.5 * rate); const hi = vd * 3.5 / rate;
          for (let i = j - 1; i >= Math.max(1, j - 60); i--) { const u = cum[j] - cum[i]; if (u > hi) break; if (u < lo || row[i] >= INF) continue; const c = row[i] + segCost(i, j, vd) + ic; if (c < best) { best = c; bp = p0; bj = i; } }
        }
        dp[p][j] = best + gc; from[p][j * 2] = bp; from[p][j * 2 + 1] = bj;
      }
    }
    if (!(dp[m][n] < INF)) return null;
    const segs = []; let p = m; let j = n;
    while (j > 0) { const p0 = from[p][j * 2]; const i = p0 < 0 ? 0 : from[p][j * 2 + 1]; segs.unshift({ i, j, p0, p1: p, a: segStart(p0), b: segEnd(p) }); if (p0 < 0) break; p = p0; j = i; }
    const onset = new Array(n);
    segs.forEach((sg) => {
      // spread the words over the voiced time of the stretch, stepping over any skipped pauses inside it
      const spans = []; let t = segStart(sg.p0);
      for (let q = sg.p0 + 1; q < sg.p1; q++) { spans.push([t, P[q].s]); t = P[q].e; } spans.push([t, segEnd(sg.p1)]);
      const vd = spans.reduce((x, s2) => x + (s2[1] - s2[0]), 0); const tot = cum[sg.j] - cum[sg.i];
      for (let k = sg.i; k < sg.j; k++) {
        let want = ((cum[k] - cum[sg.i]) / tot) * vd; let tt = spans[0][0];
        for (const s2 of spans) { const d = s2[1] - s2[0]; if (want <= d + 1e-9) { tt = s2[0] + want; break; } want -= d; tt = s2[1]; }
        onset[k] = tt;
      }
    });
    return { onset, segs };
  }
  function buildTimeline(beats, speechStart, speechEnd, sections, speech) {
    const list = (beats || []).filter((b) => b && String(b.text || '').trim());
    // Long videos: every section has its own audio span, so captions can't drift across sections.
    if (sections && sections.length > 1 && list.some((b) => b.section != null)) {
      const out = [];
      // sections are spans in video time (lead-in already added); clip to the speech that fits
      sections.forEach((sp, k) => { const part = list.filter((b) => (b.section || 0) === k); const a = k === 0 ? Math.max(sp.start, speechStart) : sp.start; const e = Math.min(sp.end, speechEnd); if (part.length && e - a > 0.3) out.push.apply(out, buildTimeline(part, a, e, null, speech)); });
      if (out.length) return out;
    }
    const fields = (b) => ({ step: Number(b.step) || 0, emphasis: String(b.emphasis || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''), scene: b.scene || null, aiImage: b.aiImage || null, section: b.section || 0, chapter: b.chapter || '',
      speaker: b.speaker || '', fx: b.fx || '', fxText: b.fxText || '', sfx: b.sfx || '', sticker: b.sticker || '', punch: !!b.punch, expr: (b.scene && b.scene.emotion) || '' });
    // Voice-locked timing: every word at its onset in the real audio; a beat starts just before its first word.
    let al = null;
    if (speech && list.length) {
      // the same voice + script is laid out several times (preview, render, thumbnail): reuse the alignment
      const key = speechStart.toFixed(3) + '|' + speechEnd.toFixed(3) + '|' + list.map((b) => (b.speaker || '') + ':' + String(b.text).trim()).join('\n');
      const cache = speech.cache || (speech.cache = new Map());
      if (cache.has(key)) al = cache.get(key); else { try { al = alignWords(list, speechStart, speechEnd, speech); } catch (_) { al = null; } cache.set(key, al); }
    }
    if (al) {
      const out = []; let k = 0;
      list.forEach((b) => { const words = String(b.text).trim().split(/\s+/); const wordTimes = words.map(() => al.onset[k++]); out.push(Object.assign({ text: String(b.text).trim(), words, wordTimes, start: 0, end: 0 }, fields(b))); });
      out.forEach((bt, i) => { const prevLast = i ? out[i - 1].wordTimes[out[i - 1].wordTimes.length - 1] : -1; bt.start = i === 0 ? Math.min(speechStart, bt.wordTimes[0]) : Math.max(prevLast + 0.05, bt.wordTimes[0] - 0.06); });
      out.forEach((bt, i) => { bt.end = i < out.length - 1 ? out[i + 1].start : Math.max(speechEnd, bt.wordTimes[bt.wordTimes.length - 1] + 0.3); });
      out.aligned = true;
      return out;
    }
    const total = list.reduce((a, b) => a + (Number(b.weight) || 1), 0) || 1;
    const span = Math.max(0.5, speechEnd - speechStart);
    let acc = 0;
    return list.map((b) => {
      const start = speechStart + (acc / total) * span;
      acc += Number(b.weight) || 1;
      const end = speechStart + (acc / total) * span;
      const words = String(b.text).trim().split(/\s+/);
      const ww = words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 2);
      const wsum = ww.reduce((a, x) => a + x, 0) || 1;
      let wacc = 0;
      const wordTimes = words.map((w, i) => { const t = start + (wacc / wsum) * (end - start) * 0.92; wacc += ww[i]; return t; });
      return Object.assign({ text: String(b.text).trim(), words, wordTimes, start, end }, fields(b));
    });
  }

  // ---------- renderer ----------
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.s = canvas.width / W; this.DW = W; this.DH = H;
      this.bgW = 270; this.bgH = 480;
      this.bg = makeCanvas(this.bgW, this.bgH);
      this.graded = makeCanvas(this.bgW, this.bgH);
      this.layoutCache = new Map();
      const r = rng(7);
      this.particles = Array.from({ length: 22 }, () => ({ x: r(), y: r(), z: 0.3 + r() * 0.7, sp: 0.01 + r() * 0.025, ph: r() * 6.28, rad: 3 + r() * 11 }));
    }
    setup(o) {
      this.o = Object.assign({ captionStyle: 'pop', captionCase: 'upper', watermark: false, handle: '' }, o);
      this.preset = PRESETS[o.preset] || PRESETS.teal;
      this.scenes = this.o.visual !== 'classic' && !!VTS.scenes;
      this.LY = layoutFor(this.o.aspect || '9:16', this.scenes); this.DW = this.LY.DW; this.DH = this.LY.DH; this.s = this.canvas.width / this.DW;
      if (this.DW > this.DH) { this.bgW = 480; this.bgH = 270; } else { this.bgW = 270; this.bgH = Math.round(270 * this.DH / this.DW); }
      this.bg = makeCanvas(this.bgW, this.bgH); this.graded = makeCanvas(this.bgW, this.bgH);
      this.timeline = buildTimeline(o.beats, o.speechStart, o.speechEnd, o.sections, o.speech);
      this.layoutCache.clear();
      this.images = [];
      if (this.scenes) this.setupScenes();
      // Vignette + film grain, pre-baked into a few half-resolution frames (one cheap full-frame draw per frame).
      const c = this.canvas; const fw = Math.round(c.width / 2); const fh = Math.round(c.height / 2);
      this.finish = [];
      for (let k = 0; k < 4; k++) {
        const f = makeCanvas(fw, fh); const v = f.getContext('2d');
        const g = v.createRadialGradient(fw / 2, fh * 0.48, fw * 0.25, fw / 2, fh * 0.5, fh * 0.72);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.6, 'rgba(0,0,0,' + (this.preset.vignette * 0.35) + ')'); g.addColorStop(1, 'rgba(0,0,0,' + this.preset.vignette + ')');
        v.fillStyle = g; v.fillRect(0, 0, fw, fh);
        if (this.preset.grain > 0) {
          const img = v.getImageData(0, 0, fw, fh); const d = img.data; const amt = this.preset.grain * 255 * 1.1;
          for (let i = 0; i < d.length; i += 4) {
            const n = (Math.random() + Math.random() - 1); // triangular noise, -1..1
            if (n > 0) { // light speck: blend towards white
              const a = d[i + 3] / 255; const add = n * amt;
              d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.min(255, add * (1 - a));
            } else { d[i + 3] = Math.min(255, d[i + 3] - n * amt * 0.9); }
          }
          v.putImageData(img, 0, 0);
        }
        this.finish.push(f);
      }
    }
    setupScenes() {
      const SC = VTS.scenes; const tl = this.timeline;
      if (!this.stage) this.stage = new SC.Stage();
      this.stage.setPreset(this.o.preset);
      let prev = null;
      tl.forEach((b) => { b.sc = SC.normalizeScene(b.scene, b.text, b.step, prev); prev = b.sc; });
      if (VTS.comedy && this.o.comedy !== false) VTS.comedy.setupCast(this, tl);
      // Shots: runs of beats that share a setting (and cast). Transitions happen between shots.
      this.shots = [];
      tl.forEach((b, i) => {
        const last = this.shots[this.shots.length - 1];
        if (last && last.setting === b.sc.setting && last.count === b.sc.count && !(b.aiImage && tl[last.first].aiImage !== b.aiImage)) { last.last = i; last.end = b.end; }
        else this.shots.push({ first: i, last: i, start: b.start, end: b.end, setting: b.sc.setting, count: b.sc.count, idx: this.shots.length });
        b.shot = this.shots.length - 1;
      });
      this.shots.forEach((sh, k) => { sh.transition = SC.TRANSITIONS[(k + 1) % SC.TRANSITIONS.length]; if (k === 0) sh.start = Math.min(sh.start, 0); });
      tl.forEach((b, i) => {
        const sh = this.shots[b.shot];
        let j = i; while (j > sh.first && tl[j - 1].sc.pose === b.sc.pose) j--; b.poseStart = j === sh.first ? sh.start : tl[j].start;
        b.propStart = {};
        b.sc.props.forEach((p) => { let q = i; while (q > sh.first && tl[q - 1].sc.props.includes(p)) q--; b.propStart[p] = tl[q].start; });
      });
      // Pre-draw every background once so transitions never stall a real-time render.
      const seen = new Set();
      tl.forEach((b) => { const k = b.sc.setting + '|' + this.stage.kindFor(b.sc.setting, b.sc.pose); if (seen.has(k) || seen.size >= 9) return; seen.add(k); this.stage.drawShot(makeCanvas(8, 8).getContext('2d'), this.shotState(tl.indexOf(b), b.start)); });
      this.stage.drawShot(makeCanvas(8, 8).getContext('2d'), this.shotState(0, 0));
    }
    // Decode AI illustrations (if any) before rendering.
    async prepare() {
      if (this.scenes && VTS.scenes.preload) { try { await VTS.scenes.preload(this.timeline.map((b) => b.sc)); } catch (_) { /* icons are optional */ } }
      if (!this.scenes || !this.o.aiImages) return 0;
      const cache = new Map(); let n = 0;
      for (let i = 0; i < this.timeline.length; i++) {
        const blob = this.timeline[i].aiImage; if (!blob) continue;
        try { if (!cache.has(blob)) cache.set(blob, await createImageBitmap(blob)); this.images[i] = cache.get(blob); n++; } catch (_) { /* skip */ }
      }
      // every beat in a shot uses the shot's illustration
      if (n) this.shots.forEach((sh) => { let img = null; for (let i = sh.first; i <= sh.last; i++) if (this.images[i]) { img = this.images[i]; break; } if (img) for (let i = sh.first; i <= sh.last; i++) if (!this.images[i]) this.images[i] = img; });
      return n;
    }
    shotState(i, t) {
      const b = this.timeline[i]; const sh = this.shots[b.shot];
      return { scene: b.sc, lt: Math.max(0, t - sh.start), t, dur: sh.end - sh.start, s: this.s * (this.LY.card ? this.LY.card.k : 1), img: this.images[i] || null,
        propAge: (n) => t - (b.propStart[n] != null ? b.propStart[n] : b.start), poseAge: t - b.poseStart, calloutAge: t - b.start };
    }
    drawScenes(t) {
      const ctx = this.ctx; const tl = this.timeline; if (!tl.length) return;
      const i = Math.max(0, this.beatAt(t)); const sh = this.shots[tl[i].shot];
      const TR = this.trDur || 0.42; const st = this.stage; const c = this.LY.card;
      if (c) { // backdrop + card frame for landscape / square / 4:5
        this.drawBackground(t, 0);
        ctx.save(); ctx.setTransform(this.s, 0, 0, this.s, 0, 0);
        if (c.edge === 'round') { ctx.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(ctx, c.x + 8, c.y + 14, c.w, c.h, 40); ctx.fill(); }
        ctx.restore();
      }
      ctx.save(); ctx.setTransform(this.s, 0, 0, this.s, 0, 0);
      if (c) {
        if (c.edge === 'round') roundRect(ctx, c.x, c.y, c.w, c.h, 40); else { ctx.beginPath(); ctx.rect(c.x, c.y, c.w, c.h); }
        ctx.clip(); ctx.translate(c.x, c.y); ctx.scale(c.k, c.k); ctx.translate(0, -c.cropY);
      }
      const since = t - sh.start;
      if (sh.idx > 0 && since < TR) {
        const p = VTS.scenes.easeInOut(since / TR); const prevI = sh.first - 1; const type = sh.transition; const hi = this.preset.hi;
        const drawOld = () => st.drawShot(ctx, this.shotState(prevI, t));
        const drawNew = () => st.drawShot(ctx, this.shotState(i, t));
        if (type === 'whip') { // v1.5: fast whip pan with motion smear
          const q = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; const dir = sh.idx % 2 ? 1 : -1;
          ctx.save(); ctx.translate(dir * W * 1.1 * q, 0); drawOld(); ctx.restore();
          ctx.save(); ctx.translate(-dir * W * 1.1 * (1 - q), 0); drawNew(); ctx.restore();
          const sm = Math.sin(p * Math.PI); ctx.save(); ctx.globalAlpha = 0.55 * sm; ctx.fillStyle = '#ffffff'; for (let k = 0; k < 18; k++) { const y = ((k * 137 + sh.idx * 61) % 19) / 19 * H; ctx.fillRect(0, y, W, 6 + (k % 4) * 9); } ctx.restore();
        } else if (type === 'glitch') { // v1.5: digital glitch cut
          if (p < 0.5) drawOld(); else drawNew();
          const g = 1 - Math.abs(p - 0.5) * 2; const cv = this.canvas; const ps = cv.width / W;
          if (g > 0.05) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); const n = 9; for (let k = 0; k < n; k++) { const hsh = Math.abs(Math.sin((k + 1) * 91.7 + Math.floor(p * 14) * 13.1)); const y = Math.floor(hsh * cv.height * 0.92); const h = Math.max(4, Math.floor((0.02 + hsh * 0.06) * cv.height)); const dx = (hsh - 0.5) * 160 * ps * g; try { ctx.drawImage(cv, 0, y, cv.width, h, dx, y, cv.width, h); } catch (_) { /* ignore */ } ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = k % 2 ? 'rgba(255,0,90,' + (0.22 * g) + ')' : 'rgba(0,220,255,' + (0.22 * g) + ')'; ctx.fillRect(0, y, cv.width, h); ctx.globalCompositeOperation = 'source-over'; } ctx.restore(); }
        } else if (type === 'slide') {
          ctx.save(); ctx.translate(-W * p, 0); drawOld(); ctx.restore();
          ctx.save(); ctx.translate(W * (1 - p), 0); drawNew(); ctx.restore();
          ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(W * (1 - p) - 18, 0, 18, H);
        } else if (type === 'zoom') {
          if (p < 0.5) { const z = 1 + p * 0.8; ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); drawOld(); ctx.restore(); }
          else { const z = 1.25 - (p - 0.5) * 0.5; ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); drawNew(); ctx.restore(); }
          ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * (1 - Math.abs(p - 0.5) * 2)) + ')'; ctx.fillRect(0, 0, W, H);
        } else if (type === 'wipe') {
          drawOld(); const x = -300 + p * (W + 600);
          ctx.save(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(x + 300, 0); ctx.lineTo(x - 300, H); ctx.lineTo(0, H); ctx.closePath(); ctx.clip(); drawNew(); ctx.restore();
          ctx.strokeStyle = hi; ctx.lineWidth = 26; ctx.beginPath(); ctx.moveTo(x + 300, 0); ctx.lineTo(x - 300, H); ctx.stroke();
        } else { // pop: iris
          drawOld(); const r = easeOutBack(p) * 1300;
          ctx.save(); ctx.beginPath(); ctx.arc(W / 2, 1050, Math.max(1, r), 0, 6.2832); ctx.clip(); drawNew(); ctx.restore();
          ctx.strokeStyle = hi; ctx.lineWidth = 22; ctx.beginPath(); ctx.arc(W / 2, 1050, Math.max(1, r), 0, 6.2832); ctx.stroke();
        }
      } else st.drawShot(ctx, this.shotState(i, t));
      // soft band behind the captions for readability
      if (this.LY.band) { const g = ctx.createLinearGradient(0, 300, 0, 740); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.26)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 300, W, 440); }
      ctx.restore();
      if (c) {
        ctx.save(); ctx.setTransform(this.s, 0, 0, this.s, 0, 0);
        if (c.edge === 'right') { const g = ctx.createLinearGradient(c.x + c.w - 70, 0, c.x + c.w + 40, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.64, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(c.x + c.w - 70, 0, 110, this.DH); ctx.fillStyle = hexA(this.preset.hi, 0.9); ctx.fillRect(c.x + c.w - 4, 0, 8, this.DH); }
        else { roundRect(ctx, c.x, c.y, c.w, c.h, 40); ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke(); }
        ctx.restore();
      }
    }
    drawSceneStep(t) {
      const i = this.beatAt(t); if (i < 0) return;
      const beat = this.timeline[i]; const step = beat.step; const ctx = this.ctx; const s = this.s; const p = this.preset;
      const stepLab = this.o.stepLabel == null ? 'STEP' : String(this.o.stepLabel);
      if (step >= 1 && step <= 3 && stepLab) {
        let first = i; while (first > 0 && this.timeline[first - 1].step === step) first--;
        let last = i; while (last < this.timeline.length - 1 && this.timeline[last + 1].step === step) last++;
        const a = easeOutBack(clamp01((t - this.timeline[first].start) / 0.45)); const out = clamp01((this.timeline[last].end - t) / 0.25);
        ctx.save(); ctx.globalAlpha = out; ctx.translate(this.LY.step[0] * s, this.LY.step[1] * s); ctx.scale(0.4 + 0.6 * a, 0.4 + 0.6 * a);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '800 ' + (40 * s) + 'px ' + FONT; const label = stepLab + ' ' + step + ' OF 3'; const lw = ctx.measureText(label).width + 150 * s;
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(ctx, -lw / 2, -40 * s, lw, 80 * s, 40 * s); ctx.fill();
        ctx.beginPath(); ctx.arc(-lw / 2 + 40 * s, 0, 32 * s, 0, 6.2832); ctx.fillStyle = p.hi; ctx.fill();
        ctx.fillStyle = '#111'; ctx.font = '900 ' + (40 * s) + 'px ' + FONT; ctx.fillText(String(step), -lw / 2 + 40 * s, 2 * s);
        ctx.fillStyle = '#fff'; ctx.font = '800 ' + (40 * s) + 'px ' + FONT; ctx.fillText(label, 34 * s, 2 * s);
        ctx.restore();
      } else if (step === 0 && beat.section) { // long videos: chapter badge at the start of each section
        let first = i; while (first > 0 && this.timeline[first - 1].section === beat.section) first--;
        const ch = this.timeline[first].chapter; const since = t - this.timeline[first].start;
        if (ch && since < 3.2) {
          const a = easeOutBack(clamp01(since / 0.45)); const out = clamp01((3.2 - since) / 0.3);
          ctx.save(); ctx.globalAlpha = out; ctx.translate(this.LY.step[0] * s, this.LY.step[1] * s); ctx.scale(0.4 + 0.6 * a, 0.4 + 0.6 * a); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = '800 ' + (40 * s) + 'px ' + FONT; const label = ('Part ' + (beat.section + 1) + ' · ' + ch).toUpperCase(); const lw = Math.min(ctx.measureText(label).width + 90 * s, (this.LY.aspect === '16:9' ? 780 : 1000) * s);
          ctx.fillStyle = 'rgba(0,0,0,0.5)'; roundRect(ctx, -lw / 2, -40 * s, lw, 80 * s, 40 * s); ctx.fill(); ctx.strokeStyle = p.hi; ctx.lineWidth = 4 * s; ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.fillText(label, 0, 2 * s, lw - 60 * s); ctx.restore();
        }
      } else if (step === 4 && this.o.handle) {
        let first = i; while (first > 0 && this.timeline[first - 1].step === 4) first--;
        const a = easeOutBack(clamp01((t - this.timeline[first].start) / 0.4));
        ctx.save(); ctx.translate(this.LY.cta[0] * s, this.LY.cta[1] * s); ctx.scale(a, a); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '800 ' + (46 * s) + 'px ' + FONT; const txt = 'Follow ' + this.o.handle; const tw = ctx.measureText(txt).width + 80 * s;
        ctx.fillStyle = p.hi; roundRect(ctx, -tw / 2, -45 * s, tw, 90 * s, 45 * s); ctx.fill(); ctx.fillStyle = '#111'; ctx.fillText(txt, 0, 2 * s); ctx.restore();
      }
    }
    beatAt(t) {
      const tl = this.timeline; if (!tl.length) return -1;
      if (t < tl[0].start) return 0;
      for (let i = tl.length - 1; i >= 0; i--) if (t >= tl[i].start) return i;
      return 0;
    }
    drawBackground(t, pulse) {
      const p = this.preset; const b = this.bg.getContext('2d'); const w = this.bgW; const h = this.bgH;
      b.globalCompositeOperation = 'source-over'; b.globalAlpha = 1;
      b.fillStyle = p.bg; b.fillRect(0, 0, w, h);
      b.globalCompositeOperation = 'screen';
      p.blobs.forEach((col, i) => {
        const sp = 0.06 + i * 0.023; const ph = i * 1.9;
        const x = w * (0.5 + 0.42 * Math.sin(t * sp * 2.2 + ph));
        const y = h * (0.5 + 0.40 * Math.cos(t * sp * 1.7 + ph * 1.3));
        const r = h * (0.42 + 0.12 * Math.sin(t * 0.21 + i));
        const g = b.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, hexA(col, 0.85)); g.addColorStop(0.55, hexA(col, 0.28)); g.addColorStop(1, hexA(col, 0));
        b.fillStyle = g; b.fillRect(0, 0, w, h);
      });
      // Soft light sweep.
      const sx = w * (0.5 + 0.5 * Math.sin(t * 0.15));
      const lg = b.createLinearGradient(sx - w * 0.6, 0, sx + w * 0.6, h);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.06)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      b.fillStyle = lg; b.fillRect(0, 0, w, h);
      // Grade: filter + split tone + lift.
      const gctx = this.graded.getContext('2d');
      gctx.globalCompositeOperation = 'source-over'; gctx.globalAlpha = 1;
      gctx.filter = p.filter || 'none';
      gctx.drawImage(this.bg, 0, 0);
      gctx.filter = 'none';
      gctx.globalCompositeOperation = 'soft-light'; gctx.globalAlpha = p.shadowAmt; gctx.fillStyle = p.shadowTint; gctx.fillRect(0, 0, w, h);
      gctx.globalCompositeOperation = 'screen'; gctx.globalAlpha = p.highAmt; gctx.fillStyle = p.highTint; gctx.fillRect(0, 0, w, h);
      if (p.lift) { gctx.globalCompositeOperation = 'lighten'; gctx.globalAlpha = 1; gctx.fillStyle = 'rgba(40,40,40,' + (p.lift * 4) + ')'; gctx.fillRect(0, 0, w, h); }
      gctx.globalCompositeOperation = 'source-over'; gctx.globalAlpha = 1;
      const ctx = this.ctx; const cw = this.canvas.width; const ch = this.canvas.height;
      const z = 1.02 + 0.03 * pulse + 0.01 * Math.sin(t * 0.3);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
      ctx.drawImage(this.graded, (cw - cw * z) / 2, (ch - ch * z) / 2, cw * z, ch * z);
    }
    drawParticles(t) {
      const ctx = this.ctx; const s = this.s; const p = this.preset;
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      for (const q of this.particles) {
        const y = ((q.y - t * q.sp * q.z) % 1 + 1) % 1;
        const x = q.x + 0.02 * Math.sin(t * 0.5 + q.ph);
        const a = (0.10 + 0.18 * (0.5 + 0.5 * Math.sin(t * 1.3 + q.ph))) * q.z;
        const r = q.rad * q.z * s;
        const px = x * this.DW * s; const py = y * this.DH * s;
        const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2.5);
        g.addColorStop(0, hexA(p.particles, a)); g.addColorStop(1, hexA(p.particles, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r * 2.5, 0, 6.2832); ctx.fill();
      }
      ctx.restore();
    }
    layout(i) {
      if (this.layoutCache.has(i)) return this.layoutCache.get(i);
      const beat = this.timeline[i]; const ctx = this.ctx; const s = this.s;
      const upper = this.o.captionCase === 'upper';
      const words = beat.words.map((w) => (upper ? w.toUpperCase() : w));
      const cap = this.LY.cap; const maxW = cap.maxW * s;
      let size = (words.join(' ').length > 22 ? 104 : 122) * s * (this.scenes ? 0.9 : 1) * cap.size;
      let lines;
      for (let tries = 0; tries < 6; tries++) {
        ctx.font = '800 ' + size + 'px ' + FONT;
        const space = ctx.measureText(' ').width;
        lines = []; let cur = []; let curW = 0;
        words.forEach((w, wi) => {
          const ww = ctx.measureText(w).width;
          if (cur.length && curW + space + ww > maxW) { lines.push({ items: cur, width: curW }); cur = []; curW = 0; }
          cur.push({ w, ww, wi }); curW += (cur.length > 1 ? space : 0) + ww;
        });
        if (cur.length) lines.push({ items: cur, width: curW });
        const widest = Math.max.apply(null, lines.map((l) => l.width));
        if (lines.length <= cap.lines && widest <= maxW) break;
        size *= 0.88;
      }
      ctx.font = '800 ' + size + 'px ' + FONT;
      const space = ctx.measureText(' ').width;
      const lh = size * 1.14;
      const cy = cap.cy * s; const top = cy - (lines.length * lh) / 2 + lh / 2;
      const pos = [];
      lines.forEach((l, li) => {
        let x = cap.cx * s - l.width / 2;
        l.items.forEach((it) => { pos[it.wi] = { x: x + it.ww / 2, y: top + li * lh, w: it.w, ww: it.ww }; x += it.ww + space; });
      });
      const out = { size, pos, lh };
      this.layoutCache.set(i, out);
      return out;
    }
    drawCaptions(t) {
      const i = this.beatAt(t); if (i < 0) return;
      const beat = this.timeline[i]; const L = this.layout(i); const ctx = this.ctx; const s = this.s; const p = this.preset;
      const since = t - beat.start;
      const enter = easeOut(clamp01(since / 0.18));
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.35 + 0.65 * enter;
      const dy = (1 - enter) * 26 * s;
      let active = 0;
      beat.wordTimes.forEach((wt, wi) => { if (t >= wt) active = wi; });
      beat.words.forEach((raw, wi) => {
        const pos = L.pos[wi]; if (!pos) return;
        const wt = beat.wordTimes[wi];
        const shown = this.o.captionStyle === 'karaoke' ? true : t >= wt - 0.02 || t < beat.start;
        if (!shown) { // ghost of the upcoming word keeps the phrase centred
          ctx.save(); ctx.globalAlpha *= 0.16; ctx.font = '800 ' + L.size + 'px ' + FONT; ctx.fillStyle = '#ffffff';
          ctx.fillText(pos.w, pos.x, pos.y + dy); ctx.restore(); return;
        }
        const pop = this.o.captionStyle === 'karaoke' ? 1 : easeOutBack(clamp01((t - wt + 0.02) / 0.16));
        const isActive = wi === active && t >= beat.start;
        const isEmph = beat.emphasis && raw.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === beat.emphasis;
        const sc = (0.7 + 0.3 * Math.min(pop, 1.2)) * (isActive ? 1.06 : 1);
        ctx.save();
        ctx.translate(pos.x, pos.y + dy);
        ctx.scale(sc, sc);
        ctx.font = '800 ' + L.size + 'px ' + FONT;
        ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 22 * s; ctx.shadowOffsetY = 6 * s;
        ctx.lineWidth = L.size * 0.13; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.strokeText(pos.w, 0, 0);
        ctx.shadowColor = 'transparent';
        let fill = p.text;
        if (this.o.captionStyle === 'karaoke' && t < wt) fill = hexA('#ffffff', 0.38);
        if (isActive || isEmph) fill = p.hi;
        ctx.fillStyle = fill;
        ctx.fillText(pos.w, 0, 0);
        if (isActive) { // underline swoosh
          ctx.fillStyle = hexA(p.hi, 0.9);
          const uw = pos.ww * clamp01((t - wt) / 0.22);
          ctx.fillRect(-pos.ww / 2, L.size * 0.52, uw, L.size * 0.07);
        }
        ctx.restore();
      });
      ctx.restore();
    }
    drawStep(t) {
      const i = this.beatAt(t); if (i < 0) return;
      const beat = this.timeline[i]; const step = beat.step;
      const ctx = this.ctx; const s = this.s; const p = this.preset;
      if (step >= 1 && step <= 3) {
        let first = i; while (first > 0 && this.timeline[first - 1].step === step) first--;
        let last = i; while (last < this.timeline.length - 1 && this.timeline[last + 1].step === step) last++;
        const st = this.timeline[first].start; const en = this.timeline[last].end;
        const a = easeOutBack(clamp01((t - st) / 0.45));
        const out = clamp01((en - t) / 0.25);
        ctx.save();
        ctx.globalAlpha = clamp01(a) * out;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        // label
        ctx.font = '800 ' + (40 * s) + 'px ' + FONT;
        const label = (this.o.stepLabel == null ? 'STEP' : String(this.o.stepLabel) || 'PART') + ' ' + step + ' / 3';
        const lw = ctx.measureText(label).width + 64 * s;
        const cyk = this.LY.classicY; const cx = this.LY.cap.cx * s; const ly = (this.DW > this.DH ? 170 : 360 * cyk) * s;
        ctx.fillStyle = hexA('#000000', 0.32);
        roundRect(ctx, cx - lw / 2, ly - 34 * s, lw, 68 * s, 34 * s); ctx.fill();
        ctx.strokeStyle = hexA(p.hi, 0.7); ctx.lineWidth = 3 * s; ctx.stroke();
        ctx.fillStyle = p.hi; ctx.fillText(label.split('').join(String.fromCharCode(8202)), cx, ly + 2 * s);
        // big number
        ctx.translate(cx, (this.DW > this.DH ? 330 : 640 * cyk) * s);
        const sc = (0.6 + 0.4 * a) * (this.DW > this.DH ? 0.55 : Math.min(1, cyk * 1.25)); ctx.scale(sc, sc);
        ctx.font = '900 ' + (400 * s) + 'px ' + FONT;
        ctx.shadowColor = hexA(p.hi, 0.55); ctx.shadowBlur = 60 * s;
        const g = ctx.createLinearGradient(0, -200 * s, 0, 200 * s);
        g.addColorStop(0, '#ffffff'); g.addColorStop(1, p.hi);
        ctx.fillStyle = g; ctx.fillText(String(step), 0, 0);
        ctx.shadowColor = 'transparent';
        ctx.restore();
        // step dots
        ctx.save(); ctx.globalAlpha = out;
        for (let d = 1; d <= 3; d++) {
          ctx.beginPath(); ctx.arc(this.LY.cap.cx * s + (d - 2) * 40 * s, (this.DW > this.DH ? 820 : 1450 * this.LY.classicY) * s, (d === step ? 11 : 7) * s, 0, 6.2832);
          ctx.fillStyle = d <= step ? p.hi : hexA('#ffffff', 0.35); ctx.fill();
        }
        ctx.restore();
      } else if (step === 4 && this.o.handle) {
        let first = i; while (first > 0 && this.timeline[first - 1].step === 4) first--;
        const a = easeOut(clamp01((t - this.timeline[first].start) / 0.4));
        ctx.save(); ctx.globalAlpha = a;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '700 ' + (46 * s) + 'px ' + FONT;
        const txt = 'Follow ' + this.o.handle;
        const tw = ctx.measureText(txt).width + 80 * s;
        const cy2 = this.LY.cta[1] * s; const cx2 = this.LY.cta[0] * s;
        ctx.fillStyle = p.hi; roundRect(ctx, cx2 - tw / 2, cy2 - 45 * s, tw, 90 * s, 45 * s); ctx.fill();
        ctx.fillStyle = '#111'; ctx.fillText(txt, cx2, cy2 + 2 * s);
        ctx.restore();
      }
    }
    drawWatermark() {
      if (!this.o.watermark || !this.o.handle) return;
      const ctx = this.ctx; const s = this.s;
      ctx.save(); ctx.globalAlpha = 0.72; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '700 ' + (36 * s) + 'px ' + FONT;
      ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 10 * s;
      ctx.fillStyle = '#ffffff'; ctx.fillText(this.o.handle, this.LY.wm[0] * s, (this.LY.wm[1] - (this.LY.aspect === '9:16' ? 0 : 12)) * s);
      ctx.restore();
    }
    drawFinish(t) {
      const ctx = this.ctx; const p = this.preset; const cw = this.canvas.width;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.finish[Math.floor(t * 24) % this.finish.length], 0, 0, cw, this.canvas.height);
      if (this.o.progress) {
        const d = this.o.duration || 1;
        ctx.fillStyle = hexA(p.hi, 0.85); ctx.fillRect(0, 0, cw * clamp01(t / d), 8 * this.s);
      }
    }
    drawProbe(t) { // test-only A/V sync marker: white square while a probe beep plays
      if (!this.probe) return; const on = this.probe.some((p) => t >= p && t < p + 0.1);
      this.ctx.fillStyle = on ? '#ffffff' : '#000000'; this.ctx.fillRect(0, 0, 48 * this.s, 48 * this.s);
    }
    draw(t) {
      if (this.scenes) {
        this.drawScenes(t); this.drawSceneStep(t); this.drawCaptions(t); this.drawWatermark(); this.drawFinish(t); this.drawProbe(t);
        return;
      }
      const i = this.beatAt(t);
      let pulse = 0;
      if (i >= 0) { const st = this.timeline[i].start; const prevStep = i > 0 ? this.timeline[i - 1].step : -1; if (this.timeline[i].step !== prevStep) pulse = Math.exp(-Math.max(0, t - st) * 4); }
      this.drawBackground(t, pulse);
      this.drawParticles(t);
      this.drawStep(t);
      this.drawCaptions(t);
      this.drawWatermark();
      this.drawFinish(t);
      this.drawProbe(t);
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- audio helpers ----------
  let sharedCtx = null;
  function audioCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new AC();
    return sharedCtx;
  }
  async function decodeBlob(blob) {
    const buf = await blob.arrayBuffer();
    const ac = audioCtx();
    return await new Promise((resolve, reject) => {
      const p = ac.decodeAudioData(buf, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    });
  }
  function silentBuffer(seconds) {
    const ac = audioCtx();
    return ac.createBuffer(1, Math.max(1, Math.round(ac.sampleRate * seconds)), ac.sampleRate);
  }
  // Where speech starts/ends (RMS threshold), so captions line up with the voice.
  function speechBounds(buf) {
    const ch = buf.getChannelData(0); const sr = buf.sampleRate; const win = Math.max(1, Math.floor(sr * 0.02));
    const rms = [];
    let peak = 0;
    for (let i = 0; i < ch.length; i += win) {
      let sum = 0; const n = Math.min(win, ch.length - i);
      for (let j = 0; j < n; j++) sum += ch[i + j] * ch[i + j];
      const r = Math.sqrt(sum / n); rms.push(r); if (r > peak) peak = r;
    }
    if (peak < 0.003) return { start: 0, end: buf.duration, silent: true };
    const thr = Math.max(peak * 0.08, 0.004);
    let a = rms.findIndex((r) => r > thr); let b = rms.length - 1; while (b > 0 && rms[b] <= thr) b--;
    if (a < 0) a = 0;
    return { start: Math.max(0, a * win / sr - 0.05), end: Math.min(buf.duration, (b + 1) * win / sr + 0.12), silent: false };
  }
  // Trim long silences at start/end (keeps 0.12 s padding) and cap the length.
  function trimBuffer(buf, maxSeconds) {
    const b = speechBounds(buf);
    let start = b.silent ? 0 : Math.max(0, b.start - 0.07);
    let end = b.silent ? buf.duration : Math.min(buf.duration, b.end + 0.15);
    if (end - start > maxSeconds) end = start + maxSeconds;
    const ac = audioCtx();
    const len = Math.max(1, Math.floor((end - start) * buf.sampleRate));
    const out = ac.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(Math.floor(start * buf.sampleRate), Math.floor(start * buf.sampleRate) + len), c);
    return out;
  }

  // H.264 MP4 first (AAC audio where the encoder exists — Android usually has it; desktop Linux Chrome only has Opus),
  // then WebM (VP9/VP8), which YouTube also accepts. A bare 'video/mp4' (may be VP9-in-MP4) is the last resort.
  const VIDEO_TYPES = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.4D0028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4;codecs=avc1,opus', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  function pickVideoType(pref) {
    if (typeof MediaRecorder === 'undefined') return '';
    const list = pref === 'webm' ? VIDEO_TYPES.filter((t) => t.startsWith('video/webm')).concat(VIDEO_TYPES) : VIDEO_TYPES;
    return list.find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch (_) { return false; } }) || '';
  }
  function canRender() {
    const c = document.createElement('canvas');
    return typeof MediaRecorder !== 'undefined' && typeof c.captureStream === 'function' && !!(window.AudioContext || window.webkitAudioContext);
  }
  function plan(buf, maxSeconds) {
    const audioDur = Math.min(buf.duration, Math.min(maxSeconds || MAX_SECONDS, MAX_LONG) - LEAD - TAIL);
    const b = speechBounds(buf);
    // speech: loudness profile of this exact decoded voice, so captions follow the audio (not a words-per-minute guess)
    return { audioDur, total: LEAD + audioDur + TAIL, speechStart: LEAD + Math.min(b.start, audioDur), speechEnd: LEAD + Math.min(b.end, audioDur), speech: speechProfile(buf, LEAD) };
  }

  // Real-time render: canvas stream + voice track -> MediaRecorder.
  async function renderVideo(opts) {
    const { canvas, buffer, onProgress } = opts;
    if (!canRender()) throw new Error('This browser cannot record canvas video (needs MediaRecorder + canvas.captureStream).');
    const mime = pickVideoType(opts.format);
    const P = plan(buffer, opts.maxSeconds);
    const r = new Renderer(canvas); r.realtime = true;
    try { await document.fonts.load('800 100px Montserrat'); await document.fonts.load('900 100px Montserrat'); } catch (_) { /* ignore */ }
    r.setup(Object.assign({}, opts.look, { beats: opts.beats, speechStart: P.speechStart, speechEnd: P.speechEnd, duration: P.total, sections: opts.sections, speech: P.speech }));
    if (opts.probe) r.probe = opts.probe;
    if (VTS.motion) { try { r.env = VTS.motion.envelopeFromBuffer(buffer); } catch (_) { r.env = null; } }
    const illustrated = await r.prepare();
    r.draw(0);
    const ac = audioCtx();
    if (ac.state === 'suspended') await ac.resume();
    const dest = ac.createMediaStreamDestination();
    // v1.4: music + sound effects are pre-mixed around the voice (the voice itself is never turned down)
    let mixed = null;
    if (VTS.audiofx && r.cx && opts.look && (opts.look.sfx !== false || (opts.look.music && opts.look.music !== 'none'))) {
      try { mixed = await VTS.audiofx.mix(buffer, { total: P.total, lead: LEAD, audioDur: P.audioDur, cues: opts.look.sfx === false ? [] : r.cx.cues, music: opts.look.music || 'none', musicVol: opts.look.musicVol, sfxVol: opts.look.sfxVol, voiceVol: opts.look.voiceVol }); } catch (e) { mixed = null; }
    }
    const src = ac.createBufferSource(); src.buffer = mixed || buffer;
    const gain = ac.createGain(); gain.gain.value = 1;
    src.connect(gain); gain.connect(dest);
    let monitor = null;
    if (opts.monitor) { monitor = ac.createGain(); monitor.gain.value = 0.9; gain.connect(monitor); monitor.connect(ac.destination); }
    const vstream = canvas.captureStream(30);
    const stream = new MediaStream([].concat(vstream.getVideoTracks(), dest.stream.getAudioTracks()));
    const recOpts = { videoBitsPerSecond: opts.bitrate || 12000000, audioBitsPerSecond: 192000 };
    if (mime) recOpts.mimeType = mime;
    const rec = new MediaRecorder(stream, recOpts);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((resolve, reject) => { rec.onstop = resolve; rec.onerror = (e) => reject(e.error || new Error('Recorder error')); });
    rec.start(1000);
    const startAt = ac.currentTime + 0.12;
    if (mixed) src.start(startAt, 0, P.total); else src.start(startAt + LEAD, 0, P.audioDur);
    let cancelled = false; let raf = 0; let timer = 0; let lastDraw = -1; let frames = 0; let drawMs = 0; let maxDraw = 0;
    const done = new Promise((resolve) => {
      const tick = () => {
        if (opts.signal && opts.signal.aborted) { cancelled = true; resolve(); return; }
        const t = Math.max(0, ac.currentTime - startAt);
        if (t - lastDraw >= 1 / 31 || t >= P.total) { const d0 = performance.now(); r.draw(t); const dd = performance.now() - d0; drawMs += dd; if (dd > maxDraw) maxDraw = dd; lastDraw = t; frames++; }
        if (onProgress) onProgress(Math.min(1, t / P.total), t, P.total);
        if (t >= P.total) { resolve(); return; }
        // rAF pauses when the screen is off / tab hidden; setTimeout keeps going (slower) as a backup.
        if (document.visibilityState === 'visible') raf = requestAnimationFrame(tick); else timer = setTimeout(tick, 33);
      };
      tick();
    });
    await done;
    cancelAnimationFrame(raf); clearTimeout(timer);
    try { src.stop(); } catch (_) { /* ignore */ }
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    vstream.getTracks().forEach((tr) => tr.stop());
    try { gain.disconnect(); if (monitor) monitor.disconnect(); } catch (_) { /* ignore */ }
    if (cancelled) return null;
    const type = (rec.mimeType || mime || 'video/webm').split(';')[0];
    let out = new Blob(chunks, { type });
    if (/webm/.test(type)) out = await fixWebmDuration(out, P.total);
    return { blob: out, mime: rec.mimeType || mime, type, duration: P.total, audioMix: mixed ? mixed.vtsInfo : null, cues: r.cx ? r.cx.cues.length : 0, cuts: r.cx ? r.cx.cuts.length : 0, width: canvas.width, height: canvas.height, frames, fps: frames / P.total, avgDrawMs: frames ? drawMs / frames : 0, maxDrawMs: maxDraw, illustrated, scenes: r.scenes };
  }

  // MediaRecorder WebM files have no Duration, so players can't seek and some apps show 0:00. Insert one into Segment > Info.
  function readVint(b, i, keepMarker) {
    const first = b[i]; let len = 1; let mask = 0x80;
    while (len <= 8 && !(first & mask)) { len++; mask >>= 1; }
    if (len > 8) return null;
    let v = keepMarker ? first : first & (mask - 1); let allOnes = (first & (mask - 1)) === mask - 1;
    for (let k = 1; k < len; k++) { v = v * 256 + b[i + k]; if (b[i + k] !== 255) allOnes = false; }
    return { v, len, unknown: !keepMarker && allOnes };
  }
  async function fixWebmDuration(blob, seconds) {
    try {
      const head = new Uint8Array(await blob.slice(0, Math.min(blob.size, 1 << 16)).arrayBuffer());
      let i = 0;
      const ebmlId = readVint(head, 0, true); if (!ebmlId || ebmlId.v !== 0x1A45DFA3) return blob;
      const ebmlSize = readVint(head, 4); i = 4 + ebmlSize.len + ebmlSize.v;
      const segId = readVint(head, i, true); if (!segId || segId.v !== 0x18538067) return blob;
      const segSize = readVint(head, i + 4); i = i + 4 + segSize.len;
      while (i < head.length - 12) {
        const id = readVint(head, i, true); const size = readVint(head, i + id.len);
        if (!id || !size) return blob;
        const dataStart = i + id.len + size.len;
        if (id.v === 0x1549A966) { // Info
          const end = dataStart + size.v; if (end > head.length) return blob;
          let scale = 1000000; let j = dataStart;
          while (j < end) {
            const cid = readVint(head, j, true); const cs = readVint(head, j + cid.len); const cd = j + cid.len + cs.len;
            if (cid.v === 0x2AD7B1) { scale = 0; for (let k = 0; k < cs.v; k++) scale = scale * 256 + head[cd + k]; }
            if (cid.v === 0x4489) return blob; // already has a duration
            j = cd + cs.v;
          }
          const dur = new Uint8Array(11); dur[0] = 0x44; dur[1] = 0x89; dur[2] = 0x88;
          new DataView(dur.buffer).setFloat64(3, seconds * 1e9 / (scale || 1000000));
          const newSize = size.v + 11; const sz = new Uint8Array(8); sz[0] = 0x01; let n = newSize;
          for (let k = 7; k >= 1; k--) { sz[k] = n & 255; n = Math.floor(n / 256); }
          return new Blob([head.slice(0, i + id.len), sz, head.slice(dataStart, end), dur, blob.slice(end)], { type: blob.type });
        }
        if (id.v === 0x1F43B675 || size.unknown) return blob; // reached a Cluster without finding Info
        i = dataStart + size.v;
      }
    } catch (_) { /* leave the file as-is */ }
    return blob;
  }

  // Live preview synced to audio playback (no recording).
  function preview(opts) {
    const { canvas, buffer } = opts;
    const P = plan(buffer, opts.maxSeconds);
    const r = new Renderer(canvas);
    r.setup(Object.assign({}, opts.look, { beats: opts.beats, speechStart: P.speechStart, speechEnd: P.speechEnd, duration: P.total, sections: opts.sections, speech: P.speech }));
    if (VTS.motion) { try { r.env = VTS.motion.envelopeFromBuffer(buffer); } catch (_) { r.env = null; } }
    const ac = audioCtx();
    let src = null; let raf = 0; let startAt = 0; let playing = false; let mixed = null;
    const api = {
      duration: P.total, renderer: r,
      ready: r.prepare().then(async (n) => {
        const lk = opts.look || {};
        if (VTS.audiofx && r.cx && (lk.sfx !== false || (lk.music && lk.music !== 'none'))) { try { mixed = await VTS.audiofx.mix(buffer, { total: P.total, lead: LEAD, audioDur: P.audioDur, cues: lk.sfx === false ? [] : r.cx.cues, music: lk.music || 'none', musicVol: lk.musicVol, sfxVol: lk.sfxVol, voiceVol: lk.voiceVol }); } catch (_) { mixed = null; } }
        return n;
      }),
      drawAt(t) { r.draw(t); },
      async play(onEnd) {
        if (ac.state === 'suspended') await ac.resume();
        src = ac.createBufferSource(); src.buffer = mixed || buffer; src.connect(ac.destination);
        startAt = ac.currentTime + 0.05; if (mixed) src.start(startAt, 0, P.total); else src.start(startAt + LEAD, 0, P.audioDur); playing = true;
        const tick = () => {
          if (!playing) return;
          const t = Math.max(0, ac.currentTime - startAt);
          r.draw(t);
          if (opts.onTime) opts.onTime(t, P.total);
          if (t >= P.total) { api.stop(); if (onEnd) onEnd(); return; }
          raf = requestAnimationFrame(tick);
        };
        tick();
      },
      stop() { playing = false; cancelAnimationFrame(raf); if (src) { try { src.stop(); } catch (_) { /* ignore */ } src = null; } },
      get playing() { return playing; },
    };
    return api;
  }

  VTS.render = { fixWebmDuration, W, H, PRESETS, MAX_SECONDS, MAX_LONG, ASPECTS, ASPECT_LABELS, frameSize, layoutFor, LEAD, TAIL, Renderer, buildTimeline, decodeBlob, silentBuffer, speechBounds, speechProfile, finishProfile, alignWords, ALIGN, wordLen, trimBuffer, pickVideoType, canRender, renderVideo, preview, plan, audioCtx };
}());
