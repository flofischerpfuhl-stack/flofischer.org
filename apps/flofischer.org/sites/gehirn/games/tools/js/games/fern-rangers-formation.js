/** Presentation units and a bounded representative company. Native geometry and
 * logical strength remain untouched. The live game already overlaps arms and equipment in its crowd. Packing uses
 * body cores, while full silhouettes drive labels and road-edge clearance.
 * Simulation radii and shot trajectories are independent and remain unchanged. */
// Native character roles match the visible heights of the live Ranger species.
// The additional Giant keeps its wide silhouette without becoming a foreground wall.
export const LIVE_TROOP_HEIGHT = {
 CAPTAIN_HAZEL:1.5748433714, HUMAN_LEGIONARY:1.4305843355,
 HALFGROWN_LEGIONARY:1.3066313502, DUCK_LEGIONARY:1.3199991919,
 GIANT_LEGIONARY:1.5748433714,
};
// Captive Fox height in the live game, retargeted uniformly to cage and all miners.
// Dwarf/Halfgrown/Human proportions and authored doorway clearance stay intact.
export const MINER_CAGE_SCALE = 0.631480273656410;
export const TROOP_PROFILES = {
 CAPTAIN_HAZEL:{min:[-.473886,0,-.374529],max:[.473886,1.69973,.479994],muzzle:[.391,.605,.25],owner:'armR'},
 HUMAN_LEGIONARY:{min:[-.488680,0,-.273265],max:[.300938,1.699277,.401702],muzzle:[-.008474,.973685,.359181],owner:'recoil'},
 HALFGROWN_LEGIONARY:{min:[-.273616,0,-.173966],max:[.358209,.999575,.481262],muzzle:[-.173397,.529993,.48176],owner:'recoil'},
 GIANT_LEGIONARY:{min:[-1.225065,0,-.526149],max:[.710544,3.398535,.973536],muzzle:[.068424,2.115102,.900472],owner:'recoil'},
 DUCK_LEGIONARY:{min:[-.331798,0,-.221585],max:[.446260,1.298902,.595848],muzzle:[-.214683,.656182,.596465],owner:'armR'},
};
// Optical correction from paired silhouettes at the live camera, three gait phases.
// Different boot/helmet depth changes perspective height even at equal mesh height.
export const TROOP_SCREEN_FIT = {CAPTAIN_HAZEL:.940, HUMAN_LEGIONARY:.926,
 HALFGROWN_LEGIONARY:1.019, DUCK_LEGIONARY:.996, GIANT_LEGIONARY:.933};
export const troopScale = id => TROOP_SCREEN_FIT[id]*LIVE_TROOP_HEIGHT[id] / (TROOP_PROFILES[id].max[1]-TROOP_PROFILES[id].min[1]);
export const troopId = i => i===0?'CAPTAIN_HAZEL':i===17?'GIANT_LEGIONARY':i%3===0?'HALFGROWN_LEGIONARY':i%3===1?'DUCK_LEGIONARY':'HUMAN_LEGIONARY';
export function representativeIndices(n) {
 const count=n<=15?n:Math.min(24,15+Math.ceil((Math.min(n,90)-15)/10));
 const ids=Array.from({length:count},(_,i)=>i);
 if(n>=18&&!ids.includes(17))ids[ids.length-1]=17;
 return ids;
}
const formationCache=new Map();
function baseFormation(s) {
 const count=Math.min(90,s.n),key=count;if(formationCache.has(key))return formationCache.get(key);
 const ids=representativeIndices(count),half=Math.min(1.15,s.fullRadius),k=Math.min(1.15,s.fullRadius)/s.fullRadius,kz=.6+.4*k;
 const backLimit=Math.max(s.fullRadius,...Array.from({length:Math.min(count,90)},(_,i)=>-s.slotTarget(i).z*kz))+.4;
 const out=[],marginX=.022,marginD=.035,step=.025;
 const make=(i,cx,front)=>{
  const id=troopId(i),p=TROOP_PROFILES[id],size=troopScale(id);
  const width=(p.max[0]-p.min[0])*size+2*marginX,depth=(p.max[2]-p.min[2])*size+2*marginD;
  // Heads, arms and long guns interleave just as in the live sunflower crowd.
  // Keep independently separated torso/foot cores instead of shrinking all art.
  const coreWidth=width*.60,coreDepth=depth*.50,d=front-p.max[2]*size-marginD;
  return {i,id,p,size,cx,d,width,depth,left:cx-width/2,right:cx+width/2,front,back:front-depth,
   core:{left:cx-coreWidth/2,right:cx+coreWidth/2,front:front-(depth-coreDepth)/2,back:front-(depth+coreDepth)/2}};
 };
 // The canonical Giant is an anchored rear rank, never a moving foreground wall.
 if(ids.includes(17)){const shape=make(17,0,0);out.push(make(17,0,-Math.min(backLimit,2.2+count*.005)+shape.depth));}
 for(const i of ids) {
  if(i===17)continue;
  const shape=make(i,0,.5),preferred=count>1&&count<=4&&i===0?-half+shape.width/2:Math.max(-half+.25,Math.min(half-.25,s.slotTarget(i).x*.55));
  const xs=[];for(let x=-half+(shape.core.right-shape.core.left)/2;x<=half-(shape.core.right-shape.core.left)/2+.00001;x+=step)xs.push(x);xs.sort((a,b)=>Math.abs(a-preferred)-Math.abs(b-preferred));
  let found=null;
  for(let front=.5;front-shape.depth>=-backLimit-.00001&&!found;front-=step)for(const cx of xs){const a=make(i,cx,front);if(out.every(b=>a.core.right<=b.core.left+.000001||b.core.right<=a.core.left+.000001||a.core.front<=b.core.back+.000001||b.core.front<=a.core.back+.000001)){found=a;break;}}
  if(!found)throw new Error('Rangers representative footprint cannot fit '+count+'/'+i);
  out.push(found);
 }
 out.sort((a,b)=>a.i-b.i);const result={half,places:out};formationCache.set(key,result);return result;
}
/** Fills the cache for every squad size. With `pause` (an async yield) the work is cut into `budget` ms slices so it can run behind a map. */
export async function warmCampaignFormations(s,{pause=null,budget=6}={}){
 let sliceStart=performance.now();
 for(let n=1;n<=90;n++){
  baseFormation({n,fullRadius:.35*Math.sqrt(n)+.25,slotTarget:i=>s.slotTarget(i)});
  if(pause&&performance.now()-sliceStart>budget){await pause();sliceStart=performance.now();}
 }
}
export function campaignFormation(s) {
 const squeeze=Math.max(s.squeeze||0,s.formationSqueeze||0),radius=s.fullRadius+(Math.min(s.fullRadius,1.15)-s.fullRadius)*squeeze;
 const base=baseFormation(s),frontLimit=Math.max(.5,Math.min(radius*.75-.12,Math.max(...s.slots.map(p=>p.z)))),shift=frontLimit-.5,half=Math.min(radius,3-Math.abs(s.px)),spread=Math.max(0,half-base.half);
 return base.places.map(a=>{
  const x=a.cx+a.cx/base.half*spread,offset=x-a.cx;
  return {i:a.i,id:a.id,x:x+(a.p.min[0]+a.p.max[0])/2*a.size,z:-a.d-shift,size:a.size,left:a.left+offset,right:a.right+offset,front:a.front+shift,back:a.back+shift,core:{left:a.core.left+offset,right:a.core.right+offset,front:a.core.front+shift,back:a.core.back+shift}};
 });
}
export function nearestMuzzle(places,x) {
 let best=null,score=Infinity;
 for(const p of places){if(!Number.isFinite(p.mx))continue;const rank=Math.abs(p.mx-x)*4+Math.max(0,p.mz)*.7;if(rank<score){best=p;score=rank;}}
 return best;
}
/** The head stays exactly on the simulated trajectory. Only the first short
 * beam tail connects it to its real posed muzzle. No range/timing translation. */
export function shotSegment(x,d,muzzle,heft=1,turret=false) {
 const head={x,y:turret?.78:.42,z:-d},tail={x,y:head.y,z:-d+.8*Math.min(2.4,1+Math.log2(Math.max(1,heft))*.3)};
 if(muzzle&&!turret&&d<-muzzle.mz-.025)return {head,tail,visible:false};
 if(muzzle&&!turret&&Math.abs(x-muzzle.mx)<.28&&d<Math.max(2.5,-muzzle.mz+1.2)){tail.x=muzzle.mx;tail.y=muzzle.my;tail.z=muzzle.mz;const length=Math.hypot(head.x-tail.x,head.y-tail.y,head.z-tail.z);if(length>1.4){const k=1.4/length;tail.x=head.x+(tail.x-head.x)*k;tail.y=head.y+(tail.y-head.y)*k;tail.z=head.z+(tail.z-head.z)*k;}}
 return {head,tail,visible:true};
}
/** Keep strength attached to its company. Bodies, native gates and HUD are
 * exclusion rectangles in CSS pixels; nearby sides/below precede distant escape. */
export function placeSquadBadge({x,bodyTop,bodyBounds,width,height,viewWidth,viewHeight=900,hudBottom=72,obstacles=[],previous,now=0}) {
 const gap=8,halfW=width/2,halfH=height/2;
 const body=bodyBounds??{left:x-halfW,right:x+halfW,top:bodyTop,bottom:bodyTop+height*2};
 const preferred={x,y:body.top-height,slot:'above'},blocked=[body,...obstacles];
 const overlaps=(p,r)=>p.x+halfW>r.left-gap&&p.x-halfW<r.right+gap&&p.y+halfH>r.top-gap&&p.y-halfH<r.bottom+gap;
 const free=p=>p.x-halfW>=gap&&p.x+halfW<=viewWidth-gap&&p.y-halfH>=hudBottom&&p.y+halfH<=viewHeight-gap&&!blocked.some(r=>overlaps(p,r));
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const connector=p=>{
  let from,to;
  if(p.x+halfW<=body.left){from={x:p.x+halfW,y:p.y};to={x:body.left-3,y:clamp(p.y,body.top+3,body.bottom-3)};}
  else if(p.x-halfW>=body.right){from={x:p.x-halfW,y:p.y};to={x:body.right+3,y:clamp(p.y,body.top+3,body.bottom-3)};}
  else if(p.y-halfH>=body.bottom){from={x:p.x,y:p.y-halfH};to={x:clamp(p.x,body.left+3,body.right-3),y:body.bottom+3};}
  else{from={x:p.x,y:p.y+halfH};to={x:clamp(p.x,body.left+3,body.right-3),y:body.top-3};}
  // A connector cannot cross a gate/HUD rectangle between its two endpoints.
  const crosses=r=>{let lo=0,hi=1;for(const [a,b,min,max] of[[from.x,to.x,r.left-2,r.right+2],[from.y,to.y,r.top-2,r.bottom+2]]){const d=b-a;if(Math.abs(d)<1e-8){if(a<min||a>max)return false;}else{const t0=(min-a)/d,t1=(max-a)/d;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)return false;}}return true;};
  return obstacles.some(crosses)?null:{from,to};
 };
 const near=[{x:body.left-halfW-gap,y:body.top+halfH+gap,slot:'left'},{x:body.right+halfW+gap,y:body.top+halfH+gap,slot:'right'},{x,y:body.bottom+halfH+gap,slot:'below'}];
 const normalFree=free(preferred),clearSince=normalFree?(previous?.clearSince??now):null;
 // A valid side/below location stays attached throughout the run. Do not
 // jump back above between two passing gate parts; change only if blocked.
 const held=near.find(p=>p.slot===previous?.slot);
 if(held&&free(held)){const line=connector(held);if(line)return{...held,connector:line,bodyTop:body.top,bodyBounds:body,clearSince};}
 if(normalFree&&(!previous?.slot||previous.slot==='above'))return{...preferred,bodyTop:body.top,bodyBounds:body,connector:null,clearSince};
 const escape=[];for(const r of obstacles){escape.push({x:r.left-halfW-gap,y:preferred.y},{x:r.right+halfW+gap,y:preferred.y},{x,y:r.top-halfH-gap},{x,y:r.bottom+halfH+gap});}
 const rank=p=>Math.hypot(p.x-x,p.y-body.top);
 for(const candidates of[near,escape]){const safe=candidates.filter(free).map(p=>({...p,connector:connector(p)})).filter(p=>p.connector).sort((a,b)=>rank(a)-rank(b));if(safe.length)return{...safe[0],bodyTop:body.top,bodyBounds:body,clearSince};if(candidates===near&&normalFree)return{...preferred,bodyTop:body.top,bodyBounds:body,connector:null,clearSince};}
 // Rare crowded projections: search only screen-space edges of the known
 // exclusions, keeping the nearest unobstructed connector to this company.
 const xs=[gap+halfW,viewWidth-gap-halfW,x],ys=[hudBottom+halfH,viewHeight-gap-halfH,preferred.y,body.top+halfH+gap,body.bottom+halfH+gap];
 const candidates=[];for(const cx of xs)for(const cy of ys){const p={x:cx,y:cy};if(free(p)){const line=connector(p);if(line)candidates.push({...p,connector:line});}}
 candidates.sort((a,b)=>rank(a)-rank(b));return{...(candidates[0]??preferred),bodyTop:body.top,bodyBounds:body,clearSince};
}
