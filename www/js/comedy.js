/* v1.4 "Quiet Brain Club" comedy layer: a cast (You, your Brain, friend, boss, crush, mom, therapist, cat), meme overlays,
   reaction stickers, kinetic caption presets, a pattern-interrupt "director" (punch-ins, whips, flashes every ~2.5 s),
   first-frame text hook, CTA sticker, loop ending, safe-zone guides, cover export and hand-drawn psychology props.
   Everything is drawn on the canvas, so the effects are identical in the preview and in the export. */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {});
  const S = VTS.scenes; if (!S || !S.Stage) return;
  const ST = S.Stage.prototype;
  const TAU = Math.PI * 2; const W = 1080; const H = 1920;
  const FONT = 'Montserrat, "Arial Black", "Roboto", sans-serif';
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
  const easeInOut = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const easeOutBack = (x) => { x = clamp01(x); const c1 = 1.9; const c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const hashStr = (s) => { let h = 0; s = String(s || ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
  function rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function wrap(ctx, text, maxW) { const words = String(text || '').split(/\s+/).filter(Boolean); const lines = []; let cur = ''; words.forEach((w) => { const n = cur ? cur + ' ' + w : w; if (ctx.measureText(n).width > maxW && cur) { lines.push(cur); cur = w; } else cur = n; }); if (cur) lines.push(cur); return lines; }
  const OLC = '#1d1b2a';

  // ======================= vocabulary (kept small for the Gemini schema) =======================
  const SPEAKERS = ['narrator', 'me', 'brain', 'friend', 'boss', 'crush', 'mom', 'therapist', 'cat'];
  const SPEAKER_LABELS = { narrator: 'Narrator', me: 'You', brain: 'Your Brain', friend: 'Friend', boss: 'Boss', crush: 'Crush', mom: 'Mom', therapist: 'Therapist', cat: 'Cat' };
  const FX = ['none', 'zoom-punch', 'freeze', 'spotlight', 'impact', 'split', 'before-after', 'chat', 'notification', 'loading', 'xp', 'checklist', 'rating', 'argument', 'myth-fact', 'countdown'];
  const FX_LABELS = { none: 'None', 'zoom-punch': 'Zoom punch on face', freeze: 'Record-scratch freeze "yep, that\'s me"', spotlight: 'Dramatic spotlight', impact: 'Impact frame', split: 'Split screen: expectation vs reality',
    'before-after': 'Before / after', chat: 'Text-message chat', notification: 'Notification pop-up', loading: '"Loading…" brain bar', xp: 'XP / level-up bar', checklist: 'Checklist ticks', rating: 'Star rating',
    argument: 'Thought-bubble argument', 'myth-fact': 'Myth / fact stamp', countdown: 'Countdown timer' };
  const SFX_FOR_FX = { 'zoom-punch': 'boom', freeze: 'scratch', spotlight: 'riser', impact: 'boom', split: 'whoosh', 'before-after': 'whoosh', chat: 'typing', notification: 'notif', loading: 'tick', xp: 'levelup', checklist: 'ding', rating: 'pop', argument: 'pop', 'myth-fact': 'wrong', countdown: 'tick' };
  const STICKERS = ['BRUH', 'WAIT WHAT', 'NOT AGAIN', '💀', 'SIR??', 'NAH', 'HELLO??', 'BE SO FR', '😭', 'IT ME', 'RED FLAG', 'OOF', 'UNWELL', 'DELULU', 'LMAO', 'THE AUDACITY', '🤡', '😳', '🫠', '✨ HEALING ✨'];
  const INTENSITY = { chill: { gap: 4.2, label: 'Chill' }, punchy: { gap: 2.6, label: 'Punchy' }, chaotic: { gap: 1.7, label: 'Chaotic' } };
  const CAPTION_STYLES = [['tiktok', 'TikTok bold'], ['beast', 'Big & loud'], ['clean', 'Clean'], ['pop', 'Pop (classic)'], ['karaoke', 'Karaoke']];
  const CTAS = ['Follow if your brain does this too 🧠', 'Comment your 3 a.m. thought 👇', 'Send this to your overthinker 📲', 'Which one are you? 1 or 2? 👇', 'Save this for your next spiral 📌', 'Tag the friend who needs this 👀'];

  // ======================= cast =======================
  const CASTV = { boss: 2, crush: 3, mom: 4, therapist: 5 };
  const CAST_PAL = {
    2: { skin: '#e8b791', skinS: '#cc956d', hair: '#8c8c96', top: '#39415a', pants: '#262b3b', shoe: '#17171c', long: false, who: 'boss' },
    3: { skin: '#f4c7a6', skinS: '#dca07c', hair: '#8a4a2b', top: '#ff8fb3', pants: '#3e4b80', shoe: '#ffffff', long: true, who: 'crush' },
    4: { skin: '#d9a17b', skinS: '#bf845f', hair: '#5b3a2e', top: '#9b7bd4', pants: '#4a4066', shoe: '#6b4f3a', long: false, who: 'mom' },
    5: { skin: '#8e5b3c', skinS: '#74462c', hair: '#1c1718', top: '#3f8577', pants: '#2f3342', shoe: '#2b2b33', long: false, who: 'therapist' },
  };
  const basePal2 = ST.pal2;
  ST.pal2 = function (variant, a) {
    const v = CAST_PAL[variant]; if (!v) return basePal2.call(this, variant, a);
    const mix = (h1, h2, k) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const x = p(h1); const y = p(h2); return '#' + x.map((c, i) => Math.round(c + (y[i] - c) * k).toString(16).padStart(2, '0')).join(''); };
    const pal = { skin: this.c(v.skin), skinS: this.c(v.skinS), hair: this.c(v.hair), top: this.c(v.top), topS: this.c(mix(v.top, '#1a1030', 0.22)), pants: this.c(v.pants), shoe: this.c(v.shoe), long: v.long, blush: this.ca('#ff6f7d', 0.42), who: v.who };
    const st = this;
    if (v.who === 'therapist') pal.headBehind = (ctx) => { ctx.beginPath(); for (let k = 0; k < 11; k++) { const ang = Math.PI + k / 10 * Math.PI; ctx.moveTo(Math.cos(ang) * 104 + 30, Math.sin(ang) * 96 - 18); ctx.arc(Math.cos(ang) * 104, Math.sin(ang) * 96 - 18, 30, 0, TAU); } st.fs(ctx, pal.hair); };
    if (v.who === 'mom') pal.headBehind = (ctx) => { ctx.beginPath(); ctx.arc(0, -112, 40, 0, TAU); st.fs(ctx, pal.hair); };
    pal.headAfter = (ctx, st2, face, t, f) => {
      const fx = (f || 0) * 24; ctx.lineCap = 'round';
      if (v.who === 'boss' || v.who === 'therapist') { // glasses
        ctx.lineWidth = 6; ctx.strokeStyle = OLC; [-1, 1].forEach((s) => { ctx.beginPath(); rr(ctx, fx + s * 32 - 25, -8, 50, 38, 12); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill(); ctx.stroke(); }); ctx.beginPath(); ctx.moveTo(fx - 7, 6); ctx.lineTo(fx + 7, 6); ctx.stroke();
      }
      if (v.who === 'boss') { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(-20, -70, 22, -2.6, -1.8); ctx.stroke(); } // shiny forehead
      if (v.who === 'crush' && face.eyes !== 'closed') { for (let k = 0; k < 2; k++) { const p = (t * 0.8 + k * 0.5) % 1; ctx.save(); ctx.globalAlpha = 1 - p; ctx.translate(fx + 96 + k * 16, -70 - p * 60); ctx.scale(0.5 + p * 0.3, 0.5 + p * 0.3); heart(ctx, st2.e('#ff5c8a')); ctx.restore(); } }
      if (v.who === 'mom') { ctx.fillStyle = st2.e('#ff6f91'); ctx.beginPath(); ctx.arc(-26, -102, 10, 0, TAU); ctx.fill(); }
    };
    return pal;
  };
  function heart(ctx, color) { ctx.beginPath(); ctx.moveTo(0, 18); ctx.bezierCurveTo(-34, -6, -24, -36, 0, -20); ctx.bezierCurveTo(24, -36, 34, -6, 0, 18); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OLC; ctx.stroke(); }

  // --- your Brain: pink, big eyes, noodle arms and legs, sneakers ---
  function brainShape(st, ctx, t, emotion) {
    const pink = st.c(emotion === 'rage' ? '#ff7f8f' : '#ff9ec4'); const dark = st.c(emotion === 'rage' ? '#d9465f' : '#e0679a');
    const bumps = [[-92, -6, 44], [-70, -52, 46], [-24, -78, 48], [26, -80, 48], [72, -54, 46], [94, -8, 44], [78, 40, 44], [36, 62, 44], [-14, 64, 44], [-60, 50, 44], [0, -10, 80]];
    ctx.save(); ctx.lineJoin = 'round';
    ctx.beginPath(); bumps.forEach(([x, y, r]) => { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }); ctx.lineWidth = st.lw * 2.2; ctx.strokeStyle = st.OL; ctx.stroke();
    ctx.fillStyle = pink; ctx.fill();
    // shading + gyri
    ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(160,40,90,0.18)'; ctx.beginPath(); ctx.ellipse(40, 70, 150, 70, -0.2, 0, TAU); ctx.fill(); ctx.restore();
    ctx.strokeStyle = dark; ctx.lineWidth = 6; ctx.lineCap = 'round';
    [[-96, -30, -64, -40, -60, -70], [-40, -96, -30, -66, -6, -70], [30, -100, 20, -70, 44, -58], [66, -80, 96, -60, 104, -30], [-110, 20, -84, 16, -80, 40], [104, 16, 86, 24, 96, 50], [0, -104, 6, -88, 0, -70]].forEach((c) => { ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.quadraticCurveTo(c[2], c[3], c[4], c[5]); ctx.stroke(); });
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(-40, -60, 30, -2.6, -1.6); ctx.stroke();
    ctx.restore();
  }
  const brainPal = (st, emotion) => ({ skin: st.c('#ff9ec4'), skinS: st.c('#e0679a'), hair: st.c('#e0679a'), top: st.c('#ff9ec4'), topS: st.c('#e0679a'), pants: st.c('#ff9ec4'), shoe: st.c('#ffffff'), long: false, blush: st.ca('#ff3d7f', 0.45), headShape: (ctx, s2, face, t) => brainShape(s2, ctx, t, emotion) });
  function drawBrain(st, ctx, x, groundY, scale, pose, emotion, t, o) {
    const bob = Math.sin(t * 3.1 + 1) * 10; const talk = pose === 'talking' || pose === 'arguing' || pose === 'presenting';
    const sq = 1 + Math.sin(t * (talk ? 9 : 2.4)) * (talk ? 0.025 : 0.012);
    const cy = groundY - 300 * scale + bob * scale; const lw = st.lw;
    const limb = (pts, w, col) => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); ctx.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]); ctx.lineCap = 'round'; ctx.strokeStyle = st.OL; ctx.lineWidth = w + lw * 2; ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
    const pinkD = st.c('#f27fae');
    ctx.save(); ctx.translate(x, 0);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, groundY + 4, 110 * scale, 20 * scale, 0, 0, TAU); ctx.fill();
    // legs with sneakers (little hop when celebrating)
    const hop = pose === 'celebrating' ? Math.abs(Math.sin(t * 6)) * 30 : 0;
    [-1, 1].forEach((s) => { const kx = s * 44 * scale + (s * Math.sin(t * 5) * (pose === 'walking' ? 18 : 0)); limb([s * 30 * scale, cy + 90 * scale, kx, groundY - 70 * scale - hop, s * 44 * scale, groundY - 14 * scale - hop], 16 * scale, pinkD); ctx.beginPath(); ctx.ellipse(s * 54 * scale, groundY - 6 * scale - hop, 30 * scale, 16 * scale, 0, 0, TAU); st.fs(ctx, st.c('#ffffff')); ctx.fillStyle = st.c('#ff5c8a'); ctx.fillRect(s * 54 * scale - 26 * scale, groundY - 10 * scale - hop, 52 * scale, 5 * scale); });
    // arms by pose
    const arm = (s, ex, ey) => limb([s * 104 * scale, cy + 10 * scale, s * 140 * scale + (ex - s * 150) * 0.3 * scale, cy + ((ey + 10) / 2) * scale, ex * scale, cy + ey * scale], 15 * scale, pinkD);
    const hand = (ex, ey) => { ctx.beginPath(); ctx.arc(ex * scale, cy + ey * scale, 17 * scale, 0, TAU); st.fs(ctx, st.c('#ffffff')); };
    let aR = [165, 60]; let aL = [-165, 60];
    const wave = Math.sin(t * 7);
    if (talk) { aR = [180, -40 + wave * 30]; aL = [-150, 70]; }
    if (pose === 'arguing') { aR = [190, -80 + wave * 40]; aL = [-190, -60 - wave * 40]; }
    if (pose === 'celebrating') { aR = [150, -170 + wave * 10]; aL = [-150, -170 - wave * 10]; }
    if (emotion === 'smug') { aR = [110, 80]; aL = [-110, 80]; }
    if (emotion === 'panicking' || emotion === 'shocked') { aR = [120, -150 + wave * 15]; aL = [-120, -150 - wave * 15]; }
    if (emotion === 'facepalm') { aR = [40, 10]; }
    const armsFront = emotion === 'facepalm';
    if (!armsFront) { arm(1, aR[0], aR[1]); arm(-1, aL[0], aL[1]); hand(aR[0], aR[1]); hand(aL[0], aL[1]); }
    // body = brain head
    const face = null; // eslint-friendly placeholder
    ctx.save(); ctx.translate(0, cy); ctx.scale(scale * 1.25, scale * 1.25 * sq); ctx.rotate(Math.sin(t * 1.7) * 0.05);
    st.head(ctx, brainPal(st, emotion), faceOf(emotion, pose, talk), t, { facing: 0, look: o && o.look, mouth: talk ? 'talk' : null, seed: 5 });
    ctx.restore();
    if (armsFront) { arm(1, aR[0], aR[1]); arm(-1, aL[0], aL[1]); hand(aR[0], aR[1]); hand(aL[0], aL[1]); }
    ctx.restore();
    void face;
    const head = { x, y: cy, r: 120 * scale };
    return { head, handR: [x + aR[0] * scale, cy + aR[1] * scale], handL: [x + aL[0] * scale, cy + aL[1] * scale], hip: [x, cy + 90 * scale], scale, top: cy - 130 * scale, tilt: 0, skin: '#ffffff', sp: {} };
  }
  // Face spec for the brain / cat. scenes.js keeps faceFor private, so borrow it through a tiny probe character draw is overkill:
  // we mirror the table here for the expressions that matter.
  function faceOf(emotion, pose, talk) {
    const f = { eyes: 'dot', brow: [0, 0], mouth: talk ? 'talk' : 'smallsmile', blush: false };
    const set = (o) => Object.assign(f, o);
    switch (emotion) {
      case 'happy': set({ eyes: 'happy', mouth: 'grin', blush: true }); break;
      case 'sad': set({ brow: [-12, 8], mouth: 'frown', tear: true }); break;
      case 'anxious': set({ eyes: 'wide', brow: [-14, 8], mouth: 'wavy', sweat: true, dart: true }); break;
      case 'angry': set({ brow: [16, -8], mouth: 'grit', steam: true }); break;
      case 'tired': set({ eyes: 'half', mouth: 'flat', bags: true }); break;
      case 'surprised': set({ eyes: 'wide', brow: [-18, -18], mouth: 'o' }); break;
      case 'calm': set({ eyes: 'closed', mouth: 'smallsmile' }); break;
      case 'eye-roll': set({ eyes: 'roll', brow: [-6, -10], mouth: 'flat' }); break;
      case 'side-eye': set({ eyes: 'side', brow: [10, -4], mouth: 'hmm' }); break;
      case 'shocked': set({ eyes: 'shock', brow: [-22, -22], mouth: 'scream', sweat: true }); break;
      case 'crying-laughing': set({ eyes: 'happy', brow: [-10, -6], mouth: 'grin', laughTears: true, blush: true }); break;
      case 'smug': set({ eyes: 'half', brow: [6, -12], mouth: 'smirk', blush: true }); break;
      case 'dead-inside': set({ eyes: 'dead', mouth: 'flat', bags: true }); break;
      case 'panicking': set({ eyes: 'wide', brow: [-14, 8], mouth: 'wavy', sweat: true, sweats: true, dart: true, fastDart: true }); break;
      case 'blushing': set({ eyes: 'dot', brow: [-8, 2], mouth: 'smallsmile', blush: true, blushBig: true, lookDown: true }); break;
      case 'rage': set({ eyes: 'dot', brow: [16, -12], mouth: 'grit', steam: true }); break;
      case 'facepalm': set({ eyes: 'closed', brow: [-8, 6], mouth: 'flat' }); break;
      default: break;
    }
    if (talk && !['scream', 'grin'].includes(f.mouth)) f.mouth = 'talk';
    return f;
  }
  // --- the cat: sits and judges ---
  function drawCat(st, ctx, x, groundY, scale, pose, emotion, t) {
    const s = scale * 0.95; const fur = st.c('#f2a65a'); const furD = st.c('#d9843a'); const OL = st.OL; const lw = st.lw;
    ctx.save(); ctx.translate(x, groundY); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, 4, 120, 18, 0, 0, TAU); ctx.fill();
    // tail
    const sw = Math.sin(t * (emotion === 'rage' || emotion === 'angry' ? 7 : 2.2)) * 0.5;
    ctx.beginPath(); ctx.moveTo(60, -20); ctx.bezierCurveTo(150, -10, 150 + sw * 40, -120, 110 + sw * 60, -170); ctx.lineCap = 'round'; ctx.strokeStyle = OL; ctx.lineWidth = 30 + lw * 2; ctx.stroke(); ctx.strokeStyle = fur; ctx.lineWidth = 30; ctx.stroke();
    // body
    ctx.beginPath(); ctx.ellipse(0, -80, 88, 92, 0, 0, TAU); st.fs(ctx, fur);
    ctx.beginPath(); ctx.ellipse(0, -60, 48, 62, 0, 0, TAU); ctx.fillStyle = st.c('#fff1dc'); ctx.fill();
    [-34, 34].forEach((px) => { ctx.beginPath(); ctx.ellipse(px, -8, 26, 16, 0, 0, TAU); st.fs(ctx, fur); });
    // head
    const hy = -210 + Math.sin(t * 1.3) * 3; const tilt = emotion === 'side-eye' || emotion === 'smug' ? -0.12 : Math.sin(t * 0.9) * 0.04;
    ctx.save(); ctx.translate(0, hy); ctx.rotate(tilt);
    const spikes = emotion === 'shocked' || emotion === 'panicking';
    [-1, 1].forEach((k) => { ctx.beginPath(); ctx.moveTo(k * 36, -52); ctx.lineTo(k * 78, -106); ctx.lineTo(k * 88, -34); ctx.closePath(); st.fs(ctx, fur); ctx.beginPath(); ctx.moveTo(k * 48, -56); ctx.lineTo(k * 74, -88); ctx.lineTo(k * 78, -48); ctx.closePath(); ctx.fillStyle = st.c('#ffb3c1'); ctx.fill(); });
    if (spikes) { ctx.beginPath(); for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; const r = k % 2 ? 90 : 112; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.85); } ctx.closePath(); st.fs(ctx, fur); }
    else { ctx.beginPath(); ctx.ellipse(0, 0, 92, 78, 0, 0, TAU); st.fs(ctx, fur); }
    ctx.strokeStyle = furD; ctx.lineWidth = 7; [-18, 0, 18].forEach((dx) => { ctx.beginPath(); ctx.moveTo(dx, -74); ctx.lineTo(dx * 0.8, -52); ctx.stroke(); });
    // eyes
    const half = emotion === 'smug' || emotion === 'side-eye' || emotion === 'tired' || emotion === 'dead-inside' || emotion === 'eye-roll';
    [-1, 1].forEach((k) => {
      ctx.save(); ctx.translate(k * 34, -4);
      if (emotion === 'happy' || emotion === 'crying-laughing') { ctx.beginPath(); ctx.moveTo(-14, 6); ctx.quadraticCurveTo(0, -12, 14, 6); ctx.lineWidth = 7; ctx.strokeStyle = OL; ctx.stroke(); }
      else { ctx.beginPath(); ctx.ellipse(0, 0, 20, 22, 0, 0, TAU); ctx.fillStyle = st.c('#c9f06b'); ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = OL; ctx.stroke(); const pw = spikes ? 4 : 7; const px = emotion === 'side-eye' ? -9 : 0; ctx.beginPath(); ctx.ellipse(px, 2, pw, spikes ? 8 : 16, 0, 0, TAU); ctx.fillStyle = OL; ctx.fill();
        if (half) { ctx.beginPath(); ctx.rect(-24, -26, 48, 22); ctx.fillStyle = fur; ctx.fill(); ctx.beginPath(); ctx.moveTo(-22, -4); ctx.lineTo(22, -4); ctx.lineWidth = 6; ctx.stroke(); } }
      ctx.restore();
    });
    // nose, mouth, whiskers
    ctx.beginPath(); ctx.moveTo(-9, 22); ctx.lineTo(9, 22); ctx.lineTo(0, 32); ctx.closePath(); ctx.fillStyle = st.c('#ff8fa3'); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OL; ctx.stroke();
    ctx.lineWidth = 5; ctx.beginPath(); if (spikes) { ctx.ellipse(0, 50, 12, 16, 0, 0, TAU); ctx.fillStyle = st.c('#5a1e2c'); ctx.fill(); ctx.stroke(); } else { ctx.moveTo(-18, 38); ctx.quadraticCurveTo(-9, 48, 0, 36); ctx.quadraticCurveTo(9, 48, 18, 38); ctx.stroke(); }
    ctx.lineWidth = 3.5; [-1, 1].forEach((k) => { for (let q = -1; q <= 1; q++) { ctx.beginPath(); ctx.moveTo(k * 40, 30 + q * 8); ctx.lineTo(k * 104, 22 + q * 16); ctx.stroke(); } });
    if (emotion === 'rage' || emotion === 'angry') { ctx.fillStyle = st.e('#ff3b3b'); ctx.font = '900 60px ' + FONT; ctx.fillText('💢', 50, -60); }
    ctx.restore(); ctx.restore();
    const hwY = groundY + hy * s;
    return { head: { x, y: hwY, r: 90 * s }, handR: [x + 34 * s, groundY - 8 * s], handL: [x - 34 * s, groundY - 8 * s], hip: [x, groundY - 80 * s], scale: s, top: hwY - 100 * s, tilt: 0, skin: '#f2a65a', sp: {} };
  }

  // Which cast member is drawn where. drawShot hands us the scene; count 2 draws variant 1 as the second character.
  const REACT = { angry: 'shocked', rage: 'shocked', smug: 'eye-roll', happy: 'side-eye', 'crying-laughing': 'dead-inside', anxious: 'side-eye', panicking: 'side-eye', sad: 'blushing', surprised: 'smug', neutral: 'side-eye', calm: 'smug', tired: 'eye-roll', 'dead-inside': 'panicking', shocked: 'smug', 'side-eye': 'smug', 'eye-roll': 'rage', blushing: 'smug', facepalm: 'smug' };
  const baseCharacter = ST.character;
  ST.character = function (ctx, x, groundY, scale, pose, emotion, t, o) {
    o = o || {}; const sc = this._scene;
    if (!sc || (!sc.cast1 && !sc.cast2) || o.castDone) { const A0 = baseCharacter.call(this, ctx, x, groundY, scale, pose, emotion, t, o); this._heads.push(A0.head); return A0; }
    const second = o.variant === 1; const who = second ? (sc.cast2 || 'friend') : (sc.cast1 || 'me');
    let em = emotion; let ps = pose;
    if (sc.count === 2 && sc.speaker && sc.speaker !== 'narrator' && pose !== 'hugging') {
      const speaking = who === sc.speaker; if (pose !== 'arguing') ps = speaking ? 'talking' : 'idle';
      if (!speaking) em = sc.emotion2 || REACT[emotion] || 'side-eye';
    }
    let A;
    if (who === 'brain') A = drawBrain(this, ctx, x, groundY, scale * (second ? 0.92 : 1.05), ps, em, t, o);
    else if (who === 'cat') A = drawCat(this, ctx, x, groundY, scale, ps, em, t);
    else A = baseCharacter.call(this, ctx, x, groundY, scale, ps, em, t, Object.assign({}, o, { variant: CASTV[who] || (second ? 1 : 0), castDone: true }));
    if (who === 'boss' || who === 'therapist' || who === 'mom') castBody(this, ctx, who, A, t);
    A.who = who; this._heads.push(Object.assign({ who }, A.head));
    return A;
  };
  function castBody(st, ctx, who, A, t) {
    if (!A || !A.head) return; const s = A.scale || 1; const x = A.head.x; const y = A.head.y;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(A.tilt || 0);
    if (who === 'boss') { ctx.beginPath(); ctx.moveTo(-14, 112); ctx.lineTo(14, 112); ctx.lineTo(20, 210); ctx.lineTo(0, 236); ctx.lineTo(-20, 210); ctx.closePath(); st.fs(ctx, st.c('#e2443d'), 4); ctx.beginPath(); ctx.moveTo(-40, 104); ctx.lineTo(0, 130); ctx.lineTo(40, 104); ctx.lineWidth = 10; ctx.strokeStyle = st.c('#ffffff'); ctx.stroke(); }
    if (who === 'mom') { ctx.fillStyle = st.c('#fff7e8'); for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.arc(k * 14, 118 + Math.abs(k) * -2 + k * k * 1.5, 7, 0, TAU); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OLC; ctx.stroke(); } }
    if (who === 'therapist') { ctx.save(); ctx.translate(-120, 250); ctx.rotate(0.2); rr(ctx, -40, -54, 80, 108, 8); st.fs(ctx, st.c('#fff8e6'), 4); ctx.strokeStyle = st.c('#9aa3b5'); ctx.lineWidth = 4; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(-26, -30 + k * 20); ctx.lineTo(26, -30 + k * 20); ctx.stroke(); } ctx.fillStyle = st.c('#e2443d'); ctx.fillRect(-40, -54, 80, 10); ctx.restore(); }
    ctx.restore();
  }
  const baseDrawShot = ST.drawShot;
  ST.drawShot = function (ctx, sh) {
    this._scene = sh.scene; this._heads = [];
    try { return baseDrawShot.call(this, ctx, sh); } finally { this.lastHeads = this._heads; this._scene = null; }
  };

  VTS.comedy = { SPEAKERS, SPEAKER_LABELS, FX, FX_LABELS, SFX_FOR_FX, STICKERS, INTENSITY, CAPTION_STYLES, CTAS, drawBrain, drawCat, faceOf, rr, wrap, hash, hashStr, heart };

  // ======================= hand-drawn psychology props (170-unit box, centred) =======================
  function label(ctx, text, x, y, size, color, bg) {
    ctx.font = '900 ' + size + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (bg) { const w = ctx.measureText(text).width + size * 0.9; rr(ctx, x - w / 2, y - size * 0.72, w, size * 1.44, size * 0.5); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OLC; ctx.stroke(); }
    ctx.fillStyle = color || '#fff'; ctx.fillText(text, x, y + size * 0.04);
  }
  function meter(st, ctx, t, v, colors, text) { // horizontal gauge with needle-ish fill
    rr(ctx, -78, -34, 156, 68, 18); st.fs(ctx, st.c('#2b2f45'));
    const g = ctx.createLinearGradient(-66, 0, 66, 0); colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), st.c(c)));
    rr(ctx, -66, -22, 132 * clamp01(v), 44, 12); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3; for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(-66 + k * 26.4, -22); ctx.lineTo(-66 + k * 26.4, 22); ctx.stroke(); }
    if (text) label(ctx, text, 0, -62, 26, '#fff', st.c('#1d1b2a'));
  }
  function drawProp(st, ctx, name, t, age) {
    const c = (h) => st.c(h); const e = (h) => st.e(h); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    switch (name) {
      case 'social-battery': { const v = 0.18 + 0.06 * Math.sin(t * 2); rr(ctx, -80, -40, 150, 80, 14); st.fs(ctx, c('#f4f4f8')); rr(ctx, 72, -16, 14, 32, 5); st.fs(ctx, c('#f4f4f8')); rr(ctx, -70, -30, 130 * v, 60, 8); ctx.fillStyle = e('#ff4d4d'); ctx.fill(); label(ctx, Math.round(v * 100) + '%', 0, 2, 34, '#1d1b2a'); label(ctx, 'SOCIAL', 0, -66, 24, '#fff', c('#1d1b2a')); if ((t % 1) < 0.5) { ctx.fillStyle = e('#ff4d4d'); ctx.font = '900 40px ' + FONT; ctx.fillText('!', 96, -40); } break; }
      case 'anxiety-meter': case 'confidence-meter': case 'dopamine-meter': case 'motivation-fuel': {
        const cfg = { 'anxiety-meter': [0.92 + 0.06 * Math.sin(t * 20), ['#7ee081', '#ffd23f', '#ff4d4d'], 'ANXIETY'], 'confidence-meter': [clamp01(age / 2) * 0.85, ['#ff6b6b', '#ffd23f', '#4ade80'], 'CONFIDENCE'],
          'dopamine-meter': [0.5 + 0.5 * Math.sin(t * 3), ['#7c3aed', '#ec4899', '#facc15'], 'DOPAMINE'], 'motivation-fuel': [0.08 + 0.04 * Math.sin(t * 5), ['#ff4d4d', '#ffd23f', '#4ade80'], 'MOTIVATION'] }[name];
        if (name === 'motivation-fuel') { ctx.beginPath(); ctx.arc(0, 20, 80, Math.PI, 0); ctx.lineTo(0, 20); ctx.closePath(); st.fs(ctx, c('#2b2f45')); ['#ff4d4d', '#ffd23f', '#4ade80'].forEach((col, k) => { ctx.beginPath(); ctx.arc(0, 20, 62, Math.PI + k * Math.PI / 3, Math.PI + (k + 1) * Math.PI / 3); ctx.lineWidth = 16; ctx.strokeStyle = c(col); ctx.stroke(); }); const a = Math.PI + cfg[0] * Math.PI; ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(Math.cos(a) * 56, 20 + Math.sin(a) * 56); ctx.lineWidth = 8; ctx.strokeStyle = '#fff'; ctx.stroke(); label(ctx, 'E', -58, 40, 22, '#fff'); label(ctx, 'F', 58, 40, 22, '#fff'); label(ctx, cfg[2], 0, -84, 24, '#fff', c('#1d1b2a')); break; }
        meter(st, ctx, t, cfg[0], cfg[1], cfg[2]); break; }
      case 'overthink-yarn': { ctx.rotate(t * 0.6); ctx.beginPath(); ctx.arc(0, 0, 66, 0, TAU); st.fs(ctx, c('#b794f6')); ctx.strokeStyle = c('#7c5cc4'); ctx.lineWidth = 6; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.ellipse(0, 0, 60, 22 + k * 6, k * 0.6, 0, TAU); ctx.stroke(); } ctx.rotate(-t * 0.6); ctx.beginPath(); ctx.moveTo(60, 30); ctx.bezierCurveTo(110, 60, 60, 100, 100, 120); ctx.strokeStyle = c('#7c5cc4'); ctx.lineWidth = 7; ctx.stroke(); label(ctx, '?!', 0, 0, 44, '#fff'); break; }
      case 'burnout-match': { ctx.rotate(0.2); rr(ctx, -9, -40, 18, 130, 6); st.fs(ctx, c('#f0c98a')); ctx.beginPath(); ctx.ellipse(0, -50, 20, 26, 0, 0, TAU); st.fs(ctx, c('#3b3030')); for (let k = 0; k < 3; k++) { const p = (t * 0.7 + k / 3) % 1; ctx.beginPath(); ctx.arc(Math.sin(p * 6 + k) * 10, -84 - p * 70, 10 + p * 14, 0, TAU); ctx.fillStyle = 'rgba(140,140,150,' + (0.6 * (1 - p)) + ')'; ctx.fill(); } break; }
      case 'people-pleaser': { ctx.rotate(Math.sin(t * 4) * 0.08); rr(ctx, -8, -10, 16, 100, 6); st.fs(ctx, c('#b5835a')); rr(ctx, -84, -80, 168, 80, 16); st.fs(ctx, c('#4ade80')); label(ctx, 'YES!!', 0, -40, 42, '#1d1b2a'); label(ctx, '(help)', 50, 10, 18, '#fff'); break; }
      case 'red-flag': case 'green-flag': { const col = name === 'red-flag' ? '#ff3b3b' : '#22c55e'; rr(ctx, -54, -80, 12, 170, 6); st.fs(ctx, c('#8a8f9e')); ctx.beginPath(); ctx.moveTo(-42, -78); for (let k = 0; k <= 10; k++) { const x = -42 + k * 12; ctx.lineTo(x, -78 + Math.sin(t * 6 + k * 0.8) * 8); } for (let k = 10; k >= 0; k--) { const x = -42 + k * 12; ctx.lineTo(x, -8 + Math.sin(t * 6 + k * 0.8) * 8); } ctx.closePath(); st.fs(ctx, e(col)); break; }
      case 'attachment-hearts': { [-1, 1].forEach((s) => { ctx.save(); ctx.translate(s * 42, Math.sin(t * 3 + s) * 6); ctx.scale(1.7, 1.7); heart(ctx, e(s < 0 ? '#ff5c8a' : '#ffa3c4')); ctx.restore(); }); ctx.strokeStyle = c('#8a8f9e'); ctx.lineWidth = 7; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.ellipse(k * 14, 0, 10, 7, 0, 0, TAU); ctx.stroke(); } break; }
      case 'habit-tracker': { rr(ctx, -84, -70, 168, 140, 14); st.fs(ctx, c('#ffffff')); const n = Math.floor(clamp01(age / 2.4) * 12); for (let k = 0; k < 15; k++) { const x = -64 + (k % 5) * 32; const y = -46 + Math.floor(k / 5) * 38; rr(ctx, x - 12, y - 12, 24, 24, 5); ctx.fillStyle = k < n ? e('#22c55e') : c('#e5e7eb'); ctx.fill(); if (k < n) { ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x - 1, y + 6); ctx.lineTo(x + 7, y - 6); ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke(); } } break; }
      case 'discipline-streak': { const f = 1 + Math.sin(t * 9) * 0.05; ctx.save(); ctx.scale(f, 1 / f); ctx.beginPath(); ctx.moveTo(0, -80); ctx.bezierCurveTo(60, -30, 70, 20, 40, 60); ctx.quadraticCurveTo(0, 90, -40, 60); ctx.bezierCurveTo(-70, 20, -40, -20, -20, -40); ctx.quadraticCurveTo(-10, -10, 0, -80); st.fs(ctx, e('#ff7a1a')); ctx.beginPath(); ctx.moveTo(0, -20); ctx.bezierCurveTo(30, 10, 30, 40, 10, 60); ctx.quadraticCurveTo(-20, 64, -24, 40); ctx.quadraticCurveTo(-24, 10, 0, -20); ctx.fillStyle = e('#ffd23f'); ctx.fill(); ctx.restore(); label(ctx, 'DAY ' + (1 + Math.floor(clamp01(age / 2) * 29)), 0, 96, 26, '#fff', c('#1d1b2a')); break; }
      case 'self-care': { rr(ctx, -70, -20, 140, 90, 16); st.fs(ctx, c('#ffd6e0')); ctx.beginPath(); ctx.moveTo(-70, 0); ctx.lineTo(70, 0); ctx.lineWidth = 5; ctx.strokeStyle = OLC; ctx.stroke(); ctx.save(); ctx.translate(0, 30); ctx.scale(1.2, 1.2); heart(ctx, e('#ff5c8a')); ctx.restore(); rr(ctx, -20, -44, 40, 26, 8); st.fs(ctx, c('#ffd6e0')); for (let k = 0; k < 3; k++) { const p = (t * 0.6 + k / 3) % 1; ctx.beginPath(); ctx.arc(-50 + k * 50, -40 - p * 60, 7 + p * 6, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,' + (0.8 * (1 - p)) + ')'; ctx.fill(); } break; }
      case 'exam-f': { ctx.rotate(-0.08); rr(ctx, -66, -84, 132, 168, 8); st.fs(ctx, c('#ffffff')); ctx.strokeStyle = c('#cbd5e1'); ctx.lineWidth = 4; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(-46, -20 + k * 22); ctx.lineTo(46, -20 + k * 22); ctx.stroke(); } const k2 = easeOutBack(age / 0.5); ctx.save(); ctx.translate(20, -40); ctx.scale(k2, k2); ctx.rotate(-0.2); ctx.beginPath(); ctx.arc(0, 0, 38, 0, TAU); ctx.lineWidth = 7; ctx.strokeStyle = e('#ef2b2b'); ctx.stroke(); label(ctx, 'F', 0, 2, 56, st.e('#ef2b2b')); ctx.restore(); break; }
      case 'sleep-debt': { ctx.beginPath(); ctx.arc(-10, -10, 60, 0.9, 5.4); ctx.arc(20, -30, 48, 5.0, 1.2, true); ctx.closePath(); st.fs(ctx, c('#ffe08a')); label(ctx, '-3h', 30, 60, 34, '#fff', e('#ef4444')); label(ctx, 'z', 60, -80 - (t * 20 % 20), 30, '#fff'); break; }
      case 'screen-time': { st.phoneShape(ctx, 110, 180, true, t); rr(ctx, -44, -40, 88, 60, 10); ctx.fillStyle = 'rgba(29,27,42,0.85)'; ctx.fill(); label(ctx, (9 + Math.floor(clamp01(age / 1.5) * 3)) + 'h ' + (10 + Math.floor(t * 7) % 50) + 'm', 0, -18, 22, '#fff'); label(ctx, '📈', 0, 8, 22, '#fff'); break; }
      case 'notif-badge': { const k = 1 + Math.max(0, Math.sin(t * 5)) * 0.12; ctx.scale(k, k); ctx.beginPath(); ctx.arc(0, 0, 66, 0, TAU); st.fs(ctx, e('#ff3b30')); label(ctx, '99+', 0, 2, 46, '#fff'); break; }
      case 'brain-loading': { ctx.save(); ctx.translate(0, -24); ctx.scale(0.5, 0.5); brainShape(st, ctx, t, 'neutral'); ctx.restore(); rr(ctx, -80, 50, 160, 30, 12); st.fs(ctx, c('#2b2f45')); const v = Math.min(0.99, clamp01(age / 3) * 0.99); rr(ctx, -74, 56, 148 * v, 18, 8); ctx.fillStyle = e('#4ade80'); ctx.fill(); label(ctx, Math.floor(v * 100) + '%', 0, 104, 22, '#fff', c('#1d1b2a')); break; }
      case 'tomorrow-calendar': { rr(ctx, -74, -76, 148, 152, 14); st.fs(ctx, c('#ffffff')); rr(ctx, -74, -76, 148, 44, 14); ctx.fillStyle = e('#ef4444'); ctx.fill(); ctx.fillRect(-74, -50, 148, 18); label(ctx, 'TOMORROW', 0, -54, 20, '#fff'); label(ctx, '∞', 0, 14, 72, '#1d1b2a'); ctx.strokeStyle = OLC; ctx.lineWidth = 5; rr(ctx, -74, -76, 148, 152, 14); ctx.stroke(); break; }
      case 'money-burn': { ctx.rotate(-0.1); rr(ctx, -80, -36, 160, 72, 8); st.fs(ctx, c('#86efac')); ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.lineWidth = 4; ctx.strokeStyle = c('#15803d'); ctx.stroke(); label(ctx, '$', 0, 2, 30, st.c('#15803d')); for (let k = 0; k < 4; k++) { const fl = 1 + Math.sin(t * 12 + k) * 0.15; ctx.beginPath(); ctx.moveTo(40 + k * 12, -36); ctx.quadraticCurveTo(46 + k * 12, -70 * fl, 54 + k * 12, -36); ctx.fillStyle = e(k % 2 ? '#ffd23f' : '#ff7a1a'); ctx.fill(); } break; }
      case 'boundary-wall': { for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) { const x = -84 + q * 44 + (r % 2 ? 22 : 0); if (x > 60) continue; rr(ctx, x, 30 - r * 32, 42, 30, 4); st.fs(ctx, c(r % 2 ? '#c2410c' : '#ea580c'), 4); } label(ctx, 'NO.', 0, -110, 34, '#fff', e('#ef4444')); break; }
      case 'therapy-couch': { rr(ctx, -88, -10, 176, 56, 20); st.fs(ctx, c('#7c9a6b')); rr(ctx, -88, -60, 60, 90, 22); st.fs(ctx, c('#6b8a5b')); rr(ctx, -70, 44, 12, 20, 4); st.fs(ctx, c('#5b3a2e')); rr(ctx, 58, 44, 12, 20, 4); st.fs(ctx, c('#5b3a2e')); rr(ctx, -50, -30, 60, 26, 12); st.fs(ctx, c('#f5e6c8')); break; }
      case 'inner-critic': { ctx.save(); ctx.translate(Math.sin(t * 14) * 3, 0); ctx.beginPath(); ctx.arc(0, 0, 54, 0, TAU); st.fs(ctx, e('#ef4444')); [-1, 1].forEach((s) => { ctx.beginPath(); ctx.moveTo(s * 26, -44); ctx.lineTo(s * 44, -86); ctx.lineTo(s * 48, -36); st.fs(ctx, e('#ef4444')); }); [-1, 1].forEach((s) => { ctx.beginPath(); ctx.moveTo(s * 34, -14); ctx.lineTo(s * 10, -4); ctx.lineWidth = 6; ctx.strokeStyle = OLC; ctx.stroke(); ctx.beginPath(); ctx.arc(s * 20, 6, 6, 0, TAU); ctx.fillStyle = OLC; ctx.fill(); }); ctx.beginPath(); ctx.moveTo(-20, 28); ctx.quadraticCurveTo(0, 18, 20, 28); ctx.stroke(); ctx.restore(); ctx.save(); ctx.translate(58, 30); ctx.rotate(-0.3); ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(50, -30); ctx.lineTo(50, 30); ctx.lineTo(0, 10); ctx.closePath(); st.fs(ctx, c('#f4f4f8')); ctx.restore(); break; }
      case 'comfort-zone': { const k = 1 + Math.sin(t * 2) * 0.03; ctx.scale(k, k); ctx.beginPath(); ctx.arc(0, 0, 82, 0, TAU); ctx.fillStyle = st.ea('#7dd3fc', 0.35); ctx.fill(); ctx.setLineDash([14, 10]); ctx.lineWidth = 6; ctx.strokeStyle = e('#0ea5e9'); ctx.stroke(); ctx.setLineDash([]); label(ctx, 'COMFORT', 0, -12, 24, st.c('#0c4a6e')); label(ctx, 'ZONE', 0, 16, 24, st.c('#0c4a6e')); break; }
      case 'cortisol-alarm': { const on = (t * 3) % 1 < 0.5; ctx.beginPath(); ctx.arc(0, 10, 60, Math.PI, 0); ctx.lineTo(60, 60); ctx.lineTo(-60, 60); ctx.closePath(); st.fs(ctx, e(on ? '#ff3b3b' : '#b91c1c')); rr(ctx, -76, 56, 152, 26, 8); st.fs(ctx, c('#3b3f52')); if (on) { ctx.strokeStyle = e('#ffd23f'); ctx.lineWidth = 7; [-1, 1].forEach((s) => { for (let q = 0; q < 3; q++) { const a = -Math.PI / 2 + s * (0.5 + q * 0.4); ctx.beginPath(); ctx.moveTo(Math.cos(a) * 76, 10 + Math.sin(a) * 76); ctx.lineTo(Math.cos(a) * 100, 10 + Math.sin(a) * 100); ctx.stroke(); } }); } label(ctx, 'CORTISOL', 0, 104, 22, '#fff', c('#1d1b2a')); break; }
      default: break;
    }
  }
  VTS.comedy.drawProp = drawProp; VTS.comedy.brainShape = brainShape;

  // ======================= director: cast, pattern interrupts, stickers, sound cues =======================
  const AUTO_STICKER = { panicking: 'NOT AGAIN', shocked: 'WAIT WHAT', 'dead-inside': '💀', smug: '😏', 'eye-roll': 'BRUH', 'side-eye': '🤨', 'crying-laughing': '😭', facepalm: 'BRUH', rage: 'THE AUDACITY', blushing: '😳', anxious: 'HELLO??', surprised: 'WAIT WHAT', tired: '🫠', sad: '😭', angry: 'SIR??' };
  const STICKER_SFX = (txt) => { const s = String(txt || '').toUpperCase(); if (/BRUH|NAH|OOF/.test(s)) return 'bruh'; if (/💀|AUDACITY|UNWELL/.test(s)) return 'boom'; if (/WAIT|HELLO|SIR/.test(s)) return 'scratch'; if (/🤡|DELULU|LMAO|😭/.test(s)) return 'boing'; return 'pop'; };
  function normSpeaker(v) { const k = String(v || '').toLowerCase().replace(/[^a-z]/g, ''); if (!k) return ''; if (SPEAKERS.includes(k)) return k; if (/^(you|i|myself|self|user)$/.test(k)) return 'me'; if (/brain|mind/.test(k)) return 'brain'; if (/mum|mother|parent|dad/.test(k)) return 'mom'; if (/bestie|bff|friend/.test(k)) return 'friend'; if (/manager|boss|teacher/.test(k)) return 'boss'; if (/crush|date|partner|ex/.test(k)) return 'crush'; if (/therap|doctor|counsel/.test(k)) return 'therapist'; if (/cat|kitty|pet/.test(k)) return 'cat'; return 'narrator'; }
  function normFx(v) { const k = String(v || '').toLowerCase().replace(/[^a-z-]/g, ''); if (FX.includes(k)) return k; const syn = { zoom: 'zoom-punch', punch: 'zoom-punch', 'freeze-frame': 'freeze', scratch: 'freeze', text: 'chat', texts: 'chat', phone: 'chat', message: 'chat', notif: 'notification', expectation: 'split', 'expectation-reality': 'split', splitscreen: 'split', xpbar: 'xp', levelup: 'xp', 'level-up': 'xp', list: 'checklist', stars: 'rating', myth: 'myth-fact', fact: 'myth-fact', timer: 'countdown', beforeafter: 'before-after', thought: 'argument' }; return syn[k] || 'none'; }
  function setupCast(r, tl) {
    const fmt = r.o.template || ''; const anyBrain = tl.some((b) => normSpeaker(b.speaker) === 'brain');
    tl.forEach((b, i) => {
      const sp = normSpeaker(b.speaker); const sc = b.sc; if (!sc) return; sc.speaker = sp || '';
      const near = (who) => [i - 1, i, i + 1].some((j) => tl[j] && normSpeaker(tl[j].speaker) === who);
      if (sp === 'brain' || (sp === 'me' && (fmt === 'brain-vs-me' || near('brain')))) {
        if (fmt === 'brain-vs-me' || near('me') || anyBrain) { sc.count = 2; sc.cast1 = 'me'; sc.cast2 = 'brain'; }
        else { sc.cast1 = 'brain'; }
      } else if (['friend', 'boss', 'crush', 'mom', 'therapist', 'cat'].includes(sp)) { sc.count = 2; sc.cast1 = 'me'; sc.cast2 = sp; }
      if ((sc.cast1 === 'brain' || sc.cast2 === 'brain') && Array.isArray(sc.props)) sc.props = sc.props.filter((p) => p !== 'brain'); // the Brain is already on stage
      if (sc.count === 2 && !['hugging', 'arguing', 'talking'].includes(sc.pose)) sc.pose = 'talking';
      if (sc.count === 2) { // two characters need a setting with floor space
        if (['bedroom-night', 'phone-screen', 'keyword-card'].includes(sc.setting)) sc.setting = sc.setting === 'bedroom-night' ? 'bedroom-day' : 'living-room';
      }
      if (b.expr && S.EMO_IDS.includes(b.expr)) sc.emotion = b.expr;
      const pv = i > 0 && tl[i - 1].sc; // keep a dialogue in one place
      if (pv && sc.count === 2 && pv.count === 2 && pv.cast2 === sc.cast2) { sc.setting = pv.setting; sc.cast1 = pv.cast1; }
    });
  }
  function chunkWords(words) {
    const out = []; let cur = [];
    words.forEach((w, i) => { cur.push(i); const end = /[.!?,;:…]$/.test(w) || /[—-]$/.test(w); if (cur.length >= 3 || end) { out.push(cur); cur = []; } });
    if (cur.length) { if (cur.length === 1 && out.length && out[out.length - 1].length < 3 && !/[.!?]$/.test(words[out[out.length - 1].slice(-1)[0]])) out[out.length - 1].push(cur[0]); else out.push(cur); }
    return out;
  }
  function direct(r) {
    const tl = r.timeline; const o = r.o; const cx = { cuts: [], cues: [], fx: [], stickers: [], emojis: new Set(), hookEnd: 0, focus: [600, 1150] }; r.cx = cx;
    const inten = INTENSITY[o.intensity] || null; const gap = inten ? inten.gap : 99;
    const humour = o.humour == null ? 2 : Number(o.humour);
    const cue = (t, id, gain, pan, pri) => { if (!id || id === 'none' || t < 0) return; pri = pri || 2; const hit = cx.cues.filter((c) => Math.abs(c.t - t) < 0.45); if (hit.some((c) => c.pri >= pri)) return; hit.forEach((c) => cx.cues.splice(cx.cues.indexOf(c), 1)); cx.cues.push({ t, id, gain: gain == null ? 1 : gain, pan: pan || 0, pri }); };
    // shot transitions get a whoosh
    if (r.shots) r.shots.forEach((sh) => { if (sh.idx > 0) cue(Math.max(0, sh.start - 0.08), 'whoosh', 0.8, (sh.idx % 2 ? 0.4 : -0.4), 1); });
    let last = 0; let lastSticker = -9; let zi = 0; let laughs = 0; const kinds = ['jump', 'whip', 'jump', 'flash', 'jump', 'ramp', 'shake'];
    tl.forEach((b, i) => {
      b.fxType = normFx(b.fx); b.punch = !!b.punch; b.stickerText = String(b.sticker || '').trim().slice(0, 18);
      b.chunks = chunkWords(b.words);
      // auto emoji for the caption (emphasis word first)
      let ew = -1; let ef = '';
      const cands = b.words.map((w, wi) => [wi, w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')]);
      const emphIdx = cands.findIndex(([, w]) => w && w === b.emphasis);
      const order = emphIdx >= 0 ? [cands[emphIdx]].concat(cands) : cands;
      for (const [wi, w] of order) { const f = S.emojiForWord && S.emojiForWord(w); if (f) { ew = wi; ef = f; break; } }
      if (o.autoEmoji !== false && ef && humour > 0) { b.emojiWord = ew; b.emojiFile = ef; cx.emojis.add(ef); }
      const shotStart = r.shots && i > 0 && tl[i - 1].shot !== b.shot;
      if (shotStart) last = b.start;
      // the AI's effect for this beat
      if (b.fxType !== 'none') { cx.fx.push({ type: b.fxType, start: b.start, end: Math.max(b.end, b.start + (b.fxType === 'freeze' ? 1.4 : 1.2)), beat: i, text: b.fxText || '' }); last = b.start; if (!b.sfx || b.sfx === 'none') cue(b.start + 0.02, b.fxType === 'myth-fact' && /fact|true/i.test(b.fxText || '') ? 'ding' : SFX_FOR_FX[b.fxType], 1, 0, 3); }
      if (b.sfx && b.sfx !== 'none') cue(b.start + 0.04, b.sfx, 1, 0, 4);
      // pattern interrupts every ~gap seconds
      if (inten && i > 0 && !shotStart && b.start - last >= gap * 0.8) { const k = b.punch ? 'punch' : kinds[zi++ % kinds.length]; cx.cuts.push({ t: b.start, type: k }); last = b.start; if (k === 'whip') cue(b.start - 0.1, 'whoosh', 0.6, 0, 1); if (k === 'punch') cue(b.start, 'boom', 0.7, 0, 2); }
      if (inten) { let guard = 0; while (b.end - last > gap * 1.35 && guard++ < 8) { const tt = last + gap; const wt = b.wordTimes.find((x) => x >= tt - 0.2 && x < b.end - 0.4); if (wt == null) break; cx.cuts.push({ t: wt, type: 'jump' }); last = wt; } }
      // reaction sticker
      let stk = b.fxType === 'freeze' ? '' : b.stickerText; // the freeze-frame already says "that's me"
      if (!stk && inten && humour >= 2 && (b.punch || (b.sc && AUTO_STICKER[b.sc.emotion] && b.sc.emotion !== 'neutral')) && b.start - lastSticker > (o.intensity === 'chaotic' ? 3.5 : 6) && i > 0 && b.step !== 4) { stk = AUTO_STICKER[(b.sc && b.sc.emotion) || ''] || ''; if (cx.stickers.some((q) => q.text === stk)) stk = ''; }
      if (stk) { const at = b.start + Math.min(0.9, (b.end - b.start) * 0.35); cx.stickers.push({ text: stk, start: at, end: Math.max(b.end, at + 1.1), beat: i, seed: hashStr(stk + i) }); lastSticker = at; cue(at, STICKER_SFX(stk), 0.9, 0, 2); const ef2 = S.emojiFile && S.emojiFile(Array.from(stk)[0]); if (ef2) cx.emojis.add(ef2); }
      if (b.punch && humour >= 2 && !b.sfx) cue(b.end - 0.25, i % 2 ? 'boing' : 'pop', 0.7, 0, 1);
      if (b.punch && humour >= 3 && laughs < 1 && i >= tl.length / 2 && o.laugh !== false) { cue(b.end - 0.1, 'laugh', 0.8, 0, 2); laughs++; }
      if (b.step === 4 && !tl.slice(0, i).some((x) => x.step === 4)) cue(b.start + 0.2, 'pop', 0.8, 0, 2);
    });
    cx.cuts.sort((a, b) => a.t - b.t); cx.cues.sort((a, b) => a.t - b.t);
    // zoom levels for jump cuts: alternate so each cut is visible
    const Z = [1.0, 1.16, 1.3, 1.1]; let zk = 0; cx.cuts.forEach((c) => { c.zoom = c.type === 'punch' ? 1.34 : Z[(++zk) % Z.length]; });
    // first-frame text hook
    const hook = String(o.textHook || '').trim();
    if (hook && o.hook !== false) { const b0 = tl[0]; cx.hookEnd = Math.max(1.6, Math.min(2.6, b0 ? b0.end : 1.8)); }
    cx.cta = o.ctaSticker ? String(o.ctaSticker) : '';
    const ctaBeat = tl.findIndex((b) => b.step === 4); cx.ctaStart = ctaBeat >= 0 ? tl[ctaBeat].start : Math.max(0, (tl.length ? tl[tl.length - 1].start : 0));
    return cx;
  }
  function cutAt(cx, t) { let c = null; for (const q of cx.cuts) { if (q.t <= t) c = q; else break; } return c; }
  function fxAt(cx, t, types) { for (const f of cx.fx) if (t >= f.start && t < f.end && (!types || types.includes(f.type))) return f; return null; }
  function cameraAt(r, t) {
    const cx = r.cx; const cam = { z: 1, dx: 0, dy: 0, rot: 0, fx: cx.focus[0], fy: cx.focus[1] };
    const i = r.beatAt(t); const b = r.timeline[i]; const sh = b && r.shots ? r.shots[b.shot] : null;
    const c = cutAt(cx, t);
    if (c && (!sh || c.t >= sh.start)) {
      const p = t - c.t; cam.z = c.zoom;
      if (c.type === 'whip') { const k = clamp01(p / 0.28); cam.dx = Math.sin(k * Math.PI) * 380 * (hash(c.t) > 0.5 ? 1 : -1); cam.blur = Math.sin(k * Math.PI); }
      if (c.type === 'shake' || c.type === 'punch') { const a = Math.exp(-p * 7) * (c.type === 'punch' ? 26 : 16); cam.dx += Math.sin(p * 71) * a; cam.dy += Math.cos(p * 57) * a; cam.rot = Math.sin(p * 43) * a * 0.0012; }
      if (c.type === 'punch') cam.z *= 1 + 0.12 * Math.exp(-p * 9);
      if (c.type === 'ramp') { const k = clamp01(p / 0.9); cam.z *= 1 + 0.22 * k * k * (k < 1 ? 1 : 0); }
      if (c.type === 'flash') cam.flash = Math.max(0, 1 - p / 0.14);
    }
    const f = fxAt(cx, t, ['zoom-punch', 'impact', 'spotlight']);
    if (f) { const p = t - f.start; if (f.type === 'zoom-punch') { cam.z = Math.max(cam.z, 1.38 + 0.18 * Math.exp(-p * 10)); const a = Math.exp(-p * 8) * 22; cam.dx += Math.sin(p * 80) * a; cam.dy += Math.cos(p * 63) * a; }
      if (f.type === 'impact') { const a = Math.exp(-p * 6) * 30; cam.dx += Math.sin(p * 90) * a; cam.dy += Math.cos(p * 70) * a; cam.z *= 1.08; }
      if (f.type === 'spotlight') cam.z = Math.max(cam.z, 1 + 0.12 * easeOut(p / 1.2)); }
    if (cx.cta && cx.ctaStart && t >= cx.ctaStart) cam.z = Math.min(cam.z, 1.06); // wide shot under the CTA sticker so it never covers a face
    return cam;
  }
  // camera + split-screen are applied around every drawShot while a comedy renderer is drawing
  const drawShot2 = ST.drawShot;
  ST.drawShot = function (ctx, sh) {
    const cam = this._cam; const split = this._split;
    if (split) {
      const heads = this.lastHeads && this.lastHeads.length ? this.lastHeads : [{ x: 600 }];
      const hx = heads.reduce((a, h) => a + h.x, 0) / heads.length; let res;
      [0, 1].forEach((side) => {
        ctx.save(); ctx.beginPath(); ctx.rect(side * W / 2, 0, W / 2, H); ctx.clip();
        ctx.translate((side ? 810 : 270) - hx, 0);
        const scene = side ? sh.scene : Object.assign({}, sh.scene, { emotion: split.leftEmotion, callout: '', props: split.leftProps || sh.scene.props });
        this._cam = null; this._split = null; res = drawShot2.call(this, ctx, Object.assign({}, sh, { scene }));
        this._split = split; this._cam = cam; ctx.restore();
      });
      return res;
    }
    if (!cam || (cam.z === 1 && !cam.dx && !cam.dy && !cam.rot)) return drawShot2.call(this, ctx, sh);
    ctx.save(); ctx.translate(cam.fx + cam.dx, cam.fy + cam.dy); ctx.rotate(cam.rot || 0); ctx.scale(cam.z, cam.z); ctx.translate(-cam.fx, -cam.fy);
    try { return drawShot2.call(this, ctx, sh); } finally { ctx.restore(); }
  };
  Object.assign(VTS.comedy, { normSpeaker, normFx, setupCast, direct, cameraAt, fxAt, chunkWords, AUTO_STICKER });

  // ======================= overlays (drawn in world units, above the scene, below captions) =======================
  function inWorld(r, fn) {
    const ctx = r.ctx; ctx.save(); ctx.setTransform(r.s, 0, 0, r.s, 0, 0); const c = r.LY.card;
    if (c) { if (c.edge === 'round') rr(ctx, c.x, c.y, c.w, c.h, 40); else { ctx.beginPath(); ctx.rect(c.x, c.y, c.w, c.h); } ctx.clip(); const k = Math.min(c.w / 1080, c.h / 1260); ctx.translate(c.x + (c.w - 1080 * k) / 2, c.y + (c.h - 1260 * k) / 2); ctx.scale(k, k); ctx.translate(0, -180); }
    try { fn(ctx); } finally { ctx.restore(); }
  }
  // where a world point ends up after the camera
  function viaCam(cam, x, y) { if (!cam) return [x, y]; return [cam.fx + cam.dx + (x - cam.fx) * cam.z, cam.fy + cam.dy + (y - cam.fy) * cam.z]; }
  function pill(ctx, text, x, y, size, bg, fg, rot, maxW) {
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.font = '900 ' + size + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const cap = maxW || 980; if (ctx.measureText(text).width + size * 1.1 > cap) { size = Math.max(28, size * cap / (ctx.measureText(text).width + size * 1.1)); ctx.font = '900 ' + size + 'px ' + FONT; }
    const w = Math.min(cap, ctx.measureText(text).width + size * 1.1); const h = size * 1.6;
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; rr(ctx, -w / 2 + 6, -h / 2 + 10, w, h, h / 2); ctx.fill();
    rr(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = size * 0.12; ctx.strokeStyle = OLC; ctx.stroke();
    ctx.fillStyle = fg; ctx.fillText(text, 0, size * 0.05, w - size * 0.6); ctx.restore(); return w;
  }
  function card(ctx, x, y, w, h, fill) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(ctx, x + 8, y + 14, w, h, 34); ctx.fill(); rr(ctx, x, y, w, h, 34); ctx.fillStyle = fill || '#ffffff'; ctx.fill(); ctx.lineWidth = 7; ctx.strokeStyle = OLC; ctx.stroke(); }
  function emojiImg(file) { const E = S.EMO; if (!E || !file) return null; try { return E.get(file); } catch (_) { return null; } }
  function drawEmoji(ctx, ch, x, y, size) { const f = S.emojiFile && S.emojiFile(ch); const img = emojiImg(f); if (img) { ctx.drawImage(img, x - size / 2, y - size / 2, size, size); return true; } ctx.font = size * 0.8 + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, x, y); return false; }
  const isEmojiOnly = (s) => { const t = String(s || '').trim(); return !!t && !/[A-Za-z0-9]/.test(t) && Array.from(t).length <= 3; };
  function speedLines(ctx, x, y, k, t) { ctx.save(); ctx.globalAlpha = k; ctx.fillStyle = OLC; for (let q = 0; q < 34; q++) { const a = q / 34 * TAU + hash(q) * 0.1; const r0 = 360 + hash(q + 9) * 160; const r1 = 1500; const wd = 0.012 + hash(q + 3) * 0.02; ctx.beginPath(); ctx.moveTo(x + Math.cos(a - wd) * r1, y + Math.sin(a - wd) * r1); ctx.lineTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a + wd) * r1, y + Math.sin(a + wd) * r1); ctx.fill(); } ctx.restore(); void t; }
  function burst(ctx, x, y, rad, fill, spikes) { ctx.beginPath(); const n = spikes || 14; for (let q = 0; q < n * 2; q++) { const a = q / (n * 2) * TAU; const rr2 = q % 2 ? rad * 0.72 : rad; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2 * 0.8); } ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = OLC; ctx.stroke(); }
  function parseLines(text) { return String(text || '').split('|').map((s) => s.trim()).filter(Boolean).slice(0, 5); }
  function speakerOf(line) { const m = /^([^:]{1,16}):\s*(.*)$/.exec(line); if (!m) return [null, line]; return [m[1].trim(), m[2].trim()]; }

  function drawFx(r, t) {
    const cx = r.cx; const f = fxAt(cx, t); if (!f) return; const p = t - f.start; const dur = Math.max(0.6, f.end - f.start); const b = r.timeline[f.beat] || {};
    const cam = r.stage && r.stage._camLast; const heads = (r.stage && r.stage.lastHeads) || []; const hd = heads.find((h) => h.who === (b.sc && b.sc.speaker)) || heads[0] || { x: 600, y: 1150, r: 92 };
    const [hx, hy] = viaCam(cam, hd.x, hd.y); const out = clamp01((f.end - t) / 0.22); const inK = easeOutBack(p / 0.3);
    const txt = String(f.text || '');
    inWorld(r, (ctx) => {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      switch (f.type) {
        case 'freeze': {
          ctx.save(); ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = 'hsl(0,0%,50%)'; ctx.globalAlpha = 0.9; ctx.fillRect(0, 0, W, H); ctx.restore();
          ctx.fillStyle = 'rgba(20,16,40,0.18)'; ctx.fillRect(0, 0, W, H);
          const k = easeOutBack((p - 0.15) / 0.3); if (k <= 0) break;
          const label2 = (txt || "Yep. That's me.").toUpperCase(); const lx = Math.max(300, Math.min(780, hx - 60)); const ly = Math.max(cx.hookEnd && t < cx.hookEnd + 0.3 ? 960 : 700, hy - 330); // below the text hook + shifted captions
          ctx.save(); ctx.translate(lx, ly); ctx.rotate(-0.06); ctx.scale(k, k); ctx.font = '900 66px ' + FONT; const lines = wrap(ctx, label2, 760);
          lines.forEach((ln, q) => { ctx.lineWidth = 16; ctx.strokeStyle = OLC; ctx.strokeText(ln, 0, q * 74); ctx.fillStyle = '#ffffff'; ctx.fillText(ln, 0, q * 74); }); ctx.restore();
          // arrow to the head
          const ak = clamp01((p - 0.35) / 0.3); if (ak > 0) { const x0 = lx + 40; const y0 = ly + lines.length * 74 - 20; const x1 = hx + 60; const y1 = hy - hd.r * 1.1; const mx = (x0 + x1) / 2 + 120; const my = (y0 + y1) / 2; ctx.save(); ctx.lineWidth = 14; ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round'; ctx.shadowColor = OLC; ctx.shadowBlur = 0; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x0 + (x1 - x0) * ak, y0 + (y1 - y0) * ak); ctx.stroke(); if (ak >= 1) { const a = Math.atan2(y1 - my, x1 - mx); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - Math.cos(a - 0.5) * 50, y1 - Math.sin(a - 0.5) * 50); ctx.moveTo(x1, y1); ctx.lineTo(x1 - Math.cos(a + 0.5) * 50, y1 - Math.sin(a + 0.5) * 50); ctx.stroke(); } ctx.restore(); }
          ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = OLC; ctx.lineWidth = 6; [0, 1].forEach((q) => { rr(ctx, 78 + q * 34, 236, 22, 62, 6); ctx.fill(); ctx.stroke(); }); // paused icon
          break; }
        case 'spotlight': {
          const k = easeOut(p / 0.35) * out; const g = ctx.createRadialGradient(hx, hy + 60, hd.r * 1.4, hx, hy + 60, hd.r * 4.2); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(5,4,12,' + (0.82 * k) + ')'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.16 * k; ctx.fillStyle = '#fff4c2'; ctx.beginPath(); ctx.moveTo(hx - 60, 0); ctx.lineTo(hx + 60, 0); ctx.lineTo(hx + hd.r * 2.6, hy + 500); ctx.lineTo(hx - hd.r * 2.6, hy + 500); ctx.closePath(); ctx.fill(); ctx.restore();
          if (txt) pill(ctx, txt.toUpperCase(), 540, 700, 50, '#ffe14d', OLC, -0.03);
          break; }
        case 'impact': {
          if (p < 0.1) { ctx.save(); ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
          if (p < 0.5) speedLines(ctx, hx, hy, 1 - p / 0.5, t);
          const k = easeOutBack((p - 0.05) / 0.25) * out; if (k > 0) { ctx.save(); ctx.translate(Math.max(260, Math.min(820, hx + 220)), Math.max(700, hy - 300)); ctx.rotate(-0.12); ctx.scale(k, k); burst(ctx, 0, 0, 190, '#ffe14d', 12); ctx.font = '900 76px ' + FONT; ctx.fillStyle = '#ff2d55'; ctx.lineWidth = 10; ctx.strokeStyle = OLC; const tt = (txt || 'BOOM').toUpperCase(); ctx.strokeText(tt, 0, 4, 300); ctx.fillText(tt, 0, 4, 300); ctx.restore(); }
          break; }
        case 'zoom-punch': { if (p < 0.45) speedLines(ctx, hx, hy, (1 - p / 0.45) * 0.8, t); if (txt) { const k = easeOutBack((p - 0.1) / 0.3) * out; if (k > 0) { ctx.save(); ctx.translate(540, 720); ctx.scale(k, k); pill(ctx, txt.toUpperCase(), 0, 0, 56, '#ff2d55', '#ffffff', -0.04); ctx.restore(); } } break; }
        case 'split': case 'before-after': {
          const parts = parseLines(txt); const L1 = (parts[0] || (f.type === 'split' ? 'Expectation' : 'Before')).toUpperCase(); const L2 = (parts[1] || (f.type === 'split' ? 'Reality' : 'After')).toUpperCase();
          ctx.save(); ctx.globalAlpha = out; ctx.fillStyle = '#ffffff'; ctx.fillRect(532, 0, 16, H); ctx.fillStyle = OLC; ctx.fillRect(528, 0, 4, H); ctx.fillRect(548, 0, 4, H);
          const k = easeOutBack(p / 0.3); ctx.save(); ctx.translate(270, 700); ctx.scale(Math.min(k, 460 / 460), k); pill(ctx, L1, 0, 0, 50, '#7cff6b', OLC, -0.04, 470); ctx.restore(); ctx.save(); ctx.translate(810, 700); ctx.scale(k, k); pill(ctx, L2, 0, 0, 50, '#ff5c6c', '#ffffff', 0.04, 470); ctx.restore();
          ctx.restore(); break; }
        case 'chat': {
          const lines = parseLines(txt).map(speakerOf); if (!lines.length) lines.push(['them', 'you up?'], ['me', 'no. overthinking.'], ['them', 'same 💀']);
          const other = (lines.find(([w]) => w && !/^(me|you|i)$/i.test(w)) || ['Bestie'])[0] || 'Bestie';
          const slide = easeOut(p / 0.35) * out; const y0 = 700 + (1 - slide) * 900; const x0 = 170; const w = 740; const h = 700;
          ctx.save(); ctx.globalAlpha = Math.min(1, slide * 1.5); card(ctx, x0, y0, w, h, '#101218'); rr(ctx, x0 + 16, y0 + 16, w - 32, h - 32, 26); ctx.fillStyle = '#f4f5fa'; ctx.fill();
          ctx.fillStyle = '#e6e8f0'; ctx.fillRect(x0 + 16, y0 + 16, w - 32, 96); ctx.beginPath(); ctx.arc(x0 + 80, y0 + 64, 30, 0, TAU); ctx.fillStyle = '#b794f6'; ctx.fill(); ctx.font = '800 38px ' + FONT; ctx.textAlign = 'left'; ctx.fillStyle = '#1d1b2a'; ctx.fillText(other.charAt(0).toUpperCase() + other.slice(1), x0 + 128, y0 + 66, 480);
          const n = lines.length; const per = Math.max(0.5, (dur - 0.4) / n); let y = y0 + 150; ctx.font = '600 42px ' + FONT;
          const shown = []; lines.forEach((ln, q) => { const at = 0.3 + q * per; if (p >= at) shown.push([ln, at]); });
          const typingNext = shown.length < n && p > 0.3 + shown.length * per - 0.45;
          const rows = shown.slice(-4);
          rows.forEach(([[who, msg], at]) => { const me = /^(me|you|i)$/i.test(who || ''); const ls = wrap(ctx, msg, 440); const bh = 26 + ls.length * 44; const bw = Math.min(480, Math.max.apply(null, ls.map((s) => ctx.measureText(s).width)) + 44); const k = easeOutBack((p - at) / 0.22); const bx = me ? x0 + w - 40 - bw : x0 + 40;
            ctx.save(); ctx.translate(bx + (me ? bw : 0), y); ctx.scale(k, k); ctx.translate(-(me ? bw : 0), 0); rr(ctx, 0, 0, bw, bh, 28); ctx.fillStyle = me ? '#2f7cf6' : '#e3e5ec'; ctx.fill(); ctx.fillStyle = me ? '#ffffff' : '#1d1b2a'; ctx.textAlign = 'left'; ls.forEach((s, j) => ctx.fillText(s, 22, 36 + j * 44)); ctx.restore(); y += bh + 18; });
          if (typingNext) { rr(ctx, x0 + 40, y, 120, 64, 30); ctx.fillStyle = '#e3e5ec'; ctx.fill(); for (let q = 0; q < 3; q++) { ctx.beginPath(); ctx.arc(x0 + 70 + q * 30, y + 32 + Math.sin(t * 12 + q) * 5, 8, 0, TAU); ctx.fillStyle = '#8a8f9e'; ctx.fill(); } }
          ctx.restore(); break; }
        case 'notification': {
          const [app, body] = speakerOf(txt || 'Screen Time: Your daily average was 9h 42m 📈'); const k = p < 0.4 ? easeOutBack(p / 0.4) : 1; const y = 240 - (1 - k) * 260 - (1 - out) * 300;
          ctx.save(); ctx.translate(Math.sin(p * 40) * Math.exp(-p * 5) * 8, 0); ctx.fillStyle = 'rgba(0,0,0,0.25)'; rr(ctx, 58, y + 12, 964, 170, 40); ctx.fill(); rr(ctx, 50, y, 980, 170, 40); ctx.fillStyle = 'rgba(250,250,252,0.97)'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = OLC; ctx.stroke();
          rr(ctx, 80, y + 34, 100, 100, 24); ctx.fillStyle = '#7c5cff'; ctx.fill(); drawEmoji(ctx, (app && /screen|phone/i.test(app)) ? '⏳' : (app && /bank|money/i.test(app)) ? '💸' : '🧠', 130, y + 84, 70);
          ctx.textAlign = 'left'; ctx.fillStyle = '#1d1b2a'; ctx.font = '800 38px ' + FONT; ctx.fillText((app || 'Your Brain').toUpperCase(), 206, y + 58, 620); ctx.font = '600 36px ' + FONT; const bl = wrap(ctx, body || txt, 780).slice(0, 2); bl.forEach((s, q) => ctx.fillText(s, 206, y + 104 + q * 40, 800)); ctx.textAlign = 'right'; ctx.fillStyle = '#8a8f9e'; ctx.font = '600 30px ' + FONT; ctx.fillText('now', 1000, y + 56); ctx.restore();
          break; }
        case 'loading': case 'xp': case 'countdown': case 'rating': case 'checklist': {
          const k = easeOutBack(p / 0.3) * out; if (k <= 0) break; ctx.save(); ctx.translate(540, 830); ctx.scale(k, k); ctx.translate(-540, -830);
          if (f.type === 'loading') { ctx.font = '800 50px ' + FONT; const tl2 = wrap(ctx, txt || 'Loading motivation…', 640).slice(0, 2); const ch2 = 200 + tl2.length * 58; card(ctx, 90, 700, 900, ch2, '#1d1b2a'); ctx.save(); ctx.translate(190, 700 + ch2 / 2); ctx.scale(0.5, 0.5); brainShape(r.stage, ctx, t, 'neutral'); ctx.restore(); ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff'; tl2.forEach((ln, q) => ctx.fillText(ln, 290, 770 + q * 58, 660)); const v = Math.min(0.99, easeOut(p / (dur * 0.8)) * 0.99); const stall = v > 0.95; const by = 770 + tl2.length * 58; rr(ctx, 290, by, 650, 70, 35); ctx.fillStyle = '#3a3f5c'; ctx.fill(); rr(ctx, 296, by + 6, 638 * v, 58, 29); ctx.fillStyle = stall && (t * 3) % 1 < 0.5 ? '#ff5c6c' : '#7cff6b'; ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = '900 40px ' + FONT; ctx.fillText(Math.floor(v * 100) + '%', 615, by + 37); }
          if (f.type === 'xp') { card(ctx, 110, 730, 860, 220, '#ffffff'); ctx.textAlign = 'left'; ctx.fillStyle = OLC; ctx.font = '900 50px ' + FONT; ctx.fillText(txt || '+50 XP · Self-respect', 150, 790, 780); const v = 0.35 + 0.65 * easeInOut((p - 0.2) / Math.max(0.6, dur * 0.55)); rr(ctx, 150, 830, 780, 60, 30); ctx.fillStyle = '#e5e7eb'; ctx.fill(); const g = ctx.createLinearGradient(150, 0, 930, 0); g.addColorStop(0, '#7c5cff'); g.addColorStop(1, '#ff5ca8'); rr(ctx, 150, 830, 780 * v, 60, 30); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = OLC; rr(ctx, 150, 830, 780, 60, 30); ctx.stroke(); if (v >= 0.99) { const lk = easeOutBack((p - 0.2 - Math.max(0.6, dur * 0.55)) / 0.3); if (lk > 0) { ctx.save(); ctx.translate(540, 690); ctx.scale(lk, lk); burst(ctx, 0, 0, 170, '#ffe14d', 12); ctx.fillStyle = '#7c2cff'; ctx.textAlign = 'center'; ctx.font = '900 50px ' + FONT; ctx.fillText('LEVEL UP!', 0, 4, 280); ctx.restore(); } } }
          if (f.type === 'countdown') { const m = /(\d+)/.exec(txt); const n = m ? Math.min(99, Number(m[1])) : 3; const v = clamp01(p / dur); ctx.beginPath(); ctx.arc(540, 830, 150, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = OLC; ctx.stroke(); ctx.beginPath(); ctx.arc(540, 830, 122, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - v)); ctx.lineWidth = 26; ctx.strokeStyle = '#ff5c6c'; ctx.stroke(); ctx.fillStyle = OLC; ctx.textAlign = 'center'; ctx.font = '900 110px ' + FONT; ctx.fillText(String(Math.max(0, Math.ceil(n * (1 - v)))), 540, 836); const lab = txt.replace(/\d+/, '').trim(); if (lab) pill(ctx, lab.toUpperCase(), 540, 1010, 40, '#ffe14d', OLC, 0); }
          if (f.type === 'rating') { const parts = parseLines(txt); const lab = parts[0] || 'Your coping skills'; let sc = 2; const m = /(\d+(?:\.\d)?)\s*(?:\/\s*(\d+))?/.exec(parts[1] || txt.replace(lab, '')); if (m) { sc = Number(m[1]); const of = Number(m[2] || 5); sc = Math.round(sc * 5 / of); } sc = Math.max(0, Math.min(5, sc)); card(ctx, 110, 720, 860, 250, '#ffffff'); ctx.fillStyle = OLC; ctx.textAlign = 'center'; ctx.font = '900 50px ' + FONT; ctx.fillText((parts.length > 1 ? lab : lab.replace(/\s*\d+(?:\.\d)?\s*(?:\/\s*\d+)?\s*$/, '')).toUpperCase(), 540, 780, 780); for (let q = 0; q < 5; q++) { const at = 0.3 + q * 0.18; const on = q < sc && p >= at; const kk = on ? easeOutBack((p - at) / 0.2) : 1; ctx.save(); ctx.translate(300 + q * 120, 880); ctx.scale(kk, kk); ctx.beginPath(); for (let j = 0; j < 10; j++) { const a = -Math.PI / 2 + j * Math.PI / 5; const rad = j % 2 ? 24 : 52; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } ctx.closePath(); ctx.fillStyle = on ? '#ffc93c' : '#e5e7eb'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = OLC; ctx.stroke(); ctx.restore(); } if (p > 0.4 + sc * 0.18) { ctx.save(); ctx.translate(880, 730); ctx.rotate(0.15); pill(ctx, sc + '/5', 0, 0, 40, sc >= 3 ? '#7cff6b' : '#ff5c6c', sc >= 3 ? OLC : '#ffffff'); ctx.restore(); } }
          if (f.type === 'checklist') { const items = parseLines(txt); if (!items.length) items.push('Drink water', 'Touch grass', 'Stop overthinking'); const hgt = 90 + items.length * 84; card(ctx, 150, 700, 780, hgt, '#fffdf5'); const per = Math.max(0.45, (dur - 0.5) / items.length); items.slice(0, 5).forEach((it, q) => { const y = 760 + q * 84; const at = 0.4 + q * per; const done = p >= at; const bad = /^[✗x×-]\s*/i.test(it) && /^[✗×]/.test(it); const label2 = it.replace(/^[✗×✓✔]\s*/, ''); rr(ctx, 190, y - 28, 56, 56, 12); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = OLC; ctx.stroke(); if (done) { const kk = clamp01((p - at) / 0.2); ctx.lineWidth = 11; ctx.strokeStyle = bad ? '#ff3b3b' : '#22c55e'; ctx.beginPath(); if (bad) { ctx.moveTo(200, y - 18); ctx.lineTo(200 + 36 * kk, y - 18 + 36 * kk); ctx.moveTo(236, y - 18); ctx.lineTo(236 - 36 * kk, y - 18 + 36 * kk); } else { ctx.moveTo(198, y); ctx.lineTo(214, y + 16 * kk); if (kk > 0.5) ctx.lineTo(214 + (kk - 0.5) * 2 * 30, y + 16 - (kk - 0.5) * 2 * 40); } ctx.stroke(); } ctx.textAlign = 'left'; ctx.fillStyle = OLC; ctx.font = (done ? '800 ' : '600 ') + '48px ' + FONT; ctx.fillText(label2, 272, y + 2, 620); if (done && !bad) { ctx.fillStyle = 'rgba(29,27,42,0.5)'; } }); }
          ctx.restore(); break; }
        case 'argument': {
          const lines = parseLines(txt).map(speakerOf); if (!lines.length) break; const per = dur / lines.length; const q = Math.min(lines.length - 1, Math.floor(p / per)); const [who, msg] = lines[q]; const lp = p - q * per;
          const target = heads.find((h) => h.who && who && h.who.startsWith(who.toLowerCase().slice(0, 3))) || heads[q % Math.max(1, heads.length)] || hd; const [tx, ty] = viaCam(cam, target.x, target.y);
          const k = easeOutBack(lp / 0.25); const bx = Math.max(260, Math.min(820, tx + (tx > 540 ? -80 : 80))); const by = Math.max(700, ty - 360);
          ctx.save(); ctx.translate(bx, by); ctx.scale(k, k); ctx.font = '800 40px ' + FONT; const ls = wrap(ctx, msg, 400).slice(0, 3); const bw = Math.max(260, Math.max.apply(null, ls.map((s) => ctx.measureText(s).width)) + 90); const bh = 60 + ls.length * 48;
          ctx.fillStyle = '#ffffff'; ctx.lineWidth = 7; ctx.strokeStyle = OLC; ctx.beginPath(); for (let j = 0; j < 12; j++) { const a = j / 12 * TAU; ctx.moveTo(Math.cos(a) * bw * 0.42 + 40, Math.sin(a) * bh * 0.42); ctx.arc(Math.cos(a) * bw * 0.42, Math.sin(a) * bh * 0.42, 40, 0, TAU); } ctx.stroke(); ctx.fill(); ctx.beginPath(); ctx.ellipse(0, 0, bw * 0.46, bh * 0.46, 0, 0, TAU); ctx.fill();
          [[0.3, 22], [0.55, 14]].forEach(([m2, rad]) => { ctx.beginPath(); ctx.arc((tx - bx) * m2, bh * 0.5 + (ty - by - bh * 0.5 - target.r) * m2, rad, 0, TAU); ctx.fill(); ctx.stroke(); });
          ctx.fillStyle = OLC; ctx.textAlign = 'center'; ls.forEach((s, j) => ctx.fillText(s, 0, (j - (ls.length - 1) / 2) * 48 + 4)); ctx.restore(); break; }
        case 'myth-fact': {
          const fact = /fact|true|real/i.test(txt) && !/myth/i.test(txt); const lab = (txt && txt.length < 16 ? txt : (fact ? 'FACT' : 'MYTH')).toUpperCase(); const k = p < 0.18 ? 3 - 2 * (p / 0.18) : 1; if (p < 0.02) break;
          ctx.save(); ctx.globalAlpha = out * Math.min(1, p / 0.08); ctx.translate(540, 820); ctx.rotate(-0.16); ctx.scale(k, k); const col = fact ? '#16a34a' : '#e11d48'; ctx.font = '900 120px ' + FONT; const w = ctx.measureText(lab).width + 120; ctx.lineWidth = 16; ctx.strokeStyle = col; rr(ctx, -w / 2, -95, w, 190, 26); ctx.stroke(); ctx.lineWidth = 6; rr(ctx, -w / 2 + 18, -77, w - 36, 154, 16); ctx.stroke(); ctx.fillStyle = col; ctx.fillText(lab, 0, 8); ctx.globalCompositeOperation = 'destination-out'; for (let q = 0; q < 40; q++) { ctx.beginPath(); ctx.arc((hash(q) - 0.5) * w, (hash(q + 7) - 0.5) * 180, 3 + hash(q + 3) * 7, 0, TAU); ctx.fill(); } ctx.restore();
          break; }
        default: break;
      }
    });
  }
  // whip-pan streaks, flash cuts
  function drawCamFx(r, t) {
    const cam = r.stage && r.stage._camLast; if (!cam) return;
    if (cam.blur > 0.05) inWorld(r, (ctx) => { ctx.save(); ctx.globalAlpha = cam.blur * 0.55; ctx.fillStyle = '#ffffff'; for (let q = 0; q < 26; q++) { const y = hash(q + Math.floor(t * 30)) * H; ctx.fillRect(0, y, W, 4 + hash(q) * 16); } ctx.restore(); });
    if (cam.flash > 0) { const ctx = r.ctx; ctx.save(); ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * cam.flash) + ')'; ctx.fillRect(0, 0, r.canvas.width, r.canvas.height); ctx.restore(); }
  }
  function drawStickers(r, t) {
    const cx = r.cx; const cam = r.stage && r.stage._camLast; const heads = (r.stage && r.stage.lastHeads) || [];
    cx.stickers.forEach((s) => {
      if (t < s.start || t > s.end) return; const p = t - s.start; const out = clamp01((s.end - t) / 0.18); const k = easeOutBack(p / 0.28) * out; if (k <= 0) return;
      const b = r.timeline[s.beat] || {}; const hd = heads.find((h) => h.who === (b.sc && b.sc.speaker)) || heads[0] || { x: 600, y: 1150, r: 92 }; const [hx, hy] = viaCam(cam, hd.x, hd.y);
      const dir = hash(s.seed) > 0.5 ? 1 : -1; let x = hx + dir * 250; if (x > 870 || x < 210) x = hx - dir * 250; x = Math.max(210, Math.min(870, x)); const y = Math.max(680, hy - hd.r * (cam ? cam.z : 1) - 150);
      const rot = (hash(s.seed + 1) - 0.5) * 0.35 + Math.sin(t * 5) * 0.03;
      inWorld(r, (ctx) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(k, k);
        if (isEmojiOnly(s.text)) { const ch = Array.from(s.text.trim())[0]; drawEmoji(ctx, ch, 0, 0, 230 + Math.sin(t * 8) * 6); }
        else { const cols = [['#ffe14d', OLC], ['#ff2d55', '#ffffff'], ['#39d5ff', OLC], ['#7cff6b', OLC], ['#ffffff', OLC]]; const [bg, fg] = cols[s.seed % cols.length]; ctx.font = '900 70px ' + FONT; const tt = s.text.toUpperCase(); const w = Math.min(560, ctx.measureText(tt).width) + 80;
          if (/!|\?|WHAT|BRUH|💀/.test(tt) && s.seed % 2) { burst(ctx, 0, 0, w * 0.62, bg, 14); } else { ctx.fillStyle = '#ffffff'; rr(ctx, -w / 2 - 12, -64, w + 24, 128, 30); ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = OLC; ctx.stroke(); rr(ctx, -w / 2, -52, w, 104, 22); ctx.fillStyle = bg; ctx.fill(); }
          ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; if (fg === '#ffffff') { ctx.lineWidth = 10; ctx.strokeStyle = OLC; ctx.strokeText(tt, 0, 4, 560); } ctx.fillText(tt, 0, 4, 560); }
        ctx.restore();
      });
    });
  }
  Object.assign(VTS.comedy, { drawFx, drawStickers, drawCamFx, inWorld, pill, burst, drawEmoji });

  // ======================= captions, hook, CTA, progress, safe zones, loop =======================
  const EMO_RE = /(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*)/gu;
  function splitEmoji(text) { const emojis = []; const plain = String(text || '').replace(EMO_RE, (m) => { emojis.push(m); return ''; }).replace(/\s{2,}/g, ' ').trim(); return { plain, emojis }; }
  const CAP_COL = { emph: '#ffe14d', num: '#7cff6b', beast: ['#ffe14d', '#7cff6b', '#ff4d6d', '#39d5ff'] };
  function capBase(r) { const cap = r.LY.cap; let cy = cap.cy; const cx = r.cx; if (cx && cx.hookBottom && cx.hookVisible) cy = Math.max(cy, cx.hookBottom + (r.LY.aspect === '9:16' ? 120 : 70)); return { cx: cap.cx, cy, maxW: cap.maxW, size: cap.size }; }
  function drawCaptionsPreset(r, t) {
    const i = r.beatAt(t); if (i < 0) return; const b = r.timeline[i]; const style = r.o.captionStyle; const ctx = r.ctx; const s = r.s; const P = capBase(r);
    let active = 0; b.wordTimes.forEach((wt, wi) => { if (t >= wt - 0.02) active = wi; });
    const upper = r.o.captionCase === 'upper'; const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const clean = (w) => splitEmoji(w).plain || w;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    if (style === 'clean') {
      const size = 74 * s * P.size * (r.scenes ? 1 : 1.15); ctx.font = '700 ' + size + 'px ' + FONT; const space = ctx.measureText(' ').width; const maxW = P.maxW * s * 0.96;
      const lines = []; let cur = []; let cw = 0; b.words.forEach((w, wi) => { const ww = ctx.measureText(clean(w)).width; if (cur.length && cw + space + ww > maxW) { lines.push({ items: cur, w: cw }); cur = []; cw = 0; } cur.push({ w: clean(w), wi, ww }); cw += (cur.length > 1 ? space : 0) + ww; }); if (cur.length) lines.push({ items: cur, w: cw });
      const lh = size * 1.3; const top = P.cy * s - (lines.length - 1) * lh / 2; const enter = easeOut((t - b.start) / 0.2);
      ctx.globalAlpha = enter; const bgW = Math.max.apply(null, lines.map((l) => l.w)) + size * 0.9; ctx.fillStyle = 'rgba(10,10,20,0.42)'; rr(ctx, P.cx * s - bgW / 2, top - lh / 2 - size * 0.2, bgW, lines.length * lh + size * 0.4, size * 0.5); ctx.fill();
      lines.forEach((l, li) => { let x = P.cx * s - l.w / 2; const y = top + li * lh; l.items.forEach((it) => { const said = t >= b.wordTimes[it.wi] - 0.02; const emph = b.emphasis && norm(it.w) === b.emphasis; if (emph && said) { ctx.fillStyle = r.preset.hi; rr(ctx, x - size * 0.14, y - size * 0.62, it.ww + size * 0.28, size * 1.2, size * 0.25); ctx.fill(); } ctx.fillStyle = emph && said ? '#111' : said ? '#ffffff' : 'rgba(255,255,255,0.5)'; ctx.fillText(it.w, x + it.ww / 2, y + size * 0.04); x += it.ww + space; }); });
      ctx.restore(); return;
    }
    const chunks = b.chunks || chunkWords(b.words); let ci = chunks.findIndex((c) => c.includes(active)); if (ci < 0) ci = 0; const ch = chunks[ci];
    const beast = style === 'beast'; let size = (beast ? 134 : 118) * s * P.size * (r.scenes ? 1 : 1.12);
    const words = ch.map((wi) => { const w = clean(b.words[wi]); return upper ? w.toUpperCase() : w; });
    const weight = beast ? '900 ' : '900 '; ctx.font = weight + size + 'px ' + FONT; let space = ctx.measureText(' ').width; const maxW = P.maxW * s;
    // emphasised / active words are drawn up to ~18% bigger, so lay them out at that width (no words running into each other)
    const isEmph = (k) => { const wi = ch[k]; const n = norm(b.words[wi]); return (b.emphasis && n === b.emphasis) || (/[A-Z]{3,}/.test(b.words[wi].replace(/[^A-Za-z]/g, '')) && b.words[wi] === b.words[wi].toUpperCase() && !upper); };
    const grow = (k) => (beast ? 1 : isEmph(k) ? 1.2 : 1.08);
    let ws = words.map((w, k) => ctx.measureText(w).width * grow(k)); let total = ws.reduce((a, x) => a + x, 0) + space * (words.length - 1);
    let rows = [ch.map((_, k) => k)];
    if (total > maxW) { const k2 = maxW / total; if (k2 > 0.72 || words.length === 1) { size *= Math.max(0.5, k2); } else { rows = words.length === 2 ? [[0], [1]] : [[0, 1], [2]]; const widest = Math.max.apply(null, rows.map((rw) => rw.reduce((a, k) => a + ws[k], 0) + space * (rw.length - 1))); if (widest > maxW) size *= maxW / widest; }
      ctx.font = weight + size + 'px ' + FONT; space = ctx.measureText(' ').width; ws = words.map((w, k) => ctx.measureText(w).width * grow(k)); }
    const lh = size * 1.08; const cs = b.wordTimes[ch[0]]; const since = t - cs;
    let dx = 0; let dy = 0; let kick = 1;
    const emphIdx = b.words.findIndex((w) => b.emphasis && norm(w) === b.emphasis);
    if (b.punch && (ch.includes(emphIdx) || ci === chunks.length - 1)) { const a = 18 * s * Math.exp(-Math.max(0, since - 0.05) * 5); dx = Math.sin(t * 63) * a; dy = Math.cos(t * 51) * a; kick = 1 + 0.14 * Math.exp(-since * 7); }
    const rot = beast ? (hash(i * 7 + ci) - 0.5) * 0.09 : 0; const pk = beast ? easeOutBack(since / 0.16) : 1;
    ctx.translate(P.cx * s + dx, P.cy * s + dy); ctx.rotate(rot); ctx.scale(kick * (0.6 + 0.4 * pk), kick * (0.6 + 0.4 * pk));
    const y0 = -(rows.length - 1) * lh / 2;
    rows.forEach((rw, ri) => {
      const rwW = rw.reduce((a, k) => a + ws[k], 0) + space * (rw.length - 1); let x = -rwW / 2;
      rw.forEach((k) => {
        const wi = ch[k]; const wt = b.wordTimes[wi]; const w = words[k]; const cxw = x + ws[k] / 2; x += ws[k] + space;
        const shown = beast || t >= wt - 0.02 || t < b.start; if (!shown) return;
        const pop = beast ? 1 : easeOutBack((t - wt + 0.02) / 0.14); const isAct = wi === active && !beast; const n = norm(b.words[wi]);
        const emph = (b.emphasis && n === b.emphasis) || /[A-Z]{3,}/.test(b.words[wi].replace(/[^A-Za-z]/g, '')) && b.words[wi] === b.words[wi].toUpperCase() && !upper;
        const isNum = /\d/.test(n);
        let fill = '#ffffff'; if (beast) { if (emph || isNum) fill = CAP_COL.beast[(i + ci) % 4]; } else if (emph) fill = CAP_COL.emph; else if (isNum) fill = CAP_COL.num;
        ctx.save(); ctx.translate(cxw, y0 + ri * lh); const sc = (0.72 + 0.28 * Math.min(pop, 1.25)) * (isAct ? 1.07 : 1) * (emph ? 1.1 : 1); ctx.scale(sc, sc); ctx.font = weight + size + 'px ' + FONT;
        if (beast) { ctx.fillStyle = '#000000'; ctx.fillText(w, size * 0.06, size * 0.08); }
        else { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 16 * s; ctx.shadowOffsetY = 8 * s; }
        ctx.lineWidth = size * (beast ? 0.22 : 0.19); ctx.strokeStyle = '#000000'; ctx.strokeText(w, 0, 0); ctx.shadowColor = 'transparent';
        ctx.fillStyle = fill; ctx.fillText(w, 0, 0); ctx.restore();
      });
    });
    // auto emoji above the chunk
    if (b.emojiFile && ch.includes(b.emojiWord) && t >= b.wordTimes[b.emojiWord] - 0.02) {
      const img = emojiImg(b.emojiFile); if (img) { const k = easeOutBack((t - b.wordTimes[b.emojiWord]) / 0.25); const es = 128 * s * P.size; ctx.save(); ctx.translate(0, y0 - lh * 0.5 - es * 0.62); ctx.rotate(Math.sin(t * 4) * 0.12); ctx.scale(k, k); ctx.drawImage(img, -es / 2, -es / 2, es, es); ctx.restore(); }
    }
    ctx.restore();
  }
  function drawHook(r, t) {
    const cx = r.cx; cx.hookVisible = false; const text = String(r.o.textHook || '').trim(); if (!cx.hookEnd || !text || t > cx.hookEnd + 0.3) return;
    const ctx = r.ctx; const s = r.s; const nine = r.LY.aspect === '9:16'; const sz = (nine ? 78 : 64) * (r.LY.cap.size || 1);
    const x = r.DW / 2; const y = nine ? 300 : r.DH * (r.DW > r.DH ? 0.2 : 0.14);
    const outK = t > cx.hookEnd ? 1 - easeOut((t - cx.hookEnd) / 0.3) : 1; if (outK <= 0) return;
    const { plain, emojis } = splitEmoji(text); ctx.save(); ctx.font = '900 ' + sz * s + 'px ' + FONT; const lines = wrap(ctx, plain.toUpperCase(), (nine ? 880 : Math.min(r.DW * 0.8, 1000)) * s).slice(0, 3);
    const lh = sz * 1.16 * s; const w = Math.max.apply(null, lines.map((l) => ctx.measureText(l).width)) + sz * 1.0 * s; const h = lines.length * lh + sz * 0.6 * s;
    ctx.translate(x * s, y * s + h / 2); ctx.rotate(-0.025 + Math.sin(t * 2.2) * 0.006); ctx.scale(outK, outK);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(ctx, -w / 2 + 8 * s, -h / 2 + 12 * s, w, h, 28 * s); ctx.fill();
    rr(ctx, -w / 2, -h / 2, w, h, 28 * s); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 7 * s; ctx.strokeStyle = OLC; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = OLC; lines.forEach((l, q) => ctx.fillText(l, 0, (q - (lines.length - 1) / 2) * lh + 3 * s));
    if (emojis.length) { const f = S.emojiFile && S.emojiFile(emojis[0]); const img = emojiImg(f); if (img) { const es = sz * 1.5 * s; ctx.save(); ctx.translate(w / 2 - es * 0.2, -h / 2 - es * 0.1); ctx.rotate(0.2 + Math.sin(t * 4) * 0.1); ctx.drawImage(img, -es / 2, -es / 2, es, es); ctx.restore(); } }
    ctx.restore();
    cx.hookVisible = true; cx.hookBottom = y + h / s;
  }
  function drawCta(r, t) {
    const cx = r.cx; const text = cx.cta; if (!text || t < cx.ctaStart + 0.25) return; const ctx = r.ctx; const s = r.s; const nine = r.LY.aspect === '9:16';
    const k = easeOutBack((t - cx.ctaStart - 0.25) / 0.35); const { plain, emojis } = splitEmoji(text); const sz = (nine ? 50 : 40) * (r.LY.cap.size || 1) * s;
    const x = r.DW / 2 * s; const y = (nine ? 930 : r.DH * 0.86) * s; // 9:16: between the captions and the characters' heads
    ctx.save(); ctx.translate(x, y + Math.sin(t * 4) * 6 * s); ctx.rotate(-0.02); ctx.scale(k, k); ctx.font = '900 ' + sz + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = wrap(ctx, plain, (nine ? 780 : r.DW * 0.7) * s).slice(0, 2); const es = emojis.length ? sz * 1.4 : 0; const w = Math.max.apply(null, lines.map((l) => ctx.measureText(l).width)) + sz * 1.3 + es; const lh = sz * 1.2; const h = lines.length * lh + sz * 0.8;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(ctx, -w / 2 + 6 * s, -h / 2 + 10 * s, w, h, h / 2.4); ctx.fill(); rr(ctx, -w / 2, -h / 2, w, h, h / 2.4); ctx.fillStyle = r.preset.hi; ctx.fill(); ctx.lineWidth = 6 * s; ctx.strokeStyle = OLC; ctx.stroke();
    ctx.fillStyle = '#111'; lines.forEach((l, q) => ctx.fillText(l, -es / 2, (q - (lines.length - 1) / 2) * lh + 2 * s));
    if (es) { const f = S.emojiFile && S.emojiFile(emojis[0]); const img = emojiImg(f); if (img) ctx.drawImage(img, w / 2 - es - sz * 0.35, -es / 2, es, es); }
    ctx.restore();
  }
  function drawSafeZones(r) {
    if (!r.o.safeZones) return; const ctx = r.ctx; const s = r.s; const DW = r.DW; const DH = r.DH; if (r.LY.aspect !== '9:16') return;
    ctx.save(); ctx.lineWidth = 4 * s;
    const zone = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x * s, y * s, w * s, h * s); };
    const pf = String(r.o.safeZones); const tk = pf !== 'youtube'; const yt = pf !== 'tiktok';
    if (tk) { zone(0, 0, DW, 130, 'rgba(255,40,80,0.22)'); zone(0, DH - 484, DW, 484, 'rgba(255,40,80,0.22)'); zone(DW - 140, 130, 140, DH - 614, 'rgba(255,40,80,0.22)'); zone(0, 130, 44, DH - 614, 'rgba(255,40,80,0.16)'); }
    if (yt) { ctx.strokeStyle = 'rgba(60,160,255,0.95)'; ctx.setLineDash([18 * s, 12 * s]); ctx.strokeRect(60 * s, 150 * s, (DW - 60 - 216) * s, (DH - 150 - 380) * s); }
    ctx.strokeStyle = 'rgba(80,255,140,0.95)'; ctx.setLineDash([]); ctx.strokeRect(60 * s, 230 * s, 840 * s, 1170 * s);
    ctx.font = '800 ' + 30 * s + 'px ' + FONT; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.fillText((tk ? 'TikTok UI (red) · ' : '') + (yt ? 'YouTube UI (blue dashes) · ' : '') + 'safe for text (green)', 30 * s, (DH - 440) * s, (DW - 60) * s);
    ctx.restore();
  }
  function drawProgress(r, t) {
    if (!r.o.progress) return; const ctx = r.ctx; const s = r.s; const cw = r.canvas.width; const d = r.o.duration || 1; const v = clamp01(t / d); const h = 12 * s;
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(0, 0, cw, h); ctx.fillStyle = r.preset.hi; ctx.fillRect(0, 0, cw * v, h); ctx.beginPath(); ctx.arc(cw * v, h / 2, h, 0, TAU); ctx.fill(); ctx.restore();
  }
  function loopBlend(r, t) {
    if (!r.o.loop) return; const d = r.o.duration || 0; const win = 0.45;
    if (r.openFrame && d && t > d - win) { const ctx = r.ctx; ctx.save(); ctx.globalAlpha = easeInOut((t - (d - win)) / win); ctx.drawImage(r.openFrame, 0, 0); ctx.restore(); }
  }

  // ======================= Renderer integration =======================
  const RENDER = VTS.render; const RP = RENDER && RENDER.Renderer && RENDER.Renderer.prototype;
  if (RP) {
    const baseSetup = RP.setup; RP.setup = function (o) { baseSetup.call(this, o); this.cx = null; this.openFrame = null; if (this.o.comedy !== false) direct(this); };
    const basePrepare = RP.prepare; RP.prepare = async function () {
      const n = await basePrepare.call(this);
      if (this.cx && S.EMO) { const files = new Set(this.cx.emojis); ['⏳', '💸', '🧠', '💀', '😭', '😏', '🤨', '😳', '🫠', '🤡', '✨', '👇', '📲', '📌', '👀', '🔥'].forEach((ch) => { const f = S.emojiFile && S.emojiFile(ch); if (f) files.add(f); });
        [this.o.textHook, this.o.ctaSticker].forEach((tx) => splitEmoji(tx).emojis.forEach((ch) => { const f = S.emojiFile && S.emojiFile(ch); if (f) files.add(f); }));
        try { await S.EMO.load(Array.from(files)); } catch (_) { /* emoji are optional */ } }
      return n;
    };
    const baseDrawScenes = RP.drawScenes; RP.drawScenes = function (t) {
      if (!this.cx || !this.stage) return baseDrawScenes.call(this, t);
      const cx = this.cx; let ts = t; const fz = fxAt(cx, t, ['freeze']); if (fz) ts = Math.min(t, fz.start + 0.5);
      const heads = this.stage.lastHeads || []; const b = this.timeline[this.beatAt(t)]; const sp = b && b.sc && b.sc.speaker; const h = heads.find((q) => q.who === sp) || heads[0];
      if (h) {
        // two-shot: frame both characters, leaning towards the speaker; a zoom-punch goes all the way to the speaker's face
        let tx = h.x; let ty = h.y;
        if (heads.length >= 2 && !fxAt(cx, t, ['zoom-punch'])) { const mx = heads.reduce((a, q) => a + q.x, 0) / heads.length; const my = heads.reduce((a, q) => a + q.y, 0) / heads.length; tx = mx + (h.x - mx) * 0.35; ty = my + (h.y - my) * 0.35; }
        const k = cx.lastFocusT == null || Math.abs(t - cx.lastFocusT) > 0.5 ? 1 : 0.22; cx.focus[0] += (tx - cx.focus[0]) * k; cx.focus[1] += (ty - cx.focus[1]) * k; cx.lastFocusT = t;
      }
      const cam = cameraAt(this, t); this.stage._cam = cam; this.stage._camLast = cam;
      const spl = fxAt(cx, t, ['split', 'before-after']); this.stage._split = spl ? { leftEmotion: spl.type === 'split' ? 'happy' : 'dead-inside', leftProps: spl.type === 'split' ? ['sparkles'] : ['zzz'] } : null;
      try { baseDrawScenes.call(this, ts); } finally { this.stage._cam = null; this.stage._split = null; }
    };
    const baseCaptions = RP.drawCaptions; RP.drawCaptions = function (t) {
      const st = this.o.captionStyle; if (st === 'none') return;
      if (st === 'tiktok' || st === 'beast' || st === 'clean') return drawCaptionsPreset(this, t);
      if (this.cx && this.cx.hookVisible && this.cx.hookBottom) { const P = capBase(this); const d = (P.cy - this.LY.cap.cy) * this.s; this.ctx.save(); this.ctx.translate(0, d); try { return baseCaptions.call(this, t); } finally { this.ctx.restore(); } }
      return baseCaptions.call(this, t);
    };
    const baseFinish = RP.drawFinish; RP.drawFinish = function (t) { if (!this.cx) return baseFinish.call(this, t); const pr = this.o.progress; this.o.progress = false; try { baseFinish.call(this, t); } finally { this.o.progress = pr; } drawProgress(this, t); };
    const baseDraw = RP.draw; RP.draw = function (t) {
      if (!this.cx) return baseDraw.call(this, t);
      const cx = this.cx;
      if (this.scenes) {
        this.drawScenes(t); drawFx(this, t); drawCamFx(this, t); this.drawSceneStep(t); drawStickers(this, t);
        drawHookMeasure(this, t); this.drawCaptions(t); drawHook(this, t); drawCta(this, t); this.drawWatermark(); this.drawFinish(t);
      } else {
        const pr = this.drawProbe; this.drawProbe = () => {}; try { cx.hookVisible = false; drawHookMeasure(this, t); baseDraw.call(this, t); } finally { this.drawProbe = pr; }
        drawHook(this, t); drawCta(this, t);
      }
      if (this.o.loop && !this.openFrame && t < 0.05) { try { const c = document.createElement('canvas'); c.width = this.canvas.width; c.height = this.canvas.height; c.getContext('2d').drawImage(this.canvas, 0, 0); this.openFrame = c; } catch (_) { /* ignore */ } }
      loopBlend(this, t); drawSafeZones(this); this.drawProbe(t);
    };
    // classic mode: measure the hook first so the captions can move below it
    const drawHookMeasure = (r, t) => { const ctx = r.ctx; ctx.save(); ctx.globalAlpha = 0; drawHook(r, t); ctx.restore(); };
  }

  // ======================= cover / thumbnail export =======================
  const DRAMA = ['shocked', 'panicking', 'rage', 'dead-inside', 'crying-laughing', 'facepalm', 'eye-roll', 'side-eye', 'smug', 'anxious', 'surprised'];
  async function cover(canvas, o) {
    const R = VTS.render; const [cw, chh] = R.frameSize((o.look && o.look.aspect) || '9:16', 1); canvas.width = cw; canvas.height = chh; // full-size cover (1080x1920 for 9:16)
    const r = new R.Renderer(canvas); const beats = o.beats || [];
    const words = beats.reduce((a, b) => a + String(b.text || '').split(/\s+/).length, 0); const dur = Math.max(4, words / 2.6);
    r.setup(Object.assign({}, o.look || {}, { beats, speechStart: 0.3, speechEnd: 0.3 + dur, duration: dur + 1.1, textHook: '', ctaSticker: '', progress: false, safeZones: false, loop: false, intensity: 'off', captionStyle: 'none' }));
    await r.prepare(); try { await document.fonts.load('900 100px Montserrat'); } catch (_) { /* ignore */ }
    const tl = r.timeline; let pick = tl.findIndex((b) => b.sc && DRAMA.includes(b.sc.emotion)); if (pick < 0) pick = Math.min(1, tl.length - 1);
    const b = tl[Math.max(0, pick)]; const t = b ? b.start + (b.end - b.start) * 0.6 : 1;
    r.draw(Math.max(0.05, t - 0.3)); r.draw(t); // warm the focus smoothing
    const ctx = r.ctx; const s = r.s; const text = String(o.text || '').trim();
    if (text) {
      const { plain, emojis } = splitEmoji(text); const nine = r.LY.aspect === '9:16'; const sz = (nine ? 128 : 100) * s; ctx.save(); ctx.font = '900 ' + sz + 'px ' + FONT; const lines = wrap(ctx, plain.toUpperCase(), r.DW * 0.86 * s).slice(0, 4); const lh = sz * 1.05;
      const y0 = (nine ? 380 : r.DH * 0.22) * s; ctx.translate(r.DW / 2 * s, y0); ctx.rotate(-0.035); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      const g = ctx.createLinearGradient(0, -sz, 0, lines.length * lh); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      lines.forEach((l, q) => { const y = q * lh; const last = q === lines.length - 1; ctx.fillStyle = '#000'; ctx.fillText(l, sz * 0.06, y + sz * 0.08); ctx.lineWidth = sz * 0.2; ctx.strokeStyle = '#000'; ctx.strokeText(l, 0, y); ctx.fillStyle = last ? CAP_COL.emph : '#ffffff'; ctx.fillText(l, 0, y); });
      if (emojis.length) { const f = S.emojiFile && S.emojiFile(emojis[0]); if (f) { try { await S.EMO.load([f]); } catch (_) { /* ignore */ } const img = emojiImg(f); if (img) { const es = sz * 1.6; ctx.drawImage(img, r.DW * 0.3 * s, lines.length * lh - es * 0.2, es, es); } } }
      ctx.restore();
    }
    if (o.handle) { ctx.save(); ctx.font = '800 ' + 40 * s + 'px ' + FONT; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 10 * s; ctx.fillText(o.handle, r.DW / 2 * s, (r.DH - 90) * s); ctx.restore(); }
    return await new Promise((ok) => canvas.toBlob((bl) => ok(bl), 'image/png'));
  }

  Object.assign(VTS.comedy, { drawCaptionsPreset, drawHook, drawCta, drawSafeZones, splitEmoji, cover, DRAMA });
}());
