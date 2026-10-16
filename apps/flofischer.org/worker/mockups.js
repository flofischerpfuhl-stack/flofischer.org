/**
 * Unlisted test mockups on gehirn.flofischer.org/<name>/ (files in sites/gehirn/<name>/).
 * Never linked from the site, never in sitemap.xml or robots.txt; served with X-Robots-Tag noindex.
 * When adding one, also add it to MOCKUPS in sites/shared/pwa-worker.js (never cached by the PWA).
 * Agent skill: mockup-hosten.
 */
export const MOCKUPS = new Set([
  "fernwork", // Fernwork One redesign mockups
  "builder", // HimmelCAD Builder UI redesign (builder-ui-lab)
  "win", // one-time Windows PC remote-access setup page (SSH + Tailscale)
]);

export function mockupName(pathname) {
  const first = pathname.split("/")[1] || "";
  return MOCKUPS.has(first) ? first : null;
}
