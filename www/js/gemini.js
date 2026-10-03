/* Gemini REST client with model fallback (ported from gemini-notes-chat mobile). No build step. */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {});
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
  // Google limits the 2.x models to projects that already used them, so new keys (AQ.… "auth keys")
  // get 404 "no longer available" or 401 ACCESS_TOKEN_TYPE_UNSUPPORTED on them. Default to a current stable model.
  const DEFAULT_MODEL = 'gemini-3.8-flash';
  const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite'];
  const BUILTIN_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview'];
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
    if (err && err.timeout) return 'Gemini took too long to answer' + (err.allTried ? ' on every model tried' : '') + '. Google’s free models are slow or busy right now — wait a minute and try again (keep the app open while it writes).';
    if (err && err.interrupted) return 'Gemini’s reply was interrupted before it fully arrived (weak signal or the app went to the background). Try again with the app open.';
    if (err && (err.status === 429 || err.apiStatus === 'RESOURCE_EXHAUSTED')) return 'Google’s free limit for this API key is used up for the moment' + (err.allTried ? ' on every model tried' : '') + '. Wait a minute (or until tomorrow if it keeps happening) and try again.';
    if (err && (err.status === 503 || err.apiStatus === 'UNAVAILABLE') || lower.includes('high demand') || lower.includes('overloaded')) {
      return 'Gemini is overloaded right now (Google returned “high demand”' + (err && err.allTried ? ' for every model tried' : '') + '). Wait a minute and try again.';
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
    let res; let data = null; let bodyErr = null;
    try {
      try {
        res = await fetch(API_BASE + path, Object.assign({}, init, {
          headers: Object.assign({ 'x-goog-api-key': key }, init && init.headers),
          signal: ctrl ? ctrl.signal : undefined,
          referrerPolicy: 'no-referrer',
        }));
        // Read the body inside the timer too: on phones a reply can stall or drop half-way (screen off, weak signal).
        try { data = await res.json(); } catch (e) { data = null; bodyErr = e; }
      } catch (err) {
        if (err && err.name === 'AbortError') {
          const e = new Error('Gemini took too long to answer (no reply after ' + Math.round((timeoutMs || 90000) / 1000) + ' s).');
          e.status = 504; e.timeout = true; e.details = 'timeout after ' + Math.round((timeoutMs || 90000) / 1000) + ' s'; throw e;
        }
        throw err;
      }
    } finally { clearTimeout(timer); }
    if (res.ok && !data && bodyErr) {
      const e = new Error('Gemini’s reply was interrupted before it fully arrived.');
      e.status = 502; e.interrupted = true; e.details = 'HTTP 200 but the body could not be read' + (bodyErr && bodyErr.name === 'AbortError' ? ' (timeout while downloading)' : '');
      throw e;
    }
    if (!res.ok) {
      const ge = (data && data.error) || {};
      const reasons = (Array.isArray(ge.details) ? ge.details : []).map((d) => d && d.reason).filter(Boolean);
      const msg = ge.message || ge.status || ('HTTP ' + res.status);
      const e = new Error(msg + ' (' + res.status + ')');
      e.status = res.status;
      e.apiStatus = ge.status || '';
      e.reason = reasons[0] || '';
      const rd = (Array.isArray(ge.details) ? ge.details : []).map((d) => d && d.retryDelay).find(Boolean);
      if (rd) e.retryAfter = parseFloat(rd) || 0; // seconds, from google.rpc.RetryInfo
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
  // Google's temporary overload ("This model is currently experiencing high demand", 503/500/UNAVAILABLE) or a
  // per-model free-tier quota (429). Other models are often fine, so the chain tries them — but the working one is NOT saved as the new default.
  function isOverloaded(err) {
    if (!err || err.friendly) return false;
    const m = String(err.message || '').toLowerCase();
    return err.status === 503 || err.status === 500 || err.status === 502 || err.status === 504 || err.status === 429 || err.apiStatus === 'RESOURCE_EXHAUSTED' || err.apiStatus === 'UNAVAILABLE' || err.apiStatus === 'INTERNAL' || m.includes('high demand') || m.includes('overloaded');
  }
  // Models that just answered 429/503 are skipped for a short while (in memory only), so the next request of a long
  // job goes straight to a model that works instead of waiting on the busy one again.
  const cooling = new Map();
  function coolDown(model, err) { cooling.set(model, Date.now() + (err && err.retryAfter ? Math.min(120, err.retryAfter) * 1000 : err && err.status === 429 ? 60000 : 30000)); }
  function isCooling(model) { const t = cooling.get(model); if (!t) return false; if (Date.now() > t) { cooling.delete(model); return false; } return true; }
  // Empty replies (HTTP 200, but no text). kind: safety | blocked (prompt) | recitation | empty (OTHER/STOP-without-text/no candidates).
  const SAFETY_FINISH = ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'IMAGE_SAFETY'];
  function isEmptyReply(err) { return !!(err && err.emptyReply && err.emptyReply !== 'blocked'); }
  // When several models fail differently, report the most telling reason: a safety block beats an empty reply,
  // which beats "busy" (so the user learns that humour level, not Google's load, is the problem).
  function pickWorse(a, b) {
    const rank = (e) => !e ? -1 : e.emptyReply === 'safety' || e.emptyReply === 'blocked' ? 4 : e.emptyReply === 'recitation' ? 3 : e.emptyReply ? 2 : 1;
    return rank(b) >= rank(a) ? b : a;
  }
  function emptyReplyError(data, cand, model) {
    const fin = cand && cand.finishReason; const block = data && data.promptFeedback && data.promptFeedback.blockReason;
    let kind = 'empty'; let msg;
    if (block) { kind = 'blocked'; msg = 'Gemini blocked this request for safety (' + block + '). Try a lower humour level or reword the idea.'; }
    else if (SAFETY_FINISH.includes(fin)) { kind = 'safety'; msg = 'Gemini blocked this script for safety (' + fin + '). Try a lower humour level (e.g. “Funny” instead of “Unhinged”) or reword the idea.'; }
    else if (fin === 'RECITATION') { kind = 'recitation'; msg = 'Gemini stopped because the reply looked too close to existing text (RECITATION). Tap “Write my Short” again or reword the idea.'; }
    else msg = 'Gemini sent back an empty reply' + (fin && fin !== 'STOP' ? ' (' + fin + ')' : '') + '. This usually clears up — tap “Write my Short” again in a minute.';
    const e = new Error(msg); e.friendly = msg; e.emptyReply = kind; e.model = model;
    e.details = 'empty reply: ' + (block ? 'promptFeedback.blockReason ' + block : 'finishReason ' + (fin || 'none') + (data && data.candidates ? '' : ', no candidates')) + ' [model: ' + model + ']';
    return e;
  }
  // Generate with the saved model; if it is unavailable, retry with each fallback model once and save the one that works.
  async function generate(contents, opts) {
    opts = opts || {};
    const first = opts.model || host.getModel(); const t0 = Date.now();
    try {
      if (!opts.model && isCooling(first) && FALLBACK_MODELS.some((q) => q !== first && !isCooling(q))) { const e = new Error('model cooling down'); e.status = 503; e.cooling = true; throw e; }
      return await generateWith(first, contents, opts);
    } catch (err) {
      if (!err.cooling && isOverloaded(err) && !err.timeout) coolDown(first, err);
      // 400 INVALID_ARGUMENT etc. is a problem with the request itself: surface it, never hide it behind other models.
      // An empty reply (no text, finishReason OTHER/SAFETY/RECITATION/...) is worth one try on each other model.
      const busy = isOverloaded(err) || isEmptyReply(err);
      if (!busy && !isModelUnavailable(err)) throw err;
      let lastErr = err; let onlyBusy = busy;
      const tried = new Set([first]);
      const hint = /\b(?:use|try|migrate to)\s+(?:models\/)?(gemini-[a-z0-9.-]+[a-z0-9])/i.exec(String(err.message || ''));
      const queue = (hint ? [hint[1]] : []).concat(FALLBACK_MODELS);
      let discovered = false; let safetyHops = 0;
      for (let i = 0; i <= queue.length; i++) {
        if (i === queue.length) {
          if (discovered) break;
          discovered = true;
          try { (await listKeyModels()).slice(0, 3).forEach((m) => { if (!tried.has(m)) queue.push(m); }); } catch (_) { /* ignore */ }
          if (i === queue.length) break;
        }
        const fb = queue[i];
        if (tried.has(fb)) continue;
        if (opts.budgetMs && Date.now() - t0 > opts.budgetMs) break; // don't keep a phone waiting for many minutes
        tried.add(fb);
        if (isCooling(fb) && queue.slice(i + 1).some((q) => !tried.has(q) && !isCooling(q))) continue;
        try {
          const text = await generateWith(fb, contents, opts);
          if (!opts.model && !onlyBusy) { host.setModel(fb); host.onModelSwitch(first, fb); }
          else if (host.onBusyFallback) host.onBusyFallback(first, fb);
          return text;
        } catch (e2) {
          lastErr = pickWorse(lastErr, e2);
          // Safety blocks follow the content, not the model: after two models said SAFETY, let the caller soften the request.
          if (isEmptyReply(e2) && e2.emptyReply === 'safety' && (err.emptyReply === 'safety' || ++safetyHops >= 2)) break;
          if (isEmptyReply(e2)) continue;
          if (isOverloaded(e2)) { if (!e2.timeout) coolDown(fb, e2); continue; }
          if (!isModelUnavailable(e2)) throw e2;
          onlyBusy = false;
        }
      }
      if (lastErr && (!lastErr.friendly || isEmptyReply(lastErr))) {
        lastErr.allTried = true; lastErr.tried = Array.from(tried);
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
    const gen = { temperature: opts.temperature ?? 0.8, maxOutputTokens: opts.maxTokens || 8192 };
    // Thinking tokens count against maxOutputTokens: a busy-fallback model that "thinks" 13k tokens truncated
    // 2-min scripts (finishReason MAX_TOKENS). Script calls ask for low thinking; unsupported forms are dropped below.
    const thinkCfg = (lvl) => (/gemini-(?:[3-9]|\d\d)|flash-latest|flash-lite-latest|pro-latest/.test(model) ? { thinkingLevel: lvl } : { thinkingBudget: lvl === 'high' ? -1 : 1024 });
    if (opts.think) gen.thinkingConfig = thinkCfg(opts.think);
    if (opts.json) gen.responseMimeType = 'application/json';
    if (opts.schema) gen.responseSchema = opts.schema;
    const body = { contents, generationConfig: gen };
    if (opts.safety) body.safetySettings = SAFETY_CATS.map((category) => ({ category, threshold: opts.safety }));
    if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
    const send = (b) => geminiRequest('/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
    }, opts.timeout || 90000);
    let data;
    try {
      try {
        try {
          data = await send(body);
        } catch (err) {
          const m = String(err && err.message || '').toLowerCase();
          if (err && err.status === 400 && gen.thinkingConfig && /thinking/.test(m)) {
            // e.g. "Thinking level MINIMAL is not supported for this model" / thinking_budget unsupported: try the other form, then none.
            gen.thinkingConfig = gen.thinkingConfig.thinkingLevel ? { thinkingBudget: 1024 } : undefined;
            if (!gen.thinkingConfig) delete gen.thinkingConfig;
            try { data = await send(body); } catch (e2) {
              if (!(e2 && e2.status === 400 && gen.thinkingConfig && /thinking/.test(String(e2.message || '').toLowerCase()))) throw e2;
              delete gen.thinkingConfig; data = await send(body);
            }
          } else if (err && err.status === 400 && gen.maxOutputTokens > 8192 && /max_?output_?tokens|maxoutputtokens|output token/.test(m)) {
            gen.maxOutputTokens = 8192; data = await send(body);
          } else throw err;
        }
      } catch (err) {
        const m = String(err && err.message || '').toLowerCase();
        if (opts.system && (m.includes('systeminstruction') || m.includes('system instruction') || m.includes('developer instruction'))) {
          delete body.systemInstruction;
          body.contents = [{ role: 'user', parts: [{ text: opts.system + '\n\n' + contents.map((c) => c.parts.map((p) => p.text).join('')).join('\n\n') }] }];
          data = await send(body);
        } else if (err && err.status === 400 && body.safetySettings && /safety|harm/.test(m)) {
          delete body.safetySettings; data = await send(body);
        } else if (err && err.status === 400 && gen.responseSchema && (err.apiStatus === 'INVALID_ARGUMENT' || m.includes('schema') || m.includes('invalid argument'))) {
          // Google rejects schemas it finds too large/complex with a bare "Request contains an invalid argument".
          // The prompt already describes the JSON shape, so retry once with JSON mode only (parsed + validated locally).
          delete gen.responseSchema;
          data = await send(body);
        } else if (err && err.status === 400 && (m.includes('response_mime') || m.includes('responsemimetype') || m.includes('json mode'))) {
          delete gen.responseSchema; delete gen.responseMimeType;
          data = await send(body);
        } else throw err;
      }
    } catch (err) {
      if (err && !err.friendly) { err.model = model; if (err.details) err.details += ' [model: ' + model + ']'; }
      throw err;
    }
    const read = (d) => { const c = d && d.candidates && d.candidates[0]; return { cand: c, text: c && c.content && Array.isArray(c.content.parts) ? c.content.parts.filter((p) => !p.thought).map((p) => p.text || '').join('').trim() : '' }; };
    let { cand, text } = read(data);
    if (!text && !(cand && cand.finishReason === 'MAX_TOKENS') && !(data && data.promptFeedback && data.promptFeedback.blockReason) && opts.emptyRetry !== false) {
      // Empty reply: wait a moment, then ask once more on this model with thinking turned down and safety relaxed
      // (only the four adjustable categories; PROHIBITED_CONTENT cannot be relaxed). Any 400 -> keep the original config.
      if (host.onEmptyRetry) { try { host.onEmptyRetry(model, cand && cand.finishReason); } catch (_) { /* ignore */ } }
      await sleep(opts.emptyBackoff ?? (host.emptyBackoffMs ?? 1500));
      const first = data; const g2 = Object.assign({}, gen, { temperature: Math.min(1.2, (gen.temperature || 0.8) + 0.15) });
      if (/flash/.test(model) && !/lite/.test(model)) g2.thinkingConfig = { thinkingBudget: 0 }; else if (gen.thinkingConfig) g2.thinkingConfig = gen.thinkingConfig;
      const b2 = Object.assign({}, body, { generationConfig: g2, safetySettings: SAFETY_CATS.map((category) => ({ category, threshold: 'BLOCK_NONE' })) });
      try { data = await send(b2); } catch (err) {
        if (err && err.status === 400) { try { data = await send(Object.assign({}, body, { generationConfig: gen })); } catch (e3) { data = first; } }
        else if (isOverloaded(err)) { err.model = model; throw err; } else data = first;
      }
      ({ cand, text } = read(data));
      if (!text && !(cand && cand.finishReason === 'MAX_TOKENS')) { const firstErr = emptyReplyError(first, read(first).cand, model); const e2 = emptyReplyError(data, cand, model); throw pickWorse(firstErr, e2); }
    }
    if (opts.onMeta) { try { opts.onMeta({ model, finishReason: cand && cand.finishReason, usage: data && data.usageMetadata, chars: text.length }); } catch (_) { /* ignore */ } }
    if (text) return text;
    if (cand && cand.finishReason === 'MAX_TOKENS') { const e = fail('Gemini ran out of room before writing the reply.'); e.truncated = true; e.details = 'finishReason MAX_TOKENS, model ' + model; throw e; }
    throw emptyReplyError(data, cand, model);
  }
  const SAFETY_CATS = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT'];

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
    const multi = Array.isArray(o.speakers) && o.speakers.length === 2;
    const part = { text };
    let reqParts = [part];
    if (multi && structured && Array.isArray(o.lines) && o.lines.length) {
      // 3.8+ TTS: one part per turn with speech_metadata.speaker (+ that speaker's turn style); text stays verbatim.
      const styleOf = (who) => { const sp = o.speakers.find((x) => x.speaker === who); return (sp && sp.style) || o.style || ''; };
      reqParts = o.lines.map((l) => { const md = { speaker: l.speaker }; const st = styleOf(l.speaker); if (st) md.style = st; return { text: String(l.text).replace(/\s+/g, ' ').trim(), speech_metadata: md }; });
    } else if (multi) {
      // Older TTS models: "Name: line" per line, with an instruction naming both speakers.
      part.text = 'TTS the following conversation between ' + o.speakers[0].speaker + ' and ' + o.speakers[1].speaker + (o.style ? ' (' + o.style + ')' : '') + ':\n' + text;
    } else {
      if (structured && o.style) part.speech_metadata = { style: o.style };
      if (!structured && o.prefix) part.text = o.prefix.replace(/:?\s*$/, ': ') + text;
    }
    const speechConfig = multi
      ? { multiSpeakerVoiceConfig: { speakerVoiceConfigs: o.speakers.map((sp) => ({ speaker: sp.speaker, voiceConfig: { prebuiltVoiceConfig: { voiceName: sp.voice } } })) } }
      : { voiceConfig: { prebuiltVoiceConfig: { voiceName: o.voice || 'Sulafat' } } };
    const body = {
      contents: [{ role: 'user', parts: reqParts }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig },
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
    const tried = new Set(); let lastErr = null; let discovered = false; let quotaHit = false; let busyHit = false;
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
      if (isCooling(model) && queue.slice(i + 1).some((q) => !tried.has(q) && !isCooling(q))) continue;
      try {
        const out = await ttsWith(model, text, o);
        if (model !== first && host.setTtsModel && !busyHit) { host.setTtsModel(model); if (host.onTtsModelSwitch) host.onTtsModelSwitch(first, model); }
        out.model = model;
        return out;
      } catch (err) {
        lastErr = err;
        if (isQuota(err)) { quotaHit = true; coolDown(model, err); continue; } // quotas are per model: try the next one once
        if (isOverloaded(err)) { busyHit = true; coolDown(model, err); continue; } // Google overloaded: try the next voice model
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
  // ---------- long jobs: retry with backoff, chunk cache ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const transient = (err) => !!err && (err.status === 429 || err.status >= 500 || err.name === 'AbortError' || err.name === 'TypeError' || isQuota(err));
  // Retries rate limits / server errors with exponential backoff (honours the API's retryDelay). Daily-quota errors
  // still fail after the last try, but every finished piece is kept by the caller so nothing restarts from zero.
  async function withRetry(fn, o) {
    o = o || {}; const tries = o.tries || 5; let wait = o.base || 4000;
    for (let i = 0; ; i++) {
      try { return await fn(i); } catch (err) {
        if (i >= tries - 1 || !transient(err) || (o.signal && o.signal.aborted)) throw err;
        const ms = Math.min(o.max || 65000, Math.max(wait, (err.retryAfter || 0) * 1000 + 500));
        if (o.onWait) o.onWait(ms, i + 1, err);
        await sleep(ms); wait *= 2;
      }
    }
  }
  function hashText(t) { let h1 = 0x811c9dc5; let h2 = 0; for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = (h2 * 31 + c) >>> 0; } return h1.toString(36) + h2.toString(36) + t.length.toString(36); }
  // Long scripts: one TTS request per section/paragraph. Each finished chunk goes to o.cache (IndexedDB) right away,
  // so a failure or quota stop resumes from the first missing chunk. Returns raw PCM parts (no giant WAV in memory).
  async function speechChunks(texts, o) {
    o = o || {}; const out = []; let model = ''; let fmt = null;
    for (let i = 0; i < texts.length; i++) {
      const key = 'tts:' + hashText([o.voice || '', o.style || '', o.prefix || '', texts[i]].join('|'));
      let hit = o.cache ? await o.cache.get(key) : null;
      if (hit && hit.pcm) { out.push(hit); if (o.onProgress) o.onProgress(i + 1, texts.length, true); continue; }
      if (o.onProgress) o.onProgress(i, texts.length, false);
      const r = await withRetry(() => ttsRequest(texts[i], Object.assign({}, o, { model: model || o.model })), { tries: o.tries || 4, base: 5000, signal: o.signal, onWait: o.onWait });
      model = r.model; if (!fmt) fmt = r;
      hit = { pcm: new Blob([r.pcm]), rate: r.rate, channels: r.channels, text: texts[i], model };
      if (o.cache) await o.cache.set(key, hit);
      out.push(hit); if (o.onProgress) o.onProgress(i + 1, texts.length, false);
    }
    return { parts: out, model };
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
  // Two-voice dialogue ("Brain vs Me"): lines = [{speaker:'You'|'Brain', text}], speakers = [{speaker, voice}, {speaker, voice}].
  // Chunks on line boundaries so every chunk keeps its speaker labels.
  function dialogueChunks(lines, maxWords) {
    const out = []; let cur = []; let n = 0;
    lines.forEach((l) => { const w = String(l.text).split(/\s+/).length; if (cur.length && n + w > (maxWords || 110)) { out.push(cur); cur = []; n = 0; } cur.push(l); n += w; });
    if (cur.length) out.push(cur);
    return out;
  }
  async function generateDialogueSpeech(lines, o) {
    o = o || {};
    const chunks = dialogueChunks(lines, o.maxWords || 110);
    const pcm = []; let fmt = null; let model = '';
    for (let i = 0; i < chunks.length; i++) {
      if (o.onProgress) o.onProgress(i, chunks.length);
      const text = chunks[i].map((l) => l.speaker + ': ' + String(l.text).replace(/\s+/g, ' ').trim()).join('\n');
      const r = await ttsRequest(text, Object.assign({}, o, { model: model || o.model, lines: chunks[i] }));
      model = r.model;
      if (!fmt) fmt = r; else if (r.rate !== fmt.rate || r.channels !== fmt.channels) throw fail('Gemini returned mismatched audio formats between parts. Try again.');
      pcm.push(r.pcm);
    }
    return { blob: pcmToWav(pcm, fmt.rate, fmt.channels, chunks.length > 1 ? 0.12 : 0), model, chunks: chunks.length, rate: fmt.rate, dialogue: true };
  }


  // ---------- AI illustrations (Gemini native image generation, "Nano Banana") ----------
  // Sep 2026 lineup. Image models have NO free tier (billing-enabled keys only); failures fall back to built-in scenes.
  const IMAGE_MODELS = ['gemini-3.1-flash-lite-image', 'gemini-3.1-flash-image', 'gemini-3-pro-image', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview', 'gemini-2.5-flash-image'];
  function b64ToBlob(b64, mime) { return new Blob([b64ToBytes(b64)], { type: mime || 'image/png' }); }
  async function imageWith(model, prompt, o) {
    const gen = { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: o.aspectRatio || '9:16' } };
    const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: gen };
    const send = () => geminiRequest('/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }, o.timeout || 120000);
    let data;
    try {
      try { data = await send(); } catch (err) {
        const m = String(err && err.message || '').toLowerCase();
        if (err && err.status === 400 && (m.includes('imageconfig') || m.includes('image_config') || m.includes('aspect'))) { delete gen.imageConfig; data = await send(); }
        else if (err && err.status === 400 && m.includes('modalit')) { gen.responseModalities = ['TEXT', 'IMAGE']; data = await send(); }
        else throw err;
      }
    } catch (err) { if (err && !err.friendly) { err.model = model; err.details = (err.details || err.message) + ' [model: ' + model + ']'; } throw err; }
    const cand = data && data.candidates && data.candidates[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    const img = parts.map((p) => p.inlineData || p.inline_data).find((d) => d && d.data);
    if (!img) {
      const why = (cand && cand.finishReason) || (data && data.promptFeedback && data.promptFeedback.blockReason) || 'no image in response';
      const e = fail('Gemini did not return an illustration.'); e.details = 'Model ' + model + ': ' + why; e.noImage = true; throw e;
    }
    return b64ToBlob(img.data, img.mimeType || img.mime_type || 'image/png');
  }
  // prompt -> Blob. Tries the remembered model then the chain; quota/permission/unavailable -> next model once.
  async function generateImage(prompt, o) {
    o = o || {};
    const first = o.model || (host.getImageModel ? host.getImageModel() : '') || IMAGE_MODELS[0];
    const queue = [first].concat(IMAGE_MODELS.filter((m) => m !== first));
    let lastErr = null; let quotaHit = false; const tried = [];
    for (const model of queue) {
      tried.push(model);
      try {
        const blob = await imageWith(model, prompt, o);
        if (host.setImageModel && model !== first) host.setImageModel(model);
        blob.model = model;
        return blob;
      } catch (err) {
        lastErr = err;
        if (err && (err.reason === 'API_KEY_INVALID' || /api key not valid/i.test(err.message || ''))) break;
        if (err && err.name === 'AbortError') break;
        if (isQuota(err)) { quotaHit = true; continue; }
        if (err && err.noImage) continue;
        if (err && (err.status === 403 || err.status === 404 || err.status === 400 || isModelUnavailable(err))) continue;
        break;
      }
    }
    const e = fail(quotaHit ? 'AI illustrations are not available on this key right now (image generation has no free tier, or its quota is used up). Using the built-in animated scenes instead.'
      : 'AI illustrations are not available for this API key. Using the built-in animated scenes instead.');
    e.details = redact((lastErr && (lastErr.details || lastErr.message)) || 'unknown') + ' [tried: ' + tried.join(', ') + ']';
    e.quota = quotaHit; e.unavailable = true;
    throw e;
  }
  VTS.gemini = { generateDialogueSpeech, dialogueChunks, isOverloaded, isModelUnavailable, withRetry, speechChunks, hashText, generateImage, IMAGE_MODELS, generateSpeech, ttsRequest, listTtsModels, ttsChunks, toPcm, pcmToWav, TTS_MODELS, TTS_VOICES, TTS_DEFAULT_MODEL, ttsIsStructured, host, generate, listKeyModels, friendlyError, fail, redact, DEFAULT_MODEL, BUILTIN_MODELS, FALLBACK_MODELS, LEGACY_MODEL_RE };
}());
