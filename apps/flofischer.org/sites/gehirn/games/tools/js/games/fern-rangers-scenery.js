import { THREE as T, applyIbl } from './three-kit.js';
import { Batch, mtx } from './world/decor.js';
const PALETTES=[{stone:0x8a8a77,earth:0x736d50,flag:0x345e75},{stone:0xb69b74,earth:0xb18d61,flag:0x2c6b76},{stone:0x8593a2,earth:0x9caab5,flag:0x315b85},{stone:0x665c65,earth:0x514b4b,flag:0x70415d}];
/** Imperial road furniture: drainage, boundary stones and intermittent company
 * pennants. These are coherent runs along a maintained march route. */
export class RangerRoute {
 constructor({world=0,road=3,P=128}) {
  this.P=P;this.group=new T.Group();this.static=new T.Group();this.chunks=[];
  const p=PALETTES[world],box=new T.BoxGeometry(1,1,1),pole=new T.CylinderGeometry(.025,.035,1,6),bins=Array.from({length:8},()=>new Batch());
  const add=(g,x,y,z,scale,color)=>bins[Math.max(0,Math.min(7,Math.floor(-z/32)))].add(g,mtx([x,y,z],[0,0,0],scale),color);
  for(const off of [0,-P])for(const side of [-1,1]) {
   // Continuous shallow stone drainage channels, rather than traffic lines.
   for(let z=-1;z>-P;z-=3.2){add(box,side*(road+.42),-.015,z+off,[.42,.07,3.12],p.earth);add(box,side*(road+.66),.055,z+off,[.12,.15,3.12],p.stone);}
   for(let z=-12;z>-P;z-=24){add(box,side*(road+.95),.18,z+off,[.22,.36,.25],p.stone);add(box,side*(road+.95),.38,z+off,[.27,.05,.29],0xc4b48d);}
   for(let z=side<0?-28:-88;z>-P;z-=128){add(pole,side*(road+1.0),.7,z+off,[1,1.4,1],0x574a37);add(box,side*(road+1.22),1.18,z+off,[.38,.46,.025],p.flag);add(box,side*(road+1.22),1.18,z+off,[.055,.32,.033],0xd7c995);}
  }
  bins.forEach((b,i)=>{const g=new T.Group();if(!b.empty)g.add(b.mesh());g.userData.z=-(i+.5)*32;this.group.add(g);this.chunks.push(g);});box.dispose();pole.dispose();
 }
 update(pos){const off=((pos%this.P)+this.P)%this.P;this.group.position.z=off;for(const c of this.chunks)c.visible=c.userData.z+off>-150&&c.userData.z+off<26;}
 dispose(){for(const group of [this.group,this.static])group.traverse(o=>{o.geometry?.dispose();o.material?.dispose?.();});}
}
/** Small company halts/mining boundaries, placed as two distinct road-side sites.
 * No freestanding terrain sample pads and no repeated suburban cottages. */
export class RangerSettlements {
 static async create(library,scene,world,env) {
  const self=new RangerSettlements();self.group=new T.Group();scene.add(self.group);self.chunks=[];
  const ids=['fw_wall_stone_straight','fw_pillar_carved','fw_paving_stone'];
  const models=new Map(await Promise.all(ids.map(async id=>[id,await library.model(id,'lo')])));
  const bins=Array.from({length:8},()=>({matte:new Batch(),glow:new Batch()})),palette=PALETTES[world];
  const add=(id,x,y,z,yaw=0,size=.45)=>{const bin=bins[Math.max(0,Math.min(7,Math.floor(-z/32)))];for(const g of models.get(id))(g.mat==='glow'?bin.glow:bin.matte).add(g.geometry,mtx([x,y,z],[0,yaw,0],size),world===0?0xadb3a3:0xc0b7ab);};
  const box=new T.BoxGeometry(1,1,1);
  for(const off of [0,-128])for(const [side,d] of [[-1,31],[1,94]]) {
   const x=side*8,z=-d+off;
   for(const dx of [-.6,.6])for(const dz of [-.6,.6])add('fw_paving_stone',x+dx,.01,z+dz);
   add('fw_wall_stone_straight',x,0,z-1.25);
   for(const sideWall of [-1,1])add('fw_wall_stone_straight',x+sideWall*1.25,0,z,Math.PI/2);
   for(const sx of [-1,1])add('fw_pillar_carved',x+sx*1.24,0,z+1.2,0,.32);
   // Repeated stone architecture is one place, with an imperial field pennant.
   const b=bins[Math.max(0,Math.min(7,Math.floor(-z/32)))].matte;
   b.add(box,mtx([x,1.0,z-1.1],[0,0,0],[.035,2,.035]),0x574a37);
   b.add(box,mtx([x+.3,1.7,z-1.1],[0,0,0],[.6,.5,.03]),palette.flag);
   b.add(box,mtx([x+.3,1.7,z-1.075],[0,0,0],[.07,.36,.025]),0xd7c995);
  }
  box.dispose();bins.forEach((b,i)=>{const g=new T.Group();if(!b.matte.empty)g.add(b.matte.mesh());if(!b.glow.empty)g.add(b.glow.mesh({glow:true}));g.userData.z=-(i+.5)*32;self.chunks.push(g);self.group.add(g);});applyIbl(self.group,env,.55);return self;
 }
 update(pos){const offset=((pos%128)+128)%128;this.group.position.z=offset;for(const c of this.chunks)c.visible=c.userData.z+offset>-150&&c.userData.z+offset<32;}
 dispose(){this.group.removeFromParent();this.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
}
