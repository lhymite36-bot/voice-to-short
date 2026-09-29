/* Native bridges (Capacitor) with web fallbacks: save/share files, device text-to-speech. */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {});
  const cap = window.Capacitor;
  const isNative = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  const plugin = (name) => (isNative && cap ? (cap.Plugins && cap.Plugins[name]) || (cap.registerPlugin ? cap.registerPlugin(name) : null) : null);
  const Filesystem = plugin('Filesystem');
  const Share = plugin('Share');
  const TTS = plugin('TextToSpeech');
  const VtsNative = plugin('VtsNative');

  function blobPartToBase64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => { const s = String(fr.result); resolve(s.slice(s.indexOf(',') + 1)); };
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }
  // Write a Blob to the device in 3 MB chunks (keeps the JS<->native bridge happy with big videos).
  async function writeBlob(path, directory, blob, onProgress) {
    const CH = 3 * 1024 * 1024; // multiple of 3 so base64 chunks concatenate cleanly
    for (let off = 0, i = 0; off < blob.size || i === 0; off += CH, i++) {
      const data = await blobPartToBase64(blob.slice(off, off + CH));
      if (i === 0) await Filesystem.writeFile({ path, directory, data, recursive: true });
      else await Filesystem.appendFile({ path, directory, data });
      if (onProgress) onProgress(Math.min(1, (off + CH) / blob.size));
      if (blob.size === 0) break;
    }
    return (await Filesystem.getUri({ path, directory })).uri;
  }
  function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  async function ensureStoragePermission() {
    try {
      const p = await Filesystem.checkPermissions();
      if (p.publicStorage !== 'granted') await Filesystem.requestPermissions();
    } catch (_) { /* Android 10+ does not need it */ }
  }

  // Save to Documents/VoiceToShort on Android; download in a browser.
  async function saveFile(blob, filename, onProgress) {
    if (isNative && Filesystem) {
      await ensureStoragePermission();
      const uri = await writeBlob('VoiceToShort/' + filename, 'DOCUMENTS', blob, onProgress);
      return { where: 'Documents/VoiceToShort/' + filename, uri };
    }
    download(blob, filename);
    return { where: 'your Downloads folder', uri: '' };
  }
  // Open the Android share sheet (YouTube, Drive, WhatsApp…) or the Web Share API.
  async function shareFile(blob, filename, text, title) {
    if (isNative && Filesystem && Share) {
      const uri = await writeBlob('share/' + filename, 'CACHE', blob);
      await Share.share({ title: title || filename, text: text || '', files: [uri], dialogTitle: 'Share your Short' });
      return 'shared';
    }
    if (navigator.canShare && typeof File !== 'undefined') {
      const f = new File([blob], filename, { type: blob.type });
      if (navigator.canShare({ files: [f] })) {
        try { await navigator.share({ files: [f], title: title || filename, text: text || '' }); return 'shared'; } catch (err) { if (err && err.name === 'AbortError') return 'cancelled'; }
      }
    }
    download(blob, filename);
    return 'downloaded';
  }

  // ---------- text to speech ----------
  const webTTS = typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';
  const ttsMode = isNative && TTS ? 'native' : webTTS ? 'web' : 'none';
  function speak(text, o) {
    o = o || {};
    if (ttsMode === 'native') return TTS.speak({ text, lang: o.lang || 'en-US', rate: o.rate || 1, pitch: o.pitch || 1, volume: 1, category: 'playback' });
    if (ttsMode === 'web') {
      return new Promise((resolve, reject) => {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = o.lang || 'en-US'; u.rate = o.rate || 1; u.pitch = o.pitch || 1;
        const voices = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith(u.lang.slice(0, 2).toLowerCase()));
        const best = voices.find((v) => /natural|neural|google|premium|enhanced/i.test(v.name)) || voices[0];
        if (best) u.voice = best;
        u.onend = () => resolve(); u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled' ? resolve() : reject(new Error('Speech error: ' + e.error)));
        speechSynthesis.speak(u);
      });
    }
    return Promise.reject(new Error('Text-to-speech is not available here.'));
  }
  function stopSpeaking() {
    try { if (ttsMode === 'native') TTS.stop(); else if (ttsMode === 'web') speechSynthesis.cancel(); } catch (_) { /* ignore */ }
  }
  // Android only: render the device voice straight into a WAV file (so it can go into the video).
  const canTtsToFile = !!(isNative && VtsNative);
  async function ttsToFile(text, o) {
    o = o || {};
    if (!canTtsToFile) throw new Error('Device voice to file is only available in the Android app.');
    const res = await VtsNative.synthesize({ text, lang: o.lang || 'en-US', rate: o.rate || 1, pitch: o.pitch || 1 });
    let blob = null;
    try {
      const r = await fetch(cap.convertFileSrc(res.uri));
      if (r.ok) blob = await r.blob();
    } catch (_) { /* fall back below */ }
    if (!blob || !blob.size) {
      const f = await Filesystem.readFile({ path: res.uri });
      const bin = atob(f.data); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      blob = new Blob([bytes], { type: 'audio/wav' });
    }
    return new Blob([blob], { type: 'audio/wav' });
  }

  async function keepAwake(on) {
    if (isNative && VtsNative) { try { await VtsNative.keepAwake({ on: !!on }); } catch (_) { /* ignore */ } }
  }

  VTS.native = { keepAwake, isNative, saveFile, shareFile, download, speak, stopSpeaking, ttsMode, canTtsToFile, ttsToFile };
}());
