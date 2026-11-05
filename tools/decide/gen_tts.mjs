import fs from 'fs';
import https from 'https';

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('NO_KEY'); process.exit(1); }
const script = JSON.parse(fs.readFileSync('/workspace/decide/script.json', 'utf8'));
const outDir = '/workspace/decide/audio';
fs.mkdirSync(outDir, { recursive: true });

const MODELS = [
  'gemini-3.8-flash-lite-tts',
  'gemini-3.1-flash-tts-preview',
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts',
  'gemini-3.8-flash-tts',
];
const dailyDead = new Set();

function b64ToBuf(b64) { return Buffer.from(b64, 'base64'); }
function toWav(pcm, rate = 24000, channels = 1) {
  const dataLen = pcm.length;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataLen, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * channels * 2, 28); buf.writeUInt16LE(channels * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataLen, 40); pcm.copy(buf, 44); return buf;
}
function parseAudio(bytes, mime) {
  if (bytes.length > 44 && bytes.toString('ascii', 0, 4) === 'RIFF') {
    let off = 12, rate = 24000, ch = 1;
    while (off + 8 <= bytes.length) {
      const id = bytes.toString('ascii', off, off + 4);
      const size = bytes.readUInt32LE(off + 4);
      if (id === 'fmt ') { ch = bytes.readUInt16LE(off + 10); rate = bytes.readUInt32LE(off + 12); }
      if (id === 'data') return { pcm: bytes.subarray(off + 8, off + 8 + size), rate, ch };
      off += 8 + size + (size & 1);
    }
    return { pcm: bytes.subarray(44), rate: 24000, ch: 1 };
  }
  const r = /rate=(\d+)/i.exec(mime || '');
  return { pcm: bytes, rate: r ? Number(r[1]) : 24000, ch: 1 };
}

function post(model, body) {
  const path = `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(KEY)}`;
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'generativelanguage.googleapis.com', path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json; try { json = JSON.parse(raw); } catch { return reject(Object.assign(new Error('bad json ' + raw.slice(0, 200)), { status: res.statusCode })); }
        if (res.statusCode >= 400) {
          const msg = (json.error && json.error.message) || raw.slice(0, 300);
          const e = new Error(msg); e.status = res.statusCode; e.apiStatus = json.error && json.error.status; reject(e); return;
        }
        resolve(json);
      });
    });
    req.setTimeout(120000, () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

async function ttsOne(text, voice, style) {
  let last;
  for (const model of MODELS) {
    if (dailyDead.has(model)) continue;
    const isStruct = /gemini-3\.[5-9]|gemini-3\.\d\d|gemini-3\.8/.test(model);
    const part = { text };
    if (isStruct && style) part.speech_metadata = { style };
    if (!isStruct && style) part.text = `Say this in a ${style} voice: ${text}`;
    const body = {
      contents: [{ role: 'user', parts: [part] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    };
    try {
      const data = await post(model, body);
      const cand = data.candidates && data.candidates[0];
      const parts = (cand && cand.content && cand.content.parts) || [];
      const audio = parts.map((p) => p.inlineData || p.inline_data).find((d) => d && d.data);
      if (!audio) throw Object.assign(new Error('no audio'), { status: 500 });
      const bytes = b64ToBuf(audio.data);
      const mime = audio.mimeType || audio.mime_type || '';
      const { pcm, rate, ch } = parseAudio(bytes, mime);
      console.log('OK', model, voice, 'rate', rate, 'bytes', pcm.length);
      return { wav: toWav(pcm, rate, ch), model, rate };
    } catch (err) {
      last = err;
      const msg = String(err.message || '');
      console.error('FAIL', model, err.status, msg.slice(0, 180));
      if (err.status === 429 && /per day|free_tier_requests|limit: 10/i.test(msg)) {
        dailyDead.add(model); console.error('DAILY_DEAD', model); continue;
      }
      if (err.status === 429) {
        console.error('RATE wait 25s');
        await new Promise((r) => setTimeout(r, 25000));
        try {
          const data = await post(model, body);
          const cand = data.candidates && data.candidates[0];
          const parts = (cand && cand.content && cand.content.parts) || [];
          const audio = parts.map((p) => p.inlineData || p.inline_data).find((d) => d && d.data);
          if (!audio) throw err;
          const bytes = b64ToBuf(audio.data);
          const mime = audio.mimeType || audio.mime_type || '';
          const { pcm, rate, ch } = parseAudio(bytes, mime);
          console.log('OK_RETRY', model, voice, 'rate', rate);
          return { wav: toWav(pcm, rate, ch), model, rate };
        } catch (e2) {
          last = e2;
          if (e2.status === 429 && /per day|free_tier_requests/i.test(String(e2.message||''))) dailyDead.add(model);
          continue;
        }
      }
      continue;
    }
  }
  throw last || new Error('tts failed');
}

const cachePath = outDir + '/tts-meta.json';
let meta = {};
if (fs.existsSync(cachePath)) meta = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

for (const line of script.lines) {
  const out = `${outDir}/${line.id}.wav`;
  if (fs.existsSync(out) && fs.statSync(out).size > 1000) {
    console.log('SKIP', line.id);
    continue;
  }
  console.log('TTS', line.id, line.speaker, line.voice);
  try {
    const r = await ttsOne(line.text, line.voice, line.style);
    fs.writeFileSync(out, r.wav);
    meta[line.id] = { voice: line.voice, model: r.model, rate: r.rate, bytes: r.wav.length };
    fs.writeFileSync(cachePath, JSON.stringify(meta, null, 2));
    await new Promise((r) => setTimeout(r, 2000));
  } catch (err) {
    console.error('FATAL', line.id, err.status, err.message);
    fs.writeFileSync(cachePath, JSON.stringify(meta, null, 2));
    process.exit(2);
  }
}
console.log('ALL_TTS_DONE');
