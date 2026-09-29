/* Voice to Short — app UI. Plain JS, no build step. */
(function () {
  'use strict';
  const APP_VERSION = '1.0.0';
  const G = VTS.gemini; const S = VTS.shortgen; const R = VTS.render; const N = VTS.native; const DB = VTS.db;
  const $ = (id) => document.getElementById(id);
  const MAX_IDEA_SEC = 90;
  const MAX_VOICE_SEC = R.MAX_SECONDS - R.LEAD - R.TAIL; // 58.9 s of audio fits in a 60 s Short

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
    watermark: 'vts.watermark', speechLang: 'vts.speechLang', wpm: 'vts.wpm', rawAudio: 'vts.rawAudio', last: 'vts.lastProject' };
  function load(key, fallback) { try { const raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); } catch (_) { return fallback; } }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { toast('Could not save settings: storage is full.', true); } }
  const getKey = () => String(localStorage.getItem(K.key) || '').trim();
  const getModel = () => { const m = String(load(K.model, G.DEFAULT_MODEL) || '').trim(); return /^[a-zA-Z0-9._-]{3,80}$/.test(m) ? m : G.DEFAULT_MODEL; };
  const handle = () => { const h = String(load(K.handle, '') || '').trim(); return h ? (h.startsWith('@') ? h : '@' + h) : ''; };
  const speechLang = () => load(K.speechLang, (navigator.language && /^[a-z]{2}-[A-Z]{2}$/.test(navigator.language)) ? navigator.language : 'en-US');
  const wpm = () => Number(load(K.wpm, 150)) || 150;
  (function migrateModel() {
    const saved = load(K.model, null);
    if (typeof saved === 'string' && G.LEGACY_MODEL_RE.test(saved.trim())) save(K.model, G.DEFAULT_MODEL);
    const listed = load(K.models, null);
    if (Array.isArray(listed)) save(K.models, listed.filter((m) => typeof m === 'string' && !G.LEGACY_MODEL_RE.test(m)));
  })();
  Object.assign(G.host, {
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
    return { id: uuid(), createdAt: now, updatedAt: now, step: 'idea', idea: '', ideaAudio: null, tone: load(K.tone, 'calm'),
      pkg: null, voice: null, video: null, thumb: '',
      look: { preset: load(K.grade, 'teal'), captionStyle: 'pop', captionCase: 'upper', watermark: !!load(K.watermark, false), progress: false, format: 'auto' } };
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
  function projectTitle(p) { return (p.pkg && p.pkg.title) || (p.idea ? p.idea.trim().split(/\s+/).slice(0, 8).join(' ') + (S.wordCount(p.idea) > 8 ? '…' : '') : 'New Short'); }
  async function openProject(id, step) {
    const p = await DB.get(id);
    if (!p) { toast('That project was not found.', true); return; }
    stopAll();
    P = Object.assign(blankProject(), p);
    P.look = Object.assign(blankProject().look, p.look || {});
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
    const ex = $('idea-examples');
    if (!ex.childElementCount) EXAMPLES.forEach((t) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = t; b.addEventListener('click', () => { if (ideaEl.value.trim() && !confirm('Replace your idea with this example?')) return; P.idea = t; ideaEl.value = t; updateIdeaCount(); persist(); }); ex.appendChild(b); });
    paintIdeaAudio();
    setStatus('gen-status', getKey() ? '' : 'Tip: add your free Gemini API key in Settings to write scripts.');
  }
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
        commit: (t) => { t = String(t || '').trim(); if (t) committed = committed ? committed + ' ' + t : t; paintDictation(); },
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
        if (sec >= MAX_IDEA_SEC) { stopDictation(); toast('90 seconds reached — that’s plenty for a Short.'); }
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
  let generating = false;
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
    try {
      const pkg = await S.generatePackage(P.idea, { tone: P.tone, language: load(K.language, 'English'), handle: handle() });
      P.pkg = pkg; P.video = null;
      persist(true);
      $('project-name').textContent = projectTitle(P);
      toast('Script ready — pick a hook and tweak anything');
    } catch (err) {
      const msg = G.friendlyError(err);
      if (P.pkg) { toast(msg, true); } else { showStep('idea'); setStatus('gen-status', msg, 'err'); }
    } finally {
      generating = false; $('generate').disabled = false; $('regenerate').disabled = false;
      $('script-loading').classList.add('hidden');
      if (P.pkg) { renderScript(); paintStepper(); }
    }
  }
  $('generate').addEventListener('click', generate);
  $('regenerate').addEventListener('click', () => { if (!confirm('Write a fresh script from the same idea? Your edits to this script will be replaced.')) return; generate(); });

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
  }
  function updateScriptMeta() {
    const n = S.wordCount($('script').value);
    const b = $('word-badge'); b.textContent = n + ' words'; b.className = 'badge ' + (n >= 80 && n <= 110 ? 'ok' : 'warn');
    $('script-est').textContent = '≈ ' + Math.round(n / 2.5) + ' s spoken' + (n > 140 ? ' · too long for 60 s' : n < 80 ? ' · aim for 80–110 words' : '');
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
  function renderBeats() {
    const list = $('beats'); list.innerHTML = '';
    P.pkg.beats.forEach((b, i) => {
      const li = document.createElement('li'); li.className = 'beat s' + b.step;
      li.innerHTML = '<select aria-label="Section"></select><input class="b-text" type="text" aria-label="Caption text"><button type="button" class="b-del" aria-label="Delete beat">×</button>'
        + '<div class="b-row"><label>Weight <input class="b-weight" type="number" min="0.5" max="12" step="0.5" inputmode="decimal"></label><label style="flex:1">Emphasis <input class="b-emph" type="text" placeholder="key word"></label></div>'
        + '<input class="b-visual" type="text" aria-label="Visual idea" placeholder="🎞 b-roll / visual idea">';
      const sel = li.querySelector('select'); STEP_LABELS.forEach((l, k) => sel.add(new Option(l, k))); sel.value = b.step;
      const tx = li.querySelector('.b-text'); tx.value = b.text;
      const w = li.querySelector('.b-weight'); w.value = b.weight;
      const em = li.querySelector('.b-emph'); em.value = b.emphasis || '';
      const vi = li.querySelector('.b-visual'); vi.value = b.visual ? '🎞 ' + b.visual : '';
      sel.addEventListener('change', () => { b.step = Number(sel.value); li.className = 'beat s' + b.step; markVideoStale(); persist(); });
      tx.addEventListener('input', () => { b.text = tx.value; markVideoStale(); persist(); });
      w.addEventListener('input', () => { b.weight = Math.max(0.5, Math.min(12, Number(w.value) || 1)); markVideoStale(); persist(); });
      em.addEventListener('input', () => { b.emphasis = em.value.trim(); markVideoStale(); persist(); });
      vi.addEventListener('input', () => { b.visual = vi.value.replace(/^🎞\s*/, ''); persist(); });
      li.querySelector('.b-del').addEventListener('click', () => { P.pkg.beats.splice(i, 1); markVideoStale(); persist(); renderBeats(); });
      list.appendChild(li);
    });
  }
  $('add-beat').addEventListener('click', () => {
    const last = P.pkg.beats[P.pkg.beats.length - 1];
    P.pkg.beats.push({ text: '', weight: 3, step: last ? last.step : 4, emphasis: '', visual: '' });
    persist(); renderBeats();
    const inputs = $('beats').querySelectorAll('.b-text'); inputs[inputs.length - 1].focus();
  });
  $('f-title').addEventListener('input', (e) => { P.pkg.title = e.target.value; $('project-name').textContent = projectTitle(P); persist(); });
  $('f-description').addEventListener('input', (e) => { P.pkg.description = e.target.value; persist(); });
  $('f-hashtags').addEventListener('change', (e) => { P.pkg.hashtags = Array.from(new Set(e.target.value.split(/[\s,]+/).map(S.normHashtag).filter(Boolean))); e.target.value = P.pkg.hashtags.join(' '); persist(); });
  $('f-pinned').addEventListener('input', (e) => { P.pkg.pinnedComment = e.target.value; persist(); });
  $('f-thumb').addEventListener('input', (e) => { P.pkg.thumbnailText = e.target.value; persist(); });
  function fieldText(f) {
    const p = P && P.pkg; if (!p) return '';
    if (f === 'hashtags') return p.hashtags.join(' ');
    if (f === 'description') return p.description + (p.hashtags.length ? '\n\n' + p.hashtags.join(' ') : '');
    return p[f] || '';
  }
  function copyField(f) {
    const labels = { title: 'Title', description: 'Description', hashtags: 'Hashtags', pinnedComment: 'Pinned comment', thumbnailText: 'Thumbnail text' };
    copyText(fieldText(f), labels[f]);
  }
  $('copy-all').addEventListener('click', () => {
    const p = P.pkg;
    copyText(['TITLE', p.title, '', 'DESCRIPTION', p.description, '', p.hashtags.join(' '), '', 'PINNED COMMENT', p.pinnedComment, '', 'THUMBNAIL TEXT', p.thumbnailText, '', 'SCRIPT', p.script].join('\n'), 'Publish kit');
  });
  function markVideoStale() { if (P.video) { P.video.stale = true; } }

  // ---------- step 3: voice ----------
  const ttsLocale = () => { const lang = load(K.language, 'English'); const sl = speechLang(); const loc = LANG_LOCALE[lang] || 'en-US'; return sl.slice(0, 2) === loc.slice(0, 2) ? sl : loc; };
  function renderVoice() {
    const v = P.voice;
    $('take-card').classList.toggle('hidden', !v);
    if (v) {
      const names = { mic: 'Your voice', 'tts-file': 'Android voice', 'tts-mic': 'Device voice (via mic)', import: 'Imported audio', silent: 'No voice (silent)' };
      $('take-badge').textContent = names[v.source] || 'Voice';
      $('take-badge').className = 'badge ok';
      $('take-audio').classList.toggle('hidden', !v.blob);
      if (v.blob) setMedia($('take-audio'), v.blob);
      $('take-info').textContent = fmt(v.duration) + (v.source === 'silent' ? ' of captions at a relaxed pace. Record a voiceover in the YouTube app after uploading.' : ' · silences at the start and end are trimmed when rendering')
        + (v.duration > MAX_VOICE_SEC ? ' · Longer than ~59 s, so the end will be cut to keep the Short under 60 s.' : '');
    }
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
  async function setVoice(blob, source, duration) {
    try {
      let dur = duration || 0;
      if (blob) { const buf = await R.decodeBlob(blob); dur = buf.duration; if (R.speechBounds(buf).silent && source !== 'silent') toast('That recording sounds silent. Check the mic and try again.', true); }
      P.voice = { blob: blob || null, source, duration: dur, mime: blob ? blob.type : '', createdAt: new Date().toISOString() };
      voiceBuffer = null; markVideoStale(); persist(true); renderVoice();
      setStatus('voice-status', 'Voice ready (' + fmt(dur) + '). Next: render your video.', 'ok');
    } catch (err) {
      setStatus('voice-status', 'Could not read that audio: ' + (err && err.message || err || 'unsupported format'), 'err');
    }
  }
  $('opt-record').addEventListener('click', openPrompter);
  $('import-audio').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 60 * 1024 * 1024) { setStatus('voice-status', 'That file is too big (max 60 MB).', 'err'); return; }
    setStatus('voice-status', 'Reading audio…');
    await setVoice(f.slice(0, f.size, f.type || 'audio/mpeg'), 'import');
  });
  $('opt-silent').addEventListener('click', () => {
    const words = S.wordCount(P.pkg ? P.pkg.script : '');
    setVoice(null, 'silent', Math.min(MAX_VOICE_SEC, Math.max(8, words / (wpm() / 60))));
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

  // Teleprompter
  let pState = null;
  function openPrompter() {
    if (!P.pkg) return;
    const box = $('p-text'); box.innerHTML = '';
    const sentences = P.pkg.script.match(/[^.!?…]+[.!?…]*["”’)]?\s*/g) || [P.pkg.script];
    sentences.forEach((s) => { const span = document.createElement('span'); span.textContent = s; if (/^\s*(step\s*)?(one|two|three|first|second|third|1|2|3)\b/i.test(s)) span.className = 's'; box.appendChild(span); });
    $('p-speed').value = wpm();
    $('p-scroll').scrollTop = 0;
    $('p-time').textContent = '0:00'; $('p-dot').classList.remove('on');
    $('p-rec').classList.remove('on'); $('p-rec').classList.remove('hidden');
    $('p-retake').classList.add('hidden'); $('p-use').classList.add('hidden'); $('p-audio').classList.add('hidden');
    $('p-hint').textContent = 'Tap record, wait for 3-2-1, then read at a relaxed pace. Tap the text to pause scrolling.';
    $('prompter').classList.remove('hidden');
    history.pushState(null, '', '#prompter');
    pState = { blob: null };
  }
  function closePrompter(fromPop) {
    if (!pState) return;
    if (pState.rec) { pState.rec.stop(); }
    cancelAnimationFrame(pState.raf); clearInterval(pState.timer); clearTimeout(pState.countT);
    $('p-count').classList.add('hidden');
    $('prompter').classList.add('hidden');
    setMedia($('p-audio'), null);
    pState = null;
    if (!fromPop && location.hash === '#prompter') history.back();
  }
  window.addEventListener('popstate', () => { if (pState) closePrompter(true); });
  $('p-close').addEventListener('click', () => closePrompter());
  $('p-speed').addEventListener('input', (e) => save(K.wpm, Number(e.target.value)));
  $('p-scroll').addEventListener('click', () => { if (pState && pState.rec) { pState.paused = !pState.paused; toast(pState.paused ? 'Scrolling paused' : 'Scrolling'); } });
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
    pState.rec = recorder(stream); pState.rec.start();
    pState.t0 = performance.now(); pState.paused = false; pState.scrollPos = 0; pState.last = performance.now();
    $('p-rec').classList.add('on'); $('p-rec').setAttribute('aria-label', 'Stop recording'); $('p-dot').classList.add('on');
    $('p-hint').textContent = 'Recording… tap ■ when you finish.';
    $('p-retake').classList.add('hidden'); $('p-use').classList.add('hidden'); $('p-audio').classList.add('hidden');
    const sc = $('p-scroll'); sc.scrollTop = 0;
    const words = S.wordCount(P.pkg.script);
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
      const sec = (performance.now() - pState.t0) / 1000;
      $('p-time').textContent = fmt(sec);
      if (sec >= 60) { stopTake(); toast('60 seconds — perfect Short length.'); }
    }, 200);
  });
  async function stopTake() {
    const r = pState.rec; pState.rec = null;
    cancelAnimationFrame(pState.raf); clearInterval(pState.timer);
    $('p-rec').classList.remove('on'); $('p-rec').setAttribute('aria-label', 'Start recording'); $('p-dot').classList.remove('on');
    const blob = await r.stop();
    if (!pState) return;
    pState.blob = blob;
    const a = $('p-audio'); setMedia(a, blob); a.classList.remove('hidden');
    $('p-rec').classList.add('hidden'); $('p-retake').classList.remove('hidden'); $('p-use').classList.remove('hidden');
    $('p-hint').textContent = 'Listen back. Happy? Tap “Use this take”.';
  }
  $('p-retake').addEventListener('click', () => {
    setMedia($('p-audio'), null); $('p-audio').classList.add('hidden');
    $('p-rec').classList.remove('hidden'); $('p-retake').classList.add('hidden'); $('p-use').classList.add('hidden');
    $('p-scroll').scrollTop = 0; $('p-time').textContent = '0:00';
    $('p-hint').textContent = 'Tap record when ready.';
  });
  $('p-use').addEventListener('click', async () => {
    const blob = pState && pState.blob; closePrompter();
    if (blob) { await setVoice(blob, 'mic'); }
  });

  // ---------- step 4: render ----------
  let pv = null; let rendering = false; let renderAbort = null;
  function stopPreview() { if (pv) { pv.stop(); $('preview-play').classList.remove('playing'); $('preview-play').textContent = '▶'; } }
  async function getVoiceBuffer() {
    if (voiceBuffer) return voiceBuffer;
    const v = P.voice;
    if (!v) return R.silentBuffer(Math.min(MAX_VOICE_SEC, Math.max(8, S.wordCount(P.pkg.script) / (wpm() / 60))));
    if (v.source === 'silent' || !v.blob) voiceBuffer = R.silentBuffer(Math.min(MAX_VOICE_SEC, v.duration || 30));
    else voiceBuffer = R.trimBuffer(await R.decodeBlob(v.blob), MAX_VOICE_SEC);
    return voiceBuffer;
  }
  const look = () => Object.assign({}, P.look, { handle: handle() });
  async function buildPreview() {
    stopPreview();
    if (!P.pkg) return;
    try {
      const buf = await getVoiceBuffer();
      pv = R.preview({ canvas: $('preview'), buffer: buf, beats: P.pkg.beats, look: look(), onTime: (t, d) => { $('preview-time').textContent = fmt(t) + ' / ' + fmt(d); } });
      try { await document.fonts.load('800 100px Montserrat'); } catch (_) { /* ignore */ }
      const first = R.buildTimeline(P.pkg.beats, 0.3, 0.3 + buf.duration);
      const stepBeat = first.find((b) => b.step === 1);
      pv.drawAt(stepBeat ? stepBeat.start + 0.9 : 1.2);
      $('preview-time').textContent = fmt(pv.duration);
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
    $('opt-watermark').checked = !!P.look.watermark; $('opt-progress').checked = !!P.look.progress; $('opt-format').value = P.look.format || 'auto';
    $('wm-handle').textContent = handle() ? handle() : '(set your handle in Settings)';
    $('render').disabled = rendering;
    $('render').querySelector('span').textContent = P.voice ? (P.video ? '🎬 Render again' : '🎬 Render 1080×1920 video') : '🎙 Add a voice first';
    paintResult();
    if (currentView === 'create' && P.step === 'render' && !rendering) buildPreview();
  }
  document.querySelectorAll('#cap-style button').forEach((b) => b.addEventListener('click', () => { P.look.captionStyle = b.dataset.v; markVideoStale(); persist(); renderRenderPane(); }));
  document.querySelectorAll('#cap-case button').forEach((b) => b.addEventListener('click', () => { P.look.captionCase = b.dataset.v; markVideoStale(); persist(); renderRenderPane(); }));
  $('opt-watermark').addEventListener('change', (e) => { P.look.watermark = e.target.checked; if (e.target.checked && !handle()) toast('Set your channel handle in Settings.', true); markVideoStale(); persist(); renderRenderPane(); });
  $('opt-progress').addEventListener('change', (e) => { P.look.progress = e.target.checked; markVideoStale(); persist(); renderRenderPane(); });
  $('opt-format').addEventListener('change', (e) => { P.look.format = e.target.value; persist(); });
  $('preview-play').addEventListener('click', async () => {
    if (!pv) await buildPreview();
    if (!pv) return;
    if (pv.playing) { stopPreview(); return; }
    $('preview-play').classList.add('playing'); $('preview-play').textContent = '❚❚';
    pv.play(() => { $('preview-play').classList.remove('playing'); $('preview-play').textContent = '▶'; });
  });
  $('render').addEventListener('click', () => startRender());
  $('render-cancel').addEventListener('click', () => { if (renderAbort) renderAbort.abort(); });
  async function startRender() {
    if (rendering || !P.pkg) return;
    if (!P.voice) { showStep('voice'); toast('Record your voice (or pick an option) first.', true); return; }
    if (!R.canRender()) { setStatus('render-status', 'This browser cannot record video (needs MediaRecorder + canvas capture). Use the Android app or Chrome.', 'err'); return; }
    stopPreview();
    rendering = true; renderAbort = new AbortController();
    $('render').disabled = true; $('render-progress').classList.remove('hidden'); setStatus('render-status', '');
    const canvas = document.createElement('canvas'); canvas.width = R.W; canvas.height = R.H; canvas.id = 'render-canvas';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    $('preview-wrap-host').appendChild(canvas);
    let wake = null;
    N.keepAwake(true);
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (_) { /* ignore */ }
    const t0 = Date.now();
    try {
      const buf = await getVoiceBuffer();
      const res = await R.renderVideo({
        canvas, buffer: buf, beats: P.pkg.beats, look: look(), format: P.look.format, signal: renderAbort.signal,
        onProgress: (p, t, total) => { $('render-bar').style.width = (p * 100).toFixed(1) + '%'; $('render-label').textContent = 'Rendering… ' + Math.round(p * 100) + '% (' + fmt(t) + ' / ' + fmt(total) + ')'; },
      });
      if (!res) { setStatus('render-status', 'Render cancelled.'); return; }
      if (!res.blob.size) throw new Error('The recorder produced an empty file.');
      // Library thumbnail.
      const th = document.createElement('canvas'); th.width = 270; th.height = 480;
      const rr = new R.Renderer(th); const P2 = R.plan(buf);
      rr.setup(Object.assign({}, look(), { beats: P.pkg.beats, speechStart: P2.speechStart, speechEnd: P2.speechEnd, duration: P2.total }));
      const tl = R.buildTimeline(P.pkg.beats, P2.speechStart, P2.speechEnd); const sb = tl.find((b) => b.step === 1);
      rr.draw(sb ? sb.start + 0.9 : 1.2);
      P.thumb = th.toDataURL('image/jpeg', 0.8);
      P.video = { blob: res.blob, mime: res.mime, type: res.type, duration: res.duration, size: res.blob.size, width: res.width, height: res.height, createdAt: new Date().toISOString(), renderMs: Date.now() - t0, frames: res.frames };
      persist(true);
      setStatus('render-status', 'Done! Share it straight to YouTube or save it to your phone.', 'ok');
      paintResult(); paintStepper();
      setTimeout(() => $('result-card').scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setStatus('render-status', 'Render failed: ' + (err && err.message || err), 'err');
    } finally {
      rendering = false; renderAbort = null; canvas.remove();
      try { if (wake) wake.release(); } catch (_) { /* ignore */ }
      N.keepAwake(false);
      $('render').disabled = false; $('render-progress').classList.add('hidden'); $('render-bar').style.width = '0';
      renderRenderPane();
    }
  }
  function paintResult() {
    const v = P && P.video;
    $('result-card').classList.toggle('hidden', !v);
    if (!v) { setMedia($('result-video'), null); return; }
    setMedia($('result-video'), v.blob);
    const ext = /mp4/.test(v.type) ? 'MP4' : 'WebM';
    $('result-badge').textContent = ext + ' · ' + fmt(v.duration);
    $('result-info').textContent = v.width + '×' + v.height + ' · ' + fmtSize(v.size) + ' · ' + (v.mime || v.type) + (v.stale ? ' · You changed things since this render — tap “Render again”.' : '');
  }
  function fileName() {
    const v = P.video; const ext = /mp4/.test(v.type) ? 'mp4' : 'webm';
    const slug = (P.pkg.title || 'short').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'short';
    return 'VoiceToShort-' + slug + '-' + new Date().toISOString().slice(0, 10) + '.' + ext;
  }
  $('save-video').addEventListener('click', async () => {
    if (!P.video) return;
    const btn = $('save-video'); btn.disabled = true; btn.textContent = 'Saving…';
    try { const r = await N.saveFile(P.video.blob, fileName(), (p) => { btn.textContent = 'Saving… ' + Math.round(p * 100) + '%'; }); toast('Saved to ' + r.where); }
    catch (err) { toast('Could not save: ' + (err && err.message || err), true); }
    finally { btn.disabled = false; btn.textContent = 'Save to phone'; }
  });
  $('share-video').addEventListener('click', async () => {
    if (!P.video) return;
    const btn = $('share-video'); btn.disabled = true;
    try {
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
      if (p.video) add((/mp4/.test(p.video.type) ? 'MP4' : 'WebM') + ' ' + fmt(p.video.duration), 'ok'); else add('No video');
      if (!p.pkg) li.querySelector('[data-a=render]').remove();
      li.querySelector('[data-a=open]').addEventListener('click', () => openProject(p.id, p.video ? 'render' : p.voice ? 'render' : p.pkg ? 'script' : 'idea'));
      const rb = li.querySelector('[data-a=render]');
      if (rb) rb.addEventListener('click', async () => { await openProject(p.id, p.voice ? 'render' : 'voice'); if (P.voice) startRender(); });
      li.querySelector('[data-a=del]').addEventListener('click', async () => {
        if (!confirm('Delete “' + projectTitle(p) + '”? This cannot be undone.')) return;
        await DB.del(p.id);
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
    fillSelect($('s-tone'), Object.entries(S.TONES).map(([k, t]) => [k, t.label]), load(K.tone, 'calm'));
    fillSelect($('s-language'), S.LANGUAGES.map((l) => [l, l]), load(K.language, 'English'));
    fillSelect($('s-grade'), Object.entries(R.PRESETS).map(([k, p]) => [k, p.name]), load(K.grade, 'teal'));
    $('s-watermark').checked = !!load(K.watermark, false);
    const langs = SPEECH_LANGS.slice(); if (!langs.some(([id]) => id === speechLang())) langs.unshift([speechLang(), speechLang()]);
    fillSelect($('s-speech-lang'), langs, speechLang());
    $('speech-support').textContent = VTS.speech.mode === 'native' ? 'Dictation uses Android’s built-in speech recognition (usually Google). Most phones need internet for it.'
      : VTS.speech.mode === 'web' ? 'Dictation uses your browser’s speech recognition. Works best in Chrome.' : 'This browser has no speech recognition — type your idea or use your keyboard’s mic.';
    $('s-wpm').value = wpm(); $('s-wpm-label').textContent = wpm() + ' words/min';
    $('s-raw-audio').checked = !!load(K.rawAudio, false);
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
  $('s-watermark').addEventListener('change', (e) => save(K.watermark, e.target.checked));
  $('s-speech-lang').addEventListener('change', (e) => save(K.speechLang, e.target.value));
  $('s-wpm').addEventListener('input', (e) => { save(K.wpm, Number(e.target.value)); $('s-wpm-label').textContent = e.target.value + ' words/min'; });
  $('s-raw-audio').addEventListener('change', (e) => save(K.rawAudio, e.target.checked));
  $('export-data').addEventListener('click', async () => {
    const projects = (await DB.all()).map((p) => { const c = Object.assign({}, p); delete c.ideaAudio; delete c.video; if (c.voice) c.voice = Object.assign({}, c.voice, { blob: null }); return c; });
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

  function stopAll() { stopPreview(); if (dictating) stopDictation(true); N.stopSpeaking(); if (pState) closePrompter(); }

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
    window.VTS.app = { get project() { return P; }, showStep, showView, startRender, openProject, newProject, setVoice };
  })();

  if (!N.isNative && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
}());
