/** Preparation-only adapters for the delivered Duck/Klonk/mobile motion contracts.
 * No game imports. Sample an exclusively owned clone, never the source/template.
 * Tracks bind by unique names (root by empty path), so cloned actors also work.
 * Full-state clips reset all controlled TRS. Do not layer them without track masks.
 */
import * as T from 'three';

const TAU = Math.PI * 2, RAD = Math.PI / 180;
const TRS = ['position', 'quaternion', 'scale'];
const AXES = { X: new T.Vector3(1, 0, 0), Y: new T.Vector3(0, 1, 0), Z: new T.Vector3(0, 0, 1) };
const MOBILE_NODES = {
  DARTER: ['DARTER_Root', 'Suspension', 'BodyBank', 'Skate_L', 'Skate_R', 'ProjectionArm'],
  BUZZ_DRONE: ['BUZZ_DRONE_Root', 'FlightTilt', 'Rotor_L', 'Rotor_R', 'OpticGimbal', 'ProjectionNozzle'],
};

function finite(n, label) {
  if (!Number.isFinite(n)) throw new Error(`Invalid ${label}`);
  return n;
}
function named(root, name) {
  const matches = [];
  root.traverse(node => { if (node.name === name) matches.push(node); });
  if (matches.length !== 1 || !/^[A-Za-z_][\w-]*$/.test(name)) throw new Error(`Ambiguous or missing motion node ${name}`);
  return matches[0];
}
function state(node) { return Object.fromEntries(TRS.map(key => [key, node[key].clone()])); }
function restore(bind) {
  for (const [node, values] of bind) for (const key of TRS) node[key].copy(values[key]);
}
function quaternion(degrees) {
  if (!Array.isArray(degrees) || degrees.length !== 3 || !degrees.every(Number.isFinite)) throw new Error('Invalid Euler angles');
  return new T.Quaternion().setFromEuler(new T.Euler(...degrees.map(n => n * RAD), 'XYZ'));
}
function scalarKeys(times, values, time) {
  if (time <= times[0]) return values[0];
  for (let i = 1; i < times.length; i++) if (time <= times[i]) {
    const u = (time - times[i - 1]) / (times[i] - times[i - 1]);
    return values[i - 1] + (values[i] - values[i - 1]) * u;
  }
  return values.at(-1);
}
function keyTimes(times, duration, label) {
  if (!Array.isArray(times) || times.length < 2 || times.some((t, i) => !Number.isFinite(t) || t < 0 || t > duration + 1e-7 || (i && t <= times[i - 1]))) {
    throw new Error(`Invalid keys ${label}`);
  }
  return times;
}

function sampler(root, names, fps, { includeRoot = true } = {}) {
  if (!(fps >= 24 && fps <= 120) || !Number.isFinite(fps)) throw new Error('Sampling fps must be 24..120');
  // Validate before cloning: ambiguous source names must not silently pick a node.
  names.forEach(name => named(root, name));
  const copy = root.clone(true), controlled = [...(includeRoot ? [copy] : []), ...names.map(name => named(copy, name))];
  const bind = new Map(controlled.map(node => [node, state(node)]));
  const nodes = Object.fromEntries(names.map(name => [name, named(copy, name)]));
  function clip(name, duration, loop, pose, exactTimes = [], metadata = {}) {
    if (!(duration > 0) || !Number.isFinite(duration)) throw new Error(`Invalid duration ${name}`);
    const steps = Math.ceil(duration * fps);
    // KeyframeTrack stores Float32 time. Distinct JS doubles may become the same
    // key after conversion (e.g. .14 versus 0.13999999999999999).
    const times = [...new Set([0, duration, ...Array.from({ length: steps + 1 }, (_, i) => i * duration / steps), ...exactTimes].map(Math.fround))].sort((a, b) => a - b);
    keyTimes(times, duration, name);
    const values = new Map(controlled.map(node => [node, { position: [], quaternion: [], scale: [] }]));
    for (const time of times) {
      restore(bind); pose(time); copy.updateMatrixWorld(true);
      for (const node of controlled) for (const key of TRS) {
        const v = node[key].toArray();
        if (!v.every(Number.isFinite)) throw new Error(`Nonfinite pose ${name}/${node.name}`);
        if (key === 'quaternion' && Math.abs(Math.hypot(...v) - 1) > 1e-5) throw new Error(`Nonunit pose ${name}/${node.name}`);
        values.get(node)[key].push(...v);
      }
    }
    const tracks = [];
    for (const node of controlled) for (const key of TRS) {
      const Track = key === 'quaternion' ? T.QuaternionKeyframeTrack : T.VectorKeyframeTrack;
      tracks.push(new Track(`${node === copy ? '' : node.name}.${key}`, times, values.get(node)[key]));
    }
    restore(bind);
    const result = new T.AnimationClip(name, duration, tracks);
    result.userData = { loop, inPlace: true, sampledFps: fps, completeControlledState: true, ...metadata };
    return result;
  }
  return { copy, nodes, bind, clip };
}

function duckClips(root, recipe, { fps }) {
  if (recipe.asset !== 'DUCK_LEGIONARY' || recipe.rotation_units !== 'degrees, intrinsic XYZ in author Y-up coordinates') throw new Error('Unsupported Duck motion basis');
  const names = ['body', 'armL', 'armR', 'legL', 'legR'];
  if (JSON.stringify(recipe.channels) !== JSON.stringify(names)) throw new Error('Unexpected Duck channels');
  const { copy, nodes, bind, clip } = sampler(root, names, fps);
  const rootRest = bind.get(copy), pivot = new T.Vector3(0, .45, 0);
  const rotate = (name, angles) => nodes[name].quaternion.copy(bind.get(nodes[name]).quaternion).multiply(quaternion(angles));
  function rootPose(angles = [0, 0, 0], bob = 0) {
    const q = quaternion(angles);
    // T(rest) * T(pivot) * R(delta) * T(-pivot), with authored root scale.
    const delta = pivot.clone().sub(pivot.clone().applyQuaternion(q)); delta.y += bob;
    delta.multiply(rootRest.scale).applyQuaternion(rootRest.quaternion);
    copy.position.copy(rootRest.position).add(delta);
    copy.quaternion.copy(rootRest.quaternion).multiply(q);
  }
  return Object.entries(recipe.clips).map(([name, def]) => {
    const duration = finite(def.duration, name), keys = def.keyframes;
    if (!['Idle', 'Walk', 'Fire', 'Hit', 'Retreat'].includes(name)) throw new Error(`Unsupported Duck clip ${name}`);
    if (keys) {
      keyTimes(keys.map(k => k.t), duration, name);
      for (const key of keys) for (const [channel, value] of Object.entries(key)) {
        if (channel === 't') continue;
        if (channel !== 'root' && !names.includes(channel)) throw new Error(`Unknown Duck channel ${channel}`);
        quaternion(value);
      }
    }
    return clip(name, duration, !!def.loop, time => {
      const phase = Math.sin(TAU * time / duration);
      if (name === 'Idle') {
        rootPose(undefined, def.root_y_bob * (.5 - .5 * Math.cos(TAU * time / duration)));
        rotate('armL', [phase * def.armL_x_degrees_amplitude, 0, 0]);
        rotate('armR', [phase * def.armR_x_degrees_amplitude, 0, 0]);
      } else if (keys) {
        const channels = new Set(keys.flatMap(k => Object.keys(k).filter(key => key !== 't')));
        for (const channel of channels) {
          const angles = [0, 1, 2].map(axis => scalarKeys(keys.map(k => k.t), keys.map(k => (k[channel] ?? [0, 0, 0])[axis]), time));
          if (channel === 'root') rootPose(angles); else rotate(channel, angles);
        }
      } else {
        for (const channel of names) if (def[channel]) rotate(channel, def[channel].map(n => n * phase));
        // Lift is positive on both stance halves; the artist specifies amplitude.
        rootPose(def.root, (def.root_y_lift ?? 0) * Math.abs(phase));
      }
    }, keys?.map(k => k.t) ?? [], { sourceAsset: recipe.asset });
  });
}

function klonkClips(root, recipe, { asset, lod, fps }) {
  if (!['KLONK', 'KLONKBOT', 'SHIELD_KLONK'].includes(asset)) throw new Error('Explicit Klonk asset id required');
  const names = [...recipe.groups, asset], { nodes, bind, clip } = sampler(root, names, fps);
  return Object.entries(recipe.recipes).map(([name, def]) => {
    let duration = finite(def.duration_s, name);
    const tracks = [], omitted = [], exact = [];
    for (const channel of def.channels) {
      if (channel.path === 'emissiveStrength' && channel.material === 'Warm_lens') {
        // Explicitly optional in the supplied contract; shared material stays immutable.
        omitted.push({ path: channel.path, material: channel.material, reason: 'Contract permits omission for shared instancing' }); continue;
      }
      if (!['translation', 'rotation_euler'].includes(channel.path) || !AXES[channel.axis] || !nodes[channel.node]) throw new Error(`Unsupported Klonk channel ${name}/${channel.node}`);
      if (channel.path === 'translation') {
        if (name !== 'wheel_roll_travel' || channel.node !== asset || channel.axis !== 'Z' || channel.function !== 't' || channel.delta_m !== 1) throw new Error('Unexpected controller translation');
        omitted.push({ node: asset, path: 'translation.Z', reason: 'Controller owns one metre per second travel' }); continue;
      }
      let evaluate;
      if (channel.times) {
        keyTimes(channel.times, duration, name);
        if (channel.values.length !== channel.times.length || !channel.values.every(Number.isFinite)) throw new Error(`Invalid channel values ${name}`);
        exact.push(...channel.times); evaluate = t => scalarKeys(channel.times, channel.values, t);
      } else if (name === 'wheel_roll_travel' && channel.node === 'wheel') {
        const rate = finite(channel.delta_rad_by_lod?.[lod] ?? channel.delta_rad, 'wheel rate');
        if (!(rate > 0)) throw new Error('Wheel rate must be positive');
        // The delivered 1s span is not a loop. Preserve rad/s with one full turn.
        duration = TAU / rate; evaluate = t => rate * t;
      } else {
        const match = /^sin\(2\*pi\*t\/([\d.]+)(?:\+([\d.]+))?\)\*([\d.]+)$/.exec(channel.function ?? '');
        if (!match) throw new Error(`Unsupported scalar formula ${channel.function}`);
        const period = +match[1], offset = +(match[2] || 0), amplitude = +match[3];
        if (!(period > 0) || Math.abs(amplitude - channel.amplitude_rad) > 1e-8) throw new Error('Invalid sine contract');
        evaluate = t => Math.sin(TAU * t / period + offset) * amplitude;
      }
      tracks.push({ node: nodes[channel.node], axis: AXES[channel.axis], evaluate });
    }
    return clip(name, duration, !!def.loop, time => {
      for (const track of tracks) {
        const q = new T.Quaternion().setFromAxisAngle(track.axis, track.evaluate(time));
        track.node.quaternion.copy(bind.get(track.node).quaternion).multiply(q);
      }
    }, exact, { sourceAsset: asset, sourcePreviewDuration: def.duration_s, controllerSpeed: name === 'wheel_roll_travel' ? 1 : undefined, omittedChannels: omitted });
  });
}

function mobileClips(root, recipe, { asset, fps, mobileMotion, mobileLayers }) {
  if (!MOBILE_NODES[asset] || typeof mobileMotion !== 'function' || recipe.clips_embedded !== false || !recipe.recipes) throw new Error('Mobile contract and createMachineMotion factory required');
  const rotorNames = ['Rotor_L', 'Rotor_R'], layered = asset === 'BUZZ_DRONE' && mobileLayers;
  const bodyNames = MOBILE_NODES[asset].filter(name => !layered || !rotorNames.includes(name));
  const { copy, clip } = sampler(root, bodyNames, fps);
  // The packaged, independently reviewed author implementation owns basis conversion.
  const motion = mobileMotion(T, copy, asset);
  if (typeof motion?.pose !== 'function') throw new Error('Invalid mobile motion factory');
  const result = Object.entries(recipe.recipes).map(([name, def]) => {
    const allowed = asset === 'DARTER' ? ['Hover', 'Bank', 'Fire', 'Disabled'] : ['Hover', 'FlightTilt', 'Fire', 'Disabled'];
    if (!allowed.includes(name)) throw new Error(`Unsupported mobile state ${name}`);
    let duration = def.duration_seconds ?? def.period_seconds;
    const loop = def.period_seconds != null;
    if (asset === 'BUZZ_DRONE' && loop) {
      if (recipe.rotors_when_active?.speed_rpm !== 198) throw new Error('Unreviewed rotor period');
      // Body's 2s hover and 3s optic cycle close after 6s. The optional audit
      // mode includes rotors, requiring 30/60s; never use that as crowd default.
      if (name === 'Hover' && def.period_seconds === 2 && def['OpticGimbal.rotationZ'] === '9deg*sin(2*pi*t/3)') duration = layered ? 6 : 30;
      else if (name === 'FlightTilt' && def.period_seconds === 2.4) duration = layered ? 2.4 : 60;
      else throw new Error(`Unreviewed periodic mobile state ${name}`);
    }
    return clip(name, duration, loop, time => motion.pose(name, time), [], {
      sourceAsset: asset, sourcePreviewDuration: def.duration_seconds ?? def.period_seconds,
      sourceFactory: 'COMMUNE_MOBILE_MOTION.createMachineMotion',
      animationRole: layered ? 'body' : 'complete', excludedNodes: layered ? rotorNames : [],
      requiredLayer: layered ? (name === 'Disabled' ? 'RotorBrake' : 'RotorSpin') : undefined,
    });
  });
  if (layered) {
    const rotary = sampler(root, rotorNames, fps, { includeRoot: false });
    const rotaryMotion = mobileMotion(T, rotary.copy, asset), period = 60 / recipe.rotors_when_active.speed_rpm;
    result.push(rotary.clip('RotorSpin', period, true, time => rotaryMotion.pose('Hover', time), [], {
      sourceAsset: asset, animationRole: 'continuous-layer', controlledNodes: rotorNames,
      phasePolicy: 'Keep time continuous across body-state changes; do not reset when firing or banking',
    }));
    result.push(rotary.clip('RotorBrake', recipe.recipes.Disabled.duration_seconds, false, time => rotaryMotion.pose('Disabled', time), [], {
      sourceAsset: asset, animationRole: 'continuous-layer', controlledNodes: rotorNames,
      phasePolicy: 'Offset sampled local rotor quaternion by the active rotor phase at braking start',
    }));
  }
  return result;
}

/** Returns ordinary clips without changing source nodes, geometry, materials or recipe.
 * `mobileMotion` is createMachineMotion imported from definition.motionScript.file.
 * All returned tracks bind against the supplied root OR a normal clone of that root.
 */
export function articulatedClips(root, recipe, { asset = recipe?.asset, lod = 'lo', fps = 60, mobileMotion, mobileLayers = true } = {}) {
  if (!root?.isObject3D || !recipe || typeof recipe !== 'object') throw new Error('Scene and motion contract required');
  const options = { asset, lod, fps, mobileMotion, mobileLayers };
  if (recipe.schema === 'fernworld-rigid-motion-1') return duckClips(root, recipe, options);
  if (recipe.schema === 'fernworld.rigid-motion.v1' && recipe.recipes) return klonkClips(root, recipe, options);
  if (MOBILE_NODES[asset]) return mobileClips(root, recipe, options);
  throw new Error(`Unsupported articulated contract: ${asset ?? recipe.schema}`);
}

/** Clone embedded heavy-machine clips and remove only WalkRoll's controller-owned Z.
 * The 1s authored preview is NOT a seamless wheel loop: continuous travel needs an
 * unbounded wheel controller/masked layer. Metadata deliberately reports this limit.
 */
export function inPlaceWalkRoll(root, animations, { asset } = {}) {
  if (!['HULK', 'SQUIRTER'].includes(asset)) throw new Error('Unsupported heavy-machine asset');
  const node = named(root, asset), originals = animations.filter(clip => clip.name === 'WalkRoll');
  if (originals.length !== 1) throw new Error('Exactly one WalkRoll clip required');
  return animations.map(original => {
    const copy = original.clone(); copy.userData = { ...original.userData };
    if (original.name !== 'WalkRoll') return copy;
    const tracks = copy.tracks.filter(track => {
      const binding = T.PropertyBinding.parseTrackName(track.name);
      return binding.nodeName === asset && binding.propertyName === 'position';
    });
    if (tracks.length !== 1 || tracks[0].getValueSize() !== 3) throw new Error('Missing or ambiguous WalkRoll root translation');
    const track = tracks[0], values = track.values;
    if (Math.abs(values.at(-1) - values[2] - .45) > 1e-5 || Math.abs(copy.duration - 1) > 1e-5) throw new Error('Unreviewed heavy-machine travel span');
    for (let i = 2; i < values.length; i += 3) values[i] = node.position.z;
    copy.userData = { ...copy.userData, inPlace: true, controllerSpeed: .45, sourceAsset: asset, loop: false, continuousWheelControllerRequired: true, removedControllerChannel: `${asset}.position.z` };
    return copy;
  });
}
