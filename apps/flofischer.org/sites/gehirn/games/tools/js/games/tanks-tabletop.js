/** The tournament is played on a tabletop. This module owns only Bounce scenery. */
import { THREE as T, mat, applyIbl } from './three-kit.js';
import { RoundedBoxGeometry } from '../../vendor/three-0.170.0/RoundedBoxGeometry.js';
import { bakeCrowd, BakedCrowd } from '../../games-assets/fernworld/runtime/baked-crowd.js';
import { ToyInstances } from './tanks-art.js';
export const TABLETOP_FOLIAGE=[['ALPINE_FERN','ALPINE_BLOOM'],['SUCCULENT_ROSETTE','DESERT_BLOOM'],['ALPINE_DWARF_PINE','SNOWCAP_SHRUB'],['BASALT_ROOT_SHRUB','EMBER_BLOOM']];
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
    const [a,b,spectator]=await Promise.all([...TABLETOP_FOLIAGE[world].map(id=>library.template(id,'lo')),library.template('MINER_HUMAN','far')]);
    const table=new TabletopWorld(world);
    try{
      for(const [k,template]of [a,b].entries()){
        const batch=new ToyInstances(template,table.root,20);table.batches.push(batch);batch.begin();
        for(let i=0;i<16;i++){const side=i%2?1:-1,along=-6.5+Math.floor(i/2)*1.8;batch.add(pose(side*(12.05+k*.3),.04,along,1.15,Math.sin(i*3)*2));}
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
    this.textures=[];this.root=new T.Group();this.root.name='Concordia tournament tabletop';this.batches=[];this.owned=new T.Group();this.root.add(this.owned);
    const box=new RoundedBoxGeometry(1,1,1,2,.08),wood=mat(0xb48458,{roughness:.7}),trim=mat(0xe8cf9c,{roughness:.55}),rubber=mat(0x314c57,{roughness:.8});
    const block=(x,y,z,sx,sy,sz,m)=>{const o=new T.Mesh(box,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.receiveShadow=true;this.owned.add(o);return o;};
    // A thick table slab: pale rim top, a darker apron below it and four chunky legs, so the edge reads from above.
    const apron=mat(0x8a6144,{roughness:.75});
    block(0,-.78,0,26,1.5,18.6,wood);block(0,-.12,0,25.6,.14,18.2,trim);block(0,-1.38,0,24.4,.55,17.2,apron);
    for(const sign of [-1,1]){
      block(sign*11.2,.14,0,.22,.28,14.8,rubber);
      block(0,.14,sign*7.05,22.6,.28,.22,rubber);
      for(const z of [-7.9,7.9])block(sign*11.7,-1.85,z,1.3,1.6,1.3,apron);
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
    this.buildProps(world,box);
    const sign=new T.Mesh(new T.PlaneGeometry(8.2,1.54),new T.MeshStandardMaterial({map:tex,roughness:.8,side:T.DoubleSide}));sign.position.set(0,-.72,9.32);this.owned.add(sign);
  }
  /** Region toys on the table rim: chunky primitives in the region's colours, standing on the slab. */
  buildProps(world,box){
    const faces=(n,draw)=>{const out=[];for(let i=0;i<n;i++){const cv=document.createElement('canvas');cv.width=cv.height=128;const g=cv.getContext('2d');draw(g,i);const t=new T.CanvasTexture(cv);t.colorSpace=T.SRGBColorSpace;this.textures.push(t);out.push(new T.MeshStandardMaterial({map:t,roughness:.6}));}return out;};
    const put=(geo,m,x,y,z,sx,sy,sz,ry=0)=>{const o=new T.Mesh(geo,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.rotation.y=ry;o.castShadow=o.receiveShadow=true;this.owned.add(o);return o;};
    const cyl=new T.CylinderGeometry(.5,.5,1,18),ball=new T.SphereGeometry(.5,16,12),cone=new T.ConeGeometry(.5,1,16),pyr=new T.ConeGeometry(.7,1,4);
    const toy=c=>mat(c,{roughness:.55});
    if(world===0){
      const letters=faces(6,(g,i)=>{g.fillStyle=['#e5bc55','#6ab9dc','#e87a6a','#55b582','#ae89ce','#f4ead0'][i];g.fillRect(0,0,128,128);g.fillStyle='#fff8e6';g.fillRect(14,14,100,100);g.fillStyle=['#c9822f','#2f7fa6','#b5483a','#2f8a5c','#7a55a8','#a7834a'][i];g.font='bold 84px sans-serif';g.textAlign='center';g.fillText('ABCDEF'[i],64,95);});
      put(box,letters,-8.6,.4,8.2,.8,.8,.8,.2);put(box,letters,-7.4,.4,8.5,.8,.8,.8,-.3);
      put(box,letters,-8,1.2,8.4,.8,.8,.8,.5);
      put(box,toy(0xe87a6a),6.2,.35,8.3,1.6,.7,1.1);put(box,toy(0x6ab9dc),6.2,.9,8.3,1.5,.4,1.0);put(cone.clone(),toy(0xe5bc55),6.2,1.35,8.3,1.3,.7,1.3);
      put(cyl,toy(0x55b582),10.6,.3,8.3,.8,.6,.8);put(ball,toy(0xe5bc55),10.6,.9,8.3,.6,.6,.6);
    }else if(world===1){
      const dice=faces(6,(g,i)=>{g.fillStyle='#f6ead2';g.fillRect(0,0,128,128);g.fillStyle=i===0?'#d8442f':'#3a2a22';const P={0:[[64,64]],1:[[34,34],[94,94]],2:[[34,34],[64,64],[94,94]],3:[[34,34],[94,34],[34,94],[94,94]],4:[[34,34],[94,34],[64,64],[34,94],[94,94]],5:[[34,30],[94,30],[34,64],[94,64],[34,98],[94,98]]}[i];for(const [x,y]of P){g.beginPath();g.arc(x,y,i===0?18:11,0,6.3);g.fill();}});
      put(box,dice,-8.2,.5,8.3,1,1,1,.4);put(box,dice,-6.7,.4,8.5,.8,.8,.8,-.3);
      put(pyr,toy(0xe0a24a),6.4,.55,8.2,1.5,1.1,1.5,Math.PI/4);put(pyr,toy(0xd6703a),8.3,.4,8.5,1,.8,1,Math.PI/4);
      put(cyl,toy(0x4fa8a0),10.8,.35,8.3,.9,.7,.9);put(cyl,toy(0xe5bc55),10.8,.85,8.3,.7,.3,.7);
    }else if(world===2){
      for(let i=0;i<4;i++)put(cyl,toy([0x6ab9dc,0xe87a6a,0xe5bc55,0x55b582][i]),-8,.18+i*.3,8.3,1.5-i*.28,.28,1.5-i*.28);
      put(cone,toy(0xe5bc55),-8,1.55,8.3,.4,.5,.4);
      put(ball,toy(0xf4f8ff),7,.45,8.4,1.1,.9,1.1);put(ball,toy(0xf4f8ff),7,1.15,8.4,.8,.7,.8);put(ball,toy(0xf4f8ff),7,1.7,8.4,.55,.5,.55);put(cone,toy(0xf08a3a),7.1,1.7,8.8,.12,.35,.12).rotation.x=Math.PI/2;
      put(box,toy(0x8cc3ee),10.6,.4,8.3,.8,.8,.8,.3);put(box,toy(0xdcebf9),10.6,1.1,8.3,.7,.6,.7,-.2);
    }else{
      put(cone,toy(0x4a3036),-8,.7,8.3,2.2,1.4,2.2);put(cone,toy(0xff8a3a),-8,1.35,8.3,.7,.35,.7);
      put(box,toy(0xd8442f),-5.6,.4,8.4,.9,.8,.9,.4);put(box,toy(0x2c2328),-4.6,.35,8.5,.8,.7,.8,-.2);
      put(cyl,toy(0xe5bc55),7,.3,8.3,.9,.6,.9);put(cyl,toy(0xd8442f),7,.8,8.3,.7,.4,.7);
      put(box,toy(0xae89ce),10.6,.4,8.3,.8,.8,.8,.2);
    }
  }
  update(time,won=false){if(!this.crowd)return;for(let i=0;i<12;i++)this.crowd.setPose(i,won?'Rescue_Cheer':'Idle',spectatorTime(i,time));this.crowd.flush();}
  dispose(){this.root.removeFromParent();this.crowd?.dispose();this.atlas?.dispose();for(const b of this.batches)b.dispose();const geo=new Set(),mats=new Set();this.owned.traverse(o=>{if(o.geometry)geo.add(o.geometry);if(o.material)for(const m of [].concat(o.material))mats.add(m);});for(const g of geo)g.dispose();for(const m of mats)m.dispose();this.signTexture?.dispose();for(const t of this.textures)t.dispose();}
}
