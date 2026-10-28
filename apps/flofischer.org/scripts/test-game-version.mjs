import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const version=(await import('../worker/game-asset-version.js')).GAME_ASSET_VERSION;
const path='/games/tools/games-assets/fernworld/selected-assets.json';
const env={ASSETS:{async fetch(input){const p=new URL(input instanceof Request?input.url:input).pathname;return p.endsWith('selected-assets.json')?new Response('{"revision":1}',{headers:{'Content-Type':'application/json'}}):new Response('missing',{status:404});}}};
test('matching release asset is immutable and retains private-preview headers',async()=>{
 const r=await worker.fetch(new Request('https://gehirn.flofischer.org'+path+'?v='+version),env);
 assert.equal(r.status,200);assert.match(r.headers.get('Cache-Control'),/max-age=31536000, immutable/);assert.match(r.headers.get('X-Robots-Tag'),/noindex/);
 assert.deepEqual(await r.json(),{revision:1});
});
test('unversioned data remains revalidated',async()=>{
 const r=await worker.fetch(new Request('https://gehirn.flofischer.org'+path),env);
 assert.match(r.headers.get('Cache-Control'),/no-cache/);assert.doesNotMatch(r.headers.get('Cache-Control'),/immutable/);
});
test('stale release cannot receive changed bytes under an immutable URL',async()=>{
 const r=await worker.fetch(new Request('https://gehirn.flofischer.org'+path+'?v=stale'),env);
 assert.equal(r.status,409);assert.doesNotMatch(r.headers.get('Cache-Control'),/immutable/);assert.match(await r.text(),/updated/i);
});
test('entry HTML and scripts never inherit asset immutability',async()=>{
 for(const p of ['/games/tools/games.html','/games/tools/js/games/games.js']){
  const r=await worker.fetch(new Request('https://gehirn.flofischer.org'+p+'?v='+version),env);
  assert.doesNotMatch(r.headers.get('Cache-Control'),/immutable/);
 }
});
test('other sites keep their existing path handling',async()=>{
 const r=await worker.fetch(new Request('https://seele.flofischer.org'+path+'?v=stale'),env);assert.equal(r.status,200);
});
