/* Voice to Short — app UI. Plain JS, no build step. */
(function () {
  'use strict';
  const APP_VERSION = '1.5.0';
  const G = VTS.gemini; const S = VTS.shortgen; const R = VTS.render; const N = VTS.native; const DB = VTS.db;
  const $ = (id) => document.getElementById(id);
  const MAX_IDEA_SEC = 20 * 60; // long dictation (auto-restarts after pauses)
  const MAX_VOICE_SEC = R.MAX_SECONDS - R.LEAD - R.TAIL; // 58.9 s of audio fits in a 60 s Short
  const MAX_LONG_VOICE = R.MAX_LONG - R.LEAD - R.TAIL; // 20 min videos
  const LONG_RENDER_SEC = 150; // above this the render is done in segments saved to disk
  const SG = VTS.segments;

  const SPEECH_LANGS = [
    ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-IN', 'English (India)'], ['en-NG', 'English (Nigeria)'], ['en-GH', 'English (Ghana)'], ['en-KE', 'English (Kenya)'],
    ['es-ES', 'Spanish (Spain)'], ['es-MX', 'Spanish (Mexico)'], ['fr-FR', 'French'], ['de-DE', 'German'], ['pt-BR', 'Portuguese (Brazil)'],
    ['it-IT', 'Italian'], ['hi-IN', 'Hindi'], ['ja-JP', 'Japanese'], ['ko-KR', 'Korean'],
  ];
  const LANG_LOCALE = { English: 'en-US', Spanish: 'es-ES', French: 'fr-FR', German: 'de-DE', Portuguese: 'pt-BR', Italian: 'it-IT', Hindi: 'hi-IN', Indonesian: 'id-ID', Filipino: 'fil-PH', Swahili: 'sw-KE', Arabic: 'ar-SA', Japanese: 'ja-JP', Korean: 'ko-KR' };
  const EXAMPLES = [
    'Why you overthink at night and 3 ways to switch it off',
    'The psychology of quiet people who get respected more',
    '3 tiny habits that quietly rebuild self-confidence',
    'Why you procrastinate on the things you care about most',
    'How to stop people-pleasing without feeling guilty',
  ];

  // ---------- settings ----------
  const K = { key: 'vts.apiKey', model: 'vts.model', models: 'vts.models', handle: 'vts.handle', tone: 'vts.tone', language: 'vts.language', grade: 'vts.grade',
    watermark: 'vts.watermark', speechLang: 'vts.speechLang', wpm: 'vts.wpm', rawAudio: 'vts.rawAudio', last: 'vts.lastProject',
    ttsVoice: 'vts.ttsVoice', ttsStyle: 'vts.ttsStyle', ttsCustom: 'vts.ttsCustom', ttsModel: 'vts.ttsModel', ttsModels: 'vts.ttsModels', visualStyle: 'vts.visualStyle', aiImages: 'vts.aiImages', imageModel: 'vts.imageModel', aspect: 'vts.aspect', length: 'vts.length' };
  function load(key, fallback) { try { const raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); } catch (_) { return fallback; } }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { toast('Could not save settings: storage is full.', true); } }
  const getKey = () => String(localStorage.getItem(K.key) || '').trim();
  const getModel = () => { const m = String(load(K.model, G.DEFAULT_MODEL) || '').trim(); return /^[a-zA-Z0-9._-]{3,80}$/.test(m) ? m : G.DEFAULT_MODEL; };
  const handle = () => { const h = String(load(K.handle, '') || '').trim(); return h ? (h.startsWith('@') ? h : '@' + h) : ''; };
  const speechLang = () => load(K.speechLang, (navigator.language && /^[a-z]{2}-[A-Z]{2}$/.test(navigator.language)) ? navigator.language : 'en-US');
  const wpm = () => Number(load(K.wpm, 150)) || 150;
  const defAspect = () => { const a = load(K.aspect, '9:16'); return R.ASPECTS[a] ? a : '9:16'; };
  const defLength = (aspect) => { const l = load(K.length, null); if (l && S.LENGTHS.some((x) => x.id === l)) return l; return (aspect || defAspect()) === '9:16' ? '60' : '120'; };
  (function migrateModel() {
    const saved = load(K.model, null);
    if (typeof saved === 'string' && G.LEGACY_MODEL_RE.test(saved.trim())) save(K.model, G.DEFAULT_MODEL);
    const listed = load(K.models, null);
    if (Array.isArray(listed)) save(K.models, listed.filter((m) => typeof m === 'string' && !G.LEGACY_MODEL_RE.test(m)));
  })();
  const getTtsModel = () => { const m = String(load(K.ttsModel, G.TTS_DEFAULT_MODEL) || ''); return /^[a-zA-Z0-9._-]{3,80}$/.test(m) ? m : G.TTS_DEFAULT_MODEL; };
  const ttsVoice = () => { const v = load(K.ttsVoice, 'Sulafat'); return G.TTS_VOICES.some(([n]) => n === v) ? v : 'Sulafat'; };
  const TTS_STYLES = {
    calm: { style: 'calm, warm and confident, like a kind teacher; unhurried pace with small natural pauses', prefix: 'Say in a calm, warm, confident voice' },
    bold: { style: 'bold, energetic and direct; punchy, confident delivery', prefix: 'Say in a bold, energetic, confident voice' },
    soft: { style: 'soft, gentle and soothing; slow, intimate pace', prefix: 'Say in a soft, gentle, soothing voice' },
    sarcastic: { style: 'sarcastic best friend: dry, teasing and playful, with knowing pauses before punchlines and a smile in the voice; quick, conversational pace', prefix: 'Say in a dry, teasing, sarcastic best-friend voice, with a smile' },
    deadpan: { style: 'deadpan: flat, understated and unimpressed, perfectly timed pauses, never over-acted', prefix: 'Say in a flat, deadpan, unimpressed voice' },
    genz: { style: 'chaotic Gen-Z: fast, expressive and animated, big reactions, playful emphasis on punchlines', prefix: 'Say in a fast, expressive, playful Gen-Z voice' },
    roast: { style: 'gentle roast: amused, teasing and warm, like a friend lovingly calling you out; punchy timing', prefix: 'Say in an amused, teasing but warm voice' },
  };
  // v1.4: sarcastic bestie becomes the default tone for new projects (once).
  if (!load('vts.v14', false)) { save(K.tone, 'sarcastic'); save('vts.v14', true); }
  const CTAS = ['Follow if your brain does this too 🧠', 'Comment “same” if this is you 👇', 'Send this to the friend who does this 💀', 'Save this for your 3 a.m. brain 📌', 'Follow for more brain stuff 🧠✨', 'Which one are you? Comment 👇'];
  const defaultLook = () => ({ captionStyle: 'tiktok', textStyle: 'none', intensity: 'punchy', hook: true, cta: true, autoEmoji: true, loop: true, safeZones: false,
    sfx: true, music: 'quirky', musicVol: 0.5, sfxVol: 0.7, voiceVol: 1, progress: true, anim: load('vts.anim', '2d') === '3d' ? '3d' : '2d', motion: load('vts.motion', 'smooth') === 'classic' ? 'classic' : 'smooth' });
  function ttsStyle() {
    const mode = load(K.ttsStyle, 'tone');
    if (mode === 'custom') { const c = String(load(K.ttsCustom, '') || '').trim(); if (c) return { style: c, prefix: 'Say in this style (' + c + ')' }; }
    const key = mode === 'tone' || mode === 'custom' ? (P && P.tone) || load(K.tone, 'sarcastic') : mode;
    return TTS_STYLES[key] || TTS_STYLES.calm;
  }
  Object.assign(G.host, {
    getTtsModel, setTtsModel: (m) => save(K.ttsModel, m),
    getImageModel: () => { const m = String(load(K.imageModel, '') || ''); return /^[a-zA-Z0-9._-]{3,80}$/.test(m) ? m : ''; }, setImageModel: (m) => save(K.imageModel, m),
    onTtsModelSwitch: (from, to) => toast(from + ' is not available for this key. AI voice switched to ' + to + '.'),
    getKey, getModel,
    setModel: (m) => save(K.model, m),
    onModelSwitch: (from, to) => { toast(from + ' is not available for this key. Switched to ' + to + '.'); if (currentView === 'settings') renderSettings(); },
  });

  // ---------- helpers ----------
  let toastTimer = 0;
  function toast(text, isErr) {
    const el = $('toast'); el.textContent = text; el.classList.toggle('err', !!isErr); el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), isErr ? 4500 : 2400);
  }
  function setStatus(id, text, cls) { const el = $(id); el.textContent = text || ''; el.className = 'status' + (cls ? ' ' + cls : ''); }
  function uuid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2); }
  const fmt = (sec) => { sec = Math.max(0, Math.round(sec || 0)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
  const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function when(iso) {
    const d = new Date(iso); if (isNaN(d)) return '';
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now'; if (diff < 3600) return Math.floor(diff / 60) + ' min ago'; if (diff < 86400) return Math.floor(diff / 3600) + ' h ago';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }
  async function copyText(text, label) {
    text = String(text || '');
    if (!text.trim()) { toast('Nothing to copy yet.', true); return; }
    try { await navigator.clipboard.writeText(text); toast((label || 'Text') + ' copied'); return; } catch (_) { /* fallback */ }
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast((label || 'Text') + ' copied'); } catch (_) { toast('Copy is not available here.', true); }
    ta.remove();
  }
  function pickAudioType() {
    if (typeof MediaRecorder === 'undefined') return '';
    return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch (_) { return false; } }) || '';
  }
  async function getMic(clean) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Microphone recording is not supported here.');
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: clean === false
        ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        : { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch (err) {
      const e = new Error(err && err.name === 'NotAllowedError'
        ? 'Microphone permission was denied. ' + (N.isNative ? 'Allow it in Android Settings › Apps › Voice to Short › Permissions.' : 'Allow mic access for this site in your browser settings.')
        : 'Could not open the microphone: ' + (err && err.message || err));
      e.friendly = e.message; throw e;
    }
  }
  function recorder(stream) {
    const type = pickAudioType();
    const rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 128000 } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise((resolve) => { rec.onstop = () => resolve(new Blob(chunks, { type: (rec.mimeType || type || 'audio/webm').split(';')[0] })); });
    return { rec, done, start() { rec.start(500); }, stop() { if (rec.state !== 'inactive') rec.stop(); stream.getTracks().forEach((t) => t.stop()); return done; } };
  }

  // ---------- project state ----------
  let P = null;
  let voiceBuffer = null; // decoded + trimmed AudioBuffer for the current voice
  let saveTimer = 0;
  function blankProject() {
    const now = new Date().toISOString();
    const aspect = defAspect();
    const tone = load(K.tone, 'sarcastic');
    return { id: uuid(), createdAt: now, updatedAt: now, step: 'idea', idea: '', ideaAudio: null, tone, length: defLength(aspect),
      template: 'classic', humour: S.TONES[tone] && S.TONES[tone].funny ? 2 : 0, platform: load('vts.platform', 'both'),
      pkg: null, voice: null, video: null, thumb: '', genPartial: null, renderState: null,
      look: Object.assign({ aspect, quality: 'auto', preset: load(K.grade, 'teal'), captionCase: 'upper', watermark: !!load(K.watermark, false), format: 'auto',
        visual: load(K.visualStyle, 'scenes') === 'classic' ? 'classic' : 'scenes', aiImages: !!load(K.aiImages, false) }, defaultLook()) };
  }
  function persist(now) {
    clearTimeout(saveTimer);
    const run = () => {
      if (!P) return;
      P.updatedAt = new Date().toISOString();
      if (!P.idea.trim() && !P.pkg && !P.voice) return; // do not keep empty drafts
      DB.put(P).catch((err) => toast('Could not save project: ' + (err && err.message || err), true));
      save(K.last, P.id);
    };
    if (now) run(); else saveTimer = setTimeout(run, 500);
  }
  const lengthId = () => (P && P.length) || '60';
  const isShortLen = () => lengthId() === '60' || lengthId() === '30';
  const maxVoice = () => (isShortLen() ? MAX_VOICE_SEC : MAX_LONG_VOICE);
  const aspectOf = () => (P && P.look && R.ASPECTS[P.look.aspect] ? P.look.aspect : '9:16');
  const voiceIsLong = () => !!(P && P.voice && (P.voice.parts || (!isShortLen() && P.voice.duration > LONG_RENDER_SEC)));
  // A WAV header + raw PCM blob: nothing is decoded or copied (Blob parts stay on disk).
  function wavHeader(bytes, rate, ch) {
    const h = new DataView(new ArrayBuffer(44)); const w = (o, t) => { for (let i = 0; i < 4; i++) h.setUint8(o + i, t.charCodeAt(i)); };
    w(0, 'RIFF'); h.setUint32(4, 36 + bytes, true); w(8, 'WAVE'); w(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, ch, true);
    h.setUint32(24, rate, true); h.setUint32(28, rate * ch * 2, true); h.setUint16(32, ch * 2, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, bytes, true);
    return h.buffer;
  }
  const wavFromPcm = (pcmBlobs, rate, ch) => { const n = pcmBlobs.reduce((a, b) => a + b.size, 0); return new Blob([wavHeader(n, rate, ch)].concat(pcmBlobs), { type: 'audio/wav' }); };
  // Duration without decoding the whole file (long imports would need hundreds of MB decoded).
  function mediaDuration(blob) {
    return new Promise((resolve) => {
      const a = document.createElement('audio'); const url = URL.createObjectURL(blob); let done = false;
      const fin = (d) => { if (done) return; done = true; URL.revokeObjectURL(url); a.removeAttribute('src'); resolve(d); };
      a.preload = 'metadata'; a.onerror = () => fin(0);
      a.onloadedmetadata = () => { if (isFinite(a.duration) && a.duration > 0) fin(a.duration); else { a.ondurationchange = () => { if (isFinite(a.duration) && a.duration > 0) fin(a.duration); }; a.currentTime = 1e7; setTimeout(() => fin(isFinite(a.duration) ? a.duration : 0), 4000); } };
      a.src = url; setTimeout(() => fin(0), 10000);
    });
  }
  function projectTitle(p) { return (p.pkg && p.pkg.title) || (p.idea ? p.idea.trim().split(/\s+/).slice(0, 8).join(' ') + (S.wordCount(p.idea) > 8 ? '…' : '') : 'New Short'); }
  async function openProject(id, step) {
    const p = await DB.get(id);
    if (!p) { toast('That project was not found.', true); return; }
    stopAll();
    P = Object.assign(blankProject(), p);
    P.look = Object.assign(blankProject().look, p.look || {});
    if (p.look && p.look.intensity === undefined) Object.assign(P.look, { intensity: 'off', music: 'none', sfx: false, loop: false, autoEmoji: false, hook: false, cta: false, progress: !!p.look.progress }); // pre-1.4 projects keep their look
    if (p.humour === undefined) { P.template = 'classic'; P.humour = S.TONES[P.tone] && S.TONES[P.tone].funny ? 2 : 0; }
    if (!p.look || !p.look.aspect) P.look.aspect = '9:16'; // projects from v1.2 were vertical
    if (!p.length) P.length = p.pkg && p.pkg.long ? String((p.pkg.lengthSec || 600)) : '60';
    voiceBuffer = null; save(K.last, P.id);
    renderAll();
    showView('create');
    showStep(step || P.step || 'idea');
  }
  function newProject() {
    stopAll();
    persist(true);
    P = blankProject(); voiceBuffer = null;
    localStorage.removeItem(K.last);
    renderAll(); showView('create'); showStep('idea');
  }
  function renderAll() { renderIdea(); renderScript(); renderVoice(); renderRenderPane(); $('project-name').textContent = projectTitle(P); }

  // ---------- navigation ----------
  const views = { create: $('view-create'), library: $('view-library'), settings: $('view-settings') };
  let currentView = 'create';
  function showView(name) {
    if (name !== 'create') stopPreview();
    currentView = name;
    Object.entries(views).forEach(([k, el]) => el.classList.toggle('active', k === name));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
    if (name === 'library') renderLibrary();
    if (name === 'settings') renderSettings();
    history.replaceState(null, '', '#' + name);
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));
  $('new-project').addEventListener('click', () => {
    if (rendering) { toast('Wait for the render to finish (or cancel it).', true); return; }
    newProject(); toast('New Short started');
  });

  const STEPS = ['idea', 'script', 'voice', 'render'];
  function stepAllowed(s) {
    if (s === 'idea' || s === 'script') return true;
    if (s === 'voice') return !!P.pkg;
    return !!P.pkg;
  }
  function showStep(s) {
    if (!stepAllowed(s)) { toast(s === 'voice' || s === 'render' ? 'Write the script first.' : 'Not yet.', true); s = P.pkg ? 'script' : 'idea'; }
    if (s !== 'render') stopPreview();
    if (s !== 'idea' && dictating) stopDictation();
    P.step = s; persist();
    STEPS.forEach((k) => $('pane-' + k).classList.toggle('active', k === s));
    paintStepper();
    if (s === 'script') renderScript();
    if (s === 'voice') renderVoice();
    if (s === 'render') renderRenderPane();
    window.scrollTo(0, 0);
  }
  function paintStepper() {
    const done = { idea: !!P.idea.trim() && !!P.pkg, script: !!P.pkg, voice: !!P.voice, render: !!P.video };
    document.querySelectorAll('.step').forEach((b) => {
      const s = b.dataset.step;
      b.classList.toggle('active', s === P.step);
      b.classList.toggle('done', done[s] && s !== P.step);
      b.disabled = !stepAllowed(s);
    });
  }
  document.querySelectorAll('.step').forEach((b) => b.addEventListener('click', () => showStep(b.dataset.step)));
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]'); if (g) { showStep(g.dataset.goto); return; }
    const c = e.target.closest('[data-copy]'); if (c) { e.preventDefault(); copyField(c.dataset.copy); }
  });
  // Hide the tab bar only while the on-screen keyboard is actually open (viewport shrinks + a text field is focused).
  let maxH = window.innerHeight;
  function checkKeyboard() {
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    maxH = Math.max(maxH, window.innerHeight, h);
    const a = document.activeElement;
    const typing = !!(a && a.matches('textarea, input[type=text], input[type=password], input[type=number]'));
    document.body.classList.toggle('keyboard-open', typing && h < maxH * 0.78);
  }
  window.addEventListener('resize', checkKeyboard);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', checkKeyboard);
  document.addEventListener('focusin', () => setTimeout(checkKeyboard, 300));
  document.addEventListener('focusout', () => setTimeout(checkKeyboard, 50));
  window.addEventListener('orientationchange', () => { maxH = 0; setTimeout(checkKeyboard, 400); });

  // ---------- step 1: idea ----------
  const ideaEl = $('idea');
  function renderIdea() {
    ideaEl.value = P.idea || '';
    updateIdeaCount();
    const seg = $('tone-seg'); seg.innerHTML = '';
    Object.entries(S.TONES).forEach(([id, t]) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = t.label; b.dataset.v = id;
      b.className = P.tone === id ? 'on' : ''; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', P.tone === id);
      b.addEventListener('click', () => { P.tone = id; persist(); renderIdea(); });
      seg.appendChild(b);
    });
    const an0 = P.look && P.look.anim === '3d' ? '3d' : '2d'; document.querySelectorAll('#anim-seg-idea button').forEach((b) => { b.classList.toggle('on', b.dataset.v === an0); b.setAttribute('aria-checked', b.dataset.v === an0); });
    const ex = $('idea-examples');
    if (!ex.childElementCount) EXAMPLES.forEach((t) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = t; b.addEventListener('click', () => { if (ideaEl.value.trim() && !confirm('Replace your idea with this example?')) return; P.idea = t; ideaEl.value = t; updateIdeaCount(); persist(); }); ex.appendChild(b); });
    const tp = $('opt-template');
    if (!tp.options.length) Object.entries(S.FORMATS).forEach(([id, f]) => tp.add(new Option(f.label, id)));
    tp.value = S.FORMATS[P.template] ? P.template : 'classic';
    const tr = (VTS.ideas && VTS.ideas.TRENDS || []).find((x) => x.id === tp.value);
    $('template-why').textContent = tr ? tr.why + ' Example: ' + tr.ex : '';
    const long = S.isLong(lengthId()); tp.disabled = long; $('opt-humour').disabled = long;
    $('template-badge').textContent = long ? 'long videos use chapters' : '';
    const hv = P.humour == null ? 2 : P.humour; $('opt-humour').value = hv;
    $('humour-label').textContent = ['😐', '🙂', '😂', '🤪'][hv] + ' ' + S.HUMOUR[hv];
    document.querySelectorAll('#platform-seg button').forEach((b) => b.classList.toggle('on', b.dataset.v === (P.platform || 'both')));
    $('platform-note').textContent = { both: 'captions for both apps', tiktok: 'TikTok caption + hashtags', youtube: 'YouTube title + #Shorts' }[P.platform || 'both'];
    $('ib-count').textContent = VTS.ideas ? '(' + VTS.ideas.COUNT + ')' : '';
    const ls = $('opt-length');
    if (ls.options.length !== S.LENGTHS.length) { ls.innerHTML = ''; S.LENGTHS.forEach((l) => ls.add(new Option(l.label + (l.sec >= 300 ? ' · long video' : ''), l.id))); }
    ls.value = lengthId(); paintLengthNote();
    paintIdeaAudio();
    setStatus('gen-status', getKey() ? '' : 'Tip: add your free Gemini API key in Settings to write scripts.');
  }
  function paintLengthNote() {
    const L = S.lengthOf(lengthId()); const a = aspectOf();
    $('length-aspect').textContent = 'Frame: ' + a + ' (change in Render)';
    const notes = [];
    if (L.sec > 60 && a === '9:16') notes.push('Heads-up: YouTube Shorts can be at most 3 minutes. ' + (L.sec > 180 ? 'A ' + L.label + ' vertical video will upload as a regular video, not a Short.' : 'This fits, but under 60 s performs best.'));
    if (L.sec >= 300) notes.push('Long video: Gemini writes an outline first, then each section separately (about ' + Math.max(3, Math.round(L.sec / 80)) + ' sections). It resumes if something fails. Rendering runs in real time in parts (≈' + Math.round(L.sec / 60) + ' min), saved to storage as it goes.');
    if (L.sec > 60 && a !== '9:16') notes.push('Tip: 16:9 is the classic YouTube shape for long videos.');
    $('length-note').textContent = notes.join(' ');
  }
  $('opt-length').addEventListener('change', (e) => { P.length = e.target.value; save(K.length, P.length); persist(); renderIdea(); if (P.pkg) updateScriptMeta(); });
  $('opt-template').addEventListener('change', (e) => { P.template = e.target.value; if (P.template !== 'classic' && !P.humour) P.humour = 2; persist(); renderIdea(); });
  $('opt-humour').addEventListener('input', (e) => { P.humour = Number(e.target.value) || 0; persist(); renderIdea(); });
  document.querySelectorAll('#platform-seg button').forEach((b) => b.addEventListener('click', () => {
    P.platform = b.dataset.v; save('vts.platform', P.platform);
    // Platform presets: vertical 9:16, ~60 s Short (both apps favour vertical under a minute).
    if (!P.video) { P.look.aspect = '9:16'; if (!S.lengthOf(P.length).sec || S.lengthOf(P.length).sec > 60) { P.length = '60'; } }
    persist(); renderIdea(); if (P.pkg) renderScript();
  }));
  // Idea bank
  let ibCat = '';
  function useIdea(it) {
    if (ideaEl.value.trim() && ideaEl.value.trim() !== it.text && !confirm('Replace your idea with this one?')) return;
    P.idea = it.text; ideaEl.value = it.text; if (it.format && S.FORMATS[it.format]) P.template = it.format;
    if (it.length) P.length = it.length; if (!P.humour) P.humour = 2;
    if (!S.TONES[P.tone] || !S.TONES[P.tone].funny) P.tone = load(K.tone, 'sarcastic') in S.TONES && S.TONES[load(K.tone, 'sarcastic')].funny ? load(K.tone, 'sarcastic') : 'sarcastic';
    updateIdeaCount(); persist(); renderIdea(); $('project-name').textContent = projectTitle(P);
    toast('Idea set · ' + (S.FORMATS[P.template] || {}).label + ' · ' + S.lengthOf(P.length).label);
  }
  function paintIdeaBank() {
    if (!VTS.ideas) return;
    const tc = $('ib-trends'); if (!tc.childElementCount) VTS.ideas.TRENDS.forEach((t) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'trend-card';
      b.innerHTML = '<strong></strong><span></span><em></em>'; b.querySelector('strong').textContent = t.name; b.querySelector('span').textContent = t.why; b.querySelector('em').textContent = t.ex;
      b.addEventListener('click', () => { P.template = t.id; if (!P.humour && t.id !== 'classic') P.humour = 2; persist(); renderIdea(); toast('Format: ' + t.name); });
      tc.appendChild(b);
    });
    const cats = Object.keys(VTS.ideas.BANK); if (!ibCat) ibCat = cats[0];
    const cc = $('ib-cats'); cc.innerHTML = '';
    cats.forEach((c) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (c === ibCat ? ' on' : ''); b.textContent = c + ' · ' + VTS.ideas.BANK[c].length; b.addEventListener('click', () => { ibCat = c; paintIdeaBank(); }); cc.appendChild(b); });
    const ul = $('ib-list'); ul.innerHTML = '';
    VTS.ideas.IDEAS.filter((x) => x.cat === ibCat).forEach((it) => {
      const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button';
      b.innerHTML = '<span></span><small></small>'; b.querySelector('span').textContent = it.text;
      b.querySelector('small').textContent = ((S.FORMATS[it.format] || {}).label || it.format) + ' · ' + (it.length === '30' ? '30 s' : '60 s');
      b.addEventListener('click', () => useIdea(it)); li.appendChild(b); ul.appendChild(li);
    });
  }
  $('ib-open').addEventListener('click', () => { const box = $('ideabank'); const open = box.classList.toggle('hidden') === false; $('ib-open').setAttribute('aria-expanded', open); if (open) { paintIdeaBank(); box.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
  $('ib-close').addEventListener('click', () => { $('ideabank').classList.add('hidden'); $('ib-open').setAttribute('aria-expanded', 'false'); });
  $('ib-surprise').addEventListener('click', () => { if (!VTS.ideas) return; const it = VTS.ideas.surprise(); ibCat = it.cat; useIdea(it); if (!$('ideabank').classList.contains('hidden')) paintIdeaBank(); });
  function paintIdeaAudio() {
    const wrap = $('idea-audio-wrap');
    if (P.ideaAudio && P.ideaAudio.size) { wrap.classList.remove('hidden'); setMedia($('idea-audio'), P.ideaAudio); } else wrap.classList.add('hidden');
  }
  const mediaUrls = new WeakMap();
  function setMedia(el, blob) {
    const old = mediaUrls.get(el); if (old && old.blob === blob) return;
    if (old) URL.revokeObjectURL(old.url);
    if (!blob) { el.removeAttribute('src'); el.load(); mediaUrls.delete(el); return; }
    const url = URL.createObjectURL(blob); mediaUrls.set(el, { blob, url }); el.src = url;
  }
  function updateIdeaCount() { $('idea-count').textContent = S.wordCount(ideaEl.value) + ' words'; }
  ideaEl.addEventListener('input', () => { if (dictating) return; P.idea = ideaEl.value; updateIdeaCount(); persist(); $('project-name').textContent = projectTitle(P); });

  // Dictation (native Android recognizer restarts after pauses, like the notes app).
  let dictating = false; let engine = null; let baseText = ''; let committed = ''; let interim = ''; let micTimer = 0; let micStart = 0; let rawRec = null;
  const micBtn = $('mic');
  function joinText() {
    const parts = [baseText.replace(/\s+$/, ''), committed.trim(), interim.trim()].filter(Boolean);
    let out = parts.shift() || '';
    for (const p of parts) out += (out.endsWith('\n') || !out ? '' : ' ') + p;
    return out;
  }
  function paintDictation() { ideaEl.value = joinText(); ideaEl.scrollTop = ideaEl.scrollHeight; updateIdeaCount(); }
  function setMic(on) {
    micBtn.classList.toggle('on', on); micBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    micBtn.setAttribute('aria-label', on ? 'Stop dictation' : 'Start dictation'); ideaEl.readOnly = on;
    if (!on) { $('mic-progress').style.strokeDashoffset = 351.9; }
  }
  micBtn.addEventListener('click', () => { if (dictating) stopDictation(); else startDictation(); });
  async function startDictation() {
    if (dictating) return;
    baseText = ideaEl.value; committed = ''; interim = '';
    try {
      engine = await VTS.speech.create({
        lang: speechLang,
        commit: (t) => { t = String(t || '').trim(); if (t) committed = committed ? committed + ' ' + t : t; paintDictation(); P.idea = joinText(); persist(); },
        interim: (t) => { interim = t || ''; paintDictation(); },
        error: (msg) => { setStatus('mic-status', msg, 'err'); stopDictation(true); },
        ended: () => { if (dictating) stopDictation(); },
      });
      dictating = true; setMic(true);
      setStatus('mic-status', 'Listening… pauses are fine. Tap the mic to stop.', 'live');
      micStart = Date.now();
      micTimer = setInterval(() => {
        const sec = (Date.now() - micStart) / 1000;
        $('mic-time').textContent = fmt(sec);
        $('mic-progress').style.strokeDashoffset = 351.9 * (1 - Math.min(1, sec / MAX_IDEA_SEC));
        if (sec >= MAX_IDEA_SEC) { stopDictation(); toast('20 minutes reached — the transcript is saved. Tap the mic again to keep going.'); }
      }, 250);
      await engine.start();
      if (load(K.rawAudio, false)) {
        try { rawRec = recorder(await getMic(true)); rawRec.start(); } catch (_) { rawRec = null; }
      }
    } catch (err) {
      dictating = false; setMic(false); engine = null; clearInterval(micTimer);
      setStatus('mic-status', err && err.friendly ? err.friendly : 'Could not start dictation: ' + G.redact(err && err.message || err), 'err');
    }
  }
  async function stopDictation(quiet) {
    if (!dictating) return;
    dictating = false; clearInterval(micTimer);
    const e = engine; engine = null;
    try { if (e) await e.stop(); } catch (_) { /* ignore */ }
    if (interim) { committed = committed ? committed + ' ' + interim.trim() : interim.trim(); interim = ''; }
    paintDictation(); setMic(false);
    P.idea = ideaEl.value; persist(); $('project-name').textContent = projectTitle(P);
    if (rawRec) { const r = rawRec; rawRec = null; r.stop().then((blob) => { if (blob.size > 2000) { P.ideaAudio = blob; persist(); paintIdeaAudio(); } }); }
    if (quiet) return;
    setStatus('mic-status', committed.trim() ? 'Got it. Edit anything, then tap “Write my Short”.' : 'No speech was captured. Try again closer to the mic, or type your idea.', committed.trim() ? 'ok' : '');
  }

  // Generate the Short package.
  let generating = false; let genAbort = null;
  $('btn-gen-cancel').addEventListener('click', () => { if (genAbort) genAbort.abort(); });
  async function generate() {
    if (generating) return;
    if (dictating) await stopDictation(true);
    P.idea = ideaEl.value;
    if (S.wordCount(P.idea) < 3) { setStatus('gen-status', 'Say or type your idea first (a sentence or two is enough).', 'err'); return; }
    if (!getKey()) { setStatus('gen-status', 'Add your free Gemini API key in Settings first.', 'err'); showView('settings'); toast('Paste your Gemini key here first', true); return; }
    generating = true;
    $('generate').disabled = true; $('regenerate').disabled = true;
    setStatus('gen-status', '');
    P.step = 'script'; STEPS.forEach((k) => $('pane-' + k).classList.toggle('active', k === 'script')); paintStepper();
    $('script-loading').classList.remove('hidden'); $('script-body').classList.add('hidden'); $('script-empty').classList.add('hidden');
    const L = S.lengthOf(lengthId()); const long = S.isLong(L.id);
    const lt = $('script-loading-text'); lt.textContent = long ? 'Planning a ' + L.label + ' video…' : L.sec > 60 ? 'Writing your ' + L.label + ' script…' : S.isComedy({ tone: P.tone, format: P.template, humour: P.humour, length: L.id }) ? 'Writing the jokes, the hook and the plot twist… 🧠' : 'Writing your hook, 3 steps and captions…';
    $('script-bar').classList.toggle('hidden', !long); $('script-bar-fill').style.width = '0';
    genAbort = new AbortController(); $('btn-gen-cancel').classList.toggle('hidden', !long);
    try {
      const pkg = await S.generatePackage(P.idea, { tone: P.tone, format: P.template || 'classic', humour: P.humour, platform: P.platform || 'both', language: load(K.language, 'English'), handle: handle(), length: L.id, signal: genAbort.signal,
        partial: P.genPartial || null,
        onPartial: (part) => { P.genPartial = part; persist(true); },
        onProgress: (q) => {
          if (q.phase === 'outline') lt.textContent = 'Step 1 / ' + q.n + ': outlining the sections…';
          else if (q.phase === 'section') lt.textContent = 'Step ' + (q.i + 1) + ' / ' + q.n + ': writing “' + (q.title || 'section ' + q.i) + '”…';
          else if (q.phase === 'repair' && q.what === 'empty') lt.textContent = 'Gemini sent back an empty reply — trying again a different way…';
          else if (q.phase === 'repair') lt.textContent = q.what === 'split' ? 'Gemini’s reply was cut off — writing the script and the beats separately…' : 'Gemini’s reply was cut off — retrying with a compact request…';
          else if (q.phase === 'wait') lt.textContent = (q.quota ? 'Gemini rate limit reached — ' : 'Gemini hiccup — ') + 'retrying in ' + Math.round(q.ms / 1000) + ' s (attempt ' + (q.attempt + 1) + ')…';
          if (q.n) $('script-bar-fill').style.width = Math.round(100 * (q.phase === 'section' ? q.i : 0) / q.n) + '%';
        } });
      P.pkg = pkg; P.video = null; P.genPartial = null; P.renderState = null;
      persist(true);
      $('project-name').textContent = projectTitle(P);
      toast('Script ready — pick a hook and tweak anything');
    } catch (err) {
      let msg = G.friendlyError(err);
      if (P.genPartial && P.genPartial.sections && P.genPartial.sections.length) msg += ' Progress is saved (' + P.genPartial.sections.length + ' section' + (P.genPartial.sections.length > 1 ? 's' : '') + ' written) — tap “Write my Short” again to continue where it stopped.';
      if (P.pkg) { toast(msg, true); } else { showStep('idea'); setStatus('gen-status', msg, 'err'); }
    } finally {
      genAbort = null; $('btn-gen-cancel').classList.add('hidden'); $('script-bar').classList.add('hidden');
      generating = false; $('generate').disabled = false; $('regenerate').disabled = false;
      $('script-loading').classList.add('hidden');
      if (P.pkg) { renderScript(); paintStepper(); }
    }
  }
  $('generate').addEventListener('click', generate);
  $('regenerate').addEventListener('click', () => { if (!confirm('Write a fresh script from the same idea? Your edits to this script will be replaced.')) return; P.genPartial = null; generate(); });

  // ---------- step 2: script ----------
  let beatsStale = false;
  function renderScript() {
    const has = !!(P && P.pkg);
    $('script-empty').classList.toggle('hidden', has || generating);
    $('script-body').classList.toggle('hidden', !has || generating);
    if (!has) return;
    const pkg = P.pkg;
    const hooks = $('hooks'); hooks.innerHTML = '';
    pkg.hooks.forEach((h, i) => {
      const row = document.createElement('div');
      row.className = 'hook' + (i === pkg.hookIndex ? ' on' : ''); row.setAttribute('role', 'radio'); row.setAttribute('aria-checked', i === pkg.hookIndex);
      row.innerHTML = '<span class="dot"></span><textarea rows="2" aria-label="Hook option ' + (i + 1) + '"></textarea>';
      const ta = row.querySelector('textarea'); ta.value = h;
      let before = h;
      ta.addEventListener('focus', () => { before = pkg.hooks[i]; });
      ta.addEventListener('input', () => { pkg.hooks[i] = ta.value; persist(); });
      ta.addEventListener('change', () => {
        const cur = ta.value.trim(); pkg.hooks[i] = cur;
        if (i === pkg.hookIndex && before.trim() !== cur) {
          const old = before.trim();
          if (old && pkg.script.startsWith(old)) pkg.script = cur + pkg.script.slice(old.length);
          else pkg.script = cur + ' ' + pkg.script;
          S.rebuildHookBeats(pkg); markVideoStale(); persist(); renderScript();
        }
        before = cur;
      });
      row.addEventListener('click', (e) => {
        if (i === pkg.hookIndex) return;
        S.applyHook(pkg, i); markVideoStale(); persist(); renderScript();
        if (e.target !== ta) toast('Hook ' + (i + 1) + ' selected');
      });
      hooks.appendChild(row);
    });
    $('script').value = pkg.script;
    updateScriptMeta();
    $('rebuild-beats').classList.toggle('hidden', !beatsStale);
    renderBeats();
    $('f-title').value = pkg.title; $('f-description').value = pkg.description; $('f-hashtags').value = pkg.hashtags.join(' ');
    $('f-pinned').value = pkg.pinnedComment; $('f-thumb').value = pkg.thumbnailText;
    $('f-texthook').value = pkg.textHook || ''; $('f-cta').value = pkg.cta || '';
    $('texthook-count').textContent = pkg.textHook ? S.wordCount(pkg.textHook) + ' words · shown for the first ~2 s' : 'optional';
    $('f-tt-caption').value = pkg.tiktokCaption || ''; $('f-tt-hashtags').value = (pkg.tiktokHashtags || []).join(' ');
    const plat = P.platform || 'both';
    $('kit-tiktok').classList.toggle('hidden', plat === 'youtube'); $('kit-yt-h').classList.toggle('hidden', plat === 'tiktok');
    const cc = $('cta-chips'); cc.innerHTML = '';
    CTAS.forEach((t) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + ((pkg.cta || '') === t ? ' on' : ''); b.textContent = t; b.addEventListener('click', () => { pkg.cta = t; $('f-cta').value = t; markVideoStale(); persist(); renderScript(); }); cc.appendChild(b); });
  }
  $('f-texthook').addEventListener('input', (e) => { P.pkg.textHook = e.target.value; markVideoStale(); persist(); });
  $('f-cta').addEventListener('input', (e) => { P.pkg.cta = e.target.value; markVideoStale(); persist(); });
  $('f-tt-caption').addEventListener('input', (e) => { P.pkg.tiktokCaption = e.target.value; persist(); });
  $('f-tt-hashtags').addEventListener('change', (e) => { P.pkg.tiktokHashtags = Array.from(new Set(e.target.value.split(/[\s,]+/).map(S.normHashtag).filter(Boolean))).slice(0, 8); e.target.value = P.pkg.tiktokHashtags.join(' '); persist(); });
  function updateScriptMeta() {
    const n = S.wordCount($('script').value); const L = S.lengthOf(lengthId()); const [lo, hi] = L.words;
    const b = $('word-badge'); b.textContent = n + ' words'; b.className = 'badge ' + (n >= lo * 0.9 && n <= hi * 1.1 ? 'ok' : 'warn');
    const sec = n / 2.5; const cap = L.sec === 60 ? 60 : R.MAX_LONG;
    $('script-est').textContent = '≈ ' + (sec >= 90 ? fmt(sec) + ' min' : Math.round(sec) + ' s') + ' spoken · target ' + L.label + ' (' + lo + '–' + hi + ' words)'
      + (sec > cap ? ' · too long for ' + (cap === 60 ? '60 s' : '20 min') : n < lo * 0.9 ? ' · a bit short' : n > hi * 1.25 ? ' · a bit long' : '');
  }
  $('script').addEventListener('input', () => {
    P.pkg.script = $('script').value; updateScriptMeta(); beatsStale = true; $('rebuild-beats').classList.remove('hidden'); markVideoStale(); persist();
  });
  $('rebuild-beats').addEventListener('click', () => {
    const pkg = P.pkg;
    pkg.beats = S.beatsFromScript(pkg.script, pkg.hooks[pkg.hookIndex], pkg.beats);
    beatsStale = false; persist(); renderScript(); toast('Captions rebuilt from the script');
  });
  const STEP_LABELS = ['Hook', 'Step 1', 'Step 2', 'Step 3', 'CTA'];
  const SC = VTS.scenes;
  const scenesOn = () => !P.look || P.look.visual !== 'classic';
  const labelOf = (list, id) => (list.find((x) => x[0] === id) || [id, id])[1];
  function sceneSummary(sc) {
    if (!sc) return 'Auto scene';
    return labelOf(SC.SETTINGS, sc.setting) + ' · ' + labelOf(SC.POSES, sc.pose) + ' · ' + labelOf(SC.EMOTIONS, sc.emotion) + (sc.props.length ? ' · ' + sc.props.map((x) => labelOf(SC.PROPS, x)).join(', ') : '');
  }
  function ensureScenes() { if (P.pkg && P.pkg.beats.some((b) => !b.scene || !b.scene.setting)) S.attachScenes(P.pkg.beats); }
  function heuristicNewScene(i) {
    const b = P.pkg.beats[i]; const cur = b.scene || {}; const prev = i > 0 ? P.pkg.beats[i - 1].scene : null;
    const inferred = SC.normalizeScene(null, b.text, b.step, null);
    if (SC.sceneKey(inferred) !== SC.sceneKey(cur)) return inferred;
    const pick = (arr, not) => { const c = arr.filter((x) => x !== not); return c[Math.floor(Math.random() * c.length)]; };
    return SC.normalizeScene({ setting: cur.setting, pose: pick(SC.POSE_IDS, cur.pose), emotion: pick(SC.EMO_IDS, cur.emotion), props: [pick(SC.PROP_IDS), pick(SC.PROP_IDS)], camera: pick(SC.CAM_IDS, cur.camera), callout: cur.callout }, b.text, b.step, prev);
  }
  function sceneEditor(li, b, i) {
    const box = li.querySelector('.b-scene'); const btn = li.querySelector('.b-scene-btn');
    const sum = () => { btn.textContent = '🎬 ' + sceneSummary(b.scene); };
    sum();
    let built = false;
    const build = () => {
      built = true;
      box.innerHTML = '<canvas class="sc-prev" width="135" height="240" aria-label="Scene preview"></canvas><div class="sc-fields">'
        + '<label class="sc-pickrow">Find a keyword, prop or action<span class="sc-pick"><input class="sc-find" type="search" list="kw-list" placeholder="e.g. pencil, piggy bank, running, 🍕 pizza" autocomplete="off"><button type="button" class="chip sc-find-go">Use</button></span></label>'
        + '<label>Setting<select data-f="setting"></select></label><label>Action<select data-f="pose"></select></label>'
        + '<label>Emotion<select data-f="emotion"></select></label><label>Camera<select data-f="camera"></select></label>'
        + '<label>Props<span class="sc-props"><select data-p="0"></select><select data-p="1"></select><select data-p="2"></select></span></label>'
        + '<label>Callout<input data-f="callout" type="text" maxlength="28" placeholder="e.g. 2:07 AM (optional)"></label>'
        + '<label>Keywords<input class="sc-kw" type="text" maxlength="80" placeholder="words the scene must show, comma separated"></label>'
        + '<p class="small sc-match"></p>'
        + '<label>Weather<select data-f="weather"></select></label>'
        + '<label class="sc-two"><input type="checkbox" data-f="count"> Two characters (conversation / waving / walking toward)</label>'
        + '<label class="sc-two"><input type="checkbox" data-f="behind"> Someone standing behind</label>'
        + '<div class="sc-actions"><button type="button" class="chip sc-regen">↻ Regenerate scene</button><button type="button" class="chip sc-same"' + (i ? '' : ' disabled') + '>Same as previous</button></div></div>';
      const fill = (sel, list, none) => { if (none) sel.add(new Option('— none —', '')); list.forEach(([id, l]) => sel.add(new Option(l, id))); };
      fill(box.querySelector('[data-f=setting]'), SC.SETTINGS); fill(box.querySelector('[data-f=pose]'), SC.POSES);
      fill(box.querySelector('[data-f=emotion]'), SC.EMOTIONS); fill(box.querySelector('[data-f=camera]'), SC.CAMERAS);
      fill(box.querySelector('[data-f=weather]'), SC.WEATHER || [['', 'Auto']]);
      box.querySelectorAll('[data-p]').forEach((sel) => fill(sel, SC.PROPS, true));
      const cv = box.querySelector('.sc-prev');
      const paint = () => {
        const sc = b.scene;
        box.querySelectorAll('[data-f]').forEach((el) => { const f = el.dataset.f; if (f === 'count') el.checked = sc.count === 2; else if (f === 'behind') el.checked = !!sc.behind; else if (f === 'weather') el.value = sc.weatherAuto === false ? (sc.weather || '') : ''; else el.value = sc[f] || ''; });
        box.querySelectorAll('[data-p]').forEach((el) => { el.value = sc.props[Number(el.dataset.p)] || ''; });
        box.querySelector('.sc-kw').value = (sc.keywords || []).join(', ');
        const m = SC.matchScore ? SC.matchScore(b.text, sc) : null; const mEl = box.querySelector('.sc-match');
        mEl.textContent = m && m.score != null ? 'Keyword match ' + m.score + '%' + (m.missing.length ? ' · not shown: ' + m.missing.slice(0, 3).join(', ') : '') : 'No concrete keyword in this line — any scene works.';
        mEl.className = 'small sc-match ' + (m && m.score != null && m.score < 50 ? 'warn' : 'muted');
        const draw = () => { try { SC.drawPreview(cv, sc, P.look.preset, 1.6); } catch (_) { /* ignore */ } };
        draw(); if (SC.preload) SC.preload([sc]).then(draw, () => {});
        sum(); paintBeatBadge(li, b);
      };
      const changed = (ev) => {
        const raw = Object.assign({}, b.scene); const f = ev && ev.target && ev.target.dataset.f;
        box.querySelectorAll('[data-f]').forEach((el) => { const f = el.dataset.f; if (f === 'count') raw.count = el.checked ? 2 : 1; else if (f === 'behind') raw.behind = el.checked; else if (f === 'weather') { raw.weather = el.value; raw.weatherAuto = !el.value; } else raw[f] = el.value; });
        raw.props = Array.from(box.querySelectorAll('[data-p]')).map((el) => el.value).filter(Boolean);
        b.scene = SC.normalizeScene(raw, b.text, b.step, i > 0 ? P.pkg.beats[i - 1].scene : null, f === 'setting' ? 'setting' : 'pose');
        b.scene.edited = true;
        markVideoStale(); persist(); paint();
      };
      box.querySelectorAll('select, input[data-f]').forEach((el) => el.addEventListener('change', changed));
      box.querySelector('.sc-kw').addEventListener('change', (ev) => {
        const raw = Object.assign({}, b.scene, { keywords: ev.target.value.split(',').map((x) => x.trim()).filter(Boolean) });
        b.scene = SC.normalizeScene(raw, b.text, b.step, i > 0 ? P.pkg.beats[i - 1].scene : null, 'pose'); b.scene.edited = true; markVideoStale(); persist(); paint();
      });
      const find = box.querySelector('.sc-find');
      const usePick = () => {
        const r = resolvePick(find.value); if (!r) { toast('No match for “' + find.value + '”. Try a simpler word.', true); return; }
        const prev = i > 0 ? P.pkg.beats[i - 1].scene : null; const cur = Object.assign({}, b.scene);
        let sc;
        if (r.kind === 'prop') { cur.props = [r.id].concat((cur.props || []).filter((x) => x !== r.id)).slice(0, 3); if (cur.setting === 'keyword-card') cur.setting = ''; sc = SC.normalizeScene(cur, b.text, b.step, prev, 'pose'); if (!sc.props.includes(r.id)) sc.props = [r.id].concat(sc.props).slice(0, 3); }
        else if (r.kind === 'action') { const a = SC.ACTIONS[r.id]; cur.pose = r.id; if (a && a.ok && !a.ok.includes(cur.setting)) cur.setting = a.ok[0]; sc = SC.normalizeScene(cur, b.text, b.step, prev, 'pose'); sc.pose = r.id; if (a && a.ok && !a.ok.includes(sc.setting)) sc.setting = a.ok[0]; }
        else { sc = SC.normalizeScene(Object.assign(cur, { icon: r.id, iconWord: r.word }), b.text, b.step, prev, 'card'); Object.assign(sc, { setting: 'keyword-card', pose: 'standing-thinking', icon: r.id, iconWord: r.word }); }
        sc.keywords = Array.from(new Set([r.word].concat(sc.keywords || []))).slice(0, 6);
        b.scene = sc; b.scene.edited = true; find.value = ''; markVideoStale(); persist(); paint();
        toast('Scene now shows: ' + r.label);
      };
      box.querySelector('.sc-find-go').addEventListener('click', usePick);
      find.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); usePick(); } });
      find.addEventListener('change', () => { if (pickIndex().has(find.value)) usePick(); });
      box.querySelector('[data-f=callout]').addEventListener('input', () => { b.scene.callout = box.querySelector('[data-f=callout]').value.slice(0, 28); markVideoStale(); persist(); });
      box.querySelector('.sc-same').addEventListener('click', () => { if (!i) return; b.scene = JSON.parse(JSON.stringify(P.pkg.beats[i - 1].scene)); markVideoStale(); persist(); paint(); });
      const regen = box.querySelector('.sc-regen');
      regen.addEventListener('click', async () => {
        regen.disabled = true; regen.textContent = '↻ Thinking…';
        let sc = null; let note = '';
        if (getKey()) {
          try { sc = await S.regenerateScene(P.pkg, i); } catch (err) { note = ' (Gemini: ' + G.friendlyError(err) + ' — used a built-in suggestion)'; }
        }
        if (!sc) sc = heuristicNewScene(i);
        b.scene = sc; markVideoStale(); persist(); paint();
        regen.disabled = false; regen.textContent = '↻ Regenerate scene';
        toast('New scene: ' + sceneSummary(sc) + note, !!note);
      });
      paint();
    };
    btn.addEventListener('click', () => {
      const open = box.classList.toggle('hidden') === false;
      btn.setAttribute('aria-expanded', String(open));
      if (open && !built) build();
    });
  }
  // Searchable picker over library props, actions and the bundled emoji (keyword icon cards).
  let pickMap = null;
  function pickIndex() {
    if (pickMap) return pickMap;
    pickMap = new Map(); const dl = document.createElement('datalist'); dl.id = 'kw-list';
    const add = (label, v) => { if (pickMap.has(label)) return; pickMap.set(label, v); dl.appendChild(new Option(label)); };
    (SC.PROPS || []).forEach(([id, l]) => add('Prop · ' + l, { kind: 'prop', id, word: l.toLowerCase(), label: l }));
    (SC.POSES || []).forEach(([id, l]) => add('Action · ' + l, { kind: 'action', id, word: l.toLowerCase(), label: l }));
    (VTS.EMOJI_DATA || []).forEach(([file, label, tags, group]) => { if (group === 2) return; add('Icon · ' + label, { kind: 'icon', id: file, word: label.split(/\s+/).pop(), label, tags }); });
    document.body.appendChild(dl);
    return pickMap;
  }
  function resolvePick(q) {
    q = String(q || '').trim(); if (!q) return null; const map = pickIndex();
    if (map.has(q)) return map.get(q);
    const low = q.toLowerCase().replace(/^(prop|action|icon)\s*·\s*/, '');
    const all = Array.from(map.values());
    const exact = all.find((v) => v.kind !== 'icon' && v.label.toLowerCase() === low) || all.find((v) => v.label.toLowerCase() === low);
    if (exact) return exact;
    const lx = SC.lexLookup && SC.lexLookup(low.split(/\s+/).pop());
    if (lx && lx.e.p && lx.e.p.length) { const id = lx.e.p[0]; const hit = all.find((v) => v.kind === 'prop' && v.id === id); if (hit) return Object.assign({}, hit, { word: low }); }
    if (lx && lx.e.a) { const hit = all.find((v) => v.kind === 'action' && v.id === lx.e.a); if (hit) return Object.assign({}, hit, { word: low }); }
    const f = SC.emojiForWord && SC.emojiForWord(low.split(/\s+/).pop());
    if (f) { const hit = all.find((v) => v.kind === 'icon' && v.id === f); return Object.assign({}, hit || { kind: 'icon', id: f, label: low }, { word: low }); }
    return all.find((v) => v.kind !== 'icon' && v.label.toLowerCase().includes(low)) || all.find((v) => v.kind === 'icon' && (' ' + v.label + ' ' + (v.tags || '') + ' ').includes(' ' + low + ' ')) || null;
  }
  function paintBeatBadge(li, b) {
    const el = li.querySelector('.b-match'); if (!el) return;
    const m = b.scene && SC.matchScore ? SC.matchScore(b.text, b.scene) : null;
    if (!m || m.score == null) { el.textContent = 'no keyword'; el.className = 'b-match'; li.classList.remove('low'); return; }
    const low = m.score < 50; el.textContent = (low ? '⚠ ' : '✓ ') + 'match ' + m.score + '%' + (low && m.missing.length ? ' · missing “' + m.missing[0] + '”' : '');
    el.className = 'b-match ' + (low ? 'low' : 'ok'); li.classList.toggle('low', low);
  }
  function paintMatchSummary() {
    const el = $('match-summary'); if (!scenesOn() || !P.pkg || !SC.matchScore) { el.textContent = ''; return; }
    const ms = P.pkg.beats.map((b) => (b.scene ? SC.matchScore(b.text, b.scene) : null)).filter((m) => m && m.score != null);
    if (!ms.length) { el.textContent = ''; return; }
    const avg = Math.round(ms.reduce((a, m) => a + m.score, 0) / ms.length); const low = ms.filter((m) => m.score < 50).length;
    el.textContent = 'Keyword match: ' + avg + '% average' + (low ? ' · ' + low + ' beat' + (low > 1 ? 's' : '') + ' flagged ⚠ — open 🎬 and use “Find a keyword”.' : ' · every keyword is shown.');
    el.className = 'small ' + (low ? 'warn-text' : 'ok-text');
  }
  let beatSection = 0;
  function renderBeats() {
    const list = $('beats'); list.innerHTML = '';
    const scenes = scenesOn();
    if (scenes) ensureScenes();
    $('scene-hint').classList.toggle('hidden', !scenes);
    const secs = P.pkg.sections && P.pkg.sections.length > 1 ? P.pkg.sections : null;
    const sr = $('beat-section-row'); sr.classList.toggle('hidden', !secs);
    if (secs) {
      const sel = $('beat-section'); if (beatSection >= secs.length) beatSection = 0;
      if (sel.options.length !== secs.length || sel.dataset.pkg !== P.pkg.title) { sel.innerHTML = ''; secs.forEach((x, k) => sel.add(new Option('Part ' + (k + 1) + ' · ' + x.title, k))); sel.dataset.pkg = P.pkg.title; }
      sel.value = beatSection; $('beat-section-info').textContent = secs.length + ' parts · ' + P.pkg.beats.length + ' beats';
    }
    paintMatchSummary();
    P.pkg.beats.forEach((b, i) => {
      if (secs && (b.section || 0) !== beatSection) return;
      const li = document.createElement('li'); li.className = 'beat s' + b.step;
      li.innerHTML = '<select aria-label="Section"></select><input class="b-text" type="text" aria-label="Caption text"><button type="button" class="b-del" aria-label="Delete beat">×</button>'
        + '<div class="b-row"><label>Weight <input class="b-weight" type="number" min="0.5" max="12" step="0.5" inputmode="decimal"></label><label style="flex:1">Emphasis <input class="b-emph" type="text" placeholder="key word"></label></div>'
        + (!secs ? '<div class="b-row b-comedy"><label>🗣 <select class="b-speaker" aria-label="Speaker"></select></label><label>✨ <select class="b-fx" aria-label="Overlay"></select></label><label>🔊 <select class="b-sfx" aria-label="Sound effect"></select></label><input class="b-sticker" type="text" maxlength="16" placeholder="sticker e.g. BRUH" aria-label="Sticker"></div>' : '')
        + (scenes ? '<span class="b-match"></span><button type="button" class="b-scene-btn" aria-expanded="false"></button><div class="b-scene hidden"></div>'
          : '<input class="b-visual" type="text" aria-label="Visual idea" placeholder="🎞 b-roll / visual idea">');
      const sel = li.querySelector('select'); STEP_LABELS.forEach((l, k) => sel.add(new Option(l, k))); sel.value = b.step;
      const tx = li.querySelector('.b-text'); tx.value = b.text;
      const w = li.querySelector('.b-weight'); w.value = b.weight;
      const em = li.querySelector('.b-emph'); em.value = b.emphasis || '';
      if (!secs) {
        const sp = li.querySelector('.b-speaker'); sp.add(new Option('auto', '')); S.SPEAKERS.forEach((k) => sp.add(new Option(k, k))); sp.value = S.SPEAKERS.includes(b.speaker) ? b.speaker : '';
        const fx = li.querySelector('.b-fx'); S.FX_IDS.forEach((k) => fx.add(new Option(k === 'none' ? 'no overlay' : k, k === 'none' ? '' : k))); fx.value = b.fx && S.FX_IDS.includes(b.fx) ? b.fx : '';
        const sf = li.querySelector('.b-sfx'); S.SFX_IDS.forEach((k) => sf.add(new Option(k === 'none' ? 'auto sound' : k, k === 'none' ? '' : k))); sf.value = b.sfx && S.SFX_IDS.includes(b.sfx) ? b.sfx : '';
        const stk = li.querySelector('.b-sticker'); stk.value = b.sticker || '';
        sp.addEventListener('change', () => { b.speaker = sp.value; markVideoStale(); persist(); });
        fx.addEventListener('change', () => { b.fx = fx.value; markVideoStale(); persist(); });
        sf.addEventListener('change', () => { b.sfx = sf.value; markVideoStale(); persist(); });
        stk.addEventListener('input', () => { b.sticker = stk.value.trim(); markVideoStale(); persist(); });
      }
      sel.addEventListener('change', () => { b.step = Number(sel.value); li.className = 'beat s' + b.step; markVideoStale(); persist(); });
      tx.addEventListener('input', () => { b.text = tx.value; markVideoStale(); persist(); });
      tx.addEventListener('change', () => { if (scenes) { paintBeatBadge(li, b); paintMatchSummary(); } });
      w.addEventListener('input', () => { b.weight = Math.max(0.5, Math.min(12, Number(w.value) || 1)); markVideoStale(); persist(); });
      em.addEventListener('input', () => { b.emphasis = em.value.trim(); markVideoStale(); persist(); });
      if (scenes) { sceneEditor(li, b, i); paintBeatBadge(li, b); }
      else {
        const vi = li.querySelector('.b-visual'); vi.value = b.visual ? '🎞 ' + b.visual : '';
        vi.addEventListener('input', () => { b.visual = vi.value.replace(/^🎞\s*/, ''); persist(); });
      }
      li.querySelector('.b-del').addEventListener('click', () => { P.pkg.beats.splice(i, 1); markVideoStale(); persist(); renderBeats(); });
      list.appendChild(li);
    });
    paintVisualSegs();
  }
  $('beat-section').addEventListener('change', (e) => { beatSection = Number(e.target.value) || 0; renderBeats(); });
  function paintVisualSegs() {
    const v = P && P.look && P.look.visual === 'classic' ? 'classic' : 'scenes';
    document.querySelectorAll('.vis-seg button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    $('ai-img-row').classList.toggle('hidden', v === 'classic');
  }
  document.querySelectorAll('.vis-seg button').forEach((b) => b.addEventListener('click', () => {
    if (!P) return;
    P.look.visual = b.dataset.v; markVideoStale(); persist();
    if (P.pkg) renderBeats();
    if (P.step === 'render') renderRenderPane(); else paintVisualSegs();
  }));
  $('add-beat').addEventListener('click', () => {
    const last = P.pkg.beats[P.pkg.beats.length - 1];
    const secs = P.pkg.sections && P.pkg.sections.length > 1;
    const inSec = secs ? P.pkg.beats.filter((b) => (b.section || 0) === beatSection) : null; const ref = secs ? inSec[inSec.length - 1] || last : last;
    const nb = { text: '', weight: 3, step: ref ? ref.step : 4, emphasis: '', visual: '', scene: ref && ref.scene ? JSON.parse(JSON.stringify(ref.scene)) : null };
    if (secs) { nb.section = beatSection; nb.chapter = ref ? ref.chapter : ''; P.pkg.beats.splice(ref ? P.pkg.beats.indexOf(ref) + 1 : P.pkg.beats.length, 0, nb); } else P.pkg.beats.push(nb);
    persist(); renderBeats();
    const inputs = $('beats').querySelectorAll('.b-text'); if (inputs.length) inputs[inputs.length - 1].focus();
  });
  $('f-title').addEventListener('input', (e) => { P.pkg.title = e.target.value; $('project-name').textContent = projectTitle(P); persist(); });
  $('f-description').addEventListener('input', (e) => { P.pkg.description = e.target.value; persist(); });
  $('f-hashtags').addEventListener('change', (e) => { P.pkg.hashtags = Array.from(new Set(e.target.value.split(/[\s,]+/).map(S.normHashtag).filter(Boolean))); e.target.value = P.pkg.hashtags.join(' '); persist(); });
  $('f-pinned').addEventListener('input', (e) => { P.pkg.pinnedComment = e.target.value; persist(); });
  $('f-thumb').addEventListener('input', (e) => { P.pkg.thumbnailText = e.target.value; persist(); });
  function fieldText(f) {
    const p = P && P.pkg; if (!p) return '';
    if (f === 'hashtags') return p.hashtags.join(' ');
    if (f === 'tiktok') return (p.tiktokCaption || p.title || '') + ((p.tiktokHashtags || []).length ? '\n\n' + p.tiktokHashtags.join(' ') : '');
    if (f === 'description') return p.description + (p.hashtags.length ? '\n\n' + p.hashtags.join(' ') : '');
    return p[f] || '';
  }
  function copyField(f) {
    const labels = { tiktok: 'TikTok caption', title: 'Title', description: 'Description', hashtags: 'Hashtags', pinnedComment: 'Pinned comment', thumbnailText: 'Thumbnail text' };
    copyText(fieldText(f), labels[f]);
  }
  $('copy-all').addEventListener('click', () => {
    const p = P.pkg;
    const plat = P.platform || 'both'; const out = [];
    if (plat !== 'youtube') out.push('— TIKTOK —', 'CAPTION', p.tiktokCaption || p.title, '', (p.tiktokHashtags || []).join(' '), '');
    if (plat !== 'tiktok') out.push('— YOUTUBE SHORTS —', 'TITLE', p.title, '', 'DESCRIPTION', p.description, '', p.hashtags.join(' '), '', 'PINNED COMMENT', p.pinnedComment, '');
    out.push('TEXT HOOK (first frame)', p.textHook || '', '', 'CTA', p.cta || '', '', 'THUMBNAIL TEXT', p.thumbnailText, '', 'SCRIPT', p.script);
    copyText(out.join('\n'), 'Publish kit');
  });
  function markVideoStale() { if (P.video) { P.video.stale = true; } }

  // ---------- step 3: voice ----------
  const ttsLocale = () => { const lang = load(K.language, 'English'); const sl = speechLang(); const loc = LANG_LOCALE[lang] || 'en-US'; return sl.slice(0, 2) === loc.slice(0, 2) ? sl : loc; };
  function renderVoice() {
    const v = P.voice;
    $('take-card').classList.toggle('hidden', !v);
    if (v) {
      const names = { gemini: 'AI voice' + (v.ttsVoice ? ' · ' + v.ttsVoice : ''), mic: 'Your voice', 'tts-file': 'Android voice', 'tts-mic': 'Device voice (via mic)', import: 'Imported audio', silent: 'No voice (silent)' };
      $('take-badge').textContent = names[v.source] || 'Voice';
      $('take-badge').className = 'badge ok';
      const vb = voiceBlob(v) || (v.parts && v.parts[0] && v.parts[0].blob) || null;
      $('take-audio').classList.toggle('hidden', !vb);
      if (vb) setMedia($('take-audio'), vb);
      $('ai-regenerate').classList.toggle('hidden', v.source !== 'gemini');
      $('take-info').textContent = (v.source === 'gemini' && v.ttsModel ? 'Gemini ' + v.ttsModel + ' · ' : '') + fmt(v.duration) + (v.source === 'silent' ? ' of captions at a relaxed pace. Record a voiceover in the YouTube app after uploading.' : ' · silences at the start and end are trimmed when rendering')
        + (v.parts ? ' · ' + v.parts.length + ' parts' : '')
        + (v.duration > maxVoice() ? (isShortLen() ? ' · Longer than ~59 s, so the end will be cut to keep the Short under 60 s (pick a longer video length in step 1 to keep it all).' : ' · Longer than 20 min, so the end will be cut.') : '')
        + (!isShortLen() && aspectOf() === '9:16' && v.duration > 178 ? ' · Over 3 min: YouTube will treat this vertical video as a regular video, not a Short.' : '');
    }
    paintAiVoices();
    // Honest TTS notes.
    const note = $('tts-note');
    if (N.canTtsToFile) {
      note.textContent = 'Uses your phone’s Android voice. “Use Android voice” renders it straight into the video.';
      $('tts-file').classList.remove('hidden'); $('tts-mic').classList.add('hidden');
    } else if (N.ttsMode === 'web') {
      note.textContent = 'Browsers can’t put their built-in voice into a video file. Preview it, or record it through your mic (lower quality — quiet room, volume up).';
      $('tts-file').classList.add('hidden'); $('tts-mic').classList.remove('hidden');
    } else if (N.ttsMode === 'native') {
      note.textContent = 'Preview only here — record it through your mic to use it in the video.';
      $('tts-mic').classList.remove('hidden');
    } else {
      note.textContent = 'Text-to-speech is not available on this device. Record your own voice instead.';
      $('tts-preview').classList.add('hidden');
    }
    paintStepper();
  }
  // Long voices are kept as parts (per section / chunk); playback uses a lazily joined Blob.
  const joinedVoice = new WeakMap();
  function voiceBlob(v) {
    if (!v) return null; if (v.blob) return v.blob; if (!v.parts || !v.parts.length) return null;
    if (joinedVoice.has(v.parts)) return joinedVoice.get(v.parts);
    const pcm = v.parts.every((x) => x.pcm && x.rate === v.parts[0].rate);
    const b = pcm ? wavFromPcm(v.parts.map((x) => x.pcm), v.parts[0].rate, v.parts[0].channels || 1) : v.parts.length === 1 ? v.parts[0].blob : null;
    if (b) joinedVoice.set(v.parts, b);
    return b;
  }
  async function setVoice(blob, source, duration, meta) {
    try {
      let dur = duration || 0;
      if (blob && blob.size > 12 * 1024 * 1024) { dur = await mediaDuration(blob); if (!dur) { const buf = await R.decodeBlob(blob); dur = buf.duration; } }
      else if (blob) { const buf = await R.decodeBlob(blob); dur = buf.duration; if (R.speechBounds(buf).silent && source !== 'silent') toast('That recording sounds silent. Check the mic and try again.', true); }
      else if (meta && meta.parts) dur = meta.parts.reduce((a, x) => a + (x.duration || 0), 0);
      P.voice = Object.assign({ blob: blob || null, source, duration: dur, mime: blob ? blob.type : '', createdAt: new Date().toISOString() }, meta || {});
      voiceBuffer = null; P.renderState = null; markVideoStale(); persist(true); renderVoice();
      setStatus('voice-status', 'Voice ready (' + fmt(dur) + '). Next: render your video.', 'ok');
    } catch (err) {
      setStatus('voice-status', 'Could not read that audio: ' + (err && err.message || err || 'unsupported format'), 'err');
    }
  }
  $('opt-record').addEventListener('click', openPrompter);
  $('import-audio').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 300 * 1024 * 1024) { setStatus('voice-status', 'That file is too big (max 300 MB).', 'err'); return; }
    setStatus('voice-status', 'Reading audio…');
    await setVoice(f.slice(0, f.size, f.type || 'audio/mpeg'), 'import');
  });
  $('opt-silent').addEventListener('click', () => {
    const words = S.wordCount(P.pkg ? P.pkg.script : '');
    setVoice(null, 'silent', Math.min(maxVoice(), Math.max(8, words / (wpm() / 60))));
  });
  let speaking = false;
  $('tts-preview').addEventListener('click', async () => {
    if (speaking) { N.stopSpeaking(); speaking = false; $('tts-preview').textContent = '▶ Preview'; return; }
    speaking = true; $('tts-preview').textContent = '■ Stop';
    try { await N.speak(P.pkg.script, { lang: ttsLocale(), rate: Number($('tts-rate').value), pitch: Number($('tts-pitch').value) }); } catch (err) { toast(String(err && err.message || err), true); }
    speaking = false; $('tts-preview').textContent = '▶ Preview';
  });
  $('tts-file').addEventListener('click', async () => {
    const btn = $('tts-file'); btn.disabled = true; setStatus('voice-status', 'Creating the Android voice track…');
    try {
      const blob = await N.ttsToFile(P.pkg.script, { lang: ttsLocale(), rate: Number($('tts-rate').value), pitch: Number($('tts-pitch').value) });
      await setVoice(blob, 'tts-file');
    } catch (err) {
      setStatus('voice-status', 'Android voice failed: ' + (err && err.message || err) + '\nRecord your own voice instead (recommended).', 'err');
    } finally { btn.disabled = false; }
  });
  $('tts-mic').addEventListener('click', async () => {
    const btn = $('tts-mic'); btn.disabled = true;
    let r = null;
    try {
      setStatus('voice-status', 'Recording the device voice through your mic… keep the room quiet.', 'live');
      r = recorder(await getMic(false)); r.start();
      await new Promise((res) => setTimeout(res, 300));
      await N.speak(P.pkg.script, { lang: ttsLocale(), rate: Number($('tts-rate').value), pitch: Number($('tts-pitch').value) });
      await new Promise((res) => setTimeout(res, 400));
      const blob = await r.stop(); r = null;
      await setVoice(blob, 'tts-mic');
    } catch (err) {
      if (r) r.stop();
      setStatus('voice-status', (err && err.friendly) || ('Could not record the device voice: ' + (err && err.message || err)), 'err');
    } finally { btn.disabled = false; }
  });

  // ----- AI voice (Gemini TTS) -----
  const previewCache = new Map(); let previewAudio = null; let previewBusy = '';
  const PREVIEW_TEXT = 'Here is a small psychology trick that can change how you feel tonight.';
  // Second voice for dialogue scripts (Brain vs Me etc.). 'auto' = a contrasting voice, 'off' = one voice for everything.
  const voice2Pref = () => { const v = load('vts.ttsVoice2', 'auto'); return v === 'off' || v === 'auto' || G.TTS_VOICES.some(([n]) => n === v) ? v : 'auto'; };
  function voice2For(a) { const v = voice2Pref(); if (v === 'off') return ''; if (v !== 'auto') return v === a ? (a === 'Puck' ? 'Kore' : 'Puck') : v; return a === 'Puck' ? 'Kore' : 'Puck'; }
  const SPK_LABEL = { brain: 'Brain', friend: 'Friend', boss: 'Boss', crush: 'Crush', mom: 'Mom', therapist: 'Therapist', cat: 'Cat' };
  // Build "Me:/Brain:" lines from the beats when the script is a two-character dialogue; null otherwise.
  function dialogueLines(pkg) {
    if (!pkg || !pkg.beats || !pkg.beats.length) return null;
    const other = pkg.beats.map((b) => String(b.speaker || '').toLowerCase()).find((k) => SPK_LABEL[k]); if (!other) return null;
    const lines = [];
    pkg.beats.forEach((b) => { const k = String(b.speaker || '').toLowerCase(); const who = SPK_LABEL[k] ? SPK_LABEL[other] : 'Me'; const t = String(b.text || '').trim(); if (!t) return;
      if (lines.length && lines[lines.length - 1].speaker === who) lines[lines.length - 1].text += ' ' + t; else lines.push({ speaker: who, text: t }); });
    const n = { Me: 0 }; lines.forEach((l) => { n[l.speaker] = (n[l.speaker] || 0) + 1; });
    if (Object.keys(n).length < 2 || !n.Me || lines.length < 3) return null;
    const joined = S.wordCount(lines.map((l) => l.text).join(' ')); if (joined < S.wordCount(pkg.script) * 0.85) return null;
    return { lines, other: SPK_LABEL[other] };
  }
  function paintAiVoices() {
    const v2 = $('ai-voice2');
    if (v2.options.length !== G.TTS_VOICES.length + 2) { v2.innerHTML = ''; v2.add(new Option('Auto (a contrasting voice)', 'auto')); v2.add(new Option('Off — one voice reads everything', 'off')); G.TTS_VOICES.forEach(([n, d]) => v2.add(new Option(n + ' — ' + d, n))); }
    v2.value = voice2Pref(); $('ai-voice2-row').classList.toggle('hidden', !dialogueLines(P && P.pkg));
    const list = $('ai-voices'); const cur = ttsVoice();
    if (list.childElementCount !== G.TTS_VOICES.length) {
      list.innerHTML = '';
      G.TTS_VOICES.forEach(([name, desc]) => {
        const b = document.createElement('div'); b.className = 'voice'; b.dataset.voice = name; b.setAttribute('role', 'radio'); b.tabIndex = 0;
        b.innerHTML = '<span class="v-text"><strong></strong><small></small></span><button type="button" class="v-play" aria-label="Preview ' + name + '">▶</button>';
        b.querySelector('strong').textContent = name; b.querySelector('small').textContent = desc;
        b.addEventListener('click', (e) => { if (e.target.closest('.v-play')) return; save(K.ttsVoice, name); paintAiVoices(); });
        b.querySelector('.v-play').addEventListener('click', () => previewVoice(name, b.querySelector('.v-play')));
        list.appendChild(b);
      });
    }
    list.querySelectorAll('.voice').forEach((b) => { const on = b.dataset.voice === cur; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    const d = (G.TTS_VOICES.find(([n]) => n === cur) || [])[1];
    $('ai-voice-name').textContent = cur + (d ? ' — ' + d : '');
    const mode = load(K.ttsStyle, 'tone'); $('ai-style').value = mode;
    $('ai-style').options[0].textContent = 'Match my tone (' + ((S.TONES[P && P.tone] || S.TONES.calm).label) + ')';
    $('ai-style-custom').classList.toggle('hidden', mode !== 'custom'); $('ai-style-custom').value = load(K.ttsCustom, '');
  }
  $('ai-voice2').addEventListener('change', (e) => save('vts.ttsVoice2', e.target.value));
  $('ai-style').addEventListener('change', (e) => { save(K.ttsStyle, e.target.value); paintAiVoices(); if (e.target.value === 'custom') $('ai-style-custom').focus(); });
  $('ai-style-custom').addEventListener('change', (e) => save(K.ttsCustom, e.target.value.trim()));
  function stopVoicePreview() { if (previewAudio) { previewAudio.pause(); previewAudio = null; } document.querySelectorAll('.v-play.playing').forEach((b) => { b.classList.remove('playing'); b.textContent = '▶'; }); }
  async function previewVoice(name, btn) {
    if (btn.classList.contains('playing')) { stopVoicePreview(); return; }
    if (previewBusy) return;
    stopVoicePreview();
    if (!getKey()) { toast('Add your Gemini API key in Settings to hear AI voices.', true); return; }
    const st = ttsStyle(); const key = name + '|' + st.style;
    try {
      let blob = previewCache.get(key);
      if (!blob) {
        previewBusy = name; btn.classList.add('busy'); btn.textContent = '…';
        const r = await G.ttsRequest(PREVIEW_TEXT, { voice: name, style: st.style, prefix: st.prefix, timeout: 60000 });
        blob = G.pcmToWav([r.pcm], r.rate, r.channels, 0); previewCache.set(key, blob);
      }
      previewAudio = new Audio(URL.createObjectURL(blob));
      btn.classList.add('playing'); btn.textContent = '■';
      previewAudio.onended = () => stopVoicePreview();
      await previewAudio.play();
    } catch (err) {
      setStatus('voice-status', aiError(err), 'err');
    } finally { previewBusy = ''; btn.classList.remove('busy'); if (!btn.classList.contains('playing')) btn.textContent = '▶'; }
  }
  function aiError(err) {
    const msg = G.friendlyError(err);
    return err && err.quota ? msg : 'AI voice failed: ' + msg;
  }
  let aiBusy = false;
  async function generateAiVoice() {
    if (aiBusy || !P.pkg) return;
    if (!getKey()) { setStatus('voice-status', 'Add your free Gemini API key in Settings first.', 'err'); return; }
    stopVoicePreview();
    aiBusy = true; const btns = [$('ai-generate'), $('ai-regenerate')]; btns.forEach((b) => { b.disabled = true; });
    const label = $('ai-generate').querySelector('span'); const old = label.textContent;
    const st = ttsStyle(); const voice = ttsVoice();
    const long = !isShortLen() && (S.wordCount(P.pkg.script) > 320 || (P.pkg.sections && P.pkg.sections.length > 1));
    setStatus('voice-status', 'Creating the ' + voice + ' voice with Gemini… ' + (long ? '(long script: generated in parts, each saved as it finishes)' : '(about 10–30 s)'), 'live');
    try {
      if (long) {
        // Chunk per section/paragraph (≤ ~150 words), cache each finished chunk in IndexedDB so a failure never restarts everything.
        const units = []; const secs = P.pkg.sections && P.pkg.sections.length ? P.pkg.sections : [{ title: '', text: P.pkg.script }];
        secs.forEach((sec, k) => { const paras = String(sec.text).split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean); paras.forEach((para) => G.ttsChunks(para, 150).forEach((t) => units.push({ text: t, section: k }))); });
        const t0 = Date.now();
        const r = await G.speechChunks(units.map((u) => u.text), { voice, style: st.style, prefix: st.prefix, cache: DB.cache,
          onProgress: (i, n, cached) => { label.textContent = 'Voice part ' + Math.min(n, i + (cached ? 0 : 1)) + ' / ' + n + '…'; const el = (Date.now() - t0) / 1000; setStatus('voice-status', 'Creating the voice: ' + i + ' of ' + n + ' parts done' + (i > 1 && i < n ? ' · about ' + fmt(el / i * (n - i)) + ' left' : '') + '. Finished parts are cached — if it stops, tap Generate again to continue.', 'live'); },
          onWait: (ms, n, err) => setStatus('voice-status', (err && err.status === 429 ? 'Gemini voice quota/rate limit — ' : 'Retrying after an error — ') + 'waiting ' + Math.round(ms / 1000) + ' s (attempt ' + (n + 1) + ')…', 'live') });
        const parts = r.parts.map((x, k) => ({ pcm: x.pcm, rate: x.rate, channels: x.channels || 1, section: units[k].section, duration: x.pcm.size / (2 * (x.channels || 1) * x.rate) }));
        await setVoice(null, 'gemini', 0, { ttsVoice: voice, ttsModel: r.model, ttsStyle: st.style, parts });
        setStatus('voice-status', 'AI voice ready (' + voice + ', ' + r.model + ', ' + parts.length + ' parts, ' + fmt(P.voice.duration) + ').', 'ok');
        return;
      }
      const dlg = dialogueLines(P.pkg); const v2 = dlg ? voice2For(voice) : '';
      const onProgress = (i, n) => { label.textContent = n > 1 ? 'Generating part ' + (i + 1) + ' / ' + n + '…' : 'Generating…'; };
      let r = null; let note = '';
      if (dlg && v2) {
        try {
          setStatus('voice-status', 'Creating a two-voice dialogue: ' + voice + ' (Me) + ' + v2 + ' (' + dlg.other + ')… (about 10–40 s)', 'live');
          const dOpts = { speakers: [{ speaker: 'Me', voice, style: st.style }, { speaker: dlg.other, voice: v2, style: dlg.other === 'Brain' ? 'smug, mischievous and dramatic, a little faster, playful' : 'natural and expressive, conversational' }], style: st.style, onProgress, timeout: 60000 };
          try { r = await G.generateDialogueSpeech(dlg.lines, dOpts); } catch (e1) {
            if (e1 && (e1.quota || e1.status === 429 || e1.status === 400)) throw e1;
            setStatus('voice-status', 'Two-voice request hiccup — trying once more…', 'live'); r = await G.generateDialogueSpeech(dlg.lines, dOpts);
          }
          note = ' · two voices: ' + voice + ' + ' + v2;
        } catch (err) {
          if (err && (err.quota || err.status === 429)) throw err;
          r = null; note = ' · one voice (two-voice mode was not available: ' + G.friendlyError(err).slice(0, 80) + ')';
        }
      }
      if (!r) r = await G.generateSpeech(P.pkg.script, { voice, style: st.style, prefix: st.prefix, onProgress });
      await setVoice(r.blob, 'gemini', 0, { ttsVoice: r.dialogue ? voice + ' + ' + v2 : voice, ttsModel: r.model, ttsStyle: st.style });
      if (note) { setStatus('voice-status', 'AI voice ready (' + r.model + note + ', ' + fmt(P.voice.duration) + '). Play it below, or regenerate for a different read.', 'ok'); return; }
      setStatus('voice-status', 'AI voice ready (' + voice + ', ' + r.model + (r.chunks > 1 ? ', ' + r.chunks + ' parts joined' : '') + '). Play it below, or regenerate for a different read.', 'ok');
    } catch (err) {
      setStatus('voice-status', aiError(err), 'err');
    } finally { aiBusy = false; btns.forEach((b) => { b.disabled = false; }); label.textContent = old; }
  }
  $('ai-generate').addEventListener('click', generateAiVoice);
  $('ai-regenerate').addEventListener('click', generateAiVoice);

  // Teleprompter (long videos: record section by section, retake any section, pause/resume)
  let pState = null;
  const pSectioned = () => !!(P.pkg && !isShortLen() && P.pkg.sections && P.pkg.sections.length > 1);
  function pText() { return pState && pState.sections ? pState.sections[pState.idx].text : P.pkg.script; }
  function paintPrompterText() {
    const box = $('p-text'); box.innerHTML = '';
    const txt = pText();
    const sentences = txt.match(/[^.!?…]+[.!?…]*["”’)]?\s*/g) || [txt];
    sentences.forEach((s) => { const span = document.createElement('span'); span.textContent = s; if (/^\s*(step\s*)?(one|two|three|first|second|third|1|2|3)\b/i.test(s)) span.className = 's'; box.appendChild(span); });
    $('p-scroll').scrollTop = 0;
    const secs = pState.sections;
    $('p-sections').classList.toggle('hidden', !secs);
    if (secs) {
      const k = pState.idx; const done = pState.takes.filter(Boolean).length;
      $('p-sec-label').innerHTML = 'Part ' + (k + 1) + ' / ' + secs.length + ' · ' + esc(secs[k].title) + (pState.takes[k] ? ' <span class="done">✓ recorded</span>' : '') + ' <span class="muted">(' + done + ' done)</span>';
      $('p-prev').disabled = k === 0 || !!pState.rec; $('p-next').disabled = k === secs.length - 1 || !!pState.rec;
      $('p-finish').classList.toggle('hidden', !done || !!pState.rec);
    }
  }
  function paintPrompterButtons() {
    const k = pState.idx; const have = pState.sections ? pState.takes[k] : pState.blob;
    const recOn = !!pState.rec;
    $('p-rec').classList.toggle('hidden', !!have && !recOn);
    $('p-pause').classList.toggle('hidden', !recOn);
    $('p-retake').classList.toggle('hidden', !have || recOn);
    $('p-use').classList.toggle('hidden', !have || recOn);
    const a = $('p-audio'); a.classList.toggle('hidden', !have || recOn); setMedia(a, have && !recOn ? have : null);
    if (pState.sections) {
      const last = pState.idx === pState.sections.length - 1; const all = pState.takes.every(Boolean);
      $('p-use').textContent = all ? 'Use all ' + pState.sections.length + ' parts' : last ? 'Finish' : 'Next part ›';
    } else $('p-use').textContent = 'Use this take';
    $('p-time').textContent = fmt(pState.sections ? pState.durs[k] || 0 : pState.dur || 0);
  }
  function openPrompter() {
    if (!P.pkg) return;
    pState = { blob: null, idx: 0 };
    if (pSectioned()) { pState.sections = P.pkg.sections; pState.takes = new Array(P.pkg.sections.length).fill(null); pState.durs = []; }
    $('p-speed').value = wpm();
    $('p-max').textContent = ' / ' + fmt(pState.sections ? maxVoice() : Math.min(maxVoice(), isShortLen() ? 60 : maxVoice()));
    $('p-time').textContent = '0:00'; $('p-dot').classList.remove('on');
    $('p-rec').classList.remove('on');
    paintPrompterText(); paintPrompterButtons();
    $('p-hint').textContent = pState.sections ? 'Long video: record one part at a time. You can pause, retake any part, and come back later — finished parts are kept while this screen is open.'
      : 'Tap record, wait for 3-2-1, then read at a relaxed pace. Tap the text to pause scrolling.';
    $('prompter').classList.remove('hidden');
    history.pushState(null, '', '#prompter');
  }
  function closePrompter(fromPop) {
    if (!pState) return;
    if (pState.rec) { pState.rec.stop(); }
    cancelAnimationFrame(pState.raf); clearInterval(pState.timer); clearTimeout(pState.countT);
    N.keepAwake(false);
    $('p-count').classList.add('hidden');
    $('prompter').classList.add('hidden');
    setMedia($('p-audio'), null);
    pState = null;
    if (!fromPop && location.hash === '#prompter') history.back();
  }
  window.addEventListener('popstate', () => { if (pState) closePrompter(true); });
  $('p-close').addEventListener('click', () => { if (pState && pState.takes && pState.takes.some(Boolean) && !confirm('Close the teleprompter? Recorded parts that you haven’t used will be discarded.')) return; closePrompter(); });
  $('p-speed').addEventListener('input', (e) => save(K.wpm, Number(e.target.value)));
  $('p-scroll').addEventListener('click', () => { if (pState && pState.rec && !pState.recPaused) { pState.paused = !pState.paused; toast(pState.paused ? 'Scrolling paused' : 'Scrolling'); } });
  const goSection = (d) => { if (!pState || !pState.sections || pState.rec) return; pState.idx = Math.max(0, Math.min(pState.sections.length - 1, pState.idx + d)); paintPrompterText(); paintPrompterButtons(); };
  $('p-prev').addEventListener('click', () => goSection(-1));
  $('p-next').addEventListener('click', () => goSection(1));
  $('p-pause').addEventListener('click', () => {
    if (!pState || !pState.rec) return; const rec = pState.rec.rec;
    if (!pState.recPaused) { try { rec.pause(); } catch (_) { /* ignore */ } pState.recPaused = true; pState.pausedAt = performance.now(); pState.paused = true; $('p-pause').textContent = '● Resume'; $('p-dot').classList.remove('on'); $('p-hint').textContent = 'Paused. Tap Resume to keep going (the recording continues in the same take).'; }
    else { try { rec.resume(); } catch (_) { /* ignore */ } pState.recPaused = false; pState.pausedMs += performance.now() - pState.pausedAt; pState.paused = false; pState.last = performance.now(); $('p-pause').textContent = '❚❚ Pause'; $('p-dot').classList.add('on'); $('p-hint').textContent = 'Recording… tap ■ when you finish this ' + (pState.sections ? 'part' : 'take') + '.'; }
  });
  $('p-rec').addEventListener('click', async () => {
    if (!pState) return;
    if (pState.rec) { stopTake(); return; }
    let stream;
    try { stream = await getMic(true); } catch (err) { toast(err.friendly || String(err), true); return; }
    // 3-2-1 countdown
    const cnt = $('p-count'); cnt.classList.remove('hidden');
    $('p-rec').disabled = true;
    for (const n of [3, 2, 1]) { cnt.textContent = n; await new Promise((r) => { pState.countT = setTimeout(r, 750); }); if (!pState) { stream.getTracks().forEach((t) => t.stop()); return; } }
    cnt.classList.add('hidden'); $('p-rec').disabled = false;
    pState.rec = recorder(stream); pState.rec.start(); N.keepAwake(true);
    pState.t0 = performance.now(); pState.pausedMs = 0; pState.recPaused = false; pState.paused = false; pState.scrollPos = 0; pState.last = performance.now();
    $('p-rec').classList.add('on'); $('p-rec').setAttribute('aria-label', 'Stop recording'); $('p-dot').classList.add('on'); $('p-pause').textContent = '❚❚ Pause';
    $('p-hint').textContent = 'Recording… tap ■ when you finish this ' + (pState.sections ? 'part' : 'take') + '.';
    paintPrompterButtons(); paintPrompterText();
    const sc = $('p-scroll'); sc.scrollTop = 0;
    const words = S.wordCount(pText());
    const cap = pState.sections ? maxVoice() : isShortLen() ? 60 : maxVoice();
    const already = pState.sections ? pState.durs.reduce((x, d, j) => x + (j === pState.idx ? 0 : d || 0), 0) : 0;
    const step = (now) => {
      if (!pState || !pState.rec) return;
      const dt = (now - pState.last) / 1000; pState.last = now;
      const est = words / (Number($('p-speed').value) / 60);
      const dist = sc.scrollHeight - sc.clientHeight - sc.clientHeight * 0.3;
      if (!pState.paused) pState.scrollPos = Math.min(sc.scrollHeight, pState.scrollPos + (dist / est) * dt);
      sc.scrollTop = pState.scrollPos;
      pState.raf = requestAnimationFrame(step);
    };
    pState.raf = requestAnimationFrame(step);
    pState.timer = setInterval(() => {
      const sec = (performance.now() - pState.t0 - pState.pausedMs - (pState.recPaused ? performance.now() - pState.pausedAt : 0)) / 1000;
      $('p-time').textContent = fmt(sec) + (pState.sections ? ' · total ' + fmt(already + sec) : '');
      if (already + sec >= cap) { stopTake(); toast(cap === 60 ? '60 seconds — perfect Short length.' : 'Reached the 20-minute limit.'); }
    }, 250);
  });
  async function stopTake() {
    const r = pState.rec; pState.rec = null;
    cancelAnimationFrame(pState.raf); clearInterval(pState.timer); N.keepAwake(false);
    const sec = (performance.now() - pState.t0 - pState.pausedMs - (pState.recPaused ? performance.now() - pState.pausedAt : 0)) / 1000; pState.recPaused = false;
    $('p-rec').classList.remove('on'); $('p-rec').setAttribute('aria-label', 'Start recording'); $('p-dot').classList.remove('on');
    const blob = await r.stop();
    if (!pState) return;
    if (pState.sections) { pState.takes[pState.idx] = blob; pState.durs[pState.idx] = sec; } else { pState.blob = blob; pState.dur = sec; }
    paintPrompterText(); paintPrompterButtons();
    $('p-hint').textContent = pState.sections ? 'Listen back. Retake this part, or go to the next one.' : 'Listen back. Happy? Tap “Use this take”.';
  }
  $('p-retake').addEventListener('click', () => {
    if (!pState) return;
    if (pState.sections) { pState.takes[pState.idx] = null; pState.durs[pState.idx] = 0; } else pState.blob = null;
    paintPrompterText(); paintPrompterButtons();
    $('p-scroll').scrollTop = 0; $('p-time').textContent = '0:00';
    $('p-hint').textContent = 'Tap record when ready.';
  });
  $('p-use').addEventListener('click', async () => {
    if (!pState) return;
    if (pState.sections) {
      const all = pState.takes.every(Boolean); const last = pState.idx === pState.sections.length - 1;
      if (!all && !last) { const nx = pState.takes.findIndex((t, j) => !t && j > pState.idx); pState.idx = nx >= 0 ? nx : pState.idx + 1; paintPrompterText(); paintPrompterButtons(); $('p-hint').textContent = 'Next part. Tap record when ready.'; return; }
      await finishSections(); return;
    }
    const blob = pState && pState.blob; closePrompter();
    if (blob) { await setVoice(blob, 'mic'); }
  });
  $('p-finish').addEventListener('click', () => { if (pState && pState.sections && !pState.rec) finishSections(); });
  async function finishSections() {
    {
      const missing = pState.takes.map((t, j) => (t ? 0 : j + 1)).filter(Boolean);
      if (missing.length && !confirm('Part' + (missing.length > 1 ? 's ' : ' ') + missing.join(', ') + ' not recorded yet. Use only the recorded parts?')) { pState.idx = missing[0] - 1; paintPrompterText(); paintPrompterButtons(); return; }
      const takes = pState.takes.map((b, k) => (b ? { blob: b, section: k } : null)).filter(Boolean);
      closePrompter();
      setStatus('voice-status', 'Reading ' + takes.length + ' parts…', 'live');
      for (const t of takes) { try { t.duration = (await R.decodeBlob(t.blob)).duration; } catch (_) { t.duration = await mediaDuration(t.blob); } }
      await setVoice(null, 'mic', 0, { parts: takes });
    }
  }

  // ---------- step 4: render ----------
  let pv = null; let rendering = false; let renderAbort = null;
  function stopPreview() { if (pv) { pv.stop(); $('preview-play').classList.remove('playing'); $('preview-play').textContent = '▶'; } }
  async function getVoiceBuffer() {
    if (voiceBuffer) return voiceBuffer;
    const v = P.voice;
    if (!v) return R.silentBuffer(Math.min(maxVoice(), Math.max(8, S.wordCount(P.pkg.script) / (wpm() / 60))));
    if (voiceIsLong()) { // preview only the first part/section of a long voice (never decode 20 minutes at once)
      const first = v.parts ? v.parts[0] : null;
      const blob = first ? (first.pcm ? wavFromPcm([first.pcm], first.rate, first.channels || 1) : first.blob) : null;
      voiceBuffer = blob ? R.trimBuffer(await R.decodeBlob(blob), 150) : R.silentBuffer(Math.min(90, v.duration || 30));
      voiceBuffer.previewOnly = true; return voiceBuffer;
    }
    if (v.source === 'silent' || !v.blob) voiceBuffer = R.silentBuffer(Math.min(maxVoice(), v.duration || 30));
    else voiceBuffer = R.trimBuffer(await R.decodeBlob(v.blob), maxVoice());
    return voiceBuffer;
  }
  function look(forRender) {
    const lk = Object.assign({}, P.look, { aspect: aspectOf(), handle: handle() });
    const pkg = P.pkg || {}; const F = S.FORMATS[P.template] || null;
    lk.textHook = lk.hook !== false ? (pkg.textHook || '') : '';
    lk.ctaSticker = lk.cta !== false ? (pkg.cta || (lk.intensity && lk.intensity !== 'off' ? CTAS[0] : '')) : '';
    lk.template = P.template || 'classic'; lk.humour = P.humour == null ? 2 : P.humour;
    lk.stepLabel = F ? F.badge : 'STEP';
    if (forRender) lk.safeZones = false; // guides are for the preview only
    else lk.safeZones = lk.safeZones ? (P.platform || 'both') : false;
    return lk;
  }
  function sizePreview() {
    const a = aspectOf(); const [w, h] = R.frameSize(a, 0.5); const cv = $('preview');
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const wrap = document.querySelector('.preview-wrap'); ['16x9', '1x1', '4x5'].forEach((k) => wrap.classList.toggle('ar-' + k, a.replace(':', 'x') === k));
    document.querySelector('.render-layout').classList.toggle('wide', a === '16:9');
  }
  // Only the first section's beats when previewing part of a long voice.
  function previewBeats(buf) {
    if (!buf.previewOnly || !P.pkg.sections) return P.pkg.beats;
    const first = P.pkg.beats.filter((b) => (b.section || 0) === 0); return first.length ? first : P.pkg.beats;
  }
  async function buildPreview() {
    stopPreview();
    if (!P.pkg) return;
    try {
      const buf = await getVoiceBuffer();
      sizePreview();
      pv = R.preview({ canvas: $('preview'), buffer: buf, beats: previewBeats(buf), look: look(), maxSeconds: isShortLen() ? undefined : R.MAX_LONG, onTime: (t, d) => { $('preview-time').textContent = fmt(t) + ' / ' + fmt(d) + (buf.previewOnly ? ' (part 1 preview)' : ''); } });
      try { await document.fonts.load('800 100px Montserrat'); } catch (_) { /* ignore */ }
      try { await pv.ready; } catch (_) { /* ignore */ }
      const first = R.buildTimeline(previewBeats(buf), 0.3, 0.3 + buf.duration);
      const stepBeat = first.find((b) => b.step === 1);
      pv.drawAt(stepBeat ? stepBeat.start + 0.9 : 1.2);
      $('preview-time').textContent = buf.previewOnly ? 'Preview of part 1 · full video ' + fmt(P.voice.duration + R.LEAD + R.TAIL) : fmt(pv.duration);
    } catch (err) { setStatus('render-status', 'Preview failed: ' + (err && err.message || err), 'err'); }
  }
  function renderRenderPane() {
    if (!P || !P.pkg) return;
    const grades = $('grades'); grades.innerHTML = '';
    Object.entries(R.PRESETS).forEach(([id, p]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'grade' + (P.look.preset === id ? ' on' : '');
      b.innerHTML = '<i></i>' + esc(p.name);
      b.querySelector('i').style.background = 'radial-gradient(circle at 30% 30%, ' + p.blobs[2] + ', transparent 60%), radial-gradient(circle at 70% 70%, ' + p.blobs[0] + ', transparent 65%), ' + p.bg;
      b.addEventListener('click', () => { P.look.preset = id; markVideoStale(); persist(); renderRenderPane(); });
      grades.appendChild(b);
    });
    document.querySelectorAll('#cap-style button').forEach((b) => b.classList.toggle('on', b.dataset.v === P.look.captionStyle));
    document.querySelectorAll('#cap-case button').forEach((b) => b.classList.toggle('on', b.dataset.v === P.look.captionCase));
    { const ts = document.getElementById('text-style'); if (ts) ts.value = P.look.textStyle || 'none'; }
    paintVisualSegs(); $('opt-ai-images').checked = !!P.look.aiImages;
    const a = aspectOf(); document.querySelectorAll('#aspect-seg button').forEach((b) => b.classList.toggle('on', b.dataset.v === a));
    const dur = P.voice ? P.voice.duration : 0;
    $('aspect-note').textContent = a === '9:16' ? (dur > 178 ? 'over 3 min → regular video' : 'Shorts / Reels / TikTok') : a === '16:9' ? 'classic YouTube' : a === '1:1' ? 'square feed' : 'portrait feed';
    $('opt-quality').value = P.look.quality || 'auto';
    const long = voiceIsLong() || (!isShortLen() && dur > LONG_RENDER_SEC);
    $('render-note').textContent = long ? 'Long video: rendered in real time in ~75 s parts that are saved to storage as they finish, then joined into one WebM file. Keep the app open with the screen on (it stays awake). If it stops, tap Render again to resume from the last finished part.'
      : 'Rendering happens in real time on your phone. Keep the app open and the screen on.';
    $('opt-watermark').checked = !!P.look.watermark; $('opt-progress').checked = !!P.look.progress; $('opt-format').value = P.look.format || 'auto';
    const an = P.look.anim === '3d' ? '3d' : '2d'; document.querySelectorAll('#anim-seg button').forEach((b) => b.classList.toggle('on', b.dataset.v === an));
    const mo = P.look.motion === 'classic' ? 'classic' : 'smooth'; document.querySelectorAll('#motion-seg button').forEach((b) => b.classList.toggle('on', b.dataset.v === mo));
    $('motion-row').classList.toggle('hidden', an === '3d');
    $('anim-note').textContent = an === '3d' ? (VTS.three3d && !VTS.three3d.webglOk() ? 'no WebGL here: falls back to 2D' : 'free in-app 3D (Three.js) · heavier on old phones') : 'hand-drawn cartoon';
    $('motion-note').textContent = mo === 'classic' ? 'the v1.4 animation' : 'lip-sync, squash & stretch, camera moves, meme punch-ins';
    const it = P.look.intensity || 'off'; document.querySelectorAll('#intensity-seg button').forEach((b) => b.classList.toggle('on', b.dataset.v === it));
    $('intensity-note').textContent = { off: 'no extra cuts', chill: 'a cut every ~4 s', punchy: 'a cut every ~2.5 s', chaotic: 'a cut every ~1.7 s' }[it];
    $('opt-hook').checked = P.look.hook !== false; $('hook-preview').textContent = P.pkg.textHook ? '“' + P.pkg.textHook + '”' : '(add one in step 2)';
    $('opt-cta').checked = P.look.cta !== false; $('opt-emoji').checked = P.look.autoEmoji !== false; $('opt-loop').checked = !!P.look.loop; $('opt-safe').checked = !!P.look.safeZones;
    $('opt-sfx').checked = P.look.sfx !== false;
    const ms = $('opt-music'); if (!ms.options.length && VTS.audiofx) VTS.audiofx.MUSIC.forEach(([k, label]) => ms.add(new Option(label, k)));
    ms.value = P.look.music || 'none';
    [['vol-voice', 'voiceVol', 1], ['vol-music', 'musicVol', 0.5], ['vol-sfx', 'sfxVol', 0.7]].forEach(([id, key, d]) => { const v = P.look[key] == null ? d : P.look[key]; $(id).value = v; $(id + '-v').textContent = Math.round(v * 100) + '%'; });
    $('wm-handle').textContent = handle() ? handle() : '(set your handle in Settings)';
    $('render').disabled = rendering;
    const [fw, fh] = R.frameSize(a, renderScale());
    const resumable = P.renderState && P.renderState.done && P.renderState.done.length && !P.renderState.final;
    $('render').querySelector('span').textContent = P.voice ? (resumable ? '▶ Resume render (' + P.renderState.done.length + ' / ' + P.renderState.bounds.length + ' parts done)' : P.video ? '🎬 Render again' : '🎬 Render ' + fw + '×' + fh + ' ' + a + ' video') : '🎙 Add a voice first';
    paintResult();
    if (currentView === 'create' && P.step === 'render' && !rendering) buildPreview();
  }
  function renderScale() {
    const q = (P && P.look.quality) || 'auto'; const dur = P && P.voice ? P.voice.duration : 0;
    if (q === '720' || (q === 'auto' && (voiceIsLong() || dur > 180))) return 720 / Math.min(...R.ASPECTS[aspectOf()]);
    return 1;
  }
  document.querySelectorAll('#aspect-seg button').forEach((b) => b.addEventListener('click', () => {
    if (!P || rendering) return; P.look.aspect = b.dataset.v; P.renderState = null; markVideoStale(); persist(); renderRenderPane(); paintLengthNote();
  }));
  $('opt-quality').addEventListener('change', (e) => { P.look.quality = e.target.value; P.renderState = null; persist(); renderRenderPane(); });
  document.querySelectorAll('#cap-style button').forEach((b) => b.addEventListener('click', () => { P.look.captionStyle = b.dataset.v; markVideoStale(); persist(); renderRenderPane(); }));
  document.querySelectorAll('#cap-case button').forEach((b) => b.addEventListener('click', () => { P.look.captionCase = b.dataset.v; markVideoStale(); persist(); renderRenderPane(); }));
  { const ts = document.getElementById('text-style'); if (ts) ts.addEventListener('change', () => { P.look.textStyle = ts.value; markVideoStale(); persist(); renderRenderPane(); }); }
  $('opt-watermark').addEventListener('change', (e) => { P.look.watermark = e.target.checked; if (e.target.checked && !handle()) toast('Set your channel handle in Settings.', true); markVideoStale(); persist(); renderRenderPane(); });
  $('opt-progress').addEventListener('change', (e) => { P.look.progress = e.target.checked; markVideoStale(); persist(); renderRenderPane(); });
  $('opt-format').addEventListener('change', (e) => { P.look.format = e.target.value; persist(); });
  document.querySelectorAll('#anim-seg-idea button').forEach((b) => b.addEventListener('click', () => { if (!P.look) return; P.look.anim = b.dataset.v; save('vts.anim', P.look.anim); markVideoStale(); persist(); renderIdea(); renderRenderPane(); }));
  document.querySelectorAll('#anim-seg button').forEach((b) => b.addEventListener('click', () => { P.look.anim = b.dataset.v; save('vts.anim', P.look.anim); markVideoStale(); persist(); renderRenderPane(); renderIdea(); }));
  document.querySelectorAll('#motion-seg button').forEach((b) => b.addEventListener('click', () => { P.look.motion = b.dataset.v; save('vts.motion', P.look.motion); markVideoStale(); persist(); renderRenderPane(); }));
  document.querySelectorAll('#intensity-seg button').forEach((b) => b.addEventListener('click', () => { P.look.intensity = b.dataset.v; markVideoStale(); persist(); renderRenderPane(); }));
  [['opt-hook', 'hook'], ['opt-cta', 'cta'], ['opt-emoji', 'autoEmoji'], ['opt-loop', 'loop'], ['opt-sfx', 'sfx']].forEach(([id, key]) => $(id).addEventListener('change', (e) => { P.look[key] = e.target.checked; markVideoStale(); persist(); renderRenderPane(); }));
  $('opt-safe').addEventListener('change', (e) => { P.look.safeZones = e.target.checked; persist(); renderRenderPane(); });
  $('opt-music').addEventListener('change', (e) => { P.look.music = e.target.value; markVideoStale(); persist(); renderRenderPane(); });
  [['vol-voice', 'voiceVol'], ['vol-music', 'musicVol'], ['vol-sfx', 'sfxVol']].forEach(([id, key]) => {
    $(id).addEventListener('input', (e) => { P.look[key] = Number(e.target.value); $(id + '-v').textContent = Math.round(P.look[key] * 100) + '%'; });
    $(id).addEventListener('change', () => { markVideoStale(); persist(); renderRenderPane(); });
  });
  let musicAudio = null;
  $('music-play').addEventListener('click', async () => {
    if (musicAudio) { musicAudio.stop(); musicAudio = null; $('music-play').textContent = '▶ Listen'; return; }
    const style = P.look.music || 'none'; if (style === 'none' || !VTS.audiofx) { toast('Pick a music style first.'); return; }
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)(); const m = VTS.audiofx.music(style, ac.sampleRate);
      const ab = ac.createBuffer(2, m.L.length, ac.sampleRate); ab.getChannelData(0).set(m.L); ab.getChannelData(1).set(m.R);
      const src = ac.createBufferSource(); src.buffer = ab; src.loop = true; const g = ac.createGain(); g.gain.value = (P.look.musicVol == null ? 0.5 : P.look.musicVol) * 0.6; src.connect(g).connect(ac.destination); src.start();
      musicAudio = { stop: () => { try { src.stop(); ac.close(); } catch (_) { /* ignore */ } } }; $('music-play').textContent = '■ Stop';
      setTimeout(() => { if (musicAudio) { musicAudio.stop(); musicAudio = null; $('music-play').textContent = '▶ Listen'; } }, 12000);
    } catch (err) { toast('Could not play music: ' + (err && err.message || err), true); }
  });
  $('cover-png').addEventListener('click', async () => {
    if (!P.pkg || !VTS.comedy || !VTS.comedy.cover) return;
    try {
      const blob = await VTS.comedy.cover(document.createElement('canvas'), { beats: P.pkg.beats, look: look(true), text: P.pkg.thumbnailText || P.pkg.textHook || P.pkg.title, handle: handle() });
      const name = (P.pkg.title || 'short').replace(/[^a-z0-9]+/gi, '-').slice(0, 40).replace(/^-|-$/g, '') + '-cover.png';
      const r = await N.saveFile(blob, name); toast('Cover saved to ' + r.where);
    } catch (err) { toast('Could not make the cover: ' + (err && err.message || err), true); }
  });
  $('opt-ai-images').addEventListener('change', (e) => {
    P.look.aiImages = e.target.checked; markVideoStale(); persist();
    if (e.target.checked) toast(getKey() ? 'AI illustrations: uses Gemini image quota (no free tier). If your key can’t make images, the built-in scenes are used.' : 'Add your Gemini API key in Settings to use AI illustrations.', !getKey());
  });

  // ---------- AI illustrations (optional; falls back silently to built-in scenes) ----------
  let aiImagesOff = ''; // set for this session once image generation is known to be unavailable/quota'd
  const MAX_AI_IMAGES = 8;
  function aiPrompt(b) {
    const pal = (R.PRESETS[P.look.preset] || {}).name || 'teal';
    return ['Flat 2D vector illustration for a faceless psychology / self-help YouTube Short. Vertical 9:16, full-bleed background, no borders.',
      'Style: clean modern flat cartoon like popular animated psychology channels; one simple rounded character with a minimal friendly face, bold clean outlines, soft shading, limited colour palette matching a "' + pal + '" colour grade, cosy and polished.',
      'Absolutely no text, letters, numbers, logos or watermarks. Keep the upper third of the image calm and uncluttered (captions go there); put the character in the lower two thirds.',
      'Scene: ' + SC.describe(b.scene) + '.', 'This moment of the voiceover: "' + b.text + '".'].join('\n');
  }
  async function prepareAiImages(signal) {
    const beats = P.pkg.beats;
    beats.forEach((b) => { if (!b.scene) S.attachScenes(beats); });
    const want = []; let prevKey = '';
    beats.forEach((b, i) => { const k = SC.sceneKey(b.scene); if (k !== prevKey) want.push(i); prevKey = k; });
    const targets = want.slice(0, MAX_AI_IMAGES);
    let made = 0; let reused = 0; let lastBlob = null;
    for (let n = 0; n < want.length; n++) {
      const i = want[n]; const end = n + 1 < want.length ? want[n + 1] : beats.length;
      const b = beats[i]; const prompt = aiPrompt(b);
      let blob = b.aiImage && b.aiPrompt === prompt ? b.aiImage : null;
      if (blob) reused++;
      else if (targets.includes(i) && !aiImagesOff) {
        if (signal && signal.aborted) return null;
        $('render-label').textContent = 'Drawing AI illustration ' + (n + 1) + ' of ' + targets.length + '…';
        try { blob = await G.generateImage(prompt, { aspectRatio: '9:16' }); made++; }
        catch (err) { aiImagesOff = (err && err.details) || (err && err.message) || 'unavailable'; console.warn('AI illustrations unavailable', aiImagesOff); }
      }
      if (!blob && lastBlob && !targets.includes(i) && !aiImagesOff) blob = lastBlob; // beyond the cap: reuse the previous illustration
      for (let j = i; j < end; j++) { beats[j].aiImage = blob || null; beats[j].aiPrompt = blob ? prompt : ''; }
      if (blob) lastBlob = blob;
    }
    persist();
    return { made, reused, failed: aiImagesOff };
  }
  $('preview-play').addEventListener('click', async () => {
    if (!pv) await buildPreview();
    if (!pv) return;
    if (pv.playing) { stopPreview(); return; }
    $('preview-play').classList.add('playing'); $('preview-play').textContent = '❚❚';
    pv.play(() => { $('preview-play').classList.remove('playing'); $('preview-play').textContent = '▶'; });
  });
  $('render').addEventListener('click', () => startRender());
  $('render-cancel').addEventListener('click', () => { if (renderAbort) renderAbort.abort(); });
  // Build the long voice as a disk-backed track (per-part decode; never the whole file at once when it has parts).
  async function buildTrack(onStep) {
    const v = P.voice; const track = new SG.AudioTrack(24000); const spans = [];
    const cap = MAX_LONG_VOICE;
    if (v.source === 'silent' || (!v.blob && !v.parts)) {
      let left = Math.min(cap, v.duration || 60); while (left > 0.01) { const d = Math.min(60, left); await track.appendBuffer(R.silentBuffer(d)); left -= d; }
    } else if (v.parts) {
      for (let k = 0; k < v.parts.length && track.duration < cap; k++) {
        const x = v.parts[k]; if (onStep) onStep(k, v.parts.length);
        const blob = x.pcm ? wavFromPcm([x.pcm], x.rate, x.channels || 1) : x.blob;
        if (k > 0 && x.section !== v.parts[k - 1].section) await track.appendBuffer(R.silentBuffer(0.45)); // breath between sections
        const sp = await track.appendBlob(blob); spans.push({ section: x.section || 0, start: sp.start, end: sp.end });
      }
    } else {
      await track.appendBlob(v.blob);
    }
    // section spans (video time) for chapter badges + per-section caption timing
    let sections;
    const nSec = P.pkg.sections ? P.pkg.sections.length : 0;
    if (nSec > 1 && spans.length) {
      sections = [];
      for (let k = 0; k < nSec; k++) { const my = spans.filter((sp) => sp.section === k); sections.push(my.length ? { start: R.LEAD + my[0].start, end: R.LEAD + my[my.length - 1].end } : { start: 0, end: 0 }); }
    } else if (nSec > 1) { // one long file: split by word share
      const words = P.pkg.sections.map((x) => Math.max(1, S.wordCount(x.text))); const tot = words.reduce((a2, w) => a2 + w, 0);
      const bd = await track.bounds(); let t = bd.start; sections = words.map((w) => { const d = (bd.end - bd.start) * w / tot; const sp = { start: R.LEAD + t, end: R.LEAD + t + d }; t += d; return sp; });
    }
    return { track, sections };
  }
  async function startRender() {
    if (rendering || !P.pkg) return;
    if (!P.voice) { showStep('voice'); toast('Record your voice (or pick an option) first.', true); return; }
    if (!R.canRender()) { setStatus('render-status', 'This browser cannot record video (needs MediaRecorder + canvas capture). Use the Android app or Chrome.', 'err'); return; }
    stopPreview();
    rendering = true; renderAbort = new AbortController();
    $('render').disabled = true; $('render-progress').classList.remove('hidden'); setStatus('render-status', '');
    const aspect = aspectOf(); const scale = renderScale(); const [cw, ch] = R.frameSize(aspect, scale);
    const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch; canvas.id = 'render-canvas';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    sizePreview(); $('preview-wrap-host').appendChild(canvas);
    let wake = null;
    N.keepAwake(true);
    const reWake = async () => { try { if (navigator.wakeLock && document.visibilityState === 'visible') wake = await navigator.wakeLock.request('screen'); } catch (_) { /* ignore */ } };
    await reWake(); document.addEventListener('visibilitychange', reWake);
    const t0 = Date.now();
    const long = voiceIsLong() || (!isShortLen() && P.voice.duration > LONG_RENDER_SEC);
    try {
      const lk = look(true); let aiNote = '';
      if (lk.visual !== 'classic') { ensureScenes(); if (long && SC.diversify && !P.pkg.diversified) { SC.diversify(P.pkg.beats.map((b2) => b2.scene)); P.pkg.diversified = true; } }
      if (lk.visual !== 'classic' && lk.aiImages) {
        if (!getKey()) aiNote = ' AI illustrations need a Gemini key, so the built-in scenes were used.';
        else {
          const r0 = await prepareAiImages(renderAbort.signal);
          if (r0 === null) { setStatus('render-status', 'Render cancelled.'); return; }
          const have = P.pkg.beats.some((b2) => b2.aiImage);
          if (!have) { lk.aiImages = false; aiNote = ' AI illustrations weren’t available for this key (image models need billing), so the built-in animated scenes were used.'; }
        }
      } else lk.aiImages = false;
      const bar = (p) => { $('render-bar').style.width = (p * 100).toFixed(1) + '%'; };
      if (long) {
        $('render-label').textContent = 'Preparing the voice track…';
        const { track, sections } = await buildTrack((k, n) => { $('render-label').textContent = 'Preparing the voice track… part ' + (k + 1) + ' / ' + n; });
        const res = await SG.renderLong({ canvas, track, beats: P.pkg.beats, sections, look: lk, signal: renderAbort.signal, projectId: P.id, maxSeconds: R.MAX_LONG,
          resume: P.renderState || null,
          onState: (st) => { P.renderState = JSON.parse(JSON.stringify(st)); persist(true); },
          onInterrupted: () => { toast('The app went to the background — the current part will restart when you come back.', true); },
          onProgress: (q) => {
            bar(q.p);
            $('render-label').textContent = q.phase === 'join' ? 'Joining ' + q.segments + ' parts into one file… ' + Math.round(q.p * 100) + '%'
              : 'Part ' + q.segment + ' / ' + q.segments + ' · ' + Math.round(q.p * 100) + '% · about ' + fmt(q.eta) + ' left';
          } });
        if (!res) { setStatus('render-status', 'Render paused. Finished parts are saved — tap “Resume render” to continue.'); return; }
        const th = thumbFrame(lk, res.duration, sections);
        const old = P.video;
        if (old && old.stored && old.stored.name && old.stored.name !== res.name) storeFor(old).then((st) => st.remove(old.stored.name)).catch(() => {});
        if (res.name) {
          const rd = await res.store.reader(res.name);
          const inMem = res.store.kind === 'memory';
          P.video = { blob: inMem ? rd.file : null, stored: inMem ? null : { store: res.store.kind, name: res.name }, mime: res.mime, type: 'video/webm', duration: res.duration, size: rd.size, width: res.width, height: res.height, aspect,
            createdAt: new Date().toISOString(), renderMs: Date.now() - t0, segments: res.segments.length, visual: lk.visual === 'classic' ? 'classic' : 'scenes' };
          storedFile = inMem ? null : rd.file || null;
          setStatus('render-status', 'Done! ' + fmt(res.duration) + ' video rendered in ' + res.segments.length + ' parts and joined into one file.' + aiNote, 'ok');
        } else {
          P.video = { blob: null, parts: res.parts.map((n2, k) => ({ name: n2, k })), stored: { store: res.store.kind }, mime: res.mime, type: /mp4/.test(res.mime) ? 'video/mp4' : 'video/webm', duration: res.duration, size: 0, width: res.width, height: res.height, aspect, createdAt: new Date().toISOString(), renderMs: Date.now() - t0, joinError: res.joinError || 'this device records MP4, which can’t be joined on-device' };
          setStatus('render-status', 'Rendered ' + res.parts.length + ' parts, but they couldn’t be joined into one file (' + P.video.joinError + '). Save the numbered parts below and join them in any video editor (YouTube Studio’s editor or CapCut work).', 'warn');
        }
        P.renderState = null; P.thumb = th;
      } else {
        const buf = await getVoiceBuffer();
        const res = await R.renderVideo({
          canvas, buffer: buf, beats: P.pkg.beats, look: lk, format: P.look.format, signal: renderAbort.signal, maxSeconds: isShortLen() ? undefined : R.MAX_LONG,
          onProgress: (p, t, total) => { bar(p); $('render-label').textContent = 'Rendering… ' + Math.round(p * 100) + '% (' + fmt(t) + ' / ' + fmt(total) + ')'; },
        });
        if (!res) { setStatus('render-status', 'Render cancelled.'); return; }
        if (!res.blob.size) throw new Error('The recorder produced an empty file.');
        const P2 = R.plan(buf, isShortLen() ? undefined : R.MAX_LONG);
        P.thumb = thumbFrame(lk, P2.total, null, P2);
        P.video = { blob: res.blob, mime: res.mime, type: res.type, duration: res.duration, size: res.blob.size, width: res.width, height: res.height, aspect, createdAt: new Date().toISOString(), renderMs: Date.now() - t0, frames: res.frames, fps: res.fps, avgDrawMs: res.avgDrawMs, illustrated: res.illustrated || 0, visual: res.scenes ? 'scenes' : 'classic', audioMix: res.audioMix || null, cues: res.cues || 0, cuts: res.cuts || 0 };
        setStatus('render-status', 'Done! Share it straight to YouTube or save it to your phone.' + aiNote, 'ok');
      }
      persist(true);
      paintResult(); paintStepper();
      setTimeout(() => $('result-card').scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setStatus('render-status', 'Render failed: ' + (err && err.message || err) + (long && P.renderState && P.renderState.done && P.renderState.done.length ? ' Finished parts are saved — tap Render to resume.' : ''), 'err');
    } finally {
      rendering = false; renderAbort = null; canvas.remove();
      document.removeEventListener('visibilitychange', reWake);
      try { if (wake) wake.release(); } catch (_) { /* ignore */ }
      N.keepAwake(false);
      $('render').disabled = false; $('render-progress').classList.add('hidden'); $('render-bar').style.width = '0';
      renderRenderPane();
    }
  }
  // Library thumbnail (first step beat), in the video's shape.
  function thumbFrame(lk, total, sections, P2) {
    const [tw, th] = R.frameSize(lk.aspect, 0.25);
    const c = document.createElement('canvas'); c.width = tw; c.height = th;
    const rr = new R.Renderer(c);
    const ss = P2 ? P2.speechStart : R.LEAD; const se = P2 ? P2.speechEnd : total - R.TAIL;
    rr.setup(Object.assign({}, lk, { aiImages: false, beats: P.pkg.beats, speechStart: ss, speechEnd: se, duration: total, sections }));
    const tl = R.buildTimeline(P.pkg.beats, ss, se, sections); const sb = tl.find((b2) => b2.step === 1);
    try { rr.draw(sb ? sb.start + 0.9 : 1.2); } catch (_) { /* ignore */ }
    return c.toDataURL('image/jpeg', 0.8);
  }
  // Long renders live in app storage (OPFS / app files), not in IndexedDB.
  let storedFile = null; const stores = {};
  async function storeFor(v) { const kind = v.stored && v.stored.store; if (!stores[kind]) stores[kind] = await SG.openStore(kind); return stores[kind]; }
  async function videoFile(v) {
    if (v.blob) return v.blob;
    if (storedFile && storedFile.__name === v.stored.name) return storedFile;
    try { const st = await storeFor(v); const rd = await st.reader(v.stored.name); storedFile = rd.file || null; if (storedFile) storedFile.__name = v.stored.name; return storedFile; } catch (_) { return null; }
  }
  async function paintResult() {
    const v = P && P.video;
    $('result-card').classList.toggle('hidden', !v);
    $('result-parts').classList.add('hidden');
    if (!v) { setMedia($('result-video'), null); return; }
    const ext = /mp4/.test(v.type) ? 'MP4' : 'WebM';
    $('result-badge').textContent = ext + ' · ' + fmt(v.duration);
    $('result-info').textContent = v.width + '×' + v.height + (v.aspect ? ' (' + v.aspect + ')' : '') + (v.size ? ' · ' + fmtSize(v.size) : '') + ' · ' + (v.mime || v.type) + (v.segments ? ' · ' + v.segments + ' parts joined' : '') + (v.stale ? ' · You changed things since this render — tap “Render again”.' : '');
    if (v.parts) {
      setMedia($('result-video'), null);
      $('result-parts').classList.remove('hidden'); $('parts-note').textContent = 'Your video is in ' + v.parts.length + ' numbered parts (couldn’t join on this device: ' + v.joinError + '). Save each one:';
      const list = $('parts-list'); list.innerHTML = '';
      v.parts.forEach((pt, k) => { const b2 = document.createElement('button'); b2.type = 'button'; b2.className = 'chip'; b2.textContent = '💾 Part ' + (k + 1); b2.addEventListener('click', async () => { try { const st = await storeFor(v); const r = await SG.exportStored(st, pt.name, fileName(' part ' + String(k + 1).padStart(2, '0')), 'save'); toast('Saved to ' + r.where); } catch (err) { toast('Could not save: ' + (err && err.message || err), true); } }); list.appendChild(b2); });
      return;
    }
    const f = await videoFile(v);
    if (P && P.video === v) setMedia($('result-video'), f);
  }
  function fileName(suffix) {
    const v = P.video; const ext = /mp4/.test(v.type) ? 'mp4' : 'webm';
    const slug = (P.pkg.title || 'short').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'short';
    return 'VoiceToShort-' + slug + '-' + new Date().toISOString().slice(0, 10) + (suffix ? suffix.replace(/\s+/g, '-') : '') + '.' + ext;
  }
  $('save-video').addEventListener('click', async () => {
    if (!P.video || P.video.parts) return;
    const btn = $('save-video'); btn.disabled = true; btn.textContent = 'Saving…';
    const prog = (p) => { btn.textContent = 'Saving… ' + Math.round(p * 100) + '%'; };
    try {
      let r;
      if (P.video.stored) r = await SG.exportStored(await storeFor(P.video), P.video.stored.name, fileName(), 'save', prog);
      else r = await N.saveFile(P.video.blob, fileName(), prog);
      toast('Saved to ' + r.where);
    } catch (err) { toast('Could not save: ' + (err && err.message || err), true); }
    finally { btn.disabled = false; btn.textContent = 'Save to phone'; }
  });
  $('share-video').addEventListener('click', async () => {
    if (!P.video || P.video.parts) return;
    const btn = $('share-video'); btn.disabled = true;
    try {
      if (P.video.stored) { await SG.exportStored(await storeFor(P.video), P.video.stored.name, fileName(), 'share'); return; }
      const r = await N.shareFile(P.video.blob, fileName(), fieldText('title') + '\n\n' + fieldText('description'), P.pkg.title);
      if (r === 'downloaded') toast('Sharing files is not supported here, so the video was downloaded.');
    } catch (err) { if (!/cancel/i.test(String(err && err.message))) toast('Could not share: ' + (err && err.message || err), true); }
    finally { btn.disabled = false; }
  });

  // ---------- library ----------
  async function renderLibrary() {
    const list = $('library');
    let items = [];
    try { items = await DB.all(); } catch (err) { list.innerHTML = '<li class="empty">Could not open storage: ' + esc(err && err.message) + '</li>'; return; }
    items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    list.innerHTML = '';
    if (!items.length) { list.innerHTML = '<li class="empty"><img src="icons/icon-192.png" alt=""><h2>No Shorts yet</h2><p>Tap Create, talk for a minute, and your first Short will appear here.</p></li>'; return; }
    for (const p of items) {
      const li = document.createElement('li'); li.className = 'lib-item';
      li.innerHTML = (p.thumb ? '<img class="lib-thumb" alt="">' : '<div class="lib-thumb"></div>')
        + '<div class="lib-body"><strong></strong><span class="small muted"></span><div class="lib-meta"></div>'
        + '<div class="lib-actions"><button type="button" class="chip" data-a="open">Edit</button><button type="button" class="chip" data-a="render">Render again</button><button type="button" class="chip" data-a="del">Delete</button></div></div>';
      if (p.thumb) li.querySelector('img').src = p.thumb;
      li.querySelector('strong').textContent = projectTitle(p);
      li.querySelector('.small').textContent = when(p.updatedAt);
      const meta = li.querySelector('.lib-meta');
      const add = (t, cls) => { const s = document.createElement('span'); s.className = 'badge ' + (cls || ''); s.textContent = t; meta.appendChild(s); };
      if (p.pkg) add('Script', 'ok'); if (p.voice) add('Voice', 'ok');
      if (p.video) add((/mp4/.test(p.video.type) ? 'MP4' : 'WebM') + ' ' + fmt(p.video.duration) + (p.video.aspect && p.video.aspect !== '9:16' ? ' · ' + p.video.aspect : ''), 'ok'); else add('No video');
      if (!p.video && p.renderState && p.renderState.done && p.renderState.done.length) add('Render paused ' + p.renderState.done.length + '/' + p.renderState.bounds.length, 'warn');
      if (!p.pkg) li.querySelector('[data-a=render]').remove();
      li.querySelector('[data-a=open]').addEventListener('click', () => openProject(p.id, p.video ? 'render' : p.voice ? 'render' : p.pkg ? 'script' : 'idea'));
      const rb = li.querySelector('[data-a=render]');
      if (rb) rb.addEventListener('click', async () => { await openProject(p.id, p.voice ? 'render' : 'voice'); if (P.voice) startRender(); });
      li.querySelector('[data-a=del]').addEventListener('click', async () => {
        if (!confirm('Delete “' + projectTitle(p) + '”? This cannot be undone.')) return;
        await DB.del(p.id);
        if (p.video && p.video.stored) { try { const st = await storeFor(p.video); if (p.video.stored.name) await st.remove(p.video.stored.name); (p.video.parts || []).forEach((x) => st.remove(x.name).catch(() => {})); } catch (_) { /* ignore */ } }
        if (P && P.id === p.id) { P = blankProject(); voiceBuffer = null; localStorage.removeItem(K.last); renderAll(); showStep('idea'); }
        renderLibrary(); toast('Deleted');
      });
      list.appendChild(li);
    }
  }

  // ---------- settings ----------
  const keyInput = $('api-key'); const modelSel = $('model');
  function modelList() {
    const loaded = load(K.models, []);
    const set = new Set(G.BUILTIN_MODELS.concat(Array.isArray(loaded) ? loaded : []));
    set.add(getModel());
    return Array.from(set);
  }
  function fillSelect(sel, pairs, value) { sel.innerHTML = ''; pairs.forEach(([v, l]) => sel.add(new Option(l, v))); sel.value = value; }
  function renderSettings() {
    const key = getKey();
    keyInput.value = '';
    keyInput.placeholder = key ? 'Saved key ••••' + key.slice(-4) + ' (paste to replace)' : 'Paste your key (AIza… or AQ.…)';
    const ks = $('key-state'); ks.textContent = key ? 'A key is saved on this device (ends in ' + key.slice(-4) + ').' : 'No key saved yet.'; ks.className = 'hint' + (key ? ' ok' : '');
    modelSel.innerHTML = '';
    for (const m of modelList()) modelSel.add(new Option(m + (m === G.DEFAULT_MODEL ? ' (default)' : ''), m));
    modelSel.add(new Option('Custom…', '__custom')); modelSel.value = getModel();
    $('custom-model-wrap').classList.add('hidden');
    $('s-handle').value = load(K.handle, '');
    fillSelect($('s-tone'), Object.entries(S.TONES).map(([k, t]) => [k, t.label]), load(K.tone, 'sarcastic'));
    fillSelect($('s-language'), S.LANGUAGES.map((l) => [l, l]), load(K.language, 'English'));
    fillSelect($('s-grade'), Object.entries(R.PRESETS).map(([k, p]) => [k, p.name]), load(K.grade, 'teal'));
    fillSelect($('s-aspect'), R.ASPECTS ? Object.keys(R.ASPECTS).map((k) => [k, (R.ASPECT_LABELS && R.ASPECT_LABELS[k]) || k]) : [['9:16', '9:16']], defAspect());
    $('s-watermark').checked = !!load(K.watermark, false);
    $('s-visual').value = load(K.visualStyle, 'scenes') === 'classic' ? 'classic' : 'scenes'; $('s-ai-images').checked = !!load(K.aiImages, false);
    const langs = SPEECH_LANGS.slice(); if (!langs.some(([id]) => id === speechLang())) langs.unshift([speechLang(), speechLang()]);
    fillSelect($('s-speech-lang'), langs, speechLang());
    $('speech-support').textContent = VTS.speech.mode === 'native' ? 'Dictation uses Android’s built-in speech recognition (usually Google). Most phones need internet for it.'
      : VTS.speech.mode === 'web' ? 'Dictation uses your browser’s speech recognition. Works best in Chrome.' : 'This browser has no speech recognition — type your idea or use your keyboard’s mic.';
    $('s-wpm').value = wpm(); $('s-wpm-label').textContent = wpm() + ' words/min';
    $('s-raw-audio').checked = !!load(K.rawAudio, false);
    fillSelect($('s-tts-voice'), G.TTS_VOICES.map(([n, d]) => [n, n + ' — ' + d]), ttsVoice());
    $('s-tts-style').value = load(K.ttsStyle, 'tone');
    $('s-tts-custom').classList.toggle('hidden', $('s-tts-style').value !== 'custom'); $('s-tts-custom').value = load(K.ttsCustom, '');
    const tm = Array.from(new Set(G.TTS_MODELS.concat(load(K.ttsModels, []) || []).concat([getTtsModel()])));
    fillSelect($('s-tts-model'), tm.map((m) => [m, m + (m === G.TTS_DEFAULT_MODEL ? ' (default)' : '')]), getTtsModel());
    $('app-version').textContent = 'Voice to Short ' + APP_VERSION + (N.isNative ? ' · Android app' : ' · web app') + ' · video: ' + (R.pickVideoType('auto') || 'not supported');
  }
  $('api-key-toggle').addEventListener('click', () => { const show = keyInput.type === 'password'; keyInput.type = show ? 'text' : 'password'; $('api-key-toggle').textContent = show ? 'Hide' : 'Show'; });
  $('api-key-save').addEventListener('click', () => {
    const v = keyInput.value.trim().replace(/^["'`]+|["'`]+$/g, '').replace(/^(x-goog-api-key:|key=)\s*/i, '').trim();
    if (!v) { toast('Paste a key first.', true); return; }
    if (v.length < 10 || v.length > 256 || /\s/.test(v)) { toast('That API key does not look valid.', true); return; }
    localStorage.setItem(K.key, v); keyInput.type = 'password'; $('api-key-toggle').textContent = 'Show';
    renderSettings(); toast('API key saved on this device');
  });
  $('api-key-remove').addEventListener('click', () => { if (!getKey()) return; if (!confirm('Remove the saved API key from this device?')) return; localStorage.removeItem(K.key); renderSettings(); toast('API key removed'); });
  $('api-key-test').addEventListener('click', async () => {
    if (keyInput.value.trim()) $('api-key-save').click();
    const ks = $('key-state');
    if (!getKey()) { toast('Save a key first.', true); return; }
    ks.textContent = 'Testing with ' + getModel() + '…'; ks.className = 'hint';
    try {
      const reply = await G.generate([{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }], { timeout: 30000, temperature: 0 });
      ks.textContent = 'Key works with ' + getModel() + ' (reply: ' + reply.slice(0, 40) + ').'; ks.className = 'hint ok';
    } catch (err) { ks.textContent = G.friendlyError(err); ks.className = 'hint err'; }
  });
  modelSel.addEventListener('change', () => {
    if (modelSel.value === '__custom') { $('custom-model-wrap').classList.remove('hidden'); $('custom-model').focus(); return; }
    save(K.model, modelSel.value); toast('Model: ' + modelSel.value);
  });
  $('custom-model').addEventListener('change', () => {
    const v = $('custom-model').value.trim().replace(/^models\//, '');
    if (!/^[a-zA-Z0-9._-]{3,80}$/.test(v)) { toast('That model name does not look valid.', true); return; }
    save(K.model, v); renderSettings(); toast('Model: ' + v);
  });
  $('load-models').addEventListener('click', async () => {
    const btn = $('load-models'); btn.disabled = true; btn.textContent = 'Loading…';
    try {
      const names = await G.listKeyModels();
      if (!names.length) throw G.fail('No chat models were returned for this key.');
      save(K.models, names); renderSettings(); toast(names.length + ' models loaded');
    } catch (err) { toast(G.friendlyError(err), true); } finally { btn.disabled = false; btn.textContent = 'Load models from my key'; }
  });
  $('s-handle').addEventListener('change', (e) => { const v = e.target.value.trim().replace(/\s+/g, ''); save(K.handle, v ? (v.startsWith('@') ? v : '@' + v) : ''); renderSettings(); });
  $('s-tone').addEventListener('change', (e) => { save(K.tone, e.target.value); if (P && !P.pkg) { P.tone = e.target.value; renderIdea(); } });
  $('s-language').addEventListener('change', (e) => save(K.language, e.target.value));
  $('s-grade').addEventListener('change', (e) => { save(K.grade, e.target.value); if (P && !P.video) P.look.preset = e.target.value; });
  $('s-aspect').addEventListener('change', (e) => { save(K.aspect, e.target.value); if (P && !P.video && !P.pkg) { P.look.aspect = e.target.value; if (!load(K.length, null)) P.length = defLength(e.target.value); } });
  $('s-watermark').addEventListener('change', (e) => save(K.watermark, e.target.checked));
  $('s-visual').addEventListener('change', (e) => save(K.visualStyle, e.target.value));
  $('s-ai-images').addEventListener('change', (e) => save(K.aiImages, e.target.checked));
  $('s-speech-lang').addEventListener('change', (e) => save(K.speechLang, e.target.value));
  $('s-wpm').addEventListener('input', (e) => { save(K.wpm, Number(e.target.value)); $('s-wpm-label').textContent = e.target.value + ' words/min'; });
  $('s-raw-audio').addEventListener('change', (e) => save(K.rawAudio, e.target.checked));
  $('s-tts-voice').addEventListener('change', (e) => { save(K.ttsVoice, e.target.value); toast('AI voice: ' + e.target.value); });
  $('s-tts-style').addEventListener('change', (e) => { save(K.ttsStyle, e.target.value); renderSettings(); });
  $('s-tts-custom').addEventListener('change', (e) => save(K.ttsCustom, e.target.value.trim()));
  $('s-tts-model').addEventListener('change', (e) => { save(K.ttsModel, e.target.value); toast('Voice model: ' + e.target.value); });
  $('load-tts-models').addEventListener('click', async () => {
    const btn = $('load-tts-models'); btn.disabled = true; btn.textContent = 'Loading…';
    try {
      const names = await G.listTtsModels();
      if (!names.length) throw G.fail('No text-to-speech models were returned for this key.');
      save(K.ttsModels, names); if (!names.includes(getTtsModel())) save(K.ttsModel, names[0]);
      renderSettings(); toast(names.length + ' voice model' + (names.length === 1 ? '' : 's') + ' loaded');
    } catch (err) { toast(G.friendlyError(err), true); } finally { btn.disabled = false; btn.textContent = 'Load voice models from my key'; }
  });
  $('export-data').addEventListener('click', async () => {
    const projects = (await DB.all()).map((p) => { const c = Object.assign({}, p); delete c.ideaAudio; delete c.video; if (c.voice) c.voice = Object.assign({}, c.voice, { blob: null, parts: null }); delete c.genPartial; delete c.renderState; if (c.pkg && c.pkg.beats) c.pkg = Object.assign({}, c.pkg, { beats: c.pkg.beats.map((b) => Object.assign({}, b, { aiImage: null, aiPrompt: '' })) }); return c; });
    const settings = {}; Object.entries(K).forEach(([k, v]) => { if (k !== 'key' && k !== 'last') { const raw = localStorage.getItem(v); if (raw != null) settings[v] = raw; } });
    const payload = JSON.stringify({ app: 'voice-to-short', version: APP_VERSION, exportedAt: new Date().toISOString(), settings, projects }, null, 2);
    const name = 'voice-to-short-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    try { const r = await N.saveFile(new Blob([payload], { type: 'application/json' }), name); toast('Backup saved to ' + r.where); } catch (err) { toast('Export failed: ' + (err && err.message || err), true); }
  });
  $('import-data').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || data.app !== 'voice-to-short' || !Array.isArray(data.projects)) throw new Error('This is not a Voice to Short backup.');
      let n = 0;
      for (const p of data.projects) {
        if (!p || !p.id) continue;
        const cur = await DB.get(p.id);
        if (cur && String(cur.updatedAt) >= String(p.updatedAt)) continue;
        if (p.voice && !p.voice.blob && p.voice.source !== 'silent') p.voice = null; // audio is not in backups
        await DB.put(p); n++;
      }
      Object.entries(data.settings || {}).forEach(([k, v]) => { if (k.startsWith('vts.') && k !== K.key) localStorage.setItem(k, v); });
      renderSettings(); toast('Imported ' + n + ' project' + (n === 1 ? '' : 's'));
    } catch (err) { toast('Import failed: ' + (err && err.message || err), true); }
  });
  $('wipe-data').addEventListener('click', async () => {
    if (!confirm('Delete ALL projects (ideas, scripts, recordings, videos) on this device? Your API key and settings are kept.')) return;
    await DB.clear(); localStorage.removeItem(K.last);
    P = blankProject(); voiceBuffer = null; renderAll(); showStep('idea'); renderLibrary(); toast('All projects deleted');
  });

  function stopAll() { stopPreview(); stopVoicePreview(); if (dictating) stopDictation(true); N.stopSpeaking(); if (pState) closePrompter(); }

  // ---------- boot ----------
  // The preview host is the preview wrapper (render canvas is overlaid there while rendering).
  document.querySelector('.preview-wrap').id = 'preview-wrap-host';
  (async function boot() {
    P = blankProject();
    const last = load(K.last, null);
    if (last) { try { const p = await DB.get(last); if (p) { P = Object.assign(blankProject(), p); P.look = Object.assign(blankProject().look, p.look || {}); } } catch (_) { /* ignore */ } }
    renderAll();
    const hash = location.hash.replace('#', '');
    showView(['library', 'settings'].includes(hash) ? hash : 'create');
    showStep(P.step || 'idea');
    if (!getKey() && !P.pkg) setStatus('gen-status', 'Tip: add your free Gemini API key in Settings to write scripts.');
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { persist(true); if (rendering) toast('Keep Voice to Short open while rendering.', true); } });
    window.VTS.app = { get project() { return P; }, renderAll: () => renderAll(), showStep, showView, startRender, openProject, newProject, setVoice };
  })();

  if (!N.isNative && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
}());
