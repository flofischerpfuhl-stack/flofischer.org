// Open · document store (DESIGN §8 "Document store"): files, drafts, view state and recents in one IndexedDB.
// Every call is wrapped so the viewer still works in private windows (it just forgets on reload).
const DB = 'fw-open', V = 1;
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const r = indexedDB.open(DB, V);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('files', { keyPath: 'id' }); d.createObjectStore('meta'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch { res(null); }
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await db(); if (!d) return null;
  return new Promise((res) => {
    try {
      const t = d.transaction(store, mode); const s = t.objectStore(store); let out;
      const r = fn(s); if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out ?? null); t.onerror = () => res(null); t.onabort = () => res(null);
    } catch { res(null); }
  });
}
export const putFile = (rec) => tx('files', 'readwrite', (s) => s.put(rec));
export const getFile = (id) => tx('files', 'readonly', (s) => s.get(id));
export const delFile = (id) => tx('files', 'readwrite', (s) => s.delete(id));
export async function patchFile(id, patch) { const r = await getFile(id); if (r) await putFile({ ...r, ...patch }); }
export const getMeta = (k) => tx('meta', 'readonly', (s) => s.get(k));
export const setMeta = (k, v) => tx('meta', 'readwrite', (s) => s.put(v, k));
export async function clearAll() { await tx('files', 'readwrite', (s) => s.clear()); await tx('meta', 'readwrite', (s) => s.clear()); }
