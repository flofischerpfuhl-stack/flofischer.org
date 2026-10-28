/** Ranger-only motion for the reviewed rigid channel cast. Clip keys keep the
 * gun aimed while feet take short steps; locomotion never swings the rifle. */
import { THREE as T } from './three-kit.js';
export function legionaryMotion(id, model) {
  const scene = new T.Group(), joints = new Map(), materials = new Map();
  for (const part of model) {
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
  const times = [0,.125,.25,.375,.5,.625,.75,.875,1], duration = .68;
  const animations = [];
  for (const name of ['Idle','Walk','IdleFire','WalkFire','Retreat']) {
    const walking = name.startsWith('Walk') || name === 'Retreat', fire = name.endsWith('Fire'), tracks = [];
    // These cyclic pose keys deliberately use a small stride, two quiet weight
    // transfers and planted shoulders. Every clip owns every controlled joint.
    for (const [channel,joint] of joints) {
      const rotations=[], positions=[];
      for (let i=0;i<times.length;i++) {
        const stride=[-.28,-.20,0,.20,.28,.20,0,-.20,-.28][i], side=channel==='legL'?1:channel==='legR'?-1:0;
        const arm=channel==='armL'||channel==='armR';
        const angle=walking&&side?stride*side:arm?(name==='Retreat'?-1.8:-.12):0;
        rotations.push(...new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),angle));
        const recoil=fire&&channel==='recoil'?[0,.04,.012,0,0,.04,.012,0,0][i]:0;
        positions.push(joint.position.x,joint.position.y,joint.position.z+recoil);
      }
      tracks.push(new T.QuaternionKeyframeTrack(channel+'.quaternion',times.map(t=>t*duration),rotations));
      tracks.push(new T.VectorKeyframeTrack(channel+'.position',times.map(t=>t*duration),positions));
    }
    tracks.push(new T.VectorKeyframeTrack('.position',times.map(t=>t*duration),times.flatMap((_,i)=>[0,walking?[0,.012,.022,.012,0,.012,.022,.012,0][i]:0,0])));
    animations.push(new T.AnimationClip(name,duration,tracks));
  }
  return {id,lod:'lo',scene,animations,ownedMaterials:[...materials.values()]};
}
