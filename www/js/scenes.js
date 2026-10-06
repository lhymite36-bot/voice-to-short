/* Scene vocabulary + a hand-authored flat-vector 2D animation engine (canvas, on-device, free).
   Everything is drawn in a 1080x1920 design space; the caller scales the context. */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {});
  const W = 1080; const H = 1920; const TAU = Math.PI * 2;

  // ======================= vocabulary =======================
  const SETTINGS = [['bedroom-night', 'Bedroom · night'], ['bedroom-day', 'Bedroom · day'], ['office', 'Office / desk'], ['classroom', 'Classroom'], ['street', 'Street'],
    ['cafe', 'Café'], ['park', 'Park'], ['abstract-mind-space', 'Mind space'], ['phone-screen', 'Phone screen'], ['void', 'Plain spotlight']];
  const POSES = [['lying-awake', 'Lying awake'], ['sitting-head-in-hands', 'Head in hands'], ['walking', 'Walking'], ['standing-thinking', 'Thinking'], ['talking', 'Talking'],
    ['celebrating', 'Celebrating'], ['stressed', 'Stressed'], ['scrolling-phone', 'Scrolling phone'], ['sleeping', 'Sleeping'], ['meditating', 'Meditating'], ['running', 'Running']];
  const EMOTIONS = [['neutral', 'Neutral'], ['anxious', 'Anxious'], ['sad', 'Sad'], ['happy', 'Happy'], ['angry', 'Angry'], ['calm', 'Calm'], ['tired', 'Tired'], ['surprised', 'Surprised'],
    // v1.4 cartoon expressions
    ['eye-roll', 'Eye-roll'], ['side-eye', 'Side-eye'], ['shocked', 'Shocked'], ['crying-laughing', 'Crying-laughing'], ['smug', 'Smug'], ['dead-inside', 'Dead inside'], ['panicking', 'Panicking'], ['blushing', 'Blushing'], ['rage', 'Rage'], ['facepalm', 'Facepalm'],
    // v1.6 expressions
    ['confused', 'Confused'], ['disgusted', 'Disgusted'], ['nervous', 'Nervous (sweating)'], ['proud', 'Proud'], ['bored', 'Bored'], ['jealous', 'Jealous'], ['love-struck', 'Love-struck'], ['determined', 'Determined'], ['awkward', 'Awkward smile'], ['crying', 'Crying']];
  const PROPS = [['phone', 'Phone'], ['clock', 'Clock'], ['brain', 'Brain'], ['thought-bubbles', 'Thought bubbles'], ['question-marks', 'Question marks'], ['lightbulb', 'Lightbulb'],
    ['heart', 'Heart'], ['notebook', 'Notebook'], ['coffee', 'Coffee'], ['moon', 'Moon'], ['sun', 'Sun'], ['calendar', 'Calendar'], ['alarm', 'Alarm clock'], ['arrows', 'Arrows'],
    ['checklist', 'Checklist'], ['battery', 'Battery'], ['cloud', 'Cloud'], ['zzz', 'Zzz'], ['sparkles', 'Sparkles'], ['chains', 'Chains'], ['weights', 'Weights'],
    ['stairs', 'Stairs'], ['mirror', 'Mirror'], ['speech-bubbles', 'Speech bubbles'], ['confetti', 'Confetti'], ['exclamation', 'Exclamation']];
  const CAMERAS = [['static', 'Static'], ['zoom-in', 'Slow zoom in'], ['pan', 'Pan'], ['shake', 'Shake']];
  const TRANSITIONS = ['slide', 'zoom', 'wipe', 'pop'];
  const ids = (list) => list.map((x) => x[0]);
  const SET_IDS = ids(SETTINGS); const POSE_IDS = ids(POSES); const EMO_IDS = ids(EMOTIONS); const PROP_IDS = ids(PROPS); const CAM_IDS = ids(CAMERAS);

  const SYN = {
    setting: { bedroom: 'bedroom-night', bed: 'bedroom-night', night: 'bedroom-night', 'bedroom-morning': 'bedroom-day', morning: 'bedroom-day', desk: 'office', work: 'office', workplace: 'office',
      school: 'classroom', class: 'classroom', lecture: 'classroom', city: 'street', road: 'street', outside: 'park', outdoors: 'park', nature: 'park', garden: 'park', forest: 'park',
      'coffee-shop': 'cafe', café: 'cafe', restaurant: 'cafe', mind: 'abstract-mind-space', brain: 'abstract-mind-space', abstract: 'abstract-mind-space', 'mind-space': 'abstract-mind-space', head: 'abstract-mind-space',
      phone: 'phone-screen', screen: 'phone-screen', 'social-media': 'phone-screen', feed: 'phone-screen', plain: 'void', studio: 'void', none: 'void', empty: 'void', spotlight: 'void', blank: 'void' },
    pose: { lying: 'lying-awake', 'in-bed': 'lying-awake', awake: 'lying-awake', insomnia: 'lying-awake', 'head-in-hands': 'sitting-head-in-hands', sitting: 'sitting-head-in-hands', sad: 'sitting-head-in-hands',
      walk: 'walking', pacing: 'walking', thinking: 'standing-thinking', pondering: 'standing-thinking', standing: 'standing-thinking', wondering: 'standing-thinking', speaking: 'talking', explaining: 'talking', teaching: 'talking', talk: 'talking',
      cheering: 'celebrating', jumping: 'celebrating', victory: 'celebrating', happy: 'celebrating', celebrate: 'celebrating', overwhelmed: 'stressed', panicking: 'stressed', panic: 'stressed', stress: 'stressed',
      phone: 'scrolling-phone', texting: 'scrolling-phone', scrolling: 'scrolling-phone', asleep: 'sleeping', sleep: 'sleeping', breathing: 'meditating', relaxing: 'meditating', yoga: 'meditating', meditate: 'meditating',
      jogging: 'running', run: 'running', exercise: 'running' },
    emotion: { nervous: 'nervous', sweating: 'nervous', worried: 'anxious', scared: 'anxious', fear: 'anxious', upset: 'sad', lonely: 'sad', depressed: 'sad', joyful: 'happy', excited: 'happy', proud: 'proud', relieved: 'calm',
      peaceful: 'calm', relaxed: 'calm', mad: 'angry', frustrated: 'angry', annoyed: 'eye-roll', exhausted: 'tired', sleepy: 'tired', amazed: 'surprised', curious: 'surprised', confused: 'confused', puzzled: 'confused', lost: 'confused', disgusted: 'disgusted', gross: 'disgusted', ew: 'disgusted', grossed: 'disgusted', bored: 'bored', boring: 'bored', meh: 'bored', jealous: 'jealous', envious: 'jealous', envy: 'jealous', 'in-love': 'love-struck', lovestruck: 'love-struck', smitten: 'love-struck', love: 'love-struck', determined: 'determined', focused: 'determined', motivated: 'determined', awkward: 'awkward', 'awkward-smile': 'awkward', 'nervous-sweat': 'nervous', crying: 'crying', sobbing: 'crying', tears: 'crying',
      eyeroll: 'eye-roll', 'rolling-eyes': 'eye-roll', unimpressed: 'side-eye', suspicious: 'side-eye', skeptical: 'side-eye', sideeye: 'side-eye', shook: 'shocked', horrified: 'shocked', stunned: 'shocked', laughing: 'crying-laughing', lol: 'crying-laughing', hysterical: 'crying-laughing',
      smirk: 'smug', smirking: 'smug', confident: 'smug', cocky: 'smug', numb: 'dead-inside', empty: 'dead-inside', 'dead': 'dead-inside', drained: 'dead-inside', burnt: 'dead-inside', burnedout: 'dead-inside', panic: 'panicking', panicked: 'panicking', freaking: 'panicking', stressed: 'panicking',
      shy: 'blushing', flustered: 'blushing', embarrassed: 'awkward', crush: 'love-struck', furious: 'rage', livid: 'rage', raging: 'rage', 'face-palm': 'facepalm', cringe: 'facepalm', cringing: 'facepalm', 'why': 'facepalm' },
    prop: { thoughts: 'thought-bubbles', thought: 'thought-bubbles', 'thought-bubble': 'thought-bubbles', 'question-mark': 'question-marks', question: 'question-marks', idea: 'lightbulb', bulb: 'lightbulb', light: 'lightbulb',
      journal: 'notebook', diary: 'notebook', pen: 'notebook', book: 'notebook', tea: 'coffee', mug: 'coffee', cup: 'coffee', stars: 'sparkles', star: 'sparkles', sparkle: 'sparkles', 'alarm-clock': 'alarm',
      arrow: 'arrows', loop: 'arrows', cycle: 'arrows', 'to-do': 'checklist', todo: 'checklist', list: 'checklist', energy: 'battery', rain: 'cloud', storm: 'cloud', clouds: 'cloud', sleep: 'zzz', z: 'zzz', zz: 'zzz',
      chain: 'chains', weight: 'weights', burden: 'weights', dumbbell: 'weights', ladder: 'stairs', steps: 'stairs', staircase: 'stairs', 'stairs-ladder': 'stairs', 'stairs/ladder': 'stairs', reflection: 'mirror',
      speech: 'speech-bubbles', chat: 'speech-bubbles', message: 'speech-bubbles', messages: 'speech-bubbles', conversation: 'speech-bubbles', 'speech-bubble': 'speech-bubbles', party: 'confetti',
      '!': 'exclamation', alert: 'exclamation', hearts: 'heart', love: 'heart', smartphone: 'phone', mobile: 'phone', watch: 'clock', time: 'clock', brains: 'brain', mind: 'brain', 'light-bulb': 'lightbulb' },
    camera: { zoom: 'zoom-in', 'zoom-out': 'zoom-in', 'push-in': 'zoom-in', 'slow-zoom': 'zoom-in', 'pan-left': 'pan', 'pan-right': 'pan', tracking: 'pan', shaky: 'shake', handheld: 'shake', still: 'static', none: 'static' },
  };
  const key = (v) => String(v == null ? '' : v).trim().toLowerCase().replace(/[\s_]+/g, '-');
  function pick(v, list, syn) { const k = key(v); if (!k) return ''; if (list.includes(k)) return k; if (syn[k]) return syn[k]; const hit = list.find((x) => k.includes(x) || x === k.replace(/s$/, '')); return hit || ''; }

  // Keyword heuristics (used when Gemini omits a scene, when beats are rebuilt, and to repair bad values).
  const RULES = [
    [/\b(2\s?a\.?m|3\s?a\.?m|at night|tonight|can'?t sleep|insomnia|lying awake|in bed|pillow|midnight|bedtime)\b/i, { setting: 'bedroom-night', pose: 'lying-awake', emotion: 'anxious', props: ['clock', 'thought-bubbles'] }],
    [/\b(sleep|asleep|fall asleep|rest)\b/i, { setting: 'bedroom-night', pose: 'sleeping', emotion: 'calm', props: ['zzz', 'moon'] }],
    [/\b(phone|scroll|social media|notification|instagram|tiktok|screen|texts?)\b/i, { setting: 'phone-screen', pose: 'scrolling-phone', emotion: 'neutral', props: ['phone'] }],
    [/\b(brain|mind|cortisol|dopamine|neurons?|amygdala|psycholog|memory|memories|rehears)\w*/i, { setting: 'abstract-mind-space', pose: 'standing-thinking', emotion: 'neutral', props: ['brain', 'sparkles'] }],
    [/\b(overthink|replay|thoughts?|worry|worries|ruminat|what if)\w*/i, { setting: 'void', pose: 'stressed', emotion: 'anxious', props: ['thought-bubbles', 'question-marks'] }],
    [/\b(work|job|email|deadline|boss|office|task|productiv)\w*/i, { setting: 'office', pose: 'talking', emotion: 'tired', props: ['coffee', 'checklist'] }],
    [/\b(write|journal|notebook|paper|list it|brain dump)\w*/i, { setting: 'bedroom-day', pose: 'standing-thinking', emotion: 'calm', props: ['notebook', 'lightbulb'] }],
    [/\b(breathe|breath|breathing|meditat|calm down|relax|inhale|exhale)\w*/i, { setting: 'abstract-mind-space', pose: 'meditating', emotion: 'calm', props: ['sparkles'] }],
    [/\b(walk|outside|nature|fresh air|sunlight|morning light)\w*/i, { setting: 'park', pose: 'walking', emotion: 'calm', props: ['sun', 'cloud'] }],
    [/\b(run|exercise|workout|move your body)\w*/i, { setting: 'park', pose: 'running', emotion: 'happy', props: ['sun'] }],
    [/\b(learn|study|school|teacher|lesson)\w*/i, { setting: 'classroom', pose: 'talking', emotion: 'neutral', props: ['lightbulb'] }],
    [/\b(stress|anxious|anxiety|panic|overwhelm)\w*/i, { setting: 'void', pose: 'stressed', emotion: 'anxious', props: ['question-marks', 'weights'] }],
    [/\b(sad|lonely|alone|cry|hurt|cringe|embarrass)\w*/i, { setting: 'bedroom-day', pose: 'sitting-head-in-hands', emotion: 'sad', props: ['cloud'] }],
    [/\b(friend|talk to|conversation|people|tell someone)\w*/i, { setting: 'cafe', pose: 'talking', emotion: 'happy', props: ['speech-bubbles', 'coffee'] }],
    [/\b(tired|exhaust|drain|energy|burn ?out)\w*/i, { setting: 'office', pose: 'sitting-head-in-hands', emotion: 'tired', props: ['battery'] }],
    [/\b(mirror|yourself|self[- ]talk|confidence)\w*/i, { setting: 'bedroom-day', pose: 'standing-thinking', emotion: 'calm', props: ['mirror', 'sparkles'] }],
    [/\b(goal|progress|grow|habit|step by step|level up)\w*/i, { setting: 'void', pose: 'walking', emotion: 'happy', props: ['stairs', 'arrows'] }],
    [/\b(trap|stuck|chain|can'?t escape|loop)\w*/i, { setting: 'void', pose: 'stressed', emotion: 'sad', props: ['chains', 'arrows'] }],
    [/\b(time|clock|minutes?|hours?|timer)\b/i, { setting: 'void', pose: 'standing-thinking', emotion: 'neutral', props: ['clock'] }],
    [/\b(schedule|calendar|tomorrow|week|plan)\w*/i, { setting: 'office', pose: 'standing-thinking', emotion: 'calm', props: ['calendar', 'checklist'] }],
    [/\b(idea|realize|trick|secret|hack|solution|try this)\w*/i, { setting: 'void', pose: 'standing-thinking', emotion: 'surprised', props: ['lightbulb', 'exclamation'] }],
    [/\b(better|happier|win|free|lighter|peace|finally|works?)\b/i, { setting: 'park', pose: 'celebrating', emotion: 'happy', props: ['sparkles', 'confetti'] }],
    [/\b(follow|save this|subscribe|share|comment|like)\b/i, { setting: 'void', pose: 'talking', emotion: 'happy', props: ['heart', 'speech-bubbles'] }],
  ];
  function inferScene(text, step, prev) {
    const t = String(text || '');
    for (const [re, sc] of RULES) if (re.test(t)) return Object.assign({ camera: 'static', callout: '' }, JSON.parse(JSON.stringify(sc)));
    if (prev) return Object.assign({}, prev, { callout: '' });
    const byStep = [
      { setting: 'bedroom-night', pose: 'lying-awake', emotion: 'anxious', props: ['thought-bubbles', 'clock'] },
      { setting: 'void', pose: 'standing-thinking', emotion: 'neutral', props: ['lightbulb'] },
      { setting: 'bedroom-day', pose: 'standing-thinking', emotion: 'calm', props: ['notebook'] },
      { setting: 'park', pose: 'walking', emotion: 'calm', props: ['sun'] },
      { setting: 'void', pose: 'talking', emotion: 'happy', props: ['heart'] },
    ][Math.max(0, Math.min(4, Number(step) || 0))];
    return Object.assign({ camera: 'static', callout: '' }, JSON.parse(JSON.stringify(byStep)));
  }

  const LYING = ['lying-awake', 'sleeping'];
  // Validate + repair a scene spec. Unknown values fall back to the text heuristics, then to safe defaults.
  function normalizeScene(raw, text, step, prev, prefer) {
    const guess = inferScene(text, step, prev);
    const r = raw && typeof raw === 'object' ? raw : {};
    const chars = Array.isArray(r.characters) ? r.characters : (r.character ? [r.character] : []);
    const c0 = chars[0] && typeof chars[0] === 'object' ? chars[0] : {};
    let setting = pick(r.setting || r.background, SET_IDS, SYN.setting) || guess.setting;
    let pose = pick(r.pose || c0.pose, POSE_IDS, SYN.pose) || guess.pose;
    const emotion = pick(r.emotion || c0.emotion, EMO_IDS, SYN.emotion) || guess.emotion || 'neutral';
    let props = (Array.isArray(r.props) ? r.props : String(r.props || '').split(/[,;]+/)).map((p) => pick(typeof p === 'object' && p ? p.name : p, PROP_IDS, SYN.prop)).filter(Boolean);
    if (!Array.isArray(r.props) && !r.props) props = guess.props.slice();
    props = Array.from(new Set(props)).slice(0, 4);
    const camera = pick(r.camera || r.cameraMove, CAM_IDS, SYN.camera) || 'static';
    const callout = String(r.callout || r.text || r.textCallout || '').replace(/\s+/g, ' ').trim().slice(0, 28);
    let count = Number(r.count || r.characterCount || chars.length) || 1;
    // Compatibility repairs.
    if (prefer === 'setting') { // the user picked the setting: adapt the pose instead of moving them to a bedroom
      if (LYING.includes(pose) && !/^bedroom/.test(setting) && !(pose === 'sleeping' && ['office', 'classroom', 'cafe'].includes(setting))) pose = pose === 'sleeping' ? 'meditating' : 'sitting-head-in-hands';
      if (pose === 'running' && !['park', 'street', 'void', 'abstract-mind-space'].includes(setting)) pose = 'walking';
    }
    if (LYING.includes(pose) && !/^bedroom/.test(setting) && !(pose === 'sleeping' && ['office', 'classroom', 'cafe'].includes(setting))) setting = pose === 'sleeping' ? 'bedroom-night' : (setting === 'bedroom-day' ? 'bedroom-day' : 'bedroom-night');
    if (setting === 'phone-screen' && !props.includes('phone')) props = props.slice(0, 3);
    if (pose === 'running' && !['park', 'street', 'void', 'abstract-mind-space'].includes(setting)) setting = 'park';
    count = count >= 2 && pose === 'talking' && !['phone-screen', 'abstract-mind-space'].includes(setting) && !/^bedroom/.test(setting) ? 2 : 1;
    return { setting, pose, emotion, props, camera, callout, count };
  }
  const sceneKey = (s) => s ? [s.setting, s.pose, s.emotion, s.props.join('+'), s.count].join('|') + (s.behind ? '|behind' : '') + (s.weather ? '|' + s.weather : '') : '';

  // ======================= palette =======================
  const ART = {
    teal: { tint: '#0e6a73', amt: 0.1, sat: 1.04, accent: '#ff8a4c', accent2: '#2ec4b6' },
    moody: { tint: '#4a4330', amt: 0.2, sat: 0.72, accent: '#cf8a4f', accent2: '#7c9a86' },
    warm: { tint: '#e0707a', amt: 0.1, sat: 1.0, accent: '#ef6f6c', accent2: '#f6bd60' },
    mono: { tint: '#777777', amt: 0, sat: 0, accent: '#e9e9e9', accent2: '#a0a0a0' },
    neon: { tint: '#5b21b6', amt: 0.18, sat: 1.15, accent: '#ec4899', accent2: '#22d3ee' },
    sage: { tint: '#4a7c59', amt: 0.14, sat: 0.86, accent: '#e9b872', accent2: '#8fb996' },
  };
  function hexRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbHex(r) { return '#' + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
  const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  function mix(a, b, t) { return rgbHex(mixRgb(hexRgb(a), hexRgb(b), t)); }
  const rgba = (hex, a) => { const c = hexRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };

  // Per-setting ambient light (baked into every colour of the shot; much cheaper than full-frame blend passes).
  const AMBIENT = {
    'bedroom-night': ['#2b3f86', 0.34], 'bedroom-day': ['#ffd9a8', 0.06], office: ['#cfe3ff', 0.04], classroom: ['#fff1c9', 0.05], street: ['#ffb27a', 0.08],
    cafe: ['#ffb46b', 0.12], park: ['#fff4c2', 0.04], 'abstract-mind-space': ['#5c4bd6', 0.18], 'phone-screen': ['#233a7a', 0.2], void: ['#000000', 0],
    // v1.6 settings
    hallway: ['#fff1d6', 0.05], 'car-interior': ['#ffd9a8', 0.06], beach: ['#fff2c4', 0.05], 'rooftop-night': ['#2b3f86', 0.3], 'bus-stop': ['#ffcf9e', 0.07], supermarket: ['#e8f4ff', 0.04],
    'mountain-trail': ['#fff4c2', 0.04], 'rainy-street': ['#3a4f7a', 0.22], 'school-yard': ['#fff4c2', 0.04], 'train-platform': ['#d9e4ff', 0.06],
  };

  // ======================= small math / easing =======================
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
  const easeInOut = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const easeOutBack = (x) => { x = clamp01(x); const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const popIn = (x) => (x <= 0 ? 0 : easeOutBack(x));
  function noise(t, seed) { // smooth-ish value noise in [-1, 1]
    const s = seed || 0; return (Math.sin(t * 1.7 + s * 3.1) * 0.5 + Math.sin(t * 2.9 + s * 1.3) * 0.3 + Math.sin(t * 5.3 + s * 7.7) * 0.2);
  }
  function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  // Two-bone IK (rubber-hose friendly: stretches slightly when out of reach).
  function ik(sx, sy, tx, ty, l1, l2, bend) {
    const dx = tx - sx; const dy = ty - sy; let d = Math.hypot(dx, dy) || 0.001;
    const reach = l1 + l2;
    if (d >= reach * 0.999) { const k = l1 / reach; return [sx + dx * k, sy + dy * k]; }
    d = Math.max(d, Math.abs(l1 - l2) + 0.01);
    const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    const base = Math.atan2(dy, dx) + a * (bend >= 0 ? 1 : -1);
    return [sx + Math.cos(base) * l1, sy + Math.sin(base) * l1];
  }

  // ======================= poses =======================
  // Rig coordinates: origin at the hips, +y down, ~1 unit = 1 px at scale 1. Standing height ≈ 580.
  const SH = { x: 66, y: -176 }; const HIP = { x: 36, y: 6 }; const ARM = [98, 94]; const LEG = [93, 93];
  function poseSpec(pose, t, o) {
    const sp = {
      hipY: 0, tilt: 0, headTilt: 0, headDx: 0, headDy: 0, facing: 0,
      armL: { x: -92, y: -6, bend: -1 }, armR: { x: 92, y: -6, bend: 1 },
      legL: { x: -44, y: 190, bend: 1 }, legR: { x: 44, y: 190, bend: -1 },
      look: { x: 0, y: 0 }, mouth: null, handsFront: false, holding: null, lotus: false, seated: false, breathe: 1,
    };
    const sway = Math.sin(t * 1.3) * 0.02;
    switch (pose) {
      case 'standing-thinking': {
        sp.tilt = sway; sp.headTilt = 0.14 + Math.sin(t * 0.9) * 0.04;
        sp.armR = { x: 58, y: -206 + Math.sin(t * 2) * 3, el: { x: 130, y: -126 }, bend: 1 }; sp.armL = { x: -94, y: -4, bend: -1 };
        sp.look = { x: 0.55, y: -0.7 }; sp.mouth = 'hmm'; sp.handsFront = true; break;
      }
      case 'talking': {
        const g = Math.sin(t * 3.1); const g2 = Math.sin(t * 2.3 + 1);
        sp.tilt = Math.sin(t * 1.9) * 0.025; sp.headTilt = Math.sin(t * 2.6) * 0.06; sp.headDy = Math.abs(Math.sin(t * 5)) * -4;
        sp.armR = { x: 150 + g * 16, y: -150 - Math.max(0, g) * 70, bend: 1 };
        sp.armL = { x: -96 - Math.max(0, g2) * 60, y: -10 - Math.max(0, g2) * 110, bend: -1 };
        sp.mouth = 'talk'; sp.look = { x: 0, y: 0 }; break;
      }
      case 'celebrating': {
        const j = Math.abs(Math.sin(t * 5.2)); const wave = Math.sin(t * 10.4) * 18;
        sp.hipY = -j * 46; sp.headTilt = Math.sin(t * 5.2) * 0.08;
        sp.armL = { x: -196 - wave * 0.5, y: -300 + wave, bend: -1 }; sp.armR = { x: 196 + wave * 0.5, y: -300 - wave, bend: 1 };
        sp.legL = { x: -52, y: 190 - j * 30, bend: 1 }; sp.legR = { x: 52, y: 190 - j * 30, bend: -1 };
        sp.mouth = 'grin'; break;
      }
      case 'stressed': {
        const jit = noise(t * 6, 3) * 0.035;
        sp.tilt = jit; sp.headTilt = -jit * 1.5 + Math.sin(t * 7) * 0.03;
        sp.armL = { x: -96, y: -318, bend: -1 }; sp.armR = { x: 96, y: -318, bend: 1 }; sp.handsFront = true;
        sp.legL = { x: -58, y: 188, bend: 1 }; sp.legR = { x: 58, y: 188, bend: -1 }; sp.hipY = 8;
        sp.look = { x: Math.sign(Math.sin(t * 2.2)) * 0.7, y: -0.1 }; break;
      }
      case 'sitting-head-in-hands': {
        sp.seated = true; sp.headDy = 26; sp.headTilt = Math.sin(t * 0.8) * 0.05;
        sp.armL = { x: -44, y: -236, bend: -1 }; sp.armR = { x: 44, y: -236, bend: 1 }; sp.handsFront = true;
        sp.legL = { x: -70, y: 160, bend: -1 }; sp.legR = { x: 70, y: 160, bend: 1 };
        sp.look = { x: 0, y: 0.8 }; sp.breathe = 1.6; break;
      }
      case 'scrolling-phone': {
        const tap = Math.max(0, Math.sin(t * 4.4)) * 6;
        sp.headDy = 10; sp.headTilt = -0.06; sp.armR = { x: 34, y: -150 - tap, bend: 1 }; sp.armL = { x: -6, y: -138, bend: -1 };
        sp.look = { x: 0.1, y: 0.75 }; sp.holding = 'phone'; break;
      }
      case 'walking': case 'running': {
        const run = pose === 'running'; const p = t * TAU * (run ? 2.3 : 1.5); const amp = run ? 92 : 58;
        sp.facing = o && o.facing ? o.facing : 1; sp.tilt = run ? 0.14 * sp.facing : 0.03 * sp.facing; sp.hipY = -Math.abs(Math.sin(p)) * (run ? 20 : 9);
        sp.legL = { x: Math.sin(p) * amp * sp.facing, y: 190 - Math.max(0, Math.cos(p)) * (run ? 60 : 22), bend: -sp.facing };
        sp.legR = { x: Math.sin(p + Math.PI) * amp * sp.facing, y: 190 - Math.max(0, Math.cos(p + Math.PI)) * (run ? 60 : 22), bend: -sp.facing };
        if (run) {
          sp.armL = { x: 10 + Math.sin(p + Math.PI) * 70 * sp.facing, y: -96 - Math.max(0, Math.sin(p + Math.PI) * sp.facing) * 30, bend: sp.facing };
          sp.armR = { x: -10 + Math.sin(p) * 70 * sp.facing, y: -96 - Math.max(0, Math.sin(p) * sp.facing) * 30, bend: sp.facing };
        } else {
          sp.armL = { x: -14 + Math.sin(p + Math.PI) * 60 * sp.facing, y: -12, bend: sp.facing };
          sp.armR = { x: 14 + Math.sin(p) * 60 * sp.facing, y: -12, bend: sp.facing };
        }
        sp.look = { x: 0.8 * sp.facing, y: 0 }; break;
      }
      case 'meditating': {
        sp.lotus = true; sp.hipY = -16 + Math.sin(t * 1.3) * 12; sp.breathe = 2.2;
        sp.armL = { x: -128, y: 36, bend: -1 }; sp.armR = { x: 128, y: 36, bend: 1 };
        sp.mouth = 'smile'; break;
      }
      default: if (VTS.sceneExt && VTS.sceneExt.pose) VTS.sceneExt.pose(pose, sp, t, o); break;
    }
    return sp;
  }

  function faceFor(emotion, pose) {
    const f = { eyes: 'dot', brow: [0, 0], mouth: 'smallsmile', blush: false, tear: false, sweat: false, steam: false, bags: false, dart: false };
    switch (emotion) {
      case 'anxious': Object.assign(f, { eyes: 'wide', brow: [-10, 6], mouth: 'wavy', sweat: true, dart: true }); break;
      case 'sad': Object.assign(f, { eyes: 'dot', brow: [-12, 8], mouth: 'frown', tear: true }); break;
      case 'happy': Object.assign(f, { eyes: 'happy', brow: [-8, -8], mouth: 'grin', blush: true }); break;
      case 'angry': Object.assign(f, { eyes: 'dot', brow: [12, -8], mouth: 'grit', steam: true, blush: true }); break;
      case 'calm': Object.assign(f, { eyes: 'closed', brow: [-2, -2], mouth: 'smile' }); break;
      case 'tired': Object.assign(f, { eyes: 'half', brow: [-4, 4], mouth: 'flat', bags: true }); break;
      case 'surprised': Object.assign(f, { eyes: 'wide', brow: [-18, -18], mouth: 'o' }); break;
      case 'eye-roll': Object.assign(f, { eyes: 'roll', brow: [-6, -10], mouth: 'flat' }); break;
      case 'side-eye': Object.assign(f, { eyes: 'side', brow: [10, -4], mouth: 'hmm' }); break;
      case 'shocked': Object.assign(f, { eyes: 'shock', brow: [-22, -22], mouth: 'scream', gloom: true, sweat: true }); break;
      case 'crying-laughing': Object.assign(f, { eyes: 'happy', brow: [-10, -6], mouth: 'grin', laughTears: true, blush: true }); break;
      case 'smug': Object.assign(f, { eyes: 'half', brow: [6, -12], mouth: 'smirk', blush: true }); break;
      case 'dead-inside': Object.assign(f, { eyes: 'dead', brow: [0, 2], mouth: 'flat', bags: true, gloom: true }); break;
      case 'panicking': Object.assign(f, { eyes: 'wide', brow: [-14, 8], mouth: 'wavy', sweat: true, sweats: true, dart: true, fastDart: true }); break;
      case 'blushing': Object.assign(f, { eyes: 'dot', brow: [-8, 2], mouth: 'smallsmile', blush: true, blushBig: true, lookDown: true }); break;
      case 'rage': Object.assign(f, { eyes: 'dot', brow: [16, -12], mouth: 'grit', steam: true, blush: true, redFace: true }); break;
      case 'facepalm': Object.assign(f, { eyes: 'closed', brow: [-8, 6], mouth: 'flat', palm: true }); break;
      // v1.6
      case 'confused': Object.assign(f, { eyes: 'dot', brow: [-4, 0], mouth: 'wavy', asym: true, qmark: true }); break;
      case 'disgusted': Object.assign(f, { eyes: 'half', brow: [12, -2], mouth: 'disgust', green: true }); break;
      case 'nervous': Object.assign(f, { eyes: 'wide', brow: [-12, 6], mouth: 'grimace', sweat: true, sweats: true }); break;
      case 'proud': Object.assign(f, { eyes: 'closed', brow: [-10, -12], mouth: 'smile', blush: true, sparkle: true }); break;
      case 'bored': Object.assign(f, { eyes: 'half', brow: [0, 2], mouth: 'flat', lookSide: true }); break;
      case 'jealous': Object.assign(f, { eyes: 'side', brow: [14, -6], mouth: 'frown', green: true }); break;
      case 'love-struck': Object.assign(f, { eyes: 'heart', brow: [-10, -8], mouth: 'grin', blush: true, hearts: true }); break;
      case 'determined': Object.assign(f, { eyes: 'sparkle', brow: [16, -4], mouth: 'set', fire: true }); break;
      case 'awkward': Object.assign(f, { eyes: 'dot', brow: [-8, 4], mouth: 'grimace', sweat: true, lookSide: true }); break;
      case 'crying': Object.assign(f, { eyes: 'closed', brow: [-14, 8], mouth: 'wail', cryStreams: true }); break;
      default: break;
    }
    if (pose === 'sleeping') Object.assign(f, { eyes: 'closed', mouth: 'smallo', dart: false, sweat: false, tear: false });
    if (pose === 'meditating' && emotion !== 'happy') f.eyes = 'closed';
    if (pose === 'lying-awake' && f.eyes === 'closed') f.eyes = 'half';
    return f;
  }

  // ======================= stage (drawing) =======================
  class Stage {
    constructor() { this.colCache = new Map(); this.bgCache = new Map(); this.setPreset('teal'); this.amb = null; this.lw = 7; }
    setPreset(id) { this.pid = ART[id] ? id : 'teal'; this.art = ART[this.pid]; this.colCache.clear(); this.bgCache.clear(); }
    grade(rgb) {
      const a = this.art;
      let c = a.amt ? mixRgb(rgb, hexRgb(a.tint), a.amt) : rgb;
      const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
      c = [l + (c[0] - l) * a.sat, l + (c[1] - l) * a.sat, l + (c[2] - l) * a.sat];
      if (this.pid === 'mono') c = c.map((v) => 128 + (v - 128) * 1.12);
      return c;
    }
    // Lit colour (scene ambient + grade) and emissive colour (grade only).
    c(hex) { const k = hex + '|' + (this.amb ? this.amb[0] + this.amb[1] : ''); let v = this.colCache.get(k); if (!v) { let rgb = hexRgb(hex); if (this.amb && this.amb[1]) { const am = hexRgb(this.amb[0]); const l = (0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]) / 255; rgb = mixRgb(rgb, am.map((x) => x * (0.35 + 0.65 * l)), this.amb[1]); } v = rgbHex(this.grade(rgb)); this.colCache.set(k, v); } return v; }
    e(hex) { const k = 'e' + hex; let v = this.colCache.get(k); if (!v) { v = rgbHex(this.grade(hexRgb(hex))); this.colCache.set(k, v); } return v; }
    ca(hex, a) { return rgba(this.c(hex), a); }
    ea(hex, a) { return rgba(this.e(hex), a); }
    get OL() { return this.c('#1d2034'); }
    // fill + outline helper for the current path
    fs(ctx, fill, lw) { ctx.fillStyle = fill; ctx.fill(); if (lw !== 0) { ctx.lineWidth = lw || this.lw; ctx.strokeStyle = this.OL; ctx.lineJoin = 'round'; ctx.stroke(); } }
    limb(ctx, pts, w, color) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.strokeStyle = this.OL; ctx.lineWidth = w + this.lw * 2; ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
    }
    pal(variant) {
      const a = this.art; const amb0 = this.amb; if (amb0) this.amb = [amb0[0], amb0[1] * 0.5];
      try { return this.pal2(variant, a); } finally { this.amb = amb0; }
    }
    pal2(variant, a) {
      const v = variant === 1
        ? { skin: '#c68b62', skinS: '#a86f4b', hair: '#231a1c', top: a.accent2, pants: '#4a3d63', shoe: '#2b2b33', long: true }
        : variant === 6 ? { skin: '#e9b48e', skinS: '#cf9670', hair: '#c4682b', top: '#6fbf73', pants: '#3b4a5c', shoe: '#f6f2ea', long: false } // v1.6 background extra
        : variant === 7 ? { skin: '#8d5a3b', skinS: '#734429', hair: '#1b1416', top: '#f2a541', pants: '#2f3e57', shoe: '#ffffff', long: true }
        : { skin: '#f3c6a0', skinS: '#dea27c', hair: '#3b2828', top: a.accent, pants: '#33405f', shoe: '#f6f2ea', long: false };
      return { skin: this.c(v.skin), skinS: this.c(v.skinS), hair: this.c(v.hair), top: this.c(v.top), topS: this.c(mix(v.top, '#1a1030', 0.22)), pants: this.c(v.pants), shoe: this.c(v.shoe), long: v.long, blush: this.ca('#ff6f7d', 0.42) };
    }

    // ---------- head ----------
    head(ctx, pal, face, t, o) {
      const f = o.facing || 0; const fx = f * 24; const lw = this.lw; const OL = this.OL;
      if (pal.headBehind) pal.headBehind(ctx, this, face, t, f);
      const blinkT = (t + (o.seed || 0) * 1.7) % 3.6; const blink = face.eyes === 'closed' || face.eyes === 'happy' ? 1 : (blinkT < 0.14 ? Math.abs(Math.cos(blinkT / 0.14 * Math.PI)) : 1);
      if (pal.headShape) pal.headShape(ctx, this, face, t, f); else {
      if (pal.long) { ctx.beginPath(); ctx.moveTo(-104, -20); ctx.bezierCurveTo(-112, 60, -100, 118, -70, 126); ctx.lineTo(70, 126); ctx.bezierCurveTo(100, 118, 112, 60, 104, -20); ctx.closePath(); this.fs(ctx, pal.hair); }
      // ears
      [-1, 1].forEach((s) => { if (f && s === -f) return; ctx.beginPath(); ctx.arc(s * 88 + fx * 0.3, 10, 19, 0, TAU); this.fs(ctx, pal.skin); ctx.beginPath(); ctx.arc(s * 88 + fx * 0.3, 10, 8, 0, TAU); ctx.fillStyle = pal.skinS; ctx.fill(); });
      ctx.beginPath(); ctx.ellipse(0, 0, 92, 90, 0, 0, TAU); this.fs(ctx, pal.skin);
      // soft shade on the face edge
      ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, 88, 86, 0, 0, TAU); ctx.clip(); ctx.beginPath(); ctx.ellipse(-f * 30 + 30, 18, 92, 96, 0, 0, TAU); ctx.rect(-200, -200, 400, 400); ctx.fillStyle = rgba(pal.skinS, 0.35); ctx.fill('evenodd'); ctx.restore();
      if (face.redFace) { ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, 90, 88, 0, 0, TAU); ctx.clip(); const g = ctx.createLinearGradient(0, -90, 0, 60); g.addColorStop(0, 'rgba(230,40,40,0.55)'); g.addColorStop(1, 'rgba(230,40,40,0.08)'); ctx.fillStyle = g; ctx.fillRect(-100, -100, 200, 200); ctx.restore(); }
      if (face.gloom) { ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, 90, 88, 0, 0, TAU); ctx.clip(); ctx.strokeStyle = 'rgba(70,80,160,0.55)'; ctx.lineWidth = 5; for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(k * 16 + fx * 0.5, -88); ctx.lineTo(k * 16 + fx * 0.5, -40 - Math.abs(k) * 6); ctx.stroke(); } ctx.restore(); }
      if (face.blush) { const bb = face.blushBig ? 1.7 : 1; ctx.fillStyle = face.blushBig ? rgba('#ff4f6d', 0.55) : pal.blush; ctx.beginPath(); ctx.ellipse(fx - 52, 36, 17 * bb, 10 * bb, 0, 0, TAU); ctx.ellipse(fx + 52, 36, 17 * bb, 10 * bb, 0, 0, TAU); ctx.fill();
        if (face.blushBig) { ctx.strokeStyle = rgba('#d6334f', 0.7); ctx.lineWidth = 3.5; [-1, 1].forEach((sd) => { for (let q = 0; q < 3; q++) { ctx.beginPath(); ctx.moveTo(fx + sd * 52 - 14 + q * 12, 30); ctx.lineTo(fx + sd * 52 - 20 + q * 12, 44); ctx.stroke(); } }); } }
      if (face.steam) { ctx.fillStyle = this.ca('#ff3b3b', 0.16); ctx.beginPath(); ctx.ellipse(0, 20, 86, 70, 0, 0, TAU); ctx.fill(); }
      // hair
      ctx.beginPath();
      if (pal.long) {
        ctx.moveTo(-96, 12); ctx.bezierCurveTo(-106, -74, -48, -112, 6, -108); ctx.bezierCurveTo(66, -106, 110, -64, 96, 14);
        ctx.bezierCurveTo(84, -24, 58, -42, 26, -46); ctx.bezierCurveTo(8, -30, -40, -24, -62, -36); ctx.bezierCurveTo(-78, -20, -88, -6, -96, 12);
      } else {
        ctx.moveTo(-95, 4); ctx.bezierCurveTo(-106, -82, -46, -118, 8, -112); ctx.bezierCurveTo(72, -108, 108, -60, 95, 6);
        ctx.bezierCurveTo(86, -26, 70, -40, 44, -46); ctx.bezierCurveTo(36, -30, 12, -26, -2, -44); ctx.bezierCurveTo(-18, -30, -52, -34, -66, -48); ctx.bezierCurveTo(-80, -28, -90, -12, -95, 4);
      }
      ctx.closePath(); this.fs(ctx, pal.hair);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(-6, -30, 70, -2.5, -1.9); ctx.stroke();
      }
      if (pal.headShape && face.blush) { ctx.fillStyle = face.blushBig ? rgba('#ff4f6d', 0.6) : pal.blush; ctx.beginPath(); ctx.ellipse(fx - 52, 40, 18, 11, 0, 0, TAU); ctx.ellipse(fx + 52, 40, 18, 11, 0, 0, TAU); ctx.fill(); }
      // eyes
      const look = o.look || { x: 0, y: 0 };
      const dart = face.dart ? { x: Math.sign(Math.sin(t * (face.fastDart ? 9 : 3.3) + 0.5)) * 0.8, y: Math.sin(t * 1.7) * 0.3 } : (face.lookDown ? { x: 0.3, y: 0.8 } : look);
      ctx.lineCap = 'round';
      [-1, 1].forEach((s) => {
        const ex = fx + s * 32 * (f ? 0.8 : 1); const ey = 10;
        if (f && s === -f) { /* far eye slightly smaller in profile */ }
        ctx.save(); ctx.translate(ex, ey);
        const mode = face.eyes;
        if (mode === 'wide') {
          ctx.beginPath(); ctx.ellipse(0, 0, 19, 22 * Math.max(0.12, blink), 0, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = lw * 0.6; ctx.strokeStyle = OL; ctx.stroke();
          if (blink > 0.3) { ctx.beginPath(); ctx.arc(dart.x * 7, dart.y * 7, 9, 0, TAU); ctx.fillStyle = OL; ctx.fill(); ctx.beginPath(); ctx.arc(dart.x * 7 - 3, dart.y * 7 - 3, 3, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); }
        } else if (mode === 'happy') {
          ctx.beginPath(); ctx.moveTo(-13, 6); ctx.quadraticCurveTo(0, -14, 13, 6); ctx.lineWidth = 6.5; ctx.strokeStyle = OL; ctx.stroke();
        } else if (mode === 'closed') {
          ctx.beginPath(); ctx.moveTo(-13, 0); ctx.quadraticCurveTo(0, 11, 13, 0); ctx.lineWidth = 6; ctx.strokeStyle = OL; ctx.stroke();
        } else if (mode === 'roll') { // eye-roll: whites with the pupils rolled up under a heavy lid
          ctx.beginPath(); ctx.ellipse(0, 0, 18, 20, 0, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = lw * 0.6; ctx.strokeStyle = OL; ctx.stroke();
          ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, 18, 20, 0, 0, TAU); ctx.clip(); ctx.beginPath(); ctx.arc(s * 3, -15, 9, 0, TAU); ctx.fillStyle = OL; ctx.fill(); ctx.restore();
          ctx.beginPath(); ctx.moveTo(-19, -4); ctx.lineTo(19, -4); ctx.lineWidth = 5; ctx.strokeStyle = OL; ctx.stroke();
        } else if (mode === 'side') { // side-eye: half lid, pupils slammed to one side
          ctx.beginPath(); ctx.ellipse(0, 3, 18, 13, 0, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = lw * 0.6; ctx.strokeStyle = OL; ctx.stroke();
          ctx.save(); ctx.beginPath(); ctx.ellipse(0, 3, 18, 13, 0, 0, TAU); ctx.clip(); ctx.beginPath(); ctx.arc(-11, 5, 8.5, 0, TAU); ctx.fillStyle = OL; ctx.fill(); ctx.restore();
          ctx.beginPath(); ctx.moveTo(-21, -8); ctx.quadraticCurveTo(0, -12, 21, -8); ctx.lineWidth = 6; ctx.strokeStyle = OL; ctx.stroke();
        } else if (mode === 'shock') { // huge white eyes, tiny pupils
          const k = 1 + 0.06 * Math.sin(t * 40);
          ctx.beginPath(); ctx.ellipse(0, -2, 24 * k, 28 * k, 0, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.strokeStyle = OL; ctx.stroke();
          ctx.beginPath(); ctx.arc(0, -2, 4.5, 0, TAU); ctx.fillStyle = OL; ctx.fill();
        } else if (mode === 'dead') { // dead inside: hollow rings, no shine
          ctx.beginPath(); ctx.arc(0, 2, 11, 0, TAU); ctx.lineWidth = 4.5; ctx.strokeStyle = OL; ctx.stroke(); ctx.beginPath(); ctx.arc(0, 2, 3, 0, TAU); ctx.fillStyle = OL; ctx.fill();
          ctx.beginPath(); ctx.moveTo(-15, -9); ctx.lineTo(15, -9); ctx.lineWidth = 5; ctx.stroke();
        } else if (mode === 'heart') { // love-struck: pulsing heart eyes
          const k = 1 + 0.12 * Math.sin(t * 7); ctx.save(); ctx.scale(k, k); ctx.beginPath(); ctx.moveTo(0, 14); ctx.bezierCurveTo(-26, -2, -16, -24, 0, -10); ctx.bezierCurveTo(16, -24, 26, -2, 0, 14); ctx.closePath(); ctx.fillStyle = this.e('#ff3b6b'); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OL; ctx.stroke(); ctx.restore();
        } else if (mode === 'sparkle') { // determined: big glossy pupils
          ctx.beginPath(); ctx.ellipse(0, 0, 13, 16 * Math.max(0.1, blink), 0, 0, TAU); ctx.fillStyle = OL; ctx.fill();
          if (blink > 0.5) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-4, -6, 4.8, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(4, 5, 2.4, 0, TAU); ctx.fill(); }
        } else if (mode === 'half') {
          ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.ellipse(0, 0, 12, 12 * blink, 0, 0, Math.PI); ctx.closePath(); ctx.fillStyle = OL; ctx.fill();
          ctx.beginPath(); ctx.moveTo(-16, -1); ctx.lineTo(16, -1); ctx.lineWidth = 6; ctx.strokeStyle = OL; ctx.stroke();
        } else {
          const lk = face.lookDown ? { x: 0.3, y: 0.8 } : face.lookSide ? { x: 0.9, y: 0.1 } : look;
          ctx.beginPath(); ctx.ellipse(lk.x * 4, lk.y * 4, 10.5, 14 * Math.max(0.1, blink), 0, 0, TAU); ctx.fillStyle = OL; ctx.fill();
          if (blink > 0.5) { ctx.beginPath(); ctx.arc(lk.x * 4 - 3, lk.y * 4 - 5, 3.6, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); }
        }
        if (face.bags) { ctx.beginPath(); ctx.moveTo(-12, 20); ctx.quadraticCurveTo(0, 28, 12, 20); ctx.lineWidth = 4; ctx.strokeStyle = rgba(pal.skinS, 0.9); ctx.stroke(); }
        // brow: [inner, outer] offsets
        let inner = face.brow[0]; let outer = face.brow[1]; if (face.asym) { if (s > 0) { inner -= 14; outer -= 20; } else { inner += 6; outer += 4; } }
        ctx.beginPath(); ctx.moveTo(-s * 15, -30 + outer * (s < 0 ? 1 : 1)); ctx.lineTo(s * 13, -30 + inner);
        if (s > 0) { ctx.beginPath(); ctx.moveTo(-13, -30 + inner); ctx.lineTo(15, -30 + outer); } else { ctx.beginPath(); ctx.moveTo(-15, -30 + outer); ctx.lineTo(13, -30 + inner); }
        ctx.lineWidth = 7; ctx.strokeStyle = pal.hair; ctx.stroke();
        ctx.restore();
      });
      // nose
      ctx.beginPath(); ctx.moveTo(fx + f * 8 - 6, 28); ctx.quadraticCurveTo(fx + f * 14, 36, fx + f * 8 + 6, 28); ctx.lineWidth = 4.5; ctx.strokeStyle = pal.skinS; ctx.stroke();
      // mouth
      ctx.save(); ctx.translate(fx + f * 6, 52);
      let m = o.mouth === 'talk' || (this._forceTalk && face.mouth !== 'scream') ? 'talk' : (o.mouth || face.mouth);
      if (o.mouth === 'hmm' && face.mouth !== 'smallsmile') m = face.mouth;
      const dark = this.c('#6d2430');
      ctx.lineWidth = 5.5; ctx.strokeStyle = OL; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (m === 'talk') {
        const open = this._mouthOpen != null ? this._mouthOpen : 4 + 13 * Math.abs(noise(t * 7, 2)); const happy = face.mouth === 'grin' || face.mouth === 'smile';
        ctx.beginPath(); if (happy) { ctx.moveTo(-18, -4); ctx.quadraticCurveTo(0, open * 2.2, 18, -4); ctx.closePath(); } else ctx.ellipse(0, 2, 15, open, 0, 0, TAU);
        ctx.fillStyle = dark; ctx.fill(); ctx.stroke();
      } else if (m === 'grin') {
        ctx.beginPath(); ctx.moveTo(-27, -6); ctx.quadraticCurveTo(0, 42, 27, -6); ctx.closePath(); ctx.fillStyle = dark; ctx.fill();
        ctx.save(); ctx.clip(); ctx.beginPath(); ctx.ellipse(0, 20, 14, 9, 0, 0, TAU); ctx.fillStyle = this.c('#ff8a95'); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-27, -8, 54, 8); ctx.restore();
        ctx.beginPath(); ctx.moveTo(-27, -6); ctx.quadraticCurveTo(0, 42, 27, -6); ctx.closePath(); ctx.stroke();
      } else if (m === 'smile') { ctx.beginPath(); ctx.moveTo(-20, -2); ctx.quadraticCurveTo(0, 16, 20, -2); ctx.stroke(); }
      else if (m === 'smallsmile') { ctx.beginPath(); ctx.moveTo(-12, 0); ctx.quadraticCurveTo(0, 9, 12, 0); ctx.stroke(); }
      else if (m === 'frown') { ctx.beginPath(); ctx.moveTo(-18, 10); ctx.quadraticCurveTo(0, -7, 18, 10); ctx.stroke(); }
      else if (m === 'flat') { ctx.beginPath(); ctx.moveTo(-14, 4); ctx.lineTo(14, 4); ctx.stroke(); }
      else if (m === 'o' || m === 'smallo') { const r = m === 'o' ? 1 : 0.5; ctx.beginPath(); ctx.ellipse(0, 4, 12 * r, 15 * r, 0, 0, TAU); ctx.fillStyle = dark; ctx.fill(); ctx.stroke(); }
      else if (m === 'wavy') { ctx.beginPath(); ctx.moveTo(-20, 4); ctx.bezierCurveTo(-13, -4, -7, -4, 0, 4); ctx.bezierCurveTo(7, 12, 13, 12, 20, 4); ctx.stroke(); }
      else if (m === 'grit') { ctx.beginPath(); ctx.rect(-22, -6, 44, 19); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-22, 3.5); ctx.lineTo(22, 3.5); for (let k = -11; k <= 11; k += 11) { ctx.moveTo(k, -6); ctx.lineTo(k, 13); } ctx.stroke(); }
      else if (m === 'hmm') { ctx.beginPath(); ctx.moveTo(-8, 4); ctx.quadraticCurveTo(4, 0, 14, -2); ctx.stroke(); }
      else if (m === 'smirk') { ctx.beginPath(); ctx.moveTo(-16, 4); ctx.quadraticCurveTo(6, 10, 22, -8); ctx.stroke(); ctx.beginPath(); ctx.moveTo(18, -12); ctx.lineTo(24, -4); ctx.lineWidth = 4; ctx.stroke(); }
      else if (m === 'grimace') { ctx.beginPath(); ctx.moveTo(-26, -2); ctx.quadraticCurveTo(0, 6, 26, -2); ctx.lineTo(24, 12); ctx.quadraticCurveTo(0, 20, -24, 12); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-25, 6); ctx.quadraticCurveTo(0, 13, 25, 6); for (let k = -12; k <= 12; k += 12) { ctx.moveTo(k, 0); ctx.lineTo(k, 17); } ctx.stroke(); }
      else if (m === 'disgust') { ctx.beginPath(); ctx.moveTo(-20, 6); ctx.bezierCurveTo(-12, -4, -6, -2, 0, 4); ctx.bezierCurveTo(6, 10, 12, 8, 20, -2); ctx.stroke(); ctx.beginPath(); ctx.ellipse(6, 12, 9, 11, 0.2, 0, Math.PI); ctx.fillStyle = this.c('#ff8a95'); ctx.fill(); ctx.stroke(); }
      else if (m === 'wail') { const op = 1 + 0.12 * Math.sin(t * 9); ctx.beginPath(); ctx.moveTo(-24, 18 * op); ctx.quadraticCurveTo(0, -16 * op, 24, 18 * op); ctx.quadraticCurveTo(0, 8, -24, 18 * op); ctx.closePath(); ctx.fillStyle = dark; ctx.fill(); ctx.stroke(); }
      else if (m === 'set') { ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-16, 6); ctx.quadraticCurveTo(0, 2, 16, 6); ctx.stroke(); }
      else if (m === 'scream') { const op = this._mouthOpen != null ? 0.75 + this._mouthOpen / 40 : 1 + 0.1 * Math.sin(t * 30); ctx.beginPath(); ctx.ellipse(0, 10, 20, 28 * op, 0, 0, TAU); ctx.fillStyle = dark; ctx.fill(); ctx.stroke(); ctx.save(); ctx.clip(); ctx.beginPath(); ctx.ellipse(0, 30, 12, 9, 0, 0, TAU); ctx.fillStyle = this.c('#ff8a95'); ctx.fill(); ctx.restore(); }
      ctx.restore();
      // emotion extras
      if (face.tear) { const p = (t * 0.7) % 1; ctx.save(); ctx.globalAlpha = 1 - p; ctx.translate(fx - 36, 30 + p * 70); this.drop(ctx, 9, this.e('#7cc8ff')); ctx.restore(); }
      if (face.laughTears) { [-1, 1].forEach((sd) => { for (let q = 0; q < 2; q++) { const p = (t * 1.6 + q * 0.5) % 1; ctx.save(); ctx.globalAlpha = 1 - p; ctx.translate(fx + sd * (44 + p * 60), 14 + p * 40 - Math.sin(p * Math.PI) * 30); this.drop(ctx, 9, this.e('#7cc8ff')); ctx.restore(); } }); }
      if (face.sweats) { [[-80, -30], [-70, 10], [84, -10]].forEach(([dx, dy], q) => { const p = (t * 0.9 + q * 0.33) % 1; ctx.save(); ctx.globalAlpha = Math.min(1, (1 - p) * 2); ctx.translate(dx, dy + p * 50); this.drop(ctx, 10, this.e('#9fdcff')); ctx.restore(); }); }
      if (face.sweat) { const p = (t * 0.45) % 1; ctx.save(); ctx.globalAlpha = Math.min(1, (1 - p) * 2); ctx.translate(-f * 60 + 74, -46 + p * 50); this.drop(ctx, 13, this.e('#9fdcff')); ctx.restore(); }
      if (face.steam) { for (let k = 0; k < 3; k++) { const p = (t * 0.8 + k / 3) % 1; ctx.beginPath(); ctx.arc((k - 1) * 60 + Math.sin(p * 6 + k) * 10, -120 - p * 90, 16 + p * 16, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * (1 - p)) + ')'; ctx.fill(); } }
      if (face.green) { ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, 90, 88, 0, 0, TAU); ctx.clip(); const g = ctx.createLinearGradient(0, -90, 0, 30); g.addColorStop(0, 'rgba(90,170,70,0.55)'); g.addColorStop(1, 'rgba(90,170,70,0)'); ctx.fillStyle = g; ctx.fillRect(-100, -100, 200, 200); ctx.restore(); }
      if (face.cryStreams) { ctx.save(); ctx.fillStyle = this.ea('#7cc8ff', 0.85); [-1, 1].forEach((sd) => { const x0 = fx + sd * 32; ctx.beginPath(); ctx.moveTo(x0 - 7, 16); ctx.quadraticCurveTo(x0 + sd * 6 - 9, 60, x0 + sd * 10 - 8, 92); ctx.lineTo(x0 + sd * 10 + 8, 92); ctx.quadraticCurveTo(x0 + sd * 6 + 9, 60, x0 + 7, 16); ctx.closePath(); ctx.fill(); for (let q = 0; q < 2; q++) { const p = (t * 1.4 + q * 0.5) % 1; ctx.globalAlpha = 1 - p; ctx.beginPath(); ctx.arc(x0 + sd * (12 + p * 30), 96 + p * 80, 8, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; } }); ctx.restore(); }
      if (face.qmark) { const b = Math.sin(t * 3) * 6; ctx.save(); ctx.translate(96, -120 + b); ctx.rotate(0.2); ctx.font = '900 92px Montserrat, "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 10; ctx.strokeStyle = OL; ctx.strokeText('?', 0, 0); ctx.fillStyle = this.e('#ffd166'); ctx.fillText('?', 0, 0); ctx.restore(); }
      if (face.sparkle || face.hearts || face.fire) {
        for (let q = 0; q < 3; q++) { const p = (t * 0.8 + q / 3) % 1; const x = (q - 1) * 80 + Math.sin(q * 2 + t) * 10; const y = -110 - p * 90; const a = Math.sin(p * Math.PI);
          ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a; ctx.scale(0.6 + a * 0.5, 0.6 + a * 0.5);
          if (face.hearts) { ctx.beginPath(); ctx.moveTo(0, 12); ctx.bezierCurveTo(-22, -2, -14, -20, 0, -8); ctx.bezierCurveTo(14, -20, 22, -2, 0, 12); ctx.closePath(); ctx.fillStyle = this.e('#ff4f7d'); ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = OL; ctx.stroke(); }
          else if (face.fire) { if (q === 1) { ctx.beginPath(); ctx.moveTo(0, -26); ctx.quadraticCurveTo(18, -4, 12, 10); ctx.quadraticCurveTo(0, 20, -12, 10); ctx.quadraticCurveTo(-18, -4, 0, -26); ctx.closePath(); ctx.fillStyle = this.e('#ff8a3d'); ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = OL; ctx.stroke(); } }
          else { ctx.beginPath(); for (let k = 0; k < 8; k++) { const r = k % 2 ? 6 : 18; const an = k / 8 * TAU; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); } ctx.closePath(); ctx.fillStyle = this.e('#ffe066'); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OL; ctx.stroke(); }
          ctx.restore(); }
      }
      if (pal.headAfter) pal.headAfter(ctx, this, face, t, f);
    }
    drop(ctx, r, color) {
      ctx.beginPath(); ctx.moveTo(0, -r * 1.8); ctx.bezierCurveTo(r * 0.6, -r * 0.8, r, -r * 0.1, r, r * 0.3); ctx.arc(0, r * 0.3, r, 0, Math.PI); ctx.bezierCurveTo(-r, -r * 0.1, -r * 0.6, -r * 0.8, 0, -r * 1.8); ctx.closePath();
      ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = this.OL; ctx.stroke();
      ctx.beginPath(); ctx.arc(-r * 0.35, r * 0.1, r * 0.25, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fill();
    }
    phoneShape(ctx, w, h, lit, t) {
      ctx.beginPath(); roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.18); this.fs(ctx, this.c('#23263a'));
      ctx.beginPath(); roundRect(ctx, -w / 2 + 5, -h / 2 + 8, w - 10, h - 16, w * 0.1); ctx.fillStyle = lit ? this.e('#9fd4ff') : this.c('#3a4060'); ctx.fill();
      if (lit) { ctx.fillStyle = this.ea('#ffffff', 0.7); for (let k = 0; k < 3; k++) { const y = -h / 2 + 18 + ((k * 22 + t * 30) % (h - 30)); ctx.fillRect(-w / 2 + 11, y, w - 22, 8); } }
    }

    // ---------- full character (standing / sitting / moving / meditating) ----------
    character(ctx, x, groundY, scale, pose, emotion, t, o) {
      o = o || {};
      const sp = poseSpec(pose, t + (o.seed || 0) * 0.37, o);
      if (o.desk) { // seated behind a desk: only the upper body shows
        sp.seated = true; sp.legL = { x: -60, y: 170, bend: -1 }; sp.legR = { x: 60, y: 170, bend: 1 };
        if (pose === 'talking') { const k = Math.sin(t * 18) * 5; sp.armL = { x: -70, y: -52 + k, bend: -1 }; sp.armR = { x: 70, y: -52 - k, bend: 1 }; sp.mouth = null; sp.look = { x: 0.3, y: 0.55 }; sp.handsFront = false; }
        if (pose === 'standing-thinking') { sp.armL = { x: -70, y: -52, bend: -1 }; }
        if (pose === 'sleeping') { sp.headDy = 110; sp.headTilt = 1.2; sp.armL = { x: -40, y: -80, bend: -1 }; sp.armR = { x: 40, y: -80, bend: 1 }; }
        if (pose === 'celebrating' || pose === 'walking' || pose === 'running') { sp.hipY = 0; sp.legL = { x: -60, y: 170, bend: -1 }; sp.legR = { x: 60, y: 170, bend: 1 }; sp.facing = 0; }
      }
      if (o.poseT != null && o.poseT < 0.35) { const k = o.poseT / 0.35; sp.hipY += Math.sin(k * Math.PI) * -18; }
      const face = faceFor(emotion, pose);
      if (sp.eyesClosed && emotion !== 'surprised') face.eyes = emotion === 'happy' ? 'happy' : 'closed';
      if (sp.crying) Object.assign(face, { tear: true, mouth: 'frown', eyes: 'closed', brow: [-12, 8] });
      if (sp.cameraFace) face.hidden = true;
      const pal = this.pal(o.variant || 0);
      if (face.palm) { sp.handsFront = true; sp.armR = { x: 34, y: -296 + sp.headDy, bend: 1 }; sp.holding = null; }
      if (o.expr) Object.assign(face, o.expr);
      const f = sp.facing;
      let hipX = x; let hipY;
      if (sp.lotus) hipY = groundY - 70 * scale + sp.hipY * scale;
      else if (sp.seated) hipY = o.seatY != null ? o.seatY : groundY - 150 * scale;
      else hipY = groundY - 196 * scale + sp.hipY * scale;
      const cos = Math.cos(sp.tilt); const sin = Math.sin(sp.tilt);
      const toWorld = (lx, ly) => [hipX + scale * (lx * cos - ly * sin), hipY + scale * (lx * sin + ly * cos)];
      const toLocal = (wx, wy) => { const dx = (wx - hipX) / scale; const dy = (wy - hipY) / scale; return [dx * cos + dy * sin, -dx * sin + dy * cos]; };
      if (o.targetR) { const q = toLocal(o.targetR[0], o.targetR[1]); sp.armR = { x: q[0], y: q[1], bend: 1 }; }
      if (o.targetL) { const q = toLocal(o.targetL[0], o.targetL[1]); sp.armL = { x: q[0], y: q[1], bend: -1 }; }
      const br = 1 + Math.sin(t * 2.1 * (1 / sp.breathe)) * 0.012 * sp.breathe;
      const headLocal = [sp.headDx + (f ? f * 8 : 0), -292 * br + sp.headDy];
      ctx.save(); ctx.translate(hipX, hipY); ctx.scale(scale, scale);
      const lw = this.lw; const tw = f ? 0.8 : 1;
      // legs (world-aligned, not tilted)
      const drawLegs = () => {
        if (sp.lotus) return;
        const seatDy = sp.seated && o.seatY != null ? (groundY - o.seatY) / scale - 16 : null;
        [sp.legL, sp.legR].forEach((L, i) => {
          const hx = (i ? 1 : -1) * HIP.x * tw; const fy = seatDy != null ? seatDy : L.y;
          const kn = sp.seated ? [hx + (i ? 1 : -1) * 34, 30] : ik(hx, HIP.y, L.x, fy - 14, LEG[0], LEG[1], L.bend);
          this.limb(ctx, [hx, HIP.y, kn[0], kn[1], L.x, fy - 14], 50, pal.pants);
          const dir = f || (i ? 1 : -1) * 0.35;
          ctx.beginPath(); ctx.ellipse(L.x + dir * 14, fy + 2, 36, 19, 0, 0, TAU); this.fs(ctx, pal.shoe);
          ctx.beginPath(); ctx.moveTo(L.x + dir * 14 - 30, fy + 8); ctx.lineTo(L.x + dir * 14 + 30, fy + 8); ctx.lineWidth = 4; ctx.strokeStyle = rgba(this.OL, 0.35); ctx.stroke();
        });
      };
      if (!o.desk) drawLegs();
      ctx.rotate(sp.tilt);
      const arm = (A, side) => {
        const sx = side * SH.x * tw; const sy = SH.y * br;
        const el = A.el ? [A.el.x, A.el.y] : ik(sx, sy, A.x, A.y, ARM[0], ARM[1], A.bend);
        this.limb(ctx, [sx, sy, el[0], el[1], A.x, A.y], 40, pal.top);
        ctx.beginPath(); ctx.arc(A.x, A.y, 21, 0, TAU); this.fs(ctx, pal.skin);
      };
      const phoneInHand = () => {
        if (sp.holding !== 'phone' && !o.phone) return;
        const A = sp.armR; ctx.save(); ctx.translate(A.x - 6, A.y - 38); ctx.rotate(-0.12); this.phoneShape(ctx, 62, 108, true, t); ctx.restore();
        ctx.beginPath(); ctx.arc(A.x, A.y, 21, 0, TAU); this.fs(ctx, pal.skin);
        ctx.beginPath(); ctx.arc(sp.armL.x, sp.armL.y, 21, 0, TAU); this.fs(ctx, pal.skin);
      };
      if (f) arm(f > 0 ? sp.armL : sp.armR, f > 0 ? -1 : 1);
      // torso (hoodie)
      ctx.save(); ctx.scale(tw, br);
      ctx.beginPath(); ctx.ellipse(0, -182, 62, 26, 0, 0, TAU); this.fs(ctx, pal.topS);
      ctx.beginPath(); ctx.moveTo(-58, -188); ctx.quadraticCurveTo(-84, -186, -88, -150); ctx.lineTo(-94, 0); ctx.quadraticCurveTo(-94, 20, -74, 20); ctx.lineTo(74, 20); ctx.quadraticCurveTo(94, 20, 94, 0); ctx.lineTo(88, -150); ctx.quadraticCurveTo(84, -186, 58, -188); ctx.closePath();
      this.fs(ctx, pal.top);
      ctx.save(); ctx.clip(); ctx.fillStyle = rgba(pal.topS, 0.55); ctx.fillRect(f >= 0 ? 40 : -100, -200, 60, 240); ctx.fillRect(-100, 2, 200, 20); ctx.restore();
      ctx.lineWidth = 4.5; ctx.strokeStyle = rgba(this.OL, 0.55); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-50, -70); ctx.quadraticCurveTo(0, -80, 50, -70); ctx.lineTo(56, -14); ctx.lineTo(-56, -14); ctx.closePath(); ctx.stroke();
      if (!f) { ctx.beginPath(); ctx.moveTo(-16, -176); ctx.lineTo(-18, -122); ctx.moveTo(16, -176); ctx.lineTo(18, -122); ctx.strokeStyle = this.c('#f4efe6'); ctx.lineWidth = 5; ctx.stroke(); }
      ctx.restore();
      if (sp.lotus) { // crossed legs in front of the hips
        [[-1, 0], [1, 1]].forEach(([s]) => { ctx.beginPath(); ctx.moveTo(-s * 150, 30); ctx.quadraticCurveTo(-s * 150, -6, -s * 90, -2); ctx.lineTo(s * 40, 12); ctx.quadraticCurveTo(s * 70, 20, s * 60, 44); ctx.lineTo(-s * 120, 60); ctx.quadraticCurveTo(-s * 156, 60, -s * 150, 30); ctx.closePath(); this.fs(ctx, pal.pants); });
        [-1, 1].forEach((s) => { ctx.beginPath(); ctx.ellipse(s * 62, 40, 30, 16, s * 0.3, 0, TAU); this.fs(ctx, pal.shoe); });
      }
      if (!sp.handsFront) { if (!f) { arm(sp.armL, -1); arm(sp.armR, 1); } else arm(f > 0 ? sp.armR : sp.armL, f > 0 ? 1 : -1); }
      ctx.save(); ctx.translate(headLocal[0], headLocal[1]); ctx.rotate(sp.headTilt);
      this.head(ctx, pal, face, t, { facing: f, look: sp.look, mouth: sp.mouth, seed: o.seed });
      ctx.restore();
      if (sp.handsFront) { if (!f) { arm(sp.armL, -1); arm(sp.armR, 1); } else arm(f > 0 ? sp.armR : sp.armL, f > 0 ? 1 : -1); }
      phoneInHand();
      if (sp.holding === 'phone' || o.phone) { // screen glow on the face
        const g = ctx.createRadialGradient(headLocal[0], headLocal[1] + 60, 10, headLocal[0], headLocal[1] + 40, 170);
        g.addColorStop(0, this.ea('#bfe3ff', 0.34 + 0.08 * Math.sin(t * 3))); g.addColorStop(1, this.ea('#bfe3ff', 0));
        ctx.fillStyle = g; ctx.globalCompositeOperation = 'lighter'; ctx.fillRect(headLocal[0] - 180, headLocal[1] - 120, 360, 360); ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
      if (o.desk) { /* legs hidden by the desk */ }
      const hw = toWorld(headLocal[0], headLocal[1]);
      if (VTS.sceneExt && VTS.sceneExt.afterCharacter) VTS.sceneExt.afterCharacter(this, ctx, sp, { hipX, hipY, scale, headLocal, toWorld, pal, t, o, pose });
      return { head: { x: hw[0], y: hw[1], r: 92 * scale }, handR: toWorld(sp.armR.x, sp.armR.y), handL: toWorld(sp.armL.x, sp.armL.y), hip: [hipX, hipY], scale, top: hw[1] - 110 * scale, tilt: sp.tilt, skin: pal.skin, sp };
    }

    // ---------- character lying in bed (head on pillow, blanket) ----------
    lying(ctx, hx, hy, scale, pose, emotion, t, o) {
      const pal = this.pal(0); const face = faceFor(emotion, pose);
      const awake = pose === 'lying-awake';
      // tossing and turning: a turn every ~2.4 s with a quick squash
      const period = 2.4; const n = Math.floor(t / period); const ph = (t % period) / period;
      const side = awake ? (n % 2 ? 1 : -1) : 1; const prev = awake ? -side : side;
      const turnK = awake ? easeInOut(ph / 0.22) : 1;
      const tilt = (prev + (side - prev) * turnK) * 0.3 + (awake ? 0 : 0.2);
      const squash = awake ? Math.sin(clamp01(ph / 0.22) * Math.PI) * 0.06 : 0;
      const breath = Math.sin(t * (awake ? 2.2 : 1.3)) * (awake ? 5 : 9);
      const right = o.bedRight || 1080;
      ctx.save(); ctx.translate(hx, hy); ctx.scale(scale, scale);
      // blanket body
      const bx = 40; const by = 30; const bump = side * 10 * turnK;
      const blanket = this.c(o.blanket || '#5b7fbf');
      ctx.beginPath(); ctx.moveTo(bx, by - 30 + breath * 0.3);
      ctx.bezierCurveTo(bx + 110, by - 96 - breath + bump, bx + 250, by - 110 - breath, bx + 330, by - 72 - breath * 0.6);
      ctx.bezierCurveTo(bx + 420, by - 40, bx + 470, by - 92 + bump, bx + 560, by - 86);
      ctx.bezierCurveTo((right - hx) / scale, by - 80, (right - hx) / scale + 40, by - 40, (right - hx) / scale + 40, by + 20);
      ctx.lineTo((right - hx) / scale + 40, by + 130); ctx.lineTo(bx - 70, by + 130); ctx.quadraticCurveTo(bx - 90, by + 20, bx, by - 30 + breath * 0.3); ctx.closePath();
      this.fs(ctx, blanket);
      ctx.save(); ctx.clip();
      ctx.fillStyle = this.c('#e9eef8'); ctx.beginPath(); ctx.moveTo(bx - 90, by - 44); ctx.bezierCurveTo(bx + 60, by - 110 - breath, bx + 140, by - 70, bx + 200, by - 40 - breath * 0.4); ctx.lineTo(bx + 200, by + 10); ctx.lineTo(bx - 90, by + 10); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(this.OL, 0.28); ctx.lineWidth = 5; ctx.beginPath();
      for (let k = 0; k < 4; k++) { ctx.moveTo(bx + 260 + k * 110, by - 40); ctx.quadraticCurveTo(bx + 290 + k * 110, by + 30, bx + 250 + k * 110, by + 110); }
      ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.moveTo(bx - 90, by + 10); ctx.bezierCurveTo(bx, by + 4, bx + 120, by + 2, bx + 200, by + 10); ctx.lineWidth = 5; ctx.strokeStyle = rgba(this.OL, 0.5); ctx.stroke();
      // head on the pillow
      ctx.save(); ctx.translate(-20, -40); ctx.rotate(tilt - 0.15); ctx.scale(1 + squash, 1 - squash);
      this.head(ctx, pal, face, t, { facing: 0, look: awake ? { x: Math.sin(t * 0.7) * 0.6, y: -0.6 } : { x: 0, y: 0 }, seed: 1 });
      ctx.restore();
      let handPos = null;
      if (o.phone) { // arm out of the blanket holding a glowing phone
        const px = 150; const py = -170 + Math.sin(t * 1.1) * 6;
        this.limb(ctx, [bx + 120, by - 50, px + 30, py + 90, px + 6, py + 40], 40, pal.top);
        ctx.save(); ctx.translate(px, py); ctx.rotate(-0.35); this.phoneShape(ctx, 70, 120, true, t); ctx.restore();
        ctx.beginPath(); ctx.arc(px + 8, py + 40, 21, 0, TAU); this.fs(ctx, pal.skin);
        const g = ctx.createRadialGradient(px - 40, py, 10, px - 60, py + 10, 260);
        g.addColorStop(0, this.ea('#bfe3ff', 0.42 + 0.1 * Math.sin(t * 2.7))); g.addColorStop(1, this.ea('#bfe3ff', 0));
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(px - 330, py - 260, 560, 520); ctx.globalCompositeOperation = 'source-over';
        handPos = [hx + scale * px, hy + scale * py];
      }
      ctx.restore();
      return { head: { x: hx - 20 * scale, y: hy - 40 * scale, r: 92 * scale }, handR: handPos, scale, top: hy - 150 * scale };
    }

    // ======================= settings: layout =======================
    kindFor(setting, pose) {
      if (setting === 'phone-screen') return 'none';
      if (pose === 'lying-awake' || (pose === 'sleeping' && /^bedroom/.test(setting)) || (pose === 'scrolling-phone' && setting === 'bedroom-night')) return 'lie';
      if (['office', 'classroom', 'cafe'].includes(setting) && ['talking', 'standing-thinking', 'sitting-head-in-hands', 'stressed', 'scrolling-phone', 'sleeping'].includes(pose)) {
        if (setting === 'classroom' && pose === 'talking') return 'stand';
        return 'desk';
      }
      if (pose === 'walking' || pose === 'running') return 'move';
      if (pose === 'meditating') return 'floor';
      if (pose === 'sitting-head-in-hands') return 'sit';
      return 'stand';
    }
    layout(setting, kind, scene) {
      const L = { charX: 540, groundY: 1700, scale: 1.12, caption: 'top', anchors: { wall: [], table: [], sky: [], float: [[210, 930], [870, 930], [200, 1260], [880, 1260]] }, scroll: false };
      const bedroom = /^bedroom/.test(setting);
      if (bedroom) {
        L.anchors.wall = [[190, 860]]; L.anchors.table = [[150, 1246]]; L.anchors.sky = [[780, 820]];
        if (kind === 'lie') { L.bed = { hx: 450, hy: 1300, scale: 1.02 }; L.zoom = 1.14; L.zoomAt = [600, 1230]; L.anchors.float = [[250, 900], [900, 1120], [560, 820]]; }
        else if (kind === 'sit') { L.charX = 690; L.seatY = 1350; L.groundY = 1620; L.scale = 1.0; }
        else if (kind === 'floor') { L.charX = 600; L.groundY = 1720; L.scale = 1.1; }
        else { L.charX = 600; L.groundY = 1740; L.scale = 1.14; }
      } else if (setting === 'office') {
        L.anchors.wall = [[800, 800]]; L.anchors.table = [[180, 1352], [905, 1352]]; L.anchors.sky = [[280, 760]];
        if (kind === 'desk') { L.desk = 'office'; L.seatY = 1400; L.scale = 1.1; L.groundY = 1640; }
        else { L.charX = 560; L.groundY = 1760; }
      } else if (setting === 'classroom') {
        L.anchors.wall = [[880, 1180]]; L.anchors.table = [[220, 1375], [860, 1375]];
        if (kind === 'desk') { L.desk = 'classroom'; L.seatY = 1420; L.scale = 1.08; L.groundY = 1640; }
        else { L.charX = 720; L.groundY = 1760; L.scale = 1.1; }
      } else if (setting === 'cafe') {
        L.anchors.table = [[330, 1368], [760, 1368]]; L.anchors.wall = [[860, 1020]]; L.anchors.sky = [[340, 800]];
        if (kind === 'desk') { L.desk = 'cafe'; L.seatY = 1350; L.scale = 1.05; L.groundY = 1690; }
        else { L.groundY = 1760; }
      } else if (setting === 'street' || setting === 'park') {
        L.anchors.sky = [[820, 700], [260, 720]]; L.groundY = 1690; L.scroll = kind === 'move';
        if (setting === 'park' && kind === 'sit') { L.seatY = 1470; L.groundY = 1650; L.scale = 1.05; L.bench = true; }
      } else if (setting === 'abstract-mind-space') {
        L.groundY = 1700; L.platform = true; if (scene && scene.props.includes('brain')) { L.bigBrain = true; L.scale = 0.9; L.groundY = 1740; }
      } else if (setting === 'phone-screen') {
        L.bigPhone = true; L.anchors.float = [[90, 900], [990, 1000], [90, 1300], [990, 1400]];
      } else { // void
        L.spot = true; L.scale = 1.2; L.groundY = 1700;
      }
      if (kind === 'move' && !L.scroll) L.pace = true; // indoor walking = pacing back and forth
      if (scene && scene.count === 2) { L.charX = 350; L.charX2 = 760; L.scale = Math.min(L.scale, 1.0); }
      return L;
    }

    // ======================= settings: static backgrounds =======================
    staticBg(ctx, setting, kind, L) {
      const c = (h) => this.c(h); const e = (h) => this.e(h);
      const vgrad = (y0, y1, stops) => { const g = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
      const night = setting === 'bedroom-night';
      if (/^bedroom/.test(setting)) {
        ctx.fillStyle = vgrad(0, 1500, night ? [[0, c('#1a2a55')], [1, c('#2b3f72')]] : [[0, c('#f7dfc8')], [1, c('#f0c9aa')]]); ctx.fillRect(0, 0, W, 1500);
        ctx.fillStyle = night ? c('#22335f') : c('#f2d2b6'); for (let x = 0; x < W; x += 90) ctx.fillRect(x, 0, 40, 1500);
        ctx.globalAlpha = 1;
        // window
        const wx = 600; const wy = 640; const ww = 360; const wh = 370;
        ctx.fillStyle = night ? vgrad(wy, wy + wh, [[0, e('#0a1440')], [1, e('#2d3a78')]]) : vgrad(wy, wy + wh, [[0, e('#7cc8f7')], [1, e('#d6f0ff')]]); ctx.fillRect(wx, wy, ww, wh);
        if (night) { const r = (k) => hash(k * 3.7); ctx.fillStyle = e('#fff6d8'); for (let k = 0; k < 26; k++) { ctx.beginPath(); ctx.arc(wx + 14 + r(k) * (ww - 28), wy + 14 + r(k + 50) * (wh * 0.7), 1.5 + r(k + 9) * 2.5, 0, TAU); ctx.fill(); } }
        else { ctx.fillStyle = e('#ffffff'); [[690, 900, 1], [860, 760, 0.8]].forEach(([x, y, s]) => this.cloudShape(ctx, x, y, 70 * s, false)); ctx.fillStyle = e('#7bbf7a'); ctx.beginPath(); ctx.ellipse(780, wy + wh + 40, 260, 110, 0, 0, TAU); ctx.fill(); }
        ctx.lineWidth = 22; ctx.strokeStyle = c(night ? '#cdbfa8' : '#fff7ee'); ctx.strokeRect(wx, wy, ww, wh); ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh); ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();
        ctx.fillStyle = c(night ? '#bfb29c' : '#fff3e3'); ctx.fillRect(wx - 30, wy + wh + 8, ww + 60, 22);
        // curtains
        const cur = c(night ? '#6a5aa0' : '#f2a49a'); const curS = c(night ? '#54478a' : '#de8b82');
        [[wx - 70, 1], [wx + ww + 70, -1]].forEach(([x, s]) => { ctx.beginPath(); ctx.moveTo(x - 60 * s, wy - 60); ctx.lineTo(x + 70 * s, wy - 60); ctx.bezierCurveTo(x + 40 * s, wy + 200, x + 90 * s, wy + 330, x + 40 * s, wy + wh + 120); ctx.lineTo(x - 60 * s, wy + wh + 120); ctx.closePath(); ctx.fillStyle = cur; ctx.fill(); ctx.fillStyle = curS; ctx.fillRect(Math.min(x - 30 * s, x - 10 * s), wy - 60, 14, wh + 180); });
        ctx.fillStyle = c('#3b2d2a'); ctx.fillRect(wx - 150, wy - 74, ww + 300, 14);
        if (night) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = vgrad(wy, 1900, [[0, this.ea('#8fb0ff', 0.13)], [1, this.ea('#8fb0ff', 0)]]); ctx.beginPath(); ctx.moveTo(wx, wy + wh); ctx.lineTo(wx + ww, wy + wh); ctx.lineTo(wx + ww - 60, 1900); ctx.lineTo(wx - 260, 1900); ctx.closePath(); ctx.fill(); ctx.restore(); }
        // fairy lights string
        ctx.strokeStyle = c('#2a2233'); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 150); ctx.quadraticCurveTo(270, 250, 540, 160); ctx.quadraticCurveTo(810, 250, 1080, 150); ctx.stroke();
        if (!night) { const fl = [this.art.accent, this.art.accent2, '#ffd166', '#ef8fa0']; for (let k = 0; k < 12; k++) { const x = 45 + k * 90; const y = 158 + (x < 540 ? Math.sin(x / 540 * Math.PI) : Math.sin((x - 540) / 540 * Math.PI)) * 45; ctx.beginPath(); ctx.moveTo(x - 30, y - 4); ctx.lineTo(x + 30, y - 4); ctx.lineTo(x, y + 52); ctx.closePath(); ctx.fillStyle = c(fl[k % 4]); ctx.fill(); } }
        // floor + rug
        ctx.fillStyle = vgrad(1480, 1920, night ? [[0, c('#1f2a4d')], [1, c('#151c36')]] : [[0, c('#c89770')], [1, c('#b07f5b')]]); ctx.fillRect(0, 1480, W, 440);
        ctx.strokeStyle = night ? c('#1a2242') : c('#a8764f'); ctx.lineWidth = 4; for (let y = 1540; y < 1920; y += 70) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        ctx.fillStyle = c(night ? '#3a3f73' : '#e9c58f'); ctx.beginPath(); ctx.ellipse(600, 1760, 440, 110, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = c(night ? '#4b518a' : '#f4d9ab'); ctx.lineWidth = 10; ctx.beginPath(); ctx.ellipse(600, 1760, 400, 90, 0, 0, TAU); ctx.stroke();
        // nightstand + lamp
        ctx.beginPath(); ctx.rect(24, 1250, 212, 232); this.fs(ctx, c('#8a6450'));
        ctx.beginPath(); ctx.rect(24, 1250, 212, 26); this.fs(ctx, c('#9d735c'));
        ctx.beginPath(); ctx.rect(46, 1300, 168, 70); ctx.lineWidth = 5; ctx.strokeStyle = this.OL; ctx.stroke(); ctx.beginPath(); ctx.arc(130, 1335, 8, 0, TAU); this.fs(ctx, c('#e7c48e'), 4);
        ctx.beginPath(); ctx.moveTo(98, 1250); ctx.lineTo(162, 1250); ctx.lineTo(148, 1222); ctx.lineTo(112, 1222); ctx.closePath(); this.fs(ctx, c('#5a4a66'));
        ctx.beginPath(); ctx.rect(125, 1150, 10, 74); this.fs(ctx, c('#5a4a66'), 4);
        ctx.beginPath(); ctx.moveTo(78, 1162); ctx.lineTo(182, 1162); ctx.lineTo(158, 1068); ctx.lineTo(102, 1068); ctx.closePath(); this.fs(ctx, night ? e('#ffd98f') : c('#f7e3b5'));
        // bed
        const blanketBase = night ? '#5b7fbf' : this.art.accent2;
        ctx.beginPath(); roundRect(ctx, 252, 1040, 58, 450, 24); this.fs(ctx, c('#6d4c3d'));
        ctx.beginPath(); roundRect(ctx, 270, 1300, 830, 128, 20); this.fs(ctx, c('#eef2fa'));
        ctx.beginPath(); ctx.rect(270, 1418, 830, 58); this.fs(ctx, c('#7a5646'));
        ctx.beginPath(); ctx.rect(290, 1470, 26, 30); this.fs(ctx, c('#5b3f33'), 5);
        ctx.beginPath(); ctx.ellipse(410, 1266, 118, 50, -0.04, 0, TAU); this.fs(ctx, c('#f4f6fc'));
        ctx.strokeStyle = rgba(this.OL, 0.25); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(330, 1262); ctx.quadraticCurveTo(410, 1284, 490, 1258); ctx.stroke();
        if (kind !== 'lie') { // made bed: a folded blanket
          ctx.beginPath(); roundRect(ctx, 540, 1270, 560, 150, 30); this.fs(ctx, c(blanketBase));
          ctx.beginPath(); roundRect(ctx, 540, 1270, 560, 40, 20); this.fs(ctx, c('#eef2fa'), 5);
        }
        if (!night) { // plant
          ctx.beginPath(); ctx.moveTo(960, 1480); ctx.lineTo(1050, 1480); ctx.lineTo(1036, 1590); ctx.lineTo(974, 1590); ctx.closePath(); this.fs(ctx, c('#d9774f'));
          [[-0.6, 150], [-0.2, 190], [0.25, 170], [0.7, 130]].forEach(([a, len]) => { ctx.save(); ctx.translate(1005, 1480); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, -len / 2, 30, len / 2, 0, 0, TAU); this.fs(ctx, c('#5fae67'), 5); ctx.restore(); });
        }
      } else if (setting === 'office') {
        ctx.fillStyle = vgrad(0, 1560, [[0, c('#dfe8f2')], [1, c('#c8d4e2')]]); ctx.fillRect(0, 0, W, 1560);
        const wx = 90; const wy = 600; const ww = 400; const wh = 420;
        ctx.fillStyle = vgrad(wy, wy + wh, [[0, e('#9fd3ff')], [1, e('#e3f4ff')]]); ctx.fillRect(wx, wy, ww, wh);
        ctx.fillStyle = e('#b9d6ee'); [[110, 780, 70, 240], [190, 700, 60, 320], [260, 820, 90, 200], [360, 740, 70, 280], [440, 860, 60, 160]].forEach(([x, y, w, h]) => ctx.fillRect(x, y, w, h));
        ctx.fillStyle = this.ea('#ffffff', 0.55); for (let y = wy + 16; y < wy + wh; y += 30) ctx.fillRect(wx, y, ww, 12);
        ctx.lineWidth = 18; ctx.strokeStyle = c('#ffffff'); ctx.strokeRect(wx, wy, ww, wh);
        ctx.fillStyle = c('#b7c3d2'); ctx.fillRect(wx - 20, wy - 30, ww + 40, 20);
        // shelf with books + plant
        ctx.beginPath(); ctx.rect(610, 1000, 390, 22); this.fs(ctx, c('#b98a63'));
        const bookCols = ['#e76f51', '#2a9d8f', '#e9c46a', '#264653', '#f4a261', '#8ab17d'];
        let bx = 630; bookCols.forEach((col, k) => { const bw = 30 + (k % 3) * 8; const bh = 120 + (k % 2) * 30; ctx.beginPath(); ctx.rect(bx, 1000 - bh, bw, bh); this.fs(ctx, c(col), 5); bx += bw + 4; });
        ctx.save(); ctx.translate(bx + 40, 1000); ctx.rotate(0.22); ctx.beginPath(); ctx.rect(0, -130, 30, 130); this.fs(ctx, c('#9b5de5'), 5); ctx.restore();
        ctx.beginPath(); ctx.moveTo(900, 1000); ctx.lineTo(980, 1000); ctx.lineTo(968, 930); ctx.lineTo(912, 930); ctx.closePath(); this.fs(ctx, c('#ffffff'), 5);
        [[-0.5, 90], [0, 120], [0.5, 90]].forEach(([a, len]) => { ctx.save(); ctx.translate(940, 930); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, -len / 2, 20, len / 2, 0, 0, TAU); this.fs(ctx, c('#57a773'), 5); ctx.restore(); });
        ctx.fillStyle = vgrad(1560, 1920, [[0, c('#8f9db2')], [1, c('#76849a')]]); ctx.fillRect(0, 1560, W, 360);
        ctx.fillStyle = c('#b3bfcf'); ctx.fillRect(0, 1548, W, 16);
      } else if (setting === 'classroom') {
        ctx.fillStyle = vgrad(0, 1540, [[0, c('#f5e6c6')], [1, c('#ead2a6')]]); ctx.fillRect(0, 0, W, 1540);
        ctx.fillStyle = c('#c79a6e'); ctx.fillRect(0, 1260, W, 280); ctx.fillStyle = c('#b58a5f'); ctx.fillRect(0, 1260, W, 14);
        ctx.beginPath(); ctx.rect(64, 560, 952, 530); this.fs(ctx, c('#8b5b3c'));
        ctx.fillStyle = vgrad(580, 1070, [[0, c('#2f6a52')], [1, c('#285a46')]]); ctx.fillRect(86, 582, 908, 486);
        ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.beginPath(); ctx.ellipse(400, 800, 260, 120, -0.3, 0, TAU); ctx.fill();
        const chalk = this.ca('#f4f1e8', 0.85); ctx.strokeStyle = chalk; ctx.fillStyle = chalk; ctx.lineWidth = 6; ctx.lineCap = 'round';
        this.brainPath(ctx, 250, 760, 90); ctx.stroke();
        ctx.font = '800 64px Montserrat, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('WHY?', 560, 720);
        ctx.font = '700 40px Montserrat, sans-serif'; ['1. notice', '2. name it', '3. let go'].forEach((s, k) => ctx.fillText(s, 580, 820 + k * 62));
        ctx.beginPath(); ctx.moveTo(360, 760); ctx.quadraticCurveTo(450, 700, 540, 700); ctx.stroke(); ctx.beginPath(); ctx.moveTo(520, 685); ctx.lineTo(545, 700); ctx.lineTo(522, 718); ctx.stroke();
        ctx.beginPath(); ctx.arc(250, 960, 44, 0.2, Math.PI - 0.2); ctx.stroke(); ctx.beginPath(); ctx.arc(234, 945, 5, 0, TAU); ctx.arc(266, 945, 5, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.rect(64, 1090, 952, 22); this.fs(ctx, c('#7a4e33'));
        ctx.fillStyle = vgrad(1540, 1920, [[0, c('#b98a5f')], [1, c('#a2754d')]]); ctx.fillRect(0, 1540, W, 380);
        ctx.strokeStyle = c('#9a6d46'); ctx.lineWidth = 4; for (let y = 1600; y < 1920; y += 70) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      } else if (setting === 'cafe') {
        ctx.fillStyle = vgrad(0, 1250, [[0, c('#eab98f')], [1, c('#d99c6e')]]); ctx.fillRect(0, 0, W, 1250);
        ctx.fillStyle = c('#8b5a3c'); ctx.fillRect(0, 1250, W, 330); ctx.fillStyle = c('#7a4c30'); for (let x = 0; x < W; x += 120) ctx.fillRect(x, 1250, 8, 330); ctx.fillStyle = c('#a06a47'); ctx.fillRect(0, 1240, W, 18);
        const wx = 70; const wy = 600; const ww = 540; const wh = 560;
        ctx.fillStyle = vgrad(wy, wy + wh, [[0, e('#ffb38a')], [1, e('#ffe1b8')]]); ctx.fillRect(wx, wy, ww, wh);
        ctx.fillStyle = e('#d8907a'); [[90, 900, 120, 260], [230, 840, 100, 320], [350, 930, 150, 230], [520, 880, 90, 280]].forEach(([x, y, w, h]) => ctx.fillRect(x, y, w, h));
        ctx.fillStyle = e('#ffd7a0'); for (let k = 0; k < 18; k++) ctx.fillRect(100 + (k * 37) % 480, 930 + ((k * 53) % 200), 16, 22);
        ctx.lineWidth = 20; ctx.strokeStyle = c('#5e3b28'); ctx.strokeRect(wx, wy, ww, wh); ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh); ctx.stroke();
        ctx.save(); ctx.fillStyle = this.ea('#ffffff', 0.8); ctx.font = '800 58px Montserrat, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('CAFÉ', wx + ww / 2, wy + 110); ctx.font = '600 26px Montserrat, sans-serif'; ctx.fillText('· coffee & calm ·', wx + ww / 2, wy + 150); ctx.restore();
        ctx.beginPath(); ctx.rect(690, 800, 340, 18); this.fs(ctx, c('#6e452e'));
        ['#f4efe6', '#e9c46a', '#f4efe6', '#9c6644'].forEach((col, k) => { ctx.beginPath(); roundRect(ctx, 710 + k * 80, 710, 60, 90, 14); this.fs(ctx, c(col), 5); ctx.fillStyle = c('#7a4c30'); ctx.fillRect(710 + k * 80, 700, 60, 18); });
        ctx.beginPath(); ctx.rect(690, 1000, 340, 18); this.fs(ctx, c('#6e452e'));
        [0, 1, 2].forEach((k) => { ctx.beginPath(); ctx.ellipse(740 + k * 110, 960, 40, 42, 0, 0, TAU); this.fs(ctx, c(['#e76f51', '#f4efe6', '#2a9d8f'][k]), 5); });
        ctx.fillStyle = vgrad(1580, 1920, [[0, c('#6b4a36')], [1, c('#5a3c2b')]]); ctx.fillRect(0, 1580, W, 340);
        ctx.fillStyle = c('#7b5640'); for (let x = -40; x < W; x += 160) { ctx.beginPath(); ctx.moveTo(x, 1580); ctx.lineTo(x + 80, 1580); ctx.lineTo(x + 20, 1920); ctx.lineTo(x - 60, 1920); ctx.closePath(); ctx.fill(); }
        [320, 800].forEach((x) => { ctx.strokeStyle = c('#2d2320'); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 250); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 70, 320); ctx.quadraticCurveTo(x, 210, x + 70, 320); ctx.closePath(); this.fs(ctx, c('#2f3b3a')); });
      } else if (setting === 'street') {
        ctx.fillStyle = vgrad(0, 1560, [[0, e('#5a67d8')], [0.55, e('#c890d4')], [1, e('#ffc79c')]]); ctx.fillRect(0, 0, W, 1560);
        ctx.fillStyle = this.ea('#fff1c1', 0.9); ctx.beginPath(); ctx.arc(760, 1060, 120, 0, TAU); ctx.fill();
      } else if (setting === 'park') {
        ctx.fillStyle = vgrad(0, 1300, [[0, e('#7cc6f5')], [1, e('#dff3ff')]]); ctx.fillRect(0, 0, W, 1300);
        ctx.fillStyle = c('#a6d8a0'); ctx.beginPath(); ctx.moveTo(0, 1180); ctx.quadraticCurveTo(260, 1040, 560, 1150); ctx.quadraticCurveTo(840, 1050, 1080, 1140); ctx.lineTo(1080, 1400); ctx.lineTo(0, 1400); ctx.closePath(); ctx.fill();
      } else if (setting === 'abstract-mind-space') {
        const g = ctx.createRadialGradient(540, 980, 60, 540, 980, 1200); g.addColorStop(0, c('#5b47c9')); g.addColorStop(0.45, c('#2c2175')); g.addColorStop(1, c('#0f0b2e')); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = this.ea('#b9a8ff', 0.09); ctx.lineWidth = 3; for (let r = 180; r < 1300; r += 150) { ctx.beginPath(); ctx.arc(540, 980, r, 0, TAU); ctx.stroke(); }
        ctx.fillStyle = this.ea('#d6ccff', 0.18); for (let k = 0; k < 90; k++) { ctx.beginPath(); ctx.arc(hash(k) * W, hash(k + 200) * H, 1.5 + hash(k + 400) * 2.5, 0, TAU); ctx.fill(); }
        const nodes = this.mindNodes(); ctx.strokeStyle = this.ea('#9d8cff', 0.28); ctx.lineWidth = 3;
        nodes.links.forEach(([a, b]) => { ctx.beginPath(); ctx.moveTo(nodes.p[a][0], nodes.p[a][1]); ctx.lineTo(nodes.p[b][0], nodes.p[b][1]); ctx.stroke(); });
        nodes.p.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fillStyle = this.ea('#cfc4ff', 0.6); ctx.fill(); });
      } else if (setting === 'phone-screen') {
        ctx.fillStyle = vgrad(0, H, [[0, c('#243061')], [1, c('#0d1230')]]); ctx.fillRect(0, 0, W, H);
        for (let k = 0; k < 14; k++) { const x = hash(k + 1) * W; const y = hash(k + 30) * H; const r = 40 + hash(k + 60) * 90; const g = ctx.createRadialGradient(x, y, 0, x, y, r); const col = [this.art.accent, this.art.accent2, '#ffd27a'][k % 3]; g.addColorStop(0, this.ea(col, 0.22)); g.addColorStop(1, this.ea(col, 0)); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
      } else { // void
        const g = ctx.createRadialGradient(540, 1150, 80, 540, 1100, 1250); g.addColorStop(0, c('#46557f')); g.addColorStop(0.5, c('#2a3456')); g.addColorStop(1, c('#141a2f')); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = this.ca('#ffffff', 0.05); ctx.beginPath(); ctx.moveTo(380, 0); ctx.lineTo(700, 0); ctx.lineTo(900, 1740); ctx.lineTo(180, 1740); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(540, 1712, 300, 46, 0, 0, TAU); ctx.fill();
      }
    }
    mindNodes() {
      if (this._nodes) return this._nodes;
      const p = []; for (let k = 0; k < 16; k++) p.push([80 + hash(k + 11) * 920, 250 + hash(k + 77) * 1500]);
      const links = []; p.forEach((a, i) => { const d = p.map((b, j) => [Math.hypot(a[0] - b[0], a[1] - b[1]), j]).sort((x, y) => x[0] - y[0]); links.push([i, d[1][1]]); if (i % 2) links.push([i, d[2][1]]); });
      this._nodes = { p, links }; return this._nodes;
    }
    // Parallax strips for street / park (tileable, 1080 wide).
    strip(name, s) {
      const k = 'strip|' + name + '|' + this.pid + '|' + s; if (this.bgCache.has(k)) return this.bgCache.get(k);
      const cv = document.createElement('canvas'); cv.width = Math.round(W * s); cv.height = Math.round(H * s); const ctx = cv.getContext('2d'); ctx.scale(s, s);
      const c = (h) => this.c(h); const e = (h) => this.e(h);
      if (name === 'street-far') {
        ctx.fillStyle = c('#8a7cc4'); let x = 0; let i = 0; while (x < W) { const w = 90 + hash(i) * 110; const h = 260 + hash(i + 9) * 380; ctx.fillRect(x, 1300 - h, w - 6, h + 260); if (hash(i + 3) > 0.6) ctx.fillRect(x + w / 2 - 4, 1300 - h - 60, 8, 60); x += w; i++; }
      } else if (name === 'street-near') {
        let x = 0; let i = 0; const cols = ['#5b4f94', '#6b5aa6', '#4c427f', '#76629f'];
        while (x < W) {
          const w = 200 + hash(i + 40) * 120; const h = 520 + hash(i + 60) * 360; const top = 1560 - h; ctx.beginPath(); ctx.rect(x, top, w - 10, h); this.fs(ctx, c(cols[i % 4]), 5);
          for (let wy = top + 40; wy < 1480; wy += 90) for (let wx = x + 24; wx < x + w - 50; wx += 62) { const lit = hash(wx * 0.37 + wy * 0.11) > 0.45; ctx.fillStyle = lit ? e('#ffd68a') : c('#3a3166'); ctx.fillRect(wx, wy, 34, 50); }
          if (hash(i + 5) > 0.5) { ctx.beginPath(); ctx.moveTo(x + 10, 1440); ctx.lineTo(x + w - 20, 1440); ctx.lineTo(x + w - 40, 1480); ctx.lineTo(x + 30, 1480); ctx.closePath(); this.fs(ctx, c(i % 2 ? this.art.accent : this.art.accent2), 5); }
          x += w; i++;
        }
        ctx.fillStyle = c('#a39fbc'); ctx.fillRect(0, 1560, W, 140); ctx.strokeStyle = c('#8b87a6'); ctx.lineWidth = 4; for (let sx = 0; sx < W; sx += 135) { ctx.beginPath(); ctx.moveTo(sx, 1560); ctx.lineTo(sx - 30, 1700); ctx.stroke(); }
        ctx.fillStyle = c('#6f6b8a'); ctx.fillRect(0, 1690, W, 22); ctx.fillStyle = c('#3e3b55'); ctx.fillRect(0, 1712, W, 208);
        ctx.fillStyle = c('#f2e6c9'); for (let sx = 40; sx < W; sx += 270) ctx.fillRect(sx, 1810, 130, 16);
        [270, 810].forEach((lx) => { ctx.beginPath(); ctx.rect(lx - 7, 1120, 14, 440); this.fs(ctx, c('#2f2b45'), 5); ctx.beginPath(); ctx.moveTo(lx - 40, 1120); ctx.lineTo(lx + 40, 1120); ctx.lineTo(lx + 24, 1080); ctx.lineTo(lx - 24, 1080); ctx.closePath(); this.fs(ctx, c('#2f2b45'), 5); ctx.fillStyle = e('#ffe3a1'); ctx.fillRect(lx - 30, 1120, 60, 14); });
      } else if (name === 'park-far') {
        ctx.fillStyle = c('#86c784'); ctx.beginPath(); ctx.moveTo(0, 1320); ctx.quadraticCurveTo(270, 1180, 540, 1290); ctx.quadraticCurveTo(810, 1190, 1080, 1320); ctx.lineTo(1080, 1600); ctx.lineTo(0, 1600); ctx.closePath(); ctx.fill();
        [[120, 1250, 0.8], [430, 1230, 0.7], [700, 1260, 0.9], [960, 1240, 0.75]].forEach(([x, y, sc]) => this.tree(ctx, x, y, sc * 0.8, true));
      } else if (name === 'park-near') {
        ctx.fillStyle = c('#6dbb6f'); ctx.fillRect(0, 1440, W, 480); ctx.beginPath(); ctx.moveTo(0, 1460); ctx.quadraticCurveTo(540, 1400, 1080, 1460); ctx.lineTo(1080, 1500); ctx.lineTo(0, 1500); ctx.fill();
        ctx.fillStyle = c('#e9d7b0'); ctx.fillRect(0, 1640, W, 110); ctx.fillStyle = c('#d9c49a'); for (let sx = 20; sx < W; sx += 90) ctx.fillRect(sx, 1690, 40, 8);
        [[160, 1450, 1.15], [880, 1440, 1.3]].forEach(([x, y, sc]) => this.tree(ctx, x, y, sc, false));
        for (let k = 0; k < 26; k++) { const x = hash(k + 5) * W; const y = 1520 + hash(k + 15) * 100 + (k % 2) * 180; ctx.fillStyle = c(['#ffffff', '#ffd166', '#ef476f', '#f78c6b'][k % 4]); ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill(); }
      }
      this.bgCache.set(k, cv); this.trimCache(); return cv;
    }
    tree(ctx, x, y, sc, far) {
      ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
      ctx.beginPath(); ctx.rect(-16, -40, 32, 160); if (far) { ctx.fillStyle = this.c('#7a6a52'); ctx.fill(); } else this.fs(ctx, this.c('#8a6a4d'), 6);
      const g = far ? this.c('#5fae67') : this.c('#4f9d5a'); const g2 = far ? this.c('#72bd78') : this.c('#66b56d');
      [[-60, -110, 80], [60, -110, 80], [0, -190, 95], [0, -80, 90]].forEach(([cx, cy, r]) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); if (far) { ctx.fillStyle = g; ctx.fill(); } else this.fs(ctx, g, 6); });
      [[-30, -200, 40], [40, -140, 34]].forEach(([cx, cy, r]) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fillStyle = g2; ctx.fill(); });
      ctx.restore();
    }
    cloudShape(ctx, x, y, r, outline) {
      ctx.beginPath(); ctx.moveTo(x - r * 1.6, y + r * 0.5);
      ctx.arc(x - r * 0.9, y + r * 0.1, r * 0.6, Math.PI * 0.9, Math.PI * 1.75); ctx.arc(x, y - r * 0.2, r * 0.8, Math.PI * 1.15, Math.PI * 1.95); ctx.arc(x + r * 0.95, y + r * 0.1, r * 0.62, Math.PI * 1.3, Math.PI * 0.2 + TAU);
      ctx.lineTo(x - r * 1.6, y + r * 0.72); ctx.closePath();
      if (outline) this.fs(ctx, ctx.fillStyle, outline); else ctx.fill();
    }
    brainPath(ctx, x, y, r) {
      ctx.beginPath();
      ctx.moveTo(x - r * 0.1, y + r * 0.7);
      ctx.bezierCurveTo(x - r * 0.6, y + r * 0.85, x - r * 1.1, y + r * 0.5, x - r * 1.0, y + r * 0.05);
      ctx.bezierCurveTo(x - r * 1.25, y - r * 0.3, x - r * 0.95, y - r * 0.85, x - r * 0.45, y - r * 0.82);
      ctx.bezierCurveTo(x - r * 0.25, y - r * 1.05, x + r * 0.25, y - r * 1.05, x + r * 0.45, y - r * 0.82);
      ctx.bezierCurveTo(x + r * 0.95, y - r * 0.85, x + r * 1.25, y - r * 0.3, x + r * 1.0, y + r * 0.05);
      ctx.bezierCurveTo(x + r * 1.1, y + r * 0.5, x + r * 0.6, y + r * 0.85, x + r * 0.1, y + r * 0.7);
      ctx.closePath();
    }
    trimCache() { if (this.bgCache.size > 14) { const first = this.bgCache.keys().next().value; this.bgCache.delete(first); } }
    bgCanvas(setting, kind, L, s) {
      const k = [setting, kind, this.pid, s].join('|'); let cv = this.bgCache.get(k);
      if (!cv) { cv = document.createElement('canvas'); cv.width = Math.round(W * s); cv.height = Math.round(H * s); const ctx = cv.getContext('2d'); ctx.scale(s, s); this.staticBg(ctx, setting, kind, L); this.bgCache.set(k, cv); this.trimCache(); }
      else { this.bgCache.delete(k); this.bgCache.set(k, cv); }
      return cv;
    }

    // ======================= settings: animated layers =======================
    dynamicBg(ctx, setting, kind, L, t, lt, scene) {
      const e = (h) => this.e(h);
      if (setting === 'bedroom-night') {
        ctx.fillStyle = e('#fff6d8'); for (let k = 0; k < 7; k++) { const a = 0.5 + 0.5 * Math.sin(t * (1.5 + k * 0.4) + k * 2); ctx.globalAlpha = a; const x = 620 + hash(k + 90) * 320; const y = 660 + hash(k + 99) * 200; this.star4(ctx, x, y, 7 + 5 * a); } ctx.globalAlpha = 1;
        if (!scene.props.includes('moon')) { ctx.fillStyle = e('#fff1b8'); ctx.beginPath(); ctx.arc(870, 735, 42, 0, TAU); ctx.fill(); ctx.fillStyle = e('#10194a'); ctx.beginPath(); ctx.arc(890, 722, 38, 0, TAU); ctx.fill(); }
        for (let k = 0; k < 13; k++) { const x = 40 + k * 82; const y = 150 + Math.sin((x / 1080) * TAU) * -0 + (x < 540 ? Math.sin(x / 540 * Math.PI) * 72 : Math.sin((x - 540) / 540 * Math.PI) * 72) + 8; const on = 0.55 + 0.45 * Math.sin(t * 2.4 + k * 1.3); const col = ['#ffd27a', '#ff9fb2', '#9fe7ff'][k % 3]; const g = ctx.createRadialGradient(x, y, 0, x, y, 34); g.addColorStop(0, this.ea(col, 0.55 * on)); g.addColorStop(1, this.ea(col, 0)); ctx.fillStyle = g; ctx.fillRect(x - 34, y - 34, 68, 68); ctx.fillStyle = this.ea(col, 0.6 + 0.4 * on); ctx.beginPath(); ctx.ellipse(x, y + 6, 8, 11, 0, 0, TAU); ctx.fill(); }
        const fl = 0.85 + 0.05 * Math.sin(t * 7) + 0.04 * Math.sin(t * 13);
        const g = ctx.createRadialGradient(130, 1120, 20, 130, 1150, 420); g.addColorStop(0, this.ea('#ffcf7a', 0.42 * fl)); g.addColorStop(0.5, this.ea('#ffb45e', 0.12 * fl)); g.addColorStop(1, this.ea('#ffb45e', 0));
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, 700, 560, 900); ctx.restore();
      } else if (setting === 'bedroom-day') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(600, 640, 300, 1700); g.addColorStop(0, this.ea('#fff2c4', 0.22)); g.addColorStop(1, this.ea('#fff2c4', 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(600, 640); ctx.lineTo(960, 640); ctx.lineTo(700, 1800); ctx.lineTo(150, 1800); ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.fillStyle = this.ea('#ffffff', 0.5); for (let k = 0; k < 10; k++) { const y = 900 + ((hash(k) * 800 - t * 14 * (0.5 + hash(k + 3))) % 800 + 800) % 800; ctx.beginPath(); ctx.arc(300 + hash(k + 7) * 500 + Math.sin(t + k) * 12, y, 3, 0, TAU); ctx.fill(); }
      } else if (setting === 'cafe') {
        [320, 800].forEach((x, k) => { const g = ctx.createRadialGradient(x, 330, 10, x, 380, 380); const fl = 0.9 + 0.1 * Math.sin(t * 2 + k); g.addColorStop(0, this.ea('#ffd08a', 0.5 * fl)); g.addColorStop(1, this.ea('#ffd08a', 0)); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x - 380, 0, 760, 760); ctx.restore(); ctx.fillStyle = e('#fff2c8'); ctx.beginPath(); ctx.ellipse(x, 322, 30, 12, 0, 0, TAU); ctx.fill(); });
      } else if (setting === 'street' || setting === 'park') {
        const speed = L.scroll ? (scene.pose === 'running' ? 1.9 : 1) : 0;
        const s = this.s || 1;
        const layer = (name, v) => { const cv = this.strip(name, s); const off = ((lt * v * speed) % W + W) % W; ctx.drawImage(cv, -off, 0, W, H); ctx.drawImage(cv, W - off, 0, W, H); };
        if (setting === 'park') { ctx.fillStyle = e('#ffffff'); for (let k = 0; k < 3; k++) { const x = ((hash(k + 1) * 1400 + t * (14 + k * 8)) % 1500) - 200; this.cloudShape(ctx, x, 360 + k * 170 + hash(k) * 60, 60 + k * 16, false); } }
        layer(setting + '-far', 60); layer(setting + '-near', 330);
      } else if (setting === 'abstract-mind-space') {
        const n = this.mindNodes();
        n.links.forEach(([a, b], i) => { const p = ((t * 0.5 + hash(i) ) % 1); const A = n.p[a]; const B = n.p[b]; const x = A[0] + (B[0] - A[0]) * p; const y = A[1] + (B[1] - A[1]) * p; const g = ctx.createRadialGradient(x, y, 0, x, y, 22); g.addColorStop(0, this.ea('#fff3b0', 0.9)); g.addColorStop(1, this.ea('#fff3b0', 0)); ctx.fillStyle = g; ctx.fillRect(x - 22, y - 22, 44, 44); });
        for (let k = 0; k < 7; k++) { const x = hash(k + 3) * W + Math.sin(t * 0.4 + k) * 40; const y = ((hash(k + 13) * H - t * (20 + k * 6)) % H + H) % H; ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.5 + k); ctx.strokeStyle = this.ea(k % 2 ? this.art.accent : '#b9a8ff', 0.5); ctx.lineWidth = 5; ctx.beginPath(); if (k % 3 === 0) { ctx.moveTo(0, -24); ctx.lineTo(21, 12); ctx.lineTo(-21, 12); ctx.closePath(); } else if (k % 3 === 1) ctx.arc(0, 0, 18, 0, TAU); else { ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.moveTo(0, -18); ctx.lineTo(0, 18); } ctx.stroke(); ctx.restore(); }
      } else if (setting === 'void') {
        ctx.fillStyle = this.ea('#ffffff', 0.25); for (let k = 0; k < 14; k++) { const y = ((hash(k) * H - t * (12 + hash(k + 1) * 20)) % H + H) % H; ctx.beginPath(); ctx.arc(hash(k + 5) * W + Math.sin(t * 0.6 + k) * 20, y, 2 + hash(k + 8) * 3, 0, TAU); ctx.fill(); }
      }
    }
    star4(ctx, x, y, r) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill(); }

    // Giant phone (phone-screen setting): scrolling feed, notifications, thumb.
    bigPhone(ctx, t, lt, emotion) {
      const x = 190; const y = 640; const w = 700; const h = 1300;
      ctx.save(); ctx.translate(540, 1290); ctx.rotate(-0.03 + Math.sin(t * 0.8) * 0.01); ctx.translate(-540, -1290);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); roundRect(ctx, x + 24, y + 30, w, h, 90); ctx.fill();
      ctx.beginPath(); roundRect(ctx, x, y, w, h, 90); this.fs(ctx, this.c('#1c1f30'), 9);
      const sx = x + 26; const sy = y + 26; const sw = w - 52; const shh = h - 52;
      ctx.save(); ctx.beginPath(); roundRect(ctx, sx, sy, sw, shh, 68); ctx.clip();
      ctx.fillStyle = this.e('#f3f5fb'); ctx.fillRect(sx, sy, sw, shh);
      const scroll = lt * 150; const cardH = 430;
      for (let k = -1; k < 5; k++) {
        const idx = Math.floor(scroll / cardH) + k; const cy = sy + 150 + idx * cardH - scroll;
        ctx.fillStyle = this.e('#ffffff'); ctx.beginPath(); roundRect(ctx, sx + 26, cy, sw - 52, cardH - 30, 30); ctx.fill();
        const col = [this.art.accent, this.art.accent2, '#ffd166', '#9b8cff', '#ef476f'][((idx % 5) + 5) % 5];
        ctx.fillStyle = this.e(col); ctx.beginPath(); ctx.arc(sx + 80, cy + 56, 30, 0, TAU); ctx.fill();
        ctx.fillStyle = this.e('#d5d9e6'); ctx.fillRect(sx + 128, cy + 38, 200, 18); ctx.fillRect(sx + 128, cy + 66, 130, 14);
        ctx.fillStyle = this.ea(col, 0.35); ctx.beginPath(); roundRect(ctx, sx + 50, cy + 104, sw - 100, 210, 20); ctx.fill();
        ctx.fillStyle = this.ea(col, 0.7); ctx.beginPath(); ctx.arc(sx + 50 + (sw - 100) * 0.7, cy + 170, 36, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(sx + 70, cy + 314); ctx.lineTo(sx + 250, cy + 200); ctx.lineTo(sx + 420, cy + 314); ctx.fill();
        ctx.fillStyle = this.e('#ef476f'); this.heartPath(ctx, sx + 80, cy + 350, 16); ctx.fill();
        ctx.fillStyle = this.e('#c3c8d8'); ctx.fillRect(sx + 110, cy + 342, 90, 14); ctx.fillRect(sx + 240, cy + 342, 70, 14);
      }
      ctx.fillStyle = this.e('#ffffff'); ctx.fillRect(sx, sy, sw, 120); ctx.fillStyle = this.e('#1c1f30'); ctx.font = '800 44px Montserrat, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('Feed', sx + 40, sy + 92);
      ctx.fillRect(sx + sw / 2 - 70, sy + 16, 140, 30);
      // notifications dropping in
      const period = 2.2; const n = Math.floor(lt / period); const ph = (lt % period) / period;
      const msgs = ['💬  3 new messages', '❤️  24 people liked this', '🔔  You were tagged', '📩  "are you up?"', '⏰  It\'s 2:07 AM'];
      const dy = ph < 0.15 ? easeOutBack(ph / 0.15) : ph > 0.85 ? 1 - easeOut((ph - 0.85) / 0.15) : 1;
      ctx.save(); ctx.translate(0, -140 + dy * 170); ctx.fillStyle = this.e('#ffffff'); ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 30; ctx.beginPath(); roundRect(ctx, sx + 24, sy + 20, sw - 48, 110, 32); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = this.e(this.art.accent); ctx.beginPath(); roundRect(ctx, sx + 46, sy + 42, 66, 66, 18); ctx.fill();
      ctx.fillStyle = this.e('#1c1f30'); ctx.font = '700 36px Montserrat, sans-serif'; ctx.fillText(msgs[n % msgs.length], sx + 130, sy + 88); ctx.restore();
      ctx.restore();
      // screen glow spill
      const g = ctx.createRadialGradient(540, 1100, 200, 540, 1100, 900); g.addColorStop(0, this.ea('#bfe3ff', 0.16)); g.addColorStop(1, this.ea('#bfe3ff', 0));
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, 300, W, 1620); ctx.restore();
      // hand holding the phone: fingers wrap the left edge, palm under the bottom, thumb swipes the screen
      const pal = this.pal(0); const sw2 = Math.sin(lt * 2.4); const thumbY = 1500 + sw2 * 90;
      ctx.beginPath(); ctx.moveTo(1080, 1720); ctx.bezierCurveTo(980, 1740, 900, 1800, 880, 1920); ctx.lineTo(1080, 1920); ctx.closePath(); this.fs(ctx, pal.top);
      ctx.beginPath(); ctx.ellipse(700, 1880, 330, 170, -0.12, 0, TAU); this.fs(ctx, pal.skin);
      ctx.beginPath(); ctx.moveTo(1080, 1760); ctx.bezierCurveTo(1000, 1780, 950, 1840, 940, 1920); ctx.lineTo(1080, 1920); ctx.closePath(); this.fs(ctx, pal.top);
      [1330, 1440, 1550].forEach((fy, i) => { ctx.beginPath(); roundRect(ctx, 150 - i * 4, fy, 86, 76, 36); this.fs(ctx, pal.skin); ctx.beginPath(); ctx.moveTo(206 - i * 4, fy + 20); ctx.quadraticCurveTo(222 - i * 4, fy + 38, 206 - i * 4, fy + 56); ctx.lineWidth = 4; ctx.strokeStyle = pal.skinS; ctx.stroke(); });
      this.limb(ctx, [860, 1800, 780, thumbY + 110, 690, thumbY], 78, pal.skin);
      ctx.beginPath(); ctx.ellipse(684, thumbY + 4, 22, 17, -0.9, 0, TAU); ctx.fillStyle = this.c('#f9e1d6'); ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = pal.skinS; ctx.stroke();
      if (sw2 > 0.6) { ctx.strokeStyle = this.ea('#ffffff', 0.7); ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(640, thumbY + 60); ctx.lineTo(640, thumbY + 150); ctx.stroke(); }
      ctx.restore();
    }
    heartPath(ctx, x, y, r) { ctx.beginPath(); ctx.moveTo(x, y + r * 0.9); ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.9, y - r * 1.5, x, y - r * 0.6); ctx.bezierCurveTo(x + r * 0.9, y - r * 1.5, x + r * 1.6, y - r * 0.2, x, y + r * 0.9); ctx.closePath(); }

    furnitureBack(ctx, setting, kind, L, t) {
      const c = (h) => this.c(h);
      if (kind === 'desk' && setting === 'office') { ctx.beginPath(); roundRect(ctx, L.charX - 150, 1000, 300, 360, 60); this.fs(ctx, c('#39415c')); ctx.beginPath(); roundRect(ctx, L.charX - 120, 1030, 240, 300, 46); ctx.fillStyle = c('#454f70'); ctx.fill(); }
      if (kind === 'desk' && setting === 'cafe') { [L.charX].concat(L.charX2 ? [L.charX2] : []).forEach((cx) => { ctx.beginPath(); roundRect(ctx, cx - 130, 1010, 260, 330, 30); this.fs(ctx, c('#8a5a3c')); ctx.beginPath(); roundRect(ctx, cx - 105, 1035, 210, 120, 20); ctx.fillStyle = c('#9c6a4a'); ctx.fill(); ctx.beginPath(); ctx.rect(cx - 120, 1350, 20, 340); ctx.rect(cx + 100, 1350, 20, 340); this.fs(ctx, c('#6e452e'), 5); }); }
      if (kind === 'sit' && L.bench) { ctx.beginPath(); roundRect(ctx, 250, 1290, 580, 40, 16); this.fs(ctx, c('#b5764d')); ctx.beginPath(); roundRect(ctx, 250, 1350, 580, 40, 16); this.fs(ctx, c('#b5764d')); ctx.beginPath(); roundRect(ctx, 230, 1452, 620, 42, 14); this.fs(ctx, c('#c98a5e')); [300, 780].forEach((x) => { ctx.beginPath(); ctx.rect(x - 10, 1494, 20, 150); this.fs(ctx, c('#3b3b48'), 5); }); }
      if (kind === 'sit' && !L.bench && !/^bedroom/.test(setting)) { const top = L.groundY - 150 * L.scale + 4; const w = 380; ctx.beginPath(); ctx.moveTo(L.charX - w / 2, top); ctx.lineTo(L.charX - w / 2 + 40, top - 46); ctx.lineTo(L.charX + w / 2 + 40, top - 46); ctx.lineTo(L.charX + w / 2, top); ctx.closePath(); this.fs(ctx, c(mix(this.art.accent2, '#ffffff', 0.3))); ctx.beginPath(); ctx.rect(L.charX - w / 2, top, w, L.groundY - top); this.fs(ctx, c(this.art.accent2)); ctx.beginPath(); ctx.moveTo(L.charX + w / 2, top); ctx.lineTo(L.charX + w / 2 + 40, top - 46); ctx.lineTo(L.charX + w / 2 + 40, L.groundY - 46); ctx.lineTo(L.charX + w / 2, L.groundY); ctx.closePath(); this.fs(ctx, c(mix(this.art.accent2, '#000000', 0.2))); }
      if (L.platform) {
        const g = ctx.createRadialGradient(L.charX, L.groundY, 10, L.charX, L.groundY, 360); g.addColorStop(0, this.ea('#c9b8ff', 0.5)); g.addColorStop(1, this.ea('#c9b8ff', 0));
        ctx.fillStyle = g; ctx.fillRect(L.charX - 360, L.groundY - 200, 720, 400);
        ctx.beginPath(); ctx.ellipse(L.charX, L.groundY + 6, 250, 44, 0, 0, TAU); ctx.fillStyle = this.ea('#e2d9ff', 0.35); ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = this.ea('#ffffff', 0.6); ctx.stroke();
      }
    }
    furnitureFront(ctx, setting, kind, L, pose, t) {
      const c = (h) => this.c(h);
      if (L.desk === 'office') {
        if (['talking', 'standing-thinking', 'stressed'].includes(pose)) { ctx.beginPath(); roundRect(ctx, 400, 1190, 280, 172, 16); this.fs(ctx, c('#cfd5df')); ctx.beginPath(); ctx.arc(540, 1272, 18, 0, TAU); ctx.fillStyle = this.e('#ffffff'); ctx.fill(); const g = ctx.createRadialGradient(540, 1180, 10, 540, 1180, 240); g.addColorStop(0, this.ea('#bfe3ff', 0.2)); g.addColorStop(1, this.ea('#bfe3ff', 0)); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(300, 940, 480, 420); ctx.restore(); }
        ctx.beginPath(); ctx.rect(30, 1352, 1020, 42); this.fs(ctx, c('#c99468'));
        ctx.beginPath(); ctx.rect(70, 1394, 940, 230); this.fs(ctx, c('#a87550'));
        ctx.beginPath(); ctx.rect(740, 1420, 240, 80); ctx.rect(740, 1515, 240, 80); ctx.lineWidth = 5; ctx.strokeStyle = this.OL; ctx.stroke(); ctx.fillStyle = c('#e7c48e'); ctx.fillRect(830, 1452, 60, 12); ctx.fillRect(830, 1548, 60, 12);
      } else if (L.desk === 'classroom') {
        ctx.beginPath(); ctx.rect(120, 1375, 840, 38); this.fs(ctx, c('#d7a676'));
        ctx.beginPath(); ctx.rect(160, 1413, 760, 170); this.fs(ctx, c('#b8845a'));
        [180, 880].forEach((x) => { ctx.beginPath(); ctx.rect(x, 1583, 22, 90); this.fs(ctx, c('#6d6f7e'), 5); });
      } else if (L.desk === 'cafe') {
        ctx.beginPath(); ctx.rect(530, 1400, 24, 270); this.fs(ctx, c('#3b3030'), 5); ctx.beginPath(); ctx.ellipse(542, 1676, 110, 20, 0, 0, TAU); this.fs(ctx, c('#3b3030'), 5);
        ctx.beginPath(); ctx.ellipse(542, 1398, 380, 54, 0, 0, TAU); this.fs(ctx, c('#f3ece2')); ctx.beginPath(); ctx.ellipse(542, 1410, 380, 54, 0, 0, Math.PI); ctx.lineWidth = 5; ctx.strokeStyle = this.OL; ctx.stroke();
      }
    }

    // ======================= props =======================
    glyph(ctx, ch, x, y, size, fill, rot) {
      ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.font = '900 ' + size + 'px Montserrat, "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.14; ctx.strokeStyle = this.OL; ctx.strokeText(ch, 0, 0); ctx.fillStyle = fill; ctx.fillText(ch, 0, 0); ctx.restore();
    }
    glow(ctx, x, y, r, col, a) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, this.ea(col, a)); g.addColorStop(1, this.ea(col, 0)); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore(); }
    positive(emotion) { return ['happy', 'calm', 'surprised'].includes(emotion); }

    prop(name, ctx, x, y, sc, age, t, env) {
      const k = popIn(age / 0.45); if (k <= 0.001) return;
      ctx.save(); ctx.translate(x, y); ctx.scale(sc * k, sc * k);
      const c = (h) => this.c(h); const e = (h) => this.e(h); const OL = this.OL;
      switch (name) {
        case 'clock': {
          ctx.rotate(Math.sin(t * 6.28) * 0.02);
          ctx.beginPath(); ctx.arc(0, 0, 96, 0, TAU); this.fs(ctx, c(this.art.accent)); ctx.beginPath(); ctx.arc(0, 0, 78, 0, TAU); this.fs(ctx, c('#fbf7ef'), 5);
          ctx.strokeStyle = OL; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ctx.lineWidth = i % 3 ? 4 : 7; ctx.beginPath(); ctx.moveTo(Math.sin(a) * 62, -Math.cos(a) * 62); ctx.lineTo(Math.sin(a) * 72, -Math.cos(a) * 72); ctx.stroke(); }
          const mA = t * 2.4; const hA = 0.6 + t * 0.2; ctx.lineCap = 'round';
          ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(hA) * 38, -Math.cos(hA) * 38); ctx.stroke();
          ctx.lineWidth = 6; ctx.strokeStyle = c('#e63946'); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(mA) * 60, -Math.cos(mA) * 60); ctx.stroke();
          ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fillStyle = OL; ctx.fill();
          ctx.strokeStyle = this.ea('#ffffff', 0.6); ctx.lineWidth = 5; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, 112 + i * 14, -0.9 + i * 0.1, -0.4 - i * 0.05); ctx.stroke(); }
          break;
        }
        case 'alarm': {
          const ring = Math.sin(t * 40) * 0.09 * (Math.sin(t * 2) > 0 ? 1 : 0.15); ctx.rotate(ring);
          [-1, 1].forEach((s) => { ctx.beginPath(); ctx.arc(s * 46, -62, 28, Math.PI, TAU); ctx.closePath(); this.fs(ctx, c('#f4c542'), 5); });
          ctx.beginPath(); ctx.moveTo(-38, 58); ctx.lineTo(-54, 84); ctx.moveTo(38, 58); ctx.lineTo(54, 84); ctx.lineWidth = 9; ctx.strokeStyle = OL; ctx.stroke();
          ctx.beginPath(); ctx.arc(0, 0, 70, 0, TAU); this.fs(ctx, c('#e63946')); ctx.beginPath(); ctx.arc(0, 0, 54, 0, TAU); this.fs(ctx, c('#fbf7ef'), 5);
          ctx.lineCap = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = OL; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -38); ctx.moveTo(0, 0); ctx.lineTo(24, 10); ctx.stroke();
          if (Math.sin(t * 2) > 0) { ctx.strokeStyle = this.ea('#ffffff', 0.85); ctx.lineWidth = 6; [-1, 1].forEach((s) => { for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(0, -10, 96 + i * 20, s > 0 ? -0.7 : Math.PI - 0.1, s > 0 ? 0.1 : Math.PI + 0.7); ctx.stroke(); } }); }
          break;
        }
        case 'phone': {
          const big = !!env.big; const buzz = (t % 2.2) < 0.5 ? Math.sin(t * 60) * 0.05 : 0;
          ctx.rotate(buzz + (big ? -0.12 : 0));
          this.glow(ctx, 0, 0, big ? 260 : 170, '#9fd4ff', 0.35 + 0.1 * Math.sin(t * 3));
          this.phoneShape(ctx, big ? 150 : 74, big ? 270 : 132, true, t);
          const ph = (t % 2.2) / 2.2; if (ph < 0.8) { const b = popIn(ph / 0.15); ctx.save(); ctx.translate(big ? 80 : 44, big ? -150 : -80); ctx.scale(b, b); ctx.beginPath(); ctx.arc(0, 0, big ? 36 : 26, 0, TAU); this.fs(ctx, e('#ef476f'), 5); ctx.fillStyle = '#fff'; ctx.font = '900 ' + (big ? 38 : 28) + 'px Montserrat, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(1 + Math.floor(t / 2.2) % 9), 0, 2); ctx.restore(); }
          break;
        }
        case 'brain': {
          const big = !!env.big; const r = big ? 230 : 95; const pulse = 1 + Math.sin(t * 4.2) * 0.035;
          if (big) this.glow(ctx, 0, 0, r * 2, '#ff9fb5', 0.3 + 0.1 * Math.sin(t * 4.2));
          ctx.scale(pulse, pulse);
          this.brainPath(ctx, 0, 0, r); this.fs(ctx, c('#ffa3b8'), big ? 10 : 7);
          ctx.save(); this.brainPath(ctx, 0, 0, r); ctx.clip(); ctx.fillStyle = c('#f38aa3'); ctx.beginPath(); ctx.ellipse(r * 0.3, r * 0.4, r, r * 0.5, 0, 0, TAU); ctx.fill(); ctx.restore();
          ctx.strokeStyle = c('#d9637f'); ctx.lineWidth = big ? 9 : 6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(0, -r * 0.85); ctx.bezierCurveTo(r * 0.12, -r * 0.4, -r * 0.12, r * 0.1, 0, r * 0.6);
          ctx.moveTo(-r * 0.65, -r * 0.45); ctx.bezierCurveTo(-r * 0.35, -r * 0.55, -r * 0.3, -r * 0.2, -r * 0.55, -r * 0.05); ctx.moveTo(-r * 0.75, r * 0.2); ctx.quadraticCurveTo(-r * 0.4, r * 0.1, -r * 0.35, r * 0.45);
          ctx.moveTo(r * 0.6, -r * 0.5); ctx.bezierCurveTo(r * 0.3, -r * 0.45, r * 0.3, -r * 0.1, r * 0.6, 0); ctx.moveTo(r * 0.75, r * 0.25); ctx.quadraticCurveTo(r * 0.4, r * 0.15, r * 0.35, r * 0.5); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-r * 0.45, -r * 0.55, r * 0.22, r * 0.1, -0.5, 0, TAU); ctx.fill();
          for (let i = 0; i < 5; i++) { const ph = (t * 1.3 + i * 0.37) % 1; if (ph > 0.35) continue; const a = hash(i + Math.floor(t * 1.3 + i * 0.37) * 7) * TAU; const d = r * 1.18; ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d); ctx.rotate(a + Math.PI / 2); ctx.globalAlpha = 1 - ph / 0.35; ctx.strokeStyle = e('#ffe45e'); ctx.lineWidth = big ? 9 : 6; ctx.beginPath(); const L2 = big ? 50 : 26; ctx.moveTo(0, -L2); ctx.lineTo(L2 * 0.35, -L2 * 0.1); ctx.lineTo(-L2 * 0.25, L2 * 0.1); ctx.lineTo(0, L2); ctx.stroke(); ctx.restore(); }
          break;
        }
        case 'lightbulb': {
          const on = age < 0.9 ? (Math.sin(age * 40) > 0.2 ? 1 : 0) : 1; const bob = Math.sin(t * 2.2) * 6; ctx.translate(0, bob);
          if (on) { this.glow(ctx, 0, -10, 190, '#ffe27a', 0.55); ctx.save(); ctx.rotate(t * 0.6); ctx.strokeStyle = this.ea('#ffe27a', 0.9); ctx.lineWidth = 8; ctx.lineCap = 'round'; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 88, Math.sin(a) * 88); ctx.lineTo(Math.cos(a) * 112, Math.sin(a) * 112); ctx.stroke(); } ctx.restore(); }
          ctx.beginPath(); ctx.arc(0, -14, 58, Math.PI * 0.8, Math.PI * 2.2); ctx.lineTo(24, 50); ctx.lineTo(-24, 50); ctx.closePath(); this.fs(ctx, on ? e('#ffe98f') : c('#d8dce6'));
          ctx.strokeStyle = on ? this.ea('#ff9f1c', 0.9) : rgba(OL, 0.4); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-12, 46); ctx.lineTo(-10, 6); ctx.lineTo(0, 18); ctx.lineTo(10, 6); ctx.lineTo(12, 46); ctx.stroke();
          ctx.beginPath(); roundRect(ctx, -26, 50, 52, 36, 8); this.fs(ctx, c('#9aa3b5')); ctx.beginPath(); ctx.moveTo(-26, 62); ctx.lineTo(26, 62); ctx.moveTo(-26, 74); ctx.lineTo(26, 74); ctx.lineWidth = 4; ctx.strokeStyle = OL; ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(-24, -36, 10, 18, 0.5, 0, TAU); ctx.fill();
          break;
        }
        case 'heart': {
          const ph = t % 1; const beat = 1 + (ph < 0.12 ? Math.sin(ph / 0.12 * Math.PI) * 0.16 : ph > 0.2 && ph < 0.32 ? Math.sin((ph - 0.2) / 0.12 * Math.PI) * 0.1 : 0);
          this.glow(ctx, 0, 0, 170, '#ff5d73', 0.25);
          ctx.save(); ctx.scale(beat, beat); this.heartPath(ctx, 0, 0, 70); this.fs(ctx, e('#ff4d6d'), 8); ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(-36, -34, 16, 10, -0.6, 0, TAU); ctx.fill(); ctx.restore();
          for (let i = 0; i < 3; i++) { const p = (t * 0.5 + i / 3) % 1; ctx.globalAlpha = 1 - p; this.heartPath(ctx, (i - 1) * 70 + Math.sin(p * 6 + i) * 14, -90 - p * 160, 18); this.fs(ctx, e('#ff8fa3'), 4); } ctx.globalAlpha = 1;
          break;
        }
        case 'notebook': {
          ctx.rotate(-0.06);
          ctx.beginPath(); roundRect(ctx, -170, -110, 340, 220, 16); this.fs(ctx, c(this.art.accent2));
          ctx.beginPath(); roundRect(ctx, -158, -100, 154, 196, 10); this.fs(ctx, c('#fffdf6'), 5); ctx.beginPath(); roundRect(ctx, 4, -100, 154, 196, 10); this.fs(ctx, c('#fffdf6'), 5);
          const prog = (t * 0.45) % 1.3; ctx.strokeStyle = c('#4a5a8a'); ctx.lineWidth = 6; ctx.lineCap = 'round';
          const lines = [[-140, -60, 110], [-140, -26, 90], [-140, 8, 116], [-140, 42, 70], [22, -60, 110], [22, -26, 100], [22, 8, 80]];
          let pen = null; lines.forEach(([lx, ly, lw], i) => { const p = clamp01(prog * lines.length / 1.0 - i); if (p <= 0) return; ctx.beginPath(); ctx.moveTo(lx, ly); for (let q = 0; q <= p * lw; q += 6) ctx.lineTo(lx + q, ly + Math.sin(q * 0.3) * 3); ctx.stroke(); if (p < 1) pen = [lx + p * lw, ly]; });
          if (pen) { ctx.save(); ctx.translate(pen[0], pen[1]); ctx.rotate(-0.7); ctx.beginPath(); ctx.rect(-8, -110, 16, 100); this.fs(ctx, e('#ffd166'), 5); ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(8, -10); ctx.lineTo(0, 6); ctx.closePath(); this.fs(ctx, c('#f4e1c1'), 4); ctx.restore(); }
          break;
        }
        case 'coffee': {
          for (let i = 0; i < 3; i++) { const p = (t * 0.6 + i / 3) % 1; ctx.strokeStyle = 'rgba(255,255,255,' + (0.7 * Math.sin(p * Math.PI)) + ')'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); const sx = (i - 1) * 22; for (let q = 0; q < 50; q += 5) { const yy = -70 - p * 60 - q; const xx = sx + Math.sin((q + t * 60) * 0.12) * 8; if (q === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); } ctx.stroke(); }
          ctx.beginPath(); ctx.arc(52, -8, 26, -1.2, 1.2); ctx.lineWidth = 13; ctx.strokeStyle = OL; ctx.stroke(); ctx.lineWidth = 6; ctx.strokeStyle = c(this.art.accent2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-50, -52); ctx.lineTo(50, -52); ctx.lineTo(44, 40); ctx.quadraticCurveTo(0, 56, -44, 40); ctx.closePath(); this.fs(ctx, c(this.art.accent2));
          ctx.beginPath(); ctx.ellipse(0, -52, 50, 12, 0, 0, TAU); this.fs(ctx, c('#6f4e37'), 5);
          ctx.fillStyle = 'rgba(255,255,255,0.8)'; this.heartPath(ctx, 0, -6, 14); ctx.fill();
          break;
        }
        case 'moon': {
          const f = Math.sin(t * 1.1) * 8; ctx.translate(0, f);
          this.glow(ctx, 0, 0, 200, '#fff1b8', 0.45);
          ctx.beginPath(); ctx.arc(0, 0, 80, 0.55, TAU - 0.55 + 0.001, false); ctx.arc(34, -18, 70, TAU - 0.95, 0.95, true); ctx.closePath(); this.fs(ctx, e('#fff1b8'), 6);
          ctx.fillStyle = e('#fff8dc'); for (let i = 0; i < 4; i++) { const a = 0.5 + 0.5 * Math.sin(t * 2 + i * 1.7); ctx.globalAlpha = a; this.star4(ctx, [-120, 110, -90, 130][i], [-80, -110, 90, 60][i], 12 + a * 8); } ctx.globalAlpha = 1;
          break;
        }
        case 'sun': {
          this.glow(ctx, 0, 0, 260, '#ffd166', 0.5);
          ctx.save(); ctx.rotate(t * 0.3); ctx.fillStyle = e('#ffc43d'); for (let i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.beginPath(); ctx.moveTo(-14, -96); ctx.lineTo(0, -140 - (i % 2) * 20); ctx.lineTo(14, -96); ctx.closePath(); ctx.fill(); } ctx.restore();
          ctx.beginPath(); ctx.arc(0, 0, 84, 0, TAU); this.fs(ctx, e('#ffd84d'), 7);
          ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(-30, -34, 26, 14, -0.6, 0, TAU); ctx.fill();
          break;
        }
        case 'calendar': {
          const n = Math.floor(t / 1.4); const ph = (t % 1.4) / 1.4; const flip = ph > 0.75 ? (ph - 0.75) / 0.25 : 0;
          ctx.beginPath(); roundRect(ctx, -100, -110, 200, 220, 18); this.fs(ctx, c('#fbf7ef'));
          ctx.beginPath(); ctx.rect(-100, -110, 200, 58); ctx.fillStyle = c('#e63946'); ctx.fill(); ctx.beginPath(); roundRect(ctx, -100, -110, 200, 220, 18); ctx.lineWidth = this.lw; ctx.strokeStyle = OL; ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.font = '800 30px Montserrat, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][n % 7], 0, -80);
          ctx.fillStyle = OL; ctx.font = '900 96px Montserrat, sans-serif'; ctx.fillText(String(1 + (n % 28)), 0, 22);
          if (flip > 0) { ctx.save(); ctx.translate(0, -52); ctx.scale(1, 1 - flip); ctx.beginPath(); ctx.rect(-98, 0, 196, 158); ctx.fillStyle = c('#efe8da'); ctx.fill(); ctx.restore(); }
          [-50, 50].forEach((x) => { ctx.beginPath(); roundRect(ctx, x - 8, -128, 16, 36, 8); this.fs(ctx, c('#9aa3b5'), 4); });
          break;
        }
        case 'arrows': {
          if (!this.positive(env.emotion)) {
            ctx.rotate(t * 1.6); ctx.lineCap = 'round';
            [0, Math.PI].forEach((a0) => { ctx.beginPath(); ctx.arc(0, 0, 90, a0 + 0.25, a0 + Math.PI - 0.35); ctx.lineWidth = 34; ctx.strokeStyle = OL; ctx.stroke(); ctx.lineWidth = 22; ctx.strokeStyle = e(this.art.accent); ctx.stroke();
              const ax = Math.cos(a0 + Math.PI - 0.35) * 90; const ay = Math.sin(a0 + Math.PI - 0.35) * 90; ctx.save(); ctx.translate(ax, ay); ctx.rotate(a0 + Math.PI - 0.35 + Math.PI / 2); ctx.beginPath(); ctx.moveTo(-30, -10); ctx.lineTo(30, -10); ctx.lineTo(0, 34); ctx.closePath(); this.fs(ctx, e(this.art.accent), 6); ctx.restore(); });
          } else {
            const p = clamp01((t % 3) / 1.4); const pts = [[-140, 80], [-60, 20], [0, 50], [120, -90]]; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); const segs = pts.length - 1; const upto = p * segs; for (let i = 1; i <= segs; i++) { const q = clamp01(upto - (i - 1)); if (q <= 0) break; ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * q, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * q); } };
            path(); ctx.lineWidth = 36; ctx.strokeStyle = OL; ctx.stroke(); path(); ctx.lineWidth = 24; ctx.strokeStyle = e('#3ddc97'); ctx.stroke();
            if (p >= 1) { ctx.save(); ctx.translate(120, -90); ctx.rotate(-0.86); ctx.beginPath(); ctx.moveTo(-8, -34); ctx.lineTo(44, 0); ctx.lineTo(-8, 34); ctx.closePath(); this.fs(ctx, e('#3ddc97'), 6); ctx.restore(); }
          }
          break;
        }
        case 'checklist': {
          ctx.rotate(0.05);
          ctx.beginPath(); roundRect(ctx, -110, -140, 220, 280, 18); this.fs(ctx, c('#c58b5a')); ctx.beginPath(); roundRect(ctx, -92, -118, 184, 244, 10); this.fs(ctx, c('#fffdf6'), 5);
          ctx.beginPath(); roundRect(ctx, -44, -156, 88, 40, 12); this.fs(ctx, c('#9aa3b5'), 5);
          const done = Math.floor((t % 4) / 0.8);
          for (let i = 0; i < 3; i++) { const yy = -64 + i * 72; ctx.beginPath(); roundRect(ctx, -70, yy - 20, 40, 40, 8); ctx.lineWidth = 5; ctx.strokeStyle = OL; ctx.stroke(); ctx.fillStyle = c('#cfd5e3'); ctx.fillRect(-16, yy - 8, 86 - i * 14, 14);
            if (i < done) { const q = clamp01(((t % 4) - (i + 1) * 0.8) / 0.25 + 1); ctx.save(); ctx.translate(-50, yy); ctx.scale(popIn(q), popIn(q)); ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-4, 16); ctx.lineTo(24, -20); ctx.lineCap = 'round'; ctx.lineWidth = 16; ctx.strokeStyle = OL; ctx.stroke(); ctx.lineWidth = 9; ctx.strokeStyle = e('#2ecc71'); ctx.stroke(); ctx.restore(); } }
          break;
        }
        case 'battery': {
          const low = !this.positive(env.emotion);
          ctx.beginPath(); roundRect(ctx, -120, -60, 220, 120, 22); this.fs(ctx, c('#f4f6fb')); ctx.beginPath(); roundRect(ctx, 100, -26, 24, 52, 8); this.fs(ctx, c('#9aa3b5'), 5);
          if (low) { const blink = Math.sin(t * 6) > 0 ? 1 : 0.25; ctx.globalAlpha = blink; ctx.beginPath(); roundRect(ctx, -104, -44, 40, 88, 10); ctx.fillStyle = e('#ef233c'); ctx.fill(); ctx.globalAlpha = 1; this.glyph(ctx, '!', 20, 2, 70, e('#ef233c')); }
          else { const n = 1 + Math.floor((t * 1.5) % 4); for (let i = 0; i < n; i++) { ctx.beginPath(); roundRect(ctx, -104 + i * 50, -44, 40, 88, 10); ctx.fillStyle = e('#3ddc97'); ctx.fill(); } ctx.beginPath(); ctx.moveTo(4, -40); ctx.lineTo(-20, 6); ctx.lineTo(0, 6); ctx.lineTo(-8, 44); ctx.lineTo(24, -8); ctx.lineTo(4, -8); ctx.closePath(); this.fs(ctx, e('#ffd166'), 5); }
          break;
        }
        case 'cloud': {
          const bad = !this.positive(env.emotion); const drift = Math.sin(t * 0.8) * 16; ctx.translate(drift, 0);
          if (bad) { ctx.strokeStyle = this.ea('#8ecbff', 0.9); ctx.lineWidth = 6; ctx.lineCap = 'round'; for (let i = 0; i < 9; i++) { const p = (t * 1.6 + hash(i)) % 1; const x = -110 + i * 28; const y = 40 + p * 190; ctx.globalAlpha = 1 - p; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 26); ctx.stroke(); } ctx.globalAlpha = 1; }
          ctx.fillStyle = bad ? c('#7d8597') : e('#ffffff'); this.cloudShape(ctx, 0, 0, 90, 7);
          if (bad && Math.sin(t * 1.3) > 0.9) { ctx.fillStyle = e('#ffe45e'); ctx.beginPath(); ctx.moveTo(10, 40); ctx.lineTo(-20, 110); ctx.lineTo(4, 110); ctx.lineTo(-14, 170); ctx.lineTo(30, 90); ctx.lineTo(8, 90); ctx.closePath(); this.fs(ctx, ctx.fillStyle, 5); }
          break;
        }
        case 'zzz': {
          for (let i = 0; i < 3; i++) { const p = (t * 0.45 + i / 3) % 1; ctx.globalAlpha = Math.sin(p * Math.PI); this.glyph(ctx, 'Z', p * 110 + Math.sin(p * 6) * 12, -p * 220, 50 + p * 60, e('#dfe7ff'), -0.2); } ctx.globalAlpha = 1;
          break;
        }
        case 'sparkles': {
          ctx.fillStyle = e('#fff3b0'); const pts = env.spread || [[-220, -200], [230, -150], [-260, 120], [250, 160], [0, -320]];
          pts.forEach(([px, py], i) => { const a = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.9); ctx.save(); ctx.translate(px, py); ctx.rotate(t * 0.8 + i); ctx.globalAlpha = 0.4 + 0.6 * a; this.glow(ctx, 0, 0, 50, '#fff3b0', 0.35 * a); ctx.fillStyle = e('#fff6c8'); this.star4(ctx, 0, 0, 16 + a * 22); ctx.restore(); });
          ctx.globalAlpha = 1; break;
        }
        case 'confetti': {
          ctx.restore(); ctx.save(); // full-frame, ignores anchor
          const cols = [this.art.accent, this.art.accent2, '#ffd166', '#ef476f', '#9b8cff', '#ffffff'];
          for (let i = 0; i < 46; i++) { const sp = 160 + hash(i) * 220; const y = ((hash(i + 3) * H + age * sp) % (H + 100)) - 50; const x = hash(i + 7) * W + Math.sin(age * 2 + i) * 40; ctx.save(); ctx.translate(x, y); ctx.rotate(age * (2 + hash(i) * 4) + i); ctx.scale(1, Math.cos(age * 5 + i)); ctx.fillStyle = this.e(cols[i % cols.length]); ctx.fillRect(-10, -6, 20, 12); ctx.restore(); }
          break;
        }
        case 'exclamation': {
          const wob = Math.sin(age * 12) * Math.exp(-age * 2) * 0.4 + Math.sin(t * 3) * 0.05;
          ctx.strokeStyle = e('#ffd166'); ctx.lineWidth = 8; ctx.lineCap = 'round'; for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.45; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 90, Math.sin(a) * 90 + 10); ctx.lineTo(Math.cos(a) * 124, Math.sin(a) * 124 + 10); ctx.stroke(); }
          this.glyph(ctx, '!', 0, 0, 170, e('#ffd166'), wob); break;
        }
        case 'question-marks': {
          [[0, 0, 130, 0], [-120, 80, 90, 0.9], [110, 70, 80, 1.8]].forEach(([qx, qy, size, ph], i) => { const b = Math.abs(Math.sin(t * 3 + ph)) * 26; const a = popIn((age - i * 0.18) / 0.4); if (a <= 0) return; ctx.save(); ctx.translate(qx, qy - b); ctx.scale(a, a); this.glyph(ctx, '?', 0, 0, size, e(i === 0 ? '#ffffff' : this.art.accent), Math.sin(t * 2 + ph) * 0.2); ctx.restore(); });
          break;
        }
        case 'thought-bubbles': {
          const fl = Math.sin(t * 1.4) * 10; const dir = env.dir || 1;
          [[70, -10, 16, 0], [130, -80, 26, 0.12], [dir > 0 ? 0 : 0, 0, 0, 0]].slice(0, 2).forEach(([bx, by, r, d]) => { const a = popIn((age - d) / 0.3); if (a <= 0) return; ctx.beginPath(); ctx.arc(bx * dir, by + fl * 0.4, r * a, 0, TAU); this.fs(ctx, e('#ffffff'), 5); });
          const a = popIn((age - 0.28) / 0.45); if (a <= 0) break;
          ctx.save(); ctx.translate(250 * dir, -230 + fl); ctx.scale(a, a);
          ctx.beginPath(); const bumps = 9; for (let i = 0; i <= bumps; i++) { const ang = i / bumps * TAU; const rx = 180; const ry = 120; const x = Math.cos(ang) * rx; const y = Math.sin(ang) * ry; if (i === 0) ctx.moveTo(x, y); else { const pa = (i - 0.5) / bumps * TAU; ctx.quadraticCurveTo(Math.cos(pa) * rx * 1.28, Math.sin(pa) * ry * 1.32, x, y); } } ctx.closePath(); this.fs(ctx, e('#ffffff'), 7);
          const icons = env.icons || ['phone', 'clock', 'cringe', 'q']; const n = Math.floor(t / 1.1) % icons.length; const ip = 0.55 + 0.45 * popIn(((t % 1.1)) / 0.3);
          ctx.save(); ctx.scale(ip * 0.9, ip * 0.9); this.miniIcon(ctx, icons[n], t); ctx.restore();
          ctx.restore(); break;
        }
        case 'speech-bubbles': {
          const side = env.dir || 1; const n = Math.floor(t / 1.2); const ph = (t % 1.2) / 1.2; const a = popIn(ph / 0.25);
          ctx.save(); ctx.translate(side * 60 * (n % 2 ? -1 : 1), 0); ctx.scale(a, a);
          ctx.beginPath(); roundRect(ctx, -120, -80, 240, 130, 50); ctx.moveTo(-30, 46); ctx.lineTo(-70, 100); ctx.lineTo(10, 48); this.fs(ctx, e(n % 2 ? this.art.accent2 : '#ffffff'), 6);
          ctx.fillStyle = OL; [-44, 0, 44].forEach((dx, i) => { ctx.beginPath(); ctx.arc(dx, -14 - Math.max(0, Math.sin(t * 8 - i)) * 10, 11, 0, TAU); ctx.fill(); });
          ctx.restore(); break;
        }
        case 'mirror': {
          ctx.beginPath(); ctx.ellipse(0, 0, 120, 190, 0, 0, TAU); this.fs(ctx, c('#d4a373'), 8); ctx.beginPath(); ctx.ellipse(0, 0, 100, 170, 0, 0, TAU);
          const g = ctx.createLinearGradient(-100, -170, 100, 170); g.addColorStop(0, e('#dff4ff')); g.addColorStop(1, e('#9cc9e6')); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = OL; ctx.stroke();
          ctx.save(); ctx.clip(); ctx.fillStyle = this.ea(this.art.accent, 0.55); ctx.beginPath(); ctx.arc(0, 40, 50, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(0, 190, 100, 90, 0, 0, TAU); ctx.fill();
          const sx = ((t * 120) % 500) - 250; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(sx - 30, -200); ctx.lineTo(sx + 20, -200); ctx.lineTo(sx - 60, 200); ctx.lineTo(sx - 110, 200); ctx.closePath(); ctx.fill(); ctx.restore();
          if (!env.wall) { ctx.beginPath(); ctx.moveTo(-60, 180); ctx.lineTo(-90, 260); ctx.moveTo(60, 180); ctx.lineTo(90, 260); ctx.lineWidth = 12; ctx.strokeStyle = OL; ctx.stroke(); }
          break;
        }
        case 'weights': {
          const press = Math.abs(Math.sin(t * 2.2)) * 16; ctx.translate(0, press);
          ctx.beginPath(); ctx.arc(0, -120, 34, Math.PI, TAU); ctx.lineWidth = 22; ctx.strokeStyle = OL; ctx.stroke(); ctx.lineWidth = 12; ctx.strokeStyle = c('#4a4e69'); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-90, -110); ctx.lineTo(90, -110); ctx.lineTo(120, 40); ctx.quadraticCurveTo(120, 60, 100, 60); ctx.lineTo(-100, 60); ctx.quadraticCurveTo(-120, 60, -120, 40); ctx.closePath(); this.fs(ctx, c('#3a3d52'), 8);
          ctx.fillStyle = e('#ffffff'); ctx.font = '900 52px Montserrat, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('100', 0, -30); ctx.font = '800 30px Montserrat, sans-serif'; ctx.fillText('KG', 0, 16);
          ctx.strokeStyle = this.ea('#ffffff', 0.7); ctx.lineWidth = 6; [-1, 1].forEach((s) => { ctx.beginPath(); ctx.moveTo(s * 140, 20 - press); ctx.lineTo(s * 170, 44 - press); ctx.stroke(); });
          break;
        }
        case 'stairs': {
          const steps = 5; for (let i = 0; i < steps; i++) { const a = popIn((age - i * 0.12) / 0.35); if (a <= 0) continue; ctx.save(); ctx.translate(-200 + i * 80, 120 - i * 60); ctx.scale(1, a); ctx.beginPath(); ctx.rect(0, -60 * 0, 80, 60 + i * 60); ctx.fillStyle = c(i % 2 ? this.art.accent2 : mix(this.art.accent2, '#ffffff', 0.25)); ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = OL; ctx.stroke(); ctx.restore(); }
          const fa = popIn((age - 0.7) / 0.4); if (fa > 0) { ctx.save(); ctx.translate(200, -180); ctx.scale(fa, fa); ctx.beginPath(); ctx.rect(-4, -110, 8, 110); this.fs(ctx, c('#6c6f7f'), 4); ctx.beginPath(); ctx.moveTo(4, -110); ctx.quadraticCurveTo(40, -100 + Math.sin(t * 5) * 8, 76, -96); ctx.lineTo(76, -56); ctx.quadraticCurveTo(40, -60 + Math.sin(t * 5 + 1) * 8, 4, -66); ctx.closePath(); this.fs(ctx, e(this.art.accent), 5); ctx.restore(); ctx.fillStyle = e('#fff3b0'); this.star4(ctx, 240, -330, 18 + 6 * Math.sin(t * 4)); }
          break;
        }
        case 'chains': {
          ctx.restore(); ctx.save(); // anchored to the character body
          const a = env.anchor; if (!a || !a.hip) break; const cx = a.hip[0]; const cy = a.hip[1] - 110 * a.scale; const rx = 150 * a.scale; const ry = 50 * a.scale;
          const rattle = Math.sin(t * 9) * 3; const n = 16;
          for (let i = 0; i < n; i++) { const ang = i / n * TAU + t * 0.05; const x = cx + Math.cos(ang) * rx; const y = cy + Math.sin(ang) * ry + rattle * (i % 2 ? 1 : -1); if (Math.sin(ang) < 0) continue; ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2 + (i % 2) * 0.2); ctx.beginPath(); ctx.ellipse(0, 0, 26 * a.scale, 14 * a.scale, 0, 0, TAU); ctx.lineWidth = 16 * a.scale; ctx.strokeStyle = OL; ctx.stroke(); ctx.lineWidth = 8 * a.scale; ctx.strokeStyle = c('#b8bcc8'); ctx.stroke(); ctx.restore(); }
          ctx.save(); ctx.translate(cx + 20, cy + ry + 30 * a.scale); ctx.rotate(Math.sin(t * 3) * 0.15); ctx.scale(a.scale, a.scale); ctx.beginPath(); ctx.arc(0, -30, 26, Math.PI, TAU); ctx.lineWidth = 16; ctx.strokeStyle = OL; ctx.stroke(); ctx.lineWidth = 8; ctx.strokeStyle = c('#b8bcc8'); ctx.stroke(); ctx.beginPath(); roundRect(ctx, -38, -30, 76, 64, 12); this.fs(ctx, c('#f4c542')); ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fillStyle = OL; ctx.fill(); ctx.restore();
          break;
        }
        default: break;
      }
      ctx.restore();
    }
    miniIcon(ctx, kind, t) {
      const e = (h) => this.e(h); const OL = this.OL; ctx.lineCap = 'round';
      if (kind === 'phone') { ctx.save(); ctx.rotate(-0.15); this.phoneShape(ctx, 70, 124, true, t); ctx.restore(); }
      else if (kind === 'clock') { ctx.beginPath(); ctx.arc(0, 0, 58, 0, TAU); this.fs(ctx, e('#fbf7ef'), 6); ctx.lineWidth = 7; ctx.strokeStyle = OL; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -38); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(t * 3) * 30, -Math.cos(t * 3) * 30); ctx.stroke(); }
      else if (kind === 'cringe') { ctx.beginPath(); ctx.arc(0, 0, 58, 0, TAU); this.fs(ctx, e('#ffd166'), 6); ctx.fillStyle = OL; ctx.font = '900 44px Montserrat, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('> <', 0, -10); ctx.beginPath(); ctx.rect(-26, 16, 52, 16); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OL; ctx.stroke(); }
      else if (kind === 'heart') { this.heartPath(ctx, 0, 0, 50); this.fs(ctx, e('#ff4d6d'), 6); }
      else if (kind === 'bulb') { ctx.beginPath(); ctx.arc(0, -10, 44, 0, TAU); this.fs(ctx, e('#ffe98f'), 6); }
      else if (kind === 'money') { this.glyph(ctx, '$', 0, 0, 110, e('#3ddc97')); }
      else if (kind === 'moon') { ctx.beginPath(); ctx.arc(0, 0, 50, 0.5, TAU - 0.5); ctx.arc(22, -12, 44, TAU - 0.9, 0.9, true); ctx.closePath(); this.fs(ctx, e('#fff1b8'), 6); }
      else this.glyph(ctx, '?', 0, 0, 110, e(this.art.accent));
    }

    // ======================= composition =======================
    placeProps(scene, L, A) {
      const out = []; const used = new Set(); const props = scene.props;
      const take = (type) => { const list = L.anchors[type] || []; for (let i = 0; i < list.length; i++) { const k = type + i; if (!used.has(k)) { used.add(k); return list[i]; } } return null; };
      const head = A.head || { x: 540, y: 1000, r: 90 }; const top = A.top || head.y - 110;
      let dir = head.x > 560 ? -1 : 1; if (head.x + 250 * dir + 250 > W) dir = -1; if (head.x + 250 * dir - 250 < 0) dir = 1;
      const hasThought = props.includes('thought-bubbles'); const bubbleExtra = [];
      const float = () => take('float') || [dir > 0 ? 200 : 880, 1100];
      props.forEach((name) => {
        let p = null; let sc = 1; const env = { emotion: scene.emotion };
        switch (name) {
          case 'thought-bubbles': p = [head.x + dir * head.r * 0.6, top + 30]; env.dir = dir; env.icons = thoughtIcons(scene); break;
          case 'lightbulb': p = [head.x + (hasThought ? -dir * 30 : 0), top - 120]; break;
          case 'question-marks': p = [head.x - dir * (hasThought ? 200 : 170), top - 20]; break;
          case 'zzz': p = [head.x + (hasThought ? -dir : dir) * 80, top - 10]; break;
          case 'exclamation': p = [head.x - dir * 190, top - 60]; break;
          case 'speech-bubbles': p = [Math.max(170, Math.min(910, head.x + dir * 220)), top - 70]; env.dir = dir; break;
          case 'sparkles': p = [head.x, head.y + 120]; break;
          case 'brain': if (L.bigBrain) { p = [540, 880]; env.big = true; } else { p = [Math.max(150, Math.min(930, head.x - dir * 250)), head.y - 40]; } break;
          case 'weights': p = [head.x, top - 150]; break;
          case 'cloud': if (!this.positive(scene.emotion)) { p = [head.x, top - 170]; } else { p = take('sky') || [820, 760]; } break;
          case 'moon': case 'sun': {
            p = take('sky') || [dir > 0 ? 860 : 220, 780]; sc = L.anchors.sky && L.anchors.sky.length ? 0.9 : 1;
            if (hasThought) { // would collide with the thought bubble: show it inside the bubble instead
              const bx = head.x + dir * head.r * 0.6 + dir * 200; const by = top + 30 - 230;
              if (Math.hypot(p[0] - bx, p[1] - by) < 400) { bubbleExtra.push(name); p = null; }
            }
            break;
          }
          case 'chains': env.anchor = A; p = [0, 0]; break;
          case 'confetti': p = [0, 0]; break;
          case 'phone': if (A.holdsPhone || L.bigPhone) return; p = take('table'); if (p) { sc = 0.75; p = [p[0], p[1] - 66]; } else { p = float(); env.big = true; sc = 0.9; } break;
          case 'coffee': case 'notebook': case 'alarm': p = take('table'); if (p) { sc = name === 'notebook' ? 0.6 : 0.8; p = [p[0], p[1] - (name === 'coffee' ? 44 : name === 'alarm' ? 80 : 40)]; } else { p = float(); sc = 0.95; } break;
          case 'clock': case 'calendar': case 'mirror': case 'checklist': { const w = take('wall'); p = w || float(); env.wall = !!w; sc = name === 'mirror' ? 0.85 : 0.95; break; }
          default: p = float(); sc = name === 'stairs' ? 0.85 : 1; break;
        }
        if (p) out.push({ name, x: p[0], y: p[1], sc, env });
      });
      if (bubbleExtra.length) { const tb = out.find((o) => o.name === 'thought-bubbles'); if (tb) tb.env.icons = bubbleExtra.map((n) => (n === 'sun' ? 'bulb' : 'moon')).concat(tb.env.icons.filter((i) => i !== 'moon')); }
      return out;
    }
    camera(ctx, cam, lt, dur, fx, fy) {
      let z = 1.02 + 0.012 * Math.sin(lt * 0.5); let dx = 0; let dy = 0; const d = Math.max(2, dur || 4);
      if (cam === 'zoom-in') z = 1.02 + 0.13 * easeInOut(lt / d);
      else if (cam === 'pan') { z = 1.09; dx = (0.5 - clamp01(lt / d)) * 90; }
      else if (cam === 'shake') { z = 1.06; dx = noise(lt * 9, 1) * 11; dy = noise(lt * 9, 2) * 11; }
      ctx.translate(fx, fy); ctx.scale(z, z); ctx.translate(-fx + dx, -fy + dy);
    }
    callout(ctx, text, x, y, age, t) {
      if (!text) return; const k = popIn(age / 0.4); if (k <= 0) return;
      ctx.font = '900 54px Montserrat, "Arial Black", sans-serif';
      { // keep the whole sticker on screen even under camera zoom
        const m = ctx.getTransform(); const sx = Math.hypot(m.a, m.b) || 1; const ss = this.s || 1;
        const pw0 = Math.min(700, ctx.measureText(text.toUpperCase()).width) + 64; const half = (pw0 / 2 + 40) * sx / ss;
        const X = (m.a * x + m.c * y + m.e) / ss; const Xc = Math.max(half, Math.min(W - half, X));
        x += (Xc - X) * ss / sx;
      }
      ctx.save(); ctx.translate(x, y + Math.sin(t * 2) * 5); ctx.rotate(-0.06); ctx.scale(k, k);
      ctx.font = '900 54px Montserrat, "Arial Black", sans-serif'; const tw = Math.min(700, ctx.measureText(text.toUpperCase()).width); const pw = tw + 64; const ph = 96;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); roundRect(ctx, -pw / 2 + 8, -ph / 2 + 10, pw, ph, 26); ctx.fill();
      ctx.beginPath(); roundRect(ctx, -pw / 2, -ph / 2, pw, ph, 26); this.fs(ctx, this.e(this.art.accent), 7);
      ctx.fillStyle = this.e('#1a1c2c'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text.toUpperCase(), 0, 4, 700);
      ctx.restore();
    }
    // Draw one moment of a shot. sh: { scene, lt, t, dur, s, propAge(name), poseAge, calloutAge, img }
    drawShot(ctx, sh) {
      if (this.draw3d) return this.draw3d(ctx, sh); // v1.5: 3D style (three3d.js)
      const scene = sh.scene; const setting = scene.setting; this.s = sh.s || 1;
      this.amb = AMBIENT[setting] || null;
      const kind = this.kindFor(setting, scene.pose); const L = this.layout(setting, kind, scene);
      const t = sh.t; const lt = sh.lt;
      const focusY = kind === 'lie' ? 1150 : L.groundY - 480 * L.scale;
      ctx.save();
      if (L.zoom) { ctx.translate(L.zoomAt[0], L.zoomAt[1]); ctx.scale(L.zoom, L.zoom); ctx.translate(-L.zoomAt[0], -L.zoomAt[1]); }
      this.camera(ctx, scene.camera, lt, sh.dur, L.charX, focusY);
      let A = {}; let X = null;
      if (sh.img) {
        const iw = sh.img.width; const ih = sh.img.height; const kb = 1.06 + 0.1 * clamp01(lt / Math.max(2, sh.dur || 4)); const z = Math.max(W / iw, H / ih) * kb;
        const px = Math.sin(lt * 0.25) * 30; ctx.drawImage(sh.img, (W - iw * z) / 2 + px, (H - ih * z) / 2, iw * z, ih * z);
        A = { head: { x: 540, y: 1000, r: 90 }, top: 880, hip: [540, 1300], scale: 1 };
      } else if (kind === 'card' && VTS.sceneExt) {
        A = VTS.sceneExt.card(this, ctx, scene, L, t, lt, sh);
      } else {
        const bs = this._bgShift; // v1.5 parallax: the backdrop drifts slower than the characters
        if (bs) ctx.drawImage(this.bgCanvas(setting, kind, L, this.s), -W * 0.035 + bs.x, -H * 0.035 + bs.y, W * 1.07, H * 1.07); else ctx.drawImage(this.bgCanvas(setting, kind, L, this.s), 0, 0, W, H);
        this.dynamicBg(ctx, setting, kind, L, t, lt, scene);
        if (L.bigBrain) this.prop('brain', ctx, 540, 880, 1, sh.propAge('brain'), t, { big: true, emotion: scene.emotion });
        this.furnitureBack(ctx, setting, kind, L, t);
        const poseT = sh.poseAge;
        if (L.bigPhone) { this.bigPhone(ctx, t, lt, scene.emotion); A = { head: { x: 540, y: 560, r: 80 }, top: 470, holdsPhone: true }; }
        else if (kind === 'lie') {
          const phone = scene.pose === 'scrolling-phone';
          A = this.lying(ctx, L.bed.hx, L.bed.hy, L.bed.scale, scene.pose === 'scrolling-phone' ? 'lying-awake' : scene.pose, scene.emotion, lt, { phone, blanket: setting === 'bedroom-night' ? '#5b7fbf' : this.art.accent2, bedRight: 1080 });
          A.holdsPhone = phone;
        } else {
          let x = L.charX; let facing = null;
          if (L.pace) { const w = Math.sin(lt * 0.8); x = L.charX + w * 200; facing = Math.cos(lt * 0.8) >= 0 ? 1 : -1; }
          if (kind !== 'desk') { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(x, L.groundY + 4, 150 * L.scale, 24 * L.scale, 0, 0, TAU); ctx.fill(); }
          const opts = { seatY: L.seatY, desk: !!L.desk && L.desk !== 'cafe', poseT, facing, seed: 0 };
          X = VTS.sceneExt ? VTS.sceneExt.pre(this, ctx, scene, L, kind, t, lt, x) : null;
          if (X) { if (X.targetR) opts.targetR = X.targetR; if (X.targetL) opts.targetL = X.targetL; }
          const ext = VTS.sceneExt;
          if (scene.behind && ext && ext.behind) ext.behind(this, ctx, scene, L, kind, t, lt, x); // v1.6: an extra standing behind the main character
          const custom = ext && ext.cast ? ext.cast(this, ctx, scene, L, kind, t, lt, x, opts, sh) : null; // v1.6: multi-character staging (waving, walking toward each other, ...)
          if (custom) A = custom;
          else if (scene.count === 2 && (scene.pose === 'hugging' || scene.pose === 'arguing')) {
            ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(L.charX2, L.groundY + 4, 140 * L.scale, 22 * L.scale, 0, 0, TAU); ctx.fill();
            this.character(ctx, L.charX2, L.groundY, L.scale, scene.pose, scene.emotion, t, Object.assign({}, opts, { variant: 1, seed: 3, pair: -1 }));
            A = this.character(ctx, x, L.groundY, L.scale, scene.pose, scene.emotion, t, Object.assign({}, opts, { pair: 1 }));
          } else if (scene.count === 2) {
            const talkA = Math.floor(lt / 1.6) % 2 === 0;
            ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(L.charX2, L.groundY + 4, 140 * L.scale, 22 * L.scale, 0, 0, TAU); ctx.fill();
            this.character(ctx, L.charX2, L.groundY, L.scale, talkA ? 'idle' : 'talking', scene.emotion, t, Object.assign({}, opts, { variant: 1, seed: 3 }));
            A = this.character(ctx, x, L.groundY, L.scale, talkA ? 'talking' : 'idle', scene.emotion, t, opts);
          } else A = this.character(ctx, x, L.groundY, L.scale, scene.pose, scene.emotion, t, opts);
          A.holdsPhone = scene.pose === 'scrolling-phone';
          if (kind === 'move' && scene.pose === 'running') { ctx.strokeStyle = this.ea('#ffffff', 0.55); ctx.lineWidth = 7; ctx.lineCap = 'round'; for (let i = 0; i < 4; i++) { const yy = A.head.y + 120 + i * 90; const xx = x - (facing || 1) * (200 + ((lt * 600 + i * 90) % 160)); ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx - (facing || 1) * 90, yy); ctx.stroke(); } }
        }
        this.furnitureFront(ctx, setting, kind, L, scene.pose, t);
        if (VTS.sceneExt) VTS.sceneExt.post(this, ctx, scene, L, kind, A, X, t, lt, sh);
      }
      const placed = this.placeProps(scene, L, A);
      placed.forEach((p) => { if (p.name === 'brain' && p.env.big && !sh.img) return; this.prop(p.name, ctx, p.x, p.y, p.sc, sh.propAge(p.name), t, p.env); });
      if (!sh.img && kind !== 'card' && VTS.sceneExt && VTS.sceneExt.overlay) VTS.sceneExt.overlay(this, ctx, scene, L, kind, t, lt); // v1.6 weather
      if (scene.callout) {
        // Sticker goes beside the head on the side away from the bubbles; if there is no room, drop to chest level on the other side.
        const head = A.head || { x: 540, y: 1000, r: 90 };
        ctx.font = '900 54px Montserrat, "Arial Black", sans-serif';
        const half = (Math.min(700, ctx.measureText(scene.callout.toUpperCase()).width) + 64) / 2 + 20;
        let dir = head.x > 560 ? -1 : 1; if (head.x + 250 * dir + 250 > W) dir = -1; if (head.x + 250 * dir - 250 < 0) dir = 1; // same rule as the bubbles
        const hasTB = scene.props.includes('thought-bubbles') || scene.props.includes('speech-bubbles');
        const away = hasTB ? -dir : (head.x > 540 ? -1 : 1);
        const gap = head.r * (A.lying ? 1.3 : 1.25) + 30;
        let cx = head.x + away * (gap + half); let cy = head.y - 10;
        const fits = (x) => x - half >= 20 && x + half <= W - 20;
        if (!fits(cx)) {
          const other = head.x - away * (gap + half);
          const aboveBusy = hasTB || scene.props.some((n) => ['lightbulb', 'weights', 'zzz', 'question-marks', 'exclamation'].includes(n) || (n === 'cloud' && !this.positive(scene.emotion)));
          if (fits(other) && !hasTB) cx = other;
          else if (!aboveBusy && (A.top || head.y - 110) - 80 > 800) { cx = head.x; cy = (A.top || head.y - 110) - 80; }
          else { cx = head.x - away * (head.r * 1.45 + half); cy = head.y + head.r + 190; }
        }
        cx = Math.max(half + 20, Math.min(W - half - 20, cx)); cy = Math.max(760, Math.min(1560, cy));
        this.callout(ctx, scene.callout, cx, cy, sh.calloutAge == null ? 1 : sh.calloutAge, t);
      }
      ctx.restore();
      return { caption: L.caption, kind };
    }
  }
  function thoughtIcons(scene) {
    const p = scene.props; const e = scene.emotion;
    if (scene.setting === 'bedroom-night') return ['cringe', 'clock', 'phone', 'q'];
    if (e === 'happy' || e === 'calm') return ['heart', 'bulb', 'moon'];
    if (p.includes('phone')) return ['phone', 'heart', 'q'];
    return ['q', 'cringe', 'clock', 'phone'];
  }
  function roundRect(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // Static preview frame of one scene (used in the beat editor).
  let previewStage = null;
  function drawPreview(canvas, scene, presetId, t) {
    if (!previewStage) previewStage = new Stage();
    if (previewStage.pid !== presetId) previewStage.setPreset(presetId);
    const ctx = canvas.getContext('2d'); const s = canvas.width / W;
    ctx.save(); ctx.setTransform(s, 0, 0, s, 0, 0);
    previewStage.drawShot(ctx, { scene, lt: t, t, dur: 4, s, propAge: () => 2, poseAge: 2, calloutAge: 2 });
    ctx.restore();
  }

  // Short text description of a scene (used for AI illustration prompts).
  function describe(scene) {
    const lab = (list, id) => (list.find((x) => x[0] === id) || [id, id])[1].toLowerCase();
    const who = (scene.count === 2 ? (scene.pose === 'talking' ? 'two friendly cartoon characters talking' : 'two friendly cartoon characters') : 'one friendly cartoon character (young adult in a hoodie)') + (scene.behind ? ' with another person standing behind' : '');
    return who + ', pose: ' + lab(POSES, scene.pose) + ', feeling ' + scene.emotion + ', setting: ' + lab(SETTINGS, scene.setting) + (scene.props.length ? ', with ' + scene.props.map((p) => lab(PROPS, p)).join(', ') : '');
  }

  VTS.scenes = { SETTINGS, POSES, EMOTIONS, PROPS, CAMERAS, TRANSITIONS, SET_IDS, POSE_IDS, EMO_IDS, PROP_IDS, CAM_IDS, normalizeScene, inferScene, sceneKey, Stage, drawPreview, describe, ART, easeInOut, easeOut };
}());
