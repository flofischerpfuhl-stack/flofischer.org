import assert from 'node:assert/strict';
import test from 'node:test';
import {gzipSync,gunzipSync} from 'node:zlib';
import worker from '../worker/index.js';

const raw=Buffer.from('glTF\0lossless animated model fixture\0');
const zipped=gzipSync(raw);
const path='/games/tools/games-assets/fernworld/environments/rangers/viridis.glb';
function fixture({gzipMissing=false}={}){
 const calls=[];
 return {calls,env:{ASSETS:{async fetch(input){
  const request=input instanceof Request?input:new Request(input);const url=new URL(request.url);calls.push(request);
  if(url.pathname.endsWith('.glb.gz')){
   if(gzipMissing)return new Response('missing',{status:404});
   if(request.headers.get('If-None-Match')==='"gzip-v1"')return new Response(null,{status:304,headers:{ETag:'"gzip-v1"'}});
   return new Response(request.method==='HEAD'?null:zipped,{headers:{'Content-Type':'application/gzip','Content-Length':String(zipped.length),ETag:'"gzip-v1"','Accept-Ranges':'bytes'}});
  }
  if(url.pathname.endsWith('.glb'))return new Response(raw,{headers:{'Content-Type':'model/gltf-binary'}});
  return new Response('missing',{status:404});
 }}}};
}
function request(encoding='gzip',extra={}){return new Request('https://gehirn.flofischer.org'+path,{headers:{'Accept-Encoding':encoding,...extra}})}

test('game models stream one lossless gzip representation with preview headers',async()=>{
 const f=fixture(),res=await worker.fetch(request(),f.env);
 assert.equal(res.status,200);assert.equal(f.calls.length,1);assert.ok(f.calls[0].url.endsWith(path+'.gz'));
 assert.deepEqual(gunzipSync(Buffer.from(await res.arrayBuffer())),raw);
 assert.equal(res.headers.get('Content-Encoding'),'gzip');assert.equal(res.headers.get('Content-Type'),'model/gltf-binary');
 assert.equal(res.headers.get('Vary'),'Accept-Encoding');assert.match(res.headers.get('X-Robots-Tag'),/noindex/);
 assert.match(res.headers.get('Cache-Control'),/no-cache/);assert.match(res.headers.get('Cache-Control'),/no-transform/);
 assert.equal(res.headers.get('Referrer-Policy'),'no-referrer');assert.equal(res.headers.get('Accept-Ranges'),null);
});
for(const encoding of ['identity','gzip;q=0, *;q=1','br'])test('uncompressed fallback respects '+encoding,async()=>{
 const f=fixture(),res=await worker.fetch(request(encoding),f.env);
 assert.deepEqual(Buffer.from(await res.arrayBuffer()),raw);assert.ok(f.calls.every(r=>!r.url.endsWith('.gz')));
});
test('original client encoding takes precedence over Cloudflare normalization',async()=>{
 const f=fixture(),req=request();Object.defineProperty(req,'cf',{value:{clientAcceptEncoding:'identity'}});
 const res=await worker.fetch(req,f.env);assert.deepEqual(Buffer.from(await res.arrayBuffer()),raw);assert.ok(f.calls.every(r=>!r.url.endsWith('.gz')));
});
test('a missing compressed companion falls back to the original GLB',async()=>{
 const f=fixture({gzipMissing:true}),res=await worker.fetch(request(),f.env);
 assert.deepEqual(Buffer.from(await res.arrayBuffer()),raw);assert.equal(res.headers.get('Content-Encoding'),null);
});
test('conditional GET forwards validators and preserves a bodyless304',async()=>{
 const f=fixture(),res=await worker.fetch(request('gzip',{'If-None-Match':'"gzip-v1"'}),f.env);
 assert.equal(res.status,304);assert.equal((await res.arrayBuffer()).byteLength,0);assert.equal(f.calls.length,1);
});
test('HEAD keeps compressed length and returns no model body',async()=>{
 const f=fixture(),req=new Request('https://gehirn.flofischer.org'+path,{method:'HEAD',headers:{'Accept-Encoding':'gzip'}}),res=await worker.fetch(req,f.env);
 assert.equal((await res.arrayBuffer()).byteLength,0);assert.equal(res.headers.get('Content-Length'),String(zipped.length));assert.equal(f.calls[0].method,'HEAD');
});
test('other sites do not enter the game model route',async()=>{
 const f=fixture(),res=await worker.fetch(new Request('https://seele.flofischer.org'+path,{headers:{'Accept-Encoding':'gzip'}}),f.env);
 assert.deepEqual(Buffer.from(await res.arrayBuffer()),raw);assert.ok(f.calls.every(r=>!r.url.endsWith('.gz')));
});
