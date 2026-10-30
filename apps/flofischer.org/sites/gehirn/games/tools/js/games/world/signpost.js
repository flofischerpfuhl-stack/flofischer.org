/**
 * A real signpost standing at a fixed spot beside a region: two posts and a board with the region's name and its stars (or a padlock).
 * It is part of the world, so it never moves with the camera; it faces the map's default viewing direction.
 */
import { THREE as T } from '../three-kit.js';

const BOARD = [9, 3.1];

function face(name, line, { locked, here, look }) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 176;
  const g = c.getContext('2d'), board = locked ? look.locked : look.board, rim = here ? '#ffd23f' : locked ? look.lockedRim : look.rim, round = look.shape === 'block' ? 14 : look.shape === 'slate' ? 10 : 26;
  g.fillStyle = board; g.fillRect(0, 0, 512, 176);
  g.lineWidth = here ? 14 : 9; g.strokeStyle = rim; g.beginPath(); g.roundRect(9, 9, 494, 158, round); g.stroke();
  g.fillStyle = look.text; g.textAlign = 'center'; g.textBaseline = 'middle';
  let x = 256;
  g.font = '800 64px system-ui, sans-serif';
  if (locked) { const w = Math.min(380, g.measureText(name).width), lx = 256 - (w + 54) / 2; x = lx + 54 + w / 2; g.fillRect(lx, 56, 36, 30); g.lineWidth = 6; g.strokeStyle = look.text; g.beginPath(); g.arc(lx + 18, 56, 11, Math.PI, 0); g.stroke(); }
  g.fillText(name, x, 70, 420);
  g.font = '700 40px system-ui, sans-serif'; g.fillStyle = locked ? '#dbe6ef' : look.sub; g.fillText(line, 256, 128, 420);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function createSignpost({ look, scale = 0.85, foot = null }) {
  const group = new T.Group(); group.name = 'Signpost'; group.rotation.y = Math.PI / 4;
  const wood = new T.MeshStandardMaterial({ color: new T.Color(look.board).multiplyScalar(0.62), roughness: 0.9 }), trim = new T.MeshStandardMaterial({ color: look.rim, roughness: 0.7 });
  const faceMaterial = new T.MeshBasicMaterial({ toneMapped: false }), sideMaterial = new T.MeshStandardMaterial({ color: look.board, roughness: 0.85 });
  const [w, h] = BOARD, boardMesh = new T.Mesh(new T.BoxGeometry(w, h, 0.35), [sideMaterial, sideMaterial, sideMaterial, sideMaterial, faceMaterial, sideMaterial]);
  boardMesh.position.y = 1.7 + h / 2; boardMesh.castShadow = true;
  const cap = new T.Mesh(new T.BoxGeometry(w + 0.5, 0.3, 0.6), trim); cap.position.y = 1.7 + h + 0.12;
  group.add(boardMesh, cap);
  for (const s of [-1, 1]) { const post = new T.Mesh(new T.CylinderGeometry(0.22, 0.3, 2.4, 8), wood); post.position.set(s * (w / 2 - 0.9), 1.2, -0.05); post.castShadow = true; group.add(post); }
  if (foot) group.add(foot);
  group.scale.setScalar(scale);
  let key = '', texture = null;
  return {
    group, hit: boardMesh, foot,
    set(name, line, state) {
      const next = `${name}|${line}|${state.locked}|${state.here}`; if (next === key) return; key = next;
      texture?.dispose(); texture = face(name, line, { ...state, look }); faceMaterial.map = texture; faceMaterial.needsUpdate = true;
    },
    dispose() { texture?.dispose(); group.removeFromParent(); boardMesh.geometry.dispose(); cap.geometry.dispose(); for (const m of [wood, trim, faceMaterial, sideMaterial]) m.dispose(); group.traverse((o) => { if (o.geometry && o !== boardMesh && o !== cap) o.geometry.dispose(); }); },
  };
}
