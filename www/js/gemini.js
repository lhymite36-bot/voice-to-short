/* Gemini REST client with model fallback (ported from gemini-notes-chat mobile). No build step. */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {});
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
  // Google limits the 2.x models to projects that already used them, so new keys (AQ.… "auth keys")
  // get 404 "no longer available" or 401 ACCESS_TOKEN_TYPE_UNSUPPORTED on them. Default to a current stable model.
  const DEFAULT_MODEL = 'gemini-3.8-flash';
  const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
  const BUILTIN_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-pro-preview', 'gemini-2.5-flash'];
  const LEGACY_MODEL_RE = /^(models\/)?gemini-(1\.0|1\.5|2\.0|2\.5)(-|$)/i;

  // Host app wires these in (storage + UI).
  const host = {
    getKey: () => '',
    getModel: () => DEFAULT_MODEL,
    setModel: () => {},
    onModelSwitch: () => {},
  };

  function redact(s) {
    return String(s || '').replace(/key=[^&\s]+/gi, 'key=REDACTED').replace(/AIza[0-9A-Za-z\-_]{10,}/g, 'REDACTED_KEY').replace(/\bAQ\.[0-9A-Za-z\-_.]{10,}/g, 'REDACTED_KEY');
  }
  // Always append the raw API status/reason/message so problems can be diagnosed from the phone.
  function friendlyError(err) {
    const base = friendlyBase(err);
    const details = err && err.details ? redact(err.details) : '';
    return details && !base.includes(details) ? base + '\n\nDetails: ' + details : base;
  }
  function friendlyBase(err) {
    const message = redact(err && (err.friendly || err.message) || err);
    if (err && err.friendly) return err.friendly;
    if (err && err.reason === 'ACCESS_TOKEN_TYPE_UNSUPPORTED') {
      return 'Gemini did not accept this key for ' + (err.allTried ? 'any of the models tried' : 'the model' + (err.model ? ' ' + err.model : '')) + '. New AI Studio keys (AQ.…) only work with current models. Tap “Load models from my key” in Settings and pick one.';
    }
    const lower = message.toLowerCase();
    if (lower.includes('api key not valid') || lower.includes('api_key_invalid') || lower.includes('permission denied') || (lower.includes('api key') && (lower.includes('invalid') || lower.includes('expired')))) {
      return 'Gemini rejected the API key. Check the key in Settings.';
    }
    if (lower.includes('quota') || lower.includes('resource_exhausted') || lower.includes('rate limit') || lower.includes('429')) {
      return 'Gemini rate limit or quota was reached. Wait a bit and try again.';
    }
    if ((lower.includes('not found') || lower.includes('404') || lower.includes('not supported') || lower.includes('no longer available')) && lower.includes('model')) {
      return 'That model is not available for this API key. Pick another model in Settings (try “Load models from my key”).';
    }
    if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('network') || lower.includes('load failed') || lower.includes('timeout') || lower.includes('aborted')) {
      return 'Could not reach Gemini. Check your internet connection and try again.';
    }
    if (lower.includes('blocked') || lower.includes('safety')) return 'Gemini blocked that request because of its safety filters.';
    return message.replace(/\s+/g, ' ').trim().slice(0, 400) || 'Gemini request failed.';
  }
  function fail(msg) { const e = new Error(msg); e.friendly = msg; return e; }

  async function geminiRequest(path, init, timeoutMs) {
    const key = host.getKey();
    if (!key) throw fail('Add your Gemini API key in Settings first.');
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs || 90000) : 0;
    let res;
    try {
      res = await fetch(API_BASE + path, Object.assign({}, init, {
        headers: Object.assign({ 'x-goog-api-key': key }, init && init.headers),
        signal: ctrl ? ctrl.signal : undefined,
        referrerPolicy: 'no-referrer',
      }));
    } finally { clearTimeout(timer); }
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    if (!res.ok) {
      const ge = (data && data.error) || {};
      const reasons = (Array.isArray(ge.details) ? ge.details : []).map((d) => d && d.reason).filter(Boolean);
      const msg = ge.message || ge.status || ('HTTP ' + res.status);
      const e = new Error(msg + ' (' + res.status + ')');
      e.status = res.status;
      e.apiStatus = ge.status || '';
      e.reason = reasons[0] || '';
      e.details = ['HTTP ' + res.status, e.apiStatus, reasons.join(', ')].filter(Boolean).join(' ')
        + (ge.message ? ': ' + String(ge.message).replace(/\s+/g, ' ').slice(0, 300) : '');
      throw e;
    }
    return data;
  }
  function isModelUnavailable(err) {
    if (!err || err.friendly) return false;
    const m = String(err.message || '').toLowerCase();
    if (err.status === 404 || err.apiStatus === 'NOT_FOUND') return true;
    if (err.reason === 'ACCESS_TOKEN_TYPE_UNSUPPORTED') return true;
    if (err.reason === 'API_KEY_INVALID' || m.includes('api key not valid')) return false;
    if (!m.includes('model')) return false;
    return m.includes('not found') || m.includes('not available') || m.includes('not supported')
      || m.includes('no longer available') || m.includes('is not enabled') || m.includes('does not have access')
      || m.includes('unsupported') || m.includes('deprecated') || m.includes('retired');
  }
  // Generate with the saved model; if it is unavailable, retry with each fallback model once and save the one that works.
  async function generate(contents, opts) {
    opts = opts || {};
    const first = opts.model || host.getModel();
    try {
      return await generateWith(first, contents, opts);
    } catch (err) {
      if (!isModelUnavailable(err)) throw err;
      let lastErr = err;
      const tried = new Set([first]);
      const hint = /\b(?:use|try|migrate to)\s+(?:models\/)?(gemini-[a-z0-9.-]+[a-z0-9])/i.exec(String(err.message || ''));
      const queue = (hint ? [hint[1]] : []).concat(FALLBACK_MODELS);
      let discovered = false;
      for (let i = 0; i <= queue.length; i++) {
        if (i === queue.length) {
          if (discovered) break;
          discovered = true;
          try { (await listKeyModels()).slice(0, 3).forEach((m) => { if (!tried.has(m)) queue.push(m); }); } catch (_) { /* ignore */ }
          if (i === queue.length) break;
        }
        const fb = queue[i];
        if (tried.has(fb)) continue;
        tried.add(fb);
        try {
          const text = await generateWith(fb, contents, opts);
          if (!opts.model) { host.setModel(fb); host.onModelSwitch(first, fb); }
          return text;
        } catch (e2) {
          lastErr = e2;
          if (!isModelUnavailable(e2)) throw e2;
        }
      }
      if (lastErr && !lastErr.friendly) {
        lastErr.allTried = true;
        lastErr.details = (lastErr.details || lastErr.message) + ' [tried: ' + Array.from(tried).join(', ') + ']';
      }
      throw lastErr;
    }
  }
  async function listKeyModels() {
    const data = await geminiRequest('/models?pageSize=200', { method: 'GET' }, 30000);
    const names = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name || '').replace(/^models\//, ''))
      .filter((n) => /^gemini/i.test(n) && !/embedding|tts|image|live|audio|transcribe|robotics|computer-use/i.test(n));
    const score = (n) => {
      const v = /gemini-(\d+(?:\.\d+)?)/.exec(n); const ver = v ? parseFloat(v[1]) : 0;
      return (/flash/.test(n) ? 100 : 0) + ver * 10 - (/lite/.test(n) ? 5 : 0) - (/preview|exp/.test(n) ? 3 : 0) - (LEGACY_MODEL_RE.test(n) ? 1000 : 0);
    };
    return names.sort((a, b) => score(b) - score(a));
  }
  async function generateWith(model, contents, opts) {
    const gen = { temperature: opts.temperature ?? 0.8, maxOutputTokens: 8192 };
    if (opts.json) gen.responseMimeType = 'application/json';
    if (opts.schema) gen.responseSchema = opts.schema;
    const body = { contents, generationConfig: gen };
    if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
    const send = (b) => geminiRequest('/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
    }, opts.timeout || 90000);
    let data;
    try {
      try {
        data = await send(body);
      } catch (err) {
        const m = String(err && err.message || '').toLowerCase();
        if (opts.system && (m.includes('systeminstruction') || m.includes('system instruction') || m.includes('developer instruction'))) {
          delete body.systemInstruction;
          body.contents = [{ role: 'user', parts: [{ text: opts.system + '\n\n' + contents.map((c) => c.parts.map((p) => p.text).join('')).join('\n\n') }] }];
          data = await send(body);
        } else if (err && err.status === 400 && (m.includes('schema') || m.includes('response_mime') || m.includes('responsemimetype') || m.includes('json mode'))) {
          // Structured output not supported by this model: fall back to plain JSON-by-prompt.
          delete gen.responseSchema; delete gen.responseMimeType;
          data = await send(body);
        } else throw err;
      }
    } catch (err) {
      if (err && !err.friendly) { err.model = model; if (err.details) err.details += ' [model: ' + model + ']'; }
      throw err;
    }
    const cand = data && data.candidates && data.candidates[0];
    const text = cand && cand.content && Array.isArray(cand.content.parts)
      ? cand.content.parts.filter((p) => !p.thought).map((p) => p.text || '').join('').trim() : '';
    if (text) return text;
    const blocked = data && data.promptFeedback && data.promptFeedback.blockReason;
    if (blocked) throw fail('Gemini blocked that request (' + blocked + ').');
    if (cand && cand.finishReason === 'SAFETY') throw fail('Gemini blocked that reply because of its safety filters.');
    throw fail('Gemini returned an empty response.');
  }

  // ================= Text-to-speech (Gemini native TTS) =================
  // Current docs (Sep 2026): gemini-3.8-flash-tts and gemini-3.8-flash-lite-tts (GenerateContent + Interactions APIs),
  // older gemini-3.1-flash-tts-preview and 2.5 preview TTS models (may be unavailable to new AQ. keys, like 2.x chat models).
  const TTS_DEFAULT_MODEL = 'gemini-3.8-flash-tts';
  const TTS_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts'];
  // The 30 documented prebuilt voices (name, character).
  const TTS_VOICES = [
    ['Sulafat', 'Warm'], ['Achernar', 'Soft'], ['Vindemiatrix', 'Gentle'], ['Charon', 'Informative'], ['Kore', 'Firm'], ['Gacrux', 'Mature'],
    ['Aoede', 'Breezy'], ['Puck', 'Upbeat'], ['Zephyr', 'Bright'], ['Fenrir', 'Excitable'], ['Leda', 'Youthful'], ['Orus', 'Firm'],
    ['Callirrhoe', 'Easy-going'], ['Autonoe', 'Bright'], ['Enceladus', 'Breathy'], ['Iapetus', 'Clear'], ['Umbriel', 'Easy-going'], ['Algieba', 'Smooth'],
    ['Despina', 'Smooth'], ['Erinome', 'Clear'], ['Algenib', 'Gravelly'], ['Rasalgethi', 'Informative'], ['Laomedeia', 'Upbeat'], ['Alnilam', 'Firm'],
    ['Schedar', 'Even'], ['Pulcherrima', 'Forward'], ['Achird', 'Friendly'], ['Zubenelgenubi', 'Casual'], ['Sadachbia', 'Lively'], ['Sadaltager', 'Knowledgeable'],
  ];
  // 3.8+ TTS reads text verbatim, so delivery goes in speech_metadata.style. Older TTS models take a spoken-style prefix instead.
  const ttsIsStructured = (m) => { const v = /gemini-(\d+(?:\.\d+)?)/.exec(m); return !v || parseFloat(v[1]) >= 3.5; };
  function isTtsModelUnavailable(err) {
    if (isModelUnavailable(err)) return true;
    const m = String(err && err.message || '').toLowerCase();
    return !!err && !err.friendly && err.status === 400 && (m.includes('modalit') || m.includes('audio output') || m.includes('speech_config') || m.includes('speechconfig'));
  }
  const isQuota = (err) => !!err && (err.status === 429 || err.apiStatus === 'RESOURCE_EXHAUSTED' || /quota|rate limit|resource_exhausted/i.test(String(err.message || '')));
  function b64ToBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  // Accepts a WAV (RIFF) or headerless 16-bit PCM (audio/L16;rate=24000) payload and returns raw PCM + format.
  function toPcm(bytes, mime) {
    const str = (o, n) => String.fromCharCode.apply(null, bytes.subarray(o, o + n));
    if (bytes.length > 44 && str(0, 4) === 'RIFF' && str(8, 4) === 'WAVE') {
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let rate = 24000; let channels = 1; let bits = 16; let off = 12;
      while (off + 8 <= bytes.length) {
        const id = str(off, 4); let size = dv.getUint32(off + 4, true);
        if (id === 'fmt ') { channels = dv.getUint16(off + 10, true); rate = dv.getUint32(off + 12, true); bits = dv.getUint16(off + 22, true); }
        if (id === 'data') { if (size === 0xFFFFFFFF || off + 8 + size > bytes.length) size = bytes.length - off - 8; return { pcm: bytes.subarray(off + 8, off + 8 + size), rate, channels, bits }; }
        off += 8 + size + (size & 1);
      }
      return { pcm: bytes.subarray(44), rate, channels, bits };
    }
    const r = /rate=(\d+)/i.exec(mime || ''); const c = /channels=(\d+)/i.exec(mime || '');
    return { pcm: bytes, rate: r ? Number(r[1]) : 24000, channels: c ? Number(c[1]) : 1, bits: 16 };
  }
  function pcmToWav(parts, rate, channels, gapSec) {
    const bytesPerFrame = 2 * channels;
    const gap = Math.round((gapSec || 0) * rate) * bytesPerFrame;
    const total = parts.reduce((a, p) => a + (p.length - (p.length % bytesPerFrame)), 0) + gap * Math.max(0, parts.length - 1);
    const out = new Uint8Array(44 + total); const dv = new DataView(out.buffer);
    const w = (o, t) => { for (let i = 0; i < t.length; i++) out[o + i] = t.charCodeAt(i); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + total, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
    dv.setUint16(22, channels, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate * bytesPerFrame, true); dv.setUint16(32, bytesPerFrame, true); dv.setUint16(34, 16, true);
    w(36, 'data'); dv.setUint32(40, total, true);
    let o = 44;
    parts.forEach((p, i) => { if (i > 0) o += gap; const len = p.length - (p.length % bytesPerFrame); out.set(p.subarray(0, len), o); o += len; });
    return new Blob([out], { type: 'audio/wav' });
  }
  // Split long scripts at sentence boundaries (each request stays short and reliable).
  function ttsChunks(text, maxWords) {
    maxWords = maxWords || 120;
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.split(' ').length <= maxWords) return [clean];
    const sentences = clean.match(/[^.!?…]+[.!?…]*["”’)]?\s*/g) || [clean];
    const out = []; let cur = '';
    for (const s of sentences) {
      if (cur && (cur + s).trim().split(/\s+/).length > maxWords * 0.75) { out.push(cur.trim()); cur = ''; }
      cur += s;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  async function listTtsModels() {
    const data = await geminiRequest('/models?pageSize=200', { method: 'GET' }, 30000);
    const names = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name || '').replace(/^models\//, ''))
      .filter((n) => /^gemini/i.test(n) && /tts/i.test(n));
    const score = (n) => { const v = /gemini-(\d+(?:\.\d+)?)/.exec(n); return (v ? parseFloat(v[1]) : 0) * 10 - (/lite/.test(n) ? 2 : 0) - (/preview/.test(n) ? 3 : 0) - (/pro/.test(n) ? 1 : 0); };
    return names.sort((a, b) => score(b) - score(a));
  }
  async function ttsWith(model, text, o) {
    const structured = ttsIsStructured(model);
    const part = { text };
    if (structured && o.style) part.speech_metadata = { style: o.style };
    if (!structured && o.prefix) part.text = o.prefix.replace(/:?\s*$/, ': ') + text;
    const body = {
      contents: [{ role: 'user', parts: [part] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: o.voice || 'Sulafat' } } } },
    };
    const send = () => geminiRequest('/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }, o.timeout || 120000);
    let data;
    try {
      try { data = await send(); } catch (err) {
        const m = String(err && err.message || '').toLowerCase();
        if (err && err.status === 400 && part.speech_metadata && (m.includes('speech_metadata') || m.includes('unknown name') || m.includes('invalid json'))) {
          delete part.speech_metadata; data = await send(); // style metadata not accepted: plain verbatim text
        } else throw err;
      }
    } catch (err) {
      if (err && !err.friendly) { err.model = model; if (err.details) err.details += ' [model: ' + model + ']'; }
      throw err;
    }
    const cand = data && data.candidates && data.candidates[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    const audio = parts.map((p) => p.inlineData || p.inline_data).find((d) => d && d.data);
    if (!audio) {
      const blocked = data && data.promptFeedback && data.promptFeedback.blockReason;
      const e = fail(blocked ? 'Gemini blocked that text (' + blocked + ').' : 'Gemini returned no audio for this text.');
      e.details = 'model ' + model + (cand && cand.finishReason ? ', finishReason ' + cand.finishReason : '');
      throw e;
    }
    return toPcm(b64ToBytes(audio.data), audio.mimeType || audio.mime_type || '');
  }
  // One TTS request with the model fallback chain. host.getTtsModel/setTtsModel remember the model that works.
  async function ttsRequest(text, o) {
    const first = o.model || (host.getTtsModel ? host.getTtsModel() : '') || TTS_DEFAULT_MODEL;
    const queue = [first].concat(TTS_MODELS);
    const tried = new Set(); let lastErr = null; let discovered = false; let quotaHit = false;
    for (let i = 0; i <= queue.length; i++) {
      if (i === queue.length) {
        if (discovered) break;
        discovered = true;
        try { (await listTtsModels()).slice(0, 4).forEach((m) => { if (!tried.has(m)) queue.push(m); }); } catch (_) { /* ignore */ }
        if (i === queue.length) break;
      }
      const model = queue[i];
      if (tried.has(model)) continue;
      tried.add(model);
      try {
        const out = await ttsWith(model, text, o);
        if (model !== first && host.setTtsModel) { host.setTtsModel(model); if (host.onTtsModelSwitch) host.onTtsModelSwitch(first, model); }
        out.model = model;
        return out;
      } catch (err) {
        lastErr = err;
        if (isQuota(err)) { quotaHit = true; continue; } // quotas are per model: try the next one once
        if (!isTtsModelUnavailable(err)) throw err;
        if (i === 0) { const hint = /\b(?:use|try|migrate to)\s+(?:models\/)?(gemini-[a-z0-9.-]+tts[a-z0-9.-]*)/i.exec(String(err.message || '')); if (hint && !tried.has(hint[1])) queue.splice(1, 0, hint[1]); }
      }
    }
    if (quotaHit) {
      const e = fail('Gemini’s AI voice quota is used up for now (the free tier allows only a limited number of voice generations per minute and per day). Try again in a few minutes or tomorrow — or record your own voice, which is free and unlimited.');
      e.details = redact((lastErr && lastErr.details) || (lastErr && lastErr.message) || 'HTTP 429') + ' [tried: ' + Array.from(tried).join(', ') + ']';
      e.quota = true;
      throw e;
    }
    if (lastErr && !lastErr.friendly) {
      lastErr.allTried = true;
      lastErr.details = (lastErr.details || lastErr.message) + ' [tried: ' + Array.from(tried).join(', ') + ']';
      if (isTtsModelUnavailable(lastErr)) lastErr.friendly = 'None of the Gemini voice models are available for this API key. Record your own voice or use the device voice instead.';
    }
    throw lastErr || fail('Gemini voice failed.');
  }
  // Full script -> WAV Blob (chunked + concatenated when long).
  async function generateSpeech(text, o) {
    o = o || {};
    const chunks = ttsChunks(text, o.maxWords || 120);
    const pcm = []; let fmt = null; let model = '';
    for (let i = 0; i < chunks.length; i++) {
      if (o.onProgress) o.onProgress(i, chunks.length);
      const r = await ttsRequest(chunks[i], Object.assign({}, o, { model: model || o.model }));
      model = r.model;
      if (!fmt) fmt = r; else if (r.rate !== fmt.rate || r.channels !== fmt.channels) throw fail('Gemini returned mismatched audio formats between parts. Try again.');
      pcm.push(r.pcm);
    }
    return { blob: pcmToWav(pcm, fmt.rate, fmt.channels, chunks.length > 1 ? 0.18 : 0), model, chunks: chunks.length, rate: fmt.rate };
  }

  VTS.gemini = { generateSpeech, ttsRequest, listTtsModels, ttsChunks, toPcm, pcmToWav, TTS_MODELS, TTS_VOICES, TTS_DEFAULT_MODEL, ttsIsStructured, host, generate, listKeyModels, friendlyError, fail, redact, DEFAULT_MODEL, BUILTIN_MODELS, FALLBACK_MODELS, LEGACY_MODEL_RE };
}());
