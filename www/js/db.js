/* Tiny IndexedDB wrapper for projects (blobs stored directly) + a key/value cache (AI-voice chunks, long-job progress). */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {});
  const DB = 'voice-to-short'; const STORE = 'projects'; const CACHE = 'cache';
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 2);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }); if (!db.objectStoreNames.contains(CACHE)) db.createObjectStore(CACHE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      fn(t.objectStore(STORE));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Storage aborted (phone storage may be full).'));
    });
  }
  const req2p = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  VTS.db = {
    async all() { const db = await open(); return req2p(db.transaction(STORE).objectStore(STORE).getAll()); },
    async get(id) { const db = await open(); return req2p(db.transaction(STORE).objectStore(STORE).get(id)); },
    put(p) { return tx('readwrite', (st) => { st.put(p); }); },
    del(id) { return tx('readwrite', (st) => { st.delete(id); }); },
    clear() { return tx('readwrite', (st) => { st.clear(); }); },
    cache: {
      async get(key) { const db = await open(); return req2p(db.transaction(CACHE).objectStore(CACHE).get(key)); },
      async set(key, val) { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(CACHE, 'readwrite'); t.objectStore(CACHE).put(val, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Storage full')); }); },
      async del(key) { const db = await open(); return new Promise((res) => { const t = db.transaction(CACHE, 'readwrite'); t.objectStore(CACHE).delete(key); t.oncomplete = () => res(); t.onerror = () => res(); }); },
      async clear() { const db = await open(); return new Promise((res) => { const t = db.transaction(CACHE, 'readwrite'); t.objectStore(CACHE).clear(); t.oncomplete = () => res(); t.onerror = () => res(); }); },
    },
  };
}());
