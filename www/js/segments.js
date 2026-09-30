/* Long videos (up to 20 min): audio kept as 16-bit PCM blobs, segment-by-segment real-time recording streamed to disk,
   resume after interruptions, and a streaming WebM remuxer that joins the segments with bounded memory. */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {});
  const R = VTS.render;
  const LOG = (...a) => { if (VTS.debugSegments) console.log('[seg]', ...a); };

  // ======================= storage (OPFS → Capacitor Filesystem → memory) =======================
  function opfsStore(dir) {
    return {
      kind: 'opfs',
      async writer(name) { const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); let size = 0; return { async write(d) { size += d.size != null ? d.size : d.byteLength; await w.write(d); }, async close() { await w.close(); return size; }, async abort() { try { await w.abort(); } catch (_) { /* ignore */ } } }; },
      async reader(name) { const f = await (await dir.getFileHandle(name)).getFile(); return { size: f.size, async read(o, n) { return new Uint8Array(await f.slice(o, o + n).arrayBuffer()); }, file: f }; },
      async file(name) { return (await dir.getFileHandle(name)).getFile(); },
      async remove(name) { try { await dir.removeEntry(name); } catch (_) { /* ignore */ } },
      async exists(name) { try { await dir.getFileHandle(name); return true; } catch (_) { return false; } },
    };
  }
  function capStore(FS, cap) {
    const base = 'vts-render/'; const directory = 'DATA';
    const b64 = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => { const s = String(fr.result); res(s.slice(s.indexOf(',') + 1)); }; fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
    const url = async (name) => cap.convertFileSrc((await FS.getUri({ path: base + name, directory })).uri);
    return {
      kind: 'capfs',
      async writer(name) {
        let first = true; let size = 0; let pend = []; let pendSize = 0; const CH = 3 * 1024 * 1024;
        const flush = async (all) => { while (pendSize >= CH || (all && pendSize)) { const blob = new Blob(pend); const take = all ? blob.size : CH; const part = blob.slice(0, take); const rest = blob.slice(take); pend = rest.size ? [rest] : []; pendSize = rest.size; const data = await b64(part); if (first) { await FS.writeFile({ path: base + name, directory, data, recursive: true }); first = false; } else await FS.appendFile({ path: base + name, directory, data }); } };
        return { async write(d) { const bl = d instanceof Blob ? d : new Blob([d]); size += bl.size; pend.push(bl); pendSize += bl.size; await flush(false); }, async close() { await flush(true); if (first) await FS.writeFile({ path: base + name, directory, data: '', recursive: true }); return size; }, async abort() { try { await FS.deleteFile({ path: base + name, directory }); } catch (_) { /* ignore */ } } };
      },
      async reader(name) {
        const st = await FS.stat({ path: base + name, directory }); const u = await url(name);
        return { size: Number(st.size), async read(o, n) { const r = await fetch(u, { headers: { Range: 'bytes=' + o + '-' + (o + n - 1) } }); const b = new Uint8Array(await r.arrayBuffer()); return r.status === 206 ? b : b.subarray(o, o + n); }, uri: (await FS.getUri({ path: base + name, directory })).uri };
      },
      async file() { return null; },
      async remove(name) { try { await FS.deleteFile({ path: base + name, directory }); } catch (_) { /* ignore */ } },
      async exists(name) { try { await FS.stat({ path: base + name, directory }); return true; } catch (_) { return false; } },
    };
  }
  function memStore() {
    const files = new Map();
    return {
      kind: 'memory',
      async writer(name) { const parts = []; return { async write(d) { parts.push(d instanceof Blob ? d : new Blob([d])); }, async close() { const b = new Blob(parts); files.set(name, b); return b.size; }, async abort() { /* nothing */ } }; },
      async reader(name) { const f = files.get(name); return { size: f.size, async read(o, n) { return new Uint8Array(await f.slice(o, o + n).arrayBuffer()); }, file: f }; },
      async file(name) { return files.get(name); },
      async remove(name) { files.delete(name); },
      async exists(name) { return files.has(name); },
    };
  }
  let storePromise = null;
  function openStore(prefer) {
    if (storePromise && !prefer) return storePromise;
    storePromise = (async () => {
      if (prefer !== 'memory' && prefer !== 'capfs' && navigator.storage && navigator.storage.getDirectory) {
        try {
          const root = await navigator.storage.getDirectory(); const dir = await root.getDirectoryHandle('vts-render', { create: true });
          const probe = await dir.getFileHandle('.probe', { create: true });
          if (probe.createWritable) { const w = await probe.createWritable(); await w.write(new Uint8Array([1])); await w.close(); await dir.removeEntry('.probe'); return opfsStore(dir); }
        } catch (err) { LOG('opfs unavailable', err && err.message); }
      }
      const cap = window.Capacitor; const FS = cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.Filesystem;
      if (prefer !== 'memory' && FS) return capStore(FS, cap);
      return memStore();
    })();
    return storePromise;
  }

  // ======================= audio track: mono 16-bit PCM pieces (Blobs, not JS arrays) =======================
  class AudioTrack {
    constructor(sr) { this.sr = sr || 24000; this.pieces = []; this.length = 0; }
    get duration() { return this.length / this.sr; }
    appendInt16(i16) { const len = i16.length; if (!len) return; this.pieces.push({ blob: new Blob([i16.buffer.slice(i16.byteOffset, i16.byteOffset + len * 2)]), start: this.length, len }); this.length += len; }
    appendFloat(f32) { const CH = this.sr * 30; for (let o = 0; o < f32.length; o += CH) { const a = f32.subarray(o, o + CH); const i16 = new Int16Array(a.length); for (let i = 0; i < a.length; i++) { const v = Math.max(-1, Math.min(1, a[i])); i16[i] = v < 0 ? v * 0x8000 : v * 0x7fff; } this.appendInt16(i16); } }
    appendSilence(sec) { this.appendInt16(new Int16Array(Math.max(0, Math.round(sec * this.sr)))); }
    // Downmix + resample one decoded AudioBuffer (a section or chunk) into the track.
    async appendBuffer(buf) {
      if (buf.sampleRate === this.sr && buf.numberOfChannels === 1) { this.appendFloat(buf.getChannelData(0)); return; }
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const oc = new OAC(1, Math.max(1, Math.ceil(buf.duration * this.sr)), this.sr);
      const src = oc.createBufferSource(); src.buffer = buf; src.connect(oc.destination); src.start();
      const out = await oc.startRendering(); this.appendFloat(out.getChannelData(0));
    }
    async appendBlob(blob) { const buf = await R.decodeBlob(blob); const d0 = this.duration; await this.appendBuffer(buf); return { start: d0, end: this.duration }; }
    static async fromBuffer(buf, sr) { const t = new AudioTrack(sr || Math.min(48000, buf.sampleRate)); await t.appendBuffer(buf); return t; }
    // Float samples for [t0, t1) seconds of the track (reads only the pieces it needs).
    async floats(t0, t1) {
      const a = Math.max(0, Math.floor(t0 * this.sr)); const b = Math.min(this.length, Math.ceil(t1 * this.sr)); const out = new Float32Array(Math.max(1, b - a));
      for (const p of this.pieces) {
        const s = Math.max(a, p.start); const e = Math.min(b, p.start + p.len); if (e <= s) continue;
        const i16 = new Int16Array(await p.blob.slice((s - p.start) * 2, (e - p.start) * 2).arrayBuffer());
        for (let i = 0; i < i16.length; i++) out[s - a + i] = i16[i] / 32768;
      }
      return out;
    }
    async slice(t0, t1) { const f = await this.floats(t0, t1); const ac = R.audioCtx(); const buf = ac.createBuffer(1, f.length, this.sr); buf.copyToChannel(f, 0); return buf; }
    // Where speech starts/ends (looks only at the first and last 20 s).
    async bounds() {
      const d = this.duration; const head = await this.slice(0, Math.min(d, 20)); const hb = R.speechBounds(head);
      const t0 = Math.max(0, d - 20); const tail = await this.slice(t0, d); const tb = R.speechBounds(tail);
      if (hb.silent && tb.silent) return { start: 0, end: d, silent: true };
      return { start: hb.silent ? 0 : hb.start, end: tb.silent ? d : t0 + tb.end, silent: false };
    }
  }
  async function planTrack(track, maxSeconds) {
    const cap = Math.min(maxSeconds || R.MAX_LONG, R.MAX_LONG);
    const audioDur = Math.min(track.duration, cap - R.LEAD - R.TAIL); const b = await track.bounds();
    return { audioDur, total: R.LEAD + audioDur + R.TAIL, speechStart: R.LEAD + Math.min(b.start, audioDur), speechEnd: R.LEAD + Math.min(b.end, audioDur) };
  }

  // ======================= streaming WebM (Matroska) join =======================
  const ID = { EBML: 0x1A45DFA3, Segment: 0x18538067, Info: 0x1549A966, Tracks: 0x1654AE6B, Cluster: 0x1F43B675, Timecode: 0xE7, SimpleBlock: 0xA3, BlockGroup: 0xA0, Block: 0xA1, TimecodeScale: 0x2AD7B1, Duration: 0x4489, Cues: 0x1C53BB6B, SeekHead: 0x114D9B74, Tags: 0x1254C367, Void: 0xEC, Chapters: 0x1043A770, Attachments: 0x1941A469 };
  const TOP = new Set([ID.Cluster, ID.Cues, ID.SeekHead, ID.Tags, ID.Info, ID.Tracks, ID.Chapters, ID.Attachments, ID.EBML, ID.Segment]);
  class Reader { // buffered forward reader over a random-access source
    constructor(src) { this.src = src; this.pos = 0; this.buf = new Uint8Array(0); this.bufPos = 0; }
    get eof() { return this.pos >= this.src.size; }
    async ensure(n) { if (this.pos >= this.bufPos && this.pos + n <= this.bufPos + this.buf.length) return true; const want = Math.max(n, 1 << 20); this.buf = await this.src.read(this.pos, Math.min(want, this.src.size - this.pos)); this.bufPos = this.pos; return this.buf.length >= n; }
    async peekVint(keepMarker, at) { const off = at || 0; if (!(await this.ensure(off + 8)) && this.pos + off >= this.src.size) return null; const b = this.buf; const i = this.pos - this.bufPos + off; if (i >= b.length) return null; const first = b[i]; let len = 1; let mask = 0x80; while (len <= 8 && !(first & mask)) { len++; mask >>= 1; } if (len > 8 || i + len > b.length) return null; let v = keepMarker ? first : first & (mask - 1); let ones = (first & (mask - 1)) === mask - 1; for (let k = 1; k < len; k++) { v = v * 256 + b[i + k]; if (b[i + k] !== 255) ones = false; } return { v, len, unknown: !keepMarker && ones }; }
    async header() { const id = await this.peekVint(true, 0); if (!id) return null; const sz = await this.peekVint(false, id.len); if (!sz) return null; return { id: id.v, size: sz.unknown ? -1 : sz.v, hlen: id.len + sz.len }; }
    async bytes(n) { await this.ensure(n); const i = this.pos - this.bufPos; const out = this.buf.slice(i, i + n); this.pos += n; return out; }
    skip(n) { this.pos += n; }
  }
  function vint(n, len) { const out = new Uint8Array(len); for (let k = len - 1; k >= 1; k--) { out[k] = n % 256; n = Math.floor(n / 256); } out[0] = (0x80 >> (len - 1)) | n; return out; }
  function el(id, payload) { const idb = []; let x = id; while (x > 0) { idb.unshift(x & 255); x = Math.floor(x / 256); } const out = new Uint8Array(idb.length + 8 + payload.length); out.set(idb, 0); out.set(vint(payload.length, 8), idb.length); out.set(payload, idb.length + 8); return out; }
  function uintBytes(v) { const a = []; do { a.unshift(v % 256); v = Math.floor(v / 256); } while (v > 0); return new Uint8Array(a); }
  function readUint(b) { let v = 0; for (let i = 0; i < b.length; i++) v = v * 256 + b[i]; return v; }
  function cat(list) { const n = list.reduce((a, x) => a + x.length, 0); const out = new Uint8Array(n); let o = 0; list.forEach((x) => { out.set(x, o); o += x.length; }); return out; }
  function same(a, b) { if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

  // Codec-level signature of a Tracks element (TrackUIDs are random per recording, so they are ignored).
  async function tracksSig(raw) {
    const MASTER = new Set([0x1654AE6B, 0xAE, 0xE0, 0xE1]); const KEEP = new Set([0xD7, 0x83, 0x86, 0x63A2, 0xB0, 0xBA, 0xB5, 0x9F, 0x6264]); const out = [];
    const walk = async (b) => { const rd = new Reader({ size: b.length, read: async (o, n) => b.subarray(o, o + n) }); while (!rd.eof) { const h = await rd.header(); if (!h || h.size < 0) break; const body = b.subarray(rd.pos + h.hlen, rd.pos + h.hlen + h.size); if (MASTER.has(h.id)) await walk(body); else if (KEEP.has(h.id)) out.push(h.id.toString(16) + '=' + Array.from(body).join(',')); rd.skip(h.hlen + h.size); } };
    await walk(raw); return out.join(';');
  }
  // Audio track number + Opus pre-skip (ms) from the Tracks element.
  async function audioInfo(raw) {
    const entries = []; let cur = null;
    const walk = async (b, depth) => { const rd = new Reader({ size: b.length, read: async (o, n) => b.subarray(o, o + n) }); while (!rd.eof) { const h = await rd.header(); if (!h || h.size < 0) break; const body = b.subarray(rd.pos + h.hlen, rd.pos + h.hlen + h.size);
      if (h.id === 0xAE) { cur = {}; entries.push(cur); await walk(body, depth + 1); } else if (h.id === 0x1654AE6B) await walk(body, depth + 1);
      else if (cur && h.id === 0xD7) cur.num = readUint(body); else if (cur && h.id === 0x83) cur.type = readUint(body); else if (cur && h.id === 0x86) cur.codec = new TextDecoder().decode(body); else if (cur && h.id === 0x63A2) cur.priv = body;
      rd.skip(h.hlen + h.size); } };
    await walk(raw, 0);
    const a = entries.find((e) => e.type === 2); if (!a) return null;
    let preMs = 0; if (/OPUS/i.test(a.codec || '') && a.priv && a.priv.length >= 12) preMs = (a.priv[10] | (a.priv[11] << 8)) / 48;
    return { track: a.num, preMs, codec: a.codec };
  }
  async function webmHead(rd) {
    const e = await rd.header(); if (!e || e.id !== ID.EBML) throw new Error('not a WebM file');
    const ebml = await rd.bytes(e.hlen + e.size);
    const sg = await rd.header(); if (!sg || sg.id !== ID.Segment) throw new Error('no Segment'); rd.skip(sg.hlen);
    let info = null; let tracks = null; let scale = 1000000;
    for (;;) {
      const h = await rd.header(); if (!h) throw new Error('no clusters');
      if (h.id === ID.Cluster) break;
      if (h.size < 0) throw new Error('unknown-size element before clusters');
      const raw = await rd.bytes(h.hlen + h.size);
      if (h.id === ID.Info) { info = raw.subarray(h.hlen); let j = 0; while (j < info.length) { const r2 = new Reader({ size: info.length, read: async (o, n) => info.subarray(o, o + n) }); r2.pos = j; const c = await r2.header(); if (!c) break; if (c.id === ID.TimecodeScale) scale = readUint(info.subarray(j + c.hlen, j + c.hlen + c.size)); j += c.hlen + c.size; } }
      if (h.id === ID.Tracks) tracks = raw;
    }
    if (!tracks) throw new Error('no Tracks');
    return { ebml, tracks, scale };
  }
  async function blockInfo(raw, c) { let b = raw.subarray(c.hlen); if (c.id === ID.BlockGroup) { const r2 = new Reader({ size: b.length, read: async (o, n) => b.subarray(o, o + n) }); const bh = await r2.header(); b = b.subarray(r2.pos + bh.hlen); } const tn = new Reader({ size: b.length, read: async (o, n) => b.subarray(o, o + n) }); const tv = await tn.peekVint(false, 0); return { track: tv.v, rel: new DataView(b.buffer, b.byteOffset + tv.len, 2).getInt16(0) }; }
  function setRel(raw, c, rel) { const b = raw.subarray(c.hlen); let len = 1; while (len < 8 && !(b[0] & (0x80 >> (len - 1)))) len++; new DataView(b.buffer, b.byteOffset + len, 2).setInt16(0, rel); }
  // Audio packet duration (ms): median spacing of the first audio packets, snapped to an Opus frame size.
  async function packetMs(src, track, msPer) {
    const rd = new Reader(src); await webmHead(rd); const ts = []; let tc = 0;
    while (!rd.eof && ts.length < 60) { const h = await rd.header(); if (!h) break; if (h.id !== ID.Cluster) { if (h.size < 0) break; rd.skip(h.hlen + h.size); continue; } rd.skip(h.hlen); const end = h.size >= 0 ? rd.pos + h.size : Infinity;
      while (rd.pos < end && !rd.eof && ts.length < 60) { const c = await rd.header(); if (!c || c.size < 0) break; if (h.size < 0 && TOP.has(c.id)) break; const raw = await rd.bytes(c.hlen + c.size); if (c.id === ID.Timecode) tc = readUint(raw.subarray(c.hlen)); else if (c.id === ID.SimpleBlock || c.id === ID.BlockGroup) { const bi = await blockInfo(raw, c); if (bi.track === track) ts.push((tc + bi.rel) * msPer); } } }
    if (ts.length < 5) return 0; const d = ts.slice(1).map((x, i) => x - ts[i]).sort((a, b) => a - b); const med = d[d.length >> 1];
    return [2.5, 5, 10, 20, 40, 60, 80, 100, 120].reduce((best, f) => (Math.abs(f - med) < Math.abs(best - med) ? f : best), 60);
  }
  // First block time (ms, media time) of each track in a segment — the previous segment is trimmed per track to meet it exactly.
  async function firstTimes(src) {
    const rd = new Reader(src); const head = await webmHead(rd); const msPer = head.scale / 1000000; const out = {}; let tc = 0; let n = 0;
    while (!rd.eof && n < 400) { const h = await rd.header(); if (!h) break; if (h.id === ID.Cluster) { rd.skip(h.hlen); continue; } if (h.size < 0) break; const raw = await rd.bytes(h.hlen + h.size); if (h.id === ID.Timecode) tc = readUint(raw.subarray(h.hlen)); else if (h.id === ID.SimpleBlock || h.id === ID.BlockGroup) { const bi = await blockInfo(raw, h); if (out[bi.track] == null) out[bi.track] = (tc + bi.rel) * msPer; n++; if (Object.keys(out).length >= 2) break; } }
    return out;
  }
  // Blocks keep their cluster-relative timecodes; each cluster's Timecode is shifted by the segment's start offset.
  // Blocks at/after the next segment's start are dropped (tail trim is always safe: no later frame depends on them).
  async function joinWebm(sources, offsetsMs, writer, durationMs, onProgress) {
    let tracks0 = null; let scale0 = 0; let sig0 = ''; const stats = { clusters: 0, blocks: 0, dropped: 0, lastMs: 0, firstMs: [], audioErrMs: [] };
    // Audio continuity: decoders play audio packets back to back (they don't honour timestamp gaps/overlaps), so every
    // kept packet is re-stamped to its decoded position, and the cut at each join is chosen so the decoded audio lands on
    // the next segment's first audio packet (±half a packet) — errors never accumulate over many joins.
    let AI = null; let pd = 0; let dec = null;
    const totalBytes = sources.reduce((a, s) => a + s.size, 0); let doneBytes = 0;
    for (let k = 0; k < sources.length; k++) {
      const rd = new Reader(sources[k]); const head = await webmHead(rd);
      if (k === 0) {
        tracks0 = head.tracks; scale0 = head.scale; sig0 = await tracksSig(tracks0);
        AI = await audioInfo(tracks0); if (AI) pd = await packetMs(sources[0], AI.track, head.scale / 1000000);
        const infoPayload = cat([el(ID.TimecodeScale, uintBytes(1000000)), el(0x4D80, new TextEncoder().encode('VoiceToShort')), el(0x5741, new TextEncoder().encode('VoiceToShort segment join')), (() => { const d = new Uint8Array(8); new DataView(d.buffer).setFloat64(0, durationMs); return el(ID.Duration, d); })()]);
        await writer.write(cat([head.ebml, new Uint8Array([0x18, 0x53, 0x80, 0x67, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]), el(ID.Info, infoPayload), tracks0]));
      } else if ((await tracksSig(head.tracks)) !== sig0 || head.scale !== scale0) throw new Error('segment ' + (k + 1) + ' has different tracks/codec settings');
      const msPer = head.scale / 1000000; const off = offsetsMs[k]; let first = true;
      const cut = { all: Infinity }; if (k + 1 < sources.length) { cut.all = offsetsMs[k + 1]; const ft = await firstTimes(sources[k + 1]); Object.keys(ft).forEach((tr) => { cut[tr] = offsetsMs[k + 1] + ft[tr]; }); stats.cuts = (stats.cuts || []).concat([ft]); }
      // where the decoded audio of this segment must end: the next segment's first audio packet, minus its codec pre-skip
      const aTarget = AI && pd && cut[AI.track] != null ? cut[AI.track] - AI.preMs : Infinity; let aStop = false; let aFirst = true;
      while (!rd.eof) {
        const h = await rd.header(); if (!h) break;
        if (h.id !== ID.Cluster) { if (h.size < 0) break; rd.skip(h.hlen + h.size); continue; }
        rd.skip(h.hlen); const end = h.size >= 0 ? rd.pos + h.size : Infinity;
        let tc = 0; const kept = [];
        while (rd.pos < end && !rd.eof) {
          const c = await rd.header(); if (!c) { rd.pos = rd.src.size; break; }
          if (h.size < 0 && TOP.has(c.id)) break; // next top-level element ends an unknown-size cluster
          if (c.size < 0) throw new Error('unknown-size child');
          const raw = await rd.bytes(c.hlen + c.size);
          if (c.id === ID.Timecode) tc = readUint(raw.subarray(c.hlen));
          else if (c.id === ID.SimpleBlock || c.id === ID.BlockGroup) {
            const bi = await blockInfo(raw, c);
            const absMs = off + (tc + bi.rel) * msPer;
            if (AI && pd && bi.track === AI.track) {
              if (dec == null) dec = absMs; // first audio packet of the whole file
              if (aFirst) { aFirst = false; stats.audioErrMs.push(Math.round((dec - (absMs - (k ? AI.preMs : 0))) * 10) / 10); if (k && dec > absMs - AI.preMs + pd / 2) { stats.dropped++; aFirst = true; continue; } } // still late: skip a packet
              if (aStop || dec + pd > aTarget + pd / 2) { aStop = true; stats.dropped++; continue; }
              if (c.id === ID.SimpleBlock) { const ntc0 = Math.round(off / msPer + tc); const rel = Math.round(dec / msPer - ntc0); if (rel >= -32768 && rel <= 32767) setRel(raw, c, rel); }
              dec += pd; kept.push(raw); stats.blocks++; if (first) { stats.firstMs.push(absMs); first = false; } continue;
            }
            const cutT = cut[bi.track] != null ? cut[bi.track] : cut.all;
            if (absMs >= cutT - 0.5) { stats.dropped++; continue; }
            if (first) { stats.firstMs.push(absMs); first = false; }
            kept.push(raw); stats.blocks++; if (absMs > stats.lastMs) stats.lastMs = absMs;
          }
        }
        if (kept.length) { const ntc = Math.round(off / msPer + tc); await writer.write(el(ID.Cluster, cat([el(ID.Timecode, uintBytes(ntc))].concat(kept)))); stats.clusters++; }
        if (onProgress) onProgress(Math.min(1, (doneBytes + rd.pos) / totalBytes));
      }
      doneBytes += sources[k].size;
    }
    return stats;
  }

  // ======================= segmented real-time render =======================
  function segmentBounds(timeline, total, segSec) {
    const starts = timeline.map((b) => b.start); const out = [0]; let next = segSec;
    while (next < total - segSec * 0.4) {
      let best = next; let bd = Infinity; starts.forEach((s) => { const d = Math.abs(s - next); if (d < bd && s > out[out.length - 1] + segSec * 0.5 && d < segSec * 0.35) { bd = d; best = s; } });
      out.push(best); next = best + segSec;
    }
    out.push(total); return out;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function waitVisible() { if (document.visibilityState === 'visible') return Promise.resolve(); return new Promise((res) => { const f = () => { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', f); res(); } }; document.addEventListener('visibilitychange', f); }); }

  async function recordSegment(ctx) {
    const { r, canvas, track, P, k, T0, T1, overrun, mime, store, name, signal, onFrame, recOpts } = ctx;
    // A fresh AudioContext per segment: one context kept for 20 minutes drifts against the wall clock the recorder
    // stamps video with (measured ~0.4 ms/s in Chrome), which pushed the voice later in every later segment.
    let ac = null; let own = false;
    if (ctx.sharedContext) ac = R.audioCtx();
    else { try { ac = new (window.AudioContext || window.webkitAudioContext)(); own = true; } catch (_) { ac = R.audioCtx(); } }
    if (ac.state === 'suspended') await ac.resume();
    if (own) { const t = performance.now(); while (ac.currentTime < 0.3 && performance.now() - t < 3000) await sleep(20); } // let the new clock settle
    if (own && (ac.state !== 'running' || ac.currentTime < 0.1)) { try { await ac.close(); } catch (_) { /* ignore */ } own = false; ac = R.audioCtx(); if (ac.state === 'suspended') await ac.resume(); } // autoplay policy: fall back to the shared context
    const LEAD = R.LEAD; const a0 = Math.max(0, T0 - LEAD - 0.25); const a1 = Math.min(P.audioDur, T1 + overrun - LEAD + 0.25);
    const buf = a1 > a0 ? await track.slice(a0, a1) : null;
    const dest = ac.createMediaStreamDestination(); const gain = ac.createGain(); gain.connect(dest);
    const vstream = canvas.captureStream(); // every painted frame (we paint at ≤30 fps)
    const stream = new MediaStream([].concat(vstream.getVideoTracks(), dest.stream.getAudioTracks()));
    const rec = new MediaRecorder(stream, Object.assign({}, recOpts, mime ? { mimeType: mime } : {}));
    const writer = await store.writer(name); let chain = Promise.resolve(); let wrote = 0; let werr = null;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) { wrote += e.data.size; chain = chain.then(() => writer.write(e.data)).catch((err) => { werr = err; }); } };
    const stopped = new Promise((resolve, reject) => { rec.onstop = resolve; rec.onerror = (e) => reject(e.error || new Error('Recorder error')); });
    r.draw(Math.max(0, T0));
    // content time t(ac) = T0 + (ac - w). First segment: w = recorder start (content 0 = media 0), voice after the lead-in.
    // Video frames are timed on the wall clock (the recorder stamps video on it); the voice is scheduled once on the
    // audio clock. now() maps "now" to content time; ctx.clockMode 'audio' uses AudioContext time instead.
    const adv = ctx.audioAdvance != null ? ctx.audioAdvance : 0.06; // Chrome stamps 60 ms Opus frames late by about one frame
    const wall = () => performance.now() / 1000; const useWall = ctx.clockMode !== 'audio';
    let w; let pw; let src = null; let c0;
    const now = () => (useWall ? wall() - pw : ac.currentTime - w);
    // audio-clock time that is heard/recorded at wall time x (uses the context's output timestamp when available)
    const acFor = (x) => { if (ctx.noOutputTs || !ac.getOutputTimestamp) return ac.currentTime + (x - wall()); const ts = ac.getOutputTimestamp(); if (!ts || !ts.performanceTime) return ac.currentTime + (x - wall()); return ts.contextTime + (x - ts.performanceTime / 1000); };
    const lat = ac.getOutputTimestamp ? (() => { const ts = ac.getOutputTimestamp(); return ts && ts.performanceTime ? (ac.currentTime - ts.contextTime) - (wall() - ts.performanceTime / 1000) : 0; })() : 0;
    if (k === 0) {
      rec.start(1000); w = ac.currentTime; pw = wall(); c0 = 0;
      if (buf) { src = ac.createBufferSource(); src.buffer = buf; src.connect(gain); src.start(w + LEAD + a0, 0); } // recorder and voice start together here: Chrome aligns the tracks itself (measured)
    } else if (own && ctx.clockMode !== 'mapped') {
      // Fresh context: same recipe as the first segment. Recorder and voice start together; content T0 is at w.
      rec.start(1000); w = ac.currentTime; pw = wall(); c0 = T0;
      if (buf) { src = ac.createBufferSource(); src.buffer = buf; src.connect(gain); src.start(w, Math.max(0, (T0 - LEAD) - a0)); }
    } else {
      pw = wall() + 0.25; w = acFor(pw);
      if (buf) { src = ac.createBufferSource(); src.buffer = buf; src.connect(gain); const off = (T0 - LEAD) - a0 + adv; if (off >= 0) src.start(w, off); else src.start(w - off, 0); }
      const frameTick = () => { r.draw(Math.max(0, T0 + now())); };
      while (now() < 0.02) { frameTick(); await sleep(8); }
      rec.start(1000); c0 = T0 + now();
    }
    let raf = 0; let timer = 0; let hidden = false; let aborted = false; let frames = 0; let lastDraw = -1;
    const end = T1 + overrun;
    await new Promise((resolve) => {
      const tick = () => {
        if (signal && signal.aborted) { aborted = true; resolve(); return; }
        if (document.visibilityState !== 'visible' && !ctx.allowHidden) { hidden = true; resolve(); return; }
        const t = T0 + now();
        if (t - lastDraw >= 1 / 31 || t >= end) { r.draw(Math.max(0, Math.min(t, P.total))); lastDraw = t; frames++; }
        if (onFrame) onFrame(Math.min(t, T1));
        if (t >= end) { resolve(); return; }
        if (document.visibilityState === 'visible') raf = requestAnimationFrame(tick); else timer = setTimeout(tick, 33);
      };
      tick();
    });
    cancelAnimationFrame(raf); clearTimeout(timer);
    const drift = (ac.currentTime - w) - (wall() - pw); // audio clock vs wall clock over this segment (s)
    try { if (src) src.stop(); } catch (_) { /* ignore */ }
    if (rec.state !== 'inactive') rec.stop();
    try { await stopped; } catch (err) { werr = werr || err; }
    await chain; vstream.getTracks().forEach((tr) => tr.stop()); try { gain.disconnect(); } catch (_) { /* ignore */ }
    if (own) { try { await ac.close(); } catch (_) { /* ignore */ } }
    if (aborted || hidden || werr) { await writer.abort(); await store.remove(name); if (werr) throw werr; return { aborted, hidden }; }
    const size = await writer.close();
    return { ok: true, name, c0, T0, T1, size, frames, wrote, drift, lat, mime: rec.mimeType || mime };
  }

  // opts: canvas, track (AudioTrack), beats, sections, look, maxSeconds, segmentSeconds, resume, onState, onProgress, signal, bitrate
  async function renderLong(opts) {
    if (!R.canRender()) throw new Error('This browser cannot record canvas video (needs MediaRecorder + canvas.captureStream).');
    const store = opts.store || (await openStore(opts.storePrefer));
    // VP8 encodes faster than VP9 in real time (fewer dropped frames on phones); same WebM container for the joiner.
    const vp8 = 'video/webm;codecs=vp8,opus'; const mime = opts.codec !== 'vp9' && typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(vp8) ? vp8 : R.pickVideoType('webm'); const webm = /webm/.test(mime);
    const P = opts.plan || (await planTrack(opts.track, opts.maxSeconds));
    const r = new R.Renderer(opts.canvas);
    try { await document.fonts.load('800 100px Montserrat'); await document.fonts.load('900 100px Montserrat'); } catch (_) { /* ignore */ }
    r.setup(Object.assign({}, opts.look, { beats: opts.beats, speechStart: P.speechStart, speechEnd: P.speechEnd, duration: P.total, sections: opts.sections }));
    await r.prepare();
    if (opts.probe) r.probe = opts.probe;
    const segSec = opts.segmentSeconds || 75;
    const bounds = segmentBounds(r.timeline, P.total, segSec);
    const key = [opts.projectId || 'p', P.total.toFixed(2), opts.canvas.width, opts.canvas.height, r.timeline.length, bounds.length, mime].join('|');
    let state = opts.resume && opts.resume.key === key ? opts.resume : { key, bounds, done: [], started: Date.now() };
    // drop resume entries whose files vanished
    const kept = []; for (const d of state.done) if (await store.exists(d.name)) kept.push(d); state.done = kept;
    const n = bounds.length - 1; const t0 = performance.now(); let doneContent = state.done.reduce((a, d) => a + (d.T1 - d.T0), 0); const contentAtStart = doneContent;
    const recOpts = { videoBitsPerSecond: opts.bitrate || (P.total > 150 ? 6000000 : 10000000), audioBitsPerSecond: 128000 };
    const report = (tNow, phase, extra) => {
      if (!opts.onProgress) return;
      const content = doneContent + (tNow || 0); const el = (performance.now() - t0) / 1000; const rate = el > 3 && content > contentAtStart ? (content - contentAtStart) / el : 1;
      const left = (P.total - content) / Math.max(0.05, rate) + (webm ? P.total * 0.02 : 0);
      opts.onProgress(Object.assign({ phase, p: Math.min(1, content / P.total) * 0.97, eta: Math.max(0, left), segment: state.done.length + 1, segments: n, total: P.total }, extra || {}));
    };
    for (let k = 0; k < n; k++) {
      if (state.done.find((d) => d.k === k)) continue;
      const name = 'seg-' + String(k).padStart(3, '0') + (webm ? '.webm' : '.mp4');
      for (let attempt = 0; ; attempt++) {
        if (opts.signal && opts.signal.aborted) return null;
        await waitVisible();
        const T0 = bounds[k]; const T1 = bounds[k + 1];
        const res = await recordSegment({ r, canvas: opts.canvas, track: opts.track, P, k, T0, T1, overrun: k < n - 1 ? 0.5 : 0, mime, store, name, signal: opts.signal, recOpts, allowHidden: opts.allowHidden, clockMode: opts.clockMode, audioAdvance: opts.audioAdvance,
          onFrame: (t) => report(t - T0, 'record') });
        if (res.ok) { state.done.push({ k, name, c0: res.c0, T0, T1, size: res.size, frames: res.frames, drift: res.drift, lat: res.lat }); doneContent += T1 - T0; if (opts.onState) await opts.onState(state); LOG('segment', k, res); break; }
        if (res.aborted) return null;
        if (attempt > 6) throw new Error('Rendering keeps getting interrupted. Keep the app open with the screen on, then tap Render again to resume.');
        if (opts.onInterrupted) opts.onInterrupted(k);
      }
    }
    state.done.sort((a, b) => a.k - b.k);
    const recordSec = (performance.now() - t0) / 1000;
    const result = { segments: state.done, store, mime, duration: P.total, width: opts.canvas.width, height: opts.canvas.height, recordSec, state };
    if (!webm || n === 1 && !webm) { result.parts = state.done.map((d) => d.name); return result; }
    // join
    const outName = 'final-' + key.replace(/[^a-z0-9]+/gi, '-').slice(0, 60) + '.webm';
    const j0 = performance.now();
    try {
      const sources = []; for (const d of state.done) sources.push(await store.reader(d.name));
      const offsets = state.done.map((d) => Math.round(d.c0 * 1000));
      const writer = await store.writer(outName);
      const stats = await joinWebm(sources, offsets, writer, P.total * 1000, (p) => report(0, 'join', { p: 0.97 + 0.03 * p, eta: 0 }));
      await writer.close();
      Object.assign(result, { name: outName, joinSec: (performance.now() - j0) / 1000, joinStats: stats, offsets });
      if (!opts.keepSegments) for (const d of state.done) await store.remove(d.name);
      state.final = outName; if (opts.onState) await opts.onState(state);
    } catch (err) {
      LOG('join failed', err); result.joinError = String(err && err.message || err); result.parts = state.done.map((d) => d.name);
    }
    return result;
  }

  // Save / share a stored file without loading it into memory in one piece.
  async function exportStored(store, name, filename, mode, onProgress) {
    const N = VTS.native || {}; const cap = window.Capacitor; const FS = N.isNative && cap && cap.Plugins && cap.Plugins.Filesystem;
    const rd = await store.reader(name);
    if (FS) {
      const dir = mode === 'share' ? 'CACHE' : 'DOCUMENTS'; const path = (mode === 'share' ? 'share/' : 'VoiceToShort/') + filename;
      const CH = 3 * 1024 * 1024;
      for (let o = 0, i = 0; o < rd.size; o += CH, i++) {
        const bytes = await rd.read(o, Math.min(CH, rd.size - o));
        const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => { const s = String(fr.result); res(s.slice(s.indexOf(',') + 1)); }; fr.onerror = () => rej(fr.error); fr.readAsDataURL(new Blob([bytes])); });
        if (i === 0) await FS.writeFile({ path, directory: dir, data, recursive: true }); else await FS.appendFile({ path, directory: dir, data });
        if (onProgress) onProgress(Math.min(1, (o + CH) / rd.size));
      }
      const uri = (await FS.getUri({ path, directory: dir })).uri;
      if (mode === 'share' && cap.Plugins.Share) await cap.Plugins.Share.share({ title: filename, files: [uri], dialogTitle: 'Share your video' });
      return { where: mode === 'share' ? 'shared' : 'Documents/VoiceToShort/' + filename, uri };
    }
    const file = rd.file || (await store.file(name));
    if (mode === 'share' && navigator.canShare) { const f = new File([file], filename, { type: 'video/webm' }); if (navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: filename }); return { where: 'shared' }; } catch (_) { /* fall through */ } } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 120000);
    return { where: 'your Downloads folder' };
  }

  VTS.segments = { openStore, AudioTrack, planTrack, joinWebm, renderLong, segmentBounds, exportStored, memStore };
}());
