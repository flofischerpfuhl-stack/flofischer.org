// Playback uses complete blobs, never a streaming network URL.
export function createAudioLibrary({ fetcher = globalThis.fetch, cacheStorage = globalThis.caches, makeUrl = blob => URL.createObjectURL(blob), onChange = () => {}, timeoutMs = 60000 } = {}) {
  const entries = new Map();
  const status = asset => entries.get(asset)?.status || "idle";
  function load(asset) {
    const previous = entries.get(asset);
    if (previous && previous.status !== "error") return previous.promise;
    const entry = { status: "loading", url: null };
    entries.set(asset, entry);
    entry.promise = (async () => {
      let cache;
      try { cache = await cacheStorage?.open("hochzeit-audio-v1"); } catch {}
      let response;
      try { response = await cache?.match(asset); } catch {}
      let blob;
      if (response?.status === 200 && response.headers.get("content-type")?.startsWith("audio/")) {
        try { blob = await response.blob(); } catch {}
      }
      if (!blob?.size) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          response = await fetcher(asset, { signal: controller.signal, cache: "no-cache" });
          if (response.status !== 200 || !response.headers.get("content-type")?.startsWith("audio/")) throw new Error("audio_unavailable");
          blob = await response.blob();
          const length = Number(response.headers.get("content-length"));
          if (!blob.size || (length && length !== blob.size)) throw new Error("audio_incomplete");
        } finally { clearTimeout(timer); }
        try { await cache?.put(asset, new Response(blob, { headers: { "content-type": blob.type || "audio/mpeg" } })); } catch {}
      }
      entry.url = makeUrl(blob);
      entry.status = "ready";
      onChange();
      return entry.url;
    })().catch(error => { entry.status = "error"; onChange(); throw error; });
    onChange();
    return entry.promise;
  }
  return { status, load, url: asset => entries.get(asset)?.url || null };
}
