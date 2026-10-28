/** The tournament is played on a tabletop. This module owns only Bounce scenery. */
import { THREE as T, mat, applyIbl } from './three-kit.js';
import { RoundedBoxGeometry } from '../../vendor/three-0.170.0/RoundedBoxGeometry.js';
import { bakeCrowd, BakedCrowd } from '../../games-assets/fernworld/runtime/baked-crowd.js';
import { ToyInstances } from './tanks-art.js';
const foliage=[['ALPINE_FERN','ALPINE_BLOOM'],['SUCCULENT_ROSETTE','DESERT_BLOOM'],['ALPINE_DWARF_PINE','SNOWCAP_SHRUB'],['BASALT_ROOT_SHRUB','EMBER_BLOOM']];
const colours=[0x55b582,0xe5bc55,0x6ab9dc,0xae89ce];
const labels=['VIRIDIS · FERNHAVEN CUP','SAHRUN · FOSSIL CLUB','HIBERN · FIRNWATCH CUP','VULKARA · CONCORDIA FINAL'];
const mx=new T.Matrix4(),p=new T.Vector3(),s=new T.Vector3(),q=new T.Quaternion(),up=new T.Vector3(0,1,0);
const pose=(x,y,z,scale=1,yaw=0)=>mx.compose(p.set(x,y,z),q.setFromAxisAngle(up,yaw),s.setScalar(scale));
// Native humans face +Z. Aim them into the tournament, with small individual
// deviations and irregular breathing phases rather than a drilled straight row.
const spectatorPhase=i=>(i*.7639320225)%2;
const spectatorTime=(i,time)=>time*(.92+(i%5)*.04)+spectatorPhase(i);
export class TabletopWorld {
  static async create(library,world,env){
    const [a,b,spectator]=await Promise.all([...foliage[world].map(id=>library.template(id,'lo')),library.template('MINER_HUMAN','far')]);
    const table=new TabletopWorld(world);
    try{
      for(const [k,template]of [a,b].entries()){
        const batch=new ToyInstances(template,table.root,20);table.batches.push(batch);batch.begin();
        for(let i=0;i<16;i++){const side=i%2?1:-1,along=-6.5+Math.floor(i/2)*1.8;batch.add(pose(side*(11.4+k*.32),.04,along,1.15,Math.sin(i*3)*2));}
        batch.end();
      }
      // Repeated living spectators stay outside the toy field: one GPU crowd,
      // no mixers and no full-resolution crowd shadows.
      table.atlas=bakeCrowd(spectator,{fps:12,clipNames:['Idle','Rescue_Cheer']});
      table.crowd=new BakedCrowd(table.atlas,12);table.root.add(table.crowd.root);
      for(let i=0;i<12;i++){
        const x=-8.5+i*1.55,yaw=Math.atan2(-x,7.65)+Math.sin(i*2.4)*.09;
        table.crowd.setMatrix(i,pose(x,.445,-7.65,.75,yaw));
        table.crowd.setPose(i,'Idle',spectatorTime(i,0));
      }
      table.crowd.setCount(12);table.crowd.flush();
      applyIbl(table.root,env,.65);return table;
    }catch(e){table.dispose();throw e;}
  }
  constructor(world){
    this.root=new T.Group();this.root.name='Concordia tournament tabletop';this.batches=[];this.owned=new T.Group();this.root.add(this.owned);
    const box=new RoundedBoxGeometry(1,1,1,2,.08),wood=mat(0xa9683f,{roughness:.7}),trim=mat(0xe4c48b,{roughness:.55}),rubber=mat(0x314c57,{roughness:.8});
    const block=(x,y,z,sx,sy,sz,m)=>{const o=new T.Mesh(box,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.receiveShadow=true;this.owned.add(o);return o;};
    block(0,-.6,0,23.8,1.15,16.4,wood);block(0,-.11,0,23.5,.12,16.1,trim);
    for(const sign of [-1,1]){
      block(sign*11.2,.14,0,.22,.28,14.8,rubber);
      block(0,.14,sign*7.05,22.6,.28,.22,rubber);
      block(sign*10.8,-1.65,-5,1,2,1,wood);block(sign*10.8,-1.65,5,1,2,1,wood);
      block(sign*11.4,.08,-.3,.52,.12,12,wood);
    }
    block(0,.22,-7.65,20,.45,.75,wood);
    // Fabric pennants, poles and padded end posts read as sports equipment.
    const poleGeo=new T.CylinderGeometry(.025,.025,1,6),poleMat=mat(0xe6d7b9),flagGeo=new T.BufferGeometry();
    flagGeo.setAttribute('position',new T.Float32BufferAttribute([0,0,0,.48,-.12,0,0,-.3,0],3));flagGeo.computeVertexNormals();
    for(let i=0;i<10;i++){
      const x=-10.7+i*2.38,post=new T.Mesh(poleGeo,poleMat);post.position.set(x,.52,-7.15);this.owned.add(post);
      const flag=new T.Mesh(flagGeo,mat(colours[i%4],{side:T.DoubleSide,roughness:.8}));flag.position.set(x,1.0,-7.15);this.owned.add(flag);
    }
    const cv=document.createElement('canvas');cv.width=1024;cv.height=192;const g=cv.getContext('2d');
    g.fillStyle='#203f49';g.fillRect(0,0,1024,192);g.strokeStyle='#e5bc55';g.lineWidth=8;g.strokeRect(12,12,1000,168);
    g.textAlign='center';g.fillStyle='#fff1cf';g.font='bold 44px sans-serif';g.fillText('CONCORDIA  ·  PEACE TOURNAMENT',512,76);g.font='27px sans-serif';g.fillText(labels[world],512,128);g.font='18px sans-serif';g.fillText('ONE EVENING OF PEACE',512,163);
    const tex=new T.CanvasTexture(cv);tex.colorSpace=T.SRGBColorSpace;this.signTexture=tex;
    const sign=new T.Mesh(new T.PlaneGeometry(8.2,1.54),new T.MeshStandardMaterial({map:tex,roughness:.8,side:T.DoubleSide}));sign.position.set(0,-.55,8.22);this.owned.add(sign);
  }
  update(time,won=false){if(!this.crowd)return;for(let i=0;i<12;i++)this.crowd.setPose(i,won?'Rescue_Cheer':'Idle',spectatorTime(i,time));this.crowd.flush();}
  dispose(){this.root.removeFromParent();this.crowd?.dispose();this.atlas?.dispose();for(const b of this.batches)b.dispose();const geo=new Set(),mats=new Set();this.owned.traverse(o=>{if(o.geometry)geo.add(o.geometry);if(o.material)mats.add(o.material);});for(const g of geo)g.dispose();for(const m of mats)m.dispose();this.signTexture?.dispose();}
}
