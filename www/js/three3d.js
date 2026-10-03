/* v1.5 3D animation style: stylised clay / low-poly 3D sets and characters (you, your Brain, friend, boss, crush, mom, therapist, cat)
   rendered for free in the browser/WebView with Three.js (vendor/three.min.js, MIT, loaded only when the 3D style is used).
   The 3D frame replaces the 2D cartoon layer only: captions, meme FX, stickers, props, hook, CTA and colour finish stay the same,
   so every format, aspect ratio and long video works. Faces have expressions, blinking and voice-synced mouths; bodies breathe,
   squash & stretch and gesture; the camera orbits/dollies a little on top of the 2D camera (punch-ins, shakes). */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {});
  const S = VTS.scenes; const R = VTS.render; if (!S || !R || !R.Renderer) return;
  const W = 1080; const H = 1920; const TAU = Math.PI * 2;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  let loading = null;
  function ensure() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (!loading) loading = new Promise((ok, err) => { const s = document.createElement('script'); s.src = 'vendor/three.min.js'; s.async = true; s.onload = () => (window.THREE ? ok(window.THREE) : err(new Error('3D engine missing'))); s.onerror = () => { loading = null; err(new Error('Could not load the 3D engine')); }; document.head.appendChild(s); });
    return loading;
  }
  function webglOk() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (_) { return false; } }

  // world px (2D design units) <-> 3D units: 100 px = 1 unit on the subject plane z = 0
  const X3 = (x) => (x - 540) / 100; const Y3 = (y) => (960 - y) / 100;
  const PAL = {
    me: { skin: '#f3c6a0', hair: '#3b2828', top: null, pants: '#33405f', shoe: '#f6f2ea' },
    friend: { skin: '#c68b62', hair: '#231a1c', top: null, pants: '#4a3d63', shoe: '#2b2b33', long: true },
    boss: { skin: '#e8b791', hair: '#8c8c96', top: '#39415a', pants: '#262b3b', shoe: '#17171c', glasses: true, tie: true },
    crush: { skin: '#f4c7a6', hair: '#8a4a2b', top: '#ff8fb3', pants: '#3e4b80', shoe: '#ffffff', long: true },
    mom: { skin: '#d9a17b', hair: '#5b3a2e', top: '#9b7bd4', pants: '#4a4066', shoe: '#6b4f3a', bun: true },
    therapist: { skin: '#8e5b3c', hair: '#1c1718', top: '#3f8577', pants: '#2f3342', shoe: '#2b2b33', glasses: true, curly: true },
  };
  // emotion -> face rig
  function faceSpec(emo) {
    const f = { eye: 'open', eyeS: 1, pupil: 1, look: [0, 0], brow: [0, 0], mouth: 'smile', blush: 0, tear: false, laugh: false, sweat: false, steam: false, red: false };
    const set = (o) => Object.assign(f, o);
    switch (emo) {
      case 'happy': set({ eye: 'happy', mouth: 'grin', blush: 0.6, brow: [0.15, 0.1] }); break;
      case 'sad': set({ brow: [-0.35, 0.05], mouth: 'frown', tear: true, look: [0, -0.4] }); break;
      case 'anxious': set({ eyeS: 1.2, brow: [-0.3, 0.1], mouth: 'wavy', sweat: true }); break;
      case 'angry': set({ brow: [0.45, -0.1], mouth: 'grit', steam: true, red: true }); break;
      case 'calm': set({ eye: 'closed', mouth: 'smile' }); break;
      case 'tired': set({ eye: 'half', mouth: 'flat' }); break;
      case 'surprised': set({ eyeS: 1.3, brow: [-0.2, 0.25], mouth: 'o' }); break;
      case 'eye-roll': set({ eye: 'half', look: [0.2, 1], brow: [-0.15, 0.2], mouth: 'flat' }); break;
      case 'side-eye': set({ eye: 'half', look: [-1, 0], brow: [0.25, 0], mouth: 'smirk' }); break;
      case 'shocked': set({ eyeS: 1.55, pupil: 0.45, brow: [-0.25, 0.4], mouth: 'scream', sweat: true }); break;
      case 'crying-laughing': set({ eye: 'happy', brow: [-0.2, 0.1], mouth: 'grin', laugh: true, blush: 0.6 }); break;
      case 'smug': set({ eye: 'half', brow: [0.2, 0.15], mouth: 'smirk', blush: 0.35 }); break;
      case 'dead-inside': set({ eye: 'dead', mouth: 'flat', pupil: 0.55 }); break;
      case 'panicking': set({ eyeS: 1.35, pupil: 0.7, brow: [-0.35, 0.15], mouth: 'wavy', sweat: true }); break;
      case 'blushing': set({ brow: [-0.2, 0.05], mouth: 'smile', blush: 1, look: [0.3, -0.6] }); break;
      case 'rage': set({ brow: [0.55, -0.15], mouth: 'grit', steam: true, red: true }); break;
      case 'facepalm': set({ eye: 'closed', brow: [-0.2, 0], mouth: 'flat' }); break;
      default: break;
    }
    return f;
  }
  const LISTEN = { angry: 'shocked', rage: 'shocked', smug: 'eye-roll', happy: 'side-eye', 'crying-laughing': 'dead-inside', anxious: 'side-eye', panicking: 'side-eye', sad: 'blushing', surprised: 'smug', shocked: 'smug', 'side-eye': 'smug', 'eye-roll': 'rage' };

  class World {
    constructor(T) {
      this.T = T; const r = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
      r.setPixelRatio(1); r.outputColorSpace = T.SRGBColorSpace; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
      this.r = r; this.scene = new T.Scene(); this.cam = new T.PerspectiveCamera(36, W / H, 1, 120);
      this.mats = new Map(); this.sets = new Map(); this.chars = new Map(); this.pid = '';
      const hemi = new T.HemisphereLight(0xfff4e6, 0x46406a, 1.15); this.scene.add(hemi); this.hemi = hemi;
      const key = new T.DirectionalLight(0xffe2c0, 1.9); key.position.set(-6, 10, 14); this.scene.add(key); this.key = key;
      const rim = new T.DirectionalLight(0x9fd8ff, 1.2); rim.position.set(8, 6, -6); this.scene.add(rim); this.rim = rim;
      this.geo = { sph: new T.SphereGeometry(1, 28, 20), sphLo: new T.IcosahedronGeometry(1, 1), cap: new T.CapsuleGeometry(1, 1, 6, 14), box: new T.BoxGeometry(1, 1, 1), cyl: new T.CylinderGeometry(1, 1, 1, 20), cone: new T.ConeGeometry(1, 1, 7), torus: new T.TorusGeometry(1, 0.22, 8, 20, Math.PI), circ: new T.CircleGeometry(1, 24), half: new T.CircleGeometry(1, 20, Math.PI, Math.PI), plane: new T.PlaneGeometry(1, 1), ico: new T.IcosahedronGeometry(1, 0) };
      const sc = document.createElement('canvas'); sc.width = sc.height = 64; const g = sc.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,0.42)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      this.shadowTex = new T.CanvasTexture(sc); this.shadowMat = new T.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false });
    }
    m(hex, o) { const st = this.stage; const col = o && o.raw ? hex : st.c(hex); const k = col + (o ? JSON.stringify(o) : ''); let v = this.mats.get(k); if (!v) { const T = this.T; v = o && o.basic ? new T.MeshBasicMaterial({ color: col, transparent: !!o.op, opacity: o.op || 1, side: T.DoubleSide }) : new T.MeshStandardMaterial({ color: col, roughness: o && o.rough != null ? o.rough : 0.88, metalness: 0, flatShading: !!(o && o.flat), emissive: o && o.glow ? col : 0x000000, emissiveIntensity: o && o.glow ? o.glow : 0, transparent: !!(o && o.op), opacity: o && o.op ? o.op : 1 }); this.mats.set(k, v); } return v; }
    mesh(geo, mat, p, s, rot) { const x = new this.T.Mesh(this.geo[geo] || geo, mat); if (p) x.position.set(p[0], p[1], p[2]); if (s != null) { if (typeof s === 'number') x.scale.setScalar(s); else x.scale.set(s[0], s[1], s[2]); } if (rot) x.rotation.set(rot[0], rot[1], rot[2]); return x; }
    setPreset(stage) { if (this.pid === stage.pid) return; this.pid = stage.pid; this.mats.forEach((m) => m.dispose()); this.mats.clear(); this.sets.forEach((g) => this.scene.remove(g)); this.sets.clear(); this.chars.forEach((c) => this.scene.remove(c.root)); this.chars.clear(); }

    // ---------- faces ----------
    face(parent, z, k) {
      const T = this.T; const F = { g: new T.Group() }; F.g.position.set(0, 0, z); F.g.scale.setScalar(k); parent.add(F.g);
      const white = this.m('#ffffff', { raw: true, rough: 0.4 }); const ink = this.m('#1d2034', { raw: true, rough: 0.5 }); const mouthM = this.m('#6d2430', { raw: true });
      F.eyes = [-1, 1].map((s) => { const e = new T.Group(); e.position.set(s * 0.36, 0.12, 0); const ball = this.mesh('sph', white, [0, 0, 0], [0.2, 0.25, 0.1]); const pup = this.mesh('sph', ink, [0, 0, 0.08], [0.11, 0.13, 0.05]); const shine = this.mesh('sph', white, [-0.04, 0.05, 0.12], 0.03); e.add(ball, pup, shine); const arc = this.mesh('torus', ink, [0, 0, 0.06], [0.16, 0.16, 0.25]); arc.visible = false; e.add(arc); const lid = this.mesh('box', ink, [0, 0.03, 0.09], [0.46, 0.05, 0.05]); lid.visible = false; e.add(lid); F.g.add(e); return { e, ball, pup, shine, arc, lid }; });
      F.brows = [-1, 1].map((s) => { const b = this.mesh('box', ink, [s * 0.36, 0.47, 0.06], [0.36, 0.075, 0.07]); F.g.add(b); return b; });
      F.mouth = new T.Group(); F.mouth.position.set(0, -0.36, 0.04); F.g.add(F.mouth);
      F.open = this.mesh('sph', mouthM, [0, 0, 0], [0.2, 0.1, 0.06]); F.tongue = this.mesh('sph', this.m('#ff8a95', { raw: true }), [0, -0.05, 0.03], [0.1, 0.05, 0.03]); F.open.add(F.tongue);
      F.line = this.mesh('torus', ink, [0, 0, 0], [0.22, 0.22, 0.3]); F.grin = this.mesh('half', mouthM, [0, 0.04, 0.03], [0.27, 0.27, 1]); F.teeth = this.mesh('box', white, [0, 0.03, 0.04], [0.5, 0.06, 0.02]); F.grin.add(F.teeth);
      F.grit = this.mesh('box', white, [0, 0, 0.02], [0.44, 0.17, 0.05]); F.flat = this.mesh('box', ink, [0, 0, 0.02], [0.3, 0.05, 0.05]);
      F.mouth.add(F.open, F.line, F.grin, F.grit, F.flat);
      F.blush = [-1, 1].map((s) => { const b = this.mesh('circ', this.m('#ff5f7a', { raw: true, basic: true, op: 0.45 }), [s * 0.62, -0.12, -0.02], [0.17, 0.1, 1]); F.g.add(b); return b; });
      F.drops = [0, 1, 2].map(() => { const d = this.mesh('sph', this.m('#8fd3ff', { raw: true, rough: 0.2 }), [0, 0, 0.1], [0.07, 0.1, 0.07]); d.visible = false; F.g.add(d); return d; });
      F.steam = [0, 1, 2].map(() => { const d = this.mesh('sph', this.m('#ffffff', { raw: true, basic: true, op: 0.5 }), [0, 0, 0], 0.15); d.visible = false; parent.add(d); return d; });
      return F;
    }
    animFace(F, emo, t, talk, amp, seed) {
      const f = faceSpec(emo); const blinkT = (t + seed * 1.7) % 3.4; const blink = f.eye === 'open' && blinkT < 0.13 ? Math.abs(Math.cos(blinkT / 0.13 * Math.PI)) : 1;
      F.eyes.forEach((E, i) => {
        const s = i ? 1 : -1; const op = f.eye === 'open' || f.eye === 'dead';
        E.ball.visible = op || f.eye === 'half'; E.pup.visible = E.ball.visible; E.shine.visible = f.eye === 'open' && f.pupil > 0.6; E.arc.visible = f.eye === 'happy' || f.eye === 'closed'; E.lid.visible = f.eye === 'half';
        E.e.scale.set(f.eyeS, f.eyeS * (f.eye === 'half' ? 0.55 : 1) * Math.max(0.08, blink), 1);
        E.arc.rotation.z = f.eye === 'happy' ? 0 : Math.PI; E.arc.position.y = f.eye === 'happy' ? -0.04 : 0.04;
        const dart = emo === 'panicking' ? Math.sign(Math.sin(t * 8 + 0.5)) * 0.7 : emo === 'anxious' ? Math.sin(t * 2.8) * 0.6 : 0;
        E.pup.position.x = (f.look[0] + dart) * 0.07; E.pup.position.y = f.look[1] * 0.08; E.pup.scale.set(0.11 * f.pupil, 0.13 * f.pupil, 0.05);
        E.ball.material = f.eye === 'dead' ? this.m('#d9d9e0', { raw: true }) : this.m('#ffffff', { raw: true, rough: 0.4 });
        const br = F.brows[i]; br.rotation.z = s * -f.brow[0] * 0.9; br.position.y = 0.47 + f.brow[1] * 0.35 + (emo === 'shocked' ? Math.sin(t * 30) * 0.01 : 0);
      });
      let m = f.mouth; if (talk && m !== 'scream') m = m === 'grin' ? 'grin-talk' : 'talk';
      F.open.visible = m === 'talk' || m === 'o' || m === 'scream'; F.line.visible = m === 'smile' || m === 'frown' || m === 'smirk' || m === 'wavy'; F.grin.visible = m === 'grin' || m === 'grin-talk'; F.grit.visible = m === 'grit'; F.flat.visible = m === 'flat';
      if (m === 'talk') F.open.scale.set(0.18 + amp * 0.05, 0.04 + amp * 0.2, 0.06);
      if (m === 'o') F.open.scale.set(0.12, 0.16, 0.06);
      if (m === 'scream') F.open.scale.set(0.22, 0.26 + amp * 0.12 + Math.sin(t * 28) * 0.01, 0.06);
      if (F.grin.visible) { const k = m === 'grin-talk' ? 0.8 + amp * 0.6 : 1; F.grin.scale.set(0.27, 0.27 * k, 1); }
      F.line.rotation.set(0, 0, m === 'frown' ? 0 : Math.PI); F.line.position.y = m === 'frown' ? -0.12 : 0.1; F.line.rotation.z += m === 'smirk' ? 0.35 : m === 'wavy' ? Math.sin(t * 9) * 0.25 : 0; F.line.scale.set(m === 'smirk' ? 0.18 : 0.22, m === 'wavy' ? 0.1 : 0.22, 0.3);
      F.blush.forEach((b) => { b.visible = f.blush > 0; b.scale.set(0.17 * (0.7 + f.blush * 0.6), 0.1 * (0.7 + f.blush * 0.6), 1); });
      F.drops.forEach((d, q) => {
        let on = false; let p = (t * (f.laugh ? 1.5 : 0.7) + q * 0.37) % 1;
        if (f.tear && q === 0) { on = true; d.position.set(-0.4, -0.05 - p * 0.9, 0.1); }
        else if (f.laugh && q < 2) { on = true; const s = q ? 1 : -1; d.position.set(s * (0.45 + p * 0.6), 0.05 + Math.sin(p * Math.PI) * 0.3 - p * 0.3, 0.05); }
        else if (f.sweat && q === 2) { on = true; p = (t * 0.45) % 1; d.position.set(0.72, 0.55 - p * 0.6, 0.0); }
        d.visible = on; if (on) d.scale.set(0.07, 0.1, 0.07).multiplyScalar(1 - p * 0.4);
      });
      F.steam.forEach((d, q) => { d.visible = f.steam; if (f.steam) { const p = (t * 0.8 + q / 3) % 1; d.position.set((q - 1) * 0.6, 1.3 + p * 1.1, 0); d.scale.setScalar(0.15 + p * 0.2); d.material.opacity = 0.55 * (1 - p); } });
      return f;
    }

    // ---------- characters ----------
    person(who, accent, accent2) {
      const T = this.T; const p = Object.assign({}, PAL[who] || PAL.me); if (!p.top) p.top = who === 'friend' ? accent2 : accent;
      const root = new T.Group(); const body = new T.Group(); root.add(body);
      const skin = this.m(p.skin); const top = this.m(p.top); const pants = this.m(p.pants); const shoe = this.m(p.shoe, { rough: 0.6 }); const hair = this.m(p.hair, { rough: 0.95 });
      const legs = [-1, 1].map((s) => { const g = new T.Group(); g.position.set(s * 0.34, 1.55, 0); const l = this.mesh('cap', pants, [0, -0.7, 0], [0.27, 0.62, 0.27]); const sh = this.mesh('sph', shoe, [0, -1.45, 0.16], [0.33, 0.2, 0.46]); g.add(l, sh); body.add(g); return g; });
      const torso = this.mesh('cap', top, [0, 2.25, 0], [0.82, 0.5, 0.62]); body.add(torso);
      const hood = this.mesh('torus', this.m(p.top), [0, 2.95, -0.1], [0.55, 0.55, 1.6], [Math.PI / 2 + 0.3, 0, 0]); body.add(hood);
      if (p.tie) body.add(this.mesh('box', this.m('#e2443d'), [0, 2.35, 0.6], [0.16, 0.9, 0.06]));
      const arms = [-1, 1].map((s) => { const g = new T.Group(); g.position.set(s * 0.86, 2.85, 0); const a = this.mesh('cap', top, [0, -0.62, 0], [0.22, 0.55, 0.22]); const h = this.mesh('sph', skin, [0, -1.32, 0], 0.27); g.add(a, h); body.add(g); g.userData.hand = h; return g; });
      const head = new T.Group(); head.position.set(0, 4.05, 0); body.add(head);
      head.add(this.mesh('sph', skin, [0, 0, 0], [1, 0.97, 0.94]));
      [-1, 1].forEach((s) => head.add(this.mesh('sph', skin, [s * 0.95, 0, -0.05], [0.2, 0.24, 0.14])));
      head.add(this.mesh(new T.SphereGeometry(1.06, 26, 16, 0, TAU, 0, 1.25), hair, [0, 0.06, -0.06], [1, 1, 1], [-0.25, 0, 0]));
      if (p.long) head.add(this.mesh('sph', hair, [0, -0.35, -0.42], [1.08, 1.15, 0.75]));
      if (p.bun) head.add(this.mesh('sph', hair, [0, 1.05, -0.3], 0.38));
      if (p.curly) for (let k = 0; k < 9; k++) { const a = Math.PI * (0.05 + k / 8 * 0.9); head.add(this.mesh('sphLo', hair, [Math.cos(a) * 1.0, Math.sin(a) * 0.95 + 0.15, -0.2], 0.36)); }
      const F = this.face(head, 0.9, 1);
      if (p.glasses) { const gm = this.m('#1d2034', { raw: true }); [-1, 1].forEach((s) => { const ring = this.mesh(new T.TorusGeometry(0.24, 0.035, 6, 18), gm, [s * 0.36, 0.12, 0.98]); head.add(ring); }); head.add(this.mesh('box', gm, [0, 0.14, 0.99], [0.24, 0.04, 0.04])); }
      const shadow = this.mesh('plane', this.shadowMat, [0, 0.02, 0], [3, 1, 1], [-Math.PI / 2, 0, 0]); root.add(shadow);
      return { root, body, legs, arms, head, F, kind: 'person', who, headR: 1.0, headY: 4.05 };
    }
    brain() {
      const T = this.T; const root = new T.Group(); const body = new T.Group(); root.add(body);
      const pink = this.m('#ff9ec4', { rough: 0.75 }); const pinkD = this.m('#f27fae'); const shoe = this.m('#ffffff', { rough: 0.6 });
      const head = new T.Group(); head.position.set(0, 3.2, 0); body.add(head);
      const bumps = [[-92, -6, 44], [-70, -52, 46], [-24, -78, 48], [26, -80, 48], [72, -54, 46], [94, -8, 44], [78, 40, 44], [36, 62, 44], [-14, 64, 44], [-60, 50, 44], [0, -10, 80]];
      bumps.forEach(([x, y, r], k) => head.add(this.mesh('sph', k === bumps.length - 1 ? pink : this.m(k % 2 ? '#ff9ec4' : '#ffa9cb', { rough: 0.75 }), [x / 80, -y / 80, (k === bumps.length - 1 ? 0.15 : -0.1 + hash(k) * 0.3)], [r / 62, r / 66, 0.95])));
      head.add(this.mesh('sph', pink, [0, 0, 0.05], [1.45, 1.1, 1.05]));
      const legs = [-1, 1].map((s) => { const g = new T.Group(); g.position.set(s * 0.45, 1.5, 0); g.add(this.mesh('cap', pinkD, [0, -0.6, 0], [0.16, 0.6, 0.16]), this.mesh('sph', shoe, [0, -1.35, 0.15], [0.32, 0.18, 0.44])); body.add(g); return g; });
      const arms = [-1, 1].map((s) => { const g = new T.Group(); g.position.set(s * 1.35, 3.0, 0); const h = this.mesh('sph', shoe, [0, -1.1, 0], 0.22); g.add(this.mesh('cap', pinkD, [0, -0.5, 0], [0.13, 0.55, 0.13]), h); g.userData.hand = h; body.add(g); return g; });
      const F = this.face(head, 1.08, 0.95);
      const shadow = this.mesh('plane', this.shadowMat, [0, 0.02, 0], [3.4, 1, 1], [-Math.PI / 2, 0, 0]); root.add(shadow);
      return { root, body, legs, arms, head, F, kind: 'brain', who: 'brain', headR: 1.4, headY: 3.2 };
    }
    cat() {
      const T = this.T; const root = new T.Group(); const body = new T.Group(); root.add(body);
      const fur = this.m('#f2a65a', { rough: 0.95 }); const belly = this.m('#fff1dc'); const pinkE = this.m('#ffb3c1');
      body.add(this.mesh('sph', fur, [0, 0.95, 0], [0.95, 1.0, 0.8]), this.mesh('sph', belly, [0, 0.85, 0.45], [0.5, 0.65, 0.4]));
      [-1, 1].forEach((s) => body.add(this.mesh('sph', fur, [s * 0.38, 0.15, 0.45], [0.3, 0.18, 0.35])));
      const tail = new T.Group(); tail.position.set(0.7, 0.4, -0.3); for (let k = 0; k < 6; k++) tail.add(this.mesh('sph', fur, [k * 0.18, k * 0.28, 0], 0.17)); body.add(tail);
      const head = new T.Group(); head.position.set(0, 2.25, 0.1); body.add(head);
      head.add(this.mesh('sph', fur, [0, 0, 0], [1, 0.85, 0.85]));
      [-1, 1].forEach((s) => { head.add(this.mesh('cone', fur, [s * 0.55, 0.85, 0], [0.32, 0.6, 0.25], [0, 0, -s * 0.3])); head.add(this.mesh('cone', pinkE, [s * 0.53, 0.8, 0.12], [0.18, 0.4, 0.1], [0, 0, -s * 0.3])); });
      head.add(this.mesh('sph', this.m('#ff8fa3', { raw: true }), [0, -0.12, 0.84], [0.1, 0.07, 0.06]));
      const F = this.face(head, 0.8, 0.85); F.eyes.forEach((E) => { E.ball.material = this.m('#c9f06b', { raw: true }); });
      const shadow = this.mesh('plane', this.shadowMat, [0, 0.02, 0], [2.6, 1, 1], [-Math.PI / 2, 0, 0]); root.add(shadow);
      return { root, body, legs: [], arms: [], head, F, kind: 'cat', who: 'cat', headR: 0.95, headY: 2.25, tail };
    }
    charFor(who, slot) {
      const key = who + '|' + slot; let c = this.chars.get(key);
      if (!c) { const a = this.stage.art; c = who === 'brain' ? this.brain() : who === 'cat' ? this.cat() : this.person(who, a.accent, a.accent2); this.scene.add(c.root); this.chars.set(key, c); }
      return c;
    }
    animChar(c, o) {
      const { t, emo, pose, talk, amp, mo, seed, x, y, scale, facing } = o;
      c.root.visible = true; c.root.position.set(x, y, 0); c.root.rotation.set(0, (facing || 0) * 0.5 + Math.sin(t * 0.4 + seed) * 0.08, 0);
      let sx = 1; let sy = 1; let hop = 0;
      if (mo && mo.emoChanged && mo.age < 0.55) { const k = mo.age / 0.55; const e = Math.exp(-k * 4.5) * Math.cos(k * Math.PI * 3.2); sy = 1 + 0.12 * e; sx = 1 - 0.08 * e; }
      sy *= 1 + 0.015 * Math.sin(t * 2.4 + seed);
      if (pose === 'celebrating') { hop = Math.abs(Math.sin(t * 6)) * 0.5; }
      if (talk) hop += amp * 0.06;
      c.root.scale.set(scale * sx, scale * sy, scale * sx); c.body.position.y = hop;
      c.body.rotation.z = (mo && mo.chaos ? Math.sin(t * 38) * 0.02 : 0) + Math.sin(t * 0.9 + seed) * 0.025;
      c.head.rotation.set(Math.sin(t * 1.3 + seed) * 0.05 + (talk ? amp * 0.08 : 0), Math.sin(t * 0.7 + seed) * 0.12, Math.sin(t * 1.1 + seed) * 0.04 + (emo === 'smug' || emo === 'side-eye' ? 0.15 : 0));
      if (c.tail) c.tail.rotation.z = Math.sin(t * (emo === 'rage' || emo === 'angry' ? 7 : 2.2)) * 0.4;
      // arms: pose + emotion + emphasis gesture
      let aR = 0.18; let aL = -0.18; let fR = 0; let fL = 0; const wave = Math.sin(t * 7);
      if (pose === 'talking' || talk) { aR = 0.5 + wave * 0.18 * (talk ? 1 : 0.3); fR = -0.4; }
      if (pose === 'celebrating' || emo === 'happy' && pose === 'celebrating') { aR = 2.6 + wave * 0.1; aL = -2.6 - wave * 0.1; }
      if (emo === 'shocked' || emo === 'panicking') { aR = 2.4 + wave * 0.1; aL = -2.4 - wave * 0.1; }
      if (pose === 'stressed' || pose === 'sitting-head-in-hands') { aR = 2.7; aL = -2.7; fR = fL = -0.6; }
      if (emo === 'facepalm') { aR = 2.5; fR = -1.2; }
      if (pose === 'standing-thinking') { aR = 2.2; fR = -1.3; }
      if (emo === 'smug') { aR = 0.6; aL = -0.6; fR = fL = 0.5; }
      if (pose === 'scrolling-phone') { aR = 0.9; fR = -1.3; aL = -0.9; fL = -1.3; }
      if (mo && mo.gesture && c.kind !== 'cat') { const k = Math.sin(clamp01(mo.gesture.k) * Math.PI / 2); const g = mo.gesture.kind; const tg = { point: [1.5, -0.2, null], fist: [2.9, 0, null], 'hands-up': [2.7, 0, -2.7], shrug: [1.2, -0.6, -1.2] }[g]; if (tg) { aR = lerp(aR, tg[0], k); fR = lerp(fR, tg[1], k); if (tg[2] != null) { aL = lerp(aL, tg[2], k); fL = lerp(fL, tg[1], k); } } }
      if (o.lie || o.seated && pose === 'sleeping') { aR = 0.12 + (talk ? wave * 0.05 : 0); aL = -0.12; fR = fL = 0; }
      if (c.arms.length) { c.arms[1].rotation.set(fR, 0, aR); c.arms[0].rotation.set(fL, 0, aL); }
      // legs: walking / running swing, sitting
      const walk = pose === 'walking' || pose === 'running' ? Math.sin(t * (pose === 'running' ? 11 : 6)) * (pose === 'running' ? 0.8 : 0.45) : 0;
      if (c.legs.length) { c.legs[0].rotation.x = walk; c.legs[1].rotation.x = -walk; }
      c.legs.forEach((l) => { l.visible = !o.desk; });
      if (o.seated && c.legs.length) { c.legs[0].rotation.x = c.legs[1].rotation.x = -1.45; c.body.position.y = -0.75 + hop; }
      if (o.lie) { c.root.rotation.set(0, 0, Math.PI / 2 - 0.05); c.head.rotation.z += Math.sin(t * 0.8) * 0.1; }
      const f = this.animFace(c.F, emo, t, talk, amp, seed);
      if (c.kind === 'person' && c.head.children[0]) c.head.children[0].material = f.red ? this.m('#f08a7a') : this.m((PAL[c.who] || PAL.me).skin);
    }

    // ---------- sets ----------
    setFor(setting, kind, L) {
      const key = setting + '|' + kind + '|' + (L.desk || ''); let g = this.sets.get(key); if (g) return g;
      const T = this.T; g = new T.Group(); g.userData.anim = []; const a = this.stage.art; const gy = Y3(L.groundY);
      const wallCol = { 'bedroom-night': '#27306b', 'bedroom-day': '#f3dcc2', office: '#c9d6e6', classroom: '#e8e1cc', cafe: '#c98f62', street: '#9cc5e8', park: '#9fd6f0', 'abstract-mind-space': '#3b2a73', 'phone-screen': '#1e2440', void: '#20213a' }[setting] || '#cfd4e4';
      const floorCol = { 'bedroom-night': '#3a2f55', 'bedroom-day': '#c9a27a', office: '#8f9bb0', classroom: '#b58a5a', cafe: '#7a5236', street: '#6e7385', park: '#6fbf5a', 'abstract-mind-space': '#5a3fa0', 'phone-screen': '#2a3050', void: '#2c2d48' }[setting] || '#9a9a9a';
      const wall = this.mesh('plane', this.m(wallCol, { rough: 1 }), [0, 0, -9], [60, 40, 1]); g.add(wall);
      const floor = this.mesh('plane', this.m(floorCol, { rough: 1 }), [0, gy, -2], [60, 30, 1], [-Math.PI / 2, 0, 0]); g.add(floor);
      const add = (...xs) => xs.forEach((x) => g.add(x));
      const z0 = -8.6;
      if (/^bedroom/.test(setting)) {
        const night = setting === 'bedroom-night';
        add(this.mesh('box', this.m('#ffffff'), [3.2, 3.6, z0], [4.4, 4.0, 0.3]), this.mesh('box', this.m(night ? '#2f4fa8' : '#9fdcff', { glow: night ? 0.55 : 0.5 }), [3.2, 3.6, z0 + 0.2], [3.9, 3.5, 0.2]), this.mesh('box', this.m('#ffffff'), [3.2, 3.6, z0 + 0.35], [0.14, 3.5, 0.1]), this.mesh('box', this.m('#ffffff'), [3.2, 3.6, z0 + 0.35], [3.9, 0.14, 0.1]));
        if (night) { const moon = this.mesh('sph', this.m('#fff1b8', { glow: 1.2 }), [4.2, 4.5, z0 + 0.5], 0.42); add(moon); for (let k = 0; k < 10; k++) { const b = this.mesh('sph', this.m(['#ffd27a', '#ff9fb2', '#9fe7ff'][k % 3], { glow: 1.5 }), [-5 + k * 1.1, 7.6 + Math.sin(k) * 0.3, z0 + 0.4], 0.14); add(b); g.userData.anim.push((t) => { b.scale.setScalar(0.1 + 0.07 * (0.5 + 0.5 * Math.sin(t * 2.4 + k * 1.3))); }); } }
        if (kind === 'lie' || kind === 'sit' || true) { add(this.mesh('box', this.m('#8a5a3c'), [1.0, gy + 0.7, -3.5], [7.5, 1.4, 4.2]), this.mesh('box', this.m(night ? '#5b7fbf' : a.accent2), [1.0, gy + 1.5, -3.0], [7.3, 0.5, 4.0]), this.mesh('sph', this.m('#e9eef8'), [-1.8, gy + 1.95, -3.0], [1.1, 0.35, 0.8])); }
        add(this.mesh('box', this.m('#a0724f'), [-4.3, gy + 1.0, -3.6], [1.4, 2.0, 1.4]));
        const lamp = this.mesh('cone', this.m('#ffcf7a', { glow: night ? 1.0 : 0.3 }), [-4.3, gy + 2.6, -3.6], [0.55, 0.7, 0.55]); add(lamp);
      } else if (setting === 'office' || setting === 'classroom') {
        if (setting === 'classroom') add(this.mesh('box', this.m('#2f5d46'), [0.5, 4.0, z0], [9, 4.2, 0.2]), this.mesh('box', this.m('#a0724f'), [0.5, 1.8, z0 + 0.2], [9.2, 0.25, 0.4]));
        else { add(this.mesh('box', this.m('#ffffff'), [-3.3, 4.2, z0], [3.2, 2.6, 0.2]), this.mesh('box', this.m('#9fdcff', { glow: 0.4 }), [-3.3, 4.2, z0 + 0.15], [2.8, 2.2, 0.1])); add(this.mesh('cyl', this.m('#ffffff'), [3.8, 4.6, z0], [0.7, 0.1, 0.7], [Math.PI / 2, 0, 0])); }
        if (kind === 'desk' || true) { add(this.mesh('box', this.m('#b5835a'), [0, gy + 1.9, 1.6], [6.4, 0.25, 2.4])); [-1, 1].forEach((s) => add(this.mesh('box', this.m('#8a6240'), [s * 2.9, gy + 0.95, 1.6], [0.25, 1.9, 2.2]))); if (setting === 'office') { add(this.mesh('box', this.m('#23263a'), [1.6, gy + 3.0, 1.2], [2.2, 1.4, 0.15]), this.mesh('box', this.m('#9fd4ff', { glow: 0.8 }), [1.6, gy + 3.0, 1.29], [2.0, 1.2, 0.05])); } }
        add(this.mesh('cyl', this.m('#3f8a5a'), [-4.6, gy + 0.8, -3], [0.6, 1.6, 0.6]), this.mesh('sphLo', this.m('#4caf50', { flat: true }), [-4.6, gy + 2.3, -3], [1.1, 1.3, 1.1]));
      } else if (setting === 'cafe') {
        [[-2.5, 6.8], [2.5, 6.8]].forEach(([x, y]) => { add(this.mesh('cyl', this.m('#2b2b33'), [x, y + 1.2, -4], [0.03, 2.4, 0.03]), this.mesh('cone', this.m('#ffd08a', { glow: 1.1 }), [x, y, -4], [0.7, 0.6, 0.7])); });
        add(this.mesh('box', this.m('#5b3a2e'), [0, gy + 1.2, -5], [12, 2.4, 1.6]), this.mesh('box', this.m('#e0c9a6'), [0, gy + 2.45, -5], [12.2, 0.2, 1.8]));
        add(this.mesh('cyl', this.m('#b5835a'), [-2.0, gy + 1.6, 1.4], [1.4, 0.15, 1.4]), this.mesh('cyl', this.m('#6b4f3a'), [-2.0, gy + 0.8, 1.4], [0.12, 1.6, 0.12]), this.mesh('cyl', this.m('#ffffff'), [-1.8, gy + 1.95, 1.4], [0.28, 0.5, 0.28]));
      } else if (setting === 'street' || setting === 'park') {
        const strip = new T.Group(); g.add(strip); g.userData.scroll = strip;
        for (let k = -3; k < 12; k++) {
          if (setting === 'street') { const h = 5 + hash(k) * 6; strip.add(this.mesh('box', this.m(['#e07a5f', '#3d5a80', '#f2cc8f', '#81b29a', '#98c1d9'][((k % 5) + 5) % 5]), [k * 3.2, gy + h / 2, -7], [2.9, h, 2])); if (k % 2 === 0) strip.add(this.mesh('cyl', this.m('#3b3f52'), [k * 3.2 + 1.6, gy + 2.2, -1.5], [0.08, 4.4, 0.08]), this.mesh('sph', this.m('#fff2c8', { glow: 1 }), [k * 3.2 + 1.6, gy + 4.5, -1.5], 0.3)); }
          else { strip.add(this.mesh('cyl', this.m('#7a5236'), [k * 2.6, gy + 1.0, -4 - hash(k) * 3], [0.22, 2.0, 0.22]), this.mesh('sphLo', this.m(k % 2 ? '#4caf50' : '#66bb6a', { flat: true }), [k * 2.6, gy + 2.8, -4 - hash(k) * 3], [1.3, 1.5, 1.3])); }
        }
        if (setting === 'park') for (let k = 0; k < 4; k++) { const c = new T.Group(); [0, 0.7, 1.4].forEach((dx, q) => c.add(this.mesh('sph', this.m('#ffffff', { rough: 1 }), [dx, q === 1 ? 0.25 : 0, 0], q === 1 ? 0.7 : 0.5))); c.position.set(-6 + k * 4, 7 + hash(k) * 1.5, -8); g.add(c); g.userData.anim.push((t) => { c.position.x = ((-6 + k * 4 + t * 0.3) % 16 + 16) % 16 - 8; }); }
      } else if (setting === 'abstract-mind-space') {
        for (let k = 0; k < 14; k++) { const o = this.mesh('ico', this.m(k % 2 ? a.accent : '#b9a8ff', { flat: true, glow: 0.25 }), [(hash(k) - 0.5) * 12, (hash(k + 3) - 0.3) * 14, -4 - hash(k + 6) * 4], 0.25 + hash(k + 9) * 0.5); add(o); g.userData.anim.push((t) => { o.rotation.set(t * 0.5 + k, t * 0.3, 0); o.position.y += Math.sin(t + k) * 0.003; }); }
        add(this.mesh('cyl', this.m('#7c5cff', { glow: 0.3 }), [0, gy - 0.2, 0], [3.5, 0.4, 2.0]));
      } else if (setting === 'phone-screen') {
        add(this.mesh('box', this.m('#1c1f30', { rough: 0.4 }), [0, 1.5, -2.5], [7.2, 13, 0.6]));
        const scr = this.mesh('box', this.m('#f4f5fa', { glow: 0.35 }), [0, 1.5, -2.15], [6.6, 12.2, 0.1]); add(scr);
        for (let k = 0; k < 6; k++) { const card = this.mesh('box', this.m(['#ff8fb3', '#9fd4ff', '#ffd27a'][k % 3], { glow: 0.3 }), [0, 0, -2.05], [5.6, 1.6, 0.08]); add(card); g.userData.anim.push((t) => { card.position.y = 7 - ((k * 2.2 + t * 1.2) % 13.2); card.visible = card.position.y > -4.6 && card.position.y < 7.4; }); }
      } else { // void: spotlight on the floor
        add(this.mesh('circ', this.m('#fff4c2', { raw: true, basic: true, op: 0.22 }), [0, gy + 0.03, 0], [4, 2.2, 1], [-Math.PI / 2, 0, 0]));
      }
      this.scene.add(g); this.sets.set(key, g); return g;
    }

    // ---------- one frame of a shot ----------
    drawShot(stage, ctx, sh, rend) {
      const T = this.T; this.stage = stage; stage.amb = null; this.setPreset(stage);
      const scene = sh.scene; const setting = scene.setting; const kind = stage.kindFor(setting, scene.pose); const L = stage.layout(setting, kind, scene); const t = sh.t; const lt = sh.lt; const mo = stage._mo;
      const view = rend.view3d || { x: 0, y: 0, w: W, h: H };
      // resolution: keep the 3D layer under a pixel budget (phones), upscale the rest
      const ps = (sh.s || 1) * (rend.q3d || 1); const pw = Math.max(64, Math.round(view.w * ps)); const ph = Math.max(64, Math.round(view.h * ps));
      if (this.pw !== pw || this.ph !== ph) { this.r.setSize(pw, ph, false); this.pw = pw; this.ph = ph; }
      // camera: frames the 1080x1920 world plane; slow orbit + dolly per shot
      const cam = this.cam; const D = 30; const orbit = Math.sin(lt * 0.35 + (scene.count || 1)) * 0.12 + (scene.camera === 'pan' ? (clamp01(lt / Math.max(2, sh.dur)) - 0.5) * 0.3 : 0);
      const dz = scene.camera === 'zoom-in' ? -4 * clamp01(lt / Math.max(2, sh.dur)) : -1.5 * Math.sin(Math.min(1, lt / Math.max(2, sh.dur)) * Math.PI / 2);
      cam.fov = 2 * Math.atan(9.6 / D) * 180 / Math.PI; cam.aspect = W / H;
      cam.position.set(Math.sin(orbit) * (D + dz), 0.8, Math.cos(orbit) * (D + dz)); cam.lookAt(0, 0, 0); cam.position.y += 0;
      cam.setViewOffset(W, H, view.x, view.y, view.w, view.h); cam.updateProjectionMatrix();
      this.sets.forEach((g) => { g.visible = false; }); this.chars.forEach((c) => { c.root.visible = false; });
      const set = this.setFor(setting, kind, L); set.visible = true; set.userData.anim.forEach((f) => f(t));
      if (set.userData.scroll) set.userData.scroll.position.x = L.scroll ? -((lt * (scene.pose === 'running' ? 3.2 : 1.6)) % 16) : 0;
      const night = setting === 'bedroom-night' || setting === 'abstract-mind-space' || setting === 'void';
      this.hemi.intensity = night ? 0.75 : 1.15; this.key.intensity = night ? 1.3 : 1.9; this.key.color.set(night ? 0xc8d0ff : 0xffe2c0);
      const bgc = stage.c({ 'bedroom-night': '#141a40', 'abstract-mind-space': '#24164f', void: '#12121f', street: '#9cc5e8', park: '#9fd6f0' }[setting] || '#cfd4e4'); if (this.bgc !== bgc) { this.bgc = bgc; this.scene.background = new T.Color(bgc); }
      // cast
      const sp = scene.speaker || ''; const cast = [];
      const c1 = scene.cast1 || 'me'; const c2 = scene.cast2 || 'friend';
      const amp = mo ? mo.amp : 0;
      if (kind === 'lie' && L.bed) cast.push({ who: c1, x: X3(L.bed.hx) + 4.05 * 0.85, y: Y3(L.groundY) + 2.5, scale: 0.85, lie: true });
      else if (scene.count === 2) { cast.push({ who: c1, x: X3(L.charX), y: Y3(L.groundY), scale: L.scale * 0.95 * (c1 === 'brain' ? 1.05 : 1), facing: 0.6 }); cast.push({ who: c2, x: X3(L.charX2), y: Y3(L.groundY), scale: L.scale * 0.95 * (c2 === 'brain' ? 0.95 : 1), facing: -0.6, second: true }); }
      else if (!L.bigPhone) cast.push({ who: c1, x: X3(L.pace ? L.charX + Math.sin(lt * 0.8) * 200 : L.charX), y: Y3(L.groundY), scale: L.scale * 0.98, seated: kind === 'desk' || kind === 'sit', desk: kind === 'desk', facing: L.pace ? Math.sign(Math.cos(lt * 0.8)) : 0 });
      else cast.push({ who: c1, x: X3(540), y: Y3(1700), scale: 0.62 });
      const heads = []; let A = null; const v = new T.Vector3();
      const toWorld = (obj, dy) => { obj.getWorldPosition(v); v.y += dy || 0; v.project(cam); return [view.x + (v.x + 1) / 2 * view.w, view.y + (1 - v.y) / 2 * view.h]; };
      cast.forEach((q, k) => {
        const c = this.charFor(q.who, k); const solo = cast.length === 1;
        const speaking = solo ? true : (sp && sp !== 'narrator' ? q.who === sp : (Math.floor(lt / 1.6) % 2 === 0) === (k === 0));
        let emo = scene.emotion || 'neutral'; if (!solo && !speaking) emo = scene.emotion2 || LISTEN[emo] || 'neutral';
        const pose = q.lie ? 'lying-awake' : (!solo ? (speaking ? 'talking' : 'idle') : scene.pose);
        const talk = speaking && amp > 0.04 && !['sleeping', 'meditating'].includes(scene.pose) && emo !== 'calm';
        this.animChar(c, { t, emo, pose, talk, amp, mo: speaking || solo ? mo : null, seed: k * 2.3 + 0.7, x: q.x, y: q.y, scale: q.scale, facing: q.facing, seated: q.seated, desk: q.desk, lie: q.lie });
      });
      this.scene.updateMatrixWorld(true);
      cast.forEach((q, k) => { const c = this.charFor(q.who, k); const hp = toWorld(c.head); const top = toWorld(c.head, c.headR * c.root.scale.y); const r = Math.abs(hp[1] - top[1]); const hd = { who: q.who, x: hp[0], y: hp[1], r: r * 1.05 }; heads.push(hd); if (!A || q.who === sp || (k === 0 && !sp)) { const hr = c.arms[1] ? toWorld(c.arms[1].userData.hand) : [hp[0] + 120, hp[1] + 200]; const hl = c.arms[0] ? toWorld(c.arms[0].userData.hand) : [hp[0] - 120, hp[1] + 200]; const hip = toWorld(c.root, 1.6); A = { head: { x: hd.x, y: hd.y, r: hd.r }, top: hd.y - hd.r * 1.15, handR: hr, handL: hl, hip, scale: q.scale, lying: !!q.lie, holdsPhone: scene.pose === 'scrolling-phone' }; } });
      if (!A) A = { head: { x: 540, y: 1000, r: 90 }, top: 880, hip: [540, 1300], scale: 1 };
      this.r.render(this.scene, cam);
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(this.r.domElement, view.x, view.y, view.w, view.h); ctx.restore();
      // 2D motion-graphics props + callout on top of the 3D frame (same placement rules as the 2D style)
      const placed = stage.placeProps(scene, L, A);
      placed.forEach((p) => { if (p.name === 'brain' && (c1 === 'brain' || c2 === 'brain' || (p.env && p.env.big))) return; if (['bed', 'phone'].includes(p.name) && kind === 'lie') return; stage.prop(p.name, ctx, p.x, p.y, p.sc, sh.propAge(p.name), t, p.env); });
      if (scene.callout) { const head = A.head; const dir = head.x > 540 ? -1 : 1; ctx.font = '900 54px Montserrat, "Arial Black", sans-serif'; const half = (Math.min(700, ctx.measureText(scene.callout.toUpperCase()).width) + 64) / 2 + 20; const cx = Math.max(half + 20, Math.min(W - half - 20, head.x + dir * (head.r * 1.3 + half))); stage.callout(ctx, scene.callout, cx, Math.max(760, Math.min(1560, head.y - 10)), sh.calloutAge == null ? 1 : sh.calloutAge, t); }
      if (stage._heads) heads.forEach((h) => stage._heads.push(h));
      return { caption: L.caption, kind };
    }
  }

  let world = null; let failed = '';
  async function attach(r) {
    if (!r.stage) return false;
    if (!webglOk()) { failed = 'WebGL is not available on this device'; return false; }
    try { const T = await ensure(); if (!world) world = new World(T); } catch (e) { failed = e.message || '3D failed'; return false; }
    const c = r.LY.card; r.view3d = c ? { x: 0, y: c.cropY, w: 1080, h: 1080 * (c.h / c.w) } : { x: 0, y: 0, w: W, h: H };
    // pixel budget for the 3D layer (~0.8 MP) keeps phones at full frame rate; the result is upscaled smoothly
    const px = r.view3d.w * r.view3d.h * r.s * r.s; r.q3d = Math.min(1, Math.sqrt((r.o.budget3d || 820000) / Math.max(1, px)));
    const st = r.stage; st.draw3d = function (ctx, sh) { const kind = this.kindFor(sh.scene.setting, sh.scene.pose); if (sh.img || kind === 'card') { const d = this.draw3d; this.draw3d = null; try { return this.drawShot(ctx, sh); } finally { this.draw3d = d; } } return world.drawShot(this, ctx, sh, r); };
    return true;
  }
  // Build every 3D set and compile its shaders before recording starts (the first frame of a new set can take seconds on slow GPUs).
  function warm(r) { const seen = new Set(); (r.shots || []).forEach((sh) => { const k = sh.setting + '|' + sh.count; if (seen.has(k) || !(sh.end > sh.start)) return; seen.add(k); try { r.draw((sh.start + sh.end) / 2); } catch (_) { /* drawn again later */ } }); try { r.draw(0); } catch (_) { /* ignore */ } }
  const RP = R.Renderer.prototype;
  const prevSetup = RP.setup; RP.setup = function (o) { prevSetup.call(this, o); this.want3d = this.scenes && this.o.anim === '3d'; if (this.stage && !this.want3d) this.stage.draw3d = null; this.used3d = false; };
  const prevPrepare = RP.prepare; RP.prepare = async function () { const n = await prevPrepare.call(this); if (this.want3d) { this.used3d = await attach(this); if (!this.used3d && this.stage) this.stage.draw3d = null; else warm(this); } return n; };
  VTS.three3d = { ensure, webglOk, attach, get failed() { return failed; }, faceSpec };
}());
