/* Canvas renderer for 1080x1920 colour-graded caption videos + MediaRecorder export. */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {});
  const W = 1080; const H = 1920;
  const FONT = 'Montserrat, "Arial Black", "Roboto", sans-serif';
  const MAX_SECONDS = 60;
  const LEAD = 0.3; const TAIL = 0.8;

  const PRESETS = {
    teal: { name: 'Teal & Orange', bg: '#04161b', blobs: ['#0d7377', '#0a3d4a', '#ff7b39', '#ffb45e', '#0e5560'], hi: '#ffb347', text: '#ffffff',
      filter: 'contrast(1.12) saturate(1.18)', shadowTint: '#00424d', shadowAmt: 0.35, highTint: '#ff9b4a', highAmt: 0.10, lift: 0, grain: 0.07, vignette: 0.62, particles: '#ffd2a1' },
    moody: { name: 'Moody Film', bg: '#0f110d', blobs: ['#2b3a2d', '#50482f', '#8b6a44', '#1d2b2f', '#3e4a3a'], hi: '#e9c27a', text: '#f3eee4',
      filter: 'contrast(0.96) saturate(0.72) sepia(0.12)', shadowTint: '#173c38', shadowAmt: 0.4, highTint: '#d69a5c', highAmt: 0.12, lift: 0.07, grain: 0.13, vignette: 0.78, particles: '#e9c27a' },
    warm: { name: 'Warm Soft', bg: '#2e1622', blobs: ['#f4a582', '#e46f73', '#ffd3a5', '#9b5c8f', '#f7b7a3'], hi: '#fff0a0', text: '#ffffff',
      filter: 'contrast(0.92) saturate(1.06) brightness(1.04)', shadowTint: '#5b2a4a', shadowAmt: 0.25, highTint: '#ffcf9e', highAmt: 0.14, lift: 0.04, grain: 0.05, vignette: 0.42, particles: '#fff3d6' },
    mono: { name: 'Clean Mono', bg: '#070708', blobs: ['#3b3b41', '#18181c', '#8d8d95', '#26262b', '#5a5a61'], hi: '#ffffff', text: '#bdbdc4',
      filter: 'grayscale(1) contrast(1.18)', shadowTint: '#000000', shadowAmt: 0.2, highTint: '#ffffff', highAmt: 0.04, lift: 0.02, grain: 0.08, vignette: 0.6, particles: '#ffffff' },
    neon: { name: 'Night Neon', bg: '#08051a', blobs: ['#6d28d9', '#db2777', '#0891b2', '#1e1b4b', '#9333ea'], hi: '#67e8f9', text: '#ffffff',
      filter: 'contrast(1.1) saturate(1.25)', shadowTint: '#1e1068', shadowAmt: 0.3, highTint: '#f0abfc', highAmt: 0.08, lift: 0, grain: 0.06, vignette: 0.6, particles: '#a5f3fc' },
    sage: { name: 'Calm Sage', bg: '#0e1c16', blobs: ['#4a7c59', '#a3b18a', '#dad7cd', '#2f4a3b', '#6b8f71'], hi: '#fef3c7', text: '#ffffff',
      filter: 'contrast(0.98) saturate(0.9)', shadowTint: '#1b3a2c', shadowAmt: 0.3, highTint: '#f5e6c8', highAmt: 0.1, lift: 0.04, grain: 0.07, vignette: 0.55, particles: '#fef3c7' },
  };

  // Deterministic pseudo-random for particles.
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const easeOutBack = (x) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  function hexA(hex, a) {
    const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function makeCanvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }

  // ---------- timeline ----------
  function buildTimeline(beats, speechStart, speechEnd) {
    const list = (beats || []).filter((b) => b && String(b.text || '').trim());
    const total = list.reduce((a, b) => a + (Number(b.weight) || 1), 0) || 1;
    const span = Math.max(0.5, speechEnd - speechStart);
    let acc = 0;
    return list.map((b) => {
      const start = speechStart + (acc / total) * span;
      acc += Number(b.weight) || 1;
      const end = speechStart + (acc / total) * span;
      const words = String(b.text).trim().split(/\s+/);
      const ww = words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 2);
      const wsum = ww.reduce((a, x) => a + x, 0) || 1;
      let wacc = 0;
      const wordTimes = words.map((w, i) => { const t = start + (wacc / wsum) * (end - start) * 0.92; wacc += ww[i]; return t; });
      return { text: String(b.text).trim(), words, wordTimes, start, end, step: Number(b.step) || 0, emphasis: String(b.emphasis || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') };
    });
  }

  // ---------- renderer ----------
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.s = canvas.width / W;
      this.bgW = 270; this.bgH = 480;
      this.bg = makeCanvas(this.bgW, this.bgH);
      this.graded = makeCanvas(this.bgW, this.bgH);
      this.layoutCache = new Map();
      const r = rng(7);
      this.particles = Array.from({ length: 22 }, () => ({ x: r(), y: r(), z: 0.3 + r() * 0.7, sp: 0.01 + r() * 0.025, ph: r() * 6.28, rad: 3 + r() * 11 }));
    }
    setup(o) {
      this.o = Object.assign({ captionStyle: 'pop', captionCase: 'upper', watermark: false, handle: '' }, o);
      this.preset = PRESETS[o.preset] || PRESETS.teal;
      this.timeline = buildTimeline(o.beats, o.speechStart, o.speechEnd);
      this.layoutCache.clear();
      // Vignette + film grain, pre-baked into a few half-resolution frames (one cheap full-frame draw per frame).
      const c = this.canvas; const fw = Math.round(c.width / 2); const fh = Math.round(c.height / 2);
      this.finish = [];
      for (let k = 0; k < 4; k++) {
        const f = makeCanvas(fw, fh); const v = f.getContext('2d');
        const g = v.createRadialGradient(fw / 2, fh * 0.48, fw * 0.25, fw / 2, fh * 0.5, fh * 0.72);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.6, 'rgba(0,0,0,' + (this.preset.vignette * 0.35) + ')'); g.addColorStop(1, 'rgba(0,0,0,' + this.preset.vignette + ')');
        v.fillStyle = g; v.fillRect(0, 0, fw, fh);
        if (this.preset.grain > 0) {
          const img = v.getImageData(0, 0, fw, fh); const d = img.data; const amt = this.preset.grain * 255 * 1.1;
          for (let i = 0; i < d.length; i += 4) {
            const n = (Math.random() + Math.random() - 1); // triangular noise, -1..1
            if (n > 0) { // light speck: blend towards white
              const a = d[i + 3] / 255; const add = n * amt;
              d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.min(255, add * (1 - a));
            } else { d[i + 3] = Math.min(255, d[i + 3] - n * amt * 0.9); }
          }
          v.putImageData(img, 0, 0);
        }
        this.finish.push(f);
      }
    }
    beatAt(t) {
      const tl = this.timeline; if (!tl.length) return -1;
      if (t < tl[0].start) return 0;
      for (let i = tl.length - 1; i >= 0; i--) if (t >= tl[i].start) return i;
      return 0;
    }
    drawBackground(t, pulse) {
      const p = this.preset; const b = this.bg.getContext('2d'); const w = this.bgW; const h = this.bgH;
      b.globalCompositeOperation = 'source-over'; b.globalAlpha = 1;
      b.fillStyle = p.bg; b.fillRect(0, 0, w, h);
      b.globalCompositeOperation = 'screen';
      p.blobs.forEach((col, i) => {
        const sp = 0.06 + i * 0.023; const ph = i * 1.9;
        const x = w * (0.5 + 0.42 * Math.sin(t * sp * 2.2 + ph));
        const y = h * (0.5 + 0.40 * Math.cos(t * sp * 1.7 + ph * 1.3));
        const r = h * (0.42 + 0.12 * Math.sin(t * 0.21 + i));
        const g = b.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, hexA(col, 0.85)); g.addColorStop(0.55, hexA(col, 0.28)); g.addColorStop(1, hexA(col, 0));
        b.fillStyle = g; b.fillRect(0, 0, w, h);
      });
      // Soft light sweep.
      const sx = w * (0.5 + 0.5 * Math.sin(t * 0.15));
      const lg = b.createLinearGradient(sx - w * 0.6, 0, sx + w * 0.6, h);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.06)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      b.fillStyle = lg; b.fillRect(0, 0, w, h);
      // Grade: filter + split tone + lift.
      const gctx = this.graded.getContext('2d');
      gctx.globalCompositeOperation = 'source-over'; gctx.globalAlpha = 1;
      gctx.filter = p.filter || 'none';
      gctx.drawImage(this.bg, 0, 0);
      gctx.filter = 'none';
      gctx.globalCompositeOperation = 'soft-light'; gctx.globalAlpha = p.shadowAmt; gctx.fillStyle = p.shadowTint; gctx.fillRect(0, 0, w, h);
      gctx.globalCompositeOperation = 'screen'; gctx.globalAlpha = p.highAmt; gctx.fillStyle = p.highTint; gctx.fillRect(0, 0, w, h);
      if (p.lift) { gctx.globalCompositeOperation = 'lighten'; gctx.globalAlpha = 1; gctx.fillStyle = 'rgba(40,40,40,' + (p.lift * 4) + ')'; gctx.fillRect(0, 0, w, h); }
      gctx.globalCompositeOperation = 'source-over'; gctx.globalAlpha = 1;
      const ctx = this.ctx; const cw = this.canvas.width; const ch = this.canvas.height;
      const z = 1.02 + 0.03 * pulse + 0.01 * Math.sin(t * 0.3);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
      ctx.drawImage(this.graded, (cw - cw * z) / 2, (ch - ch * z) / 2, cw * z, ch * z);
    }
    drawParticles(t) {
      const ctx = this.ctx; const s = this.s; const p = this.preset;
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      for (const q of this.particles) {
        const y = ((q.y - t * q.sp * q.z) % 1 + 1) % 1;
        const x = q.x + 0.02 * Math.sin(t * 0.5 + q.ph);
        const a = (0.10 + 0.18 * (0.5 + 0.5 * Math.sin(t * 1.3 + q.ph))) * q.z;
        const r = q.rad * q.z * s;
        const g = ctx.createRadialGradient(x * W * s, y * H * s, 0, x * W * s, y * H * s, r * 2.5);
        g.addColorStop(0, hexA(p.particles, a)); g.addColorStop(1, hexA(p.particles, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x * W * s, y * H * s, r * 2.5, 0, 6.2832); ctx.fill();
      }
      ctx.restore();
    }
    layout(i) {
      if (this.layoutCache.has(i)) return this.layoutCache.get(i);
      const beat = this.timeline[i]; const ctx = this.ctx; const s = this.s;
      const upper = this.o.captionCase === 'upper';
      const words = beat.words.map((w) => (upper ? w.toUpperCase() : w));
      const maxW = 900 * s;
      let size = (words.join(' ').length > 22 ? 104 : 122) * s;
      let lines;
      for (let tries = 0; tries < 6; tries++) {
        ctx.font = '800 ' + size + 'px ' + FONT;
        const space = ctx.measureText(' ').width;
        lines = []; let cur = []; let curW = 0;
        words.forEach((w, wi) => {
          const ww = ctx.measureText(w).width;
          if (cur.length && curW + space + ww > maxW) { lines.push({ items: cur, width: curW }); cur = []; curW = 0; }
          cur.push({ w, ww, wi }); curW += (cur.length > 1 ? space : 0) + ww;
        });
        if (cur.length) lines.push({ items: cur, width: curW });
        const widest = Math.max.apply(null, lines.map((l) => l.width));
        if (lines.length <= 3 && widest <= maxW) break;
        size *= 0.88;
      }
      ctx.font = '800 ' + size + 'px ' + FONT;
      const space = ctx.measureText(' ').width;
      const lh = size * 1.14;
      const cy = 1030 * s; const top = cy - (lines.length * lh) / 2 + lh / 2;
      const pos = [];
      lines.forEach((l, li) => {
        let x = (W * s - l.width) / 2;
        l.items.forEach((it) => { pos[it.wi] = { x: x + it.ww / 2, y: top + li * lh, w: it.w, ww: it.ww }; x += it.ww + space; });
      });
      const out = { size, pos, lh };
      this.layoutCache.set(i, out);
      return out;
    }
    drawCaptions(t) {
      const i = this.beatAt(t); if (i < 0) return;
      const beat = this.timeline[i]; const L = this.layout(i); const ctx = this.ctx; const s = this.s; const p = this.preset;
      const since = t - beat.start;
      const enter = easeOut(clamp01(since / 0.18));
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.35 + 0.65 * enter;
      const dy = (1 - enter) * 26 * s;
      let active = 0;
      beat.wordTimes.forEach((wt, wi) => { if (t >= wt) active = wi; });
      beat.words.forEach((raw, wi) => {
        const pos = L.pos[wi]; if (!pos) return;
        const wt = beat.wordTimes[wi];
        const shown = this.o.captionStyle === 'karaoke' ? true : t >= wt - 0.02 || t < beat.start;
        if (!shown) { // ghost of the upcoming word keeps the phrase centred
          ctx.save(); ctx.globalAlpha *= 0.16; ctx.font = '800 ' + L.size + 'px ' + FONT; ctx.fillStyle = '#ffffff';
          ctx.fillText(pos.w, pos.x, pos.y + dy); ctx.restore(); return;
        }
        const pop = this.o.captionStyle === 'karaoke' ? 1 : easeOutBack(clamp01((t - wt + 0.02) / 0.16));
        const isActive = wi === active && t >= beat.start;
        const isEmph = beat.emphasis && raw.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === beat.emphasis;
        const sc = (0.7 + 0.3 * Math.min(pop, 1.2)) * (isActive ? 1.06 : 1);
        ctx.save();
        ctx.translate(pos.x, pos.y + dy);
        ctx.scale(sc, sc);
        ctx.font = '800 ' + L.size + 'px ' + FONT;
        ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 22 * s; ctx.shadowOffsetY = 6 * s;
        ctx.lineWidth = L.size * 0.13; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.strokeText(pos.w, 0, 0);
        ctx.shadowColor = 'transparent';
        let fill = p.text;
        if (this.o.captionStyle === 'karaoke' && t < wt) fill = hexA('#ffffff', 0.38);
        if (isActive || isEmph) fill = p.hi;
        ctx.fillStyle = fill;
        ctx.fillText(pos.w, 0, 0);
        if (isActive) { // underline swoosh
          ctx.fillStyle = hexA(p.hi, 0.9);
          const uw = pos.ww * clamp01((t - wt) / 0.22);
          ctx.fillRect(-pos.ww / 2, L.size * 0.52, uw, L.size * 0.07);
        }
        ctx.restore();
      });
      ctx.restore();
    }
    drawStep(t) {
      const i = this.beatAt(t); if (i < 0) return;
      const beat = this.timeline[i]; const step = beat.step;
      const ctx = this.ctx; const s = this.s; const p = this.preset;
      if (step >= 1 && step <= 3) {
        let first = i; while (first > 0 && this.timeline[first - 1].step === step) first--;
        let last = i; while (last < this.timeline.length - 1 && this.timeline[last + 1].step === step) last++;
        const st = this.timeline[first].start; const en = this.timeline[last].end;
        const a = easeOutBack(clamp01((t - st) / 0.45));
        const out = clamp01((en - t) / 0.25);
        ctx.save();
        ctx.globalAlpha = clamp01(a) * out;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        // label
        ctx.font = '800 ' + (40 * s) + 'px ' + FONT;
        const label = 'STEP ' + step + ' / 3';
        const lw = ctx.measureText(label).width + 64 * s;
        const ly = 360 * s;
        ctx.fillStyle = hexA('#000000', 0.32);
        roundRect(ctx, (W * s - lw) / 2, ly - 34 * s, lw, 68 * s, 34 * s); ctx.fill();
        ctx.strokeStyle = hexA(p.hi, 0.7); ctx.lineWidth = 3 * s; ctx.stroke();
        ctx.fillStyle = p.hi; ctx.fillText(label.split('').join(String.fromCharCode(8202)), W * s / 2, ly + 2 * s);
        // big number
        ctx.translate(W * s / 2, 640 * s);
        const sc = 0.6 + 0.4 * a; ctx.scale(sc, sc);
        ctx.font = '900 ' + (400 * s) + 'px ' + FONT;
        ctx.shadowColor = hexA(p.hi, 0.55); ctx.shadowBlur = 60 * s;
        const g = ctx.createLinearGradient(0, -200 * s, 0, 200 * s);
        g.addColorStop(0, '#ffffff'); g.addColorStop(1, p.hi);
        ctx.fillStyle = g; ctx.fillText(String(step), 0, 0);
        ctx.shadowColor = 'transparent';
        ctx.restore();
        // step dots
        ctx.save(); ctx.globalAlpha = out;
        for (let d = 1; d <= 3; d++) {
          ctx.beginPath(); ctx.arc(W * s / 2 + (d - 2) * 40 * s, 1450 * s, (d === step ? 11 : 7) * s, 0, 6.2832);
          ctx.fillStyle = d <= step ? p.hi : hexA('#ffffff', 0.35); ctx.fill();
        }
        ctx.restore();
      } else if (step === 4 && this.o.handle) {
        let first = i; while (first > 0 && this.timeline[first - 1].step === 4) first--;
        const a = easeOut(clamp01((t - this.timeline[first].start) / 0.4));
        ctx.save(); ctx.globalAlpha = a;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '700 ' + (46 * s) + 'px ' + FONT;
        const txt = 'Follow ' + this.o.handle;
        const tw = ctx.measureText(txt).width + 80 * s;
        ctx.fillStyle = p.hi; roundRect(ctx, (W * s - tw) / 2, 1330 * s, tw, 90 * s, 45 * s); ctx.fill();
        ctx.fillStyle = '#111'; ctx.fillText(txt, W * s / 2, 1377 * s);
        ctx.restore();
      }
    }
    drawWatermark() {
      if (!this.o.watermark || !this.o.handle) return;
      const ctx = this.ctx; const s = this.s;
      ctx.save(); ctx.globalAlpha = 0.72; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '700 ' + (36 * s) + 'px ' + FONT;
      ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 10 * s;
      ctx.fillStyle = '#ffffff'; ctx.fillText(this.o.handle, W * s / 2, 200 * s);
      ctx.restore();
    }
    drawFinish(t) {
      const ctx = this.ctx; const p = this.preset; const cw = this.canvas.width;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.finish[Math.floor(t * 24) % this.finish.length], 0, 0, cw, this.canvas.height);
      if (this.o.progress) {
        const d = this.o.duration || 1;
        ctx.fillStyle = hexA(p.hi, 0.85); ctx.fillRect(0, 0, cw * clamp01(t / d), 8 * this.s);
      }
    }
    draw(t) {
      const i = this.beatAt(t);
      let pulse = 0;
      if (i >= 0) { const st = this.timeline[i].start; const prevStep = i > 0 ? this.timeline[i - 1].step : -1; if (this.timeline[i].step !== prevStep) pulse = Math.exp(-Math.max(0, t - st) * 4); }
      this.drawBackground(t, pulse);
      this.drawParticles(t);
      this.drawStep(t);
      this.drawCaptions(t);
      this.drawWatermark();
      this.drawFinish(t);
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- audio helpers ----------
  let sharedCtx = null;
  function audioCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new AC();
    return sharedCtx;
  }
  async function decodeBlob(blob) {
    const buf = await blob.arrayBuffer();
    const ac = audioCtx();
    return await new Promise((resolve, reject) => {
      const p = ac.decodeAudioData(buf, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    });
  }
  function silentBuffer(seconds) {
    const ac = audioCtx();
    return ac.createBuffer(1, Math.max(1, Math.round(ac.sampleRate * seconds)), ac.sampleRate);
  }
  // Where speech starts/ends (RMS threshold), so captions line up with the voice.
  function speechBounds(buf) {
    const ch = buf.getChannelData(0); const sr = buf.sampleRate; const win = Math.max(1, Math.floor(sr * 0.02));
    const rms = [];
    let peak = 0;
    for (let i = 0; i < ch.length; i += win) {
      let sum = 0; const n = Math.min(win, ch.length - i);
      for (let j = 0; j < n; j++) sum += ch[i + j] * ch[i + j];
      const r = Math.sqrt(sum / n); rms.push(r); if (r > peak) peak = r;
    }
    if (peak < 0.003) return { start: 0, end: buf.duration, silent: true };
    const thr = Math.max(peak * 0.08, 0.004);
    let a = rms.findIndex((r) => r > thr); let b = rms.length - 1; while (b > 0 && rms[b] <= thr) b--;
    if (a < 0) a = 0;
    return { start: Math.max(0, a * win / sr - 0.05), end: Math.min(buf.duration, (b + 1) * win / sr + 0.12), silent: false };
  }
  // Trim long silences at start/end (keeps 0.12 s padding) and cap the length.
  function trimBuffer(buf, maxSeconds) {
    const b = speechBounds(buf);
    let start = b.silent ? 0 : Math.max(0, b.start - 0.07);
    let end = b.silent ? buf.duration : Math.min(buf.duration, b.end + 0.15);
    if (end - start > maxSeconds) end = start + maxSeconds;
    const ac = audioCtx();
    const len = Math.max(1, Math.floor((end - start) * buf.sampleRate));
    const out = ac.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(Math.floor(start * buf.sampleRate), Math.floor(start * buf.sampleRate) + len), c);
    return out;
  }

  // H.264 MP4 first (AAC audio where the encoder exists — Android usually has it; desktop Linux Chrome only has Opus),
  // then WebM (VP9/VP8), which YouTube also accepts. A bare 'video/mp4' (may be VP9-in-MP4) is the last resort.
  const VIDEO_TYPES = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.4D0028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4;codecs=avc1,opus', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  function pickVideoType(pref) {
    if (typeof MediaRecorder === 'undefined') return '';
    const list = pref === 'webm' ? VIDEO_TYPES.filter((t) => t.startsWith('video/webm')).concat(VIDEO_TYPES) : VIDEO_TYPES;
    return list.find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch (_) { return false; } }) || '';
  }
  function canRender() {
    const c = document.createElement('canvas');
    return typeof MediaRecorder !== 'undefined' && typeof c.captureStream === 'function' && !!(window.AudioContext || window.webkitAudioContext);
  }
  function plan(buf) {
    const audioDur = Math.min(buf.duration, MAX_SECONDS - LEAD - TAIL);
    const b = speechBounds(buf);
    return { audioDur, total: LEAD + audioDur + TAIL, speechStart: LEAD + Math.min(b.start, audioDur), speechEnd: LEAD + Math.min(b.end, audioDur) };
  }

  // Real-time render: canvas stream + voice track -> MediaRecorder.
  async function renderVideo(opts) {
    const { canvas, buffer, onProgress } = opts;
    if (!canRender()) throw new Error('This browser cannot record canvas video (needs MediaRecorder + canvas.captureStream).');
    const mime = pickVideoType(opts.format);
    const P = plan(buffer);
    const r = new Renderer(canvas);
    r.setup(Object.assign({}, opts.look, { beats: opts.beats, speechStart: P.speechStart, speechEnd: P.speechEnd, duration: P.total }));
    try { await document.fonts.load('800 100px Montserrat'); await document.fonts.load('900 100px Montserrat'); } catch (_) { /* ignore */ }
    r.draw(0);
    const ac = audioCtx();
    if (ac.state === 'suspended') await ac.resume();
    const dest = ac.createMediaStreamDestination();
    const src = ac.createBufferSource(); src.buffer = buffer;
    const gain = ac.createGain(); gain.gain.value = 1;
    src.connect(gain); gain.connect(dest);
    let monitor = null;
    if (opts.monitor) { monitor = ac.createGain(); monitor.gain.value = 0.9; gain.connect(monitor); monitor.connect(ac.destination); }
    const vstream = canvas.captureStream(30);
    const stream = new MediaStream([].concat(vstream.getVideoTracks(), dest.stream.getAudioTracks()));
    const recOpts = { videoBitsPerSecond: opts.bitrate || 12000000, audioBitsPerSecond: 192000 };
    if (mime) recOpts.mimeType = mime;
    const rec = new MediaRecorder(stream, recOpts);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((resolve, reject) => { rec.onstop = resolve; rec.onerror = (e) => reject(e.error || new Error('Recorder error')); });
    rec.start(1000);
    const startAt = ac.currentTime + 0.12;
    src.start(startAt + LEAD, 0, P.audioDur);
    let cancelled = false; let raf = 0; let timer = 0; let lastDraw = -1; let frames = 0;
    const done = new Promise((resolve) => {
      const tick = () => {
        if (opts.signal && opts.signal.aborted) { cancelled = true; resolve(); return; }
        const t = Math.max(0, ac.currentTime - startAt);
        if (t - lastDraw >= 1 / 31 || t >= P.total) { r.draw(t); lastDraw = t; frames++; }
        if (onProgress) onProgress(Math.min(1, t / P.total), t, P.total);
        if (t >= P.total) { resolve(); return; }
        // rAF pauses when the screen is off / tab hidden; setTimeout keeps going (slower) as a backup.
        if (document.visibilityState === 'visible') raf = requestAnimationFrame(tick); else timer = setTimeout(tick, 33);
      };
      tick();
    });
    await done;
    cancelAnimationFrame(raf); clearTimeout(timer);
    try { src.stop(); } catch (_) { /* ignore */ }
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    vstream.getTracks().forEach((tr) => tr.stop());
    try { gain.disconnect(); if (monitor) monitor.disconnect(); } catch (_) { /* ignore */ }
    if (cancelled) return null;
    const type = (rec.mimeType || mime || 'video/webm').split(';')[0];
    let out = new Blob(chunks, { type });
    if (/webm/.test(type)) out = await fixWebmDuration(out, P.total);
    return { blob: out, mime: rec.mimeType || mime, type, duration: P.total, width: canvas.width, height: canvas.height, frames };
  }

  // MediaRecorder WebM files have no Duration, so players can't seek and some apps show 0:00. Insert one into Segment > Info.
  function readVint(b, i, keepMarker) {
    const first = b[i]; let len = 1; let mask = 0x80;
    while (len <= 8 && !(first & mask)) { len++; mask >>= 1; }
    if (len > 8) return null;
    let v = keepMarker ? first : first & (mask - 1); let allOnes = (first & (mask - 1)) === mask - 1;
    for (let k = 1; k < len; k++) { v = v * 256 + b[i + k]; if (b[i + k] !== 255) allOnes = false; }
    return { v, len, unknown: !keepMarker && allOnes };
  }
  async function fixWebmDuration(blob, seconds) {
    try {
      const head = new Uint8Array(await blob.slice(0, Math.min(blob.size, 1 << 16)).arrayBuffer());
      let i = 0;
      const ebmlId = readVint(head, 0, true); if (!ebmlId || ebmlId.v !== 0x1A45DFA3) return blob;
      const ebmlSize = readVint(head, 4); i = 4 + ebmlSize.len + ebmlSize.v;
      const segId = readVint(head, i, true); if (!segId || segId.v !== 0x18538067) return blob;
      const segSize = readVint(head, i + 4); i = i + 4 + segSize.len;
      while (i < head.length - 12) {
        const id = readVint(head, i, true); const size = readVint(head, i + id.len);
        if (!id || !size) return blob;
        const dataStart = i + id.len + size.len;
        if (id.v === 0x1549A966) { // Info
          const end = dataStart + size.v; if (end > head.length) return blob;
          let scale = 1000000; let j = dataStart;
          while (j < end) {
            const cid = readVint(head, j, true); const cs = readVint(head, j + cid.len); const cd = j + cid.len + cs.len;
            if (cid.v === 0x2AD7B1) { scale = 0; for (let k = 0; k < cs.v; k++) scale = scale * 256 + head[cd + k]; }
            if (cid.v === 0x4489) return blob; // already has a duration
            j = cd + cs.v;
          }
          const dur = new Uint8Array(11); dur[0] = 0x44; dur[1] = 0x89; dur[2] = 0x88;
          new DataView(dur.buffer).setFloat64(3, seconds * 1e9 / (scale || 1000000));
          const newSize = size.v + 11; const sz = new Uint8Array(8); sz[0] = 0x01; let n = newSize;
          for (let k = 7; k >= 1; k--) { sz[k] = n & 255; n = Math.floor(n / 256); }
          return new Blob([head.slice(0, i + id.len), sz, head.slice(dataStart, end), dur, blob.slice(end)], { type: blob.type });
        }
        if (id.v === 0x1F43B675 || size.unknown) return blob; // reached a Cluster without finding Info
        i = dataStart + size.v;
      }
    } catch (_) { /* leave the file as-is */ }
    return blob;
  }

  // Live preview synced to audio playback (no recording).
  function preview(opts) {
    const { canvas, buffer } = opts;
    const P = plan(buffer);
    const r = new Renderer(canvas);
    r.setup(Object.assign({}, opts.look, { beats: opts.beats, speechStart: P.speechStart, speechEnd: P.speechEnd, duration: P.total }));
    const ac = audioCtx();
    let src = null; let raf = 0; let startAt = 0; let playing = false;
    const api = {
      duration: P.total,
      drawAt(t) { r.draw(t); },
      async play(onEnd) {
        if (ac.state === 'suspended') await ac.resume();
        src = ac.createBufferSource(); src.buffer = buffer; src.connect(ac.destination);
        startAt = ac.currentTime + 0.05; src.start(startAt + LEAD, 0, P.audioDur); playing = true;
        const tick = () => {
          if (!playing) return;
          const t = Math.max(0, ac.currentTime - startAt);
          r.draw(t);
          if (opts.onTime) opts.onTime(t, P.total);
          if (t >= P.total) { api.stop(); if (onEnd) onEnd(); return; }
          raf = requestAnimationFrame(tick);
        };
        tick();
      },
      stop() { playing = false; cancelAnimationFrame(raf); if (src) { try { src.stop(); } catch (_) { /* ignore */ } src = null; } },
      get playing() { return playing; },
    };
    return api;
  }

  VTS.render = { fixWebmDuration, W, H, PRESETS, MAX_SECONDS, LEAD, TAIL, Renderer, buildTimeline, decodeBlob, silentBuffer, speechBounds, trimBuffer, pickVideoType, canRender, renderVideo, preview, plan, audioCtx };
}());
