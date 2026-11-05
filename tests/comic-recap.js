// v1.7 Comic Recap offline checks (no Chrome, no network). Run: node tests/comic-recap.js
// Script parsing (stars, beats per panel), Gemini reply normalisation, caption chunks, and the voice-locked timeline:
// a synthetic dramatic "voice" with known word onsets -> every panel's first beat starts on its first spoken word.
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const { synth } = require('../tools/synth-voice.js');
const ctx = { console, Math, window: {}, document: { fonts: null } }; ctx.window.VTS = {}; vm.createContext(ctx);
for (const f of ['render.js', 'comic.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../www/js', f), 'utf8'), ctx, { filename: f });
const R = ctx.window.VTS.render; const CM = ctx.window.VTS.comic;
let pass = 0; let fail = 0; const ok = (name, cond, extra) => { console.log(cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); if (cond) pass++; else fail++; };
const J = (x) => JSON.parse(JSON.stringify(x));

let m = CM.parseMarked("*John*'s ring was *gone*. Exactly.");
ok('stars mark key words and never reach the text', m.text === "John's ring was gone. Exactly." && J(m.keys).join() === '0,3', J(m));
m = CM.parseMarked('The *Ember Council* had spoken.'); ok('multi-word star span', J(m.keys).join() === '1,2' && m.text === 'The Ember Council had spoken.', J(m));
const proj = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/comic-recap.json'), 'utf8'));
const panels = proj.panels.map((p) => ({ lines: p.lines, impact: !!p.impact, sfx: p.sfx || '' }));
panels.splice(5, 0, { lines: [] }); // an empty panel is skipped, never shifts the mapping
const beats = CM.buildBeats(panels);
ok('beats carry their panel index, in order, skipping empty panels', J(Array.from(new Set(beats.map((b) => b.panel)))).join() === '0,1,2,3,4,6,7,8', J(Array.from(new Set(beats.map((b) => b.panel)))));
ok('beats are caption-sized (≤ 8 words)', beats.every((b) => b.text.split(' ').length <= 8), beats.map((b) => b.text.split(' ').length));
ok('beat words == script words (nothing lost or added)', CM.wordCount(beats.map((b) => b.text).join(' ')) === CM.wordCount(CM.scriptOf(panels)));
const pkg = CM.makePkg(panels, { title: 'T' });
ok('makePkg: app-compatible package, hook = first line', pkg.comic === true && pkg.hooks[0] === 'The Council just sentenced its own hero.' && pkg.script.indexOf('*') < 0 && pkg.beats.length === beats.length && Array.isArray(pkg.hashtags), { hook: pkg.hooks[0] });

// Gemini reply normalisation: panel numbers win over array order, hook prepended once, junk stripped, missing panels reported
const reply = { title: 'X', hook: 'He was framed.', panels: [{ panel: 2, lines: ['Narrator: Then *Vex* came. 😱 #comics'], impact: true, sfx: 'krak!!' }, { panel: 1, lines: ['Kael kneels in the rain.'], focus_x: 0.3, focus_y: 0.2 }, { panel: 4, lines: [] }] };
const out = CM.normalizeScript(reply, 4);
ok('normalizeScript maps by panel number and strips labels/emoji/hashtags', out.panels[1].lines[0] === 'Then *Vex* came.' && out.panels[0].lines[1] === 'Kael kneels in the rain.' && out.panels[1].impact && out.panels[1].sfx === 'KRAK!!', J(out.panels.map((p) => p.lines)));
ok('normalizeScript puts the hook first and reports missing panels', out.panels[0].lines[0] === 'He was framed.' && J(out.missing).join() === '2,3', J(out.missing));
ok('normalizeScript keeps focus only when valid', out.panels[0].focus && out.panels[0].focus.x === 0.3 && out.panels[1].focus === null);
ok('parseJSON copes with fenced replies', CM.parseJSON('```json\n{"a":1}\n```').a === 1);
const pr = CM.buildPrompt(8, { length: '60', title: 'T', notes: 'N' });
ok('prompt is story-first, scene by scene, hook in the first line, length target', /scene by scene/i.test(pr) && /panels\[0\]\.lines\[0\] is the HOOK/.test(pr) && /125–145 words/.test(pr) && /Do NOT turn it into commentary/.test(pr));
ok('impact words map to comic SFX + sounds', CM.impactWord('explosion', true) && CM.impactWord('explosion', true).audio.includes('boom') && !CM.impactWord('table', false));
const ch = CM.chunkWords('The Ember Council had spoken, and Kael was finished.'.split(' '));
ok('Comic Bold chunks are ≤ 3 words', ch.every((c) => c.length <= 3) && J(ch).flat().length === 9, J(ch));

// Voice-locked timeline: panel cuts follow the real voice
const lines = []; panels.forEach((p, k) => (p.lines || []).forEach((l, j) => lines.push({ text: CM.clean(l), panelStart: j === 0, panel: k })));
const v = synth(lines); const d = v.samples;
const buf = { sampleRate: v.sr, duration: d.length / v.sr, numberOfChannels: 1, length: d.length, getChannelData: () => d };
const P = R.plan(buf, 180); const tl = R.buildTimeline(beats, P.speechStart, P.speechEnd, null, P.speech);
ok('timeline is voice-aligned', tl.aligned === true && tl.length === beats.length);
const words = []; tl.forEach((b) => b.wordTimes.forEach((t) => words.push(t)));
const err = words.map((t, i) => t - (v.truth[i].t + R.LEAD)); const ab = err.map(Math.abs).sort((a, b) => a - b);
ok('caption words land on the spoken words (median < 80 ms, p90 < 200 ms)', ab[ab.length >> 1] < 0.08 && ab[Math.floor(ab.length * 0.9)] < 0.2, { med: Math.round(ab[ab.length >> 1] * 1000), p90: Math.round(ab[Math.floor(ab.length * 0.9)] * 1000) });
// panel boundaries = first beat of each panel (comic.js segments start there)
const firstOf = {}; tl.forEach((b, i) => { const pnl = beats[i].panel; if (firstOf[pnl] == null) firstOf[pnl] = b.start; });
const truthFirst = {}; let wi = 0; lines.forEach((l) => { const n = l.text.split(/\s+/).filter(Boolean).length; if (l.panelStart && truthFirst[l.panel] == null) truthFirst[l.panel] = v.truth[wi].t + R.LEAD; wi += n; });
const cutErr = Object.keys(truthFirst).map((k) => +(firstOf[k] - truthFirst[k]).toFixed(3));
ok('each panel appears right as its scene starts being narrated (within 150 ms, never late)', cutErr.every((e) => e <= 0.02 && e > -0.15), cutErr);
console.log(pass + '/' + (pass + fail) + ' passed'); process.exit(fail ? 1 : 0);
