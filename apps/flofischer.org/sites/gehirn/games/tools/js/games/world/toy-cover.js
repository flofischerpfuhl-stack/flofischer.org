/**
 * A dust sheet thrown over a locked play set on the toy table (Bounce Brigade's counterpart of the cloud bank, same controller): a cream
 * cotton sheet that lies over the set's box with soft humps from the toys beneath, drapes down its sides in real pleats and lies in folds
 * on the table, with a tag and padlock tied to one corner. When the set is unlocked the sheet lifts off, turns and fades.
 */
import { THREE as T } from '../three-kit.js';
import { rng, createNoise, smoothstep } from './decor.js';
import { coverController, shadowTex } from './cloud-bank.js';

const NX = 54, NZ = 46, DRAPE = 3.4, TOP = 4.9;

/** The cloth as a grid over the footprint plus its drape: top height from the box and a few humps, sides falling in pleats. */
function sheetGeometry(seed, hx, hz) {
  const rand = rng(seed * 17 + 3), noise = createNoise(seed + 9), folds = 26 + Math.floor(rand() * 6), phase = rand() * 6, cream = new T.Color('#fffaf0'), shade = new T.Color('#e4d4b6'), cool = new T.Color('#c9c9d2'), tmp = new T.Color();
  const humps = Array.from({ length: 5 }, (_, i) => ({ x: (rand() - 0.5) * hx * (i ? 1.3 : 0.4), z: (rand() - 0.5) * hz * (i ? 1.3 : 0.4), w: 2.5 + rand() * 2.6, h: i ? 0.5 + rand() * 1.4 : 1.6 }));
  const W = hx + DRAPE, D = hz + DRAPE, pos = [], col = [], idx = [];
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    let x = (i / NX - 0.5) * 2 * W, z = (j / NZ - 0.5) * 2 * D;
    const ox = Math.max(Math.abs(x) - hx, 0), oz = Math.max(Math.abs(z) - hz, 0), out = Math.hypot(ox, oz), t = Math.min(1, out / DRAPE);
    let y = TOP * (1 - smoothstep(0, 1, t ** 0.7)) ** 0.85;
    const inside = 1 - smoothstep(0, 6, out);
    for (const h of humps) y += h.h * Math.exp(-((x - h.x) ** 2 + (z - h.z) ** 2) / (h.w * h.w)) * inside;
    y += 0.35 * noise.fbm2(x * 0.22, z * 0.22, 2) * (0.4 + inside);
    const around = Math.atan2(z / D, x / W), pleat = Math.sin(around * folds + phase) * (0.5 + 0.5 * Math.sin(around * 3 + phase)) ;
    if (out > 0.01) { const nx = ox ? Math.sign(x) * ox : 0, nz = oz ? Math.sign(z) * oz : 0, len = Math.hypot(nx, nz) || 1; const amp = smoothstep(0.05, 0.85, t) * 0.55; x += (nx / len) * pleat * amp; z += (nz / len) * pleat * amp; y += Math.max(0, pleat) * 0.25 * smoothstep(0.1, 0.6, t) * (1 - t); }
    pos.push(x, Math.max(0.04, y), z);
    tmp.copy(cream).lerp(shade, smoothstep(-0.6, 0.9, -pleat) * smoothstep(0.1, 0.8, t) * 0.7).lerp(cool, smoothstep(0.55, 1, t) * 0.35 + 0.1 * (1 - smoothstep(0, 5, y))); col.push(tmp.r, tmp.g, tmp.b);
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function tagTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = '#f2b632'; g.beginPath(); g.roundRect(6, 6, 116, 148, 16); g.fill(); g.lineWidth = 7; g.strokeStyle = '#a8761a'; g.stroke();
  g.fillStyle = '#fff4d6'; g.beginPath(); g.arc(64, 30, 9, 0, 6.3); g.fill();
  g.fillStyle = '#3b3f4a'; g.fillRect(38, 84, 52, 44); g.lineWidth = 9; g.strokeStyle = '#3b3f4a'; g.beginPath(); g.arc(64, 84, 18, Math.PI, 0); g.stroke(); g.fillStyle = '#f2b632'; g.beginPath(); g.arc(64, 104, 6, 0, 6.3); g.fill();
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}

/** hx, hz: half extents of the set underneath (or radius: a round set of that size); level: the table top the set stands on. */
export function createToyCover({ hx = 0, hz = 0, radius = 30, seed = 1, level = 0, shadowY = 0.4 } = {}) {
  hx ||= radius * 0.4; hz ||= radius * 0.35;
  const group = new T.Group(); group.name = 'DustSheet';
  const geometry = sheetGeometry(seed, hx, hz), material = new T.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: true, side: T.DoubleSide });
  const mesh = new T.Mesh(geometry, material); mesh.renderOrder = 3; mesh.frustumCulled = false; mesh.castShadow = true; group.add(mesh);
  const tagMap = tagTexture(), tagMaterial = new T.MeshBasicMaterial({ map: tagMap, transparent: true, toneMapped: false, side: T.DoubleSide }), tag = new T.Mesh(new T.PlaneGeometry(3.4, 4.2), tagMaterial);
  tag.position.set(hx + 1.6, 3.4, hz + 1.8); tag.rotation.y = Math.PI / 4; tag.renderOrder = 4; mesh.add(tag);
  const shadowMaterial = new T.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, toneMapped: false, fog: false });
  const shadow = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shadowMaterial); shadow.position.y = shadowY; shadow.renderOrder = -1; shadow.frustumCulled = false; group.add(shadow);
  const span = Math.max(hx, hz);
  function layout(time, { open, fade, cover }) {
    const k = 1 - 0.25 * open, grow = 0.6 + 0.4 * Math.min(1, cover * 1.4);
    material.opacity = Math.max(0, Math.min(1, cover)) * fade; tagMaterial.opacity = material.opacity; shadowMaterial.opacity = material.opacity * 0.6;
    mesh.position.set(0, level + open * span * 1.4 + Math.sin(time * 0.7 + seed) * 0.12, 0);
    mesh.rotation.set(open * 0.35, open * 1.1, open * -0.3);
    mesh.scale.set(k * grow, grow, k * grow);
    shadow.scale.set((hx + DRAPE) * (2.3 + open), 1, (hz + DRAPE) * (2.3 + open)); shadow.position.y = level + 0.08;
  }
  return Object.assign(coverController(group, layout), { mesh, dispose() { group.removeFromParent(); geometry.dispose(); material.dispose(); tag.geometry.dispose(); tagMaterial.dispose(); tagMap.dispose(); shadow.geometry.dispose(); shadowMaterial.dispose(); } });
}
