/* Voice to Short v1.7 — Comic Recap mode.
   The user supplies comic panels; Gemini (vision) narrates the story scene by scene, one block of lines per panel;
   the renderer shows each panel exactly while its lines are spoken, with Ken Burns motion, snappy transitions,
   energy glow, speed lines, impact flashes, comic SFX lettering and "Comic Bold" word-by-word captions.
   Timing comes from the app's voice-locked timeline (render.js buildTimeline: audio loudness/pause alignment),
   so panel cuts, captions, flashes and sound effects all follow the real voice. Additive: other modes are untouched. */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {});
  const FONT = 'Montserrat, "Arial Black", "Roboto", sans-serif';
  const SFX_FONT = 'Bangers, Impact, "Arial Black", ' + FONT;
  const TAU = Math.PI * 2;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
  const easeInOutCubic = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const easeOutBack = (x) => { x = clamp01(x); const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function hexA(hex, a) {
    const h = String(hex || '#39ff7a').replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0;
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

  // ---------------- options ----------------
  const LENGTHS = [{ id: '30', label: '30 s', sec: 30, words: [65, 80] }, { id: '60', label: '60 s', sec: 60, words: [125, 145] }, { id: '90', label: '90 s', sec: 90, words: [190, 215] }];
  const lengthOf = (id) => LENGTHS.find((l) => l.id === String(id)) || LENGTHS[1];
  const COLORS = [['#39ff7a', 'Energy green'], ['#ffd23f', 'Gold'], ['#3fa9ff', 'Electric blue'], ['#ff3b3b', 'Crimson'], ['#b46bff', 'Violet'], ['#ff8a1f', 'Fire orange'], ['#ffffff', 'White']];
  const FIT = [['smart', 'Smart'], ['cover', 'Fill (crop)'], ['fit', 'Whole panel']];
  const TRANS = [['mix', 'Mixed'], ['flash', 'Flash'], ['slide', 'Slide'], ['punch', 'Zoom punch'], ['cut', 'Hard cut']];
  const FX_DEFAULT = { glow: true, color: '#39ff7a', speedLines: true, flashes: true, sfxText: true, shake: true, transitions: 'mix', fit: 'smart' };
  const fxOf = (fx) => Object.assign({}, FX_DEFAULT, fx || {});

  // ---------------- script text: panels -> lines -> caption beats ----------------
  // A line may mark key words with *stars* (yellow in Comic Bold captions). Stars never reach the voice.
  function parseMarked(line) {
    const words = []; const keys = [];
    const segs = String(line || '').replace(/\s+/g, ' ').split(/(\*[^*]+\*)/);
    segs.forEach((seg, si) => {
      if (!seg) return;
      const star = /^\*[^*]+\*$/.test(seg); const prev = si > 0 ? segs[si - 1] : '';
      const glue = words.length > 0 && !/^\s/.test(seg) && prev !== '' && !/\s$/.test(prev); // "*John*'s" -> "John's"
      const ws = seg.replace(/\*/g, '').trim().split(/\s+/).filter(Boolean);
      ws.forEach((w, j) => {
        if (j === 0 && glue) { words[words.length - 1] += w; if (star && !keys.includes(words.length - 1)) keys.push(words.length - 1); return; }
        if (star) keys.push(words.length);
        words.push(w);
      });
    });
    return { text: words.join(' '), words, keys };
  }
  const clean = (line) => parseMarked(line).text;
  // Short caption beats (<= ~7 words) at sentence / comma breaks, so every caption style stays readable.
  function splitLine(words) {
    const out = []; let cur = [];
    words.forEach((w, i) => {
      cur.push(i); const left = words.length - i - 1;
      const end = /[.!?…]["”’)\]]*$/.test(w); const soft = /[,;:—–]["”’)\]]*$/.test(w);
      if (end || (soft && cur.length >= 3 && left >= 2) || (cur.length >= 7 && left > 2) || cur.length >= 9) { out.push(cur); cur = []; }
    });
    if (cur.length) { const prev = out[out.length - 1]; if (cur.length === 1 && prev && prev.length < 7 && !/[.!?…]["”’)\]]*$/.test(words[prev[prev.length - 1]])) prev.push(cur[0]); else out.push(cur); }
    return out;
  }
  // beats carry the panel index (position in `panels`), so the panel-to-line mapping is explicit
  function buildBeats(panels) {
    const beats = [];
    (panels || []).forEach((p, k) => {
      (p && p.lines || []).forEach((ln) => {
        const m = parseMarked(ln); if (!m.words.length) return;
        splitLine(m.words).forEach((idx) => {
          const keys = idx.map((wi, j) => (m.keys.includes(wi) ? j : -1)).filter((j) => j >= 0);
          beats.push({ text: idx.map((wi) => m.words[wi]).join(' '), panel: k, keys: keys.length ? keys : null, weight: idx.length, step: 0 });
        });
      });
    });
    return beats;
  }
  const scriptOf = (panels) => (panels || []).map((p) => (p && p.lines || []).map(clean).filter(Boolean).join(' ')).filter(Boolean).join('\n');
  const wordCount = (t) => (String(t || '').trim().match(/\S+/g) || []).length;
  const normTag = (h) => { const t = String(h || '').trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, ''); return t ? '#' + t : ''; };
  // app package (same shape as a Voice Short package, so publish kit / voice / library keep working)
  function makePkg(panels, meta, old) {
    meta = meta || {}; old = old || {};
    const beats = buildBeats(panels); const script = scriptOf(panels);
    const firstLine = ((panels || []).find((p) => p && (p.lines || []).some((l) => clean(l))) || { lines: [''] }).lines.map(clean).find(Boolean) || '';
    const title = String(meta.title || old.title || firstLine || 'Comic Recap').slice(0, 100);
    const tags = (meta.hashtags || old.hashtags || ['#comics', '#comicbooks', '#comicrecap', '#storytime', '#shorts']).map(normTag).filter(Boolean).slice(0, 8);
    return Object.assign({}, old, {
      comic: true, title, hooks: [firstLine], hookIndex: 0, script, beats,
      description: String(meta.description != null ? meta.description : old.description || (title + '\n\nComic recap — panels from my own collection.')),
      hashtags: tags, pinnedComment: old.pinnedComment || 'Who was really in the right here? 👇', thumbnailText: old.thumbnailText || title.split(/\s+/).slice(0, 6).join(' '),
      textHook: '', cta: '', tiktokCaption: String(meta.tiktokCaption != null ? meta.tiktokCaption : old.tiktokCaption || title), tiktokHashtags: (old.tiktokHashtags && old.tiktokHashtags.length ? old.tiktokHashtags : tags.slice(0, 5)),
    });
  }

  // ---------------- impacts (flash, shake, SFX lettering, sound) ----------------
  const IMPACT = [
    { re: /^(explo\w*|blast\w*|boom\w*|kaboom|detonat\w*|bomb\w*|erupt\w*|nuke\w*)$/, strong: true, texts: ['BOOM!', 'KA-BOOM!'], audio: ['boom'] },
    { re: /^(punch\w*|smash\w*|slam\w*|struck|strikes?|striking|crash\w*|shatter\w*|clash\w*|collid\w*|pummel\w*|wham)$/, strong: true, texts: ['KRAK!', 'WHAM!', 'POW!'], audio: ['punch', 'boom'] },
    { re: /^(scream\w*|roar\w*|shriek\w*|howl\w*)$/, strong: true, texts: ['REEEEE!', 'RAAAH!'], audio: ['riser'] },
    { re: /^(zap\w*|lightning|electrocut\w*)$/, strong: true, texts: ['ZZZRAK!'], audio: ['boom'] },
    { re: /^(hit|hits|kick\w*|crack\w*|broke|break\w*|smack\w*|thrown|throws?|tackl\w*|attack\w*|fight\w*|battle\w*)$/, strong: false, texts: ['KRAK!', 'THWACK!'], audio: ['punch'] },
    { re: /^(shot|shoots?|shooting|fire[sd]?|firing|beam\w*|blaster\w*|surge\w*|ignit\w*|blaz\w*|flare[sd]?|glow\w*|charg\w*)$/, strong: false, texts: ['VMMMM!', 'BZZOW!'], audio: ['riser', 'boom'] },
    { re: /^(fell|falls?|falling|drop\w*|thud|land(ed|s)?|collaps\w*)$/, strong: false, texts: ['THOOM!'], audio: ['boom'] },
    { re: /^(slash\w*|blade\w*|swords?|stab\w*|slice\w*)$/, strong: false, texts: ['SHNK!'], audio: ['whoosh', 'punch'] },
  ];
  const plainWord = (w) => String(w || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  function impactWord(w, weakOk) { const p = plainWord(w); if (!p) return null; for (const m of IMPACT) if ((m.strong || weakOk) && m.re.test(p)) return m; return null; }
  function audioForText(txt, m) {
    const u = String(txt || '').toUpperCase();
    if (/BOOM|KOOM|BLAM|THOOM/.test(u)) return ['boom'];
    if (/KRA|POW|WHAM|THWA|SMA|BAM|CRA|KRK/.test(u)) return ['punch', 'boom'];
    if (/RE+|RAA|AAA/.test(u)) return ['riser'];
    if (/VM+|BZ|ZZ|ZAP|HUM/.test(u)) return ['riser', 'boom'];
    if (/SH+N|SWI|WHO/.test(u)) return ['whoosh', 'punch'];
    return m ? m.audio : ['punch', 'boom'];
  }

  // ---------------- Gemini (vision): story recap, scene by scene ----------------
  const T = { STRING: 'STRING', NUMBER: 'NUMBER', INTEGER: 'INTEGER', ARRAY: 'ARRAY', OBJECT: 'OBJECT', BOOLEAN: 'BOOLEAN' };
  const SCHEMA = { type: T.OBJECT, properties: {
    title: { type: T.STRING, description: 'curiosity title, max 70 characters' },
    hook: { type: T.STRING, description: 'the hook = panels[0].lines[0]' },
    panels: { type: T.ARRAY, items: { type: T.OBJECT, properties: {
      panel: { type: T.INTEGER, description: '1-based panel number' },
      lines: { type: T.ARRAY, items: { type: T.STRING }, description: '1-3 spoken narration lines for THIS panel' },
      focus_x: { type: T.NUMBER }, focus_y: { type: T.NUMBER },
      impact: { type: T.BOOLEAN }, sfx: { type: T.STRING } }, required: ['panel', 'lines'] } },
    description: { type: T.STRING }, hashtags: { type: T.ARRAY, items: { type: T.STRING } }, tiktok_caption: { type: T.STRING } },
    required: ['title', 'panels'] };
  function buildPrompt(n, o) {
    const L = lengthOf(o.length); const [lo, hi] = L.words; const per = Math.max(8, Math.round((lo + hi) / 2 / Math.max(1, n)));
    return [
      'You narrate a viral comic-recap channel on TikTok / YouTube Shorts (the dramatic "comic vault" style).',
      'You get ' + n + ' comic panels IN READING ORDER (PANEL 1 … PANEL ' + n + '). Retell THIS comic\'s story scene by scene, in panel order, as a gripping dramatic story.',
      '',
      'STORY RULES',
      '- Each panel gets its own narration beat: what happens in THAT panel, moving the plot forward. Across the panels the story builds: setup → conflict → twist → payoff.',
      '- The video shows each panel exactly while its lines are spoken, so lines for panel k must be about panel k. Never describe a later panel early; never skip a panel.',
      '- panels[0].lines[0] is the HOOK: one short, punchy line (max 12 words) that makes people need to know what happens — a shocking claim or question about this story. Then go straight into panel 1\'s scene.',
      '- Storytelling first. You may weave in a FEW short narrator reactions ("Big mistake.", "And that changes everything.") — at most one every couple of panels. Do NOT turn it into commentary or an opinion piece.',
      '- Read the text in the panels (caption boxes, speech bubbles, sound effects) to understand who is who and what happens. You may quote one short line of dialogue. Use names from the panels or the notes; otherwise describe characters ("the hooded council", "his old partner").',
      '- LENGTH: this is a ~' + L.sec + ' second video, so the whole narration MUST be ' + lo + '–' + hi + ' words (about ' + per + ' words per panel, usually 2–3 lines per panel). Too short is the most common mistake: give every scene enough story — what happens, who does it, why it matters. Short spoken sentences, vivid verbs, dramatic full stops. Plain spoken text only: no emojis, hashtags, stage directions or speaker labels.',
      '- Wrap 1–2 KEY words per line in *asterisks* (names, the stakes, the twist word) — they are highlighted in yellow in the captions. Never more than 2 per line.',
      '- The last panel lands the payoff in a satisfying final line (optionally followed by a very short "Follow for part two." style line).',
      '- impact: true only when the panel shows a hit, blast, explosion, crash or a huge reveal; then sfx = short comic sound-effect lettering for it ("KRAK!", "BOOM!", "VMMM!"), else sfx = "".',
      '- focus_x / focus_y: where the most important thing in the panel is (0 = left/top, 1 = right/bottom). The camera pans toward it.',
      '- Write the lines in ' + (o.language || 'English') + '.',
      o.title ? '\nTitle / topic from the creator: ' + String(o.title).slice(0, 200) : '',
      o.notes ? 'Creator notes about the story (trust these for names and what happens): ' + String(o.notes).slice(0, 1500) : '',
      '',
      'Return JSON: { "title", "hook", "panels": [ { "panel": 1, "lines": [...], "focus_x", "focus_y", "impact", "sfx" }, … one entry per panel, all ' + n + ' panels ], "description" (2 short sentences), "hashtags" (5), "tiktok_caption" }.',
    ].filter((x) => x !== '').join('\n');
  }
  async function blobToB64(blob) { return await new Promise((ok, bad) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = () => bad(fr.error); fr.readAsDataURL(blob); }); }
  async function toJpeg(src, max, q) {
    const bmp = src instanceof Blob ? await createImageBitmap(src) : src;
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height)); const c = mk(bmp.width * k, bmp.height * k);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
    if (src instanceof Blob && bmp.close) bmp.close();
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', q || 0.85));
    return { blob, w: c.width, h: c.height };
  }
  // gallery / file input -> stored panel (downscaled JPEG; keeps phones' memory and storage small)
  async function importImage(file, max) {
    const r = await toJpeg(file, max || 1600, 0.9);
    return { id: 'pn' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), blob: r.blob, w: r.w, h: r.h, name: String(file && file.name || 'panel').slice(0, 80), lines: [], focus: null, impact: false, sfx: '' };
  }
  function parseJSON(text) {
    const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try { return JSON.parse(raw); } catch (_) { /* keep going */ }
    const s = raw.indexOf('{'); const e = raw.lastIndexOf('}'); if (s >= 0 && e > s) return JSON.parse(raw.slice(s, e + 1));
    throw new Error('not json');
  }
  const cleanLine = (l) => String(l || '').replace(/\s+/g, ' ').replace(/^\s*(narrator|voice ?over|vo)\s*:\s*/i, '').replace(/\[[^\]]*\]|\([^)]*(pause|beat|whisper)[^)]*\)/gi, '').replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim();
  function normalizeScript(data, n) {
    const list = Array.isArray(data && data.panels) ? data.panels : [];
    const byNum = new Map(); list.forEach((p, i) => { const k = Number.isInteger(p && p.panel) && p.panel >= 1 && p.panel <= n && !byNum.has(p.panel - 1) ? p.panel - 1 : i; if (k < n && !byNum.has(k)) byNum.set(k, p); });
    const panels = [];
    for (let k = 0; k < n; k++) {
      const p = byNum.get(k) || {}; let lines = (Array.isArray(p.lines) ? p.lines : typeof p.lines === 'string' ? [p.lines] : []).map(cleanLine).filter(Boolean).slice(0, 4);
      lines = lines.map((l) => { const w = l.split(' '); return w.length > 40 ? w.slice(0, 40).join(' ') : l; });
      const fx = Number(p.focus_x); const fy = Number(p.focus_y);
      panels.push({ lines, focus: isFinite(fx) && isFinite(fy) && fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1 ? { x: fx, y: fy } : null, impact: !!p.impact, sfx: String(p.sfx || '').replace(/[^\p{L}\p{N}!?\-' ]/gu, '').trim().slice(0, 14).toUpperCase() });
    }
    const hook = cleanLine(data && data.hook);
    if (hook && panels[0]) { const first = clean(panels[0].lines[0] || '').toLowerCase(); if (!first || (first.indexOf(clean(hook).toLowerCase().slice(0, 20)) < 0 && clean(hook).toLowerCase().indexOf(first.slice(0, 20)) < 0)) panels[0].lines.unshift(hook); }
    const missing = panels.map((p, k) => (p.lines.length ? -1 : k)).filter((k) => k >= 0);
    return { title: cleanLine(data && data.title).slice(0, 100), description: String(data && data.description || '').trim().slice(0, 1200), hashtags: (Array.isArray(data && data.hashtags) ? data.hashtags : []).map(normTag).filter(Boolean).slice(0, 8), tiktokCaption: String(data && (data.tiktok_caption || data.tiktokCaption) || '').trim().slice(0, 300), panels, missing };
  }
  // panels: [{ blob }] in reading order. o: { title, notes, length, language }
  async function writeScript(panels, o) {
    o = o || {}; const G = VTS.gemini; const n = panels.length;
    if (!n) throw G.fail('Add some comic panels first.');
    const parts = [{ text: buildPrompt(n, o) }];
    for (let k = 0; k < n; k++) {
      if (o.onProgress) o.onProgress({ phase: 'prep', i: k, n });
      const im = await toJpeg(panels[k].blob, n > 8 ? 640 : 768, 0.8);
      parts.push({ text: 'PANEL ' + (k + 1) + ':' }); parts.push({ inlineData: { mimeType: 'image/jpeg', data: await blobToB64(im.blob) } });
    }
    parts.push({ text: 'Write the JSON now: all ' + n + ' panels, in order, story told scene by scene.' });
    if (o.onProgress) o.onProgress({ phase: 'write', n });
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await G.generate([{ role: 'user', parts }], { json: true, schema: attempt ? undefined : SCHEMA, temperature: 0.85, think: 'low', maxTokens: 8192, timeout: 150000, budgetMs: 300000, onMeta: o.onMeta });
      try {
        let out = normalizeScript(parseJSON(raw), n);
        if (out.panels.filter((p) => p.lines.length).length >= Math.ceil(n * 0.6)) {
          const L = lengthOf(o.length); const words = out.panels.reduce((a, p) => a + p.lines.reduce((b, l) => b + wordCount(clean(l)), 0), 0);
          if (words < L.words[0] * 0.8) { // too short for the chosen length: one cheap text-only "expand" pass keeps panels + mapping
            if (o.onProgress) o.onProgress({ phase: 'expand', n, words });
            try { const longer = await expandScript(out, n, L, words, o); if (longer) out = longer; } catch (_) { /* keep the shorter script */ }
          }
          return out;
        }
        lastErr = G.fail('Gemini skipped too many panels. Try again, or write your own script.');
      } catch (e) { lastErr = G.fail('Gemini’s reply could not be read. Try again.'); lastErr.details = String(raw || '').slice(0, 200); }
      if (o.onProgress) o.onProgress({ phase: 'repair', n });
    }
    throw lastErr;
  }

  async function expandScript(out, n, L, words, o) {
    const G = VTS.gemini; const per = Math.round((L.words[0] + L.words[1]) / 2 / n);
    const draft = { title: out.title, panels: out.panels.map((p, k) => ({ panel: k + 1, lines: p.lines, focus_x: p.focus ? p.focus.x : 0.5, focus_y: p.focus ? p.focus.y : 0.45, impact: p.impact, sfx: p.sfx })), description: out.description, hashtags: out.hashtags, tiktok_caption: out.tiktokCaption };
    const prompt = ['This comic-recap narration is too short: ' + words + ' words, but a ~' + L.sec + ' second video needs ' + L.words[0] + '–' + L.words[1] + ' words.',
      'Rewrite it LONGER: about ' + per + ' words per panel (2–3 lines each), keeping the SAME ' + n + ' panels in the same order, the same story, the same hook as the first line, and lines for panel k only about panel k.',
      'Add story detail to every scene (what happens, who, why it matters, the stakes); keep the dramatic storytelling voice and only a few short narrator reactions. Keep *asterisks* on 1–2 key words per line. Keep focus/impact/sfx.',
      'Return the same JSON shape.', '', JSON.stringify(draft)].join('\n');
    const raw = await G.generate([{ role: 'user', parts: [{ text: prompt }] }], { json: true, schema: SCHEMA, temperature: 0.7, think: 'low', maxTokens: 8192, timeout: 90000, budgetMs: 150000 });
    const longer = normalizeScript(parseJSON(raw), n);
    const w2 = longer.panels.reduce((a, p) => a + p.lines.reduce((b, l) => b + wordCount(clean(l)), 0), 0);
    if (w2 <= words || longer.panels.some((p, k) => !p.lines.length && out.panels[k].lines.length)) return null;
    longer.panels.forEach((p, k) => { if (!p.focus) p.focus = out.panels[k].focus; });
    if (!longer.title) longer.title = out.title; if (!longer.description) longer.description = out.description; if (!longer.hashtags.length) longer.hashtags = out.hashtags; if (!longer.tiktokCaption) longer.tiktokCaption = out.tiktokCaption;
    return longer;
  }

  // ---------------- renderer ----------------
  // focus heuristic when Gemini gave none: contrast / saturation centroid of a 48x48 thumbnail, pulled a little to the centre
  function saliency(img) {
    try {
      const N = 48; const c = mk(N, N); const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, N, N);
      const d = x.getImageData(0, 0, N, N).data; const L = new Float32Array(N * N); let mean = 0;
      for (let i = 0; i < N * N; i++) { L[i] = (0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]) / 255; mean += L[i]; } mean /= N * N;
      let sx = 0; let sy = 0; let sw = 0;
      for (let y = 1; y < N - 1; y++) for (let q = 1; q < N - 1; q++) {
        const i = y * N + q; const r = d[i * 4]; const g = d[i * 4 + 1]; const b = d[i * 4 + 2]; const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
        const edge = Math.abs(L[i + 1] - L[i - 1]) + Math.abs(L[i + N] - L[i - N]);
        const edgeFrame = q < 3 || y < 3 || q > N - 4 || y > N - 4; // ignore the panel border
        const w = edgeFrame ? 0 : Math.pow(Math.abs(L[i] - mean) + sat * 0.7 + edge * 1.5, 2);
        sx += w * q; sy += w * y; sw += w;
      }
      if (sw <= 0) return { x: 0.5, y: 0.45 };
      return { x: 0.5 + ((sx / sw) / N - 0.5) * 0.75, y: 0.45 + ((sy / sw) / N - 0.45) * 0.75 };
    } catch (_) { return { x: 0.5, y: 0.45 }; }
  }
  function blurBg(img, W, H) {
    const w = Math.max(16, Math.round(W / 8)); const h = Math.max(16, Math.round(H / 8)); const c = mk(w, h); const x = c.getContext('2d');
    const sc = Math.max(w / img.width, h / img.height) * 1.1; const dw = img.width * sc; const dh = img.height * sc;
    const blurOk = typeof x.filter === 'string';
    if (blurOk) x.filter = 'blur(' + Math.round(w / 30) + 'px) saturate(1.25) brightness(0.55)';
    x.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh); x.filter = 'none';
    if (!blurOk) { const t = mk(w / 6, h / 6); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); x.clearRect(0, 0, w, h); x.imageSmoothingEnabled = true; x.drawImage(t, 0, 0, w, h); x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(0, 0, w, h); }
    return c;
  }
  function makeGlow(W, H, col) {
    const c = mk(W / 4, H / 4); const x = c.getContext('2d'); const w = c.width; const h = c.height;
    const g = x.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.32, w / 2, h * 0.5, Math.hypot(w, h) * 0.56);
    g.addColorStop(0, hexA(col, 0)); g.addColorStop(0.55, hexA(col, 0.16)); g.addColorStop(1, hexA(col, 0.62));
    x.fillStyle = g; x.fillRect(0, 0, w, h); return c;
  }
  function makeDot(col) { const c = mk(64, 64); const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, hexA(col, 0.9)); g.addColorStop(1, hexA(col, 0)); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return c; }
  function makeVignette(W, H) { const c = mk(W / 4, H / 4); const x = c.getContext('2d'); const w = c.width; const h = c.height; const g = x.createRadialGradient(w / 2, h * 0.5, w * 0.35, w / 2, h * 0.5, h * 0.62); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)'); x.fillStyle = g; x.fillRect(0, 0, w, h); return c; }

  function setupComic(r, o) {
    const C0 = o.comic || {}; const panels = Array.isArray(C0.panels) ? C0.panels : []; const fx = fxOf(C0.fx);
    const list = (o.beats || []).filter((b) => b && String(b.text || '').trim()); // same filter as buildTimeline
    const tl = r.timeline || [];
    tl.forEach((b, i) => { const src = list[i] || {}; b.panel = Number.isInteger(src.panel) ? src.panel : 0; b.keys = Array.isArray(src.keys) ? src.keys : null; });
    // segments: consecutive beats of one panel; the panel is on screen from its first beat until the next panel's first beat
    const segs = [];
    tl.forEach((b, i) => { const last = segs[segs.length - 1]; if (last && last.panel === b.panel) last.last = i; else segs.push({ panel: b.panel, first: i, last: i, start: b.start }); });
    if (!segs.length && panels.length) segs.push({ panel: 0, first: -1, last: -1, start: 0 });
    const total = o.duration || (tl.length ? tl[tl.length - 1].end + 0.8 : 4);
    segs.forEach((sg, k) => { sg.idx = k; if (k === 0) sg.start = 0; sg.end = k + 1 < segs.length ? segs[k + 1].start : Math.max(sg.start + 0.5, total); });
    // impacts: an impact word in the panel's narration (or the panel's own impact flag)
    const impacts = [];
    segs.forEach((sg) => {
      const p = panels[sg.panel] || {}; let hit = null;
      for (let i = sg.first; i >= 0 && i <= sg.last && !hit; i++) { const b = tl[i]; for (let wi = 0; wi < b.words.length && !hit; wi++) { const m = impactWord(b.words[wi], !!p.impact); if (m) hit = { t: b.wordTimes[wi], m }; } }
      if (!hit && p.impact && sg.first >= 0) hit = { t: Math.min(sg.end - 0.3, tl[sg.first].start + 0.35), m: null };
      if (!hit) return; if (impacts.length && hit.t - impacts[impacts.length - 1].t < 1.2) return;
      const txt = (String(p.sfx || '').trim() || (hit.m ? hit.m.texts[sg.idx % hit.m.texts.length] : 'KRAK!')).toUpperCase().slice(0, 14);
      impacts.push({ t: hit.t, text: txt, audio: audioForText(p.sfx, hit.m), seg: sg.idx, seed: (sg.idx * 7919 + 17) % 101, pos: impacts.length % 2 });
      sg.impact = true;
    });
    // transitions + Ken Burns moves (deterministic per segment)
    const cycle = ['flash', 'slide', 'punch', 'cut', 'slide', 'flash', 'punch'];
    const moves = ['in', 'pan', 'out', 'in', 'pan', 'out', 'pan'];
    segs.forEach((sg, k) => {
      const rr = rng(1000 + k * 7919 + sg.panel * 131);
      sg.trans = fx.transitions && fx.transitions !== 'mix' ? fx.transitions : sg.impact ? 'punch' : cycle[k % cycle.length];
      sg.move = moves[(k + Math.floor(rr() * 3)) % moves.length]; sg.amt = 0.12 + rr() * 0.08; sg.dir = rr() < 0.5 ? -1 : 1; sg.kb = null;
    });
    // sound: whoosh into each panel, hits on impacts, a low boom under the hook
    const cues = [];
    segs.forEach((sg, k) => { if (k > 0 && sg.trans !== 'cut') cues.push({ t: Math.max(0, sg.start - 0.14), id: 'whoosh', gain: 0.4, pan: k % 2 ? 0.3 : -0.3, pri: 1 }); });
    impacts.forEach((im) => im.audio.forEach((id, j) => cues.push({ t: Math.max(0, im.t - 0.03), id, gain: j ? 0.55 : 0.95, pan: 0, pri: 3 })));
    if (tl.length) cues.push({ t: Math.max(0, tl[0].start - 0.05), id: 'boom', gain: 0.45, pan: 0, pri: 2 });
    cues.sort((a, b) => a.t - b.t);
    r.cx = { cues, cuts: [], fx: [], stickers: [], emojis: new Set(), hookEnd: 0, focus: [540, 960] };
    const R0 = rng(4242); const motes = Array.from({ length: 26 }, () => ({ x: R0(), y: R0(), sp: 0.03 + R0() * 0.06, ph: R0() * TAU, f: 0.6 + R0() * 1.4, sz: 0.5 + R0() * 1.2 }));
    r.comic = { panels, fx, segs, impacts, imgs: [], bgs: [], focus: [], motes, color: fx.color || FX_DEFAULT.color };
  }
  async function prepareComic(r) {
    const C = r.comic; const W = r.canvas.width; const H = r.canvas.height;
    const used = Array.from(new Set(C.segs.map((s) => s.panel)));
    for (const k of used) {
      const p = C.panels[k]; if (!p) continue;
      try {
        let img = p.img || null;
        if (!img && p.blob) img = await createImageBitmap(p.blob);
        if (!img) continue;
        C.imgs[k] = img; C.bgs[k] = blurBg(img, W, H);
        const f = p.focus; C.focus[k] = f && isFinite(f.x) && isFinite(f.y) ? { x: clamp01(f.x), y: clamp01(f.y) } : saliency(img);
      } catch (_) { /* missing / unreadable image: a placeholder is drawn */ }
    }
    C.glow = makeGlow(W, H, C.color); C.dot = makeDot(C.color); C.vig = makeVignette(W, H);
    try { await document.fonts.load('400 100px Bangers'); await document.fonts.load('900 100px Montserrat'); } catch (_) { /* fallback fonts */ }
  }
  function segAt(C, t) { let k = 0; for (let i = 0; i < C.segs.length; i++) if (t >= C.segs[i].start - 0.08) k = i; return k; }
  // Ken Burns plan for one segment: base scale from the fit mode, zoom range and a pan toward the focal area
  function kbFor(r, sg, img) {
    if (sg.kb && sg.kb.img === img) return sg.kb;
    const C = r.comic; const W = r.canvas.width; const H = r.canvas.height; const iw = img.width; const ih = img.height;
    const sC = Math.min(W / iw, H / ih); const sV = Math.max(W / iw, H / ih); const fit = C.fx.fit;
    let base;
    if (fit === 'cover') base = sV; else if (fit === 'fit') base = sC;
    else { const lim = iw / ih > W / H ? W / (0.62 * iw) : H / (0.62 * ih); base = Math.max(sC, Math.min(sV, lim)); if (sV / base < 1.25) base = sV; }
    const f = C.focus[sg.panel] || { x: 0.5, y: 0.45 };
    const zIn = 1 + sg.amt; const mid = { x: 0.5 + (0.5 - f.x) * 0.25, y: 0.5 + (0.5 - f.y) * 0.25 };
    let z0; let z1; let c0; let c1;
    if (sg.move === 'out') { z0 = zIn + 0.04; z1 = 1.02; c0 = f; c1 = mid; }
    else if (sg.move === 'pan') {
      z0 = 1.06; z1 = 1.06 + sg.amt * 0.5; const dw = iw * base * 1.08; const dh = ih * base * 1.08;
      if (dw - W > (dh - H) * 0.8 && dw > W * 1.05) { const lo = W / 2 / dw; const hi = 1 - lo; const toward = f.x >= 0.5 ? hi : lo; c0 = { x: f.x >= 0.5 ? lo : hi, y: f.y }; c1 = { x: (toward + f.x) / 2, y: f.y }; if (Math.abs(f.x - 0.5) < 0.08) { c0 = { x: sg.dir > 0 ? lo : hi, y: f.y }; c1 = { x: sg.dir > 0 ? hi : lo, y: f.y }; } }
      else if (dh > H * 1.05) { const lo = H / 2 / dh; const hi = 1 - lo; c0 = { x: f.x, y: f.y >= 0.5 ? lo : hi }; c1 = { x: f.x, y: (f.y >= 0.5 ? hi : lo) * 0.5 + f.y * 0.5 }; }
      else { z0 = 1.0; z1 = zIn; c0 = mid; c1 = f; }
    } else { z0 = 1.0; z1 = zIn; c0 = mid; c1 = f; }
    sg.kb = { img, base, z0, z1, c0, c1 };
    return sg.kb;
  }
  function drawSeg(r, sg, t, ex) {
    const C = r.comic; const ctx = r.ctx; const W = r.canvas.width; const H = r.canvas.height; ex = ex || {};
    const img = C.imgs[sg.panel];
    ctx.save();
    if (ex.dx) ctx.translate(ex.dx, 0);
    if (ex.zoom && ex.zoom !== 1) { ctx.translate(W / 2, H / 2); ctx.scale(ex.zoom, ex.zoom); ctx.translate(-W / 2, -H / 2); }
    if (!img) { ctx.fillStyle = '#10121c'; ctx.fillRect(0, 0, W, H); ctx.restore(); return; }
    const kb = kbFor(r, sg, img);
    const D = Math.max(0.6, sg.end - sg.start + 0.3); const p = clamp01((t - sg.start + 0.1) / D); const e = 0.5 - 0.5 * Math.cos(Math.PI * p);
    const z = kb.z0 + (kb.z1 - kb.z0) * e; const cx = kb.c0.x + (kb.c1.x - kb.c0.x) * e; const cy = kb.c0.y + (kb.c1.y - kb.c0.y) * e;
    const sc = kb.base * z; const dw = img.width * sc; const dh = img.height * sc;
    let x = W / 2 - cx * dw; let y = H / 2 - cy * dh;
    if (dw >= W) x = Math.min(0, Math.max(W - dw, x)); else x = (W - dw) / 2;
    if (dh >= H) y = Math.min(0, Math.max(H - dh, y)); else y = (H - dh) / 2;
    const framed = dw < W - 2 || dh < H - 2;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (framed) {
      const bg = C.bgs[sg.panel]; const bz = 1.12 + 0.06 * e;
      if (bg) ctx.drawImage(bg, (W - W * bz) / 2, (H - H * bz) / 2, W * bz, H * bz); else { ctx.fillStyle = '#0b0c12'; ctx.fillRect(0, 0, W, H); }
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x + 10 * r.s, y + 16 * r.s, dw, dh);
    }
    ctx.drawImage(img, x, y, dw, dh);
    if (framed) { ctx.lineWidth = 9 * r.s; ctx.strokeStyle = '#08080c'; ctx.strokeRect(x, y, dw, dh); }
    ctx.restore();
  }
  function flash(ctx, W, H, a, col) { if (a <= 0.003) return; ctx.save(); ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = col || '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  function drawTransition(r, a, b, t, q) {
    const ctx = r.ctx; const W = r.canvas.width; const H = r.canvas.height;
    if (b.trans === 'slide') {
      const e = easeInOutCubic(q); const dir = b.idx % 2 ? 1 : -1;
      drawSeg(r, a, t, { dx: dir * -W * e }); drawSeg(r, b, t, { dx: dir * W * (1 - e) });
      const sm = Math.sin(q * Math.PI); ctx.save(); ctx.globalAlpha = 0.5 * sm; ctx.fillStyle = '#ffffff';
      for (let k = 0; k < 14; k++) { const y = (((k * 137 + b.idx * 61) % 19) / 19) * H; ctx.fillRect(0, y, W, (4 + (k % 4) * 7) * r.s); } ctx.restore();
    } else if (b.trans === 'punch') { drawSeg(r, b, t, { zoom: 1 + 0.3 * Math.pow(1 - q, 2) }); flash(ctx, W, H, 0.55 * Math.pow(1 - q, 2)); }
    else if (b.trans === 'flash') { drawSeg(r, b, t); flash(ctx, W, H, 0.92 * Math.pow(1 - q, 1.6)); }
    else drawSeg(r, b, t);
  }
  function speedLines(r, t, amt, col) {
    if (amt <= 0.01) return; const ctx = r.ctx; const W = r.canvas.width; const H = r.canvas.height; const cx = W / 2; const cy = H * 0.46; const R = Math.hypot(W, H) * 0.62;
    const rr = rng(Math.floor(t * 15) * 977 + 3); ctx.save();
    for (let i = 0; i < 48; i++) {
      const a = rr() * TAU; const r0 = R * (0.48 + rr() * 0.3); const w = 0.003 + rr() * 0.009;
      ctx.globalAlpha = amt * (0.18 + rr() * 0.32); ctx.fillStyle = i % 3 ? '#ffffff' : col;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a - w) * R * 1.3, cy + Math.sin(a - w) * R * 1.3); ctx.lineTo(cx + Math.cos(a + w) * R * 1.3, cy + Math.sin(a + w) * R * 1.3); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function drawPops(r, t) {
    const C = r.comic; const ctx = r.ctx; const W = r.canvas.width; const H = r.canvas.height; const s = r.s;
    for (const im of C.impacts) {
      const d = t - im.t + 0.04; if (d < 0 || d > 1.1) continue;
      const k = easeOutBack(d / 0.22); const out = clamp01((1.1 - d) / 0.28); const jit = d < 0.35 ? (0.35 - d) * 26 * s : 0;
      const x = W * (0.5 + (im.pos ? 0.05 : -0.05)) + Math.sin(d * 70) * jit; const y = H * (im.pos ? 0.79 : 0.21) + Math.cos(d * 63) * jit;
      const rot = (im.pos ? 1 : -1) * (0.07 + (im.seed % 5) * 0.018);
      let size = 240 * s; ctx.save(); ctx.font = '400 ' + size + 'px ' + SFX_FONT; const tw = ctx.measureText(im.text).width; if (tw > W * 0.86) size *= (W * 0.86) / tw;
      ctx.globalAlpha = out; ctx.translate(x, y); ctx.rotate(rot); ctx.scale(Math.max(0.01, k), Math.max(0.01, k));
      ctx.font = '400 ' + size + 'px ' + SFX_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.fillStyle = '#4a0808'; for (let j = 7; j > 0; j--) ctx.fillText(im.text, j * 2.4 * s, j * 2.8 * s); // extruded depth
      ctx.lineWidth = size * 0.13; ctx.strokeStyle = '#120c14'; ctx.strokeText(im.text, 0, 0);
      const g = ctx.createLinearGradient(0, -size * 0.42, 0, size * 0.42); g.addColorStop(0, '#fffbb0'); g.addColorStop(0.45, '#ffd21f'); g.addColorStop(1, '#ff5e00');
      ctx.fillStyle = g; ctx.fillText(im.text, 0, 0); ctx.restore();
    }
  }
  function drawComic(r, t) {
    const C = r.comic; const ctx = r.ctx; const W = r.canvas.width; const H = r.canvas.height; const s = r.s; const fx = C.fx;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, W, H);
    // camera shake on impacts
    let near = null; for (const im of C.impacts) { const d = t - im.t; if (d >= 0 && d < 0.5) { near = im; break; } }
    if (fx.shake && near) { const d = t - near.t; const a = Math.pow(1 - d / 0.5, 2) * 22 * s; ctx.translate(W / 2 + Math.sin(t * 91 + near.seed) * a, H / 2 + Math.cos(t * 77 + near.seed * 2) * a); ctx.rotate(Math.sin(t * 53) * 0.008 * (a / (22 * s))); ctx.translate(-W / 2, -H / 2); }
    const k = segAt(C, t); const sg = C.segs[k];
    if (sg) { const q = (t - (sg.start - 0.08)) / 0.24; if (k > 0 && q >= 0 && q < 1) drawTransition(r, C.segs[k - 1], sg, t, q); else drawSeg(r, sg, t); }
    ctx.restore();
    // energy glow, tint and motes
    let boost = 0; if (near) boost = 0.5 * Math.pow(1 - (t - near.t) / 0.5, 2);
    if (fx.glow) {
      ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.2; ctx.fillStyle = C.color; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = clamp01(0.5 + 0.18 * Math.sin(t * 2.3) + boost); if (C.glow) ctx.drawImage(C.glow, 0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      if (C.dot) for (const m of C.motes) {
        const y = (((m.y - t * m.sp) % 1) + 1) % 1; const x = m.x + 0.025 * Math.sin(t * m.f + m.ph); const a = (0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * 3.1 * m.f + m.ph))) * (0.6 + boost);
        const z = (18 + 26 * m.sz) * s; ctx.globalAlpha = clamp01(a); ctx.drawImage(C.dot, x * W - z / 2, y * H - z / 2, z, z);
      }
      ctx.restore();
    }
    if (fx.speedLines) {
      let amt = 0; if (sg) { const d = t - sg.start; if (d >= -0.08 && d < 0.75 && k > 0) amt = Math.max(amt, 1 - Math.max(0, d) / 0.75); }
      if (near) amt = Math.max(amt, 1 - (t - near.t) / 0.5); speedLines(r, t, amt * 0.9, C.color);
    }
    if (fx.flashes && near) { const d = t - near.t; if (d < 0.22) { flash(ctx, W, H, 0.7 * Math.pow(1 - d / 0.22, 2)); flash(ctx, W, H, 0.25 * (1 - d / 0.22), C.color); } }
    if (C.vig) ctx.drawImage(C.vig, 0, 0, W, H);
    if (fx.sfxText) drawPops(r, t);
    r.drawCaptions(t);
    r.drawWatermark();
    if (r.o.progress) { const d = r.o.duration || 1; const v = clamp01(t / d); const h = 12 * s; ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(0, 0, W, h); ctx.fillStyle = C.color; ctx.fillRect(0, 0, W * v, h); ctx.restore(); }
    if (r.drawProbe) r.drawProbe(t);
  }

  // ---------------- "Comic Bold" captions (any mode) ----------------
  function chunkWords(words) {
    const out = []; let cur = []; let len = 0;
    words.forEach((w, i) => {
      const L = String(w).length; if (cur.length && (cur.length >= 3 || len + L > 15)) { out.push(cur); cur = []; len = 0; }
      cur.push(i); len += L + 1; if (/[.!?,;:…—]["”’)\]]*$/.test(w)) { out.push(cur); cur = []; len = 0; }
    });
    if (cur.length) out.push(cur);
    return out;
  }
  const EMPH = new Set(['never', 'nothing', 'everything', 'everyone', 'nobody', 'exactly', 'only', 'betrayed', 'betrayal', 'lied', 'dead', 'death', 'killed', 'traitor', 'secret', 'truth', 'gone', 'alone', 'enemy', 'framed', 'arrest', 'arrested', 'power', 'ring', 'war', 'last', 'first', 'twist', 'real', 'wrong', 'impossible']);
  function keySet(b) {
    if (b.keySet) return b.keySet;
    const ks = new Set();
    if (Array.isArray(b.keys) && b.keys.length) b.keys.forEach((k) => ks.add(k));
    else {
      b.words.forEach((w, wi) => {
        const raw = String(w).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); const p = raw.toLowerCase();
        const sentStart = wi === 0 || /[.!?…]["”’)]*$/.test(b.words[wi - 1]);
        if ((/^\p{Lu}/u.test(raw) && !sentStart && raw.length > 1 && !/^I('|’|$)/.test(raw)) || /\d/.test(raw) || EMPH.has(p) || (b.emphasis && p === b.emphasis) || impactWord(raw, false)) ks.add(wi);
      });
      if (!ks.size && b.words.length <= 2) b.words.forEach((_, wi) => ks.add(wi));
    }
    b.keySet = ks; return ks;
  }
  function drawComicCaption(r, t) {
    const i = r.beatAt(t); if (i < 0) return; const b = r.timeline[i]; if (!b || !b.words || !b.words.length) return;
    if (i === 0 && t < b.wordTimes[0] - 0.05) return;
    const ctx = r.ctx; const s = r.s; const W = r.canvas.width;
    const chunks = b.comicChunks || (b.comicChunks = chunkWords(b.words));
    let active = 0; b.wordTimes.forEach((wt, wi) => { if (t >= wt - 0.03) active = wi; });
    let ci = chunks.findIndex((c) => c.includes(active)); if (ci < 0) ci = 0; const ch = chunks[ci]; const keys = keySet(b);
    const words = ch.map((wi) => String(b.words[wi]).replace(/[,;:"“”]+/g, '').replace(/\p{Extended_Pictographic}/gu, '').toUpperCase()).map((w) => w || '…');
    const inComic = !!r.comic; let size = (inComic ? 132 : 112) * s; const maxW = W * 0.86;
    let lines; let widths; let space;
    for (let tries = 0; tries < 6; tries++) {
      ctx.font = '900 ' + size + 'px ' + FONT; space = ctx.measureText(' ').width * 0.9; widths = words.map((w) => ctx.measureText(w).width);
      lines = []; let cur = []; let cw = 0;
      words.forEach((w, k) => { if (cur.length && cw + space + widths[k] > maxW) { lines.push({ ks: cur, w: cw }); cur = []; cw = 0; } cur.push(k); cw += (cur.length > 1 ? space : 0) + widths[k]; });
      if (cur.length) lines.push({ ks: cur, w: cw });
      if (lines.length <= 2 && Math.max.apply(null, lines.map((l) => l.w)) <= maxW) break; size *= 0.88;
    }
    // two short words stack like the reference ("JOHN HAD / NO RING"): break 3+ word chunks into 2 lines when wide
    if (lines.length === 1 && words.length >= 3 && lines[0].w > maxW * 0.62) {
      const wOf = (ks) => ks.reduce((x, k, j) => x + widths[k] + (j ? space : 0), 0); const idx = words.map((_, k) => k); let best = null;
      for (let cut = 1; cut < words.length; cut++) { const a = idx.slice(0, cut); const bb = idx.slice(cut); const m = Math.max(wOf(a), wOf(bb)) + (bb.length === 1 && words[bb[0]].length <= 3 ? maxW : 0); if (!best || m < best.m) best = { m, a, bb }; } // balanced, never a lone "THE"
      lines = [{ ks: best.a, w: wOf(best.a) }, { ks: best.bb, w: wOf(best.bb) }];
    }
    const lh = size * 1.06; const cy = (inComic ? r.DH * 0.565 : (r.LY && r.LY.cap ? r.LY.cap.cy : r.DH * 0.5)) * s; const top = cy - (lines.length - 1) * lh / 2;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.miterLimit = 2; ctx.font = '900 ' + size + 'px ' + FONT;
    lines.forEach((l, li) => {
      let x = W / 2 - l.w / 2;
      l.ks.forEach((k) => {
        const wx = x + widths[k] / 2; x += widths[k] + space; const wt = b.wordTimes[ch[k]];
        if (t < wt - 0.03) return;
        const pk = easeOutBack((t - wt + 0.03) / 0.15); const sc = 0.45 + 0.55 * pk;
        ctx.save(); ctx.translate(wx, top + li * lh); ctx.scale(sc, sc);
        ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillText(words[k], size * 0.05, size * 0.08);
        ctx.lineWidth = size * 0.22; ctx.strokeStyle = '#000000'; ctx.strokeText(words[k], 0, 0);
        ctx.fillStyle = keys.has(ch[k]) ? '#ffe02e' : '#ffffff'; ctx.fillText(words[k], 0, 0);
        ctx.restore();
      });
    });
    ctx.restore();
  }

  // ---------------- renderer hooks (Comic Recap visual + Comic Bold captions; other modes untouched) ----------------
  const RENDER = VTS.render; const RP = RENDER && RENDER.Renderer && RENDER.Renderer.prototype;
  if (RP) {
    const baseSetup = RP.setup;
    RP.setup = function (o) {
      this.comic = null;
      if (!o || o.visual !== 'comic') return baseSetup.call(this, o);
      // the classic (no scenes) pipeline builds the voice-locked timeline; the comedy director stays off in this mode
      baseSetup.call(this, Object.assign({}, o, { visual: 'classic', comedy: false, textStyle: 'none' }));
      this.o.visual = 'comic';
      setupComic(this, o);
    };
    const basePrepare = RP.prepare;
    RP.prepare = async function () { const n = await basePrepare.apply(this, arguments); if (this.comic) await prepareComic(this); return n; };
    const baseDraw = RP.draw;
    RP.draw = function (t) { if (!this.comic) return baseDraw.call(this, t); drawComic(this, t); };
    const baseCaptions = RP.drawCaptions;
    RP.drawCaptions = function (t) {
      if (this.o.captionStyle !== 'comic') { if (this.comic && this.o.captionStyle === 'none') return; return baseCaptions.call(this, t); }
      drawComicCaption(this, t);
      const ts = this.o.textStyle; if (!this.comic && ts && ts !== 'none' && VTS.captions16 && VTS.captions16.drawTextStyle) VTS.captions16.drawTextStyle(this, t, ts);
    };
  }
  if (VTS.captions16 && !VTS.captions16.CAPTION_IDS.includes('comic')) { VTS.captions16.CAPTION_STYLES.splice(VTS.captions16.CAPTION_STYLES.length - 1, 0, ['comic', 'Comic Bold']); VTS.captions16.CAPTION_IDS.splice(VTS.captions16.CAPTION_IDS.length - 1, 0, 'comic'); }

  // ---------------- stills: library thumbnail + cover PNG ----------------
  async function still(canvas, o) {
    const R = VTS.render; const beats = o.beats || []; const words = beats.reduce((a, b) => a + wordCount(b.text), 0); const dur = Math.max(4, words / 2.5);
    const r = new R.Renderer(canvas);
    r.setup(Object.assign({}, o.look || {}, { visual: 'comic', beats, speechStart: 0.3, speechEnd: 0.3 + dur, duration: dur + 1.1, progress: false, watermark: false, captionStyle: o.captionStyle || (o.look && o.look.captionStyle) || 'comic' }));
    await r.prepare();
    const C = r.comic; const sg = C.segs.find((x) => x.impact) || C.segs[0];
    const t = sg ? Math.max(0.4, Math.min(sg.end - 0.1, sg.start + 1.0)) : 1;
    r.draw(t); return r;
  }
  async function thumb(o) { const [tw, th] = VTS.render.frameSize('9:16', 0.25); const c = mk(tw, th); await still(c, o); return c.toDataURL('image/jpeg', 0.8); }
  async function cover(canvas, o) {
    const [cw, ch] = VTS.render.frameSize('9:16', 1); canvas.width = cw; canvas.height = ch;
    const r = await still(canvas, Object.assign({}, o, { captionStyle: 'none', look: Object.assign({}, o.look, { comic: Object.assign({}, o.look && o.look.comic, { fx: Object.assign({}, o.look && o.look.comic && o.look.comic.fx, { sfxText: false, flashes: false }) }) }) }));
    const ctx = r.ctx; const s = r.s; const text = String(o.text || '').replace(/\p{Extended_Pictographic}/gu, '').trim().toUpperCase();
    if (text) {
      let sz = 136 * s; ctx.save(); ctx.font = '900 ' + sz + 'px ' + FONT;
      const wrap = (maxW) => { const out = []; let cur = ''; text.split(/\s+/).forEach((w) => { const n = cur ? cur + ' ' + w : w; if (cur && ctx.measureText(n).width > maxW) { out.push(cur); cur = w; } else cur = n; }); if (cur) out.push(cur); return out; };
      let lines = wrap(cw * 0.86); while (lines.length > 4 && sz > 70 * s) { sz *= 0.9; ctx.font = '900 ' + sz + 'px ' + FONT; lines = wrap(cw * 0.86); }
      const lh = sz * 1.05; ctx.translate(cw / 2, 330 * s); ctx.rotate(-0.03); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      lines.slice(0, 5).forEach((l, q) => { const y = q * lh; ctx.fillStyle = '#000'; ctx.fillText(l, sz * 0.06, y + sz * 0.08); ctx.lineWidth = sz * 0.22; ctx.strokeStyle = '#000'; ctx.strokeText(l, 0, y); ctx.fillStyle = q === lines.length - 1 ? '#ffe02e' : '#ffffff'; ctx.fillText(l, 0, y); });
      ctx.restore();
    }
    if (o.handle) { ctx.save(); ctx.font = '800 ' + 40 * s + 'px ' + FONT; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 10 * s; ctx.fillText(o.handle, cw / 2, ch - 90 * s); ctx.restore(); }
    return await new Promise((ok) => canvas.toBlob((bl) => ok(bl), 'image/png'));
  }

  VTS.comic = { LENGTHS, lengthOf, COLORS, FIT, TRANS, FX_DEFAULT, fxOf, parseMarked, clean, splitLine, buildBeats, scriptOf, makePkg, wordCount, IMPACT, impactWord, audioForText,
    SCHEMA, buildPrompt, writeScript, normalizeScript, parseJSON, importImage, toJpeg, saliency, chunkWords, keySet, drawComicCaption, still, thumb, cover };
}());
