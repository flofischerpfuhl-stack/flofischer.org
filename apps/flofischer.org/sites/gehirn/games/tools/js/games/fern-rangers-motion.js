/** Live Ranger gait retargeted to the immutable Fernworld channel meshes. */
import { THREE as T } from './three-kit.js';
import { troopScale, TROOP_PROFILES } from './fern-rangers-formation.js';
export const LIVE_WALK = {angularSpeed:11,period:2*Math.PI/11,legAmplitude:.7,armAmplitude:0,bodyBob:.04};
export function liveWalkPose(phase,swing=1) {
 const step=Math.sin(phase)*swing;
 return {leg:step*.7,arm:0,bob:Math.abs(step)*.04};
}
export function legionaryMotion(id, model) {
  const scene = Array.isArray(model)?new T.Group():model.scene, joints = new Map(), materials = new Map();
  if(!Array.isArray(model))for(const name of ['body','recoil','legL','legR','armL','armR']){const node=scene.getObjectByName(name);if(node)joints.set(name,node);}
  for (const part of Array.isArray(model)?model:[]) {
    let joint = joints.get(part.ch);
    if (!joint) {
      joint = new T.Group(); joint.name = part.ch; joint.position.fromArray(part.pivot || [0, 0, 0]);
      scene.add(joint); joints.set(part.ch, joint);
    }
    let material = materials.get(part.mat);
    if (!material) {
      material = part.mat === 'glow' ? new T.MeshBasicMaterial({vertexColors:true,toneMapped:false}) : new T.MeshStandardMaterial({vertexColors:true,roughness:part.mat==='gloss'?.22:.66,metalness:.02});
      materials.set(part.mat, material);
    }
    const mesh = new T.Mesh(part.geometry, material); mesh.position.copy(joint.position).negate(); joint.add(mesh);
  }
  const duration = LIVE_WALK.period, times = Array.from({length:65},(_,i)=>i*duration/64);
  const animations = [], size = troopScale(id);
  for (const name of ['Idle','Walk','IdleFire','WalkFire','Retreat']) {
    const walking=name.startsWith('Walk')||name==='Retreat', swing=walking?1:.15, fire=name.endsWith('Fire'), tracks=[];
    for (const [channel,joint] of joints) {
      const rotations=[], positions=[];
      for (const t of times) {
        const pose=liveWalkPose(t*LIVE_WALK.angularSpeed,swing);
        const angle=channel==='legL'?pose.leg:channel==='legR'?-pose.leg:
          (channel==='armL'||channel==='armR')&&name==='Retreat'?-2.6:0;
        rotations.push(...new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),angle));
        // Live bob moves body/recoil only: feet stay planted and the root does not hop.
        // The actual live troop meshes have no swinging arm channels: both
        // armed hands live in recoil. Native separated arms follow that same bob.
        const bob=['body','recoil','armL','armR'].includes(channel)?pose.bob*1.1/size:0;
        positions.push(joint.position.x,joint.position.y+bob,joint.position.z+(fire&&(channel==='recoil'||channel===TROOP_PROFILES[id].owner)?.066/size:0));
      }
      tracks.push(new T.QuaternionKeyframeTrack(channel+'.quaternion',times,rotations));
      tracks.push(new T.VectorKeyframeTrack(channel+'.position',times,positions));
    }
    animations.push(new T.AnimationClip(name,duration,tracks));
  }
  return {id,lod:'lo',motionFps:60,scene,animations,ownedMaterials:[...materials.values()]};
}
