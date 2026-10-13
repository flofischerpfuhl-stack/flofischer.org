// Session persistence (today's tool restores open images after a reload): originals + edit recipes + undo stacks in IndexedDB.
const DB = 'fw-image-tools', VER = 1;
let dbp = null;
function db() {
  return (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', { keyPath: 'id' }); if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
}
const tx = async (store, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const out = fn(t.objectStore(store)); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); };

export async function saveDocs(docs, active) {
  try {
    await tx('docs', 'readwrite', (s) => { s.clear(); docs.forEach((d, i) => s.put({ id: d.id, i, name: d.name, file: d.file, recipe: d.recipe, undo: d.undo.slice(-40), redo: d.redo.slice(-40) })); });
    await tx('meta', 'readwrite', (s) => s.put({ active }, 'session'));
  } catch (e) { console.warn('[image-tools] save failed', e); }
}
export async function loadDocs() {
  try {
    const docs = await tx('docs', 'readonly', (s) => s.getAll());
    const meta = await tx('meta', 'readonly', (s) => s.get('session'));
    return { docs: (docs || []).sort((a, b) => a.i - b.i), active: meta?.active ?? 0 };
  } catch { return { docs: [], active: 0 }; }
}
export async function clearDocs() { try { await tx('docs', 'readwrite', (s) => s.clear()); } catch { /* ignore */ } }
