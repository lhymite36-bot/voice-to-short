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

  VTS.gemini = { host, generate, listKeyModels, friendlyError, fail, redact, DEFAULT_MODEL, BUILTIN_MODELS, FALLBACK_MODELS, LEGACY_MODEL_RE };
}());
