/* Offline (faster/slower than real time, never throttled) render: draw each frame at an exact time,
   encode with WebCodecs (H.264 + AAC/Opus) and mux a normal, non-fragmented MP4 (moov first, correct
   duration) with mp4-muxer. Used by Autopilot: MediaRecorder in a background/locked WebView drops to
   ~1 fps and writes fragmented MP4s with a 0 duration and broken timestamps, which Buffer/YouTube reject.
   Also: mp4Info() reads the real duration of any MP4 (flat or fragmented) for a pre-upload check. */
(function (root) {
  'use strict';
  const VTS = (root.VTS = root.VTS || {});
  const FPS = 30;
  const AVC = ['avc1.640028', 'avc1.4D0028', 'avc1.42E028', 'avc1.640033'];

  // ---------- MP4 inspection (pure; Uint8Array in) ----------
  function mp4Info(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const out = { duration: 0, mvhdDuration: 0, fragmented: false, tracks: [], moovBeforeMdat: false, boxes: [] };
    let sawMdat = false;
    function box(o, end, cb) {
      while (o + 8 <= end) {
        let size = dv.getUint32(o); const type = String.fromCharCode(u8[o + 4], u8[o + 5], u8[o + 6], u8[o + 7]); let h = 8;
        if (size === 1) { size = Number(dv.getBigUint64(o + 8)); h = 16; } else if (size === 0) size = end - o;
        if (size < h || o + size > end) break;
        cb(type, o + h, o + size); o += size;
      }
    }
    const fragDur = {}; const timescale = {}; let curTrack = 0;
    box(0, u8.length, (t, s, e) => {
      out.boxes.push(t);
      if (t === 'mdat') sawMdat = true;
      if (t === 'moof') { out.fragmented = true; box(s, e, (t2, s2, e2) => { if (t2 !== 'traf') return; let id = 0; let defDur = 0; box(s2, e2, (t3, s3) => {
        if (t3 === 'tfhd') { const fl = dv.getUint32(s3) & 0xffffff; id = dv.getUint32(s3 + 4); let p = s3 + 8; if (fl & 1) p += 8; if (fl & 2) p += 4; if (fl & 8) defDur = dv.getUint32(p); }
        if (t3 === 'trun') { const fl = dv.getUint32(s3) & 0xffffff; const n = dv.getUint32(s3 + 4); let p = s3 + 8; if (fl & 1) p += 4; if (fl & 4) p += 4; let sum = 0;
          for (let i = 0; i < n; i++) { let d = defDur; if (fl & 0x100) { d = dv.getUint32(p); p += 4; } if (fl & 0x200) p += 4; if (fl & 0x400) p += 4; if (fl & 0x800) p += 4; sum += d; }
          fragDur[id] = (fragDur[id] || 0) + sum; }
      }); }); }
      if (t === 'moov') {
        if (!sawMdat) out.moovBeforeMdat = true;
        box(s, e, (t2, s2, e2) => {
          if (t2 === 'mvhd') { const v = u8[s2]; const ts = v ? dv.getUint32(s2 + 20) : dv.getUint32(s2 + 12); const du = v ? Number(dv.getBigUint64(s2 + 24)) : dv.getUint32(s2 + 16); out.mvhdDuration = ts ? du / ts : 0; }
          if (t2 === 'trak') { const tr = {}; box(s2, e2, (t3, s3, e3) => {
            if (t3 === 'tkhd') { const v = u8[s3]; tr.id = dv.getUint32(s3 + (v ? 20 : 12)); }
            if (t3 === 'mdia') box(s3, e3, (t4, s4, e4) => {
              if (t4 === 'mdhd') { const v = u8[s4]; tr.timescale = v ? dv.getUint32(s4 + 20) : dv.getUint32(s4 + 12); const du = v ? Number(dv.getBigUint64(s4 + 24)) : dv.getUint32(s4 + 16); tr.duration = tr.timescale ? du / tr.timescale : 0; }
              if (t4 === 'hdlr') tr.kind = String.fromCharCode(u8[s4 + 8], u8[s4 + 9], u8[s4 + 10], u8[s4 + 11]);
              void e4;
            });
          }); timescale[tr.id] = tr.timescale; out.tracks.push(tr); }
        });
      }
    });
    if (out.fragmented) out.tracks.forEach((tr) => { if (fragDur[tr.id] != null && tr.timescale) tr.duration = fragDur[tr.id] / tr.timescale; });
    out.duration = out.fragmented ? Math.max(0, ...out.tracks.map((x) => x.duration || 0)) : (out.mvhdDuration || Math.max(0, ...out.tracks.map((x) => x.duration || 0)));
    return out;
  }
  async function blobInfo(blob) { return mp4Info(new Uint8Array(await blob.arrayBuffer())); }
  // A file Buffer/YouTube will accept as a Short: flat MP4, real duration 1-59.9 s, header duration set.
  function checkShort(info, maxSec) {
    const m = maxSec || 59.9; const problems = [];
    if (info.fragmented) problems.push('fragmented MP4');
    if (!info.mvhdDuration) problems.push('no duration in the MP4 header');
    if (!(info.duration > 1)) problems.push('duration ' + info.duration.toFixed(1) + ' s');
    if (info.duration > m) problems.push('too long (' + info.duration.toFixed(1) + ' s)');
    const v = info.tracks.find((x) => x.kind === 'vide'); const a = info.tracks.find((x) => x.kind === 'soun');
    if (!v) problems.push('no video track'); if (v && a && Math.abs(v.duration - a.duration) > 2) problems.push('video ' + v.duration.toFixed(1) + ' s vs audio ' + a.duration.toFixed(1) + ' s');
    return { ok: !problems.length, problems };
  }

  // ---------- WebCodecs render ----------
  function supported() { return typeof root.VideoEncoder === 'function' && typeof root.AudioEncoder === 'function' && typeof root.VideoFrame === 'function' && !!root.Mp4Muxer; }
  async function pickVideo(w, h, softOnly) {
    for (const codec of AVC) for (const hw of (softOnly ? ['prefer-software'] : ['prefer-hardware', 'no-preference', 'prefer-software'])) {
      const cfg = { codec, width: w, height: h, bitrate: 6000000, framerate: FPS, hardwareAcceleration: hw, avc: { format: 'avc' }, latencyMode: 'quality' };
      try { const s = await VideoEncoder.isConfigSupported(cfg); if (s.supported) return s.config || cfg; } catch (_) { /* next */ }
    }
    return null;
  }
  async function pickAudio(sr) {
    for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
      const cfg = { codec, sampleRate: sr, numberOfChannels: 2, bitrate: 192000 };
      try { const s = await AudioEncoder.isConfigSupported(cfg); if (s.supported) return { cfg: s.config || cfg, mux }; } catch (_) { /* next */ }
    }
    return null;
  }
  async function resample(buf, sr, seconds) {
    const n = Math.max(1, Math.round(seconds * sr)); const oc = new OfflineAudioContext(2, n, sr);
    const src = oc.createBufferSource(); src.buffer = buf; src.connect(oc.destination); src.start(0); return oc.startRendering();
  }
  // Wait for the encoder queue to drain, but never forever: an encoder that errored (e.g. Android reclaimed the
  // hardware codec while the app was in the background) stops firing 'dequeue', which used to hang the render at N%.
  function waitDrain(ve, getErr, ms, frame) {
    return new Promise((res, rej) => {
      let done = false; const fin = (fn, v) => { if (done) return; done = true; clearTimeout(t); clearInterval(iv); try { ve.removeEventListener('dequeue', onDq); } catch (_) { /* ignore */ } fn(v); };
      const onDq = () => { if (ve.encodeQueueSize <= 6) fin(res); };
      const iv = setInterval(() => { const e = getErr(); if (e) fin(rej, e); else if (ve.state === 'closed') fin(rej, stallError('encoder closed', frame)); else if (ve.encodeQueueSize <= 6) fin(res); }, 250);
      const t = setTimeout(() => fin(rej, stallError('video encoder made no progress for ' + Math.round(ms / 1000) + ' s (queue ' + ve.encodeQueueSize + ')', frame)), ms);
      try { ve.addEventListener('dequeue', onDq); } catch (_) { /* ignore */ }
    });
  }
  function stallError(what, frame) { const e = new Error('Render stalled: ' + what + ' at frame ' + frame + (typeof document !== 'undefined' && document.hidden ? ' (app was in the background)' : '') + '.'); e.encoderStall = true; e.frame = frame; return e; }
  function withDeadline(p, ms, what, frame) { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(stallError(what + ' did not finish within ' + Math.round(ms / 1000) + ' s', frame)), ms); })]).finally(() => clearTimeout(t)); }
  // Public entry: hardware encoder first; if it errors or stalls (codec reclaimed / GPU suspended), redo once with the software encoder.
  async function renderOffline(opts) {
    try { return await renderOfflineOnce(opts, false); }
    catch (e) {
      (opts._enc || []).forEach((x) => { try { if (x.state !== 'closed') x.close(); } catch (_) { /* ignore */ } }); opts._enc = null;
      if ((opts.signal && opts.signal.aborted) || !(e && (e.encoderStall || /codec|encod|reclaim|QuotaExceeded|OperationError/i.test(String(e.name) + ' ' + String(e.message))))) throw e;
      if (opts.onDiag) opts.onDiag({ event: 'encoder-retry-software', reason: String(e.message || e) });
      const r = await renderOfflineOnce(opts, true); r.encoderRetry = String(e.message || e); return r;
    }
  }
  // Yield to the event loop WITHOUT a timer. Chrome/Android WebView throttle chained setTimeout() in a hidden page to
  // 1 per second, and after ~5 min hidden to 1 per MINUTE ("intensive wake-up throttling"). The old loop yielded with
  // setTimeout every 30 frames, so a 55 s Short (1650 frames, 55 yields) took ~1 min hidden, then up to ~55 min once
  // intensive throttling kicked in ("render timed out at 51% after 21m, 20m in background"). MessageChannel tasks are not throttled.
  let yieldPort = null; let yieldQ = [];
  function yieldNow() {
    if (typeof MessageChannel !== 'function') return new Promise((res) => setTimeout(res, 0));
    if (!yieldPort) { const ch = new MessageChannel(); ch.port1.onmessage = () => { const q = yieldQ; yieldQ = []; q.forEach((f) => f()); }; yieldPort = ch.port2; }
    return new Promise((res) => { yieldQ.push(res); if (yieldQ.length === 1) yieldPort.postMessage(0); });
  }
  function sameBytes(a, b) {
    if (!a && !b) return true; if (!a || !b) return false;
    const x = a instanceof ArrayBuffer ? new Uint8Array(a) : new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const y = b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    if (x.length !== y.length) return false; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false; return true;
  }
  const GOP = FPS * 2; // keyframe every 2 s = the checkpoint granularity for resuming after an encoder failure
  async function renderOfflineOnce(opts, softOnly) {
    const R = VTS.render; const { canvas, buffer, onProgress } = opts;
    if (!supported()) throw new Error('WebCodecs not available');
    const stallMs = opts.stallMs || 45000; const prepMs = opts.prepMs || 90000;
    const step = (name) => { if (opts.onDiag && opts.verbose) opts.onDiag({ event: 'render-step ' + name }); };
    const P = R.plan(buffer, opts.maxSeconds);
    const r = new R.Renderer(canvas); r.realtime = false;
    // Every await before the first frame has a deadline, so a hang names the step instead of sitting at 0-4 % forever.
    try { await withDeadline(Promise.all([document.fonts.load('800 100px Montserrat'), document.fonts.load('900 100px Montserrat')]), 15000, 'font loading', 0); } catch (_) { /* render with fallback font */ }
    r.setup(Object.assign({}, opts.look, { beats: opts.beats, speechStart: P.speechStart, speechEnd: P.speechEnd, duration: P.total, sections: opts.sections, speech: P.speech }));
    if (VTS.motion) { try { r.env = VTS.motion.envelopeFromBuffer(buffer); } catch (_) { r.env = null; } }
    step('prepare'); await withDeadline(Promise.resolve(r.prepare()), prepMs, 'scene preparation', 0); r.draw(0);
    if (opts.signal && opts.signal.aborted) return null;
    // audio: music + SFX premix (same as the live render), voice placed after the lead-in
    let mixed = null;
    if (VTS.audiofx && r.cx && opts.look && (opts.look.sfx !== false || (opts.look.music && opts.look.music !== 'none'))) {
      step('mix');
      try { mixed = await withDeadline(VTS.audiofx.mix(buffer, { total: P.total, lead: R.LEAD, audioDur: P.audioDur, cues: opts.look.sfx === false ? [] : r.cx.cues, music: opts.look.music || 'none', musicVol: opts.look.musicVol, sfxVol: opts.look.sfxVol, voiceVol: opts.look.voiceVol }), prepMs, 'music/SFX mix', 0); } catch (e) { mixed = null; if (opts.onDiag) opts.onDiag({ event: 'mix-skipped', reason: String(e && e.message || e) }); }
    }
    if (!mixed) { const sr0 = buffer.sampleRate; const n = Math.ceil(P.total * sr0); mixed = new AudioBuffer({ length: n, sampleRate: sr0, numberOfChannels: 2 }); const lead = Math.floor(R.LEAD * sr0); const nv = Math.min(buffer.length, Math.floor(P.audioDur * sr0));
      for (let c = 0; c < 2; c++) { const d = mixed.getChannelData(c); const s = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1)); for (let i = 0; i < nv && lead + i < n; i++) d[lead + i] = s[i]; } }
    const SR = 48000; step('resample'); const audio = await withDeadline(resample(mixed, SR, P.total), prepMs, 'audio resample', 0);
    step('pick-encoder');
    const vcfg = await withDeadline(pickVideo(canvas.width, canvas.height, softOnly), 30000, 'H.264 encoder lookup', 0); if (!vcfg) throw new Error('No H.264 encoder on this device');
    const acfg = await withDeadline(pickAudio(SR), 30000, 'audio encoder lookup', 0); if (!acfg) throw new Error('No AAC/Opus encoder on this device');
    opts._enc = [];
    // ---- audio first: encode + flush the whole track up front (small, fast), keep the chunks ----
    step('audio-encode');
    const audioChunks = []; let aerr = null;
    const ae = new AudioEncoder({ output: (c, m) => audioChunks.push([c, m]), error: (e) => { aerr = e; } }); ae.configure(acfg.cfg); opts._enc.push(ae);
    const L = audio.getChannelData(0); const Rr = audio.getChannelData(1); const CH = 4800;
    for (let off = 0; off < audio.length; off += CH) {
      const n = Math.min(CH, audio.length - off); const data = new Float32Array(n * 2); data.set(L.subarray(off, off + n), 0); data.set(Rr.subarray(off, off + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(off * 1e6 / SR), data }); ae.encode(ad); ad.close();
    }
    await withDeadline(ae.flush(), stallMs, 'audio encoder flush', 0); if (aerr) throw aerr; try { ae.close(); } catch (_) { /* ignore */ }
    // ---- video: encode frame by frame; chunks of a finished GOP are "committed" (checkpoint) ----
    // If the encoder dies or stalls (Android reclaims the hardware codec, GPU suspended in the background), a new encoder
    // with the same settings resumes from the last committed keyframe instead of starting again at 0 %. Its stream header
    // (avcC) must match byte-for-byte, otherwise the frames would not decode, so on a mismatch it restarts from frame 0.
    const frames = Math.round(P.total * FPS); const t0 = performance.now(); let drawMs = 0;
    let committed = []; let pending = []; let baseDesc = null; let baseMeta = null; let resumes = 0; const maxResumes = opts.maxResumes == null ? 2 : opts.maxResumes;
    let ve = null; let err = null; let encGen = 0; let mismatch = false;
    const makeEncoder = () => {
      const my = ++encGen; err = null; mismatch = false; let first = true;
      const enc = new VideoEncoder({
        output: (c, m) => {
          if (my !== encGen) return;
          if (first) { first = false; const d = m && m.decoderConfig ? m.decoderConfig.description : null;
            if (baseDesc === null && !committed.length) { baseDesc = d || new Uint8Array(0); baseMeta = m; } else if (!sameBytes(baseDesc, d || new Uint8Array(0))) { mismatch = true; return; } }
          if (mismatch) return;
          // commit only at the planned GOP keyframes (an encoder may add extra keyframes on its own)
          if (c.type === 'key' && pending.length && Math.round(c.timestamp * FPS / 1e6) % GOP === 0) { committed = committed.concat(pending); pending = []; }
          pending.push(c);
        },
        error: (e) => { if (my === encGen) err = e; },
      });
      enc.configure(vcfg); opts._enc.push(enc); return enc;
    };
    ve = makeEncoder();
    let i = 0; let maxDone = 0;
    while (i < frames) {
      try {
        for (; i < frames; i++) {
          if (opts.signal && opts.signal.aborted) { try { ve.close(); } catch (_) { /* ignore */ } return null; }
          if (err) throw err;
          if (mismatch) throw Object.assign(new Error('replacement encoder produced a different stream header'), { mismatch: true });
          const t = i / FPS; const d0 = performance.now(); r.draw(t); drawMs += performance.now() - d0;
          const vf = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
          try { ve.encode(vf, { keyFrame: i % GOP === 0 }); } finally { vf.close(); }
          if (ve.encodeQueueSize > 6) { if ('ondequeue' in ve) await waitDrain(ve, () => err, stallMs, i); else await withDeadline(ve.flush(), stallMs, 'encoder flush', i); }
          if (i % 10 === 9) await yieldNow(); // yield so abort / watchdog / UI can run (never a throttled timer)
          if (i + 1 > maxDone) maxDone = i + 1;
          if (onProgress && (i % 10 === 0 || i === frames - 1)) onProgress(maxDone / frames, t, P.total);
          if (opts._testHook) opts._testHook(i, ve);
        }
        await withDeadline(ve.flush(), stallMs, 'final encoder flush', frames);
        if (err) throw err; if (mismatch) throw Object.assign(new Error('replacement encoder produced a different stream header'), { mismatch: true });
      } catch (e) {
        if (opts.signal && opts.signal.aborted) return null;
        const recoverable = e && (e.encoderStall || e.mismatch || /codec|encod|reclaim|QuotaExceeded|OperationError|InvalidState/i.test(String(e.name) + ' ' + String(e.message)));
        if (!recoverable || resumes >= maxResumes) throw e;
        resumes++;
        try { if (ve.state !== 'closed') ve.close(); } catch (_) { /* ignore */ }
        pending = [];
        // committed ends right before a planned keyframe; resume there (anything odd -> start again at frame 0)
        if (e.mismatch || committed.length % GOP !== 0) committed = [];
        if (!committed.length) { baseDesc = null; baseMeta = null; }
        const from = committed.length;
        const at = Math.min(i, frames);
        if (opts.onDiag) opts.onDiag({ event: 'encoder-resume', reason: 'frame ' + at + ' → resuming at ' + from + ' (' + Math.round(from / FPS) + ' s): ' + String(e.message || e).slice(0, 120) });
        i = from; ve = makeEncoder(); continue;
      }
      break;
    }
    committed = committed.concat(pending); pending = [];
    try { ve.close(); } catch (_) { /* ignore */ }
    if (committed.length !== frames && opts.onDiag) opts.onDiag({ event: 'encoder-frame-count', reason: committed.length + ' of ' + frames + ' frames' });
    const muxer = new root.Mp4Muxer.Muxer({ target: new root.Mp4Muxer.ArrayBufferTarget(), video: { codec: 'avc', width: canvas.width, height: canvas.height, frameRate: FPS },
      audio: { codec: acfg.mux, sampleRate: SR, numberOfChannels: 2 }, fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
    for (let k = 0; k < committed.length; k++) { muxer.addVideoChunk(committed[k], k === 0 ? baseMeta : undefined); committed[k] = null; }
    for (let k = 0; k < audioChunks.length; k++) { muxer.addAudioChunk(audioChunks[k][0], audioChunks[k][1]); audioChunks[k] = null; }
    muxer.finalize();
    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    return { blob, mime: 'video/mp4', type: 'video/mp4', duration: P.total, width: canvas.width, height: canvas.height, frames, fps: FPS, encoder: vcfg.codec + '+' + acfg.mux, renderMs: performance.now() - t0, avgDrawMs: drawMs / frames, resumes };
  }
  const api = { waitDrain, yieldNow, sameBytes, FPS, mp4Info, blobInfo, checkShort, supported, renderOffline };
  VTS.encode = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
