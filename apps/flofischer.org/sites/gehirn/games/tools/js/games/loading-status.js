/** Slim loading bar shared by the hub, the overworld and level preparation.
 * The fill is determinate by bytes received / bytes expected where the loader knows both
 * (Content-Length or a catalog size hint) and falls back to counting finished preparation
 * steps. It never moves backwards inside one load. The caption names the place or level only.
 * Late events after finish/fail are ignored. Errors keep a visible action button.
 */
const FADE_MS = 280;

/** Markup for one bar; the host element must be `position: relative` (the stage). */
export function loadingBarHTML(extra = '') {
  return '<div class="gm-loadbar" data-load="root" hidden>'
    + '<div class="gm-loadbar__track" data-load="bar" role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="gm-loadbar__fill" data-load="fill"></div></div>'
    + '<div class="gm-loadbar__row"><span class="gm-loadbar__caption" data-load="caption" role="status"></span>'
    + '<button type="button" class="fw-btn fw-btn--sm gm-loadbar__action" data-load="retry" hidden>Retry</button>' + extra + '</div></div>';
}

export function bindLoadingStatus(scope) {
  const part = key => scope.querySelector(`[data-load="${key}"]`);
  return createLoadingStatus({ root: part('root'), bar: part('bar'), fill: part('fill'), caption: part('caption'), retry: part('retry') });
}

export function createLoadingStatus({ root, bar, fill, caption, retry }) {
  const downloads = new Map();
  let open = false, value = 0, steps = 0, timer = 0, action = null;
  retry?.addEventListener?.('click', () => action?.());
  function paint(next) {
    value = Math.max(value, Math.min(1, next));
    fill.style.transform = `scaleX(${value})`;
    bar.setAttribute('aria-valuenow', String(Math.round(value * 100)));
  }
  function reset() {
    clearTimeout(timer);
    downloads.clear(); steps = 0; value = 0; action = null;
    root.classList?.remove('is-done', 'is-error');
    if (retry) retry.hidden = true;
    bar.hidden = false;
  }
  function begin(name) {
    reset(); open = true;
    root.hidden = false; caption.textContent = name ?? '';
    paint(0.03);
  }
  /** Show the bar for `name` unless a load is already running (keeps its progress). */
  function ensure(name) { if (!open) begin(name); }
  function update(event) {
    if (!open) return;
    if (event.phase === 'download' && event.url && !event.cacheHit) {
      const previous = downloads.get(event.url) ?? { loaded: 0, total: 0 };
      const total = event.total > 0 ? event.total : previous.total;
      downloads.set(event.url, { loaded: Math.max(previous.loaded, event.loaded ?? 0), total, done: !!event.done });
      // A finished transfer of unknown size is only a step: it must not claim the whole byte budget.
      if (event.done && !(total > 0)) steps++;
    } else if (event.done !== false) steps++;
    let known = 0, got = 0;
    for (const item of downloads.values()) {
      if (item.total > 0) { known += item.total; got += item.done ? item.total : Math.min(item.loaded, item.total); }
    }
    const stepPart = 1 - 0.85 ** steps;
    paint(known > 0 ? 0.8 * (got / known) + 0.17 * stepPart : 0.5 * stepPart);
  }
  /** `retryAction` (optional) gives the error state its visible button. */
  function fail(message, { action: retryAction = null, label = 'Retry' } = {}) {
    open = false; clearTimeout(timer); downloads.clear();
    root.classList?.remove('is-done'); root.classList?.add('is-error');
    root.hidden = false; caption.textContent = message; bar.hidden = true;
    action = retryAction;
    if (retry) { retry.textContent = label; retry.hidden = !retryAction; }
  }
  function finish() {
    const wasOpen = open, wasError = root.classList?.contains('is-error');
    open = false; downloads.clear(); clearTimeout(timer);
    if (root.hidden) return;
    if (!wasOpen || wasError) { root.hidden = true; root.classList?.remove('is-error'); return; }
    paint(1);
    root.classList?.add('is-done');
    timer = setTimeout(() => { root.hidden = true; root.classList?.remove('is-done'); }, FADE_MS);
  }
  return { begin, ensure, update, fail, finish, get value() { return value; } };
}
