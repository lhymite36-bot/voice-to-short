/* v1.5 "Motion 2.0" for the 2D cartoon style (and shared helpers for the 3D style):
   voice-synced mouths (audio amplitude envelope), squash & stretch on expression changes, idle sway, emphasis gestures,
   handheld camera + pans + punch-ins on jokes + shake on chaos beats, varied transitions (whip / zoom / glitch / wipe / slide / iris),
   auto meme punch-ins (zoom-to-face, impact text, record-scratch freeze) with SFX, emoji pops, parallax backdrop, light motion and an on-brand grade.
   look.motion = 'classic' keeps the v1.4 animation exactly. Everything is canvas-drawn, so the preview equals the export. */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {});
  const S = VTS.scenes; const R = VTS.render; const C = VTS.comedy;
  const TAU = Math.PI * 2; const W = 1080; const H = 1920;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeOutBack = (x) => { x = clamp01(x); const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const easeInOut = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const sm = (t, s) => Math.sin(t * 1.31 + s) * 0.55 + Math.sin(t * 2.17 + s * 1.7) * 0.3 + Math.sin(t * 3.73 + s * 2.3) * 0.15; // smooth pseudo-noise -1..1

  // ======================= voice amplitude envelope =======================
  const RATE = 60;
  function rmsFrames(f, sr, out) { const hop = Math.max(1, Math.round(sr / RATE)); for (let a = 0; a < f.length; a += hop) { const b = Math.min(f.length, a + hop); let s = 0; let n = 0; for (let j = a; j < b; j += 2) { s += f[j] * f[j]; n++; } out.push(Math.sqrt(s / Math.max(1, n))); } }
  function finish(raw) {
    const n = raw.length; const d = new Float32Array(n); if (!n) return { rate: RATE, d };
    const sample = []; for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 4000))) sample.push(raw[i]); sample.sort((a, b) => a - b);
    const p95 = Math.max(1e-4, sample[Math.floor(sample.length * 0.95)] || 1e-4); let prev = 0;
    for (let i = 0; i < n; i++) { let v = raw[i] / p95; v = v < 0.14 ? 0 : Math.min(1, (v - 0.14) / 0.86); prev = v > prev ? prev + (v - prev) * 0.65 : prev + (v - prev) * 0.3; d[i] = prev; }
    return { rate: RATE, d };
  }
  function envelopeFromBuffer(buf) { if (!buf || !buf.getChannelData) return null; const raw = []; rmsFrames(buf.getChannelData(0), buf.sampleRate, raw); return finish(raw); }
  async function envelopeFromTrack(track) { if (!track || !track.floats) return null; const raw = []; const d = track.duration; for (let t0 = 0; t0 < d; t0 += 30) { rmsFrames(await track.floats(t0, Math.min(d, t0 + 30)), track.sr, raw); } return finish(raw); }
  function envAt(env, t) { if (!env || !env.d.length || t < 0) return 0; const x = t * env.rate; const i = Math.floor(x); if (i >= env.d.length - 1) return env.d[env.d.length - 1] || 0; const f = x - i; return env.d[i] * (1 - f) + env.d[i + 1] * f; }

  // ======================= expression helpers =======================
  const CHAOS = ['panicking', 'shocked', 'rage', 'angry', 'surprised'];
  const GESTURE = (emo) => (['happy', 'crying-laughing'].includes(emo) ? 'fist' : ['shocked', 'panicking', 'surprised', 'rage'].includes(emo) ? 'hands-up' : ['eye-roll', 'side-eye', 'smug', 'tired', 'dead-inside', 'facepalm'].includes(emo) ? 'shrug' : 'point');
  const GESTURE_POSES = ['talking', 'standing-thinking', 'stressed', 'celebrating', 'walking'];
  // Words that hint at an expression when the script left the beat neutral (keeps faces changing per line).
  function exprFromText(text) {
    const s = String(text || '').toLowerCase();
    if (/\b(lol|lmao|hilarious|joke|laugh)/.test(s)) return 'crying-laughing';
    if (/\b(panic|spiral|freak|deadline|help)\b/.test(s)) return 'panicking';
    if (/\b(what\?|wait|seriously|literally|excuse me)\b|\?!/.test(s)) return 'shocked';
    if (/\b(sure|obviously|of course|genius|totally)\b/.test(s)) return 'smug';
    if (/\b(tired|exhausted|again|whatever|fine\.)\b/.test(s)) return 'dead-inside';
    return '';
  }

  if (!S || !R || !R.Renderer) { VTS.motion = { envelopeFromBuffer, envelopeFromTrack, envAt }; return; }
  const ST = S.Stage.prototype; const RP = R.Renderer.prototype;
  const smooth = (r) => r && r.o && r.o.motion !== 'classic' && r.scenes;

  // ---------- setup: transitions, expressions, meme punch-ins ----------
  const baseSetupScenes = RP.setupScenes;
  RP.setupScenes = function () {
    baseSetupScenes.call(this);
    if (!smooth(this)) { this.trDur = 0; return; }
    const TYPES = ['whip', 'zoom', 'glitch', 'wipe', 'whip', 'slide', 'pop'];
    this.trDur = 0.34;
    (this.shots || []).forEach((sh, k) => { sh.transition = TYPES[(k * 3 + Math.floor(hash(k + 4) * 3)) % TYPES.length]; });
    this.timeline.forEach((b, i) => {
      if (b.sc && (!b.sc.emotion || b.sc.emotion === 'neutral')) { const e = exprFromText(b.text); if (e) b.sc.emotion = e; }
      b.prevEmo = i > 0 && this.timeline[i - 1].sc ? this.timeline[i - 1].sc.emotion : '';
      b.emphIdx = b.emphasis ? b.words.findIndex((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === b.emphasis) : -1;
      if (b.emphIdx < 0 && b.words.length > 3) b.emphIdx = Math.min(b.words.length - 1, Math.floor(b.words.length * 0.6));
    });
  };
  const baseSetup = RP.setup;
  RP.setup = function (o) {
    baseSetup.call(this, o);
    this.pops = [];
    if (!smooth(this) || !this.cx) return;
    const cx = this.cx; const tl = this.timeline; const humour = this.o.humour == null ? 2 : Number(this.o.humour);
    const cue = (t, id, gain, pri) => { if (cx.cues.some((c) => Math.abs(c.t - t) < 0.35 && c.pri >= pri)) return; cx.cues.push({ t, id, gain, pan: 0, pri }); };
    let lastMeme = -9; let lastFreeze = -30; let k = 0; const gap = this.o.intensity === 'chaotic' ? 3.5 : this.o.intensity === 'chill' ? 9 : 5.5;
    if (humour > 0 && this.o.intensity !== 'off') tl.forEach((b, i) => {
      if (i === 0 || b.step === 4 || (b.fxType && b.fxType !== 'none') || cx.fx.some((f) => f.start < b.end && f.end > b.start)) return;
      const drama = b.sc && ['shocked', 'panicking', 'rage', 'dead-inside', 'crying-laughing', 'smug', 'eye-roll', 'facepalm'].includes(b.sc.emotion);
      if (!(b.punch || drama) || b.start - lastMeme < gap || b.end - b.start < 0.7) return;
      const word = b.emphIdx >= 0 ? b.words[b.emphIdx].replace(/[^\p{L}\p{N}'’]/gu, '').toUpperCase() : '';
      let type = ['zoom-punch', 'impact', 'zoom-punch', 'freeze'][k++ % 4];
      if (type === 'freeze' && (humour < 2 || b.start - lastFreeze < 15)) type = 'impact';
      const at = b.emphIdx >= 0 ? b.wordTimes[b.emphIdx] : b.start;
      const text = type === 'freeze' ? '' : (word && word.length <= 12 ? word + (type === 'impact' ? '!' : '') : '');
      cx.fx.push({ type, start: at, end: Math.max(b.end, at + (type === 'freeze' ? 1.3 : 1.0)), beat: i, text, auto: true });
      cue(at + 0.01, type === 'freeze' ? 'scratch' : 'boom', type === 'freeze' ? 1 : 0.75, 3);
      lastMeme = at; if (type === 'freeze') lastFreeze = at;
    });
    cx.fx.sort((a, b) => a.start - b.start); cx.cues.sort((a, b) => a.t - b.t);
    // emoji pops burst out of the speaker's head on emphasised words
    tl.forEach((b, i) => { if (b.emojiFile && b.emojiWord >= 0 && (b.punch || i % 3 === 1)) this.pops.push({ t: b.wordTimes[b.emojiWord] + 0.05, file: b.emojiFile, beat: i, seed: i * 7 + 3 }); });
  };

  // ---------- per-frame motion state ----------
  function frameState(r, t) {
    const tl = r.timeline; const i = Math.max(0, r.beatAt(t)); const b = tl[i] || {}; const sh = r.shots && b.shot != null ? r.shots[b.shot] : null;
    const env = r.env; const voiced = t >= (r.o.speechStart || 0) - 0.05 && t <= (r.o.speechEnd || 1e9) + 0.1;
    let amp = env ? envAt(env, t - (R.LEAD || 0.3)) : (voiced && t < b.end - 0.05 ? 0.35 + 0.35 * Math.abs(Math.sin(t * 11.3) * Math.sin(t * 4.1 + 1)) : 0);
    if (!voiced) amp = 0;
    const age = t - (b.start || 0); const emo = (b.sc && b.sc.emotion) || 'neutral';
    let gesture = null;
    if (b.emphIdx >= 0 && b.wordTimes) { const wt = b.wordTimes[b.emphIdx]; const p = (t - wt + 0.12) / 0.9; if (p > 0 && p < 1) gesture = { kind: GESTURE(emo), k: Math.sin(p * Math.PI) }; }
    return { t, i, b, sh, amp, age, emo, emoChanged: !!b.prevEmo && b.prevEmo !== emo, gesture, chaos: CHAOS.includes(emo), punch: !!b.punch, speaker: (b.sc && b.sc.speaker) || '' };
  }

  // ---------- characters: squash & stretch, sway, gestures, voice-synced mouth ----------
  const baseCharacter = ST.character;
  ST.character = function (ctx, x, groundY, scale, pose, emotion, t, o) {
    const mo = this._mo; o = o || {};
    if (!mo || o.castDone || this.draw3d) return baseCharacter.call(this, ctx, x, groundY, scale, pose, emotion, t, o);
    const second = o.variant === 1 || o.pair === -1; const seed = second ? 2.3 : 0.7;
    let sx = 1; let sy = 1;
    if (mo.emoChanged && mo.age < 0.55) { const k = mo.age / 0.55; const e = Math.exp(-k * 4.5) * Math.cos(k * Math.PI * 3.2); sy = 1 + 0.11 * e; sx = 1 - 0.075 * e; }
    else if (mo.age < 0.3 && mo.punch) { const e = Math.sin(clamp01(mo.age / 0.3) * Math.PI); sy = 1 - 0.06 * e; sx = 1 + 0.05 * e; }
    sy *= 1 + 0.01 * Math.sin(t * 2.3 + seed); const sway = sm(t * 0.6, seed) * 0.018 + (mo.chaos && emotion === mo.emo ? Math.sin(t * 38) * 0.012 : 0);
    // who is talking: comedy marks a speaker; otherwise the single on-screen character voices the narration
    const sc = this._scene || {}; const solo = (sc.count || 1) === 1;
    const talking = mo.amp > 0.04 && (solo ? !['sleeping', 'meditating', 'lying-awake'].includes(pose) && !['calm'].includes(emotion) : pose === 'talking' || pose === 'arguing');
    const o2 = Object.assign({}, o);
    if (mo.gesture && GESTURE_POSES.concat(['idle']).includes(pose) && !o.desk && !o2.targetR && pose !== 'scrolling-phone' && (!second || !solo)) {
      const g = mo.gesture; const k = easeInOut(g.k); const s = scale; const rest = (side) => [x + side * 105 * s, groundY - 215 * s];
      const T = { point: [[1, 200, 410]], fist: [[1, 95, 640]], 'hands-up': [[1, 130, 600], [-1, 130, 600]], shrug: [[1, 175, 300], [-1, 175, 300]] }[g.kind] || [];
      T.forEach(([side, dx, dy]) => { const a = rest(side); const b = [x + side * dx * s, groundY - dy * s]; const p = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; if (side > 0) o2.targetR = p; else o2.targetL = p; });
    }
    this._forceTalk = talking && solo; this._mouthOpen = talking ? 3 + 20 * mo.amp : (pose === 'talking' ? 3 : null);
    ctx.save(); ctx.translate(x, groundY); ctx.rotate(sway); ctx.scale(sx, sy); ctx.translate(-x, -groundY);
    let A;
    try { A = baseCharacter.call(this, ctx, x, groundY, scale, pose, emotion, t, o2); } finally { ctx.restore(); this._forceTalk = false; this._mouthOpen = null; }
    if (A && A.head) { A.head.y = groundY + (A.head.y - groundY) * sy; const h = this._heads && this._heads[this._heads.length - 1]; if (h && h !== A.head && Math.abs(h.x - A.head.x) < 1) h.y = A.head.y; }
    return A;
  };

  // ---------- camera: handheld, pans, punch-ins, chaos shake, parallax ----------
  const prevDrawShot = ST.drawShot;
  ST.drawShot = function (ctx, sh) {
    const mo = this._mo; if (!mo || mo.classic) return prevDrawShot.call(this, ctx, sh);
    let cam = this._cam; let made = false;
    if (!cam) { cam = { z: 1, dx: 0, dy: 0, rot: 0, fx: 540, fy: 1150 }; this._cam = cam; this._camLast = cam; made = true; }
    if (cam._mt !== mo.t) {
      cam._mt = mo.t; const t = mo.t;
      cam.dx += sm(t * 0.9, 1) * 7; cam.dy += sm(t * 0.8, 4) * 6; cam.rot = (cam.rot || 0) + sm(t * 0.5, 7) * 0.006; // handheld
      const s0 = mo.sh; if (s0) { const p = clamp01((t - s0.start) / Math.max(1.5, s0.end - s0.start)); const dir = s0.idx % 2 ? 1 : -1; cam.dx += (p - 0.5) * 70 * dir; cam.z *= 1.035 + 0.035 * easeInOut(p); } // slow pan + push
      if (mo.punch) cam.z *= 1 + 0.15 * easeOutBack(mo.age / 0.22) * (mo.age < (mo.b.end - mo.b.start) ? 1 : 0); // punch-in on the joke
      if (mo.gesture) cam.z *= 1 + 0.035 * mo.gesture.k; // micro push on the emphasised word
      if (mo.chaos && mo.age < 0.9) { const a = 16 * Math.exp(-mo.age * 3.5); cam.dx += Math.sin(t * 61) * a; cam.dy += Math.cos(t * 47) * a; cam.rot += Math.sin(t * 33) * a * 0.0011; } // shake on chaos beats
      this._bgShift = { x: -cam.dx * 0.45 + sm(t * 0.15, 9) * 18, y: -cam.dy * 0.4 };
    }
    try { return prevDrawShot.call(this, ctx, sh); } finally { if (made) { this._cam = null; } }
  };

  // ---------- light motion, grade, emoji pops (over the scene, under the captions) ----------
  const prevDrawScenes = RP.drawScenes;
  RP.drawScenes = function (t) {
    const on = smooth(this); if (this.stage) this.stage._mo = on ? frameState(this, t) : null;
    prevDrawScenes.call(this, t);
    if (!on || !C || !C.inWorld) return;
    const pre = this.preset; const st = this.stage; const pops = this.pops || [];
    C.inWorld(this, (ctx) => {
      // drifting light beam + dust
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const bx = W * (0.5 + 0.45 * Math.sin(t * 0.11)); const g = ctx.createLinearGradient(bx - 260, 0, bx + 260, H * 0.2);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,244,214,0.075)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx - 140, 0); ctx.lineTo(bx + 140, 0); ctx.lineTo(bx + 520, H); ctx.lineTo(bx - 120, H); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,248,225,0.32)';
      for (let q = 0; q < 12; q++) { const y = ((hash(q) * H - t * (16 + hash(q + 2) * 22)) % H + H) % H; const x = hash(q + 5) * W + sm(t * 0.4, q) * 30; ctx.beginPath(); ctx.arc(x, y, 2 + hash(q + 8) * 3.5, 0, TAU); ctx.fill(); }
      ctx.restore();
      // on-brand grade: warm highlights from the top, cool shadows at the bottom
      ctx.save(); ctx.globalCompositeOperation = 'soft-light'; const gg = ctx.createLinearGradient(0, 0, 0, H); gg.addColorStop(0, R.PRESETS && pre ? pre.hi : '#ffb347'); gg.addColorStop(1, pre ? pre.shadowTint : '#00424d'); ctx.globalAlpha = 0.16; ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H); ctx.restore();
      // emoji pops
      if (pops.length && st) {
        const heads = st.lastHeads || []; const cam = st._camLast;
        pops.forEach((pp) => { const a = t - pp.t; if (a < 0 || a > 1.1) return; const b = this.timeline[pp.beat] || {}; const hd = heads.find((h) => h.who === (b.sc && b.sc.speaker)) || heads[0] || { x: 600, y: 1150, r: 92 };
          const hx = cam ? cam.fx + cam.dx + (hd.x - cam.fx) * cam.z : hd.x; const hy = cam ? cam.fy + cam.dy + (hd.y - cam.fy) * cam.z : hd.y;
          const img = S.EMO && S.EMO.get ? (() => { try { return S.EMO.get(pp.file); } catch (_) { return null; } })() : null; if (!img) return;
          for (let q = 0; q < 5; q++) { const ang = -Math.PI / 2 + (q - 2) * 0.42 + (hash(pp.seed + q) - 0.5) * 0.3; const v = 620 + hash(pp.seed + q + 9) * 260; const x = hx + Math.cos(ang) * v * a; const y = hy - 60 + Math.sin(ang) * v * a + 900 * a * a; const sz = (70 + hash(q + pp.seed) * 40) * easeOutBack(a / 0.18) * (a > 0.8 ? (1.1 - a) / 0.3 : 1); if (sz <= 2) continue; ctx.save(); ctx.translate(x, y); ctx.rotate((hash(q) - 0.5) * a * 4); ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz); ctx.restore(); }
        });
      }
    });
  };
  // emoji used by the pops must be preloaded
  const prevPrepare = RP.prepare;
  RP.prepare = async function () { const n = await prevPrepare.call(this); if (this.pops && this.pops.length && S.EMO && S.EMO.load) { try { await S.EMO.load(Array.from(new Set(this.pops.map((p) => p.file)))); } catch (_) { /* optional */ } } return n; };

  VTS.motion = { envelopeFromBuffer, envelopeFromTrack, envAt, frameState, exprFromText, GESTURE, CHAOS, sm, smooth };
}());
