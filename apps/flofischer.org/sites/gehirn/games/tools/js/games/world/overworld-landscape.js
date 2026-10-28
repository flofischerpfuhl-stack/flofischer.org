/** Context around the native region. Never replaces or modifies authored meshes. */
import { THREE as T } from '../three-kit.js';

export function landscape(world, family, index) {
  const group = new T.Group(), u = world.unitScale;
  const center = world.bounds.getCenter(new T.Vector3());
  group.position.set(center.x, 0, center.z); group.scale.setScalar(u);
  const materials = [], geometries = [];
  const mat = (color, extra={}) => { const m = new T.MeshStandardMaterial({color,roughness:.95,...extra}); materials.push(m); return m; };
  const geo = g => { geometries.push(g); return g; };
  const ground = ['#527348','#c3a26e','#a9bfcd','#594752','#56636b'][index];
  const stone = ['#6c8070','#b39a79','#889da7','#4e4248','#45525e'][index];
  const floor = mat(family==='bounce' ? '#8a5f3c' : family==='pip' ? stone : ground);
  const plane = new T.Mesh(geo(new T.CircleGeometry(180,96)),floor); plane.rotation.x=-Math.PI/2;
  plane.position.y=family==='rangers'?-.24:family==='pip'?.2:world.bounds.min.y/u-.06; plane.receiveShadow=true;group.add(plane);
  if(family==='rangers'&&(index===0||index===3)){
    const shore=new T.Shape();const points=[[-90,3.2],[-11.99,3.2],[-11.99,10],[-6.4,10],[-20,90],[-90,90]];points.forEach(([x,z],i)=>shore[i?'lineTo':'moveTo'](x,-z));shore.closePath();
    const water=new T.Mesh(geo(new T.ShapeGeometry(shore)),mat(index===0?'#397d86':'#283f50',{roughness:.3,metalness:.05,side:T.DoubleSide}));water.rotation.x=-Math.PI/2;water.position.y=index===0?.13:.07;water.position.x=((world.root?.position.x??center.x)-center.x)/u;water.position.z=((world.root?.position.z??center.z)-center.z)/u;group.add(water);
  }
  if(family==='bounce') {
    // The native toy course is set on a wooden tournament bench, above the room floor.
    plane.visible=false;
    const wood=mat('#65452d'), stripe=mat(['#f2b74c','#d59255','#b7d6df','#c67c61'][index%4]), room=mat('#697269');
    const roomFloor=new T.Mesh(geo(new T.PlaneGeometry(220,220)),room);roomFloor.rotation.x=-Math.PI/2;roomFloor.position.y=-10;group.add(roomFloor);
    const floorTiles=new T.InstancedMesh(geo(new T.BoxGeometry(5.8,.03,5.8)),mat('#858b7d'),64),d=new T.Object3D();
    for(let i=0;i<64;i++){d.position.set((i%8-3.5)*6,-9.98,(Math.floor(i/8)-3.5)*6);d.scale.setScalar(1);d.updateMatrix();floorTiles.setMatrixAt(i,d.matrix);}group.add(floorTiles);
    for(let i=0;i<10;i++){const plank=new T.Mesh(geo(new T.BoxGeometry(3.18,.2,28)),i%2?floor:wood);plank.position.set((i-4.5)*3.2,plane.position.y-.08,0);plank.receiveShadow=true;group.add(plank);}
    for(const x of [-16,16]){const rim=new T.Mesh(geo(new T.BoxGeometry(.4,.8,28)),wood);rim.position.set(x,plane.position.y+.1,0);group.add(rim);}
    for(const z of [-14,14]){const rim=new T.Mesh(geo(new T.BoxGeometry(32,.8,.4)),stripe);rim.position.set(0,plane.position.y+.1,z);group.add(rim);}
    for(const x of [-14,14])for(const z of [-12,12]){const leg=new T.Mesh(geo(new T.BoxGeometry(1.2,8,1.2)),wood);leg.position.set(x,plane.position.y-4,z);group.add(leg);}
    const flags=new T.InstancedMesh(geo(new T.BoxGeometry(1.8,2,.05)),stripe,7),poles=new T.InstancedMesh(geo(new T.CylinderGeometry(.06,.06,7,6)),wood,7);
    for(let i=0;i<7;i++){d.position.set((i-3)*4,plane.position.y+3.4,-14);d.updateMatrix();poles.setMatrixAt(i,d.matrix);d.position.y+=2;d.updateMatrix();flags.setMatrixAt(i,d.matrix);}group.add(flags,poles);
  } else {
    // Distant terrain closes the horizon; the travel camera stays inside the authored landscape.
    const ridge=mat(stone), top=mat(family==='pip'?stone:index===2?'#e4edf0':index===1?'#c6aa77':index===3?'#60515a':'#67835d');
    const hill=geo(new T.SphereGeometry(1,14,8)), count=40;
    const hills=new T.InstancedMesh(hill,top,count), rocks=new T.InstancedMesh(hill,ridge,count), d=new T.Object3D();
    for(let i=0;i<count;i++){const a=Math.PI*(.85+i/(count-1)*.8),r=26+Math.sin(i*4.4)*4;d.position.set(Math.sin(a)*r,plane.position.y-1,Math.cos(a)*r);d.scale.set(8+Math.sin(i)*2,family==='pip'?10+(i%4)*2:3+(i%5),7);d.updateMatrix();(i%2?hills:rocks).setMatrixAt(i,d.matrix);}
    // Both instance sets have complete matrices; alternate material bands without blank instances.
    for(let i=0;i<count;i++){const a=Math.PI*(.85+i/(count-1)*.8),r=31+Math.sin(i*3.7)*5;d.position.set(Math.sin(a)*r,plane.position.y-2,Math.cos(a)*r);d.scale.set(7,family==='pip'?15:5+(i%4),8);d.updateMatrix();(i%2?rocks:hills).setMatrixAt(i,d.matrix);}
    group.add(hills,rocks);
    if(family==='momo'||(family==='rangers'&&index===0)) {
      const trunk=mat('#65513d'), leaf=mat(index===2?'#b9d0c6':'#385b44');
      const trunks=new T.InstancedMesh(geo(new T.CylinderGeometry(.24,.35,3,7)),trunk,36), crowns=new T.InstancedMesh(geo(new T.SphereGeometry(1,9,7)),leaf,36);
      for(let i=0;i<36;i++){const a=Math.PI*(.85+i/35*.8),r=18+(i%4)*2;d.position.set(Math.sin(a)*r,plane.position.y+1.5,Math.cos(a)*r);d.scale.setScalar(1);d.updateMatrix();trunks.setMatrixAt(i,d.matrix);d.position.y+=2.4;d.scale.set(2.3,2.8,2.2);d.updateMatrix();crowns.setMatrixAt(i,d.matrix);}group.add(trunks,crowns);
    }
  }
  return {group,release(){group.removeFromParent();group.traverse(n=>{if(n.isInstancedMesh)n.dispose();});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}};
}
