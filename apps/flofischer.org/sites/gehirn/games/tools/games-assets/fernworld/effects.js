/**
 * Fernworld elemental VFX library shared by the integrated games and asset workshop.
 * createEffectPool(THREE, scene) allocates once. emit/update reuse fixed slots, vectors and matrices.
 * Colour is not the only nature cue: each nature has a distinct geometric glyph.
 */
export const NATURES = {
 green:{name:'Green',color:0x72ad48,accent:0xd0e78a,glyph:'leaf'},
 ember:{name:'Ember',color:0xf66b29,accent:0xffdf77,glyph:'flame'},
 tide:{name:'Tide',color:0x4eb9e7,accent:0xd1f8ff,glyph:'drop'},
 rock:{name:'Rock',color:0xb69563,accent:0xedd7a0,glyph:'stone'},
 wind:{name:'Wind',color:0xbbe9e3,accent:0xffffff,glyph:'feather'},
 spark:{name:'Spark',color:0xffce43,accent:0xfffaaf,glyph:'bolt'},
 frost:{name:'Frost',color:0x94d8ed,accent:0xedfdff,glyph:'crystal'},
 ore:{name:'Ore',color:0xb98553,accent:0xffd396,glyph:'plate'},
 chime:{name:'Chime',color:0xe4bf64,accent:0xffedbb,glyph:'chime'},
 light:{name:'Light',color:0xffdc74,accent:0xffffdc,glyph:'star'},
 night:{name:'Night',color:0x6571b3,accent:0xc4b9ef,glyph:'crescent'},
 star:{name:'Star',color:0xa79adf,accent:0xf1efff,glyph:'diamond'},
};
const definitions={};
function preset(id,nature,shape,label,options={}){
 definitions[id]=Object.freeze({id,nature,shape,label,duration:1.2,count:shape==='chain'?7:shape==='orbit'?5:shape==='shot'?7:14,
  speed:shape==='shot'?5:2.4,radius:1.5,size:.15,spread:.65,damageCue:true,...options});
}
for(const [nature,n] of Object.entries(NATURES)){
 for(const [shape,title] of [['shot','projectile'],['orbit','orbiting crown'],['arc','returning arc'],['chain','linked strike'],['trap','ground trap'],['burst','impact'],['guard','shield'],['trail','movement trail']])
  preset(`${nature}_${shape}`,nature,shape,`${n.name} ${title}`,{duration:shape==='trap'?2.4:1.2});
}
// Every canonical starter move has a named reusable recipe, not just a renamed weapon icon.
const MOVES={
 green:[['seed_shot','shot','Seed Shot'],['leaf_ring','orbit','Leaf Ring'],['burrow','trail','Burrow',{radius:.6}],['spore_puff','burst','Spore Puff',{size:.09,count:24,duration:1.7}],
 ['vine_whip','chain','Vine Whip',{radius:2.4}],['root_snare','trap','Root Snare',{size:.23}],['moss_shield','guard','Moss Shield'],['mudslide','arc','Mudslide',{size:.28}],
 ['grove_quake','quake','Grove Quake',{radius:2.6}],['thorn_wall','wall','Thorn Wall',{count:11,size:.28}],['healing_bloom','heal','Healing Bloom',{duration:2.2}],['sapling_guard','guard','Sapling Guard',{size:.3}],
 ['frond_boomerang','arc','Frond Boomerang'],['spore_pods','trap','Spore Pods'],['seed_storm','shot','Seed Storm',{count:24,spread:1.5}],['leaf_crown','orbit','Leaf Crown',{count:9}]],
 ember:[['ember_shot','shot','Ember Shot'],['tail_flare','arc','Tail Flare'],['spark_leap','trail','Spark Leap',{duration:.8}],['warm_up','heal','Warm Up'],
 ['ember_ring','orbit','Ember Ring'],['heat_wave','wall','Heat Wave',{radius:2.5}],['cinder_traps','trap','Cinder Traps'],['coal_armour','guard','Coal Armour'],
 ['leaping_flame','chain','Leaping Flame'],['blazing_tail','arc','Blazing Tail',{radius:2.2,size:.22}],['hearth_guard','guard','Hearth Guard',{radius:1.8}],['firestorm','shot','Firestorm',{count:24,spread:1.5}],
 ['ember_crown','orbit','Ember Crown',{count:9}]],
 tide:[['bubble_shot','shot','Bubble Shot'],['droplet_ring','orbit','Droplet Ring'],['splash','burst','Splash',{count:22}],['mist','heal','Mist',{duration:2.2,size:.1}],
 ['ripple_chain','chain','Ripple Chain'],['return_wave','arc','Return Wave'],['spray_fan','shot','Spray Fan',{count:18,spread:1.4}],['geyser_pools','trap','Geyser Pools'],
 ['tidal_surge','wall','Tidal Surge',{size:.25,radius:2.6}],['pearl_crown','orbit','Pearl Crown',{count:9}],['whirlpool','vortex','Whirlpool',{count:24,duration:2}],['rain_call','rain','Rain Call',{count:24,duration:2}],
 ['bubble_storm','shot','Bubble Storm',{count:24,spread:1.5}]],
};
for(const [nature,moves] of Object.entries(MOVES))for(const [id,shape,label,options] of moves)preset(id,nature,shape,label,{starterMove:true,...options});
for(const [id,shape,label,options] of [
 ['hex_bind','orbit','Violet hex binding',{duration:2.5}],['hex_break','burst','Hex shatters and creature is freed',{count:22,duration:.9}],
 ['evolution','heal','Fernling maturation',{count:24,duration:2.6,radius:1.3}],['teleport','vortex','Star-fossil teleport',{count:20}],
 ['xp_sparks','burst','Freed hex sparks',{count:16,size:.065}],['fossil_pickup','heal','Fernstone pickup',{count:12,duration:1.3}],
])preset(id,'star',shape,label,{shared:true,...options});
for(const [id,nature,shape,label] of [['quick_paws','wind','trail','Quick Paws'],['keen_nose','light','orbit','Keen Nose'],['thick_hide','rock','guard','Thick Hide'],['deep_rest','green','heal','Deep Rest'],['momos_call','chime','burst',"Momo’s Call"],['freeze','frost','guard','Frozen'],['paralysis','spark','chain','Paralysis'],['stun','chime','orbit','Stunned'],['lava_warning','ember','trap','Lava warning'],['drop_zone','light','trap','Landing zone'],['robot_break','ore','burst','Automaton debris']])preset(id,nature,shape,label,{shared:true});
// Art counts are deliberately sparse: a main form and at most two supporting marks.
// Gameplay damage/projectile counts belong to the caller, not this visual recipe.
for(const r of Object.values(definitions))if(!r.shared&&['green','ember','tide'].includes(r.nature)){
 const storm=['seed_storm','firestorm','bubble_storm','spray_fan'].includes(r.id);
 const count=storm?9:r.shape==='orbit'?(r.id.endsWith('crown')?7:5):r.shape==='shot'?3:r.shape==='chain'?4:r.shape==='trap'?3:r.shape==='rain'?7:4;
 definitions[r.id]=Object.freeze({...r,count,speed:r.shape==='shot'?4:r.speed,castEnd:.14,impactAt:.73,fadeStart:.86,artFamily:true,duration:r.shape==='shot'?1.35:r.duration});
}
// Only the 24 commissioned generic recipes use these forms. Shared-state recipes
// keep their established contract and can be commissioned independently.
for(const nature of ['rock','wind','spark'])for(const shape of ['shot','orbit','arc','chain','trap','burst','guard','trail']){
 const id=nature+'_'+shape,r=definitions[id];
 const count=nature==='rock'?(shape==='shot'?3:shape==='orbit'?3:shape==='chain'?5:shape==='burst'?5:shape==='trail'?3:1):nature==='wind'?(shape==='shot'||shape==='orbit'||shape==='chain'||shape==='trail'?3:1):(shape==='orbit'?4:shape==='trail'?3:1);
 definitions[id]=Object.freeze({...r,count,speed:shape==='shot'?4:r.speed,natureArt:true,castEnd:.16,impactAt:.73,fadeStart:.87,duration:shape==='shot'?1.35:r.duration});
}
// This bounded commission changes only Frost/Ore/Chime generic IDs, never shared states.
for(const nature of ['frost','ore','chime'])for(const shape of ['shot','orbit','arc','chain','trap','burst','guard','trail']){
 const id=nature+'_'+shape,r=definitions[id],count=shape==='shot'?3:shape==='orbit'?3:shape==='chain'?4:shape==='trail'?3:shape==='burst'&&nature==='frost'?3:1;
 definitions[id]=Object.freeze({...r,count,speed:shape==='shot'?4:r.speed,crystalArt:true,castEnd:.16,impactAt:.73,fadeStart:.87,duration:shape==='shot'?1.35:r.duration});
}
// Light / Night / Star generic art only. Shared IDs remain on their original path.
for(const nature of ['light','night','star'])for(const shape of ['shot','orbit','arc','chain','trap','burst','guard','trail']){
 const id=nature+'_'+shape,r=definitions[id],count=shape==='orbit'?3:shape==='chain'?3:shape==='trail'?2:shape==='shot'&&nature==='night'?2:shape==='trap'&&nature==='star'?3:shape==='burst'&&nature!=='star'?3:1;
 definitions[id]=Object.freeze({...r,count,speed:shape==='shot'?4:r.speed,astralArt:true,castEnd:.16,impactAt:.73,fadeStart:.87,duration:shape==='shot'?1.35:r.duration});
}
// Shared feedback is a separate visual commission; it never invokes gameplay.
const SHARED_COUNTS={quick_paws:2,keen_nose:2,thick_hide:3,deep_rest:3,momos_call:2,freeze:1,paralysis:2,stun:3,hex_bind:3,hex_break:3,evolution:4,teleport:3,xp_sparks:5,fossil_pickup:1,lava_warning:1,drop_zone:1,robot_break:5};
for(const [id,count] of Object.entries(SHARED_COUNTS)){const r=definitions[id];definitions[id]=Object.freeze({...r,count,sharedArt:true,castEnd:.16,impactAt:.73,fadeStart:.87,damageCue:false});}
definitions.creeping_vines=Object.freeze({...definitions.vine_whip,id:'creeping_vines',label:'Creeping Vines',aliasOf:'vine_whip'});
export const EFFECTS=Object.freeze(definitions);

function starShape(T,points=5,inner=.45){const shape=new T.Shape();for(let i=0;i<points*2;i++){const a=i*Math.PI/points+Math.PI/2,r=i%2?inner:1;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?shape.lineTo(x,y):shape.moveTo(x,y)}shape.closePath();return shape}
function glyphGeometry(T,nature){
 const glyph=NATURES[nature].glyph;
 if(glyph==='stone')return new T.IcosahedronGeometry(1,0);
 if(glyph==='crystal'){const g=new T.OctahedronGeometry(1,0);g.scale(.42,1.6,.42);return g}
 if(glyph==='diamond'){const g=new T.OctahedronGeometry(1,0);g.scale(.7,1.2,.7);return g}
 if(glyph==='chime'){const g=new T.TorusGeometry(.75,.12,4,20);return g}
 if(glyph==='star')return new T.ExtrudeGeometry(starShape(T),{depth:.14,bevelEnabled:false});
 if(glyph==='plate'){const g=new T.CylinderGeometry(.65,.8,.16,6);g.rotateX(Math.PI/2);return g}
 if(glyph==='bolt'){const s=new T.Shape();[[-.08,1],[-.65,-.05],[-.1,-.05],[-.35,-1],[.65,.25],[.1,.25]].forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return new T.ExtrudeGeometry(s,{depth:.12,bevelEnabled:false})}
 if(glyph==='crescent'){const s=new T.Shape();s.absarc(0,0,1,.6,Math.PI*2-.6,false);s.quadraticCurveTo(-.05,0,.825,.565);return new T.ExtrudeGeometry(s,{depth:.1,bevelEnabled:false})}
 const g=new T.SphereGeometry(1,10,7),p=g.attributes.position;
 for(let i=0;i<p.count;i++){const y=p.getY(i),t=(y+1)*.5;let x=p.getX(i),z=p.getZ(i);
  if(glyph==='leaf'||glyph==='feather'){x*=.47*(1-.35*t);z*=.15;}
  if(glyph==='flame'){x*=.65*(1-t*.65);z*=.45*(1-t*.5);x+=t*t*.4;}
  if(glyph==='drop'){x*=.65*(1-.65*t);z*=.65*(1-.65*t);}
  p.setXYZ(i,x,y*1.1,z);
 }g.computeVertexNormals();return g;
}

// Large connected silhouettes carry the move. Small nature glyphs are only the wake.
// All geometry is built once, and every live instance still consumes the same fixed pool.
function coreGeometries(T) {
 const ring=new T.TorusGeometry(1,.055,5,40);ring.rotateX(Math.PI/2);
 const arc=new T.TorusGeometry(1,.12,5,32,Math.PI*1.45);arc.rotateX(Math.PI/2);
 const spiralPoints=[];
 for(let i=0;i<=40;i++){const t=i/40,a=t*Math.PI*3.6,r=.45+t*.55;spiralPoints.push(new T.Vector3(Math.cos(a)*r,t*.8,Math.sin(a)*r));}
 const spiral=new T.TubeGeometry(new T.CatmullRomCurve3(spiralPoints),40,.035,4,false);
 const chainPoints=[];
 for(let i=0;i<=12;i++)chainPoints.push(new T.Vector3(Math.sin(i*2.5)*.07,.025*Math.cos(i*2),i/12));
 const chain=new T.TubeGeometry(new T.CatmullRomCurve3(chainPoints),24,.035,4,false);
 const wave=new T.TorusGeometry(1,.16,5,28,Math.PI);wave.rotateX(Math.PI/2);
 const orb=new T.SphereGeometry(1,12,8);
 return {ring,arc,spiral,chain,wave,orb};
}

// Canonical shared forms let unrelated active moves batch within their nature.
const STARTER_FORMS=Object.freeze({
 green:Object.freeze({shot:'shot',trap:'shot',orbit:'orbit',arc:'arc',guard:'guard',heal:'guard',wall:'wall',chain:'chain',vortex:'orbit',quake:'orbit',trail:'orbit',burst:'orbit',rain:'orbit'}),
 ember:Object.freeze({shot:'shot',trap:'trap',guard:'trap',orbit:'shot',arc:'shot',heal:'shot',wall:'shot',chain:'shot',vortex:'shot',quake:'shot',trail:'shot',burst:'shot',rain:'shot'}),
 tide:Object.freeze({shot:'shot',guard:'shot',orbit:'orbit',rain:'orbit',arc:'arc',chain:'arc',wall:'arc',vortex:'arc',quake:'arc',trail:'arc',trap:'trap',heal:'trap',burst:'trap'}),
});
// Code-native sculpt library. Construction only: triangles, paint and normals are
// baked into shared geometry; emit/update never allocate any of these objects.
function starterGeometries(T){
 const out={};
 const palettes={green:[0x397545,0x9fc75e,0xe6c278],ember:[0xe94e22,0xffab33,0xffef9b],tide:[0x247fa4,0x60cbe2,0xe4fcf5]};
 function sculpture(){
  const pos=[],paint=[];const matrix=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler(),v=new T.Vector3(),sc=new T.Vector3(),col=new T.Color();
  return {add(g,color,x=0,y=0,z=0,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){
   const a=g.index?g.toNonIndexed():g;matrix.compose(v.set(x,y,z),q.setFromEuler(e.set(rx,ry,rz)),sc.set(sx,sy,sz));a.applyMatrix4(matrix);col.setHex(color);
   for(let i=0;i<a.attributes.position.count;i++){pos.push(a.attributes.position.getX(i),a.attributes.position.getY(i),a.attributes.position.getZ(i));paint.push(col.r,col.g,col.b);}
   if(a!==g)a.dispose();g.dispose();
  },finish(){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('aPaint',new T.Float32BufferAttribute(paint,3));g.computeVertexNormals();return g;}};
 }
 function leaf(){
  // A folded lamina with a central keel and a curling tip, along local +Z.
  const a=[],rows=12;function point(t,w){const width=Math.sin(Math.PI*t)*(.48-.17*t);return [w*width,.22*Math.sin(t*Math.PI)+.17*t*t-.12*Math.abs(w)*Math.sin(t*Math.PI),t*2-1];}
  function tri(a0,b,c){a.push(...a0,...b,...c)}
  for(let i=0;i<rows;i++)for(let j=0;j<2;j++){const t=i/rows,u=(i+1)/rows,w=j-1,k=j;tri(point(t,w),point(u,w),point(u,k));tri(point(t,w),point(u,k),point(t,k));}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(a,3));g.computeVertexNormals();return g;
 }
 function tongue(offset=0){
  const a=[],rows=16,ring=9;function point(t,j){const angle=j/ring*Math.PI*2,r=Math.sin(Math.PI*t)**.7*(.5-.28*t);return [Math.cos(angle)*r+Math.sin(t*5+offset)*t*t*.32,Math.sin(angle)*r*.65+.75*t*t, .48-2.5*t];}
  for(let i=0;i<rows;i++)for(let j=0;j<ring;j++){a.push(...point(i/rows,j),...point((i+1)/rows,j),...point((i+1)/rows,j+1),...point(i/rows,j),...point((i+1)/rows,j+1),...point(i/rows,j+1));}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(a,3));g.computeVertexNormals();return g;
 }
 function ribbon(kind){
  const a=[],rows=32;function point(t,w){const angle=(t-.5)*Math.PI*.85,r=1+(w-.5)*(.30+.20*Math.sin(Math.PI*t))+w*.045*Math.sin(t*37);return [Math.sin(angle)*r,kind==='water'?.08+Math.sin(Math.PI*t)*(.28+.24*w)+w*.035*Math.sin(t*29):.04+Math.sin(t*10)*.055,Math.cos(angle)*r];}
  for(let i=0;i<rows;i++){const t=i/rows,u=(i+1)/rows;a.push(...point(t,0),...point(u,0),...point(u,1),...point(t,0),...point(u,1),...point(t,1));}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(a,3));g.computeVertexNormals();return g;
 }
 for(const nature of ['green','ember','tide']){
  const [dark,base,accent]=palettes[nature];
  for(const kind of ['shot','orbit','arc','chain','trap','guard','heal','wall','vortex','quake','trail','burst','rain']){
   if(STARTER_FORMS[nature][kind]!==kind)continue;
   const b=sculpture();
   if(nature==='green'){
    if(kind==='shot'||kind==='trap'){
     b.add(new T.SphereGeometry(1,14,9),0xa36d3c,0,.01,.05,.36,.3,.61);
     b.add(new T.SphereGeometry(1,10,7),accent,0,.19,.16,.20,.13,.39);
     for(let i=0;i<3;i++)b.add(leaf(),i%2?base:dark,Math.sin(i*2.094)*.16,.12,-.32,.7,.7,.72,-.15,i*2.094,.25);
    }else if(kind==='chain'){
     const points=[];for(let i=0;i<=24;i++){const t=i/24;points.push(new T.Vector3(Math.sin(t*9)*.12,Math.sin(t*Math.PI)*.13,t));}
     b.add(new T.TubeGeometry(new T.CatmullRomCurve3(points),24,.045,6,false),dark);
     for(let i=0;i<5;i++)b.add(leaf(),i%2?base:dark,(i%2?1:-1)*.11,.04,i*.2,.29,.45,.20,0,(i%2?1:-1)*1.0);
    }else{
     const pieces=kind==='arc'?5:kind==='wall'?7:kind==='guard'?5:kind==='heal'?5:3;
     for(let i=0;i<pieces;i++){const a=(i/(pieces-1)-.5)*(kind==='arc'?2.7:1.5);b.add(leaf(),i%2?base:dark,Math.sin(a)*.6,.06+i%2*.06,Math.cos(a)*.6,.45,.8,.55,.12,a-.45);}
     b.add(leaf(),accent,0,.085,.6,.08,.75,.56,.12,0);
    }
   }else if(nature==='ember'){
    if(kind==='trap'||kind==='guard'){
     for(let i=0;i<5;i++){const a=i*2.4;b.add(new T.DodecahedronGeometry(1,0),i%2?0x542e2d:0x865044,Math.cos(a)*.38,.07,Math.sin(a)*.32,.25,.13,.23,0,a);}
     for(let i=0;i<3;i++)b.add(tongue(i),i===1?accent:base,(i-1)*.18,.08,0,.24,.46,.26,-1.1,0,i*.25);
    }else{
     b.add(tongue(),dark,0,0,0,1,1,1);
     b.add(tongue(1.6),base,-.23,.13,-.19,.52,.75,.77,0,.28,-.2);
     b.add(tongue(3),base,.21,.07,-.18,.5,.8,.69,0,-.25,.3);
     b.add(tongue(.7),accent,0,.23,.08,.48,.65,.58);
    }
   }else{
    if(kind==='orbit'||kind==='rain'){
     b.add(glyphGeometry(T,'tide'),base,0,0,0,.48,.68,.48);
     b.add(glyphGeometry(T,'tide'),accent,-.13,.08,.22,.10,.38,.06);
    }else if(kind==='shot'||kind==='guard'){
     b.add(new T.SphereGeometry(1,24,16),base,0,0,0,.72,.7,.78);
     // Three painted crescent highlights are real geometry on the ONE shell.
     for(let i=0;i<2;i++)b.add(new T.TorusGeometry(.69,.035,4,16,.65),accent,0,.035,0,1,1,1,.15,0,1.5+i*2.7);
    }else{
     b.add(ribbon('water'),dark,0,0,0,1,1,1);
     b.add(ribbon('water'),base,0,.055,.035,.95,.86,.95);
     b.add(ribbon('water'),accent,0,.19,.02,.95,.42,.95);
     if(kind==='trap'||kind==='burst'||kind==='heal')for(let i=0;i<3;i++)b.add(glyphGeometry(T,'tide'),base,(i-1)*.25,.4+i%2*.32,0,.15,.32,.15,0,0,(i-1)*-.4);
    }
   }
   out['starter:'+nature+':'+kind]=b.finish();
  }
 }
 return out;
}

// Rock / Wind / Spark are original code-native, painted sculpture meshes.
// Construction helpers allocate only while the pool is created, never per frame.
function natureGeometries(T){
 const out={};
 function sculpture(){
  const positions=[],paints=[],v=new T.Vector3(),q=new T.Quaternion(),e=new T.Euler(),sc=new T.Vector3(),matrix=new T.Matrix4(),colour=new T.Color();
  return {add(g,hex,x=0,y=0,z=0,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){const a=g.index?g.toNonIndexed():g;matrix.compose(v.set(x,y,z),q.setFromEuler(e.set(rx,ry,rz)),sc.set(sx,sy,sz));a.applyMatrix4(matrix);colour.setHex(hex);for(let i=0;i<a.attributes.position.count;i++){positions.push(a.attributes.position.getX(i),a.attributes.position.getY(i),a.attributes.position.getZ(i));paints.push(colour.r,colour.g,colour.b);}if(a!==g)a.dispose();g.dispose();},finish(){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('aPaint',new T.Float32BufferAttribute(paints,3));g.computeVertexNormals();return g;}};
 }
 function geometry(points){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.computeVertexNormals();return g;}
 function shard(){
  // Four noncircular horizontal strata; triangulated broken faces, not a sphere.
  const p=[],rings=[[-.40,.47],[-.17,.76],[.16,.67],[.48,.34]],n=7;
  function point(j,k){const a=j/n*Math.PI*2,r=rings[k][1]*(1+.16*Math.sin(j*4.7+k*.7));return [Math.cos(a)*r,rings[k][0]+.06*Math.sin(j*2.1+k),Math.sin(a)*r*.86+.10*k];}
  for(let k=0;k<3;k++)for(let j=0;j<n;j++){p.push(...point(j,k),...point(j+1,k),...point(j+1,k+1),...point(j,k),...point(j+1,k+1),...point(j,k+1));}
  for(let j=0;j<n;j++)p.push(0,.48,.3,...point(j,3),...point(j+1,3),0,-.41,0,...point(j+1,0),...point(j,0));
  return geometry(p);
 }
 function segment(a,b,width){
  // Crossed, tapered ribbons remain readable at the steep gameplay camera.
  const dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz)||1,nx=dz/len*width,nz=-dx/len*width;
  return geometry([a[0]-nx,a[1],a[2]-nz,a[0]+nx,a[1],a[2]+nz,b[0]+nx*.8,b[1],b[2]+nz*.8,a[0]-nx,a[1],a[2]-nz,b[0]+nx*.8,b[1],b[2]+nz*.8,b[0]-nx*.8,b[1],b[2]-nz*.8,a[0],a[1]-width,a[2],a[0],a[1]+width,a[2],b[0],b[1]+width*.8,b[2],a[0],a[1]-width,a[2],b[0],b[1]+width*.8,b[2],b[0],b[1]-width*.8,b[2]]);
 }
 function line(b,points,width,hex){for(let i=0;i<points.length-1;i++)b.add(segment(points[i],points[i+1],width),hex);}
 function air(kind,phase=0){
  const p=[],rows=40;
  function point(t,w){
   const taper=Math.sin(Math.PI*t)**.65,width=(kind==='channel'?.16:.11)*taper;
   if(kind==='channel'){const a=t*Math.PI*.95+phase,r=.38+Math.sin(t*Math.PI)*.14;return [Math.sin(a)*r*(1+w*width),Math.cos(a)*r*(1+w*width),t*2.1-1.25];}
   const angle=t*(kind==='spiral'?Math.PI*2.8:Math.PI*1.3)+phase,r=(kind==='spiral'?.90-.46*t:1)+w*width;
   return [Math.sin(angle)*r,kind==='spiral'?t*.7:.12*Math.sin(t*Math.PI),Math.cos(angle)*r];
  }
  for(let i=0;i<rows;i++){const t=i/rows,u=(i+1)/rows;p.push(...point(t,-1),...point(u,-1),...point(u,1),...point(t,-1),...point(u,1),...point(t,1));}return geometry(p);
 }
 // Layered warm ochre boulder with two pale fracture lips and a dark underside.
 {const b=sculpture();b.add(shard(),0x8d633e);b.add(shard(),0xbf9358,0,.13,.01,.96,.68,.94);b.add(shard(),0xe0bc7c,-.02,.28,.02,.76,.28,.78);b.add(shard(),0xf0d59b,-.1,.32,.13,.26,.12,.46);out['nature:rock:chunk']=b.finish();}
 // A ground crack is dark negative space framed by offset, raised broken edges.
 {const b=sculpture();const path=[[0,.016,0],[.18,.016,.24],[-.14,.016,.48],[.11,.016,.76],[-.04,.016,1]];line(b,path,.09,0x3c2b22);for(let i=0;i<4;i++){const z=i*.25+.1;b.add(shard(),i%2?0xb98a4e:0xd3a765,(i%2?1:-1)*.17,.025,z,.20,.10,.26);}out['nature:rock:fissure']=b.finish();}
 // Touching staggered plates form one connected, open stone bulwark.
 {const b=sculpture();for(let i=0;i<7;i++){const a=(i-3)*.29;b.add(shard(),i%2?0xba8d51:0x9e7245,Math.sin(a)*1.0,.26+(i%2)*.06,Math.cos(a),.38,.64+(i%2)*.15,.28,0,a);b.add(shard(),0xe4c48a,Math.sin(a)*1.0,.55+(i%2)*.08,Math.cos(a),.36,.14,.27,0,a);}out['nature:rock:plates']=b.finish();}
 for(const kind of ['channel','sickle','spiral']){const b=sculpture();b.add(air(kind),0x83d5cd);b.add(air(kind,kind==='channel'?Math.PI:.16),0xeafff7,0,.025,0,.94,1,.94);if(kind==='channel')b.add(air('sickle',.2),0xd9fff7,0,0,.72,.46,.46,.46,Math.PI/2);out['nature:wind:'+kind]=b.finish();}
 // One main conductor, with exactly three short subordinate branches. White
 // narrow core lies just above the amber ribbon; no bloom or screen flash.
 {const b=sculpture(),path=[[0,0,-1],[.10,.025,-.68],[-.16,0,-.40],[.15,.01,-.09],[-.10,0,.22],[.07,.01,.52],[0,0,.86]],branches=[[[.10,.025,-.68],[.42,.02,-.50],[.30,.01,-.26]],[[-.16,0,-.40],[-.42,.02,-.14],[-.51,0,-.03]],[[-.10,0,.22],[.31,.01,.39],[.42,0,.60]]];line(b,path,.085,0xffbf31);for(const branch of branches)line(b,branch,.042,0xffcb4b);line(b,path.map(p=>[p[0],p[1]+.012,p[2]]),.025,0xfffce5);out['nature:spark:bolt']=b.finish();}
 {const b=sculpture();for(let i=0;i<3;i++){const a=i*Math.PI*2/3,c=Math.cos(a),s=Math.sin(a),path=[[0,.018,0],[c*.23+s*.1,.018,s*.23-c*.1],[c*.46-s*.1,.018,s*.46+c*.1],[c*.78,.018,s*.78]];line(b,path,.055,0xe7a92d);line(b,path.map(p=>[p[0],p[1]+.008,p[2]]),.018,0xfff8c9);}out['nature:spark:charge']=b.finish();}
 {const b=sculpture();b.add(new T.OctahedronGeometry(.16,0),0xfff7c6);line(b,[[0,0,0],[.16,.05,.22],[-.05,.02,.43],[.16,0,.68]],.035,0xffce43);out['nature:spark:node']=b.finish();}
 return out;
}

// Frost / Ore / Chime: closed cut crystal, folded metal, open acoustic fronts.
// These meshes and their painted faces are baked once at pool creation.
function crystalGeometries(T){
 const out={};
 function sculpture(){
  const positions=[],paints=[],v=new T.Vector3(),q=new T.Quaternion(),e=new T.Euler(),sc=new T.Vector3(),matrix=new T.Matrix4(),colour=new T.Color();
  return {add(g,hex,x=0,y=0,z=0,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){const a=g.index?g.toNonIndexed():g;matrix.compose(v.set(x,y,z),q.setFromEuler(e.set(rx,ry,rz)),sc.set(sx,sy,sz));a.applyMatrix4(matrix);if(hex!==null)colour.setHex(hex);for(let i=0;i<a.attributes.position.count;i++){positions.push(a.attributes.position.getX(i),a.attributes.position.getY(i),a.attributes.position.getZ(i));paints.push(hex===null?a.attributes.aPaint.getX(i):colour.r,hex===null?a.attributes.aPaint.getY(i):colour.g,hex===null?a.attributes.aPaint.getZ(i):colour.b);}if(a!==g)a.dispose();g.dispose();},finish(){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('aPaint',new T.Float32BufferAttribute(paints,3));g.computeVertexNormals();return g;}};
 }
 function geometry(p){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.computeVertexNormals();return g;}
 function cut(b,outline,height,thickness,dark,base,white){
  // Watertight six-sided cut, peaked ridge and bounded bevel rim. No octahedra.
  const n=outline.length;for(let i=0;i<n;i++){
   const a=outline[i],c=outline[(i+1)%n],ai=[a[0]*.78,height*.58,a[1]*.78],ci=[c[0]*.78,height*.58,c[1]*.78],ao=[a[0],0,a[1]],co=[c[0],0,c[1]],ab=[a[0],-thickness,a[1]],cb=[c[0],-thickness,c[1]];
   b.add(geometry([0,height,0,...ai,...ci]),i%3===0?white:base);
   b.add(geometry([...ai,...ao,...co,...ai,...co,...ci]),i%2?white:base);
   b.add(geometry([...ao,...ab,...cb,...ao,...cb,...co]),dark);
   b.add(geometry([0,-thickness,0,...cb,...ab]),dark);
  }
 }
 function band(start,end,radius,width,height=0){
  const p=[],rows=32;function point(t,w){const a=start+(end-start)*t,taper=.18+.82*Math.sin(Math.PI*t)**.6,r=radius+w*width*taper;return [Math.sin(a)*r,height*(1-w*w*.30)*Math.sin(Math.PI*t),Math.cos(a)*r];}
  for(let i=0;i<rows;i++){const t=i/rows,u=(i+1)/rows;p.push(...point(t,-1),...point(u,-1),...point(u,1),...point(t,-1),...point(u,1),...point(t,1));}return geometry(p);
 }
 const ice=[[-.24,-.67],[.13,-.58],[.30,-.06],[.08,.97],[-.19,.45],[-.32,-.12]];
 {const b=sculpture();cut(b,ice,.22,.11,0x7faec1,0xc4e9ee,0xf5ffff);out['crystal:frost:shard']=b.finish();}
 {const b=sculpture();for(let i=0;i<3;i++){const a=i*2.094;b.add(band(a-.8,a+.8,.55,.035),0xd7f4ef,0,.008,0);b.add(band(a-.54,a+.54,.81,.018),0xf5ffff,0,.012,0);}out['crystal:frost:rime']=b.finish();}
 {const b=sculpture(),outline=[],shape=new T.Shape();for(let i=0;i<=10;i++){const a=(i/10-.5)*2.6;outline.push([Math.sin(a)*1.1,Math.cos(a)*1.1]);}for(let i=10;i>=0;i--){const a=(i/10-.5)*2.6;outline.push([Math.sin(a)*.76,Math.cos(a)*.76]);}for(let i=0;i<outline.length;i++){const p=outline[i];i?shape.lineTo(p[0],p[1]):shape.moveTo(p[0],p[1]);}shape.closePath();const g=new T.ExtrudeGeometry(shape,{depth:.16,steps:1,bevelEnabled:true,bevelSegments:1,bevelSize:.025,bevelThickness:.025});g.rotateX(Math.PI/2);b.add(g,0xc8e7ec,0,.18,0);b.add(band(-1.3,1.3,1.09,.035),0xf5ffff,0,.205,0);out['crystal:frost:shield']=b.finish();}
 {const b=sculpture();for(let i=0;i<3;i++){const q=sculpture();cut(q,ice,.22,.11,0x7faec1,0xc4e9ee,0xf5ffff);b.add(q.finish(),null,(i-1)*.34,.25+(i===1?.10:0),(i-1)*.34,.84,.85,.78,-1.02,(i-1)*.55,(i-1)*-.18);}out['crystal:frost:cluster']=b.finish();}
 const metal=[[-.42,-.48],[.26,-.54],[.45,-.19],[.32,.57],[0,.82],[-.32,.57]];
 function lamella(){const b=sculpture();cut(b,metal,.17,.10,0x60412e,0xb77a45,0xe1b274);b.add(new T.BoxGeometry(.045,.025,.70),0xf0cf92,0,.19,.02,1,1,1);b.add(new T.BoxGeometry(.41,.025,.045),0x6f4930,0,.105,-.27);return b.finish();}
 out['crystal:ore:plate']=lamella();
 {const b=sculpture();for(let i=0;i<5;i++){const a=(i-2)*.35;b.add(lamella(),null,Math.sin(a)*.72,.25,Math.cos(a)*.72,.37,.80,.55,-1.10,a);}out['crystal:ore:teeth']=b.finish();}
 {const b=sculpture();for(let i=0;i<7;i++){const a=(i-3)*.30;b.add(lamella(),null,Math.sin(a),.20,Math.cos(a),.52,1.35,.65,-.98,a);b.add(new T.BoxGeometry(.025,.035,.58),0xebbd7e,Math.sin(a)*1.03,.60,Math.cos(a)*1.03,1,1,1,.3,a);}out['crystal:ore:armour']=b.finish();}
 {const b=sculpture();b.add(band(-1.0,1.0,1,.11,.06),0xd9b362);b.add(band(-1.0,1.0,1.055,.035,.065),0xfff2c9,0,.015,0);out['crystal:chime:front']=b.finish();}
 {const b=sculpture();for(let i=0;i<3;i++){b.add(band(-2.65,2.65,.45+i*.30,.025+i*.005),i===2?0xffecc4:0xc3a057,0,.01+i*.004,0);}out['crystal:chime:pulse']=b.finish();}
 {const b=sculpture();b.add(new T.SphereGeometry(.13,8,6),0xffefbd,0,.05,0);for(let i=0;i<2;i++)b.add(band(-1.1,1.1,.30+i*.16,.035),i?0xc59d4d:0xffe5a4,0,.02,0);out['crystal:chime:node']=b.finish();}
 {const b=sculpture();b.add(band(-1.5,1.5,1,.20,.62),0xd7b36a);b.add(band(-1.5,1.5,1.16,.045,.62),0xffedc4,0,.015,0);out['crystal:chime:shell']=b.finish();}
 return out;
}

// Original shaped Light / Night / Star surfaces. Only pool construction allocates.
function astralGeometries(T){
 const out={};
 function sculpture(){
  const pos=[],paint=[],matrix=new T.Matrix4(),v=new T.Vector3(),q=new T.Quaternion(),e=new T.Euler(),sc=new T.Vector3(),col=new T.Color();
  return {add(g,hex=null,x=0,y=0,z=0,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){const a=g.index?g.toNonIndexed():g,c=a.attributes.aPaint;matrix.compose(v.set(x,y,z),q.setFromEuler(e.set(rx,ry,rz)),sc.set(sx,sy,sz));a.applyMatrix4(matrix);if(hex!==null)col.setHex(hex);for(let i=0;i<a.attributes.position.count;i++){pos.push(a.attributes.position.getX(i),a.attributes.position.getY(i),a.attributes.position.getZ(i));if(hex===null&&c)paint.push(c.getX(i),c.getY(i),c.getZ(i));else paint.push(col.r,col.g,col.b);}if(a!==g)a.dispose();g.dispose();},finish(){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('aPaint',new T.Float32BufferAttribute(paint,3));g.computeVertexNormals();return g;}};
 }
 function surface(rows,cols,point,colour){
  const p=[],paint=[],c=new T.Color();function vertex(t,w){const v=point(t,w);p.push(v[0],v[1],v[2]);c.setHex(colour(t,w));paint.push(c.r,c.g,c.b);}
  for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const t=i/rows,u=(i+1)/rows,w=j/cols,k=(j+1)/cols;vertex(t,w);vertex(u,w);vertex(u,k);vertex(t,w);vertex(u,k);vertex(t,k);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('aPaint',new T.Float32BufferAttribute(paint,3));g.computeVertexNormals();return g;
 }
 function spindle(hex,night=false){return surface(14,8,(t,w)=>{const a=w*Math.PI*2,r=Math.sin(t*Math.PI)**.78*(night?.30:.13);return [r*Math.cos(a)+(night?.12:.035)*Math.sin(t*Math.PI*1.5),r*Math.sin(a)*.62+(night?-.10:.04)*Math.sin(t*Math.PI),.69-t*1.32];},(t,w)=>night?(w<.13||w>.87?0x8faadf:w<.35?0x364b82:0x202d58):hex);}
 function blade(side=1){return surface(18,4,(t,w)=>{const width=Math.sin(Math.PI*t)**.65;return [side*(.08+width*(.14+w*.45)),.03+.12*width*(1-w),.46-t*1.16-.10*w];},(t,w)=>w>.76?0xe9b64c:w<.25?0xfff6ce:0xffdf85);}
 function fan(night=false){return surface(26,8,(t,w)=>{const a=(t-.5)*(night?2.65:2.35),r=.32+w*.94,taper=Math.sin(Math.PI*t)**.45;return [Math.sin(a)*r*taper,(night?-.20:.16)*Math.sin(t*Math.PI)*Math.sin(w*Math.PI)+.055*Math.cos(t*Math.PI*6)*w,Math.cos(a)*r-.43];},(t,w)=>night?(w>.88?0x9fbbe9:w>.72?0x4e69a1:w<.3?0x25365f:0x34487b):(w>.9?0xe1b858:w<.22?0xfffbea:0xf8dc8b));}
 function drape(){return surface(26,8,(t,w)=>{const taper=Math.sin(t*Math.PI)**.55;return [(w-.5)*(.12+.66*taper)+.12*Math.sin(t*Math.PI),-.21*Math.sin(t*Math.PI)+.075*Math.cos(w*Math.PI*4)*taper,.62-t*2.10];},(t,w)=>w<.10||w>.90?0x9ebce9:w<.25||w>.75?0x536f9f:0x2b3d6b);}
 function shell(nature){return surface(nature==='star'?7:24,6,(t,w)=>{const night=nature==='night',star=nature==='star',a=(t-.5)*(star?2.15:2.65),fold=night?.065*Math.cos(t*Math.PI*8)*Math.sin(w*Math.PI):0,r=(star?.91:.94)+.10*Math.sin(w*Math.PI)+fold;return [Math.sin(a)*r,.07+w*(star?.78:night?.80+.14*Math.cos(a):.92)-(night?.12*Math.sin(t*Math.PI)*Math.sin(w*Math.PI):0),Math.cos(a)*r];},(t,w)=>nature==='night'?(w>.82||t<.045||t>.955?0xb1c9f2:w>.62?0x5a74a8:Math.floor(t*8)%2?0x314873:0x3d5685):nature==='star'?(w>.83?0xc9b9ec:Math.floor(t*7)%2?0xf1f0fc:0xc4d0e6):(w>.82||t<.05||t>.95?0xf3c965:w<.25?0xfff2c4:0xffe4a0));}
 function comet(){const b=sculpture();b.add(spindle(0xf4f6ff),null,0,0,.22,.82,.85,.88);b.add(surface(24,4,(t,w)=>{const width=(.11*(1-t)+.008)*Math.sin(Math.PI*(.06+t*.9));return [.19*Math.sin(t*Math.PI)+(w-.5)*width,.03*Math.sin(t*Math.PI),.05-t*1.8];},(t,w)=>w<.24||w>.76?0xc8b8e8:0xe4eaf8));return b.finish();}
 function facet(){const b=sculpture(),g=new T.OctahedronGeometry(1,0);b.add(g,0xe3e9f7,0,0,0,.25,.10,.55);b.add(new T.OctahedronGeometry(1,0),0xfaf9ff,0,.055,.02,.11,.065,.43);b.add(new T.OctahedronGeometry(1,0),0xcbb8eb,.18,0,-.12,.24,.04,.08,0,-.20);return b.finish();}
 {const b=sculpture();b.add(spindle(0xfffcee));b.add(blade(-1));b.add(blade(1));out['astral:light:beam']=b.finish();}
 out['astral:light:fan']=fan();out['astral:light:shell']=shell('light');
 out['astral:light:aureole']=surface(32,4,(t,w)=>{const a=(t-.5)*5.3,r=.64+w*.32;return [Math.sin(a)*r,.025+w*(.16+.24*Math.sin(t*Math.PI)**.7),Math.cos(a)*r];},(t,w)=>w>.78?0xf4c763:w<.20?0xfff7d4:0xffe3a0);
 out['astral:night:drop']=spindle(0,true);out['astral:night:drape']=drape();out['astral:night:fan']=fan(true);out['astral:night:shell']=shell('night');
 out['astral:star:comet']=comet();out['astral:star:facet']=facet();out['astral:star:shell']=shell('star');
 {const b=sculpture();for(let i=0;i<4;i++){const a=(i-.5)*Math.PI/2;b.add(facet(),null,Math.sin(a)*.37,.03,Math.cos(a)*.37,.60,.75,1.12,0,a);}out['astral:star:rays']=b.finish();}
 return out;
}

// Original sparse shared silhouettes, constructed once. All curves leave a free centre.
function sharedGeometries(T){
 const out={};
 function sculpture(){
  const pos=[],paint=[],m=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler(),v=new T.Vector3(),sc=new T.Vector3(),c=new T.Color();
  return {add(g,hex,x=0,y=0,z=0,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){const a=g.index?g.toNonIndexed():g;m.compose(v.set(x,y,z),q.setFromEuler(e.set(rx,ry,rz)),sc.set(sx,sy,sz));a.applyMatrix4(m);c.setHex(hex);for(let i=0;i<a.attributes.position.count;i++){pos.push(a.attributes.position.getX(i),a.attributes.position.getY(i),a.attributes.position.getZ(i));paint.push(c.r,c.g,c.b);}if(a!==g)a.dispose();g.dispose();},finish(){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('aPaint',new T.Float32BufferAttribute(paint,3));g.computeVertexNormals();return g;}};
 }
 function curve(points,width=.025){return new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),24,width,5,false);}
 function arc(radius,start,length,height=0,width=.025){const p=[];for(let i=0;i<=24;i++){const a=start+length*i/24;p.push([Math.sin(a)*radius,height,Math.cos(a)*radius]);}return curve(p,width);}
 for(const kind of ['paws','search','hide','rest','call','freeze','zap','stun','hex','rise','crown','teleport','spark','pickup','warning','landing','metal','dust']){
  const b=sculpture();
  if(kind==='paws'){b.add(curve([[-.03,0,.22],[-.09,0,0],[-.04,0,-.25]],.028),0xd5eee1);b.add(curve([[.045,0,.17],[.04,0,-.12]],.012),0x82ba9f);}
  if(kind==='search'||kind==='call')b.add(arc(1,-.95,1.9,0,kind==='call'?.030:.020),kind==='call'?0xf3d78d:0xffedb2);
  if(kind==='hide'){b.add(arc(.59,-.42,.84,.22,.048),0xb2a580);b.add(arc(.60,-.36,.72,.30,.018),0xe0d4aa);}
  if(kind==='rest'){b.add(curve([[0,0,0],[.06,.14,.02],[-.05,.3,.01],[.02,.47,0]],.013),0xd4dfaa);b.add(glyphGeometry(T,'green'),0x93ba73,.02,.22,0,.035,.08,.03,0,0,-.35);}
  if(kind==='freeze'){
   b.add(arc(.64,.62,Math.PI*2-1.24,.20,.055),0x97dbea);b.add(arc(.64,.70,Math.PI*2-1.40,.31,.025),0xe3faff);
   for(let i=0;i<5;i++){const a=1+i*1.05;b.add(new T.OctahedronGeometry(1,0),i%2?0xd1f0f5:0x73bed2,Math.sin(a)*.60,.08,Math.cos(a)*.60,.14,.13,.12,0,a);}
  }
  if(kind==='zap')b.add(curve([[-.18,.07,-.24],[.03,.22,-.13],[-.06,.29,.02],[.18,.40,.13],[.09,.46,.25]],.023),0xffdf52);
  if(kind==='stun'){b.add(new T.OctahedronGeometry(.055,0),0xfff0b5);b.add(arc(.31,-.30,.60,0,.009),0xdcbf71,0,0,-.31);}
  if(kind==='hex'){b.add(arc(.61,-.61,1.22,.18,.039),0x723b91);b.add(arc(.61,-.59,1.18,.21,.013),0xbb86c7);b.add(new T.OctahedronGeometry(1,0),0xa471b7,0,.18,.61,.065,.055,.06);}
  if(kind==='rise'){b.add(curve([[0,0,0],[.06,.25,-.02],[-.01,.55,0]],.018),0xf7ead1);b.add(new T.OctahedronGeometry(1,0),0xd9ddec,-.01,.53,0,.035,.08,.03);}
  if(kind==='crown'){b.add(arc(.73,0,Math.PI*2,0,.022),0xe6c98f);for(let i=0;i<7;i++){const a=i/7*Math.PI*2;b.add(curve([[Math.sin(a)*.73,0,Math.cos(a)*.73],[Math.sin(a)*.73,.11,Math.cos(a)*.73]],.018),0xf2e6bf);}}
  if(kind==='teleport'){b.add(arc(.83,-1.12,2.24,0,.026),0xb5b4e0);b.add(arc(.83,-1.05,2.10,.025,.008),0xf5f2ff);}
  if(kind==='spark'){b.add(new T.OctahedronGeometry(1,0),0xf2d48c,0,0,0,.035,.065,.035);b.add(new T.OctahedronGeometry(1,0),0xbca4db,0,-.06,0,.018,.025,.018);}
  if(kind==='pickup')b.add(curve([[-.16,0,0],[-.23,.17,0],[-.12,.37,0],[0,.55,0]],.023),0xf4d89b);
  // The complete outer boundary, including stroke width, is exactly radius 1.
  if(kind==='warning'){b.add(arc(.976,0,Math.PI*2,0,.024),0xfa9b4a);for(let i=0;i<8;i++){const a=i/8*Math.PI*2;b.add(curve([[Math.sin(a)*.83,0,Math.cos(a)*.83],[Math.sin(a)*.95,0,Math.cos(a)*.95]],.012),0xffcc80);}}
  if(kind==='landing'){b.add(arc(.94,.12,Math.PI*2-.24,0,.015),0xf0d69a);for(let i=0;i<4;i++){const a=i*Math.PI/2;const c=Math.cos(a),s=Math.sin(a);b.add(curve([[-.10,0,.83],[-.10,0,.94],[.10,0,.94],[.10,0,.83]],.018),0xffe3a0,0,0,0,1,1,1,0,a);}}
  if(kind==='metal'){b.add(new T.BoxGeometry(.18,.055,.12),0xa9b6b8,0,0,0,1,1,1,0,0,.25);b.add(new T.BoxGeometry(.06,.04,.07),0x687c84,.055,.025,.02);}
  if(kind==='dust')b.add(curve([[-.12,0,0],[-.03,.08,.02],[.07,.13,0],[.15,.10,0]],.030),0xa89c81);
  out['shared:'+kind]=b.finish();
 }
 return out;
}

const PRIMARY_KINDS=Object.freeze({shot:'orb',arc:'arc',orbit:'ring',chain:'chain',trap:'ring',guard:'orb',heal:'spiral',wall:'wave',vortex:'spiral',quake:'ring'});
function primaryKind(recipe){return PRIMARY_KINDS[recipe.shape]||null;}
const DEFAULT_ORIGIN=Object.freeze({x:0,y:0,z:0}),DEFAULT_DIRECTION=Object.freeze({x:0,z:1});

export function createEffectPool(T,scene,{capacity=384,perBurstLimit=32,scale=1}={}){
 if(!Number.isInteger(perBurstLimit)||perBurstLimit<1||perBurstLimit>4096)throw new RangeError('perBurstLimit must be 1..4096');
 if(!Number.isFinite(scale)||scale<=0)throw new RangeError('scale must be finite and positive');
 if(!Number.isInteger(capacity)||capacity<1||capacity>4096)throw new RangeError('capacity must be 1..4096');
 const root=new T.Group();root.name='Fernworld elemental effects';scene.add(root);
 const states=Array.from({length:capacity},()=>({active:false,age:0,ttl:1,recipe:null,i:0,n:0,x:0,y:0,z:0,dx:0,dz:1,seed:0,scale:1}));
 const batches=new Map(),M=new T.Matrix4(),P=new T.Vector3(),S=new T.Vector3(),Q=new T.Quaternion(),E=new T.Euler(),natureEuler=new T.Euler(0,0,0,'YXZ'),C=new T.Color();
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,
  vertexShader:`attribute float aOpacity; attribute float aShell; varying vec3 vColour; varying float vOpacity; varying float vLight; varying float vShell; varying vec3 vNormal; varying vec3 vView;
  void main(){vColour=instanceColor;vOpacity=aOpacity;vShell=aShell;vec3 n=normalize(mat3(instanceMatrix)*normal);vLight=.78+.22*max(dot(n,normalize(vec3(-.4,.8,.5))),0.);vec4 p=modelViewMatrix*instanceMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*n);vView=-p.xyz;gl_Position=projectionMatrix*p;}`,
  fragmentShader:`varying vec3 vColour;varying float vOpacity;varying float vLight;varying float vShell;varying vec3 vNormal;varying vec3 vView;void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),2.);float shell=max(0.,vShell);float alpha=vOpacity*mix(1.,.055+.945*rim,shell);if(alpha<.015)discard;vec3 col=mix(vColour*vLight,vec3(1.),shell*rim*.38);if(vShell<-.5)col=mix(vec3(1.,.88,.35),vColour,smoothstep(.02,.7,rim));gl_FragColor=vec4(col,alpha);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`});
 material.forceSinglePass=true;
 const allGeometries={...starterGeometries(T),...natureGeometries(T),...crystalGeometries(T),...astralGeometries(T),...sharedGeometries(T),...Object.fromEntries(Object.keys(NATURES).map(n=>[n,glyphGeometry(T,n)])),...Object.fromEntries(Object.entries(coreGeometries(T)).map(([key,geometry])=>['core:'+key,geometry]))};
 const solidMaterial=new T.ShaderMaterial({side:T.DoubleSide,transparent:false,depthWrite:true,
  vertexShader:`attribute vec3 aPaint;attribute float aOpacity;attribute float aShell;varying vec3 vPaint;varying float vA;varying float vShell;varying vec3 vN;varying vec3 vV;
  void main(){vPaint=aPaint;vA=aOpacity;vShell=aShell;vec4 p=modelViewMatrix*instanceMatrix*vec4(position,1.);mat3 im=mat3(instanceMatrix);vec3 ns=normal/vec3(dot(im[0],im[0]),dot(im[1],im[1]),dot(im[2],im[2]));vN=normalize(normalMatrix*im*ns);vV=-p.xyz;gl_Position=projectionMatrix*p;}`,
  fragmentShader:`varying vec3 vPaint;varying float vA;varying float vShell;varying vec3 vN;varying vec3 vV;
  void main(){if(vA<.015)discard;float light=.82+.18*max(dot(normalize(vN),normalize(vec3(-.4,.8,.5))),0.);gl_FragColor=vec4(vPaint*light,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`});
 const shellMaterial=solidMaterial.clone();shellMaterial.transparent=true;shellMaterial.depthWrite=false;shellMaterial.side=T.FrontSide;
 shellMaterial.fragmentShader=`varying vec3 vPaint;varying float vA;varying float vShell;varying vec3 vN;varying vec3 vV;void main(){float rim=pow(1.-abs(dot(normalize(vN),normalize(vV))),2.);float highlight=step(.65,min(vPaint.r,min(vPaint.g,vPaint.b)));float alpha=vA*max(highlight,.025+.85*rim);if(alpha<.02)discard;gl_FragColor=vec4(mix(vPaint,vec3(1.),rim*.18),alpha);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`;
 const airMaterial=solidMaterial.clone();airMaterial.transparent=true;airMaterial.depthWrite=false;airMaterial.forceSinglePass=true;
 airMaterial.fragmentShader=`varying vec3 vPaint;varying float vA;varying float vShell;varying vec3 vN;varying vec3 vV;void main(){if(vA<.015)discard;gl_FragColor=vec4(vPaint,vA*.86);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`;
 for(const [key,geometry] of Object.entries(allGeometries)){
  geometry.name=key;
  const opacity=new T.InstancedBufferAttribute(new Float32Array(capacity),1),shell=new T.InstancedBufferAttribute(new Float32Array(capacity),1);opacity.setUsage(T.DynamicDrawUsage);shell.setUsage(T.DynamicDrawUsage);geometry.setAttribute('aOpacity',opacity);geometry.setAttribute('aShell',shell);
  const mesh=new T.InstancedMesh(geometry,key.startsWith('shared:')?airMaterial:key.startsWith('astral:')?(key==='astral:night:drop'||key.startsWith('astral:star:')?solidMaterial:airMaterial):key.startsWith('crystal:')?solidMaterial:key.startsWith('nature:')?(key.startsWith('nature:wind:')?airMaterial:solidMaterial):key.startsWith('starter:')?(key==='starter:tide:shot'||key==='starter:tide:guard'?shellMaterial:solidMaterial):material,capacity);mesh.name=key;mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  for(let i=0;i<capacity;i++)mesh.setColorAt(i,C.setHex(0xffffff));mesh.instanceColor.setUsage(T.DynamicDrawUsage);root.add(mesh);batches.set(key,{mesh,opacity,shell,n:0});
 }
 let cursor=0,active=0,disposed=false,emission=0;
 function emit(id,origin=DEFAULT_ORIGIN,direction=DEFAULT_DIRECTION,effectScale=scale){
  if(disposed)throw Error('Effect pool disposed');if(!Number.isFinite(effectScale)||effectScale<=0)throw new RangeError('effectScale must be finite and positive');const recipe=EFFECTS[id];if(!recipe)throw Error(`Unknown effect ${id}`);
  const n=Math.min(recipe.count,perBurstLimit);let dirX=Number.isFinite(direction.x)?direction.x:0,dirZ=Number.isFinite(direction.z)?direction.z:0;if(dirX===0&&dirZ===0)dirZ=1;const dirMax=Math.max(Math.abs(dirX),Math.abs(dirZ));dirX/=dirMax;dirZ/=dirMax;const len=Math.hypot(dirX,dirZ);let emitted=0;
  for(let i=0;i<n;i++){
   let found=-1;for(let j=0;j<capacity;j++){const k=(cursor+j)%capacity;if(!states[k].active){found=k;break}}
   if(found<0)break;cursor=(found+1)%capacity;const s=states[found];
   s.active=true;s.age=0;s.ttl=recipe.duration;s.recipe=recipe;s.i=i;s.n=n;s.x=Number.isFinite(origin.x)?origin.x:0;s.y=Number.isFinite(origin.y)?origin.y:0;s.z=Number.isFinite(origin.z)?origin.z:0;s.dx=dirX/len;s.dz=dirZ/len;s.seed=emission*.37+i*2.399963;s.scale=effectScale;active++;emitted++;
  }emission++;return emitted;
 }
 function update(dt){
  if(disposed)return;dt=Math.max(0,Math.min(Number.isFinite(dt)?dt:0,.1));for(const b of batches.values())b.n=0;
  for(const s of states){if(!s.active)continue;s.age+=dt;if(s.age>=s.ttl){s.active=false;active--;continue}
   const r=s.recipe,t=s.age/s.ttl,theta=s.i/s.n*Math.PI*2,a=s.seed,fade=Math.sin(Math.PI*Math.min(.98,t))**.45;let x=0,y=.35,z=0,size=r.size*(.65+.35*Math.sin(t*Math.PI));
   const radial=r.radius*(.25+.75*t);
   switch(r.shape){
    case 'shot':{const heads=r.count>=18?3:1,group=Math.floor(s.i/Math.ceil(s.n/heads)),trail=s.i%Math.ceil(s.n/heads),spread=heads===1?0:(group/(heads-1)-.5)*r.spread,angle=Math.atan2(s.dx,s.dz)+spread;const distance=Math.max(0,t*r.speed-trail*.13);x=Math.sin(angle)*distance;z=Math.cos(angle)*distance;y=.5+Math.sin(t*Math.PI)*.15+Math.sin(a)*trail*.012;size*=Math.max(.22,1-trail*.11);break}
    case 'orbit':x=Math.cos(theta+t*5)*r.radius;z=Math.sin(theta+t*5)*r.radius;y=.5+Math.sin(theta+t*4)*.15;break;
    case 'arc':{const reach=Math.sin(t*Math.PI)*r.radius*1.7,side=Math.sin(t*Math.PI*2)*.6;x=s.dx*reach+s.dz*side;z=s.dz*reach-s.dx*side;y=.6+Math.sin(t*Math.PI)*.35+Math.sin(theta)*.13;break}
    case 'chain':{const d=s.i/(s.n-1||1)*r.radius*2;x=s.dx*d+s.dz*Math.sin(s.i*7+t*18)*.2;z=s.dz*d-s.dx*Math.sin(s.i*7+t*18)*.2;y=.5;size*=.8;break}
    case 'trap':x=Math.cos(theta+t*.5)*r.radius*.6;z=Math.sin(theta+t*.5)*r.radius*.6;y=.08+Math.sin(theta+t*8)*.04;break;
    case 'guard':x=Math.cos(theta+t)*r.radius*.65;z=Math.sin(theta+t)*r.radius*.65;y=.25+(s.i%3)*.45;size*=1.5;break;
    case 'heal':x=Math.cos(theta+t*2)*r.radius*(1-t*.4);z=Math.sin(theta+t*2)*r.radius*(1-t*.4);y=t*2.3;size*=.8;break;
    case 'wall':x=(s.i/(s.n-1||1)-.5)*r.radius*2;z=t*r.speed;y=.2+Math.sin(t*Math.PI)*.65;size*=1.7;break;
    case 'vortex':x=Math.cos(theta+t*12)*radial;z=Math.sin(theta+t*12)*radial;y=t*.9;break;
    case 'rain':x=Math.cos(a)*r.radius;z=Math.sin(a*1.7)*r.radius;y=3*(1-((t+s.i/s.n)%1));size*=.6;break;
    case 'quake':x=Math.cos(theta)*radial;z=Math.sin(theta)*radial;y=Math.sin(t*Math.PI)*.3;size*=1.6;break;
    case 'trail':x=-s.dx*t*2+Math.cos(a)*.2;z=-s.dz*t*2+Math.sin(a)*.2;y=.1+Math.sin(t*Math.PI)*.25;size*=.7;break;
    default:x=Math.cos(a)*radial;z=Math.sin(a)*radial;y=Math.sin(t*Math.PI)*(.3+(s.i%5)*.16);
   }

   if(r.sharedArt){
    const yaw=Math.atan2(s.dx,s.dz),cast=Math.min(1,t/r.castEnd),ease=cast*cast*(3-2*cast),end=t>r.fadeStart?Math.max(.001,(1-t)/(1-r.fadeStart)):1;
    const phase=s.i/s.n*Math.PI*2,pulse=.94+.06*Math.sin(t*Math.PI*2);
    let form='spark',lx=0,ly=.02,lz=0,turn=0,pitch=0,roll=0,sx=1,sy=1,sz=1,body=ease,alpha=ease*end;
    switch(r.id){
     case 'quick_paws':form='paws';lx=(s.i?1:-1)*.18;lz=-.20-t*.72-s.i*.18;body*=1-t*.45;break;
     case 'keen_nose':form='search';ly=.38;lz=.31+s.i*.19+t*.12;body*=.34+s.i*.12+t*.09;pitch=-.10;break;
     case 'thick_hide':form='hide';turn=(s.i-1)*1.90;body*=pulse;break;
     case 'deep_rest':form='rest';lx=Math.sin(phase)*.73;lz=Math.cos(phase)*.73;ly=.10+t*.55+s.i*.08;body*=.84;alpha*=.86;break;
     case 'momos_call':form='call';ly=.45;lz=.20+t*1.65+s.i*.52;body*=.70+t*.65+s.i*.20;pitch=-.08;break;
     case 'freeze':form='freeze';body*=pulse;break;
     case 'paralysis':form='zap';lx=(s.i?1:-1)*.84;lz=.15;ly=.10;turn=s.i?Math.PI:0;alpha*=.78+.22*Math.sin(t*Math.PI*4)**2;break;
     case 'stun':form='stun';turn=phase+t*1.7;lx=Math.sin(turn)*.27;lz=Math.cos(turn)*.27;ly=1.18;body*=.90;break;
     case 'hex_bind':form='hex';turn=phase;body*=pulse;break;
     case 'hex_break':{form='hex';const open=Math.max(0,(t-.13)/.87);turn=phase+open*.36;lx=Math.sin(phase)*open**.75*1.05;lz=Math.cos(phase)*open**.75*1.05;ly=.02+Math.sin(open*Math.PI)*.11;body*=1-open*.35;alpha*=(1-open)**.55;pitch=-open*.45;break;}
     case 'evolution':if(s.i===0){form='crown';body*=pulse;}else{form='rise';lx=Math.sin(phase)*.78;lz=Math.cos(phase)*.78;ly=.08+t*.75+(s.i-1)*.11;body*=.65;}break;
     case 'teleport':if(s.i===2){form='spark';ly=.07;body*=1.35;}else{form='teleport';turn=s.i*Math.PI+t*.14;body*=.75+t*.20;}break;
     case 'xp_sparks':form='spark';lx=Math.sin(phase)*(.64+t*.27);lz=Math.cos(phase)*(.64+t*.27);ly=.11+Math.sin(t*Math.PI)*(.18+s.i*.018);body*=1-t*.38;alpha*=1-t*.55;break;
     case 'fossil_pickup':form='pickup';lz=.35;ly=.15+t*.50;body*=.9;break;
     case 'lava_warning':form='warning';body=r.radius;alpha=(.65+.25*Math.sin(t*Math.PI*2)**2)*end;break;
     case 'drop_zone':form='landing';body=r.radius;alpha=(.80+.15*Math.sin(t*Math.PI))*end;break;
     case 'robot_break':if(s.i===4){form='dust';ly=.03+t*.27;body*=.6+t*.6;alpha*=.55*(1-t);}else{form='metal';turn=phase+t*.7;lx=Math.sin(phase)*t*.53;lz=Math.cos(phase)*t*.53;ly=.10+Math.sin(t*Math.PI)*(.28+s.i*.018);pitch=t*(s.i%2?2:-2);roll=s.i*.35;body*=1-t*.60;}break;
    }
    const b=batches.get('shared:'+form),i=b.n++;
    P.set(s.x+(lx*s.dz+lz*s.dx)*s.scale,s.y+ly*s.scale,s.z+(-lx*s.dx+lz*s.dz)*s.scale);Q.setFromEuler(natureEuler.set(pitch,yaw+turn,roll));S.set(body*sx*s.scale,body*sy*s.scale,body*sz*s.scale);M.compose(P,Q,S);b.mesh.setMatrixAt(i,M);b.mesh.setColorAt(i,C.setHex(0xffffff));b.opacity.array[i]=Math.max(.001,alpha);b.shell.array[i]=0;continue;
   }

   if(r.astralArt){
    const yaw=Math.atan2(s.dx,s.dz),cast=Math.min(1,t/r.castEnd),travel=Math.max(0,Math.min(1,(t-r.castEnd)/(r.impactAt-r.castEnd))),impact=Math.max(0,(t-r.impactAt)/(1-r.impactAt)),end=t>r.fadeStart?Math.max(.001,(1-t)/(1-r.fadeStart)):1;
    const light=r.nature==='light',night=r.nature==='night',star=r.nature==='star',ease=cast*cast*(3-2*cast),pulse=.94+.06*Math.sin(t*Math.PI*2);
    let form=light?'beam':night?'drape':'comet',lx=0,ly=.46,lz=0,sx=1,sy=1,sz=1,turn=0,pitch=0,roll=0,body=.54*ease*end,alpha=(night?.94:.92)*ease*end;
    if(r.shape==='shot'){
     lz=travel*r.speed*.85;body=(light?.58:night?.65:.58)*ease*end;
     if(light){sx=.72+Math.sin(travel*Math.PI)*.22;sy=.85;if(impact>0){form='fan';lz-=.44;body*=.88+impact*.6;ly=.43;}}
     if(night){form=s.i===0?'drop':'drape';if(s.i===1){lz-=.53;body*=.70;sy=.72;alpha*=.85;}ly-=Math.sin(travel*Math.PI)*.07;if(impact>0){lz-=.37;body*=1-impact*.45;turn=impact*.22;}}
     if(star){lx=Math.sin(travel*Math.PI)*.16;sy=.65;if(impact>0){form='rays';lz-=.40;body*=.73+impact*.3;ly=.43;}}
    }else if(r.shape==='orbit'){
     const a=s.i/s.n*Math.PI*2+t*(night?.55:star?.85:1.10);lx=Math.sin(a)*r.radius*.72;lz=Math.cos(a)*r.radius*.72;ly=.46+Math.sin(a)*.04;turn=a+Math.PI/2;body=(light?.37:night?.40:.46)*ease*end*pulse;
     form=light?'fan':night?'drape':'facet';if(night){pitch=.14;sz=.78;}if(star){pitch=-.24;roll=.25;}
    }else if(r.shape==='arc'){
     lx=Math.sin(t*Math.PI*2)*.60;lz=Math.sin(t*Math.PI)*r.radius*1.65;ly=.48+Math.sin(t*Math.PI)*.09;turn=Math.cos(t*Math.PI)*.70;body=(light?.76:night?.70:.72)*ease*end;
     form=light?'fan':night?'fan':'comet';if(star){sz=1.4;sx=1.5;turn+=Math.PI/2;}if(night){sy=.85;roll=.04*Math.sin(t*Math.PI);}
    }else if(r.shape==='chain'){
     const grow=Math.max(.001,Math.min(1,(t-.08-s.i*.10)*5)),a=s.i/s.n;lz=a*r.radius*2+.46;ly=.34;body=(light?.54:night?.53:.43)*end*grow;alpha*=grow;form=light?'beam':night?'drape':'comet';
     sz=light?1.52:night?1.13:1.6;sx=light?.46:night?.70:.35;turn=0;ly+=night?-.10*Math.sin(grow*Math.PI):.02*Math.sin(grow*Math.PI);
    }else if(r.shape==='trap'){
     const open=Math.max(0,Math.min(1,(t-.42)/.35));ly=.025;body=.92*ease*end;form=light?'fan':night?'fan':'facet';
     if(light){form='aureole';turn=0;sy=.08+open*1.25;sz=1.1;alpha*=.68+.24*open;}
     if(night){turn=Math.PI;sy=.08+open*.85;body*=1.05;alpha*=.9;}
     if(star){const a=s.i/s.n*Math.PI*2;lx=Math.sin(a)*.40;lz=Math.cos(a)*.40;turn=a;body=.63*ease*end;pitch=-open*.67;sy=.75;sz=1.1;}
    }else if(r.shape==='guard'){
     form='shell';body=r.radius*.66*ease*end;ly=.025;lz=-.36;sy=light?.91:night?.90:.95;alpha*=light?.66:night?.94:1;
     if(star){sx=.93;sz=.86;}turn=Math.sin(t*Math.PI)*(night?.035:.06);
    }else if(r.shape==='trail'){
     lz=-t*1.5-s.i*.45;lx=(s.i===0?-1:1)*(light?.15:night?.13:.10);ly=night?.17:.10;body=(light?.36:night?.37:.37)*ease*end*(1-t*.36);form=light?'beam':night?'drape':'comet';sx=light?.20:night?.28:.30;sz=1.55;sy=.5;turn=night?.06:0;alpha*=1-t*.35;
    }else{
     form=light?'fan':night?'fan':'rays';body=(light?.48:night?.47:.66)*ease*end;ly=.06+Math.sin(t*Math.PI)*.17;
     if(!star){const a=s.i/s.n*Math.PI*2;lx=Math.sin(a)*(.16+t*.35);lz=Math.cos(a)*(.16+t*.35);turn=a;sy=night?.90:1.15;pitch=night?-.10:-.22;}else{turn=.18;sz=1.4;sx=.85;}
    }
    const b=batches.get('astral:'+r.nature+':'+form),i=b.n++;
    P.set(s.x+(lx*s.dz+lz*s.dx)*s.scale,s.y+ly*s.scale,s.z+(-lx*s.dx+lz*s.dz)*s.scale);Q.setFromEuler(natureEuler.set(pitch,yaw+turn,roll));S.set(body*sx*s.scale,body*sy*s.scale,body*sz*s.scale);M.compose(P,Q,S);b.mesh.setMatrixAt(i,M);b.mesh.setColorAt(i,C.setHex(0xffffff));b.opacity.array[i]=Math.max(.001,alpha);b.shell.array[i]=0;
    continue;
   }

   if(r.crystalArt){
    const yaw=Math.atan2(s.dx,s.dz),cast=Math.min(1,t/r.castEnd),travel=Math.max(0,Math.min(1,(t-r.castEnd)/(r.impactAt-r.castEnd))),impact=Math.max(0,(t-r.impactAt)/(1-r.impactAt)),end=t>r.fadeStart?Math.max(.001,(1-t)/(1-r.fadeStart)):1;
    const frost=r.nature==='frost',ore=r.nature==='ore',chime=r.nature==='chime';
    let form=frost?'shard':ore?'plate':'front',lx=0,ly=.46,lz=0,sx=1,sy=1,sz=1,turn=0,pitch=0,roll=0,body=.48*cast*end;
    const settle=ore?1+Math.sin(Math.min(1,t/.34)*Math.PI*2)*Math.exp(-t*12)*.13:1;
    if(r.shape==='shot'){
     lz=travel*r.speed*.85;body=(frost?.50:ore?.49:.48)*cast*end;
     if(chime){lz-=s.i*.30;body*=1-s.i*.16;sy=.8;turn=0;if(impact>0){body*=1+impact*.65;lz-=.50;lx=(s.i-1)*impact*.10;}}
     else if(impact>0){lz-=frost?.35:.37;if(frost){lx=(s.i-1)*(.18+impact*.38);lz-=Math.abs(s.i-1)*impact*.20;body*=s.i===1?.62:.46;turn=(s.i-1)*(.3+impact*.65);ly=.43-impact*.15;pitch=-impact*.45;}else{body*=s.i===0?1:.28;lx=s.i===0?0:(s.i===1?-1:1)*impact*.22;ly=.43;pitch=-.15+impact*.5;}}
     else if(s.i>0){lz-=s.i*.30;body*=.23-s.i*.035;ly-=.05;}
     if(ore){body*=settle;roll=Math.sin(travel*Math.PI)*.18;}
    }else if(r.shape==='orbit'){
     const a=s.i/s.n*Math.PI*2+t*(ore?.9:frost?1.6:1.15);lx=Math.sin(a)*r.radius*.72;lz=Math.cos(a)*r.radius*.72;ly=.47;turn=a+Math.PI/2;body=(frost?.47:ore?.39:.62)*cast*end*settle;
     if(frost){pitch=-.6;sz=.8;sx=1.2;}if(chime)form='node';
    }else if(r.shape==='arc'){
     lz=Math.sin(t*Math.PI)*r.radius*1.65;lx=Math.sin(t*Math.PI*2)*.60;ly=.48+Math.sin(t*Math.PI)*(ore?.24:.12);turn=chime?Math.cos(t*Math.PI)*.65:t*4.5;body=(chime?.75:.64)*cast*end*settle;
     if(frost){sx=1.4;sz=.9;}if(ore)roll=t*1.4;
    }else if(r.shape==='chain'){
     const delayed=Math.max(0,Math.min(1,(t-.12-s.i*.11)*5));lz=s.i/(s.n-1)*r.radius*2;ly=frost?.03:ore?.10:.12;body=(chime?.62:.46)*end*Math.max(.015,delayed);turn=frost?(s.i%2?.25:-.25):0;
     if(frost){pitch=-1.05;sy=1.5;sz=.8;}if(ore){pitch=-.55;sy=1.6;body*=1+Math.sin(delayed*Math.PI*2)*Math.exp(-delayed*5)*.15;}if(chime){body*=.7+.3*Math.sin(delayed*Math.PI);sz=.8;ly=.12+delayed*.08;}
    }else if(r.shape==='trap'){
     const erupt=Math.max(0,Math.sin(Math.max(0,t-.48)/.52*Math.PI));ly=.018;body=.95*cast*end;
     if(frost){form=t<.49?'rime':'cluster';if(t>=.49){body=.62*cast*end;sy=.18+erupt*.95;}}
     if(ore){form='teeth';body=.76*cast*end;sy=.16+erupt*1.8;}
     if(chime){form=t<.55?'pulse':'shell';sy=t<.55?1:.12+erupt*1.8;if(t>=.55)body=.72*cast*end;}
    }else if(r.shape==='guard'){
     form=frost?'shield':ore?'armour':'shell';body=r.radius*.68*cast*end*settle;ly=frost?.34:ore?.02:.22;lz=frost?-.37:-.3;
     if(frost){pitch=-.9;sy=1.2;}if(chime){sy=1.3;turn=Math.sin(t*Math.PI)*.12;}
    }else if(r.shape==='trail'){
     lz=-t*1.6-s.i*.40;ly=frost?.03:.07;body=(chime?.38:.23)*cast*end*(1-t*.55);turn=frost?.3:ore?-.15:Math.PI;sy=.5;sz=chime?.7:1;
    }else{
     if(frost){const a=s.i/s.n*Math.PI*2;lx=Math.sin(a)*(.15+t*.5);lz=Math.cos(a)*(.15+t*.5);ly=.18+Math.sin(t*Math.PI)*.25;turn=a;body=.35*cast*end;pitch=-.5;}
     if(ore){form='teeth';ly=.025;body=.75*cast*end*settle;sy=.4+Math.sin(t*Math.PI)*.75;}
     if(chime){form='pulse';ly=.03;body=(.4+t*.8)*cast*end;}
    }
    const b=batches.get('crystal:'+r.nature+':'+form),i=b.n++;
    P.set(s.x+(lx*s.dz+lz*s.dx)*s.scale,s.y+ly*s.scale,s.z+(-lx*s.dx+lz*s.dz)*s.scale);Q.setFromEuler(natureEuler.set(pitch,yaw+turn,roll));S.set(body*sx*s.scale,body*sy*s.scale,body*sz*s.scale);M.compose(P,Q,S);b.mesh.setMatrixAt(i,M);b.mesh.setColorAt(i,C.setHex(0xffffff));b.opacity.array[i]=1;b.shell.array[i]=0;
    continue;
   }

   if(r.natureArt){
    const yaw=Math.atan2(s.dx,s.dz),cast=Math.min(1,t/r.castEnd),travel=Math.max(0,Math.min(1,(t-r.castEnd)/(r.impactAt-r.castEnd))),impact=Math.max(0,(t-r.impactAt)/(1-r.impactAt)),end=t>r.fadeStart?Math.max(.001,(1-t)/(1-r.fadeStart)):1;
    const rock=r.nature==='rock',wind=r.nature==='wind',spark=r.nature==='spark';
    let form=rock?'chunk':wind?'sickle':'bolt',lx=0,ly=.46,lz=0,sx=1,sy=1,sz=1,turn=0,pitch=0,roll=0,body=.40*cast*end,alpha=1;
    if(r.shape==='shot'){
     const main=s.i===0,wake=main?0:s.i;
     lz=travel*r.speed*.85-wake*.25;ly=.46+(rock?.62:.08)*Math.sin(travel*Math.PI);body=(rock?.47:wind?.49:.55)*cast*end;
     if(wind){form=impact>0?'sickle':'channel';turn=0;alpha=.86;}
     if(rock){pitch=-travel*1.7;roll=travel*.5;if(!main){body=.12*(1-wake*.2)*cast*end;ly=.35;sy=.28;}if(impact>0){pitch=.1;ly=.22;body*=1-impact*.4;sy=.45;sx=1+impact;}}
     if(spark){lz=Math.floor(travel*6)/6*r.speed*.85;body*=.9+.1*Math.sin(t*137);sy=.65;}
     if(impact>0){lz-=rock?.32:wind?.46:.48;if(wind){sx=1+impact*.5;sy=.8;body*=1-impact*.6;turn=impact*.5;}if(spark){pitch=-.55;body*=1-impact*.45;}}
     if(!main&&!rock){body=.12*cast*end;ly+=wake*.10;alpha=.48;}
    }else if(r.shape==='orbit'){
     const a=s.i/s.n*Math.PI*2+t*(rock?.65:wind?4:2.3);lx=Math.sin(a)*r.radius*.72;lz=Math.cos(a)*r.radius*.72;ly=rock?.39:.53;turn=a+Math.PI/2;body=(rock?.38:wind?.42:.40)*cast*end;
     if(wind){form='sickle';sy=.65;pitch=.12;}if(spark)form='node';
    }else if(r.shape==='arc'){
     lx=Math.sin(t*Math.PI*2)*.60;lz=Math.sin(t*Math.PI)*r.radius*1.65;ly=.48+Math.sin(t*Math.PI)*(rock?.55:.12);turn=t*(rock?2:6);body=(rock?.59:wind?.73:.67)*cast*end;if(wind)form='sickle';if(rock)roll=t*2;
    }else if(r.shape==='chain'){
     if(rock){const u=s.i/(s.n-1),rise=Math.max(0,Math.min(1,(t-.16-s.i*.07)*7));lx=Math.sin(s.i*2.7)*.10;lz=u*r.radius*2.05;ly=.015;form=rise>.08?'chunk':'fissure';body=(rise>.08?.43:.7)*end;sy=rise>.08?rise*1.7:.6;turn=.1*Math.sin(s.i);}
     if(wind){const a=s.i/(s.n-1);lx=Math.sin(t*8+s.i)*.13;lz=a*r.radius*2;ly=.35;form='channel';body=.45*cast*end;sz=1.45;alpha=.72;}
     if(spark){form='bolt';lz=r.radius*1.15;ly=.46;body=cast*end;sz=r.radius*1.3;sy=.8;sx=.8;alpha=1;if(t<.16){form='charge';body=.24*cast;}}
    }else if(r.shape==='trap'){
     ly=.018;
     const erupt=Math.max(0,Math.sin(Math.max(0,t-.48)/.52*Math.PI));
     if(rock){form=t<.49?'fissure':'plates';body=(t<.49?1.10:.72)*cast*end;if(t<.49){lz=-.5;sy=.5;}else{sy=.10+erupt*1.5;lz=-.7;}}
     if(wind){form='spiral';body=.78*cast*end;sy=.18+erupt*1.9;turn=t*8;alpha=.65;}
     if(spark){form=t<.49?'charge':'bolt';body=(t<.49?.8:.62)*cast*end;if(t>=.49){pitch=-Math.PI/2;ly=.62;sz=.15+erupt*1.5;}alpha=.80+.20*Math.sin(t*171);}
    }else if(r.shape==='guard'){
     if(rock){form='plates';body=r.radius*.65*cast*end;ly=.02;lz=-.35;sy=.85;}
     if(wind){form='sickle';body=r.radius*.68*cast*end;ly=.54;turn=t*3;pitch=.10;alpha=.75;}
     if(spark){form='bolt';body=r.radius*.57*cast*end;turn=t*1.8;ly=.5;sz=1.6;sx=.8;}
    }else if(r.shape==='trail'){
     lz=-t*1.6-s.i*.37;lx=rock?Math.sin(s.i*2)*.12:0;ly=rock?.025:.20;body=(rock?.24:wind?.40:.25)*cast*end*(1-t*.6);
     if(rock){sy=.35;pitch=.1;}if(wind){form='sickle';pitch=.08;sz=1.9;sy=.6;alpha=.70*(1-t);turn=Math.PI/2;}if(spark){sz=1.3;body*=.85+.15*Math.sin(t*117+s.i);}
    }else{
     if(rock){const a=s.i/s.n*Math.PI*2;lx=Math.sin(a)*t*.82;lz=Math.cos(a)*t*.82;ly=.03+Math.sin(t*Math.PI)*(.15+s.i*.03);body=.29*cast*end;sy=.7;turn=a;}
     if(wind){form='spiral';ly=.04;body=(.3+t*.85)*cast*end;turn=t*7;sy=.55;alpha=.8*(1-t*.6);}
     if(spark){form='bolt';ly=.52;body=.72*cast*end;turn=t>.5?.30:0;sz=1.2;pitch=-.45;}
    }
    const b=batches.get('nature:'+r.nature+':'+form),i=b.n++;
    P.set(s.x+(lx*s.dz+lz*s.dx)*s.scale,s.y+ly*s.scale,s.z+(-lx*s.dx+lz*s.dz)*s.scale);
    Q.setFromEuler(natureEuler.set(pitch,yaw+turn,roll));S.set(body*sx*s.scale,body*sy*s.scale,body*sz*s.scale);M.compose(P,Q,S);b.mesh.setMatrixAt(i,M);b.mesh.setColorAt(i,C.setHex(0xffffff));b.opacity.array[i]=Math.max(.001,alpha);b.shell.array[i]=0;
    continue;
   }

   if(r.artFamily){
    // Local coordinates below are transformed exactly once into world direction.
    const yaw=Math.atan2(s.dx,s.dz),storm=r.shape==='shot'&&r.count>3,heads=storm?3:1;
    const primary=r.shape==='shot'?s.i<heads:r.shape==='arc'?s.i===0:r.shape==='orbit'?true:r.shape==='chain'?true:r.shape==='trap'?true:r.shape==='guard'?true:r.shape==='wall'?true:r.shape==='vortex'?true:r.shape==='rain'?true:s.i===0;
    const cast=r.castEnd,hit=r.impactAt,travel=Math.max(0,Math.min(1,(t-cast)/(hit-cast))),impact=Math.max(0,(t-hit)/(1-hit));
    const anticipation=Math.min(1,t/cast),body=Math.max(.001,anticipation)*(1-impact*.85);
    let lx=0,lz=0,ly=.45,sz=.36,sy=1,sx=1,turn=0,alpha=t>.88?(1-t)/.12:1,kind=r.shape;
    if(r.id==='pearl_crown')kind='guard';
    if(r.shape==='shot'){
     const lane=primary?s.i:(s.i-heads)%heads,angle=storm?(lane-1)*r.spread*.45:0;
     const wake=primary?0:1+Math.floor((s.i-heads)/heads),distance=travel*r.speed*.85;
     lx=Math.sin(angle)*distance;lz=Math.cos(angle)*distance-wake*.30*(1-impact);ly=.46+Math.sin(travel*Math.PI)*.12;
     sz=(r.nature==='tide'?.31:r.nature==='green'?.34:.38)*body;turn=angle;
     if(!primary){sz=.08*(1-impact)*(1-wake*.13);ly+=Math.sin(s.i*3+t*8)*.08;}
     if(impact>0&&primary){kind='burst';sz=.46*(1-impact*.72);sy=.6+impact;sx=1+impact*.8;turn=impact*1.5;lz-=r.nature==='tide'?.58:.28;ly=.43+impact*.2;}
    }else if(r.shape==='orbit'){
     const angle=s.i/s.n*Math.PI*2+t*3.4,rad=r.radius*(.8+.2*anticipation);lx=Math.sin(angle)*rad;lz=Math.cos(angle)*rad;ly=.43+.1*Math.sin(angle*2);turn=angle+Math.PI/2;sz=r.id.endsWith('crown')?.34:.30;
    }else if(r.shape==='arc'){
     const reach=Math.sin(t*Math.PI)*r.radius*1.65;lx=Math.sin(t*Math.PI*2)*.46;lz=reach;ly=.48+Math.sin(t*Math.PI)*.16;turn=t*5.4;sz=primary?.66:.09;
     if(!primary){lx-=Math.cos(turn)*s.i*.15;lz+=Math.sin(turn)*s.i*.15;}
    }else if(r.shape==='chain'){
     const u=s.i/s.n,length=r.radius*1.8,grow=Math.max(.015,Math.min(1,(t-.07-s.i*.065)*4));lx=Math.sin(u*7+t*4)*.12;lz=u*length;ly=r.nature==='green'?.055:.34;sz=r.nature==='green'?1:.35;
     if(r.nature==='green'){sx=.85;sy=grow;lz-=.08;sz=length/s.n*grow;turn=Math.sin(u*7)*.1;}else{sy=grow;turn=Math.sin(t*8+s.i)*.35;ly=r.nature==='ember'?.20+Math.max(0,Math.sin((t-.07-s.i*.065)*Math.PI*2.2))*.7:.045+grow*.1;}
    }else if(r.shape==='trap'){
     const angle=s.i/s.n*Math.PI*2;lx=Math.sin(angle)*r.radius*.44;lz=Math.cos(angle)*r.radius*.44;ly=.025;sz=.44;turn=angle;
     const erupt=Math.max(0,Math.sin(Math.max(0,t-.48)/.52*Math.PI));sy=r.nature==='tide'?.35+erupt*2.4:.75+erupt*.65;
     if(r.nature==='green'){sy=.65+erupt*.8;sz*=1-erupt*.22;if(t>.57){kind='burst';ly=.04+erupt*.12;sy=.6+erupt;}}if(r.nature==='ember'){sy=.45+erupt*1.5;}
    }else if(r.shape==='guard'){
     if(r.nature==='tide'){sz=r.radius*.58;ly=.67;sy=1.1;}else{const angle=s.i/s.n*Math.PI*2+t*.8;lx=Math.sin(angle)*r.radius*.6;lz=Math.cos(angle)*r.radius*.6;turn=angle;sz=.52;}
    }else if(r.shape==='heal'||r.shape==='vortex'){
     const angle=s.i/s.n*Math.PI*2+t*3;lx=Math.sin(angle)*r.radius*.65;lz=Math.cos(angle)*r.radius*.65;ly=.1+t*.9;turn=angle+t*2;sz=primary?.55:.12;
    }else if(r.shape==='wall'){
     lx=(s.i/(s.n-1)-.5)*r.radius*1.45;lz=travel*2;ly=.1;sz=.8;sy=.4+Math.sin(t*Math.PI)*1.2;turn=0;
    }else if(r.shape==='rain'){lx=Math.sin(s.seed)*r.radius;lz=Math.cos(s.seed*1.4)*r.radius;ly=2.1*(1-((t+s.i/s.n)%1));sz=.12;}
    else if(r.shape==='trail'){lz=-t*1.8-s.i*.18;lx=Math.sin(s.seed)*.15;ly=.06;sz=.24*(1-t);}
    else {const angle=s.i/s.n*Math.PI*2;lx=Math.sin(angle)*r.radius*t*.7;lz=Math.cos(angle)*r.radius*t*.7;ly=.05+Math.sin(t*Math.PI)*.2;sz=primary?.60:.13;turn=angle;}
    if(r.shape!=='shot')sz*=Math.max(.01,anticipation);if(t>r.fadeStart)sz*=Math.max(.01,(1-t)/(1-r.fadeStart));
    const key=primary?'starter:'+r.nature+':'+STARTER_FORMS[r.nature][kind]:r.nature,b=batches.get(key),i=b.n++;
    P.set(s.x+(lx*s.dz+lz*s.dx)*s.scale,s.y+ly*s.scale,s.z+(-lx*s.dx+lz*s.dz)*s.scale);
    Q.setFromEuler(E.set(0,yaw+turn,r.nature==='ember'?Math.sin(t*15+s.i)*.05:0));S.set(sz*sx*s.scale,sz*sy*s.scale,sz*s.scale);M.compose(P,Q,S);b.mesh.setMatrixAt(i,M);b.mesh.setColorAt(i,C.setHex(primary?0xffffff:NATURES[r.nature].accent));b.opacity.array[i]=Math.max(.001,alpha);b.shell.array[i]=0;
    continue;
   }
   const core=primaryKind(r),shotHead=r.shape==='shot'&&s.i%Math.ceil(s.n/(r.count>=18?3:1))===0,isPrimary=core&&(s.i===0||shotHead);
   let batch=r.nature,alpha=fade*.9,shell=0;
   Q.setFromEuler(E.set(Math.sin(a)*.4,a+t*3,r.shape==='chain'?Math.sin(s.i)*.8:Math.cos(a+t)*.4));S.set(size,size,size);
   if(isPrimary){
    batch='core:'+core;Q.setFromEuler(E.set(0,Math.atan2(s.dx,s.dz),0));if(r.nature==='ember')shell=-1;
    const pulse=Math.sin(t*Math.PI),h=.65+.35*pulse;
    if(r.shape==='shot'){S.set(r.size*1.8*h,r.size*1.8*h,r.size*(r.nature==='ember'?3.3:1.8)*h);shell=r.nature==='tide'?1:r.nature==='ember'?-1:0;}
    else if(r.shape==='arc'){S.setScalar(r.radius*.65);x=s.dx*Math.sin(t*Math.PI)*r.radius;z=s.dz*Math.sin(t*Math.PI)*r.radius;y=.5;Q.setFromEuler(E.set(.15,Math.atan2(s.dx,s.dz)+t*Math.PI*2,0));}
    else if(r.shape==='chain'){x=z=0;y=.5;S.set(1,pulse,r.radius*2);alpha*=.8;}
    else if(r.shape==='orbit'){x=z=0;y=.5;S.setScalar(r.radius);alpha*=.45;}
    else if(r.shape==='guard'){x=z=0;y=.75;S.set(r.radius*.75,r.radius*.85,r.radius*.75);shell=1;alpha*=.65;}
    else if(r.shape==='trap'){x=z=0;y=.06;S.set(r.radius*.6,1,r.radius*.6);alpha*=.7;}
    else if(r.shape==='heal'){x=z=0;y=.03;S.set(r.radius,.8+t,r.radius);Q.setFromEuler(E.set(0,t*2,0));alpha*=.55;}
    else if(r.shape==='vortex'){x=z=0;y=.05;S.set(radial,.35,radial);Q.setFromEuler(E.set(0,t*8,0));alpha*=.7;}
    else if(r.shape==='quake'){x=z=0;y=.04;S.set(radial,1,radial);alpha*=.7;}
    else if(r.shape==='wall'){x=0;y=.15;z=t*r.speed;S.set(r.radius,.8,r.radius*.4);alpha*=.65;}
   }
   const b=batches.get(batch),i=b.n++;P.set(s.x+x*s.scale,s.y+y*s.scale,s.z+z*s.scale);S.multiplyScalar(s.scale);M.compose(P,Q,S);b.mesh.setMatrixAt(i,M);b.mesh.setColorAt(i,C.setHex(isPrimary?NATURES[r.nature].color:s.i%3?NATURES[r.nature].accent:NATURES[r.nature].color));b.opacity.array[i]=alpha;b.shell.array[i]=shell;
  }
  for(const b of batches.values()){b.mesh.count=b.n;b.mesh.visible=b.n>0;if(b.n){b.mesh.instanceMatrix.needsUpdate=true;b.mesh.instanceColor.needsUpdate=true;b.opacity.needsUpdate=true;b.shell.needsUpdate=true}}
 }
 function clear(){for(const s of states)s.active=false;active=0;for(const b of batches.values()){b.n=0;b.mesh.count=0;b.mesh.visible=false}}
 function dispose(){if(disposed)return;clear();disposed=true;scene.remove(root);for(const b of batches.values())b.mesh.geometry.dispose();material.dispose();solidMaterial.dispose();shellMaterial.dispose();airMaterial.dispose()}
 return {root,emit,update,clear,dispose,get active(){return active},get capacity(){return capacity},get activeBatches(){let n=0;for(const b of batches.values())if(b.n)n++;return n}};
}

// The caller owns these objects' complete motion and lifetime. One add is one
// actual projectile, orbiting body, returning arc, chain segment or planted trap;
// recipe counts and the automatic effect pool's travel curves do not apply.
const MANUAL_FORMS=Object.freeze({
 rock:{shot:'nature:rock:chunk',orbit:'nature:rock:chunk',arc:'nature:rock:chunk',chain:'nature:rock:fissure',trap:'nature:rock:fissure'},
 wind:{shot:'nature:wind:channel',orbit:'nature:wind:sickle',arc:'nature:wind:sickle',chain:'nature:wind:channel',trap:'nature:wind:spiral'},
 spark:{shot:'nature:spark:bolt',orbit:'nature:spark:node',arc:'nature:spark:bolt',chain:'nature:spark:bolt',trap:'nature:spark:charge'},
 frost:{shot:'crystal:frost:shard',orbit:'crystal:frost:shard',arc:'crystal:frost:shard',chain:'crystal:frost:shard',trap:'crystal:frost:rime'},
 ore:{shot:'crystal:ore:plate',orbit:'crystal:ore:plate',arc:'crystal:ore:plate',chain:'crystal:ore:plate',trap:'crystal:ore:teeth'},
 chime:{shot:'crystal:chime:front',orbit:'crystal:chime:node',arc:'crystal:chime:front',chain:'crystal:chime:front',trap:'crystal:chime:pulse'},
 light:{shot:'astral:light:beam',orbit:'astral:light:beam',arc:'astral:light:fan',chain:'astral:light:beam',trap:'astral:light:aureole'},
 night:{shot:'astral:night:drop',orbit:'astral:night:drop',arc:'astral:night:drape',chain:'astral:night:drape',trap:'astral:night:fan'},
 star:{shot:'astral:star:comet',orbit:'astral:star:facet',arc:'astral:star:facet',chain:'astral:star:rays',trap:'astral:star:rays'},
});

/** Reuses the reviewed painted geometry and materials, with fixed buffers.
 * begin(); add(effectId, worldMatrix[, opacity]); flush(). All translations,
 * rotations and positive scales are supplied by simulation; +Z is forward.
 * add returns false at the GLOBAL capacity, never silently grows a batch.
 * Bounds are authored local bounds, including any deliberate local asymmetry.
 * Dispose this pool independently from an automatic cast/impact effect pool.
 */
export function createEffectInstances(T,scene,{capacity=384}={}){
 const owner=createEffectPool(T,scene,{capacity}),root=owner.root;
 root.name='Fernworld simulation effect instances';
 const batches=new Map(root.children.map(mesh=>[mesh.name,{mesh,n:0}])),recipes=new Map();
 let used=0,disposed=false;
 for(const [id,recipe] of Object.entries(EFFECTS)){
  if(recipe.shared||!['shot','orbit','arc','chain','trap'].includes(recipe.shape))continue;
  const kind=recipe.id==='pearl_crown'?'guard':recipe.shape;
  const key=STARTER_FORMS[recipe.nature]?'starter:'+recipe.nature+':'+STARTER_FORMS[recipe.nature][kind]:MANUAL_FORMS[recipe.nature]?.[kind];
  const batch=batches.get(key);if(!batch){owner.dispose();throw Error(`Missing manual effect form ${id}`)}
  const geometry=batch.mesh.geometry;if(!geometry.boundingBox)geometry.computeBoundingBox();
  const box=geometry.boundingBox;
  const bounds=Object.freeze({min:Object.freeze(box.min.toArray()),max:Object.freeze(box.max.toArray()),size:Object.freeze([box.max.x-box.min.x,box.max.y-box.min.y,box.max.z-box.min.z])});
  recipes.set(id,{batch,bounds,key});
 }
 function alive(){if(disposed)throw Error('Effect instances disposed')}
 function begin(){alive();used=0;for(const b of batches.values()){b.n=0;b.mesh.count=0;b.mesh.visible=false}}
 function add(id,matrix,opacity=1){
  alive();const form=recipes.get(id);if(!form)throw Error(`Unsupported manual effect ${id}`);
  if(!Number.isFinite(opacity)||opacity<0||opacity>1)throw new RangeError('opacity must be 0..1');
  const e=matrix?.elements;if(!matrix?.isMatrix4||e.length!==16)throw new TypeError('worldMatrix must be a Matrix4');
  for(let i=0;i<16;i++)if(!Number.isFinite(e[i]))throw new RangeError('worldMatrix must be finite');
  const a=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],b=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],c=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];
  const ab=e[0]*e[4]+e[1]*e[5]+e[2]*e[6],ac=e[0]*e[8]+e[1]*e[9]+e[2]*e[10],bc=e[4]*e[8]+e[5]*e[9]+e[6]*e[10];
  if(Math.min(a,b,c)<1e-12||matrix.determinant()<=0||Math.abs(ab)>1e-5*Math.sqrt(a*b)||Math.abs(ac)>1e-5*Math.sqrt(a*c)||Math.abs(bc)>1e-5*Math.sqrt(b*c)
    ||Math.abs(e[3])+Math.abs(e[7])+Math.abs(e[11])+Math.abs(e[15]-1)>1e-7)throw new RangeError('worldMatrix needs orthogonal positive scales and affine translation');
  if(used>=capacity||opacity<.015)return false;
  const batch=form.batch,mesh=batch.mesh,index=batch.n++;
  mesh.setMatrixAt(index,matrix);mesh.geometry.attributes.aOpacity.array[index]=opacity;
  mesh.geometry.attributes.aShell.array[index]=0;used++;return true;
 }
 function flush(){alive();for(const b of batches.values()){const m=b.mesh;m.count=b.n;m.visible=b.n>0;if(b.n){m.instanceMatrix.needsUpdate=true;m.geometry.attributes.aOpacity.needsUpdate=true;m.geometry.attributes.aShell.needsUpdate=true}}}
 function clear(){begin();flush()}
 function dispose(){if(disposed)return;clear();disposed=true;for(const b of batches.values())b.mesh.dispose();owner.dispose()}
 function describe(id){alive();const f=recipes.get(id);if(!f)throw Error(`Unsupported manual effect ${id}`);return f.bounds}
 return {root,begin,add,flush,clear,dispose,describe,get active(){return used},get capacity(){return capacity},get activeBatches(){let n=0;for(const b of batches.values())if(b.n)n++;return n}};
}
