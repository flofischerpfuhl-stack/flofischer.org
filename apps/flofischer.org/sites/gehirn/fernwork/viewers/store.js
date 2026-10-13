// Viewers · one record per viewer (its last file, mode and draft) in IndexedDB, like today's viewer-session store.
// Every call is wrapped so the viewer still works in private windows (it just forgets on reload).
const NAME = 'fw-viewers', V = 1;
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const r = indexedDB.open(NAME, V);
      r.onupgradeneeded = () => r.result.createObjectStore('last');
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch { res(null); }
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db(); if (!d) return null;
  return new Promise((res) => {
    try {
      const t = d.transaction('last', mode); const s = t.objectStore('last'); let out;
      const r = fn(s); if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out ?? null); t.onerror = () => res(null); t.onabort = () => res(null);
    } catch { res(null); }
  });
}
export const get = (k) => tx('readonly', (s) => s.get(k));
export const put = (k, v) => tx('readwrite', (s) => s.put(v, k));
export const del = (k) => tx('readwrite', (s) => s.delete(k));
export const clear = () => tx('readwrite', (s) => s.clear());
export async function patch(k, p) { const r = await get(k); if (r) await put(k, { ...r, ...p }); }
