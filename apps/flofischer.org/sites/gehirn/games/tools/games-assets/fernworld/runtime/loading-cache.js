/** Shared immutable downloads only. Parsed GPU resources remain library-owned.
 * Limits include queued/in-flight keys, retained decoded bytes and JSON metadata.
 * Cancelling one subscriber cannot cancel another; the last subscriber aborts I/O.
 */
const BYTE_LIMIT = 48 * 1024 * 1024, JSON_LIMIT = 12 * 1024 * 1024;
const ENTRY_LIMIT = 256, INFLIGHT_LIMIT = 48, CONCURRENCY = 6;
const bytes = new Map(), metadata = new Map(), inflight = new Map(), queue = [];
let byteSize = 0, jsonSize = 0, active = 0;
const counters = { downloads: 0, hits: 0, coalesced: 0, failures: 0, evictions: 0 };
const abortError = () => new DOMException('Laden abgebrochen', 'AbortError');
const now = () => performance.now();
function touch(map, key, value) { map.delete(key); map.set(key, value); return value; }
function emit(callback, event) { try { callback?.(event); } catch (error) { console.warn('[Fernworld progress]', error); } }
function retain(map, key, value, size, limit, type) {
  if (size > limit) return;
  if (map.has(key)) return;
  map.set(key, { value, size });
  if (type === 'bytes') byteSize += size; else jsonSize += size;
  while (map.size > ENTRY_LIMIT || (type === 'bytes' ? byteSize : jsonSize) > limit) {
    const oldest = map.keys().next().value, entry = map.get(oldest); map.delete(oldest);
    if (type === 'bytes') byteSize -= entry.size; else jsonSize -= entry.size;
    counters.evictions++;
  }
}
function pump() {
  while (active < CONCURRENCY && queue.length) {
    const entry = queue.shift();
    if (!entry.listeners.size) { if(inflight.get(entry.url)===entry)inflight.delete(entry.url); continue; }
    active++; entry.started = now();
    run(entry).then(value => finish(entry, null, value), error => finish(entry, error)).finally(() => { active--; pump(); });
  }
}
function notify(entry, event) {
  entry.progress = { phase: 'download', url: entry.url, ...event };
  for (const listener of entry.listeners) emit(listener.onProgress, entry.progress);
}
async function run(entry) {
  counters.downloads++;
  const response = await fetch(entry.url, { signal: entry.controller.signal });
  if (!response.ok) {
    const error=new Error(`Asset HTTP ${response.status}: ${entry.url}`);
    if(response.status===409)error.code='ASSET_VERSION_MISMATCH';
    throw error;
  }
  // Fetch streams are decoded; Content-Length may describe gzip/brotli bytes.
  const header = Number(response.headers.get('content-length'));
  const total = !response.headers.get('content-encoding') && header > 0 ? header : null;
  let value;
  if (response.body?.getReader) {
    const reader = response.body.getReader(), chunks = []; let loaded = 0;
    notify(entry, { loaded, total, done: false });
    for (;;) {
      const result = await reader.read(); if (result.done) break;
      chunks.push(result.value); loaded += result.value.byteLength;
      notify(entry, { loaded, total, done: false });
    }
    value = new Uint8Array(loaded); let offset = 0;
    for (const chunk of chunks) { value.set(chunk, offset); offset += chunk.byteLength; }
    value = value.buffer;
  } else value = await response.arrayBuffer();
  if (entry.controller.signal.aborted) throw abortError();
  retain(bytes, entry.url, value, value.byteLength, BYTE_LIMIT, 'bytes');
  notify(entry, { loaded: value.byteLength, total: total === value.byteLength ? total : null, done: true, milliseconds: now() - entry.started });
  return value;
}
function finish(entry, error, value) {
  if (inflight.get(entry.url) === entry) inflight.delete(entry.url);
  if (error) counters.failures++;
  for (const listener of entry.listeners) { listener.cleanup(); error ? listener.reject(error) : listener.resolve(value); }
  entry.listeners.clear();
}
/** Optional publish contract: the server must validate this exact content fingerprint.
 * Set once in HTML before module loading. Invalid/missing values keep URLs mutable.
 */
export function assetRequestURL(input) {
  const url=new URL(String(input),globalThis.location?.href??import.meta.url);
  const revision=globalThis.document?.querySelector('meta[name="fw-assets-version"]')?.content;
  if(/^[a-f0-9]{64}$/.test(revision??''))url.searchParams.set('v',revision);
  return url.href;
}
export function loadBytes(url, { onProgress, signal } = {}) {
  url = assetRequestURL(url);
  if (signal?.aborted) return Promise.reject(abortError());
  const cached = bytes.get(url);
  if (cached) {
    counters.hits++; touch(bytes, url, cached);
    emit(onProgress, { phase: 'download', url, loaded: cached.size, total: cached.size, cacheHit: true, done: true });
    return Promise.resolve(cached.value);
  }
  let entry = inflight.get(url);
  // An aborted entry is never reused by a subsequent retry.
  if (entry?.controller.signal.aborted) { inflight.delete(url); entry = null; }
  if (entry) counters.coalesced++;
  else {
    if (inflight.size >= INFLIGHT_LIMIT) return Promise.reject(new Error('Zu viele gleichzeitige Asset-Anfragen'));
    entry = { url, controller: new AbortController(), listeners: new Set(), progress: null };
    inflight.set(url, entry); queue.push(entry);
  }
  const promise = new Promise((resolve, reject) => {
    const listener = { resolve, reject, onProgress, cleanup: () => signal?.removeEventListener('abort', cancel) };
    const cancel = () => {
      entry.listeners.delete(listener); listener.cleanup(); reject(abortError());
      if (!entry.listeners.size) { const queued=queue.indexOf(entry);if(queued>=0)queue.splice(queued,1);entry.controller.abort(); if (inflight.get(url) === entry) inflight.delete(url); }
    };
    entry.listeners.add(listener); signal?.addEventListener('abort', cancel, { once: true });
    if (entry.progress) emit(onProgress, entry.progress);
  });
  pump(); return promise;
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}
export async function loadJSON(url, options = {}) {
  url = assetRequestURL(url);
  if (options.signal?.aborted) throw abortError();
  const cached = metadata.get(url);
  if (cached) {
    touch(metadata, url, cached); counters.hits++;
    emit(options.onProgress, { phase: 'parse', url, cacheHit: true, done: true });
    return cached.value;
  }
  const data = await loadBytes(url, options), concurrent = metadata.get(url);
  if (concurrent) return touch(metadata, url, concurrent).value;
  const started = now(); emit(options.onProgress, { phase: 'parse', url, done: false });
  try {
    const result = freeze(JSON.parse(new TextDecoder().decode(data)));
    // Conservative budget accounts for decoded strings and JS object overhead.
    retain(metadata, url, result, data.byteLength * 4, JSON_LIMIT, 'json');
    emit(options.onProgress, { phase: 'parse', url, done: true, milliseconds: now() - started });
    return result;
  } catch (error) {
    const entry = bytes.get(url); if (entry) { bytes.delete(url); byteSize -= entry.size; }
    throw error;
  }
}
export function invalidateDownload(input) {
  const url=assetRequestURL(input),entry=bytes.get(url),json=metadata.get(url);
  if(entry){bytes.delete(url);byteSize-=entry.size;}
  if(json){metadata.delete(url);jsonSize-=json.size;}
}
export function loadingCacheStats() {
  return { ...counters, byteSize, jsonSize, byteEntries: bytes.size, jsonEntries: metadata.size, inflight: inflight.size, active, queued: queue.length,
    limits: { bytes: BYTE_LIMIT, json: JSON_LIMIT, entries: ENTRY_LIMIT, inflight: INFLIGHT_LIMIT, concurrency: CONCURRENCY } };
}
export function formatLoadProgress(event) {
  if (event.stage) return event.stage;
  if (event.phase === 'download') {
    if (event.cacheHit) return 'Gespeicherte Spieldaten werden vorbereitet …';
    const mb = value => `${(value / 1048576).toLocaleString('de', { maximumFractionDigits: 1 })} MB`;
    return event.total ? `Spieldaten laden: ${mb(event.loaded)} / ${mb(event.total)}` : `Spieldaten laden: ${mb(event.loaded ?? 0)}`;
  }
  if(event.phase==='bake')return 'Bewegungen vorbereiten …';
  return event.phase === 'parse' ? 'Modelle und Bewegungen vorbereiten …' : 'Szene und Licht vorbereiten …';
}
