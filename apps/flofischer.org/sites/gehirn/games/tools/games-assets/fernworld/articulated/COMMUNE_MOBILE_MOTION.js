// Three.js, GLB-loaded Object3D, seconds. Import {createMachineMotion}.
// Coordinates are converted from authored Blender Z-up into actual glTF Y-up.
// Recipes are procedural, not embedded AnimationClips; reset per sample, one state.
export function createMachineMotion(THREE, root, asset) {
  const nodes = {}, bind = {};
  const controlled = new Set(asset==='DARTER' ? ['DARTER_Root','Suspension','BodyBank','Skate_L','Skate_R','ProjectionArm'] : ['BUZZ_DRONE_Root','FlightTilt','Rotor_L','Rotor_R','OpticGimbal','ProjectionNozzle']);
  root.traverse(o => { nodes[o.name] = o; if(controlled.has(o.name)) bind[o.name] = {p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()}; });
  controlled.forEach(n => { if(!nodes[n]) throw new Error('Machine pivot missing: '+n); });
  const cv = v => new THREE.Vector3(v[0],v[2],-v[1]);
  function pose(state,t) {
    Object.keys(bind).forEach(n => { const o=nodes[n],b=bind[n];o.position.copy(b.p);o.quaternion.copy(b.q);o.scale.copy(b.s); });
    const move=(n,v)=>nodes[n].position.copy(bind[n].p).add(cv(v));
    const rot=(n,v,a)=>nodes[n].quaternion.copy(bind[n].q).multiply(new THREE.Quaternion().setFromAxisAngle(cv(v),a));
    const tau=2*Math.PI,rad=a=>a*Math.PI/180;
    if(asset==='DARTER') {
      if(state==='Hover') {const a=Math.sin(tau*t/1.8);move('DARTER_Root',[0,0,.018*a]);rot('Skate_L',[1,0,0],.035*a);rot('Skate_R',[1,0,0],-.035*a);}
      if(state==='Bank') {const a=Math.sin(tau*t/2.4);rot('BodyBank',[0,1,0],rad(8)*a);rot('Skate_L',[0,1,0],rad(6)*a);rot('Skate_R',[0,1,0],rad(6)*a);rot('ProjectionArm',[0,0,1],rad(7)*a);}
      if(state==='Fire') {const a=Math.sin(Math.PI*Math.min(1,Math.max(0,t/.6)));rot('ProjectionArm',[1,0,0],rad(-12)*a);move('ProjectionArm',[0,.028*a,0]);rot('BodyBank',[1,0,0],rad(3)*a);}
      if(state==='Disabled') {let u=Math.min(1,Math.max(0,t/1.4));u=u*u*(3-2*u);move('DARTER_Root',[0,0,-.14*u]);move('Suspension',[0,0,-.11*u]);rot('ProjectionArm',[1,0,0],rad(-5)*u);}
    } else {
      if(state!=='Disabled') {rot('Rotor_L',[0,0,1],tau*3.3*t);rot('Rotor_R',[0,0,1],-tau*3.3*t);}
      if(state==='Hover') {move('BUZZ_DRONE_Root',[0,0,.045*Math.sin(tau*t/2)]);rot('OpticGimbal',[0,0,1],rad(9)*Math.sin(tau*t/3));}
      if(state==='FlightTilt') {const a=Math.sin(tau*t/2.4);rot('FlightTilt',[1,0,0],rad(-12)*a);rot('OpticGimbal',[1,0,0],rad(8)*a);}
      if(state==='Fire') {const a=Math.sin(Math.PI*Math.min(1,Math.max(0,t/.6)));move('ProjectionNozzle',[0,.022*a,0]);rot('ProjectionNozzle',[1,0,0],rad(-7)*a);rot('FlightTilt',[1,0,0],rad(2)*a);}
      if(state==='Disabled') {const u=Math.min(1,Math.max(0,t/1.8));move('BUZZ_DRONE_Root',[0,0,-.871*u*u*(3-2*u)]);const p=tau*3.3*1.8*(u-u*u+u*u*u/3);rot('Rotor_L',[0,0,1],p);rot('Rotor_R',[0,0,1],-p);}
    }
    root.updateMatrixWorld(true);
  }
  return {pose,nodes};
}
