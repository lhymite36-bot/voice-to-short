/* Voice to Short — Decide mode (choose-your-own-adventure horror Shorts).
   Script + choice UI + multi-voice cast. Full 3D Blender EEVEE assemble runs on desktop/PC
   (see tools/decide/). Phone can queue idea → branching script → voice; desktop renders 3D.
   Additive: Voice Short and Comic Recap are untouched. */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {});

  const LENGTHS = [
    { id: '60', label: '60 s', sec: 60, words: [130, 160] },
    { id: '90', label: '90 s', sec: 90, words: [190, 230] },
    { id: '120', label: '2 min', sec: 120, words: [250, 300] },
  ];
  const lengthOf = (id) => LENGTHS.find((l) => l.id === String(id)) || LENGTHS[1];
  const SETTINGS = {
    premise: '',
    length: '90',
    tone: 'horror',
    series: '',
    part: 1,
  };
  const settingsOf = (s) => Object.assign({}, SETTINGS, s || {});

  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const wordCount = (t) => (String(t || '').trim().match(/\S+/g) || []).length;

  /** Beat structure every Decide script must follow. */
  const BEAT_ORDER = [
    'hook', 'setup', 'choice_1',
    'branch_a_1', 'branch_a_2', 'branch_a_fail',
    'rewind',
    'branch_b_1', 'branch_b_2', 'branch_b_3', 'branch_b_4', 'branch_b_peak',
    'cliffhanger',
  ];

  const SCHEMA_HINT = {
    mode: 'decide',
    beats: BEAT_ORDER,
    ui: ['null', 'choice', 'choice_lock', 'rewind', 'cliffhanger'],
    voices: ['Charon', 'Leda', 'Orus', 'Puck', 'Aoede', 'Fenrir'],
    rules: [
      'Original story — never copy airplane / RED-EYE / known series plots',
      'Opening A/B choice with on-screen pills',
      'Short wrong branch A (~15–25s) then REWIND',
      'Longer branch B that gets worse (~40–55s)',
      'End on new cliffhanger A/B + So what would you do?',
      'No Follow CTA',
    ],
  };

  function blankDecide() {
    return {
      premise: '',
      series: '',
      part: 1,
      length: '90',
      tone: 'horror',
      script: null, // full decide script.json shape
    };
  }

  function normalizeDecide(p, fresh) {
    if (fresh || !p.decide) p.decide = blankDecide();
    const d = p.decide;
    p.decide = {
      premise: String(d.premise || ''),
      series: String(d.series || ''),
      part: Math.max(1, parseInt(d.part, 10) || 1),
      length: lengthOf(d.length).id,
      tone: String(d.tone || 'horror'),
      script: d.script && typeof d.script === 'object' ? d.script : null,
    };
    p.mode = 'decide';
  }

  function linesText(script) {
    if (!script || !Array.isArray(script.lines)) return '';
    return script.lines.map((l) => clean(l.text)).filter(Boolean).join('\n');
  }

  function makePkg(script, meta, old) {
    const title = clean((meta && meta.title) || (script && script.title) || (old && old.title) || 'Decide Short');
    const body = linesText(script);
    const hook = clean(script && script.hook || (script && script.lines && script.lines[0] && script.lines[0].text) || title);
    const beats = (script && script.lines || []).map((l, i) => ({
      text: clean(l.caption || l.text),
      keys: Array.isArray(l.highlight) ? l.highlight : null,
      weight: Math.max(1, wordCount(l.text)),
      step: i,
      decide: { id: l.id, ui: l.ui || null, choiceId: l.choiceId || null, choiceKey: l.choiceKey || null, scene: l.scene },
    }));
    return {
      title,
      hook,
      script: body,
      beats,
      steps: beats,
      description: String(meta && meta.description != null ? meta.description : (old && old.description) || (title + '\n\nDecide · choose your path.')),
      hashtags: (meta && meta.hashtags) || (old && old.hashtags) || ['#shorts', '#horror', '#decide', '#whatwouldyoudo', '#fyp'],
      tiktokCaption: (meta && meta.tiktokCaption) || (old && old.tiktokCaption) || (hook + ' 👀 A or B?'),
      thumbnailText: title.slice(0, 40),
      decideScript: script,
      mode: 'decide',
    };
  }

  const JSON_SCHEMA = {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING' },
      series: { type: 'STRING' },
      part: { type: 'INTEGER' },
      hook: { type: 'STRING' },
      question: { type: 'STRING' },
      choices: {
        type: 'OBJECT',
        properties: {
          c1: { type: 'OBJECT', properties: {
            prompt: { type: 'STRING' },
            options: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
              key: { type: 'STRING' }, label: { type: 'STRING' }, color: { type: 'STRING' },
            }, required: ['key', 'label'] } },
          }, required: ['options'] },
          c2: { type: 'OBJECT', properties: {
            prompt: { type: 'STRING' },
            options: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
              key: { type: 'STRING' }, label: { type: 'STRING' }, color: { type: 'STRING' },
            }, required: ['key', 'label'] } },
          }, required: ['options'] },
        },
      },
      lines: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING' },
            speaker: { type: 'STRING' },
            voice: { type: 'STRING' },
            style: { type: 'STRING' },
            text: { type: 'STRING' },
            caption: { type: 'STRING' },
            highlight: { type: 'ARRAY', items: { type: 'STRING' } },
            scene: { type: 'STRING' },
            ui: { type: 'STRING' },
            choiceId: { type: 'STRING' },
            choiceKey: { type: 'STRING' },
          },
          required: ['id', 'speaker', 'voice', 'text', 'caption', 'scene'],
        },
      },
      description: { type: 'STRING' },
      hashtags: { type: 'ARRAY', items: { type: 'STRING' } },
      tiktok_caption: { type: 'STRING' },
    },
    required: ['title', 'hook', 'question', 'choices', 'lines'],
  };

  async function writeScript(opts) {
    const G = VTS.gemini;
    if (!G || !G.generate) throw new Error('Gemini not ready');
    const L = lengthOf(opts && opts.length);
    const premise = clean(opts && opts.premise);
    if (!premise) throw new Error('Add a premise first (where / who / the weird thing).');
    const series = clean(opts && opts.series) || 'DECIDE';
    const part = Math.max(1, parseInt(opts && opts.part, 10) || 1);
    const prompt = [
      'You write ORIGINAL choose-your-own-adventure horror scripts for vertical YouTube Shorts / TikTok.',
      'Format name: Decide. Dark polished 3D horror tone. Multi-voice cast.',
      'Structure EXACTLY:',
      '1) hook (narrator) 2) setup 3) choice_1 UI with A/B labels',
      '4) branch A short WRONG path (2–4 lines) ending badly',
      '5) one line \"Rewind.\" with ui=rewind',
      '6) branch B longer path that feels safer then gets worse (5–7 lines)',
      '7) cliffhanger with NEW A/B and question \"So… what would you do?\"',
      'Voices: narrator=Charon, player/you=Leda, radio/dispatch=Orus, creature/thing=Puck.',
      'Captions: short, punchy, center-screen. highlight = 1–3 emphasis words.',
      'scene ids: short snake_case matching the action (desk_monitor, corridor_walk, …).',
      'ui values: null | choice | choice_lock | rewind | cliffhanger.',
      'On choice_lock lines set choiceId and choiceKey (A or B).',
      'A pills are the dangerous/curious option (red #E23D28); B is the cautious option (green #2ECC71).',
      'Target ~' + L.sec + ' seconds spoken (~' + L.words[0] + '–' + L.words[1] + ' words total).',
      'NEVER copy airplane red-eye, elevator what-if, or any famous series plot. Original only.',
      'No Follow CTA. End on the comment question.',
      'Language: ' + (opts && opts.language || 'English') + '.',
      '',
      'Premise: ' + premise,
      'Series title: ' + series + ' · Part ' + part,
      'Tone: ' + (opts && opts.tone || 'horror'),
      'Return JSON with keys: title, series, part, hook, question, choices{c1,c2}, lines[], description, hashtags, tiktok_caption.',
      'lines[].id unique short ids (hook,s1,s2,a1…,rw,b1…,endq). Each line: id,speaker,voice,style,text,caption,highlight,scene,ui,choiceId,choiceKey.',
    ].join('\n');
    const raw = await G.generate([{ role: 'user', parts: [{ text: prompt }] }], {
      json: true, schema: JSON_SCHEMA, temperature: 0.9, think: 'low', maxTokens: 8192, timeout: 150000, budgetMs: 300000,
    });
    let data = raw;
    if (typeof raw === 'string') {
      try { data = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()); }
      catch (e) { const err = new Error('Gemini Decide reply could not be parsed'); err.details = String(raw).slice(0, 200); throw err; }
    }
    const script = {
      mode: 'decide',
      title: clean(data.title).slice(0, 80) || series + ' — Part ' + part,
      series: clean(data.series) || series,
      part: Number(data.part) || part,
      scenario: 'custom',
      hook: clean(data.hook),
      question: clean(data.question) || 'So… what would you do?',
      target_seconds: L.sec,
      choices: data.choices || {},
      lines: Array.isArray(data.lines) ? data.lines.map(normalizeLine) : [],
      cast: {
        narrator: { voice: 'Charon', role: 'cold cinematic narrator' },
        you: { voice: 'Leda', role: 'player' },
        radio: { voice: 'Orus', role: 'radio' },
        thing: { voice: 'Puck', role: 'threat' },
      },
    };
    if (script.lines.length < 10) throw new Error('Decide script too short — try again.');
    return {
      script,
      description: clean(data.description).slice(0, 1200),
      hashtags: (Array.isArray(data.hashtags) ? data.hashtags : []).map((h) => '#' + String(h).replace(/^#/, '')).slice(0, 8),
      tiktokCaption: clean(data.tiktok_caption || data.tiktokCaption).slice(0, 300),
    };
  }

  function normalizeLine(l) {
    return {
      id: clean(l.id).slice(0, 24) || 'x',
      speaker: clean(l.speaker) || 'narrator',
      voice: clean(l.voice) || 'Charon',
      style: clean(l.style) || 'Calm, cinematic.',
      text: clean(l.text),
      caption: clean(l.caption || l.text).slice(0, 80),
      highlight: Array.isArray(l.highlight) ? l.highlight.map(clean).filter(Boolean).slice(0, 4) : [],
      scene: clean(l.scene) || 'black',
      ui: l.ui && ['choice', 'choice_lock', 'rewind', 'cliffhanger'].includes(l.ui) ? l.ui : null,
      choiceId: l.choiceId ? clean(l.choiceId) : null,
      choiceKey: l.choiceKey === 'A' || l.choiceKey === 'B' ? l.choiceKey : null,
      dur: typeof l.dur === 'number' ? l.dur : undefined,
    };
  }

  /** Desktop helper: export script.json for tools/decide Blender pipeline. */
  function exportScriptJson(script) {
    return JSON.stringify(script, null, 2);
  }

  VTS.decide = {
    LENGTHS, lengthOf, SCHEMA_HINT, BEAT_ORDER,
    blankDecide, normalizeDecide, makePkg, writeScript,
    linesText, wordCount, clean, exportScriptJson, settingsOf,
  };
})();
