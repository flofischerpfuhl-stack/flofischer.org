/** DOM-only progress for a loading step, never an invented overall percentage.
 * A byte denominator is meaningful only for one known-length active transfer.
 * Error/finished scopes ignore late events from concurrent resource requests.
 */
import { formatLoadProgress } from '../../games-assets/fernworld/runtime/loading-cache.js';
const megabytes = bytes => `${(bytes / 1048576).toLocaleString('de', { maximumFractionDigits: 1 })} MB`;
export function createLoadingStatus({ root, text, progress, detail }) {
  const transfers = new Map(), downloaded = new Map();
  let open = false;
  function indeterminate() { progress.removeAttribute('value');progress.removeAttribute('max'); }
  function begin(message) {
    open = true;transfers.clear();downloaded.clear();root.hidden = false;progress.hidden = false;detail.hidden = false;
    text.textContent = message;detail.textContent = 'Spieldaten · Modelle · Szene und Licht';
    progress.setAttribute('aria-valuetext', 'Aktueller Ladeschritt; Gesamtdauer noch unbekannt');indeterminate();
  }
  function update(event) {
    if (!open) return;
    indeterminate();
    if (event.phase === 'download' && event.url && !event.cacheHit) {
      downloaded.set(event.url, Math.max(downloaded.get(event.url) ?? 0, event.loaded ?? 0));
      if (event.done) transfers.delete(event.url);else transfers.set(event.url, event);
    }
    const bytes = [...downloaded.values()].reduce((sum,value) => sum+value,0);
    if (event.phase === 'download' && transfers.size > 1) {
      text.textContent = `Spieldaten laden · ${transfers.size} Dateien gleichzeitig …`;
      detail.textContent = `${megabytes(bytes)} geladen · anschließend Modelle und Licht`;
    } else if (event.phase === 'download' && !event.cacheHit && !event.done && transfers.size === 1) {
      text.textContent = 'Spieldaten laden …';
      const known = Number.isFinite(event.total) && event.total > 0 && event.loaded < event.total;
      detail.textContent = `Aktuelle Datei: ${megabytes(event.loaded ?? 0)}${known ? ` / ${megabytes(event.total)}` : ''} · danach Modelle und Licht`;
      if (known) { progress.max=event.total;progress.value=event.loaded; }
    } else {
      text.textContent = event.phase === 'download' && event.done && !event.cacheHit ? 'Geladene Spieldaten vorbereiten …' : formatLoadProgress(event);
      detail.textContent = bytes ? `${megabytes(bytes)} geladen · aktueller Vorbereitungsschritt` : 'Modelle und Szene werden vorbereitet …';
    }
    progress.setAttribute('aria-valuetext', detail.textContent);
  }
  function fail(message) {
    open = false;transfers.clear();text.textContent = message;progress.hidden = true;detail.hidden = true;indeterminate();
  }
  function finish() { open=false;transfers.clear();indeterminate();root.hidden=true; }
  return { begin, update, fail, finish };
}
