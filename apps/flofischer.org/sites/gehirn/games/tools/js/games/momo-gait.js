/** Arena presentation only: a procedural biped gait baked into keyframes on top of the shipped rig.
 * The shipped Locomotion clip of the upright forms swings the legs about 0.2 m while the Fernling covers 4 m per cycle, so the feet skate.
 * Here every foot is placed by two-bone IK: it plants and moves back at exactly the ground speed (one cycle = STRIDE_NATIVE metres),
 * swings forward with a lifted knee, the hips sway over the stance leg, bob twice per cycle, lean into the run, the arms counter-swing
 * and the tail follows. The result replaces Locomotion (and adds TurnStep) in the actor's clip list, so the hero and the baked crowd share it. */
import { THREE } from './three-kit.js';
import { STRIDE_NATIVE } from './momo-motion.js';

export const BIPEDS = Object.freeze(['EMBERWARD', 'GROVEPRINCE', 'SPRAYCOUNT']);
const SAMPLES = 48, DUTY = 0.38, STEP_PER_LEG = 1.3;
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const rig = (scene, side) => {
  const g = n => scene.getObjectByName(n), pick = (...n) => n.map(g).find(Boolean);
  return {
    root: g('root'), spine: g('spine'), head: g('head'), tailA: g('tail_base'), tailB: g('tail_tip'),
    leg: pick(`leg_${side}_upper`, `hind_${side}_upper`) && { u: pick(`leg_${side}_upper`, `hind_${side}_upper`), l: pick(`leg_${side}_lower`, `hind_${side}_lower`), f: pick(`leg_${side}_paw`, `hind_${side}_foot`) },
    arm: { u: pick(`arm_${side}_upper`, `fore_${side}_upper`), l: pick(`arm_${side}_lower`, `fore_${side}_lower`), small: !g(`arm_${side}_upper`) },
  };
};

class Gait {
  constructor(scene, id) {
    this.scene = scene; this.id = id;
    this.R = rig(scene, 'L'); this.Rr = rig(scene, 'R'); this.sides = [{ ...this.R, sign: 1 }, { ...this.Rr, sign: -1 }];
    this.bones = []; scene.traverse(o => { if (o.isBone) this.bones.push(o); });
    this.bind = this.bones.map(b => ({ p: b.position.clone(), q: b.quaternion.clone() }));
    scene.updateMatrixWorld(true);
    this.q1 = new THREE.Quaternion(); this.q2 = new THREE.Quaternion(); this.q3 = new THREE.Quaternion(); this.v1 = new THREE.Vector3(); this.v2 = new THREE.Vector3(); this.v3 = new THREE.Vector3();
    for (const s of this.sides) {
      const w = o => o.getWorldPosition(new THREE.Vector3());
      s.hip = w(s.leg.u); s.knee = w(s.leg.l); s.foot = w(s.leg.f); s.l1 = s.hip.distanceTo(s.knee); s.l2 = s.knee.distanceTo(s.foot);
      const line = s.foot.clone().sub(s.hip).normalize(), off = s.knee.clone().sub(s.hip); off.addScaledVector(line, -off.dot(line));
      s.pole = off.length() > 0.02 ? off.normalize() : Z.clone(); s.footQ = s.leg.f.getWorldQuaternion(new THREE.Quaternion());
    }
    this.legLen = this.sides[0].l1 + this.sides[0].l2; this.hipY = this.sides[0].hip.y; this.ground = this.sides[0].foot.y;
    this.stepLen = STEP_PER_LEG * this.legLen;
  }
  reset() { this.bones.forEach((b, i) => { b.position.copy(this.bind[i].p); b.quaternion.copy(this.bind[i].q); }); this.scene.updateMatrixWorld(true); }
  rotate(bone, axis, angle) {
    if (!bone || !angle) return;
    bone.getWorldQuaternion(this.q1).premultiply(this.q2.setFromAxisAngle(axis, angle));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(this.q3).invert().multiply(this.q1)); bone.updateMatrixWorld(true);
  }
  setWorldQuat(bone, q) { bone.quaternion.copy(bone.parent.getWorldQuaternion(this.q3).invert().multiply(q)); bone.updateMatrixWorld(true); }
  translate(bone, d) { bone.position.add(this.v3.copy(d).applyQuaternion(bone.parent.getWorldQuaternion(this.q3).invert())); bone.updateMatrixWorld(true); }
  // Two-bone IK in world space: bend plane is given by the bind-pose knee direction.
  solve(s, target) {
    const H = s.leg.u.getWorldPosition(this.v1).clone(), l1 = s.l1, l2 = s.l2, to = target.clone().sub(H), d = to.length();
    to.multiplyScalar(1 / d); const dc = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, d)), a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const pole = s.pole.clone(); pole.addScaledVector(to, -pole.dot(to)); if (pole.lengthSq() < 1e-6) pole.copy(Z); pole.normalize();
    const K2 = H.clone().addScaledVector(to, a).addScaledVector(pole, h), T2 = H.clone().addScaledVector(to, dc);
    const K = s.leg.l.getWorldPosition(this.v2).clone();
    this.rotateBetween(s.leg.u, K.sub(H), K2.clone().sub(H));
    const K3 = s.leg.l.getWorldPosition(this.v2).clone(), F = s.leg.f.getWorldPosition(this.v1).clone();
    this.rotateBetween(s.leg.l, F.sub(K3), T2.clone().sub(K3));
  }
  rotateBetween(bone, from, to) {
    this.q2.setFromUnitVectors(from.normalize(), to.normalize());
    bone.getWorldQuaternion(this.q1).premultiply(this.q2);
    bone.quaternion.copy(bone.parent.getWorldQuaternion(this.q3).invert().multiply(this.q1)); bone.updateMatrixWorld(true);
  }
  foot(s, f, p) {
    const stroke = p.stroke, zc = s.foot.z, d = p.duty;
    let z, lift = 0, pitch = 0;
    if (f < d) { z = stroke * (0.5 - f / d); pitch = 0.5 * ss(0.65, 1, f / d); }
    else { const u = (f - d) / (1 - d); z = stroke * (-0.5 + u - Math.sin(Math.PI * 2 * u) / (Math.PI * 2)); lift = p.lift * Math.sin(Math.PI * Math.pow(u, 0.8)); pitch = 0.5 * (1 - ss(0, 0.45, u)) - 0.22 * ss(0.5, 0.9, u) * (1 - ss(0.9, 1, u)); }
    return { z: zc + z, y: s.foot.y + lift, x: s.foot.x + s.sign * p.out * Math.sin(Math.PI * Math.min(1, Math.max(0, (f - d) / (1 - d)))) * (f >= d ? 1 : 0), pitch, swing: f >= d };
  }
  // One pose of the cycle at phase ph (0..1). Left foot lands at ph = 0.
  pose(ph, p, hipDrop = null) {
    this.reset();
    const { root, spine, head, tailA, tailB } = this.R, t = Math.PI * 2 * ph;
    const stanceDepth = Math.max(...this.sides.map((s, i) => { const f = (ph + i * 0.5) % 1; return f < p.duty ? Math.sin(Math.PI * f / p.duty) : 0; }));
    // weight shift over the stance leg, hip roll, torso lean and counter-twist
    const sway = Math.cos(t - Math.PI * p.duty) * p.sway; this.translate(root, this.v2.set(sway, 0, 0));
    this.rotate(spine, X, p.lean); this.rotate(spine, Z, p.roll * sway / (p.sway || 1)); this.rotate(spine, Y, p.twist * Math.sin(t));
    this.rotate(head, Y, -0.6 * p.twist * Math.sin(t)); this.rotate(head, X, -0.5 * p.lean);
    this.rotate(this.R.tailA, Y, p.tail * Math.sin(t + 0.5)); this.rotate(tailB, Y, p.tail * 1.3 * Math.sin(t + 1.5)); this.rotate(tailA, X, 0.15 * Math.sin(2 * t));
    for (const s of this.sides) {
      if (!s.arm.u) continue;
      const swing = p.arm * Math.cos(t) * s.sign * (s.arm.small ? 0.7 : 1);
      this.rotate(s.arm.u, X, swing); this.rotate(s.arm.l, X, -(p.elbow - 0.3 * swing / p.arm));
    }
    // feet targets and the hip height that keeps both legs within reach
    const targets = this.sides.map((s, i) => this.foot(s, (ph + i * 0.5) % 1, p));
    let y = p.bounce * (1 - stanceDepth) - p.dip * stanceDepth;
    if (hipDrop) y = hipDrop;
    else {
      let lim = Infinity;
      this.sides.forEach((s, i) => { const H = s.leg.u.getWorldPosition(new THREE.Vector3()), tg = targets[i], dx = H.x - tg.x, dz = H.z - tg.z, reach = (s.l1 + s.l2) * 0.98; lim = Math.min(lim, tg.y + Math.sqrt(Math.max(0, reach * reach - dx * dx - dz * dz)) - H.y); });
      y = Math.min(y, lim);
    }
    this.translate(root, this.v2.set(0, y, 0));
    this.sides.forEach((s, i) => {
      const tg = targets[i]; this.solve(s, this.v2.set(tg.x, tg.y, tg.z).clone());
      this.setWorldQuat(s.leg.f, this.q1.setFromAxisAngle(X, tg.pitch).multiply(s.footQ).clone());
    });
    return y;
  }
  clip(name, duration, original, p) {
    const raw = []; for (let i = 0; i < SAMPLES; i++) raw.push(this.pose(i / SAMPLES, p));
    const sm = raw.map((_, i) => (raw[(i + SAMPLES - 1) % SAMPLES] + 2 * raw[i] + raw[(i + 1) % SAMPLES]) / 4);
    const sm2 = sm.map((_, i) => (sm[(i + SAMPLES - 1) % SAMPLES] + 2 * sm[i] + sm[(i + 1) % SAMPLES]) / 4);
    const touched = new Set(this.bones.filter(b => /^(root|pelvis|spine|head|tail_|arm_|leg_|fore_|hind_)/.test(b.name)).map(b => b.name));
    const times = [], data = new Map(); for (const n of touched) data.set(n, []);
    for (let i = 0; i <= SAMPLES; i++) {
      this.pose((i % SAMPLES) / SAMPLES, p, sm2[i % SAMPLES]); times.push(i / SAMPLES * duration);
      for (const b of this.bones) if (touched.has(b.name)) data.get(b.name).push(b.position.toArray(), b.quaternion.toArray());
    }
    const tracks = original.tracks.filter(t => !touched.has(t.name.split('.')[0]));
    for (const b of this.bones) {
      if (!touched.has(b.name)) continue;
      const d = data.get(b.name); tracks.push(new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, d.filter((_, k) => k % 2).flat()));
      if (b.name === 'root') tracks.push(new THREE.VectorKeyframeTrack('root.position', times, d.filter((_, k) => !(k % 2)).flat()));
    }
    this.reset();
    return new THREE.AnimationClip(name, duration, tracks);
  }
}

/** Returns the actor's animations with Locomotion replaced by the planted-foot run and a TurnStep clip added. */
export function bipedAnimations(scene, animations, id) {
  if (!BIPEDS.includes(id) || !scene.getObjectByName('leg_L_upper') && !scene.getObjectByName('hind_L_upper')) return animations;
  const g = new Gait(scene, id), loco = animations.find(c => c.name === 'Locomotion'), cycle = STRIDE_NATIVE[id], L = g.legLen;
  const run = { duty: DUTY, stroke: DUTY * cycle, lift: 0.34 * L, out: 0.02 * L, sway: 0.05 * L, roll: 0.05, lean: 0.14, twist: 0.1, tail: 0.28, arm: 0.6, elbow: 0.8, bounce: 0.02 * L, dip: 0.06 * L };
  const turn = { duty: 0.5, stroke: 0.1 * L, lift: 0.2 * L, out: 0.05 * L, sway: 0.04 * L, roll: 0.06, lean: 0.02, twist: 0.12, tail: 0.2, arm: 0.12, elbow: 0.3, bounce: 0, dip: 0.04 * L };
  const out = animations.filter(c => c.name !== 'Locomotion' && c.name !== 'TurnStep');
  out.push(g.clip('Locomotion', loco.duration, loco, run), g.clip('TurnStep', 0.8, loco, turn));
  return out;
}
