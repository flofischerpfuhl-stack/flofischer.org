/**
 * Host-based static routing for flofischer.org
 *
 *   flofischer.org / www.flofischer.org → /root/*
 *   seele.flofischer.org                → /seele/*
 *   gehirn.flofischer.org               → /gehirn/*
 *
 * Global: /shared/* is never site-prefixed.
 * Dev:    /__seele, /__gehirn, /__root path prefixes + ?__site=
 */

function siteFromHost(hostname) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (host.startsWith("seele.")) return "seele";
  if (host.startsWith("gehirn.")) return "gehirn";
  return "root";
}

async function fetchAsset(env, origin, assetPath) {
  const url = new URL(assetPath, origin);
  return env.ASSETS.fetch(url);
}

async function tryPaths(env, origin, paths) {
  for (const p of paths) {
    const res = await fetchAsset(env, origin, p);
    if (res.status !== 404) return res;
  }
  return null;
}

function candidatePaths(site, pathname) {
  let path = pathname;
  if (path === "/" || path === "") path = "/index.html";
  else if (path.endsWith("/")) path = `${path}index.html`;

  const out = [`/${site}${path}`];

  // Bare paths without extension → try .html and /index.html
  if (!/\.[a-zA-Z0-9]+$/.test(path)) {
    out.push(`/${site}${path}.html`);
    out.push(`/${site}${path}/index.html`);
  }

  return out;
}

function withSiteHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (pathname.endsWith("/sw.js") || pathname === "/sw.js") {
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    headers.set("Service-Worker-Allowed", "/");
    headers.set("Content-Type", "text/javascript; charset=utf-8");
  } else if (pathname.endsWith(".webmanifest")) {
    headers.set("Content-Type", "application/manifest+json; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=3600");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let pathname = url.pathname;

    if (url.hostname.toLowerCase() === "www.flofischer.org") {
      url.hostname = "flofischer.org";
      return Response.redirect(url.toString(), 308);
    }

    // Path-prefix overrides for local preview
    let site = siteFromHost(url.hostname);
    if (url.searchParams.has("__site")) {
      const s = url.searchParams.get("__site");
      if (s === "seele" || s === "gehirn" || s === "root") site = s;
    }

    const prefixMatch = pathname.match(/^\/__(seele|gehirn|root)(\/.*)?$/);
    if (prefixMatch) {
      site = prefixMatch[1];
      pathname = prefixMatch[2] || "/";
    }

    // Shared assets are global (not site-prefixed)
    if (pathname === "/shared" || pathname.startsWith("/shared/")) {
      const res = await tryPaths(env, url.origin, [
        pathname,
        pathname.endsWith("/") ? `${pathname}index.html` : null,
      ].filter(Boolean));
      if (res) return withSiteHeaders(res, pathname);
      return withSiteHeaders(new Response("Not found", { status: 404 }), pathname);
    }

    const found = await tryPaths(
      env,
      url.origin,
      candidatePaths(site, pathname)
    );
    if (found) return withSiteHeaders(found, pathname);

    const notFound = await tryPaths(env, url.origin, [
      `/${site}/404.html`,
    ]);
    if (notFound) {
      return withSiteHeaders(new Response(notFound.body, {
        status: 404,
        headers: notFound.headers,
      }), pathname);
    }

    return withSiteHeaders(new Response("Not found", { status: 404 }), pathname);
  },
};
