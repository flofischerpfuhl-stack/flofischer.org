/** Bounce-only rigid toy actors. Immutable authored clips are sampled through masks;
 * no AnimationMixer, full-rest action overlap, origin recentering, or simulation RNG. */
import { THREE as T } from './three-kit.js';
import { AssetLibrary } from '../../games-assets/fernworld/runtime/asset-library.js';

export const TOY_IDS = { player:'TOY_HAZEL', rookie:'TOY_ROOKIE', scout:'TOY_SCOUT', zip:'TOY_ZIPPER', miner:'TOY_MINER', banker:'TOY_BANKER', swarm:'TOY_SWARMER', ghost:'TOY_GHOST', ace:'TOY_ACE', klonk:'TOY_GANTER_PARADE_TANK', drill:'TOY_QUOTA', walker:'TOY_BRIGADIER', mothership:'TOY_EQUALITY' };
export const GAMEPLAY_SCALE = { TOY_GANTER_PARADE_TANK:.55, TOY_QUOTA:.55, TOY_BRIGADIER:.68, TOY_EQUALITY:.58 };
const Y = new T.Vector3(0,1,0), q = new T.Quaternion(), delta = new T.Quaternion();
const fields = {position:'translation',quaternion:'rotation',scale:'scale'};
const wheel = /^(WheelsFront|WheelsRear|WheelLeft|WheelRight|Wheel-1|Wheel1|DriveL|DriveR)$/;
const elapsed = (time, start) => Math.max(0,time-start);
export const toyId = tk => TOY_IDS[tk.boss || tk.type || 'player'];
export function requiredToys(session) {
  const ids=new Set(session.tanks.map(toyId));
  for(const type of ({klonk:['rookie','scout'],drill:['miner'],walker:['banker'],mothership:['ace','ghost']}[session.boss?.boss]||[])) ids.add(TOY_IDS[type]);
  return [...ids];
}

/** Instanced authored rigid prop; each primitive keeps its exact mesh-to-asset TRS. */
export class ToyInstances {
  constructor(template, parent, capacity) {
    this.parts=[];this.capacity=capacity;this.n=0;this.matrix=new T.Matrix4();
    template.scene.updateMatrixWorld(true);
    template.scene.traverse(node=>{
      if(!node.isMesh)return;
      if(node.isSkinnedMesh)throw new Error('Rigid toy batch cannot discard skinning');
      const mesh=new T.InstancedMesh(node.geometry,node.material,capacity);
      mesh.name=template.id;mesh.count=0;mesh.frustumCulled=false;mesh.receiveShadow=true;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);parent.add(mesh);
      this.parts.push({mesh,local:node.matrixWorld.clone()});
    });
    if(!this.parts.length)throw new Error(`Empty rigid toy ${template.id}`);
  }
  begin(){this.n=0;}
  add(matrix){if(this.n>=this.capacity)return;for(const p of this.parts)p.mesh.setMatrixAt(this.n,this.matrix.multiplyMatrices(matrix,p.local));this.n++;}
  end(){for(const {mesh}of this.parts){mesh.count=this.n;mesh.instanceMatrix.needsUpdate=true;}}
  dispose(){for(const {mesh}of this.parts){mesh.removeFromParent();mesh.dispose();}}
}

export class ToyActor {
  constructor(template, layering=null) {
    this.id=template.id;this.root=new T.Group();this.root.name=this.id;
    this.model=template.scene.clone(true);this.root.add(this.model);
    this.gameplayScale=GAMEPLAY_SCALE[this.id]??1.15;this.model.scale.multiplyScalar(this.gameplayScale);
    this.rest=new Map();this.nodes=new Map();this.materials=new Set();const clones=new Map();
    this.model.traverse(n=>{
      this.nodes.set(n.name,n);this.rest.set(n.name,{position:n.position.clone(),quaternion:n.quaternion.clone(),scale:n.scale.clone()});
      if(n.isMesh){n.castShadow=false;n.receiveShadow=true;
        const copy=m=>{if(!clones.has(m)){const c=m.clone();if(this.id==='TOY_GHOST'){c.transparent=true;c.depthWrite=false;}clones.set(m,c);this.materials.add(c);}return clones.get(m);};
        n.material=Array.isArray(n.material)?n.material.map(copy):copy(n.material);
      }
    });
    this.clips=new Map();
    for(const clip of template.animations){
      const mask=layering?.clip_channel_masks?.[clip.name],tracks=[];
      for(const track of clip.tracks){
        const at=track.name.lastIndexOf('.'),name=track.name.slice(0,at),property=track.name.slice(at+1),node=this.nodes.get(name),rest=this.rest.get(name);
        if(!node||!rest?.[property])throw new Error(`Unbound toy track ${track.name}`);
        if(mask&&!mask[name]?.includes(fields[property]))continue;
        const base=rest[property].toArray(),width=base.length;
        // Authored complete diagnostics include thousands of rest keys: never let
        // those overwrite another gameplay layer. Explicit masks still reset at end.
        const changed=Array.from(track.values).some((v,i)=>Math.abs(v-base[i%width])>1e-5);
        if(!changed)continue;
        tracks.push({node,name,property,rest:rest[property],sample:track.createInterpolant(),width});
      }
      this.clips.set(clip.name,{duration:clip.duration,loop:clip.userData?.loop,speed:clip.userData?.controllerSpeed,tracks});
    }
    this.shadow=this.nodes.get('GroundShadow');this.lastT=-Infinity;this.disabledAim=null;
    this.debug={layers:[],id:this.id};
    this.previous=new Map([...this.rest].map(([n,r])=>[n,{position:r.position.clone(),quaternion:r.quaternion.clone(),scale:r.scale.clone()}]));
    this.transitions=new Map();
  }
  /** Apply only changing, masked channels. Event deltas preserve the controller yaw. */
  sample(name,time,{deltaPose=false,filter=null,weight=1}={}){
    const clip=this.clips.get(name);if(!clip||time<0||(!clip.loop&&time>clip.duration))return;
    const t=clip.loop?((time%clip.duration)+clip.duration)%clip.duration:Math.min(time,clip.duration);
    this.debug.layers.push(name);
    for(const tr of clip.tracks){
      if(filter&&!filter(tr))continue;
      const value=tr.sample.evaluate(t),prop=tr.node[tr.property];
      if(tr.property==='quaternion'){
        q.fromArray(value).normalize();
        if(deltaPose){delta.copy(tr.rest).invert().multiply(q);q.copy(prop).multiply(delta);}
        prop.slerp(q,weight);
      }else{
        for(let i=0;i<3;i++){const key=['x','y','z'][i];const target=deltaPose&&tr.property==='position'?prop[key]+value[i]-tr.rest[key]:value[i];prop[key]+=(target-prop[key])*weight;}
      }
    }
  }
  event(name,time,stamp,options={}){
    const clip=this.clips.get(name);if(!clip||time>clip.duration)return;
    let transition=this.transitions.get(name);
    if(!transition||transition.stamp!==stamp){
      transition={stamp,from:new Map(clip.tracks.map(tr=>[tr.name+'.'+tr.property,this.previous.get(tr.name)[tr.property].clone()]))};
      this.transitions.set(name,transition);
    }
    this.sample(name,time,options);
    const weight=Math.min(1,time/.08);
    if(weight<1)for(const tr of clip.tracks){const value=tr.node[tr.property],from=transition.from.get(tr.name+'.'+tr.property);if(tr.property==='quaternion'){q.copy(from).slerp(value,weight);value.copy(q);}else value.lerp(from,1-weight);}
  }
  pose(tk,session){
    const time=session.t;this.debug.layers=[];
    for(const [name,r]of this.rest){const n=this.nodes.get(name);n.position.copy(r.position);n.quaternion.copy(r.quaternion);n.scale.copy(r.scale);}
    const heading=tk.boss==='mothership'?tk.aim:tk.ang;
    this.root.position.set(tk.x-10,tk.boss==='mothership'?.14:0,tk.y-6);
    this.root.rotation.set(0,Math.PI/2-heading,0);
    if(tk.boss==='drill'){
      if(tk.under){const down=Math.min(1,elapsed(time,tk.underAt)/.3,Math.max(0,tk.special)/.3);this.root.position.y=-2.0*down;this.root.rotation.y=1.1707963267948966;}
      else if(time-tk.surfaceAt<.48)this.root.rotation.y=1.1707963267948966;
    }
    const travel=this.clips.get('Travel');
    // Travel recipes declare the exact source units/s. Distance divided by scale
    // keeps radius and linear wheel speed consistent at gameplay size.
    if(travel)this.sample('Travel',(tk.visualTravel??tk.tread)/this.gameplayScale/(travel.speed||1),{filter:tr=>wheel.test(tr.name)||tk.boss==='walker'});
    if(tk.boss==='mothership')this.sample('Travel_Hover',time);
    else this.sample('Idle',time,{filter:tr=>tr.property==='position'&&tr.name==='TurretYaw'});
    const turret=this.nodes.get(tk.boss==='walker'?'Mortar':'TurretYaw');
    if(turret)turret.quaternion.multiply(q.setFromAxisAngle(Y,-(tk.aim-heading)));
    const activeWarning=session.warn.find(w=>!w.done&&(tk.boss==='walker'?w.kind==='shell':tk.boss==='mothership'?w.kind==='beam':false));
    if(activeWarning)this.sample(tk.boss==='walker'?'Mortar_Charge':'Beam_Charge1.5s',activeWarning.max-activeWarning.t,{deltaPose:true});
    const firedWarning=session.warn.find(w=>w.done&&w.t>=-.6&&(tk.boss==='walker'?w.kind==='shell':tk.boss==='mothership'?w.kind==='beam':false));
    if(firedWarning)this.sample(tk.boss==='walker'?'Mortar_Fire':'Beam_Fire',-firedWarning.t,{deltaPose:true});
    if(tk.boss==='drill'){
      if(tk.under){if(tk.special<.45)this.sample('Pop_Up',.45-Math.max(0,tk.special),{deltaPose:true});else this.sample('Burrow_Down',Math.min(.3,elapsed(time,tk.underAt)),{deltaPose:true});}
      else if(time-tk.surfaceAt<.48)this.sample('RingShot',elapsed(time,tk.surfaceAt),{deltaPose:true});
    }
    // Ganter's pre-existing cooldown is visualized, never extended.
    if(tk.boss==='klonk'&&tk.want!=null&&tk.cd<=.45)this.sample('FanSalvo',.45-Math.max(0,tk.cd),{deltaPose:true});
    if(tk.charge>0)this.sample('Rocket_Charge',.45-tk.charge,{deltaPose:true});
    else if(time-tk.shotAt<1)this.event(tk.boss==='klonk'?'FanSalvo':'Fire_Recoil',elapsed(time,tk.shotAt)+(tk.boss==='klonk'?.45:0),tk.shotAt,{deltaPose:true});
    if(time-tk.mineAt<.8)this.event('DropMine',elapsed(time,tk.mineAt),tk.mineAt,{deltaPose:true});
    if(time-tk.hitAt<.5)this.event('Hit',elapsed(time,tk.hitAt),tk.hitAt,{deltaPose:true});
    if(!tk.alive){
      if(this.disabledAim==null)this.disabledAim=tk.aim;
      const clip=this.clips.get('Toy_Disabled');
      // Disabled takes ownership of event channels while held axle phase survives.
      for(const tr of clip?.tracks||[])tr.node[tr.property].copy(tr.rest);
      if(turret)turret.quaternion.multiply(q.setFromAxisAngle(Y,-(this.disabledAim-heading)));
      this.event('Toy_Disabled',Math.min(clip?.duration||0,elapsed(time,tk.disabledAt)),tk.disabledAt,{deltaPose:true});
    }
    const ghost=tk.def?.ghost,opacity=ghost?(session.ghostVisible(tk)?.85:.085):1;
    for(const m of this.materials){m.opacity=opacity;if(m.emissive)m.emissive.setScalar(tk.flash>0?.32:0);}
    this.root.visible=(!tk.under||time-tk.underAt<.3||tk.special<.3)&& (tk.alive||time-tk.disabledAt<2);
    this.root.updateMatrixWorld(true);this.lastT=time;
    for(const [name,r]of this.previous){const n=this.nodes.get(name);r.position.copy(n.position);r.quaternion.copy(n.quaternion);r.scale.copy(n.scale);}
  }
  socket(name,target=new T.Vector3()){
    const n=this.nodes.get(name);if(!n)throw new Error(`${this.id}: missing live socket ${name}`);
    return n.getWorldPosition(target);
  }
  muzzle(tk,angle,session){
    this.pose(tk,session);
    let name='MuzzleSocket';
    if(tk.boss==='klonk'){const d=Math.atan2(Math.sin(angle-tk.aim),Math.cos(angle-tk.aim));name=d<-.1?'MuzzleSocket_Right':d>.1?'MuzzleSocket_Left':'MuzzleSocket_Center';}
    else if(tk.boss==='mothership')name=angle<tk.aim?'MuzzleSocket_L':'MuzzleSocket_R';
    else if(tk.type==='swarm')name=`MuzzleSocket_${tk.shotSerial%3+1}`;
    else if(tk.boss==='drill'&&session.t-tk.surfaceAt<.01){
      const i=((Math.round((angle-.2)/(Math.PI/4))%8)+8)%8;name=`RingShotSocket${String((8-i)%8).padStart(2,'0')}`;
      this.root.rotation.y=1.1707963267948966;this.root.position.y=0;this.root.updateMatrixWorld(true);
    }
    return this.socket(name);
  }
  dispose(){this.root.removeFromParent();for(const m of this.materials)m.dispose();}
}

export class BounceArt {
  constructor(){this.library=new AssetLibrary();this.templates=new Map();this.layering=new Map();this.actors=new Map();}
  async prepare(session){
    await Promise.all(requiredToys(session).map(async id=>{
      const template=await this.library.template(id,'lo');
      const masks=await this.library.contract(id,'motionLayering');
      this.templates.set(id,template);this.layering.set(id,masks);
    }));
  }
  actor(tk,parent){
    if(!this.actors.has(tk.id)){
      const id=toyId(tk),template=this.templates.get(id);if(!template)throw new Error(`Toy not prepared: ${id}`);
      const actor=new ToyActor(template,this.layering.get(id));parent.add(actor.root);this.actors.set(tk.id,actor);
    }
    return this.actors.get(tk.id);
  }
  dispose(){for(const a of this.actors.values())a.dispose();this.actors.clear();this.library.dispose();}
}
