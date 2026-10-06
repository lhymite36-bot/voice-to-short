/* Voice to Short v1.6 — extra caption styles + on-screen text overlays (callouts).
   Drawing/styling only: reads the timing the renderer already computed (beat.start/end, beat.words, beat.wordTimes,
   beat.chunks) and never changes it, so caption-timing fixes elsewhere apply to these styles automatically. */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {}); const S = VTS.scenes || {}; const C = VTS.comedy || {};
  const RENDER = VTS.render; const RP = RENDER && RENDER.Renderer && RENDER.Renderer.prototype; if (!RP) return;
  const FONT = 'Montserrat, "Arial Black", "Roboto", sans-serif'; const MONO = '"Courier New", "DejaVu Sans Mono", monospace'; const OLC = '#1d1b2a'; const TAU = Math.PI * 2;
  const clamp01 = (v) => Math.max(0, Math.min(1, v)); const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
  const easeOutBack = (x) => { x = clamp01(x); const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const bounceOut = (x) => { x = clamp01(x); const n = 7.5625; const d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; };
  function rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  const EMO_RE = /(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*)/gu;
  const plain = (w) => String(w || '').replace(EMO_RE, '').trim() || String(w || '');

  // ---------------- registry (the app pickers + pipeline read these) ----------------
  const CAPTION_STYLES = [
    ['tiktok', 'TikTok bold'], ['beast', 'Big & loud'], ['clean', 'Clean'], ['pop', 'Word pop'], ['karaoke', 'Karaoke'],
    ['hl-yellow', 'Highlight · yellow'], ['hl-green', 'Highlight · green'], ['hl-pink', 'Highlight · pink'], ['hl-blue', 'Highlight · blue'],
    ['boxed', 'Boxed sticker'], ['hormozi', 'Hormozi (outline + shadow)'], ['typewriter', 'Typewriter'], ['bounce', 'Bounce-in'], ['emoji', 'Emoji-accented'], ['none', 'None']];
  const TEXT_STYLES = [['none', 'None'], ['title-card', 'Title card'], ['step-badge', 'Numbered step badges'], ['pov', '“POV:” tag'], ['arrow-label', 'Arrow + label'], ['meme', 'Meme top/bottom text'], ['lower-third', 'Lower-third name bar']];
  const NEW_CAP = new Set(['hl-yellow', 'hl-green', 'hl-pink', 'hl-blue', 'boxed', 'hormozi', 'typewriter', 'bounce', 'emoji']);
  const HL = { 'hl-yellow': ['#ffe14d', OLC], 'hl-green': ['#3ddc84', OLC], 'hl-pink': ['#ff4fa3', '#ffffff'], 'hl-blue': ['#3b82f6', '#ffffff'] };
  const EMO_CH = { happy: '😄', sad: '😢', angry: '😤', anxious: '😰', calm: '😌', tired: '😴', surprised: '😮', shocked: '😱', 'eye-roll': '🙄', 'side-eye': '👀', 'crying-laughing': '😂', smug: '😏', 'dead-inside': '💀', panicking: '😵', blushing: '😳', rage: '🤬', facepalm: '🤦', confused: '🤔', disgusted: '🤢', nervous: '😅', proud: '😎', bored: '🥱', jealous: '😒', 'love-struck': '😍', determined: '💪', awkward: '😬', crying: '😭', neutral: '✨' };
  const emoFile = (ch) => (S.emojiFile ? S.emojiFile(ch) : null);
  const emoImg = (file) => { try { return file && S.EMO ? S.EMO.get(file) : null; } catch (_) { return null; } };
  function drawEmojiFile(ctx, file, x, y, size) { const img = emoImg(file); if (img) ctx.drawImage(img, x - size / 2, y - size / 2, size, size); return !!img; }

  // ---------------- shared helpers (read-only use of timing) ----------------
  function capPos(r) { const cap = r.LY.cap; let cy = cap.cy; const cx = r.cx; if (cx && cx.hookBottom && cx.hookVisible) cy = Math.max(cy, cx.hookBottom + (r.LY.aspect === '9:16' ? 120 : 70)); return { cx: cap.cx, cy, maxW: cap.maxW, size: cap.size }; }
  function chunksOf(b) { if (b.chunks) return b.chunks; if (C.chunkWords) return C.chunkWords(b.words); const out = []; for (let i = 0; i < b.words.length; i += 3) out.push(b.words.slice(i, i + 3).map((_, k) => i + k)); return out; }
  function activeWord(b, t) { let a = 0; b.wordTimes.forEach((wt, wi) => { if (t >= wt - 0.02) a = wi; }); return a; }
  const wordT = (b, wi) => b.wordTimes[wi] != null ? b.wordTimes[wi] : b.start;
  function layoutLines(ctx, words, maxW, space, widths) { const lines = []; let cur = []; let cw = 0; words.forEach((w, k) => { const ww = widths[k]; if (cur.length && cw + space + ww > maxW) { lines.push({ ks: cur, w: cw }); cur = []; cw = 0; } cur.push(k); cw += (cur.length > 1 ? space : 0) + ww; }); if (cur.length) lines.push({ ks: cur, w: cw }); return lines; }
  function outlined(ctx, txt, x, y, fill, lw, stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke || OLC; ctx.strokeText(txt, x, y); ctx.fillStyle = fill; ctx.fillText(txt, x, y); }

  function drawCaption16(r, t, style) {
    const i = r.beatAt(t); if (i < 0) return; const b = r.timeline[i]; if (!b || !b.words || !b.words.length) return;
    const ctx = r.ctx; const s = r.s; const P = capPos(r); const upper = r.o.captionCase === 'upper' || style === 'hormozi';
    const chunks = chunksOf(b); const active = activeWord(b, t); let ci = chunks.findIndex((c) => c.includes(active)); if (ci < 0) ci = 0; const ch = chunks[ci];
    const chStart = wordT(b, ch[0]); const words = ch.map((wi) => { const w = plain(b.words[wi]); return upper ? w.toUpperCase() : w; });
    const said = (k) => t >= wordT(b, ch[k]) - 0.02; const isActive = (k) => ch[k] === active;
    const big = style === 'hormozi' ? 132 : style === 'typewriter' ? 84 : style === 'boxed' ? 96 : 112;
    const size = big * s * P.size * (r.scenes ? 1 : 1.1); const weight = style === 'typewriter' ? '700 ' : '900 ';
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.font = weight + size + 'px ' + (style === 'typewriter' ? MONO : FONT);
    const space = ctx.measureText(' ').width; const maxW = P.maxW * s * (style === 'boxed' ? 0.86 : 0.98);
    const widths = words.map((w) => ctx.measureText(w).width * (style === 'hormozi' ? 1.06 : 1));
    const lines = layoutLines(ctx, words, maxW, space, widths); const lh = size * (style === 'boxed' ? 1.34 : 1.18);
    const top = P.cy * s - (lines.length - 1) * lh / 2; const cx0 = P.cx * s;
    const pos = []; lines.forEach((l, li) => { let x = cx0 - l.w / 2; l.ks.forEach((k) => { pos[k] = { x: x + widths[k] / 2, y: top + li * lh, w: widths[k] }; x += widths[k] + space; }); });
    const enter = easeOut((t - chStart) / 0.16);

    if (HL[style]) { // word-by-word highlight: the spoken word gets a coloured pill that glides between words
      const [bg, fg] = HL[style]; const pa = pos[ch.indexOf(active)] || pos[0];
      ctx.globalAlpha = enter;
      if (said(ch.indexOf(active) < 0 ? 0 : ch.indexOf(active))) { const k = easeOutBack((t - wordT(b, active)) / 0.18); const pw = pa.w + size * 0.36; const ph = size * 1.12; ctx.save(); ctx.translate(pa.x, pa.y); ctx.rotate(-0.025); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); rr(ctx, -pw / 2, -ph / 2, pw, ph, size * 0.22); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 6 * s; ctx.strokeStyle = OLC; ctx.stroke(); ctx.restore(); }
      words.forEach((w, k) => { const p = pos[k]; const on = isActive(k); if (on) { ctx.fillStyle = fg; if (fg === '#ffffff') outlined(ctx, w, p.x, p.y + size * 0.04, fg, size * 0.12); else ctx.fillText(w, p.x, p.y + size * 0.04); } else outlined(ctx, w, p.x, p.y + size * 0.04, said(k) ? '#ffffff' : 'rgba(255,255,255,0.72)', size * 0.16); });
    } else if (style === 'boxed') { // white sticker box, slight tilt, pops in per chunk
      const k = easeOutBack((t - chStart) / 0.22); const bw = Math.max.apply(null, lines.map((l) => l.w)) + size * 0.9; const bh = lines.length * lh + size * 0.4; const rot = ((ci % 3) - 1) * 0.035;
      ctx.save(); ctx.translate(cx0, P.cy * s); ctx.rotate(rot); ctx.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; rr(ctx, -bw / 2 + 10 * s, -bh / 2 + 14 * s, bw, bh, size * 0.28); ctx.fill();
      ctx.fillStyle = '#ffffff'; rr(ctx, -bw / 2, -bh / 2, bw, bh, size * 0.28); ctx.fill(); ctx.lineWidth = 7 * s; ctx.strokeStyle = OLC; ctx.stroke();
      words.forEach((w, k2) => { const p = pos[k2]; ctx.fillStyle = isActive(k2) ? (r.preset && r.preset.hi && r.preset.hi !== '#ffffff' ? '#e8335a' : '#e8335a') : said(k2) ? OLC : 'rgba(29,27,42,0.4)'; ctx.fillText(w, p.x - cx0, p.y - P.cy * s + size * 0.05); });
      ctx.restore();
    } else if (style === 'hormozi') { // heavy caps, thick outline + hard drop shadow, active word yellow and bigger, the rest white
      words.forEach((w, k) => { if (!said(k)) return; const p = pos[k]; const on = isActive(k); const pk = easeOutBack((t - wordT(b, ch[k])) / 0.14); const sc = (on ? 1.12 : 1) * (0.6 + 0.4 * pk);
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sc, sc); ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillText(w, size * 0.06, size * 0.1); outlined(ctx, w, 0, 0, on ? (ci % 2 ? '#3ddc84' : '#ffe14d') : '#ffffff', size * 0.2, '#000000'); ctx.restore(); });
    } else if (style === 'typewriter') { // letters appear at the pace of each word, with a blinking block cursor
      const pw = Math.max.apply(null, lines.map((l) => l.w)) + size * 1.1; const ph = lines.length * lh + size * 0.5;
      ctx.globalAlpha = Math.min(1, enter * 1.5); ctx.fillStyle = 'rgba(12,12,20,0.78)'; rr(ctx, cx0 - pw / 2, P.cy * s - ph / 2, pw, ph, size * 0.18); ctx.fill(); ctx.textAlign = 'left';
      let cur = null; words.forEach((w, k) => { const p = pos[k]; const t0 = wordT(b, ch[k]); const t1 = k + 1 < ch.length ? wordT(b, ch[k + 1]) : Math.min(b.end, t0 + 0.4); const n = t < t0 ? 0 : Math.ceil(w.length * clamp01((t - t0) / Math.max(0.12, (t1 - t0) * 0.85))); if (n <= 0) return; const sub = w.slice(0, n); const x = p.x - p.w / 2; ctx.fillStyle = isActive(k) ? '#7cff6b' : '#f5f5f5'; ctx.fillText(sub, x, p.y); cur = [x + ctx.measureText(sub).width + size * 0.06, p.y]; });
      if (!cur) cur = [pos[0].x - pos[0].w / 2, pos[0].y]; if (Math.floor(t * 2.4) % 2 === 0) { ctx.fillStyle = '#7cff6b'; ctx.fillRect(cur[0], cur[1] - size * 0.42, size * 0.42, size * 0.84); }
    } else if (style === 'bounce') { // each word drops in from above and bounces into place
      words.forEach((w, k) => { const t0 = wordT(b, ch[k]); if (t < t0 - 0.02) return; const p = pos[k]; const u = clamp01((t - t0 + 0.02) / 0.42); const dy = (1 - bounceOut(u)) * -size * 1.6; const sq = u > 0.3 && u < 0.5 ? 1 + Math.sin((u - 0.3) / 0.2 * Math.PI) * 0.12 : 1;
        ctx.save(); ctx.translate(p.x, p.y + dy); ctx.scale(1 + (sq - 1) * 0.4, 2 - sq); outlined(ctx, w, 0, 0, isActive(k) ? (r.preset && r.preset.hi) || '#ffe14d' : '#ffffff', size * 0.17); ctx.restore(); });
    } else if (style === 'emoji') { // TikTok-style chunk with an emoji riding on each side
      words.forEach((w, k) => { if (!said(k)) return; const p = pos[k]; const pk = easeOutBack((t - wordT(b, ch[k])) / 0.16); ctx.save(); ctx.translate(p.x, p.y); ctx.scale(0.7 + 0.3 * pk, 0.7 + 0.3 * pk); outlined(ctx, w, 0, 0, isActive(k) ? '#ffe14d' : '#ffffff', size * 0.17); ctx.restore(); });
      const f1 = (b.emojiFile && ch.includes(b.emojiWord)) ? b.emojiFile : null; const f2 = emoFile(EMO_CH[(b.sc && b.sc.emotion) || 'neutral'] || '✨');
      const L0 = lines[0]; const Ln = lines[lines.length - 1]; const es = size * 1.05; const k = easeOutBack((t - chStart) / 0.3); const wob = Math.sin(t * 6) * 0.12;
      [[f1 || f2, cx0 - L0.w / 2 - es * 0.75, top, -1], [f2 && f2 !== f1 ? f2 : f1 || f2, cx0 + Ln.w / 2 + es * 0.75, top + (lines.length - 1) * lh, 1]].forEach(([f, x, y, d]) => { if (!f) return; ctx.save(); ctx.translate(Math.max(es * 0.6, Math.min(r.canvas.width - es * 0.6, x)), y); ctx.rotate(d * wob); ctx.scale(k, k); drawEmojiFile(ctx, f, 0, 0, es); ctx.restore(); });
    }
    ctx.restore();
  }

  // ---------------- on-screen text overlays ----------------
  const firstWords = (txt, n) => String(txt || '').replace(EMO_RE, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, n).join(' ');
  function labelFor(b, mode) { const sc = b.sc || {}; if (mode !== 'own' && sc.callout) return sc.callout; if (b.emphasis) return b.emphasis; return firstWords(b.text, mode === 'own' ? 3 : 2); } // 'own': the scene already draws its callout bubble, so don't repeat it
  function pill(ctx, txt, x, y, size, bg, fg, align) { ctx.font = '900 ' + size + 'px ' + FONT; const w = ctx.measureText(txt).width + size * 0.9; const h = size * 1.5; const x0 = align === 'left' ? x : x - w / 2; rr(ctx, x0, y - h / 2, w, h, h / 2); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = size * 0.1; ctx.strokeStyle = OLC; ctx.stroke(); ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x0 + w / 2, y + size * 0.05); return w; }
  function wrap(ctx, txt, maxW) { const ws = txt.split(' '); const out = []; let cur = ''; ws.forEach((w) => { const n = cur ? cur + ' ' + w : w; if (cur && ctx.measureText(n).width > maxW) { out.push(cur); cur = w; } else cur = n; }); if (cur) out.push(cur); return out; }
  function drawTextStyle(r, t, style) {
    const i = r.beatAt(t); const tl = r.timeline || []; const b = i >= 0 ? tl[i] : null; const ctx = r.ctx; const s = r.s; const W = r.canvas.width; const H = r.canvas.height; const v = H > W * 1.4;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    if (style === 'title-card') { // a bold card for the first ~2.4 s, then it shrinks into a top tag for the rest of the video
      const title = String(r.o.textHook || (tl[0] && tl[0].text) || '').replace(/\s+/g, ' ').trim(); if (!title) { ctx.restore(); return; }
      const t0 = tl[0] ? tl[0].start : 0; const k = easeOutBack((t - t0 + 0.1) / 0.35); const out = easeOut((t - t0 - 2.4) / 0.4);
      ctx.font = '900 ' + 86 * s + 'px ' + FONT; const lines = wrap(ctx, title.toUpperCase(), 820 * s).slice(0, 4); const lh = 98 * s; const cw = 920 * s; const chh = lines.length * lh + 120 * s;
      if (out < 1) { ctx.save(); ctx.globalAlpha = 1 - out; ctx.translate(W / 2, (v ? 760 : 420) * s); ctx.rotate(-0.03); ctx.scale(k * (1 - out * 0.4), k * (1 - out * 0.4));
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(ctx, -cw / 2 + 14 * s, -chh / 2 + 18 * s, cw, chh, 40 * s); ctx.fill(); ctx.fillStyle = '#ffe14d'; rr(ctx, -cw / 2, -chh / 2, cw, chh, 40 * s); ctx.fill(); ctx.lineWidth = 9 * s; ctx.strokeStyle = OLC; ctx.stroke();
        ctx.fillStyle = OLC; lines.forEach((l, li) => ctx.fillText(l, 0, -chh / 2 + 60 * s + lh * (li + 0.5))); ctx.restore(); }
      if (out > 0) { ctx.globalAlpha = out; ctx.font = '900 ' + 40 * s + 'px ' + FONT; const tag = wrap(ctx, title.toUpperCase(), 760 * s)[0] + (wrap(ctx, title.toUpperCase(), 760 * s).length > 1 ? '…' : ''); pill(ctx, tag, W / 2, (v ? 150 : 70) * s, 40 * s, '#ffe14d', OLC); }
    } else if (style === 'step-badge' && b) { // numbered circle + label per beat, slides in from the left on each new beat
      const n = b.step > 0 ? b.step : i + 1; const k = easeOutBack((t - b.start) / 0.35); const x = (60 + (1 - k) * -260) * s; const y = (v ? 300 : 150) * s; const R = 66 * s;
      ctx.beginPath(); ctx.arc(x + R, y, R, 0, TAU); ctx.fillStyle = '#ff4d6d'; ctx.fill(); ctx.lineWidth = 8 * s; ctx.strokeStyle = OLC; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = '900 ' + 70 * s + 'px ' + FONT; ctx.fillText(String(n), x + R, y + 4 * s);
      ctx.textAlign = 'left'; const lab = firstWords(b.text, 4).toUpperCase(); ctx.font = '900 ' + 46 * s + 'px ' + FONT; const lw = Math.min(640 * s, ctx.measureText(lab).width) + 60 * s;
      rr(ctx, x + R * 2 + 14 * s, y - 40 * s, lw, 80 * s, 20 * s); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke(); ctx.fillStyle = OLC; ctx.fillText(lab, x + R * 2 + 44 * s, y + 3 * s, 640 * s);
    } else if (style === 'pov') { // "POV:" tag pinned near the top for the whole video
      const raw = String(r.o.textHook || (tl[0] && tl[0].text) || '').replace(/^\s*pov\s*:?\s*/i, '').replace(/\s+/g, ' ').trim(); const k = easeOutBack((t - (tl[0] ? tl[0].start : 0) + 0.15) / 0.4);
      ctx.save(); ctx.translate(W / 2, (v ? 210 : 90) * s); ctx.scale(k, k); ctx.font = '900 ' + 44 * s + 'px ' + FONT; const lines = wrap(ctx, raw, 700 * s).slice(0, 2);
      const tw = Math.max.apply(null, lines.map((l) => ctx.measureText(l).width).concat([0])); const povW = 150 * s; const bw = povW + tw + 70 * s; const bh = Math.max(1, lines.length) * 56 * s + 40 * s;
      rr(ctx, -bw / 2, -bh / 2, bw, bh, 26 * s); ctx.fillStyle = 'rgba(15,15,25,0.82)'; ctx.fill(); rr(ctx, -bw / 2 + 12 * s, -bh / 2 + 12 * s, povW - 10 * s, bh - 24 * s, 18 * s); ctx.fillStyle = '#ff2d55'; ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = '900 ' + 46 * s + 'px ' + FONT; ctx.fillText('POV:', -bw / 2 + 7 * s + povW / 2, 3 * s); ctx.textAlign = 'left'; ctx.font = '800 ' + 44 * s + 'px ' + FONT;
      lines.forEach((l, li) => ctx.fillText(l, -bw / 2 + povW + 30 * s, (li - (lines.length - 1) / 2) * 56 * s + 3 * s)); ctx.restore();
    } else if (style === 'arrow-label' && b && r.scenes) { // hand-drawn arrow pointing at the main character with a short label
      const heads = (r.stage && r.stage.lastHeads) || []; const h = heads[0]; if (h && C.inWorld) { const lab = labelFor(b, 'own').toUpperCase(); const k = easeOut((t - b.start - 0.15) / 0.45);
        C.inWorld(r, (c2) => { const dir = h.x > 540 ? -1 : 1; const lx = h.x + dir * 300; const ly = Math.max(560, h.y - 300); const tx = h.x + dir * (h.r || 90) * 1.15; const ty = h.y - (h.r || 90) * 0.4;
          c2.save(); c2.lineCap = 'round'; c2.lineJoin = 'round'; c2.strokeStyle = '#ffffff'; c2.lineWidth = 14; const mx = (lx + tx) / 2 + dir * 70; const my = (ly + ty) / 2 - 60;
          const pt = (u) => [(1 - u) * (1 - u) * lx + 2 * (1 - u) * u * mx + u * u * tx, (1 - u) * (1 - u) * (ly + 50) + 2 * (1 - u) * u * my + u * u * ty];
          [['#1d1b2a', 24], ['#ffffff', 12]].forEach(([col, lw]) => { c2.strokeStyle = col; c2.lineWidth = lw; c2.beginPath(); for (let q = 0; q <= 24 * k; q++) { const p = pt(q / 24); if (q === 0) c2.moveTo(p[0], p[1]); else c2.lineTo(p[0], p[1]); } c2.stroke();
            if (k > 0.95) { const a = pt(1); const p2 = pt(0.9); const ang = Math.atan2(a[1] - p2[1], a[0] - p2[0]); c2.beginPath(); c2.moveTo(a[0] - Math.cos(ang - 0.5) * 46, a[1] - Math.sin(ang - 0.5) * 46); c2.lineTo(a[0], a[1]); c2.lineTo(a[0] - Math.cos(ang + 0.5) * 46, a[1] - Math.sin(ang + 0.5) * 46); c2.stroke(); } });
          const pk = easeOutBack((t - b.start) / 0.3); c2.translate(lx, ly); c2.rotate(-dir * 0.06); c2.scale(pk, pk); pill(c2, lab, 0, 0, 48, '#ffe14d', OLC); c2.restore(); }); }
    } else if (style === 'meme' && b) { // classic impact-style top/bottom text (replaces the caption)
      const words = b.words.map(plain).filter(Boolean); const cut = Math.max(1, Math.ceil(words.length / 2)); const topT = words.slice(0, cut).join(' ').toUpperCase(); const botT = words.slice(cut).join(' ').toUpperCase();
      const k = easeOut((t - b.start) / 0.15); const midT = b.start + (b.end - b.start) * 0.45; ctx.globalAlpha = k; ctx.font = '900 ' + 92 * s + 'px Impact, "Anton", ' + FONT;
      const drawBlock = (txt, y0, down) => { const lines = wrap(ctx, txt, 960 * s).slice(0, 3); lines.forEach((l, li) => { const y = down ? y0 + li * 104 * s : y0 - (lines.length - 1 - li) * 104 * s; outlined(ctx, l, W / 2, y, '#ffffff', 16 * s, '#000000'); }); };
      drawBlock(topT, (v ? 260 : 110) * s, true); if (botT && t >= midT - 0.05) drawBlock(botT, H - (v ? 420 : 110) * s, false);
    } else if (style === 'lower-third' && b) { // broadcast-style name bar, re-slides on every new beat
      const k = easeOut((t - b.start) / 0.4); const y = H - (v ? 560 : 190) * s; const x = (-700 + 760 * k) * s; const name = String(r.o.handle || 'Quiet Brain').replace(/^@?/, '@'); const sub = labelFor(b);
      ctx.textAlign = 'left'; ctx.font = '900 ' + 50 * s + 'px ' + FONT; const nw = ctx.measureText(name).width; ctx.font = '700 ' + 38 * s + 'px ' + FONT; const sw = ctx.measureText(sub).width; const w = Math.max(nw, sw) + 90 * s;
      ctx.fillStyle = r.preset && r.preset.hi ? r.preset.hi : '#ffe14d'; ctx.fillRect(x - 24 * s, y - 64 * s, 18 * s, 150 * s);
      ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fillRect(x, y - 64 * s, w, 78 * s); ctx.fillStyle = 'rgba(20,20,32,0.9)'; ctx.fillRect(x, y + 14 * s, w * 0.9, 72 * s);
      ctx.fillStyle = OLC; ctx.font = '900 ' + 50 * s + 'px ' + FONT; ctx.fillText(name, x + 30 * s, y - 24 * s); ctx.fillStyle = '#ffffff'; ctx.font = '700 ' + 38 * s + 'px ' + FONT; ctx.fillText(sub, x + 30 * s, y + 51 * s);
    }
    ctx.restore();
  }

  // ---------------- renderer hooks (styling only; the caption timing code is untouched) ----------------
  const baseCaptions = RP.drawCaptions;
  RP.drawCaptions = function (t) {
    const ts = this.o.textStyle || 'none'; const st = this.o.captionStyle;
    if (ts !== 'meme') { if (NEW_CAP.has(st)) drawCaption16(this, t, st); else baseCaptions.call(this, t); }
    if (ts && ts !== 'none') drawTextStyle(this, t, ts);
  };
  const basePrepare = RP.prepare;
  RP.prepare = async function () {
    const n = await basePrepare.apply(this, arguments);
    if (this.o.captionStyle === 'emoji' && S.EMO && S.EMO.load) { const files = new Set(); (this.timeline || []).forEach((b) => { const f = emoFile(EMO_CH[(b.sc && b.sc.emotion) || 'neutral'] || '✨'); if (f) files.add(f); }); const f0 = emoFile('✨'); if (f0) files.add(f0); try { await S.EMO.load(Array.from(files)); } catch (_) { /* optional */ } }
    return n;
  };
  VTS.captions16 = { CAPTION_STYLES, TEXT_STYLES, CAPTION_IDS: CAPTION_STYLES.map((x) => x[0]), TEXT_IDS: TEXT_STYLES.map((x) => x[0]), drawCaption16, drawTextStyle };
})();
