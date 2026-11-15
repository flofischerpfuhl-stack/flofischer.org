import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../worker/index.js';
const assets = new Map([
 ['/gehirn/projects/index.html', ['<title>Bergwork Projects</title>', 'text/html']],
 ['/gehirn/builder/index.html', ['<title>Builder</title>', 'text/html']],
]);
const env={ASSETS:{async fetch(input){const u=new URL(input instanceof Request ? input.url : String(input)); const v=assets.get(u.pathname);return new Response(v?.[0]??'Not found',{status:v?200:404,headers:{'content-type':v?.[1]??'text/plain'}});}}};
test('The old Projects preview redirects to bergwork.app/demo/projects/',async()=>{
 for (const path of ['/projects', '/projects/', '/projects/assets/app.js', '/projects/index.html']) {
  const r=await worker.fetch(new Request(`https://gehirn.flofischer.org${path}`),env);
  assert.equal(r.status,302,path);assert.equal(r.headers.get('location'),'https://bergwork.app/demo/projects/',path);
  assert.match(r.headers.get('x-robots-tag')??'',/noindex/);
 }
});
test('The redirect keeps the query',async()=>{
 const r=await worker.fetch(new Request('https://gehirn.flofischer.org/projects/?seed=neu'),env);
 assert.equal(r.headers.get('location'),'https://bergwork.app/demo/projects/?seed=neu');
});
test('Only gehirn redirects, and only /projects',async()=>{
 const r=await worker.fetch(new Request('https://gehirn.flofischer.org/projectsx/'),env);assert.notEqual(r.status,302);
 const root=await worker.fetch(new Request('https://flofischer.org/projects/'),env);assert.notEqual(root.status,302);
});
test('Projects stays excluded from the shared PWA cache',async()=>{
 const text=await readFile(new URL('../sites/shared/pwa-worker.js',import.meta.url),'utf8');
 assert.ok(/const MOCKUPS\s*=\s*\[[^\]]*"projects"/.test(text), "Projects missing from PWA cache exclusion");
});
test('Existing Builder remains available with noindex',async()=>{
 const r=await worker.fetch(new Request('https://gehirn.flofischer.org/builder/'),env);assert.equal(r.status,200);assert.match(r.headers.get('x-robots-tag')??'',/noindex/);
});
