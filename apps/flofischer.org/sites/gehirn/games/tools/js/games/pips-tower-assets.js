/** Pip presentation adapters. The simulation remains authoritative for every position and opening. */
import { THREE as T } from "./three-kit.js";

export const BX = (x) => x - 180,
  BY = (y) => 320 - y;
export const GOLEMS = [
  "MOSS_HEX_GOLEM",
  "SAND_HEX_GOLEM",
  "FROST_HEX_GOLEM",
  "EMBER_HEX_GOLEM",
];
export const ENEMIES = {
  zorbling: "WAX_KLONK",
  klonkbot: "KLONKBOT",
  buzzbot: "BUZZ_DRONE",
};
const Z = new T.Vector3(0, 0, 1),
  Y = new T.Vector3(0, 1, 0),
  X = new T.Vector3(1, 0, 0);
const v = new T.Vector3();
const pinBasis = new T.Matrix4(), pinSide = new T.Vector3();
export const clamp01 = (n) => Math.max(0, Math.min(1, n));

export function named(root, name) {
  const node = root.getObjectByName(name);
  if (!node) throw new Error(`Pip asset is missing its authored node: ${name}`);
  return node;
}

/** An instance owns transforms, mixer, skeletons and explicitly cloned local materials. */
export class TowerActor {
  constructor(handle, scale = 1) {
    this.handle = handle;
    this.root = new T.Group();
    this.root.name = `PipActor_${handle.id}`;
    this.root.scale.setScalar(scale);
    this.root.add(handle.scene);
    this.scale = scale;
    this.clips = new Map(handle.animations.map((clip) => [clip.name, clip]));
    this.mixer = this.clips.size ? new T.AnimationMixer(handle.scene) : null;
    this.materials = new Set();
    this.deadAt = null;
    this.state = "";
    handle.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
        o.frustumCulled = false;
      }
    });
  }
  pose(name, time, loop = true) {
    if (!this.mixer) return;
    const clip = this.clips.get(name);
    if (!clip) throw new Error(`${this.handle.id}: missing animation ${name}`);
    if (this.state !== name) {
      this.mixer.stopAllAction();
      this.action = this.mixer
        .clipAction(clip)
        .reset()
        .setLoop(loop ? T.LoopRepeat : T.LoopOnce, loop ? Infinity : 1);
      this.action.clampWhenFinished = true;
      this.action.play();
      this.state = name;
    }
    this.action.enabled = true;
    this.action.paused = false;
    this.action.time = loop
      ? Math.max(0, time) % clip.duration
      : Math.min(clip.duration, Math.max(0, time));
    this.mixer.update(0);
  }
  material(predicate) {
    const copies = new Map();
    this.handle.scene.traverse((o) => {
      if (!o.material) return;
      const clone = (m) => {
        if (!predicate(m, o)) return m;
        if (!copies.has(m)) {
          const c = m.clone();
          copies.set(m, c);
          this.materials.add(c);
        }
        return copies.get(m);
      };
      o.material = Array.isArray(o.material)
        ? o.material.map(clone)
        : clone(o.material);
    });
    return [...copies.values()];
  }
  place(x, feetY, z = 0, yaw = 0.16) {
    this.root.position.set(BX(x), BY(feetY), z);
    this.root.rotation.y = yaw;
  }
  dispose() {
    this.mixer?.stopAllAction();
    this.mixer?.uncacheRoot(this.handle.scene);
    this.root.removeFromParent();
    this.handle.release();
    for (const m of this.materials) m.dispose();
  }
}

export function pinTransform(root, pin) {
  // Native +Z points from the grip towards the tip; the board's segment is tip -> grip.
  // B is the old control end, not the authored collar. Match the actual PullAxis
  // to B + 12, preserving its touch target and keeping edge grips on a phone.
  const inset = -named(root, "PullAxis").position.z * 50 - 12;
  // The authored eye lies in the YZ plane. Aligning only the shaft leaves
  // vertical pins edge-on, hiding their pulling ring. Keep its normal toward
  // the board camera while preserving the shaft and both authored anchors.
  root.quaternion.setFromRotationMatrix(pinBasis.makeBasis(
    Z, pinSide.set(pin.dy, pin.dx, 0), v.set(-pin.dx, pin.dy, 0),
  ));
  root.position.set(
    BX(pin.bx + pin.dx * (pin.off - inset)),
    BY(pin.by + pin.dy * (pin.off - inset)),
    0,
  );
  root.scale.setScalar(50); // native .1m shaft radius = original five board pixels
  named(root, "ShaftStretch").scale.z = (pin.len - inset) / 100;
  root.visible = pin.state !== "out";
  return inset;
}

export function socketTransform(root, pin, inset) {
  root.quaternion.setFromUnitVectors(Z, v.set(-pin.dx, pin.dy, 0));
  root.position.set(
    BX(pin.bx - pin.dx * inset),
    BY(pin.by - pin.dy * inset),
    0,
  );
  root.scale.setScalar(50);
}

/** Authored leaf as a thin vault hatch: its Y hinge is perpendicular to the board segment.
 * With limited depth, cos(angle) projects exactly to the simulation's remaining segment length.
 */
export function doorTransform(actor, d, fraction) {
  const root = actor.root,
    leaf = named(actor.handle.scene, "DoorPivot");
  const ex = d.x2 ?? d.bx,
    ey = d.y2 ?? d.by;
  const angle = -Math.atan2(ey - d.ay, ex - d.ax),
    len = Math.hypot(ex - d.ax, ey - d.ay);
  root.scale.set(len / 1.55, 6, 8);
  root.rotation.set(0, 0, angle);
  const anchor = v
    .copy(leaf.position)
    .multiply(root.scale)
    .applyAxisAngle(Z, angle);
  root.position.set(BX(d.ax) - anchor.x, BY(d.ay) - anchor.y, -anchor.z);
  leaf.quaternion.setFromAxisAngle(Y, -Math.acos(1 - clamp01(fraction)));
  leaf.visible = fraction < 0.999;
}

/** A moving platform may have a central fulcrum. Keep the authored hinge fixed on lv.pv,
 * and offset only its deck beneath the same pivot, preserving the level's exact endpoints.
 */
export function configureFlap(actor, lv) {
  const scene = actor.handle.scene,
    hinge = named(scene, "FlapPivot");
  const deck = named(scene, "FlapPivot_Mesh");
  const [ax, ay, bx, by] = lv.base,
    len = Math.hypot(bx - ax, by - ay);
  const dx = (bx - ax) / len,
    dy = (by - ay) / len;
  const along = (lv.pv[0] - ax) * dx + (lv.pv[1] - ay) * dy;
  actor.root.scale.set(len / 1.58, 65, 32);
  actor.baseAngle = -Math.atan2(by - ay, bx - ax);
  actor.hinge = hinge;
  // Top is .05m above hinge. Shift to keep the collision segment at deck mid-thickness.
  deck.position.x -= along / actor.root.scale.x;
  named(scene, "FlapTip").position.x -= along / actor.root.scale.x;
  actor.root.rotation.z = actor.baseAngle;
  const offset = v
    .copy(hinge.position)
    .multiply(actor.root.scale)
    .applyAxisAngle(Z, actor.baseAngle);
  actor.root.position.set(BX(lv.pv[0]) - offset.x, BY(lv.pv[1]) - offset.y, 0);
  // The native back-mounted bearing remains static, centered on the real fulcrum.
  actor.deck = deck;
  actor.length = len;
}

export function updateFlap(actor, lv) {
  // Nonuniform scale must follow rotation, so use the actual world endpoints to orient the deck.
  // Rotate in board space via an unscaled parent and countertransform the static bearing.
  const hinge = actor.hinge;
  const sx = actor.root.scale.x,
    sy = actor.root.scale.y;
  const c = Math.cos(-lv.ang),
    s = Math.sin(-lv.ang);
  hinge.matrixAutoUpdate = false;
  hinge.matrix.set(
    c,
    (-s * sy) / sx,
    0,
    hinge.position.x,
    (s * sx) / sy,
    c,
    0,
    hinge.position.y,
    0,
    0,
    1,
    hinge.position.z,
    0,
    0,
    0,
    1,
  );
}

export function leverTransform(actor, lv) {
  actor.root.position.set(BX(lv.at[0]), BY(lv.at[1]) - 12, 22);
  actor.root.scale.setScalar(23);
  actor.root.quaternion.setFromAxisAngle(Y, Math.PI / 2);
  named(actor.handle.scene, "LeverPivot").quaternion.setFromAxisAngle(
    X,
    (Math.PI / 3) * (lv.turn ? lv.ang / lv.turn : 0),
  );
}
