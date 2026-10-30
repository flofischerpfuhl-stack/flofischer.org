// Builds the reduced world-map twin of every authored region: node tools/games-assets/worldmap/build-far.mjs
// Needs gltfpack (GLTFPACK=<path>, default: npx gltfpack). Output: <family>/<region>.far.glb next to this file, plus index.json.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), fernworld = join(here, '../fernworld');
const catalog = JSON.parse(readFileSync(join(fernworld, 'environments/catalog.json'), 'utf8'));
const bin = process.env.GLTFPACK ?? 'npx', pre = process.env.GLTFPACK ? [] : ['--yes', 'gltfpack'];
const RATIO = Number(process.env.RATIO ?? 0.07), index = {};
for (const family of catalog.families) {
  mkdirSync(join(here, family.id), { recursive: true });
  for (const region of family.regions) {
    const out = `${family.id}/${region.region}.far.glb`;
    execFileSync(bin, [...pre, '-i', join(fernworld, region.file), '-o', join(here, out), '-cc', '-kn', '-km', '-si', String(RATIO), '-sa', '-vp', '12', '-vn', '8', '-vc', '8'], { stdio: ['ignore', 'ignore', 'ignore'] });
    (index[family.id] ??= {})[region.region] = { file: out, bytes: statSync(join(here, out)).size };
  }
}
writeFileSync(join(here, 'index.json'), JSON.stringify(index, null, 1) + '\n');
console.log(Object.values(index).flatMap(Object.values).reduce((n, e) => n + e.bytes, 0), 'bytes');
