// Offline check (no Chrome, no network): captions are timed from the real voice, not from word counts.
// Builds a synthetic "voice" (one tone burst per syllable) with dramatic pauses, a slow beat and a mid-phrase pause,
// then checks the app's own timeline (render.js) against the known word onsets. Run: node tests/caption-sync.js
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const ctx = { console, Math, window: {} }; ctx.window.VTS = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../www/js/render.js'), 'utf8'), ctx, { filename: 'render.js' });
const R = ctx.window.VTS.render;
let pass = 0; let fail = 0; const ok = (name, cond, extra) => { console.log(cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); if (cond) pass++; else fail++; };

const SR = 24000;
const beats = [
  { text: 'Nobody.', speaker: 'me', weight: 1 }, { text: 'Absolutely nobody.', speaker: 'me', weight: 2 },
  { text: 'Me at three a.m. replaying one awkward sentence', speaker: 'me', weight: 8 },
  { text: 'from a meeting in twenty nineteen.', speaker: 'me', weight: 6 },
  { text: 'Brain, please, I am begging you, let me sleep.', speaker: 'brain', weight: 9 },
  { text: 'Your brain replays it because it never filed the memory as finished.', speaker: 'narrator', weight: 12 },
  { text: 'Write it down and close the loop.', speaker: 'narrator', weight: 7 },
  { text: 'Follow for more brain facts.', speaker: 'narrator', weight: 5 },
];
// per beat: seconds per syllable (pace) and the pause before it (TTS: dramatic pauses, speaker changes)
const pace = [0.22, 0.2, 0.16, 0.17, 0.25, 0.16, 0.17, 0.18]; const pauseBefore = [0.1, 1.3, 1.1, 0.25, 0.8, 0.6, 0.35, 0.5];
const syl = (w) => { const l = w.toLowerCase().replace(/[^a-z]/g, ''); let s = (l.match(/[aeiouy]+/g) || []).length; if (s > 1 && /[^aeiouy]e$/.test(l) && !/[^aeiouy]le$/.test(l)) s--; return Math.max(1, s); };
const truth = []; const bursts = []; let t = 0;
beats.forEach((b, bi) => {
  t += pauseBefore[bi];
  b.text.split(/\s+/).forEach((w) => {
    truth.push({ w, t, bi });
    for (let k = 0; k < syl(w); k++) { bursts.push([t, pace[bi] * 0.78]); t += pace[bi]; }
    if (/,$/.test(w)) t += 0.28; // comma pause inside the beat
  });
});
const dur = t + 0.4; const d = new Float32Array(Math.ceil(dur * SR));
bursts.forEach(([s, len], i) => { const a = Math.round(s * SR); const n = Math.round(len * SR); const f = 140 + (i % 7) * 23; for (let j = 0; j < n; j++) { const env = Math.sin(Math.PI * j / n); d[a + j] += 0.4 * env * Math.sin(2 * Math.PI * f * j / SR) + 0.1 * env * Math.sin(2 * Math.PI * f * 2.7 * j / SR); } });
const buf = { sampleRate: SR, duration: d.length / SR, numberOfChannels: 1, length: d.length, getChannelData: () => d };

const P = R.plan(buf, 60);
ok('plan() carries a loudness profile of the decoded voice', !!(P.speech && P.speech.v && P.speech.v.length > dur * 90), { frames: P.speech && P.speech.v.length });
const tl = R.buildTimeline(beats, P.speechStart, P.speechEnd, null, P.speech);
ok('timeline is voice-aligned', tl.aligned === true);
const words = []; tl.forEach((b) => b.wordTimes.forEach((wt) => words.push(wt)));
const err = words.map((wt, k) => wt - (R.LEAD + truth[k].t)); const ab = err.map(Math.abs).sort((a, b) => a - b);
const beatErr = tl.map((b, bi) => b.wordTimes[0] - (R.LEAD + truth.find((x) => x.bi === bi).t));
ok('every beat starts within 100 ms of its first spoken word', beatErr.every((e) => Math.abs(e) < 0.1), beatErr.map((e) => Math.round(e * 1000)));
ok('word onsets: median error < 60 ms, 90% < 120 ms', ab[ab.length >> 1] < 0.06 && ab[Math.floor(ab.length * 0.9)] < 0.12, { medMs: Math.round(ab[ab.length >> 1] * 1000), p90Ms: Math.round(ab[Math.floor(ab.length * 0.9)] * 1000), maxMs: Math.round(ab[ab.length - 1] * 1000) });
ok('no drift: error in the last quarter is as small as in the first', Math.abs(err.slice(-Math.floor(err.length / 4)).reduce((a, b) => a + b, 0) / Math.floor(err.length / 4)) < 0.08);
ok('beats are contiguous and ordered', tl.every((b, i) => b.end > b.start && (i === 0 || Math.abs(b.start - tl[i - 1].end) < 1e-9) && b.wordTimes.every((x, k) => k === 0 || x >= b.wordTimes[k - 1])));
// the old word-count timing on the same voice, for reference (this is what the posted Shorts used)
const old = R.buildTimeline(beats, P.speechStart, P.speechEnd, null, null); const ow = []; old.forEach((b) => b.wordTimes.forEach((wt) => ow.push(wt)));
const oldMax = Math.max.apply(null, ow.map((wt, k) => Math.abs(wt - (R.LEAD + truth[k].t))));
ok('word-count timing (no voice) is still available as a fallback, and is much worse here', !old.aligned && oldMax > 0.5, { oldMaxMs: Math.round(oldMax * 1000), newMaxMs: Math.round(ab[ab.length - 1] * 1000) });
// renderer uses it
const silent = { sampleRate: SR, duration: 3, numberOfChannels: 1, length: 3 * SR, getChannelData: () => new Float32Array(3 * SR) };
ok('silent voice -> no profile -> fallback timing', R.speechProfile(silent, R.LEAD) === null && !R.buildTimeline(beats, 0.3, 2.9, null, R.plan(silent, 60).speech).aligned);
// sections (long videos) align inside each section
const half = beats.findIndex((b) => b.speaker === 'narrator'); const secBeats = beats.map((b, i) => Object.assign({}, b, { section: i < half ? 0 : 1 }));
const split = R.LEAD + truth.find((x) => x.bi === half).t - 0.2;
const tls = R.buildTimeline(secBeats, P.speechStart, P.speechEnd, [{ start: R.LEAD, end: split }, { start: split, end: P.speechEnd }], P.speech);
const sErr = []; tls.forEach((b) => b.wordTimes.forEach((wt) => sErr.push(wt))); const sAb = sErr.map((wt, k) => Math.abs(wt - (R.LEAD + truth[k].t))).sort((a, b) => a - b);
ok('long-video sections are voice-aligned too', sAb[Math.floor(sAb.length * 0.9)] < 0.15, { p90Ms: Math.round(sAb[Math.floor(sAb.length * 0.9)] * 1000) });
const t0 = Date.now(); for (let i = 0; i < 3; i++) { P.speech.cache = null; R.buildTimeline(beats, P.speechStart, P.speechEnd, null, P.speech); }
ok('alignment is fast', (Date.now() - t0) / 3 < 400, { ms: Math.round((Date.now() - t0) / 3) });
console.log(pass + '/' + (pass + fail) + ' passed'); process.exit(fail ? 1 : 0);
