import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../worker/index.js';
const assets = new Map([
 ['/gehirn/projects/index.html', ['<title>Bergwork Projects</title>', 'text/html']],
 ['/gehirn/projects/assets/app.js', ['export const demo=true;', 'text/javascript']],
 ['/gehirn/builder/index.html', ['<title>Builder</title>', 'text/html']],
]);
const env={ASSETS:{async fetch(input){const u=new URL(input instanceof Request ? input.url : String(input)); const v=assets.get(u.pathname);return new Response(v?.[0]??'Not found',{status:v?200:404,headers:{'content-type':v?.[1]??'text/plain'}});}}};
test('Projects HTML is routed as an unlisted uncached prototype',async()=>{
 const r=await worker.fetch(new Request('https://gehirn.flofischer.org/projects/'),env);
 assert.equal(r.status,200);assert.match(await r.text(),/Bergwork Projects/);
 assert.match(r.headers.get('x-robots-tag')??'',/noindex/);
 assert.match(r.headers.get('cache-control')??'',/no-store/);
 assert.equal(r.headers.get('referrer-policy'),'no-referrer');
});
test('Projects nested Vite assets use the same protection',async()=>{
 const r=await worker.fetch(new Request('https://gehirn.flofischer.org/projects/assets/app.js'),env);
 assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/javascript/);
 assert.match(r.headers.get('x-robots-tag')??'',/noindex/);assert.match(r.headers.get('cache-control')??'',/no-store/);
});
test('Projects is excluded from the shared PWA cache',async()=>{
 const text=await readFile(new URL('../sites/shared/pwa-worker.js',import.meta.url),'utf8');
 assert.ok(/const MOCKUPS\s*=\s*\[[^\]]*"projects"/.test(text), "Projects missing from PWA cache exclusion");
});
test('Existing Builder remains available with noindex',async()=>{
 const r=await worker.fetch(new Request('https://gehirn.flofischer.org/builder/'),env);assert.equal(r.status,200);assert.match(r.headers.get('x-robots-tag')??'',/noindex/);
});
