// Synthetic "voice" for offline tests: one tone burst per syllable, dramatic pauses at line / panel breaks, known word onsets.
// Usage: node tools/synth-voice.js <project.json> <out.wav>   (writes <out.wav>.truth.json with every word's onset in seconds)
// Also usable as a module: synth(lines[], { sr }) -> { samples: Float32Array, sr, truth: [{ w, t, line }] }
const fs = require('fs');
const syl = (w) => { const l = String(w).toLowerCase().replace(/[^a-z]/g, ''); if (!l) return 1; let s = (l.match(/[aeiouy]+/g) || []).length; if (s > 1 && /[^aeiouy]e$/.test(l) && !/[^aeiouy]le$/.test(l)) s--; return Math.max(1, s); };
function synth(lines, o) {
  o = o || {}; const SR = o.sr || 24000; const truth = []; const bursts = []; let t = 0.15; let n = 0;
  lines.forEach((ln, li) => {
    const panelBreak = ln.panelStart && li > 0; t += panelBreak ? 0.55 : li ? 0.3 : 0; const pace = 0.15 + ((li * 37) % 7) * 0.012;
    String(ln.text).split(/\s+/).filter(Boolean).forEach((w) => {
      truth.push({ w, t: +t.toFixed(4), line: li });
      for (let k = 0; k < syl(w); k++) { bursts.push([t, pace * 0.8, n++]); t += pace; }
      if (/[.!?]$/.test(w)) t += 0.32; else if (/[,;:—]$/.test(w)) t += 0.18;
    });
  });
  const dur = t + 0.4; const d = new Float32Array(Math.ceil(dur * SR));
  bursts.forEach(([s, len, i]) => { const a = Math.round(s * SR); const m = Math.round(len * SR); const f = 120 + (i % 7) * 19; for (let j = 0; j < m; j++) { const env = Math.sin(Math.PI * j / m); d[a + j] += 0.38 * env * Math.sin(2 * Math.PI * f * j / SR) + 0.12 * env * Math.sin(2 * Math.PI * f * 2.6 * j / SR); } });
  return { samples: d, sr: SR, truth, duration: dur };
}
function wav(samples, sr) {
  const b = Buffer.alloc(44 + samples.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return b;
}
module.exports = { synth, wav, syl };
if (require.main === module) {
  const [PROJ, OUT] = process.argv.slice(2); const proj = JSON.parse(fs.readFileSync(PROJ, 'utf8'));
  const lines = []; proj.panels.forEach((p) => (p.lines || []).forEach((l, j) => lines.push({ text: String(l).replace(/\*/g, ''), panelStart: j === 0 })));
  const v = synth(lines); fs.writeFileSync(OUT, wav(v.samples, v.sr)); fs.writeFileSync(OUT + '.truth.json', JSON.stringify(v.truth)); console.log('wrote', OUT, v.duration.toFixed(2) + 's', v.truth.length, 'words');
}
