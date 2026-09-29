/* Dictation: native Android speech recognition (auto-restarts after pauses) or Web Speech API. Ported from gemini-notes-chat. */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {});
  const cap = window.Capacitor;
  const isNative = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  const nativeSR = isNative && cap ? (cap.Plugins && cap.Plugins.SpeechRecognition) || (cap.registerPlugin ? cap.registerPlugin('SpeechRecognition') : null) : null;
  const WebSR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mode = nativeSR ? 'native' : WebSR ? 'web' : 'none';
  const fail = (m) => { const e = new Error(m); e.friendly = m; return e; };

  // cb: { lang(), commit(text), interim(text), error(msg), ended() }
  function webEngine(cb) {
    let rec = null; let want = true; let errors = 0; let interim = '';
    function create() {
      rec = new WebSR();
      rec.lang = cb.lang(); rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
      rec.onresult = (ev) => {
        errors = 0; let live = '';
        for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
          const r = ev.results[i];
          if (r.isFinal) cb.commit(r[0].transcript); else live += r[0].transcript;
        }
        interim = live; cb.interim(live);
      };
      rec.onerror = (ev) => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          want = false; cb.error('Microphone permission was denied. Allow mic access for this site in your browser settings.');
        } else if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
          errors += 1; if (errors > 3) { want = false; cb.error('Dictation error: ' + ev.error); }
        }
      };
      rec.onend = () => {
        if (interim) { cb.commit(interim); interim = ''; cb.interim(''); }
        if (want) { try { create(); rec.start(); } catch (_) { cb.ended(); } } else cb.ended();
      };
    }
    return {
      start() { create(); rec.start(); },
      stop() {
        want = false;
        return new Promise((resolve) => {
          rec.onend = () => { if (interim) { cb.commit(interim); interim = ''; cb.interim(''); } resolve(); };
          try { rec.stop(); } catch (_) { resolve(); }
          setTimeout(resolve, 1500);
        });
      },
    };
  }

  async function nativeEngine(cb) {
    const SR = nativeSR;
    const avail = await SR.available().catch(() => ({ available: false }));
    if (!avail.available) throw fail('Speech recognition is not available on this phone. Install or enable the Google app / “Speech Recognition & Synthesis”, then try again. You can also type your idea.');
    let perm = await SR.checkPermissions().catch(() => ({}));
    if (perm.speechRecognition !== 'granted') perm = await SR.requestPermissions().catch(() => ({}));
    if (perm.speechRecognition !== 'granted') throw fail('Microphone permission is needed for dictation. Allow it in Android Settings › Apps › Voice to Short › Permissions.');
    let want = true; let segment = ''; let stoppedAt = 0; let restartTimer = 0; let pollTimer = 0; let running = false; let finalWaiter = null;
    const handles = [];
    const commitSeg = () => { if (segment.trim()) cb.commit(segment); segment = ''; cb.interim(''); };
    const opts = () => ({ language: cb.lang(), maxResults: 1, partialResults: true, popup: false });
    async function begin() {
      segment = ''; stoppedAt = 0; running = true;
      try { await SR.start(opts()); } catch (err) { running = false; if (want) scheduleRestart(800); }
    }
    function scheduleRestart(ms) {
      clearTimeout(restartTimer);
      restartTimer = setTimeout(() => { commitSeg(); if (want) begin(); }, ms);
    }
    handles.push(await SR.addListener('partialResults', (data) => {
      const m = data && data.matches && data.matches[0];
      if (typeof m !== 'string') return;
      segment = m; cb.interim(m);
      if (finalWaiter) { finalWaiter(); return; }
      if (stoppedAt) scheduleRestart(150);
    }));
    handles.push(await SR.addListener('listeningState', (data) => {
      if (data && data.status === 'stopped' && running) { running = false; stoppedAt = Date.now(); if (want) scheduleRestart(1200); }
    }));
    // Android does not report "no speech" errors to JS in partial-results mode; poll to recover.
    pollTimer = setInterval(async () => {
      if (!want || !running) return;
      try { const s = await SR.isListening(); if (s && s.listening === false && running) { running = false; stoppedAt = Date.now(); scheduleRestart(900); } } catch (_) { /* ignore */ }
    }, 1500);
    return {
      start: begin,
      async stop() {
        want = false; clearTimeout(restartTimer); clearInterval(pollTimer);
        await new Promise((resolve) => {
          const t = setTimeout(resolve, running ? 1500 : 300);
          finalWaiter = () => { clearTimeout(t); resolve(); };
          SR.stop().catch(() => {});
        });
        finalWaiter = null; commitSeg(); running = false;
        handles.forEach((h) => { try { h.remove(); } catch (_) { /* ignore */ } });
      },
    };
  }

  async function create(cb) {
    if (mode === 'none') throw fail('Voice dictation is not supported in this browser. Use Chrome, the Android app, or your keyboard’s mic button — or just type.');
    return mode === 'native' ? nativeEngine(cb) : webEngine(cb);
  }

  VTS.speech = { mode, isNative, create };
}());
