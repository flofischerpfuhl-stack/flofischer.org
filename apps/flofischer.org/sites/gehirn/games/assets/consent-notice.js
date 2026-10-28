/**
 * Fernwork — Storage notice banner
 *
 * The site itself does not use tracking or advertising storage: every
 * tool runs entirely client-side. We do persist a tiny set of
 * preferences (theme selection, this banner's dismissal, per-tool UI
 * state) in `localStorage`. Under the EU ePrivacy Directive those
 * count as strictly-necessary / functional storage which can be set
 * without prior opt-in consent, but we still show a discrete,
 * dismissible notice so visitors are informed about what is stored
 * and where they can read the full policy.
 *
 * Naming note: this file and its DOM hooks deliberately avoid the word
 * "cookie". Brave Shields and most uBlock filter lists block any URL,
 * id or class containing `cookie-banner` outright — which would crash
 * the importing nav.js module and blank the whole page. Using neutral
 * wording (`consent-notice`, `oo-consent-*`) keeps us under the radar
 * of those generic cosmetic / network filters.
 *
 * Behaviour:
 *   - Shown once, then dismissed forever (per browser / device).
 *   - Non-modal compact card in the bottom-left corner (full width above the
 *     bottom edge on phones); never blocks the page content or the tool UI.
 *   - Fernwork One (2026-10): kept because the privacy policy (§2.3/§4) refers
 *     to it; restyled as a small kit card without marketing wording.
 *   - Clicking "OK" or pressing Escape stores the dismissal.
 */

// Storage key kept as v1 ("cookie" wording) on purpose: changing it
// would re-show the banner to every returning visitor who already
// dismissed it. localStorage keys are not visible to ad-blockers.
const STORAGE_KEY = 'oo-cookie-dismissed-v1';

function alreadyDismissed() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; }
  catch (_) { return false; }
}

function persistDismissal() {
  try { localStorage.setItem(STORAGE_KEY, '1'); }
  catch (_) { /* private-mode storage disabled — banner will reappear, that's fine */ }
}

function legalHref(page) {
  const cleanPage = page.replace(/\.html$/, '');
  const path = window.location.pathname;
  if (path.includes('/tools/')) return `../legal/${cleanPage}`;
  if (path.includes('/legal/')) return cleanPage;
  return `legal/${cleanPage}`;
}

const TOAST_STACKS = '#toast-container, .fw-toasts';

/**
 * Toasts (the legacy `#toast-container` and the kit `.fw-toasts`) never cover the notice or its OK button: while the
 * notice is shown, a toast stack that would overlap it is shifted next to it — below a notice in the upper half of
 * the viewport, above one in the lower half. Tools place both freely and move the notice when their state changes
 * (e.g. Image Tools puts both at the top of the stage once an image is open), so this works from the rendered boxes
 * and re-checks while toasts are visible. Returns a function that stops it and resets the stacks.
 */
function keepToastsClear(banner) {
  let timer = 0;
  const watched = new WeakSet();
  const stacks = () => [...document.querySelectorAll(TOAST_STACKS)];
  const update = () => {
    if (!banner.isConnected) return false;
    const n = banner.getBoundingClientRect();
    let busy = false;
    stacks().forEach((c) => {
      if (!watched.has(c)) { watched.add(c); childObserver.observe(c, { childList: true }); }
      c.style.removeProperty('translate');
      if (!c.childElementCount) return;
      busy = true;
      const r = c.getBoundingClientRect();
      if (!r.height || r.right <= n.left || r.left >= n.right || r.bottom <= n.top || r.top >= n.bottom) return;
      const dy = n.top + n.height / 2 < innerHeight / 2 ? n.bottom + 8 - r.top : n.top - 8 - r.bottom;
      c.style.translate = `0 ${Math.round(dy)}px`;
    });
    return busy;
  };
  // While a toast is up, keep checking (the notice or the stack may move with the tool's layout).
  const tick = () => { timer = update() ? setTimeout(tick, 200) : 0; };
  const schedule = () => { if (!timer) timer = setTimeout(tick, 0); };
  const childObserver = new MutationObserver(schedule);
  // Toast stacks are created lazily as direct children of <body>.
  const bodyObserver = new MutationObserver(schedule);
  bodyObserver.observe(document.body, { childList: true });
  window.addEventListener('resize', schedule);
  schedule();
  return () => {
    clearTimeout(timer); timer = 0;
    childObserver.disconnect(); bodyObserver.disconnect();
    window.removeEventListener('resize', schedule);
    stacks().forEach((c) => c.style.removeProperty('translate'));
  };
}

/**
 * On phones the notice sits at the bottom, where tools keep their action and bottom bars (Convert all, Layers,
 * Tables, the canvas menu). Lift it above whatever controls occupy the bottom of the screen, so nothing stays covered
 * until it is dismissed. Works from the rendered page: probe the bottom strip for buttons and fields.
 */
function keepBottomBarsClear(banner) {
  let timer = 0;
  const lift = () => {
    timer = 0;
    if (!banner.isConnected) return;
    banner.style.removeProperty('bottom');
    // Games keep their cancellable loading dock visible on desktop too. The
    // storage notice must not intercept Back/Retry while a model is loading.
    const noticeRect = banner.getBoundingClientRect();
    const docks = [...document.querySelectorAll('.gm-loading:not([hidden]) .gm-card')]
      .map(el => el.getBoundingClientRect())
      .filter(r => r.width && r.height && r.left < noticeRect.right && r.right > noticeRect.left
        && r.bottom > noticeRect.top && r.top < noticeRect.bottom);
    if (docks.length) {
      const top = Math.min(...docks.map(r => r.top));
      banner.style.bottom = `${Math.max(0, Math.min(innerHeight - noticeRect.height - 8, Math.ceil(innerHeight - top + 8)))}px`;
      return;
    }
    // Tools that place the notice themselves (Image Tools puts it at the top of the stage) are left alone.
    if (innerWidth > 767 || banner.getBoundingClientRect().top < innerHeight / 2) return;
    const previous = banner.style.visibility;
    banner.style.visibility = 'hidden';
    // On a page that scrolls, controls at the bottom are ordinary content scrolling by; only fixed or sticky bars
    // count there. App-like pages that fill the screen (viewers, canvas) keep their bars in the layout itself.
    const pageScrolls = document.scrollingElement.scrollHeight > innerHeight + 4;
    const inBar = (el) => {
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        if (/^(fixed|sticky)$/.test(getComputedStyle(node).position)) return true;
      }
      return false;
    };
    let top = innerHeight;
    for (let y = innerHeight - 6; y > innerHeight - 160; y -= 10) {
      for (const x of [0.12, 0.5, 0.88]) {
        const control = document.elementFromPoint(innerWidth * x, y)?.closest('button, a[href], input, select, textarea, [role="button"], [role="tab"]');
        if (control && !banner.contains(control) && (!pageScrolls || inBar(control))) top = Math.min(top, control.getBoundingClientRect().top);
      }
    }
    banner.style.visibility = previous;
    if (top < innerHeight) banner.style.bottom = `${Math.round(innerHeight - top + 8)}px`;
  };
  const schedule = () => { if (!timer) timer = setTimeout(lift, 250); };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  window.addEventListener('resize', schedule);
  schedule();
  return () => { clearTimeout(timer); observer.disconnect(); window.removeEventListener('resize', schedule); };
}

export function showCookieBanner() {
  if (alreadyDismissed()) return;
  if (document.getElementById('oo-consent-notice')) return;

  const banner = document.createElement('div');
  banner.id = 'oo-consent-notice';
  banner.className = 'oo-consent-notice';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Storage notice');
  banner.setAttribute('aria-live', 'polite');
  banner.innerHTML = `
    <div class="oo-consent-notice-inner">
      <p>
        <span class="fw-hide-mobile">Fernwork keeps a few preferences, like the theme, in this browser.</span>
        <span class="fw-show-mobile">Preferences stay in this browser.</span>
        <a href="${legalHref('privacy')}">Privacy policy</a>
      </p>
      <button type="button" class="fw-btn fw-btn--sm" id="oo-consent-ok">OK</button>
    </div>
  `;

  document.body.appendChild(banner);
  const stopClearing = keepToastsClear(banner);
  const stopLifting = keepBottomBarsClear(banner);

  const dismiss = () => {
    persistDismissal();
    stopClearing();
    stopLifting();
    banner.classList.add('leaving');
    banner.addEventListener('transitionend', () => banner.remove(), { once: true });
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') dismiss(); };

  banner.querySelector('#oo-consent-ok').addEventListener('click', dismiss);
  document.addEventListener('keydown', onKey);
}
