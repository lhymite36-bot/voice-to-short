// LIVE script-generation check: node tests/live/gen-live.js <length> <tone> <format> <humour> [idea]
// Logs model, finishReason, token usage and parse result per call. Never prints the key.
const fs = require('fs'); const path = require('path');
const H = require('./harness'); const { V, red } = H;
const calls = [];
const origFetch = global.fetch;
global.fetch = async (u, init) => {
  const r = await origFetch(u, init);
  if (/generateContent/.test(String(u))) {
    try { const d = await r.clone().json(); const c = d.candidates && d.candidates[0];
      const txt = c && c.content && (c.content.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
      const body = JSON.parse(init.body);
      calls.push({ model: String(u).split('/models/')[1].split(':')[0], status: r.status, finish: c && c.finishReason, usage: d.usageMetadata, chars: txt ? txt.length : 0, gen: body.generationConfig && Object.assign({}, body.generationConfig, { responseSchema: body.generationConfig.responseSchema ? '[schema]' : undefined }), err: d.error && red(d.error.message).slice(0, 200), block: d.promptFeedback, nCand: (d.candidates || []).length, safety: c && c.safetyRatings && c.safetyRatings.filter((x) => x.probability && x.probability !== 'NEGLIGIBLE'), finishMsg: c && c.finishMessage, partsInfo: c && c.content ? (c.content.parts || []).map((p) => (p.thought ? 'T' : 'X') + (p.text || '').length) : null });
    } catch (_) {}
  }
  return r;
};
(async () => {
  const [len = '120', tone = 'sarcastic', format = 'classic', humour = '3'] = process.argv.slice(2);
  const idea = process.argv[6] || 'Your social battery hitting 3% in the middle of a party';
  const t0 = Date.now(); let out = { len, tone, format, humour };
  try {
    const pkg = await V.shortgen.generatePackage(idea, { length: len, tone, format, humour: Number(humour), platform: 'both', language: 'English', onProgress: (p) => p.phase === 'wait' && console.log('wait', p.what, p.ms) });
    out.ok = true; out.words = V.shortgen.wordCount(pkg.script); out.beats = pkg.beats.length; out.hooks = pkg.hooks.length; out.textHook = pkg.textHook; out.tt = !!pkg.tiktokCaption; out.ttTags = (pkg.tiktokHashtags || []).length; out.cta = pkg.cta; out.title = pkg.title; out.long = !!pkg.long;
    fs.writeFileSync(path.join(process.env.OUT || '/tmp/l141', `pkg-${len}-${tone}-${format}.json`), JSON.stringify(pkg, null, 1));
  } catch (e) { out.ok = false; out.err = red(e.message); out.details = red(e.details || ''); }
  out.secs = Math.round((Date.now() - t0) / 1000); out.calls = calls;
  console.log(JSON.stringify(out, null, 1));
})();
