/* =====================================================================
 * seo.js — Centralized SEO + PWA tag injection.
 *
 * Why a script instead of writing tags into every HTML file:
 *   - DRY: Open Graph, Twitter, manifest, theme-color, apple touch icon,
 *     JSON-LD all need the same canonical site name / description /
 *     image URL. Hardcoding 30+ <meta> tags per page is impossible to
 *     keep consistent.
 *   - Pages just declare their own title + description (already in
 *     <title> and <meta name="description">) and call `injectSeo()`.
 *
 * The script runs before user interaction is possible (loaded `defer`
 * in <head>), so search-engine crawlers and social-media bots that DO
 * execute JS (Googlebot, Twitterbot, Facebook external hit) see the
 * tags. Crawlers that DON'T execute JS (WhatsApp's preview fetcher,
 * old LinkedIn) read the static `<meta>` and `<link>` tags we already
 * write into each HTML file as fallbacks — see the per-page templates.
 *
 * Public:
 *   injectSeo({ pageTitle, pageDescription, pagePath })
 *     → adds OG/Twitter/canonical/JSON-LD/PWA tags. Idempotent.
 *
 *   registerServiceWorker()
 *     → registers /sw.js so the app installs as a PWA. Skips on
 *       file:// origins where SW isn't allowed.
 *
 * Site-wide constants live in SITE — change SITE.url here when the
 * domain changes; everything else updates automatically.
 * ===================================================================== */

export const SITE = {
  // The canonical origin used to build absolute URLs for og:url,
  // twitter:url, JSON-LD @id, sitemap, etc. Override at deploy time
  // by setting <html data-site-url="https://example.com"> on the
  // page's root element.
  url: (typeof document !== 'undefined' && document.documentElement.dataset.siteUrl)
    || 'https://fernwork.net',
  name: 'Fernwork',
  shortDescription: 'Free, private productivity tools that run entirely in your browser.',
  longDescription:
    'Fernwork is a free suite of in-browser productivity tools — PDF editing, ' +
    'image and document conversion, file viewers for DXF / IFC / STL / DOCX / PPTX, ' +
    'cryptography, text utilities, unit conversion and more. Everything runs ' +
    'locally in your browser — no upload, no backend, no tracking.',
  themeColor: '#0a0a0a',
  ogImage: 'assets/icons/og-image.png',
  ogImageWidth: 1200,
  ogImageHeight: 630,
  twitterHandle: '', // optional — fill in when a social account exists
  locale: 'en_US',
};

const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function isLocalDevOrigin() {
  return LOCAL_DEV_HOSTS.has(location.hostname);
}

function abs(path) {
  if (!path) return SITE.url;
  if (/^https?:\/\//i.test(path)) return path;
  const base = SITE.url.replace(/\/$/, '');
  const tail = String(path).replace(/^\.?\//, '/');
  return base + (tail.startsWith('/') ? tail : '/' + tail);
}

function cleanCanonicalPath(path) {
  const raw = String(path || '/');
  const [base, query = ''] = raw.split('?');
  const cleanBase = base === '/index.html'
    ? '/'
    : base.replace(/\.html$/, '');
  return cleanBase + (query ? `?${query}` : '');
}

function ensureMeta(selector, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    document.head.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    el.setAttribute(k, String(v));
  }
}

function ensureLink(rel, attrs) {
  const sel = attrs.sizes
    ? `link[rel="${rel}"][sizes="${attrs.sizes}"]`
    : `link[rel="${rel}"]${attrs.type ? `[type="${attrs.type}"]` : ''}`;
  let el = document.head.querySelector(sel);
  const existed = !!el;
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    // Preserve whatever the page template already set for browser-fetched
    // assets (icons, manifest). Those paths are relative in the HTML on
    // purpose so localhost/staging/prod all resolve against the current
    // origin — don't clobber them with the hardcoded SITE.url.
    if (existed && k === 'href' && rel !== 'canonical') continue;
    el.setAttribute(k, String(v));
  }
}

let themeColorSyncInstalled = false;

function getThemeColor() {
  return document.documentElement.dataset.theme === 'light' ? '#ffffff' : SITE.themeColor;
}

function syncThemeColor() {
  const color = getThemeColor();
  ensureMeta('meta[name="theme-color"]', { name: 'theme-color', content: color });
  ensureMeta('meta[name="msapplication-TileColor"]', { name: 'msapplication-TileColor', content: color });
}

function installThemeColorSync() {
  if (themeColorSyncInstalled) return;
  themeColorSyncInstalled = true;
  document.addEventListener('oo-theme-change', syncThemeColor);
}

function ensureJsonLd(id, data) {
  let el = document.head.querySelector(`script[type="application/ld+json"][data-id="${id}"]`);
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.dataset.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

/**
 * Inject Open Graph / Twitter / canonical / PWA tags into the document.
 *
 * @param {object}  o
 * @param {string?} o.pageTitle        — Falls back to <title>.
 * @param {string?} o.pageDescription  — Falls back to existing meta description.
 * @param {string?} o.pagePath         — e.g. '/tools/pdf-tools.html'. Defaults to current location.
 * @param {string?} o.image            — Override OG image URL (path or absolute).
 * @param {string?} o.type             — og:type, defaults to 'website'.
 */
export function injectSeo(o = {}) {
  const title = o.pageTitle || document.title || SITE.name;
  const descEl = document.head.querySelector('meta[name="description"]');
  const description = o.pageDescription || descEl?.getAttribute('content') || SITE.shortDescription;
  const path = cleanCanonicalPath(o.pagePath || (window.location.pathname + window.location.search));
  const url  = abs(path);
  const image = abs(o.image || SITE.ogImage);
  const type  = o.type || 'website';

  // Make sure description exists even if the page didn't set one.
  if (!descEl) ensureMeta('meta[name="description"]', { name: 'description', content: description });

  // Generic SEO
  ensureLink('canonical', { href: url });
  ensureMeta('meta[name="robots"]', { name: 'robots', content: 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1' });
  ensureMeta('meta[name="googlebot"]', { name: 'googlebot', content: 'index, follow' });
  ensureMeta('meta[name="author"]', { name: 'author', content: SITE.name });
  ensureMeta('meta[name="application-name"]', { name: 'application-name', content: SITE.name });
  ensureMeta('meta[name="generator"]', { name: 'generator', content: SITE.name });

  // Open Graph (Facebook, LinkedIn, WhatsApp, Discord, Slack, Telegram, …)
  ensureMeta('meta[property="og:site_name"]',     { property: 'og:site_name',     content: SITE.name });
  ensureMeta('meta[property="og:title"]',         { property: 'og:title',         content: title });
  ensureMeta('meta[property="og:description"]',   { property: 'og:description',   content: description });
  ensureMeta('meta[property="og:type"]',          { property: 'og:type',          content: type });
  ensureMeta('meta[property="og:url"]',           { property: 'og:url',           content: url });
  ensureMeta('meta[property="og:locale"]',        { property: 'og:locale',        content: SITE.locale });
  ensureMeta('meta[property="og:image"]',         { property: 'og:image',         content: image });
  ensureMeta('meta[property="og:image:secure_url"]', { property: 'og:image:secure_url', content: image });
  ensureMeta('meta[property="og:image:type"]',    { property: 'og:image:type',    content: 'image/png' });
  ensureMeta('meta[property="og:image:width"]',   { property: 'og:image:width',   content: SITE.ogImageWidth });
  ensureMeta('meta[property="og:image:height"]',  { property: 'og:image:height',  content: SITE.ogImageHeight });
  ensureMeta('meta[property="og:image:alt"]',     { property: 'og:image:alt',     content: `${SITE.name} — ${SITE.shortDescription}` });

  // Twitter / X — `summary_large_image` shows the wide preview card.
  ensureMeta('meta[name="twitter:card"]',         { name: 'twitter:card',         content: 'summary_large_image' });
  ensureMeta('meta[name="twitter:title"]',        { name: 'twitter:title',        content: title });
  ensureMeta('meta[name="twitter:description"]',  { name: 'twitter:description',  content: description });
  ensureMeta('meta[name="twitter:image"]',        { name: 'twitter:image',        content: image });
  ensureMeta('meta[name="twitter:image:alt"]',    { name: 'twitter:image:alt',    content: `${SITE.name} — ${SITE.shortDescription}` });
  if (SITE.twitterHandle) {
    ensureMeta('meta[name="twitter:site"]',       { name: 'twitter:site',         content: SITE.twitterHandle });
    ensureMeta('meta[name="twitter:creator"]',    { name: 'twitter:creator',      content: SITE.twitterHandle });
  }

  // PWA / mobile install metadata
  //
  // Manifest and icon URLs stay RELATIVE on purpose: the same HTML is
  // served from localhost during development, from preview deploys
  // (staging-host.example) and from the production domain. Writing an
  // absolute https://fernwork.net URL here would force the browser
  // to fetch PWA assets from the production origin even during local
  // dev, which fails with ERR_SSL_PROTOCOL_ERROR if prod isn't up.
  //
  // Crawlers that need the full URL (OG image, canonical) still get an
  // absolute URL below — those are about the *public* identity of the
  // page, not about what the visitor's browser should load.
  ensureLink('manifest', { href: 'manifest.webmanifest' });
  syncThemeColor();
  installThemeColorSync();
  ensureMeta('meta[name="color-scheme"]', { name: 'color-scheme', content: 'dark light' });
  // iOS web-app behavior — when user taps "Add to Home Screen", launches
  // fullscreen with our status-bar style instead of inside Safari chrome.
  ensureMeta('meta[name="apple-mobile-web-app-capable"]',          { name: 'apple-mobile-web-app-capable',          content: 'yes' });
  ensureMeta('meta[name="apple-mobile-web-app-title"]',            { name: 'apple-mobile-web-app-title',            content: SITE.name });
  ensureMeta('meta[name="apple-mobile-web-app-status-bar-style"]', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
  // Android Chrome equivalent (legacy but Samsung Internet still reads it).
  ensureMeta('meta[name="mobile-web-app-capable"]',                { name: 'mobile-web-app-capable',                content: 'yes' });
  // Windows tile color is kept in sync by syncThemeColor().
  ensureMeta('meta[name="format-detection"]',                      { name: 'format-detection',                      content: 'telephone=no' });

  // Icon links — PNG first for search-result crawlers, SVG as browser fallback.
  ensureLink('icon',             { rel: 'icon',             type: 'image/png',     sizes: '48x48',  href: '/assets/icons/icon-48.png' });
  ensureLink('icon',             { rel: 'icon',             type: 'image/png',     sizes: '32x32',  href: '/assets/icons/icon-32.png' });
  ensureLink('icon',             { rel: 'icon',             type: 'image/png',     sizes: '192x192', href: '/assets/icons/icon-192.png' });
  ensureLink('icon',             { rel: 'icon',             type: 'image/svg+xml', href: '/assets/icons/favicon.svg' });
  ensureLink('shortcut icon',    { rel: 'shortcut icon',    type: 'image/x-icon',  href: '/favicon.ico' });
  ensureLink('apple-touch-icon', { rel: 'apple-touch-icon', sizes: '180x180',      href: '/assets/icons/apple-touch-icon.png' });
  ensureLink('mask-icon',        { rel: 'mask-icon',        href: '/assets/icons/favicon.svg', color: '#15803d' });

  // JSON-LD structured data — helps Google Rich Results.
  ensureJsonLd('website', {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    'name': SITE.name,
    'url': SITE.url,
    'description': SITE.longDescription,
  });
  ensureJsonLd('webapp', {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    'name': SITE.name,
    'url': SITE.url,
    'description': SITE.longDescription,
    'applicationCategory': 'BusinessApplication',
    'applicationSubCategory': 'OfficeApplication',
    'operatingSystem': 'Any (browser-based)',
    'browserRequirements': 'Requires a modern browser with JavaScript enabled.',
    'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'USD' },
    'isAccessibleForFree': true,
    'image': image,
  });
}

/**
 * Register the service worker. Should be called from each page after
 * SEO injection. Best-effort: silently bails on file:// or unsupported
 * environments.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && !isLocalDevOrigin()) return;

  if (isLocalDevOrigin()) {
    const cleanup = unregisterLocalServiceWorker();
    window.__ooServiceWorkerReady = cleanup;
    return cleanup;
  }

  // Defer until the page is idle so we don't compete with first paint.
  const reg = () => navigator.serviceWorker.register('/sw.js').then((registration) => {
    if (!registration) return;
    const activateWaitingWorker = () => {
      if (registration.waiting) registration.waiting.postMessage('SKIP_WAITING');
    };

    if (typeof registration.addEventListener === 'function') registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          worker.postMessage('SKIP_WAITING');
        }
      });
    });

    activateWaitingWorker();
    registration.update().catch(() => {});
  }).catch((err) => {
    console.warn('[seo] Service worker registration failed', err);
  });

  if ('requestIdleCallback' in window) requestIdleCallback(reg, { timeout: 3000 });
  else window.addEventListener('load', reg, { once: true });
}

async function unregisterLocalServiceWorker() {
  try {
    const registrations = typeof navigator.serviceWorker.getRegistrations === 'function'
      ? await navigator.serviceWorker.getRegistrations()
      : [await navigator.serviceWorker.getRegistration()].filter(Boolean);

    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('oo-v'))
          .map((name) => caches.delete(name))
      );
    }

    if (navigator.serviceWorker.controller && sessionStorage.getItem('oo-local-sw-clean-reload') !== '1') {
      sessionStorage.setItem('oo-local-sw-clean-reload', '1');
      location.reload();
      await new Promise(() => {});
    }

    if (!navigator.serviceWorker.controller) {
      sessionStorage.removeItem('oo-local-sw-clean-reload');
    }
  } catch (err) {
    console.warn('[seo] Local service worker cleanup failed', err);
  }
}
