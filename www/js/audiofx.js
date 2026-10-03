/* Sound design: bundled CC0/CC-BY sound effects, sound effects synthesised in code, procedural background music,
   and a mixer that ducks the music under the voice. The voice is never lowered: the music and effects are fitted around it.
   Every mix is built as plain Float32Arrays, so it works the same in Chrome, Android WebView and Node tests. */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {});
  const TAU = Math.PI * 2;

  // id -> { file | synth, gain, label }
  const SFX = {
    whoosh: { synth: 'whoosh', gain: 0.55, label: 'Whoosh' },
    pop: { file: 'pop', gain: 0.6, label: 'Pop' },
    pluck: { file: 'pluck', gain: 0.5, label: 'Pluck' },
    ding: { file: 'ding', gain: 0.5, label: 'Ding' },
    boom: { synth: 'boom', gain: 0.75, label: 'Bass boom' },
    punch: { file: 'punch', gain: 0.55, label: 'Punch' },
    scratch: { synth: 'scratch', gain: 0.55, label: 'Record scratch' },
    boing: { synth: 'boing', gain: 0.5, label: 'Boing' },
    bruh: { synth: 'bruh', gain: 0.6, label: '"Bruh" womp' },
    trombone: { synth: 'trombone', gain: 0.5, label: 'Sad trombone' },
    laugh: { file: 'laugh', gain: 0.4, label: 'Crowd laugh' },
    typing: { synth: 'typing', gain: 0.45, label: 'Typing' },
    notif: { file: 'notif', gain: 0.5, label: 'Notification' },
    heartbeat: { synth: 'heartbeat', gain: 0.8, label: 'Heartbeat' },
    tick: { synth: 'clock', gain: 0.55, label: 'Clock tick' },
    cash: { file: 'cash', gain: 0.55, label: 'Cash register' },
    levelup: { file: 'levelup', gain: 0.45, label: 'Level up' },
    wrong: { file: 'wrong', gain: 0.45, label: 'Wrong buzzer' },
    tada: { file: 'tada', gain: 0.6, label: 'Ta-da' },
    riser: { synth: 'riser', gain: 0.4, label: 'Riser' },
    bell: { file: 'bell', gain: 0.4, label: 'Bell' },
  };
  const SFX_IDS = Object.keys(SFX);
  const MUSIC = [['quirky', 'Quirky comedy'], ['lofi', 'Lo-fi chill'], ['upbeat', 'Upbeat pop'], ['chill', 'Soft pads'], ['suspense', 'Suspense'], ['none', 'No music']];

  // ---------- small DSP helpers ----------
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const noise = () => rnd() * 2 - 1;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // state-variable filter (Chamberlin), returns a function(sample, cutoffHz, q) -> {lp,bp,hp}
  function svf(sr) { let lp = 0; let bp = 0; return (x, fc, q) => { const f = 2 * Math.sin(Math.PI * Math.min(fc, sr / 6) / sr); const hp = x - lp - q * bp; bp += f * hp; lp += f * bp; return { lp, bp, hp }; }; }
  function onePole(sr, fc) { const a = Math.exp(-TAU * fc / sr); let y = 0; return (x) => (y = (1 - a) * x + a * y); }

  // ---------- synthesised effects ----------
  function synth(id, sr) {
    seed = 777 + id.length * 31;
    const len = (s) => Math.floor(s * sr);
    let out;
    switch (id) {
      case 'whoosh': { out = new Float32Array(len(0.5)); const f = svf(sr); for (let i = 0; i < out.length; i++) { const p = i / out.length; const env = Math.sin(Math.PI * Math.pow(p, 0.7)) ** 2; const fc = 300 + 2600 * Math.sin(Math.PI * p); out[i] = f(noise(), fc, 0.6).bp * env * 1.6; } break; }
      case 'boom': { // deep bass hit with a pitch drop and a long, saturated tail
        out = new Float32Array(len(1.4)); let ph = 0; let ph2 = 0; const lp = onePole(sr, 900);
        for (let i = 0; i < out.length; i++) { const t = i / sr; const f = 42 + 90 * Math.exp(-t * 28); ph += TAU * f / sr; ph2 += TAU * f * 2.01 / sr; const env = Math.exp(-t * 2.6) * Math.min(1, t * 400); const click = t < 0.012 ? noise() * (1 - t / 0.012) * 0.6 : 0; const x = Math.sin(ph) + 0.35 * Math.sin(ph2) * Math.exp(-t * 6); out[i] = lp(Math.tanh(x * 2.4) * env * 0.85 + click); }
        break; }
      case 'scratch': { // record scratch: back-and-forth pitch wobble on noise + saw
        out = new Float32Array(len(0.55)); const f = svf(sr); let ph = 0;
        for (let i = 0; i < out.length; i++) { const t = i / sr; const wob = Math.sin(TAU * 7.5 * t + Math.sin(TAU * 3 * t)); const sp = Math.abs(wob); const fc = 500 + 2600 * sp; ph += TAU * (80 + 420 * sp) / sr; const saw = 2 * ((ph / TAU) % 1) - 1; const gate = sp > 0.15 ? 1 : sp / 0.15; const env = Math.min(1, t * 60) * (t > 0.45 ? Math.max(0, 1 - (t - 0.45) / 0.1) : 1); out[i] = (f(noise() * 0.8 + saw * 0.5, fc, 0.35).bp * 1.3) * gate * env; }
        break; }
      case 'boing': { out = new Float32Array(len(0.7)); let ph = 0; for (let i = 0; i < out.length; i++) { const t = i / sr; const fr = 190 + 170 * Math.min(1, t * 6) + 70 * Math.sin(TAU * 16 * t) * Math.exp(-t * 3); ph += TAU * fr / sr; out[i] = (Math.sin(ph) + 0.25 * Math.sin(ph * 2)) * Math.exp(-t * 4.5) * Math.min(1, t * 300) * 0.8; } break; }
      case 'bruh': { // a comic low "bruhh" womp: saw voice with falling pitch through "uh" formants, rolled r at the start
        out = new Float32Array(len(0.75)); const f1 = svf(sr); const f2 = svf(sr); let ph = 0;
        for (let i = 0; i < out.length; i++) { const t = i / sr; const f0 = 120 - 30 * Math.min(1, t / 0.6); ph += TAU * f0 / sr; const saw = 2 * ((ph / TAU) % 1) - 1; const trill = t < 0.18 ? 0.55 + 0.45 * Math.sin(TAU * 32 * t) : 1; const env = Math.min(1, t * 25) * (t > 0.55 ? Math.max(0, 1 - (t - 0.55) / 0.2) : 1); const b = t < 0.03 ? Math.sin(TAU * 70 * t) * 0.8 : 0; const v = f1(saw, 650, 0.25).bp * 1.2 + f2(saw, 1150, 0.3).bp * 0.6; out[i] = Math.tanh((v * trill * env + b) * 1.6) * 0.8; }
        break; }
      case 'trombone': { // "wah wah wah waaah"
        const notes = [[58, 0, 0.36], [57, 0.4, 0.36], [56, 0.8, 0.36], [55, 1.2, 1.1]]; out = new Float32Array(len(2.4)); const f = svf(sr); let ph = 0;
        for (let i = 0; i < out.length; i++) { const t = i / sr; let n = null; for (const q of notes) if (t >= q[1] && t < q[1] + q[2]) n = q; if (!n) { f(0, 400, 0.5); continue; } const lt = t - n[1]; const vib = n === notes[3] ? Math.sin(TAU * 5.5 * lt) * 0.35 * Math.min(1, lt * 2) : 0; ph += TAU * mtof(n[0] - 12 + vib) / sr; const saw = 2 * ((ph / TAU) % 1) - 1; const wah = 350 + 1300 * Math.sin(Math.PI * Math.min(1, lt / n[2])); const env = Math.min(1, lt * 30) * Math.min(1, (n[2] - lt) * 12); out[i] = f(saw, wah, 0.3).lp * env * 0.7; }
        break; }
      case 'heartbeat': { out = new Float32Array(len(1.0)); [0, 0.26].forEach((st, k) => { let ph = 0; for (let i = len(st); i < out.length; i++) { const t = i / sr - st; if (t > 0.35) break; ph += TAU * (55 + 25 * Math.exp(-t * 30)) / sr; out[i] += Math.sin(ph) * Math.exp(-t * 14) * Math.min(1, t * 500) * (k ? 0.75 : 1); } }); break; }
      case 'riser': { out = new Float32Array(len(1.1)); const f = svf(sr); let ph = 0; for (let i = 0; i < out.length; i++) { const p = i / out.length; ph += TAU * (180 + 1100 * p * p) / sr; out[i] = (f(noise(), 400 + 5000 * p * p, 0.5).bp * 0.8 + Math.sin(ph) * 0.25) * p * p * (p > 0.97 ? (1 - p) / 0.03 : 1); } break; }
      case 'typing': { out = new Float32Array(len(1.0)); const hp = svf(sr); let t0 = 0.02; while (t0 < 0.92) { const a = 0.5 + rnd() * 0.5; const fc = 2500 + rnd() * 2500; for (let i = len(t0); i < Math.min(out.length, len(t0 + 0.03)); i++) { const t = i / sr - t0; out[i] += hp(noise(), fc, 0.7).bp * Math.exp(-t * 260) * a * 1.4; } t0 += 0.06 + rnd() * 0.07; } break; }
      case 'clock': { out = new Float32Array(len(2.0)); [0, 0.5, 1.0, 1.5].forEach((st, k) => { const f = svf(sr); for (let i = len(st); i < len(st + 0.05); i++) { const t = i / sr - st; out[i] += f(noise(), k % 2 ? 1800 : 2600, 0.15).bp * Math.exp(-t * 150) * 1.8; } }); break; }
      default: out = new Float32Array(1);
    }
    let pk = 0; for (let i = 0; i < out.length; i++) pk = Math.max(pk, Math.abs(out[i])); if (pk > 0) for (let i = 0; i < out.length; i++) out[i] *= 0.9 / pk;
    return out;
  }

  // ---------- procedural music (perfectly looping, 4 bars) ----------
  const STYLES = {
    quirky: { bpm: 104, prog: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], bass: 'bounce', lead: 'pizz', drums: 'light', level: 0.9 },
    lofi: { bpm: 80, prog: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], bass: 'root', lead: 'keys', drums: 'lofi', level: 0.85 },
    upbeat: { bpm: 114, prog: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], bass: 'eighths', lead: 'arp', drums: 'pop', level: 0.8 },
    chill: { bpm: 68, prog: [[48, 55, 60, 64], [45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59]], bass: 'none', lead: 'pad', drums: 'none', level: 0.9 },
    suspense: { bpm: 92, prog: [[45, 52, 57], [45, 52, 56], [41, 48, 53], [44, 51, 56]], bass: 'pulse', lead: 'drone', drums: 'tick', level: 0.85 },
  };
  function music(style, sr) {
    const S = STYLES[style] || STYLES.quirky; seed = 4242;
    const beat = 60 / S.bpm; const bar = beat * 4; const N = Math.floor(bar * 4 * sr);
    const L = new Float32Array(N); const R = new Float32Array(N);
    const add = (i, v, pan) => { const k = ((i % N) + N) % N; L[k] += v * (1 - Math.max(0, pan || 0)); R[k] += v * (1 + Math.min(0, pan || 0)); };
    const note = (m, t0, dur, kind, vol, pan) => {
      const f = mtof(m); const i0 = Math.floor(t0 * sr); const n = Math.floor((dur + (kind === 'pad' ? 0.8 : 0.25)) * sr); let ph = 0; let ph2 = rnd() * TAU; const lp = onePole(sr, kind === 'keys' ? 2200 : kind === 'pad' ? 1400 : 3000);
      for (let j = 0; j < n; j++) {
        const t = j / sr; let v = 0; ph += TAU * f / sr; ph2 += TAU * f * 1.003 / sr;
        if (kind === 'pizz') v = (Math.sin(ph) + 0.4 * Math.sin(2 * ph) + 0.15 * Math.sin(3 * ph)) * Math.exp(-t * 9);
        else if (kind === 'keys') v = (Math.sin(ph) + 0.3 * Math.sin(2 * ph + Math.sin(ph)) * Math.exp(-t * 3)) * Math.exp(-t * 1.6) * (1 + 0.15 * Math.sin(TAU * 4.5 * t));
        else if (kind === 'arp') v = lp((2 * ((ph / TAU) % 1) - 1) * 0.5 + Math.sin(ph2) * 0.5) * Math.exp(-t * 7);
        else if (kind === 'pad') v = (Math.sin(ph) + Math.sin(ph2) + 0.3 * Math.sin(2 * ph)) * 0.5 * Math.min(1, t / 0.6) * Math.min(1, Math.max(0, (dur + 0.8 - t) / 0.8));
        else if (kind === 'bass') v = (Math.sin(ph) + 0.25 * Math.sin(2 * ph)) * Math.exp(-t * 3) * Math.min(1, t * 200) * Math.min(1, Math.max(0, (dur - t) * 30 + 1));
        else if (kind === 'drone') v = (Math.sin(ph) + 0.5 * Math.sin(ph2 * 1.5)) * 0.5 * Math.min(1, t / 1.2) * Math.min(1, Math.max(0, (dur + 0.25 - t) / 0.6));
        add(i0 + j, v * Math.min(1, t * 400) * vol, pan);
      }
    };
    const kick = (t0, vol) => { let ph = 0; const i0 = Math.floor(t0 * sr); for (let j = 0; j < 0.3 * sr; j++) { const t = j / sr; ph += TAU * (48 + 110 * Math.exp(-t * 35)) / sr; add(i0 + j, Math.sin(ph) * Math.exp(-t * 11) * vol, 0); } };
    const snare = (t0, vol, soft) => { const f = svf(sr); const i0 = Math.floor(t0 * sr); for (let j = 0; j < 0.22 * sr; j++) { const t = j / sr; add(i0 + j, (f(noise(), soft ? 1400 : 2200, 0.8).bp * 1.4 + Math.sin(TAU * 190 * t) * 0.4 * Math.exp(-t * 30)) * Math.exp(-t * (soft ? 16 : 22)) * vol, 0.1); } };
    const hat = (t0, vol, pan) => { const f = svf(sr); const i0 = Math.floor(t0 * sr); for (let j = 0; j < 0.06 * sr; j++) { const t = j / sr; add(i0 + j, f(noise(), 8000, 0.4).hp * Math.exp(-t * 70) * vol, pan); } };
    for (let b = 0; b < 4; b++) {
      const ch = S.prog[b]; const t0 = b * bar; const root = ch[0] - 12;
      // harmony
      if (S.lead === 'keys') { note(ch[0], t0, bar * 0.9, 'keys', 0.16, -0.2); ch.slice(1).forEach((m, k) => note(m, t0 + 0.02 * (k + 1), bar * 0.9, 'keys', 0.12, 0.15 * k)); note(ch[1] + 12, t0 + beat * 2.5, beat, 'keys', 0.08, 0.3); }
      if (S.lead === 'pad') { ch.forEach((m, k) => note(m, t0, bar, 'pad', 0.08, (k - 1.5) * 0.3)); [0, 1.5, 2.5].forEach((q, k) => note(ch[(k + b) % ch.length] + 12, t0 + q * beat, beat * 1.2, 'pizz', 0.06, 0.4)); }
      if (S.lead === 'pizz') { const pat = [0, 1, 2, 1, 0, 2, 1, 2]; pat.forEach((k, q) => { if (q === 3 && b % 2) return; note(ch[k] + 12, t0 + q * beat / 2, beat / 2, 'pizz', q % 2 ? 0.1 : 0.15, q % 2 ? 0.3 : -0.3); }); if (b === 3) note(ch[2] + 24, t0 + 3.5 * beat, beat / 2, 'pizz', 0.08, 0.5); }
      if (S.lead === 'arp') { for (let q = 0; q < 8; q++) note(ch[q % ch.length] + (q >= 4 ? 12 : 0), t0 + q * beat / 2, beat / 2, 'arp', 0.1, q % 2 ? 0.35 : -0.35); ch.forEach((m) => note(m, t0, bar, 'pad', 0.035, 0)); }
      if (S.lead === 'drone') { note(root, t0, bar, 'drone', 0.12, 0); if (b % 2) note(ch[2] + 12, t0 + beat * 2, beat * 2, 'pad', 0.05, 0.3); }
      // bass
      if (S.bass === 'root') { note(root, t0, beat * 1.5, 'bass', 0.28); note(root, t0 + beat * 2.5, beat, 'bass', 0.2); }
      if (S.bass === 'bounce') { [0, 1, 2, 3].forEach((q) => note(q % 2 ? root + 7 : root, t0 + q * beat, beat * 0.45, 'bass', 0.24)); }
      if (S.bass === 'eighths') { for (let q = 0; q < 8; q++) note(root + (q === 7 ? 7 : 0), t0 + q * beat / 2, beat * 0.4, 'bass', 0.2); }
      if (S.bass === 'pulse') { for (let q = 0; q < 8; q++) note(root - 12 + 12, t0 + q * beat / 2, beat * 0.3, 'bass', q % 2 ? 0.1 : 0.18); }
      // drums
      for (let q = 0; q < 4; q++) {
        const tq = t0 + q * beat;
        if (S.drums === 'lofi') { if (q === 0 || (q === 2 && b % 2 === 0)) kick(tq, 0.45); if (q === 2 && b % 2) kick(tq + beat / 2, 0.35); if (q % 2) snare(tq + 0.02, 0.22, true); hat(tq, 0.06); hat(tq + beat * 0.55, 0.045, 0.3); }
        if (S.drums === 'pop') { kick(tq, 0.4); if (q % 2) snare(tq, 0.25); hat(tq + beat / 2, 0.07, 0.3); }
        if (S.drums === 'light') { if (q === 0 || q === 2) kick(tq, 0.3); if (q % 2) snare(tq, 0.12, true); hat(tq + beat / 2, 0.05, -0.2); }
        if (S.drums === 'tick') { hat(tq, 0.08, 0.2); hat(tq + beat / 2, 0.05, -0.2); if (q === 0) kick(tq, 0.3); }
      }
    }
    // vinyl crackle for lo-fi
    if (style === 'lofi') for (let k = 0; k < N / sr * 30; k++) { const i = Math.floor(rnd() * N); const a = rnd() * 0.05; for (let j = 0; j < 30; j++) add(i + j, noise() * a * Math.exp(-j / 6), rnd() - 0.5); }
    let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    const g = S.level * 0.8 / (pk || 1); for (let i = 0; i < N; i++) { L[i] *= g; R[i] *= g; }
    return { L, R, loopLen: N, bpm: S.bpm };
  }

  // ---------- loading bundled files ----------
  const cache = { files: new Map(), synth: new Map(), music: new Map() };
  async function loadFile(name) {
    if (cache.files.has(name)) return cache.files.get(name);
    const p = (async () => {
      try {
        const res = await fetch((VTS.SFX_BASE || 'sfx/') + name + '.ogg'); if (!res.ok) throw new Error('HTTP ' + res.status);
        const ab = await res.arrayBuffer(); const ac = VTS.render.audioCtx();
        const buf = await new Promise((ok, bad) => { const q = ac.decodeAudioData(ab, ok, bad); if (q && q.then) q.then(ok, bad); });
        return { data: buf.getChannelData(0), sr: buf.sampleRate };
      } catch (_) { return null; }
    })();
    cache.files.set(name, p); return p;
  }
  async function sample(id, sr) {
    const d = SFX[id]; if (!d) return null;
    if (d.file) { const f = await loadFile(d.file); if (f) return f; }
    const k = (d.synth || id) + '@' + sr; if (!cache.synth.has(k)) cache.synth.set(k, { data: synth(d.synth || 'whoosh', sr), sr });
    return cache.synth.get(k);
  }
  function musicFor(style, sr) { const k = style + '@' + sr; if (!cache.music.has(k)) cache.music.set(k, music(style, sr)); return cache.music.get(k); }

  // Voice activity (0..1) per 10 ms, with fast attack and slow release, for ducking.
  function voiceActivity(ch, sr) {
    const win = Math.max(1, Math.floor(sr * 0.01)); const n = Math.ceil(ch.length / win); const rms = new Float32Array(n); let pk = 0;
    for (let k = 0; k < n; k++) { let s = 0; const a = k * win; const e = Math.min(ch.length, a + win); for (let i = a; i < e; i++) s += ch[i] * ch[i]; rms[k] = Math.sqrt(s / Math.max(1, e - a)); if (rms[k] > pk) pk = rms[k]; }
    const thr = Math.max(0.004, pk * 0.06); const act = new Float32Array(n); let v = 0;
    for (let k = 0; k < n; k++) { const x = rms[k] > thr ? 1 : 0; v = x > v ? v + (x - v) * 0.5 : v + (x - v) * 0.03; act[k] = v; }
    return { act, win };
  }

  /* Build the final soundtrack in video time (0..total).
     o: { total, lead, audioDur, cues:[{t,id,gain,pan}], music:'quirky'|'none', musicVol 0..1, sfxVol 0..1, voiceVol 0..1.5, sfx:bool, loop:bool } */
  async function mix(voice, o) {
    const ac = VTS.render.audioCtx(); const sr = voice.sampleRate || ac.sampleRate;
    const N = Math.max(1, Math.ceil(o.total * sr)); const L = new Float32Array(N); const R = new Float32Array(N);
    const lead = Math.floor((o.lead || 0) * sr); const vv = o.voiceVol == null ? 1 : o.voiceVol;
    const vL = voice.getChannelData(0); const vR = voice.numberOfChannels > 1 ? voice.getChannelData(1) : vL;
    const vN = Math.min(vL.length, Math.floor((o.audioDur || voice.duration) * sr));
    for (let i = 0; i < vN && lead + i < N; i++) { L[lead + i] += vL[i] * vv; R[lead + i] += vR[i] * vv; }
    const { act, win } = voiceActivity(vL.subarray(0, vN), sr);
    const actAt = (i) => { const k = Math.floor((i - lead) / win); return k >= 0 && k < act.length ? act[k] : 0; };
    let musicPeak = 0;
    if (o.music && o.music !== 'none' && (o.musicVol == null || o.musicVol > 0)) {
      const m = musicFor(o.music, sr); const base = 0.32 * (o.musicVol == null ? 0.5 : o.musicVol);
      const fadeOut = Math.floor(Math.min(1.4, o.total * 0.1) * sr); const fadeIn = Math.floor(0.35 * sr);
      for (let i = 0; i < N; i++) {
        const duck = 1 - 0.62 * actAt(i); let g = base * duck; if (i < fadeIn) g *= i / fadeIn; if (i > N - fadeOut) g *= (N - i) / fadeOut;
        const k = i % m.loopLen; L[i] += m.L[k] * g; R[i] += m.R[k] * g; musicPeak = Math.max(musicPeak, Math.abs(m.L[k] * g));
      }
    }
    const placed = [];
    if (o.sfx !== false && o.cues && o.cues.length && (o.sfxVol == null || o.sfxVol > 0)) {
      const sv = o.sfxVol == null ? 0.7 : o.sfxVol;
      for (const c of o.cues) {
        const d = SFX[c.id]; if (!d) continue; const s = await sample(c.id, sr); if (!s) continue;
        const rate = (s.sr / sr) * (c.rate || 1); const i0 = Math.floor(c.t * sr); const pan = c.pan || 0;
        const g = d.gain * sv * (c.gain == null ? 1 : c.gain); const n = Math.floor(s.data.length / rate);
        for (let j = 0; j < n; j++) {
          const i = i0 + j; if (i < 0) continue; if (i >= N) break;
          const x = j * rate; const a = Math.floor(x); const fr = x - a; const v = (s.data[a] || 0) * (1 - fr) + (s.data[a + 1] || 0) * fr;
          const gg = g * (1 - 0.35 * actAt(i)); // effects sit a little under the voice
          L[i] += v * gg * (1 - Math.max(0, pan)); R[i] += v * gg * (1 + Math.min(0, pan));
        }
        placed.push(c.id);
      }
    }
    // soft-knee limiter above 0.8 so an effect never clips (the voice itself is untouched below that)
    const lim = (x) => { const a = Math.abs(x); return a <= 0.8 ? x : Math.sign(x) * (0.8 + 0.19 * Math.tanh((a - 0.8) / 0.19)); };
    for (let i = 0; i < N; i++) { L[i] = lim(L[i]); R[i] = lim(R[i]); }
    const out = ac.createBuffer(2, N, sr); out.copyToChannel(L, 0); out.copyToChannel(R, 1);
    out.vtsInfo = { placed, musicPeak, music: o.music };
    return out;
  }

  VTS.audiofx = { SFX, SFX_IDS, MUSIC, STYLES, synth, music, mix, voiceActivity, sample, loadFile };
}());
