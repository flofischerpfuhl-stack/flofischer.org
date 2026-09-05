import test from "node:test";
import assert from "node:assert/strict";
import { createAudioLibrary } from "../public/audio.mjs";
const response = () => new Response(new Uint8Array([73,68,51,4]), { headers: { "content-type": "audio/mpeg" } });

test("cached audio is ready without a network request", async () => {
  const library = createAudioLibrary({ cacheStorage: { open: async () => ({ match: async () => response() }) }, fetcher: () => { throw Error("offline"); }, makeUrl: blob => { assert.equal(blob.size, 4); return "blob:cached"; } });
  assert.equal(await library.load("/one.mp3"), "blob:cached");
  assert.equal(library.status("/one.mp3"), "ready");
});

test("parallel requests share a complete download; partial bodies never enable playback", async () => {
  let finish, requests = 0;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1,2])); finish = () => { controller.enqueue(new Uint8Array([3,4])); controller.close(); }; } });
  const library = createAudioLibrary({ cacheStorage: null, fetcher: async () => { requests++; return new Response(body, { headers: { "content-type": "audio/mpeg", "content-length": "4" } }); }, makeUrl: blob => { assert.equal(blob.size,4); return "blob:complete"; } });
  const a = library.load("/one.mp3"), b = library.load("/one.mp3");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(library.status("/one.mp3"), "loading");
  assert.equal(library.url("/one.mp3"), null);
  finish();
  assert.deepEqual(await Promise.all([a,b]), ["blob:complete", "blob:complete"]);
  assert.equal(requests, 1);
});

test("download errors can retry and a cache quota failure still permits memory playback", async () => {
  let attempts = 0;
  const library = createAudioLibrary({ cacheStorage: { open: async () => ({ match: async () => null, put: async () => { throw Error("quota"); } }) }, fetcher: async () => { if (!attempts++) throw Error("offline"); return response(); }, makeUrl: () => "blob:memory" });
  await assert.rejects(library.load("/one.mp3"));
  assert.equal(library.status("/one.mp3"), "error");
  assert.equal(await library.load("/one.mp3"), "blob:memory");
});

test("HTML fallbacks, empty files and truncated files are not playable", async () => {
  for (const result of [new Response("<!doctype html>"), new Response(null,{headers:{"content-type":"audio/mpeg"}}),new Response("ab",{headers:{"content-type":"audio/mpeg","content-length":"6"}})]) {
    const library = createAudioLibrary({ cacheStorage: null, fetcher: async () => result, makeUrl: () => { throw Error("must not create playback URL"); } });
    await assert.rejects(library.load("/one.mp3"));
    assert.equal(library.url("/one.mp3"), null);
    assert.equal(library.status("/one.mp3"), "error");
  }
});

test("stalled downloads time out and remain disabled", async () => {
  const library = createAudioLibrary({ cacheStorage:null, timeoutMs:10, fetcher: (_url,{signal}) => new Promise((_resolve,reject) => signal.addEventListener("abort", () => reject(Error("timeout")))) });
  await assert.rejects(library.load("/one.mp3"), /timeout/);
  assert.equal(library.status("/one.mp3"), "error");
});
