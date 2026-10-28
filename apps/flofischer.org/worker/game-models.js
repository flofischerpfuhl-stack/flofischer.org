/** Lossless, precompressed GLBs for the unlisted Fernworld test build.
 * Keep the body streamed and already encoded: the browser receives the exact
 * original GLB after HTTP decompression, without work on its animation frames.
 */
function acceptsGzip(request) {
  const value = request.cf?.clientAcceptEncoding ?? request.headers.get("Accept-Encoding") ?? "";
  const values = new Map(value.toLowerCase().split(",").map(entry => {
    const [name, ...params] = entry.trim().split(";");
    const quality = params.map(p => p.trim()).find(p => p.startsWith("q="));
    return [name.trim(), quality ? Number(quality.slice(2)) : 1];
  }));
  return (values.get("gzip") ?? values.get("*") ?? 0) > 0;
}

export async function fetchGameModel(request, env, pathname) {
  if (!/^\/games\/tools\/games-assets\/fernworld\/.+\.glb$/.test(pathname)
      || !["GET", "HEAD"].includes(request.method) || !acceptsGzip(request)) return null;
  const headers = new Headers();
  for (const name of ["If-None-Match", "If-Modified-Since"]) {
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  }
  const target = new URL(`/gehirn${pathname}.gz`, request.url);
  const result = await env.ASSETS.fetch(new Request(target, { method: request.method, headers }));
  if (![200, 304].includes(result.status)) {
    await result.body?.cancel();
    return null;
  }
  const responseHeaders = new Headers(result.headers);
  responseHeaders.set("Content-Type", "model/gltf-binary");
  responseHeaders.set("Content-Encoding", "gzip");
  responseHeaders.set("Vary", "Accept-Encoding");
  responseHeaders.delete("Accept-Ranges");
  // encodeBody must also be retained by the outer site-header response wrapper.
  return new Response(result.body, { status: result.status, headers: responseHeaders, encodeBody: "manual" });
}
