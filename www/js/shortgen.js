/* Turns a rambling idea into a Short package (structured JSON), plus caption-beat helpers. */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {});

  const TONES = {
    calm: { label: 'Calm teacher', prompt: 'Calm, warm, confident teacher. Short clear sentences. Reassuring, never preachy.' },
    bold: { label: 'Bold', prompt: 'Bold, direct, high-energy. Punchy sentences, pattern interrupts, a little provocative but never rude.' },
    soft: { label: 'Soft', prompt: 'Soft, gentle, compassionate, like a kind friend. Slow pace, validating, cosy.' },
  };
  const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Hindi', 'Indonesian', 'Filipino', 'Swahili', 'Arabic', 'Japanese', 'Korean'];

  const SYSTEM = [
    'You are a top YouTube Shorts scriptwriter for a faceless psychology and self-help channel (BetterU style: calm voiceover over aesthetic visuals).',
    'Every Short follows this proven structure:',
    '1) HOOK (first 1-2 seconds, max 14 words): a curiosity gap, bold claim, or relatable pain point. No greetings, no "in this video".',
    '2) METHOD: exactly 3 numbered steps or tips, each introduced with "One", "Two", "Three" (or "First", "Second", "Third"). Each step is concrete and actionable with a tiny why.',
    '3) SOFT CTA: one gentle line, e.g. "Save this for the next time you need it" or "Follow for more calm psychology". Never beg.',
    'Rules: the full voiceover script is 80 to 110 words (about 30-45 seconds spoken). Spoken, natural language; contractions welcome.',
    'Grounded in real psychology; do not invent studies, statistics or names; no medical or diagnostic claims.',
    'Return ONLY JSON matching the schema.',
  ].join('\n');

  const T = { STRING: 'STRING', NUMBER: 'NUMBER', INTEGER: 'INTEGER', ARRAY: 'ARRAY', OBJECT: 'OBJECT' };
  const SC = () => VTS.scenes;
  function sceneSchema() {
    const s = SC();
    return {
      type: T.OBJECT,
      description: 'The animated 2D cartoon scene shown while this caption is spoken, chosen ONLY from the allowed values.',
      properties: {
        setting: { type: T.STRING, enum: s.SET_IDS, description: 'Background location.' },
        pose: { type: T.STRING, enum: s.POSE_IDS, description: 'The ACTION the character performs — pick the one that literally shows the main keyword (sketch/draw -> drawing, save money -> saving-money, cook -> cooking).' },
        emotion: { type: T.STRING, enum: s.EMO_IDS },
        props: { type: T.ARRAY, description: '0 to 3 animated prop ids from the allowed prop list in the prompt, illustrating the words literally.', items: { type: T.STRING } },
        camera: { type: T.STRING, enum: s.CAM_IDS },
        callout: { type: T.STRING, description: 'Optional 1-3 word sticker label (e.g. "2:07 AM", "Cortisol up"), usually empty.' },
        keywords: { type: T.ARRAY, description: '1-3 LITERAL, drawable keywords from this caption (nouns/verbs actually said, e.g. "pencil", "sketchbook", "cook"), most important first.', items: { type: T.STRING } },
        objects: { type: T.ARRAY, description: '0-3 physical objects that should be visible (plain English nouns).', items: { type: T.STRING } },
        icon: { type: T.STRING, description: 'One emoji that literally depicts the main keyword (e.g. ✏️ for pencil, 💰 for money).' },
        characters: { type: T.INTEGER, description: '1, or 2 only for a conversation (pose talking).' },
      },
      required: ['setting', 'pose', 'emotion', 'props', 'camera'],
    };
  }
  const SCENE_RULES = [
    'Scenes: every beat gets a "scene" for a faceless psychology channel animated in flat 2D (one relatable cartoon character).',
    'Illustrate the words literally and specifically (e.g. "why you overthink at night" -> bedroom-night, lying-awake, anxious, props clock + thought-bubbles; "your brain replays it" -> abstract-mind-space with brain; "put your phone away" -> phone-screen or scrolling-phone).',
    'Keep the SAME setting for consecutive beats of one idea (change setting every 2-4 beats, never every beat). Vary pose/emotion/props within a setting to follow the words.',
    'KEYWORDS FIRST: for every beat list the literal keywords actually spoken, then choose the action (pose), props and setting so the MAIN keyword is clearly visible on screen. Prefer literal over metaphorical (a line about sketching shows the character drawing in a sketchbook with a pencil, not a lightbulb). If no action or prop can show it, use setting "keyword-card" with an icon emoji of the keyword.',
    'The problem/hook uses tense emotions; the steps move toward calm/happy; the CTA is talking or celebrating with heart or speech-bubbles. Use camera "zoom-in" for dramatic lines, "shake" for stress, "pan" for walking, otherwise "static". Max 3 props.',
    SC() ? 'Allowed prop ids (use only these exact ids in "props"; anything else goes in "objects"/"keywords"): ' + SC().PROP_IDS.join(', ') + '.' : '',
  ].filter(Boolean).join('\n');
  const SCHEMA = {
    type: T.OBJECT,
    properties: {
      hooks: { type: T.ARRAY, description: 'Exactly 3 alternative hook lines, strongest first. The script starts with hooks[0] verbatim.', items: { type: T.STRING } },
      script: { type: T.STRING, description: 'Full voiceover, 80-110 words: hooks[0], then One/Two/Three steps, then a soft CTA.' },
      beats: {
        type: T.ARRAY,
        description: 'On-screen caption beats that split the script into consecutive chunks, in order, verbatim, 2-6 words each, covering the whole script.',
        items: {
          type: T.OBJECT,
          properties: {
            text: { type: T.STRING, description: 'Caption phrase, verbatim from the script, 2-6 words.' },
            weight: { type: T.NUMBER, description: 'Relative speaking time (about the number of spoken words, 1-8).' },
            step: { type: T.INTEGER, description: '0 = hook, 1/2/3 = the numbered step it belongs to, 4 = call to action.' },
            emphasis: { type: T.STRING, description: 'The single most important word in the phrase (copied exactly), or empty.' },
            visual: { type: T.STRING, description: 'A short description of the visual for this beat.' },
          },
          required: ['text', 'weight', 'step', 'visual'],
        },
      },
      title: { type: T.STRING, description: 'YouTube Shorts title, under 70 characters, curiosity-driven, may end with one emoji.' },
      description: { type: T.STRING, description: '2-4 short lines for the video description, then a soft CTA line. No hashtags here.' },
      hashtags: { type: T.ARRAY, description: '5 to 8 hashtags, each starting with #, include #shorts.', items: { type: T.STRING } },
      pinnedComment: { type: T.STRING, description: 'A pinned comment that invites replies (a question or a mini challenge).' },
      thumbnailText: { type: T.STRING, description: '2-5 word thumbnail/cover text, punchy.' },
    },
    required: ['hooks', 'script', 'beats', 'title', 'description', 'hashtags', 'pinnedComment', 'thumbnailText'],
  };

  // ---------- video length ----------
  const LENGTHS = [
    { id: '60', label: '30–60 s (Short)', sec: 60, words: [80, 110] },
    { id: '120', label: '2 min', sec: 120, words: [250, 300] },
    { id: '300', label: '5 min', sec: 300, words: [640, 740] },
    { id: '600', label: '10 min', sec: 600, words: [1300, 1450] },
    { id: '900', label: '15 min', sec: 900, words: [1950, 2150] },
    { id: '1200', label: '20 min', sec: 1200, words: [2600, 2850] },
  ];
  const lengthOf = (id) => LENGTHS.find((l) => l.id === String(id)) || LENGTHS[0];
  const isLong = (id) => lengthOf(id).sec >= 300;
  const SYSTEM_LONG = [
    'You are an expert YouTube scriptwriter for a faceless explainer / self-improvement channel (calm voiceover over flat 2D animated scenes).',
    'Long videos: a strong hook in the first 10 seconds, a promise of what the viewer will get, clear sections that each teach one idea with concrete examples and actions, smooth transitions, and a short soft CTA at the very end.',
    'Spoken, natural language; contractions welcome; short sentences that are easy to caption. Grounded; do not invent studies, statistics or names; no medical or diagnostic claims.',
    'Return ONLY JSON matching the schema.',
  ].join('\n');

  function schemaWithScenes() {
    if (!SC()) return SCHEMA;
    const sch = JSON.parse(JSON.stringify(SCHEMA)); sch.properties.beats.items.properties.scene = sceneSchema(); sch.properties.beats.items.required.push('scene'); return sch;
  }
  function buildPrompt(idea, opts) {
    const tone = TONES[opts.tone] || TONES.calm; const L = lengthOf(opts.length);
    return [
      L.sec <= 60 ? 'Turn my rambling idea below into a complete YouTube Short package.' : 'Turn my idea below into a complete ' + L.label + ' YouTube video package. Ignore the 80-110 word rule: the script must be ' + L.words[0] + '-' + L.words[1] + ' words (about ' + L.label + ' spoken); use as many numbered steps as fit naturally (3-5).',
      'Tone: ' + tone.prompt,
      'Language for every field: ' + (opts.language || 'English') + '.',
      opts.handle ? 'Channel handle (only use in the CTA if natural): ' + opts.handle : '',
      L.sec <= 60 ? 'Beats: 12 to 22 beats. Hook beats use step 0, CTA beats use step 4.' : 'Beats: one beat per 3-6 spoken words, covering the whole script. Hook beats use step 0, steps 1-3 for the first three steps (later steps use 3), CTA beats use step 4.',
      'Beat rule: Each beat text must be copied verbatim from the script so captions match the voice.',
      SC() ? SCENE_RULES : '',
      '',
      'My idea (dictated, may be messy):',
      '"""',
      String(idea || '').trim().slice(0, 24000),
      '"""',
    ].filter((l) => l !== '').join('\n');
  }

  // ---------- text helpers ----------
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
  const wordCount = (s) => words(s).length;
  function normHashtag(h) {
    const t = String(h || '').trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
    return t ? '#' + t : '';
  }
  function splitHook(hookText) {
    // First sentence(s) of the script that equal the hook.
    return String(hookText || '').trim();
  }

  const STEP_RE = /^(?:step\s*)?(one|two|three|first|second|third|1|2|3)\b[\s.:,)\-–—]*/i;
  const CTA_RE = /\b(follow|save this|subscribe|comment|share this|like|send this|for more)\b/i;
  const stepNum = (w) => ({ one: 1, first: 1, '1': 1, two: 2, second: 2, '2': 2, three: 3, third: 3, '3': 3 })[String(w).toLowerCase()] || 0;

  // Split text into caption chunks (2-6 words), breaking at punctuation where possible.
  function chunkText(text, maxWords) {
    maxWords = maxWords || 5;
    const out = [];
    const sentences = String(text || '').replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]*["”’)]?\s*/g) || [];
    for (const sRaw of sentences) {
      const s = sRaw.trim(); if (!s) continue;
      const parts = s.split(/(?<=[,;:—–])\s+/);
      for (const p of parts) {
        const w = words(p);
        if (!w.length) continue;
        const n = Math.ceil(w.length / maxWords);
        const size = Math.ceil(w.length / n);
        for (let i = 0; i < w.length; i += size) out.push(w.slice(i, i + size).join(' '));
      }
    }
    // Merge single-word leftovers into their neighbour.
    for (let i = out.length - 1; i > 0; i--) {
      if (wordCount(out[i]) === 1 && wordCount(out[i - 1]) < maxWords + 1) { out[i - 1] += ' ' + out[i]; out.splice(i, 1); }
    }
    return out;
  }

  // Rebuild beats from the script text using simple heuristics (hook / steps / CTA).
  function beatsFromScript(script, hook, oldBeats) {
    const text = String(script || '').replace(/\s+/g, ' ').trim();
    if (!text) return [];
    const sentences = text.match(/[^.!?…]+[.!?…]*["”’)]?\s*/g) || [text];
    let step = 0;
    const out = [];
    const hookWords = wordCount(hook);
    let spoken = 0;
    const visuals = (oldBeats || []).map((b) => b.visual).filter(Boolean);
    sentences.forEach((sRaw, si) => {
      const s = sRaw.trim(); if (!s) return;
      const m = STEP_RE.exec(s);
      if (m && stepNum(m[1]) && spoken >= Math.max(1, hookWords - 1)) step = stepNum(m[1]);
      const isLast = si === sentences.length - 1;
      let sStep = step;
      if (spoken < hookWords) sStep = 0;
      else if (step >= 3 && CTA_RE.test(s) && (isLast || si >= sentences.length - 2) && !m) sStep = 4;
      else if (step === 0 && isLast && CTA_RE.test(s)) sStep = 4;
      for (const c of chunkText(s)) out.push({ text: c, weight: wordCount(c), step: sStep, emphasis: '', visual: '' });
      spoken += wordCount(s);
    });
    const scenes = (oldBeats || []).map((b) => b.scene).filter(Boolean);
    out.forEach((b, i) => { b.visual = visuals[Math.min(visuals.length - 1, Math.round(i * visuals.length / out.length))] || defaultVisual(b.step); });
    // keep the old scene plan where it lines up proportionally, otherwise infer from the words
    out.forEach((b, i) => { if (scenes.length) b.scene = JSON.parse(JSON.stringify(scenes[Math.min(scenes.length - 1, Math.floor(i * scenes.length / out.length))])); });
    attachScenes(out);
    return out;
  }
  // Validate every beat's scene (unknown values are repaired; missing scenes are inferred from the words with continuity).
  function attachScenes(beats, force) {
    const s = SC(); if (!s) return beats;
    let prev = null;
    beats.forEach((b) => { b.scene = s.normalizeScene(force ? null : b.scene, b.text, b.step, prev); prev = b.scene; });
    if (s.diversify) s.diversify(beats.map((b) => b.scene)); // long videos: no endless repeats of one scene
    return beats;
  }
  function defaultVisual(step) {
    return ['Slow push-in on a moody sky or city at night', 'Hands writing in a journal, soft window light', 'Person walking alone, golden hour, shallow focus', 'Calm ocean waves in slow motion', 'Warm lamp-lit desk with a cup of tea'][step] || 'Abstract light leaks';
  }

  function toStr(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 5000); }
  function parseJSONLoose(text) {
    const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try { return JSON.parse(raw); } catch (_) { /* keep going */ }
    const s = raw.indexOf('{'); const e = raw.lastIndexOf('}');
    if (s >= 0 && e > s) return JSON.parse(raw.slice(s, e + 1));
    throw new Error('not json');
  }

  // Validate + repair whatever Gemini returned into a complete package.
  function normalize(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('empty');
    let hooks = (Array.isArray(obj.hooks) ? obj.hooks : []).map((h) => toStr(typeof h === 'object' && h ? h.text : h, 200)).filter(Boolean);
    let script = toStr(obj.script || obj.voiceover, 40000);
    if (!script) throw new Error('no script');
    if (!hooks.length) hooks = [toStr((script.match(/^[^.!?]+[.!?]?/) || [script])[0], 200)];
    while (hooks.length < 3) hooks.push(hooks[0]);
    hooks = hooks.slice(0, 3);
    let beats = (Array.isArray(obj.beats) ? obj.beats : []).map((b) => ({
      text: toStr(b && b.text, 80),
      weight: Math.max(0.5, Math.min(12, Number(b && b.weight) || wordCount(b && b.text) || 1)),
      step: Math.max(0, Math.min(4, Math.round(Number(b && b.step) || 0))),
      emphasis: toStr(b && b.emphasis, 30),
      visual: toStr(b && b.visual, 200),
      scene: b && b.scene,
    })).filter((b) => b.text);
    if (beats.length < 3) beats = beatsFromScript(script, hooks[0], beats);
    attachScenes(beats);
    const hashtags = Array.from(new Set((Array.isArray(obj.hashtags) ? obj.hashtags : String(obj.hashtags || '').split(/[\s,]+/)).map(normHashtag).filter(Boolean))).slice(0, 8);
    if (!hashtags.includes('#shorts') && hashtags.length < 8) hashtags.push('#shorts');
    return {
      hooks, hookIndex: 0, script, beats,
      title: toStr(obj.title, 100) || hooks[0].slice(0, 90),
      description: toStr(obj.description, 3000),
      hashtags,
      pinnedComment: toStr(obj.pinnedComment, 500),
      thumbnailText: toStr(obj.thumbnailText, 60),
    };
  }

  // ---------- long videos: outline -> one Gemini call per section (with context) -> stitch ----------
  const OUTLINE_SCHEMA = {
    type: T.OBJECT,
    properties: {
      hooks: { type: T.ARRAY, description: 'Exactly 3 alternative opening hook lines (max 16 words), strongest first.', items: { type: T.STRING } },
      title: { type: T.STRING, description: 'YouTube title, under 70 characters.' },
      sections: { type: T.ARRAY, description: 'The sections of the video in order. The first section opens with hooks[0]; the last one ends with a soft CTA.', items: { type: T.OBJECT, properties: {
        title: { type: T.STRING, description: '2-6 word chapter title.' }, summary: { type: T.STRING, description: 'What this section says, 1-2 sentences.' },
        points: { type: T.ARRAY, items: { type: T.STRING }, description: '2-4 concrete points, examples or actions.' } }, required: ['title', 'summary', 'points'] } },
      description: { type: T.STRING, description: '3-6 short lines for the description, then a soft CTA line. No hashtags.' },
      hashtags: { type: T.ARRAY, items: { type: T.STRING }, description: '5 to 8 hashtags starting with #.' },
      pinnedComment: { type: T.STRING }, thumbnailText: { type: T.STRING, description: '2-5 punchy words.' },
    },
    required: ['hooks', 'title', 'sections', 'description', 'hashtags', 'pinnedComment', 'thumbnailText'],
  };
  function sectionSchema() {
    const beat = JSON.parse(JSON.stringify(SCHEMA.properties.beats.items)); if (SC()) { beat.properties.scene = sceneSchema(); beat.required = beat.required.concat(['scene']); }
    return { type: T.OBJECT, properties: { text: { type: T.STRING, description: 'The full voiceover of this section only.' }, beats: { type: T.ARRAY, description: 'Caption beats splitting this section text verbatim, 3-6 words each, in order, covering all of it.', items: beat } }, required: ['text', 'beats'] };
  }
  function sectionCount(L) { return Math.max(3, Math.round(L.sec / 80)); }
  function ideaKey(idea, opts) { const g = VTS.gemini; return (g && g.hashText ? g.hashText : (x) => String(x.length))([String(idea || '').trim(), opts.length, opts.tone, opts.language].join('|')); }
  async function callJSON(prompt, schema, system, opts, what) {
    const g = VTS.gemini;
    return g.withRetry(async () => {
      const text = await g.generate([{ role: 'user', parts: [{ text: prompt }] }], { system, json: true, schema, temperature: 0.8, maxTokens: 16384, timeout: 150000 });
      try { return parseJSONLoose(text); } catch (_) { const e = new Error('bad json'); e.status = 503; e.details = String(text).slice(0, 160); throw e; } // retried once more as transient
    }, { tries: 4, base: 5000, signal: opts.signal, onWait: (ms, n, err) => opts.onProgress && opts.onProgress({ phase: 'wait', what, ms, attempt: n, quota: err && (err.status === 429) }) });
  }
  // opts: length, tone, language, handle, partial (saved progress), onPartial(partial), onProgress(info), signal
  async function generateLong(idea, opts) {
    const L = lengthOf(opts.length); const tone = TONES[opts.tone] || TONES.calm; const n = sectionCount(L); const key = ideaKey(idea, opts);
    let partial = opts.partial && opts.partial.key === key ? opts.partial : { key, outline: null, sections: [] };
    const lang = 'Language for every field: ' + (opts.language || 'English') + '.';
    if (!partial.outline) {
      if (opts.onProgress) opts.onProgress({ phase: 'outline', i: 0, n: n + 1 });
      const prompt = ['Plan a ' + L.label + ' YouTube video from my idea below. Make exactly ' + n + ' sections (the video is about ' + L.words[0] + '-' + L.words[1] + ' words in total, about ' + Math.round(L.words[1] / n) + ' words per section).', 'Tone: ' + tone.prompt, lang,
        opts.handle ? 'Channel handle (only for the final CTA if natural): ' + opts.handle : '', '', 'My idea (may be a messy dictation or an outline):', ', String(idea || ).trim().slice(0, 24000), '].filter(Boolean).join('\n');
      const o = await callJSON('OUTLINE REQUEST\n' + prompt, OUTLINE_SCHEMA, SYSTEM_LONG, opts, 'outline');
      const secs = (Array.isArray(o.sections) ? o.sections : []).map((x) => ({ title: toStr(x && x.title, 80), summary: toStr(x && x.summary, 400), points: (Array.isArray(x && x.points) ? x.points : []).map((p) => toStr(p, 200)).slice(0, 5) })).filter((x) => x.title || x.summary);
      if (secs.length < 2) { const e = VTS.gemini.fail('Gemini returned an outline without sections. Try again.'); throw e; }
      partial.outline = Object.assign({}, o, { sections: secs.slice(0, n + 2) });
      if (opts.onPartial) await opts.onPartial(partial);
    }
    const out = partial.outline; const secs = out.sections; const per = Math.round(L.words[1] / secs.length);
    const hooks = (Array.isArray(out.hooks) ? out.hooks : []).map((h) => toStr(h, 200)).filter(Boolean);
    for (let i = partial.sections.length; i < secs.length; i++) {
      if (opts.signal && opts.signal.aborted) throw VTS.gemini.fail('Stopped.');
      if (opts.onProgress) opts.onProgress({ phase: 'section', i: i + 1, n: secs.length + 1, title: secs[i].title });
      const prevText = i > 0 ? partial.sections[i - 1].text : ''; const lastLines = (prevText.match(/[^.!?]+[.!?]+/g) || []).slice(-2).join(' ').trim();
      const prompt = ['SECTION REQUEST ' + (i + 1) + ' of ' + secs.length, 'Write ONLY section ' + (i + 1) + ' ("' + secs[i].title + '") of this ' + L.label + ' video, about ' + per + ' words, as spoken voiceover. ' + lang, 'Tone: ' + tone.prompt,
        i === 0 ? 'This is the opening: start with exactly this hook: "' + (hooks[0] || secs[0].title) + '", then promise what the viewer will learn.' : 'Continue naturally from the previous section, which ended: "' + lastLines + '". Do not repeat the hook or greet again.',
        i === secs.length - 1 ? 'This is the final section: wrap up in 1-2 lines and end with one soft CTA line' + (opts.handle ? ' (you may mention ' + opts.handle + ')' : '') + '.' : 'Do not end the video here; lead into the next section ("' + (secs[i + 1] ? secs[i + 1].title : '') + '").',
        'This section covers: ' + secs[i].summary, 'Points: ' + secs[i].points.join('; '),
        'Beats: split the section text verbatim into beats of 3-6 words; weight = spoken words; step 0 (the CTA beats in the final section use step 4).', SC() ? SCENE_RULES + '\nIn long videos change the setting every 3-6 beats and vary actions, while keeping each beat literal.' : '',
        '', 'Full outline for context:', secs.map((x, k) => (k + 1) + '. ' + x.title + ' — ' + x.summary).join('\n')].filter(Boolean).join('\n');
      const r = await callJSON(prompt, sectionSchema(), SYSTEM_LONG, opts, 'section ' + (i + 1));
      const text = toStr(r.text, 12000).replace(/\s+/g, ' ').trim();
      let beats = (Array.isArray(r.beats) ? r.beats : []).map((b) => ({ text: toStr(b && b.text, 80), weight: Math.max(0.5, Math.min(12, Number(b && b.weight) || wordCount(b && b.text) || 1)), step: i === secs.length - 1 && Number(b && b.step) === 4 ? 4 : 0, emphasis: toStr(b && b.emphasis, 30), visual: toStr(b && b.visual, 200), scene: b && b.scene })).filter((b) => b.text);
      if (!text && !beats.length) throw VTS.gemini.fail('Gemini returned an empty section ' + (i + 1) + '. Tap Write again to resume.');
      const covered = wordCount(beats.map((b) => b.text).join(' '));
      if (beats.length < 3 || covered < wordCount(text) * 0.8) beats = beatsFromScript(text, '', beats).map((b) => Object.assign(b, { step: 0 }));
      partial.sections.push({ title: secs[i].title, text: text || beats.map((b) => b.text).join(' '), beats });
      if (opts.onPartial) await opts.onPartial(partial);
    }
    return stitchLong(partial, hooks);
  }
  function stitchLong(partial, hooks) {
    const o = partial.outline; const beats = [];
    partial.sections.forEach((sec, k) => sec.beats.forEach((b, j) => { const nb = Object.assign({}, b, { section: k }); if (j === 0 && k > 0) nb.chapter = sec.title; if (k === 0 && j < 2) nb.step = 0; beats.push(nb); }));
    attachScenes(beats);
    while (hooks.length < 3) hooks.push(hooks[0] || (partial.sections[0] && partial.sections[0].text.split(/[.!?]/)[0]) || '');
    const hashtags = Array.from(new Set((Array.isArray(o.hashtags) ? o.hashtags : []).map(normHashtag).filter(Boolean))).slice(0, 8);
    return { hooks: hooks.slice(0, 3), hookIndex: 0, script: partial.sections.map((x) => x.text).join('\n\n'), beats, sections: partial.sections.map((x) => ({ title: x.title, text: x.text })), long: true,
      title: toStr(o.title, 100) || hooks[0].slice(0, 90), description: toStr(o.description, 5000) + (partial.sections.length > 2 ? '\n\nChapters:\n' + partial.sections.map((x, k) => (k + 1) + '. ' + x.title).join('\n') : ''), hashtags, pinnedComment: toStr(o.pinnedComment, 500), thumbnailText: toStr(o.thumbnailText, 60) };
  }

  async function generatePackage(idea, opts) {
    const g = VTS.gemini;
    if (opts && isLong(opts.length)) return generateLong(idea, opts);
    const L = lengthOf(opts && opts.length); const sch = schemaWithScenes(); let system = SYSTEM;
    if (L.sec > 60) {
      // 2-min videos use the short (single-call) path: override the 80-110 word rule in the schema and system text too.
      const w = L.words[0] + '-' + L.words[1] + ' words';
      sch.properties.script.description = 'Full voiceover, ' + w + ' (about ' + L.label + ' spoken): hooks[0], then the numbered steps with examples, then a soft CTA.';
      system = SYSTEM + '\nLENGTH OVERRIDE for this request: the full voiceover script must be ' + w + ' (about ' + L.label + ' spoken), not 80-110 words. Use 3 to 5 steps with a concrete example each.';
    }
    const text = await g.generate([{ role: 'user', parts: [{ text: buildPrompt(idea, opts) }] }], { system, json: true, schema: sch, temperature: 0.85, maxTokens: 16384 });
    try { return normalize(parseJSONLoose(text)); } catch (err) {
      const e = g.fail('Gemini returned a script in an unexpected format. Tap “Write my Short” again.');
      e.details = 'Could not parse JSON: ' + String(text).slice(0, 160);
      throw e;
    }
  }

  // Swap the hook: replace the old hook at the start of the script and rebuild the hook beats.
  function applyHook(pkg, index) {
    const oldHook = pkg.hooks[pkg.hookIndex] || '';
    const newHook = pkg.hooks[index] || '';
    pkg.hookIndex = index;
    if (!newHook) return pkg;
    const s = pkg.script.trim();
    if (oldHook && s.startsWith(oldHook.trim())) pkg.script = newHook + s.slice(oldHook.trim().length);
    else if (!s.startsWith(newHook)) {
      // Drop the first sentence if it looks like a hook, then prepend.
      pkg.script = newHook + ' ' + s.replace(/^[^.!?]+[.!?]\s*/, '');
    }
    pkg.script = pkg.script.replace(/\s+/g, ' ').trim();
    rebuildHookBeats(pkg);
    return pkg;
  }

  function rebuildHookBeats(pkg) {
    const hook = pkg.hooks[pkg.hookIndex] || '';
    const rest = pkg.beats.filter((b) => b.step !== 0);
    const first = pkg.beats.find((b) => b.step === 0) || {};
    const vis = first.visual || defaultVisual(0);
    pkg.beats = chunkText(hook).map((c) => ({ text: c, weight: wordCount(c), step: 0, emphasis: '', visual: vis, scene: first.scene ? JSON.parse(JSON.stringify(first.scene)) : null })).concat(rest);
    attachScenes(pkg.beats);
    return pkg;
  }

  async function regenerateScene(pkg, index) {
    const g = VTS.gemini; const s = SC(); const b = pkg.beats[index];
    const ctx = pkg.beats.map((x, i) => (i === index ? '>>> ' : '    ') + x.text + (x.scene ? '  [' + x.scene.setting + ', ' + x.scene.pose + ']' : '')).join('\n');
    const prompt = ['Suggest a NEW, different animated scene for the beat marked >>> in this YouTube Short. Make it literal and visually fresh, but consistent with its neighbours.', SCENE_RULES,
      'Current scene of that beat: ' + JSON.stringify(b.scene || {}), '', 'Script: ' + pkg.script, '', 'Beats:', ctx].join('\n');
    const text = await g.generate([{ role: 'user', parts: [{ text: prompt }] }], { json: true, schema: sceneSchema(), temperature: 1.0 });
    let raw; try { raw = parseJSONLoose(text); } catch (_) { const e = g.fail('Gemini returned an unexpected scene. Try again.'); e.details = String(text).slice(0, 160); throw e; }
    return s.normalizeScene(raw, b.text, b.step, index > 0 ? pkg.beats[index - 1].scene : null);
  }

  VTS.shortgen = { LENGTHS, lengthOf, isLong, generateLong, stitchLong, sectionCount, SYSTEM_LONG, OUTLINE_SCHEMA, sectionSchema, attachScenes, regenerateScene, sceneSchema, schemaWithScenes, rebuildHookBeats, TONES, LANGUAGES, SYSTEM, SCHEMA, buildPrompt, normalize, parseJSONLoose, generatePackage, applyHook, beatsFromScript, chunkText, wordCount, words, normHashtag, splitHook };
}());
