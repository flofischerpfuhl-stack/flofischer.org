/** Game-specific Fernworld region maps. Only the visible region owns GPU resources. */
import { THREE, createRenderer, addLights, studioEnvironment, applyIbl, LOW_GPU } from './three-kit.js';
import { WorldLibrary, fitWorldCamera } from '../../games-assets/fernworld/runtime/world-library.js';
import { ChannelLibrary } from '../../games-assets/fernworld/runtime/channel-library.js';
import { figure } from './world/figure.js';
import { icon } from '../../../assets/kit/icons.js';

const REGIONS = ['viridis', 'sahrun', 'hibern', 'vulkara', 'sturmbastion'];
const NAMES = ['Viridis', 'Sahrun', 'Hibern', 'Vulkara', 'Sturmbastion'];
const MAPS = {
  'fern-rangers': { family: 'rangers', hero: 'CAPTAIN_HAZEL' },
  'pips-tower': { family: 'pip', hero: 'PIP_KESSEL', companion: 'BISCUIT_GLEAMPUP' },
  momo: { family: 'momo', hero: 'MOMO_NOVICE' },
  tanks: { family: 'bounce', hero: 'TOY_HAZEL' },
};
const SKY = [0xd8e4de, 0xeee2c8, 0xe1eaf0, 0xd4cad1, 0xd7dce0];
const escapeText = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function badge(text, { bg, fg }) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.arc(64, 68, 54, 0, Math.PI * 2); g.fill();
  g.fillStyle = bg; g.beginPath(); g.arc(64, 62, 52, 0, Math.PI * 2); g.fill();
  g.lineWidth = 8; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = fg; g.font = `800 ${text.length > 2 ? 40 : 58}px Geist, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}



export function mountOverworld(host, { gameId, levels, state, onPlay, title = '' }) {
  const config = MAPS[gameId];
  if (!config) throw new Error(`No authored world family for ${gameId}`);
  host.classList.add('gm-ow');
  host.innerHTML = `
    <canvas class="gm-ow__canvas" aria-hidden="true"></canvas>
    <div class="gm-ow__top"><div class="gm-ow__world"><span class="gm-ow__kicker" data-ow="kicker"></span><strong data-ow="world"></strong></div><div class="gm-ow__stars">${icon('star',{size:16})}<span class="fw-num" data-ow="stars"></span></div></div>
    <div class="gm-ow__nav"><button type="button" class="fw-iconbtn gm-hud__btn" data-ow="prev" aria-label="Previous region">${icon('chevron-left',{size:22})}</button><button type="button" class="fw-iconbtn gm-hud__btn" data-ow="next" aria-label="Next region">${icon('chevron-right',{size:22})}</button></div>
    <div class="gm-ow__lock" data-ow="lock" hidden></div>
    <section class="gm-ow__card" data-ow="card" aria-live="polite" hidden></section>
    <div class="gm-ow__loading" data-ow="loading" role="status"><span data-ow="loading-text">Opening the map…</span><button class="fw-btn fw-btn--sm" data-ow="retry" hidden>Try again</button></div>
    <ol class="gm-ow__list sr-only" data-ow="list" aria-label="${escapeText(title)} levels"></ol>`;
  const $ = key => host.querySelector(`[data-ow="${key}"]`), canvas = host.querySelector('canvas');
  const renderer = createRenderer(canvas), scene = new THREE.Scene();
  renderer.shadowMap.autoUpdate = false;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 200);
  const env = studioEnvironment(renderer), lights = addLights(scene, { dir: [-12, 24, 15], shadowBox: 18, mapSize: 2048, intensity: 2.4, ambient: 1.1 });
  const worlds = [...new Set(levels.map(l => l.world ?? 0))].sort((a,b)=>a-b).map(index => ({ index, levels: levels.map((lv,i)=>({...lv,i})).filter(l=>(l.world??0)===index) }));
  const library = new WorldLibrary(), actors = new ChannelLibrary();
  const view = { yaw: 0, pitch: 0, zoom: 1, panX: 0, panZ: 0, tYaw: 0, tPitch: 0, tZoom: 1, tPanX: 0, tPanZ: 0 };
  let world = 0, sel = 0, active = false, raf = 0, last = 0, hop = null, drag = null;
  let region = null, regionIndex = -1, visuals = null, serial = 0, pendingIndex = -1, pending = null, destroyed = false;
  let hero = null, companion = null, span = 30, aspect = 1, width = 1, height = 1;
  const look = new THREE.Vector3(), ahead = new THREE.Vector3(), offset = new THREE.Vector3(), spherical = new THREE.Spherical();
  const pointers = new Map(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  window.__owView = { renderer, scene, camera, get region() { return region?.definition; } };

  async function makeActor(id, targetHeight) {
    const { entry, definition } = await actors.definition(id);
    const placement = new THREE.Group();
    let animate, clipName = '', mixer, actor;
    if (entry.pipeline === 'channel-mesh-v1') {
      const model = await actors.model(id, 'lo'), fig = figure(model);
      placement.add(fig.root);
      animate = (dt, moving, time) => {
        fig.body.position.y = moving ? Math.abs(Math.sin(time * 12)) * .035 : Math.sin(time * 2) * .008;
        for (const limb of fig.legs) limb.pivot.rotation.x = moving ? Math.sin(time * 12) * .45 * limb.side : 0;
      };
    } else {
      const lod = definition.lods?.lo ? 'lo' : (definition.defaultLod ?? 'hi');
      actor = await actors.create(id, lod);
      placement.add(actor.scene);
      mixer = new THREE.AnimationMixer(actor.scene);
      const idle = actor.animations.find(c => /^(Idle|Ground_Idle)$/i.test(c.name)) ?? actor.animations[0];
      const walk = actor.animations.find(c => /^(Walk|Locomotion|Travel)$/i.test(c.name)) ?? idle;
      animate = (dt, moving) => {
        const clip = moving ? walk : idle;
        if (clip && clip.name !== clipName) {
          mixer.stopAllAction(); mixer.clipAction(clip).reset().play(); clipName = clip.name;
        }
        mixer.update(dt);
      };
      animate(.2, false, 0);
    }
    placement.updateMatrixWorld(true);
    // UI marker scale, derived once from this chosen tier; no gameplay colliders or LOD switching here.
    const bounds = new THREE.Box3().setFromObject(placement), bodyHeight = bounds.max.y - bounds.min.y;
    if (!(bodyHeight > 0)) throw new Error(`Empty map character: ${id}`);
    const model = placement.children[0];
    model.scale.multiplyScalar(targetHeight / bodyHeight);
    model.position.y -= bounds.min.y * targetHeight / bodyHeight;
    placement.visible = false;
    applyIbl(placement, env, .7);
    scene.add(placement);
    return { root: placement, animate, release() {
      mixer?.stopAllAction(); mixer?.uncacheRoot(actor.scene); placement.removeFromParent();
      if (actor) actor.release();
      else placement.traverse(n => { if (n.isMesh) n.material.dispose(); });
    }};
  }
  let heroLoad = null;
  function ensureActors() {
    if (hero) return Promise.resolve();
    if (!heroLoad) heroLoad = Promise.allSettled([
      makeActor(config.hero, 1.4), config.companion ? makeActor(config.companion, .65) : Promise.resolve(null),
    ]).then(results => {
      const failed = results.find(r => r.status === 'rejected');
      if (failed || destroyed) {
        for (const r of results) if (r.status === 'fulfilled') r.value?.release();
        throw failed?.reason ?? new Error('Map disposed while its characters loaded');
      }
      [hero, companion] = results.map(r => r.value);
    }).catch(error => { heroLoad = null; throw error; });
    return heroLoad;
  }

  function releaseVisuals() {
    if (!visuals) return;
    visuals.group.removeFromParent();
    for (const n of visuals.nodes) { for (const map of Object.values(n.maps)) map.dispose(); n.label.material.dispose(); }
    for (const mesh of [visuals.pads, visuals.stars, visuals.ring]) { mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose?.(); }
    visuals = null;
  }
  function makeNodes(w, wd) {
    const unit = w.unitScale, group = new THREE.Group(), nodes = [];
    const pads = new THREE.InstancedMesh(new THREE.CylinderGeometry(.43*unit,.48*unit,.065*unit,24), new THREE.MeshStandardMaterial({color:0xffffff,roughness:.72}), wd.levels.length);
    pads.receiveShadow = true;
    const stars = new THREE.InstancedMesh(STAR_GEO.clone(), new THREE.MeshStandardMaterial({color:0xffffff,roughness:.4,metalness:.15}), wd.levels.length*3);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.65*unit,.045*unit,8,36),new THREE.MeshBasicMaterial({color:0xffdf83,transparent:true,opacity:.85}));
    ring.rotation.x = -Math.PI/2;
    const dummy = new THREE.Object3D();
    wd.levels.forEach((lv,k)=>{
      const p=w.nodePositions[k].clone();
      dummy.position.copy(p); dummy.position.y+=.04*unit; dummy.scale.setScalar(lv.boss?1.25:1);dummy.updateMatrix();pads.setMatrixAt(k,dummy.matrix);
      const maps = Object.fromEntries(Object.entries(BADGE).map(([key,col])=>[key,badge(lv.boss?'★':String(k+1),col)]));
      const label=new THREE.Sprite(new THREE.SpriteMaterial({map:maps.open,depthTest:false,transparent:true}));
      label.position.copy(p);label.position.y+=1.65*unit;label.renderOrder=2;group.add(label);
      nodes.push({lv,pos:p,label,maps,index:k,distance:w.nodeDistances[k]});
    });
    group.add(pads,stars,ring);scene.add(group);
    return {group,pads,stars,ring,nodes,unit};
  }
  function paintNodes() {
    if (!visuals || regionIndex!==world) return;
    const dummy=new THREE.Object3D(),colour=new THREE.Color();let count=0;
    for(const n of visuals.nodes){
      const open=state.open(n.lv.i),score=state.stars(n.lv.i),look=!open?'locked':n.lv.i===sel?'here':score?'done':n.lv.boss?'boss':'open';
      visuals.pads.setColorAt(n.index,colour.set(!open?0x87908f:score?0x9cbb7a:n.lv.boss?0xbe735d:0xeadbb8));
      n.label.material.map=n.maps[look];
      for(let k=0;k<score;k++){dummy.position.copy(n.pos);dummy.position.x+=(k-(score-1)/2)*.27*visuals.unit;dummy.position.y+=.48*visuals.unit;dummy.rotation.set(0,0,0);dummy.scale.setScalar(.10*visuals.unit);dummy.updateMatrix();visuals.stars.setMatrixAt(count,dummy.matrix);visuals.stars.setColorAt(count++,colour.set(0xffce55));}
    }
    visuals.pads.instanceColor.needsUpdate=true;visuals.stars.count=count;visuals.stars.instanceMatrix.needsUpdate=true;if(visuals.stars.instanceColor)visuals.stars.instanceColor.needsUpdate=true;
    const selected=visuals.nodes.find(n=>n.lv.i===sel);visuals.ring.visible=!!selected;
    if(selected){visuals.ring.position.copy(selected.pos);visuals.ring.position.y+=.09*visuals.unit;}
  }
  function syncDom() {
    const wd=worlds.find(w=>w.index===world);
    $('kicker').textContent=world===4?'Bonus campaign':`World ${world+1}`;
    $('world').textContent=regionIndex===world?(region.layout.title??NAMES[world]):NAMES[world];
    $('stars').textContent=`${levels.reduce((n,_,i)=>n+state.stars(i),0)} / ${levels.length*3}`;
    $('prev').disabled=world===worlds[0].index;$('next').disabled=world===worlds.at(-1).index;
    $('lock').hidden=state.worldOpen(world);$('lock').textContent=state.worldOpen(world)?'':state.need(world);
    const lv=levels[sel],card=$('card');card.hidden=!lv || (lv.world??0)!==world || !state.worldOpen(world);
    if(!card.hidden){const n=wd.levels.findIndex(l=>l.i===sel)+1,st=state.stars(sel),best=state.best(sel),open=state.open(sel);
      card.innerHTML=`<div class="gm-ow__cardhead"><span class="gm-ow__kicker">${lv.boss?'Boss':`Level ${world+1}-${n}`}</span><strong>${escapeText(lv.name)}</strong></div><div class="gm-ow__cardstars" aria-label="${st} of 3 stars">${[0,1,2].map(k=>`<span class="${k<st?'is-on':''}">${icon('star',{size:18})}</span>`).join('')}</div>${best?`<div class="gm-ow__best">Best <span class="fw-num">${best.toLocaleString('en')}</span></div>`:''}<button type="button" class="fw-btn fw-btn--primary gm-ow__play" data-ow="play" ${open?'':'disabled'}>${icon(open?'play':'lock',{size:16})}${open?(st?'Play again':'Play'):'Locked'}</button>`;
    }
    $('list').innerHTML=levels.map((lv,i)=>`<li><button type="button" data-ow-level="${i}" ${state.open(i)?'':'disabled'}>${escapeText(lv.name)}, ${state.stars(i)} of 3 stars</button></li>`).join('');
  }
  function fit() {
    if(!region)return;
    span=fitWorldCamera(camera,region,aspect,1.08);
    offset.copy(region.cameraPosition).sub(region.cameraTarget);spherical.setFromVector3(offset);
  }
  function placeHero() {
    const n=visuals?.nodes.find(n=>n.lv.i===sel), visible=!!n&&regionIndex===world&&state.worldOpen(world);
    if(hero)hero.root.visible=visible;if(companion)companion.root.visible=visible;
    if(!visible)return;
    hero.root.scale.setScalar(region.unitScale);hero.root.position.copy(n.pos);hero.root.position.y+=.07*region.unitScale;
    const tangent=region.nodeTangents[n.index];hero.root.rotation.y=Math.atan2(tangent.x,tangent.z);
    if(companion){companion.root.scale.setScalar(region.unitScale);companion.root.position.copy(hero.root.position).addScaledVector(new THREE.Vector3(-tangent.z,0,tangent.x),.65*region.unitScale);companion.root.rotation.y=hero.root.rotation.y;}
  }
  function setWorld(value,{keepSel=false,force=false}={}) {
    world=Math.max(worlds[0].index,Math.min(worlds.at(-1).index,value));
    const wd=worlds.find(w=>w.index===world),current=state.current();
    if(!keepSel || (levels[sel]?.world??0)!==world)sel=wd.levels.some(l=>l.i===current)?current:wd.levels[0].i;
    hop=null;syncDom();
    if(!force&&regionIndex===world){++serial;pendingIndex=-1;pending=null;$('loading').hidden=true;paintNodes();placeHero();kick();return Promise.resolve();}
    if(!force&&pendingIndex===world&&pending)return pending;
    const request=++serial,target=world;pendingIndex=target;
    $('loading').hidden=false;$('loading-text').textContent='Opening the map…';$('retry').hidden=true;
    if(hero)hero.root.visible=false;if(companion)companion.root.visible=false;
    pending=(async()=>{
      let next;
      try{
        next=await library.region(target===4?'sturmbastion':config.family,REGIONS[target]);await ensureActors();
        if(request!==serial||destroyed){next.release();return;}
        releaseVisuals();region?.release();region=next;regionIndex=target;scene.add(region.root);
        scene.background=new THREE.Color(SKY[target]);
        visuals=makeNodes(region,wd);
        const box=region.bounds,size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
        const radius=Math.max(size.x,size.z)*.55;
        lights.light.position.copy(center).add(new THREE.Vector3(-radius*.8,radius*1.5,radius));lights.light.target.position.copy(center);lights.light.target.updateMatrixWorld();
        Object.assign(lights.light.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius,near:Math.max(.001,radius*.02),far:radius*6});lights.light.shadow.camera.updateProjectionMatrix();
        applyIbl(region.root,env,.55);fit();paintNodes();placeHero();renderer.shadowMap.needsUpdate=true;
        $('loading').hidden=true;syncDom();kick();
      }catch(error){next?.release();if(request!==serial||destroyed)return;console.error('[games] map load failed',error);$('loading-text').textContent='This map could not load. Please try again.';$('retry').hidden=false;}
      finally{if(request===serial){pendingIndex=-1;pending=null;}}
    })();return pending;
  }
  function moveTo(i) {
    if(!levels[i])return;
    if((levels[i].world??0)!==world){sel=i;return setWorld(levels[i].world??0,{keepSel:true});}
    if(i===sel)return;
    const from=visuals?.nodes.find(n=>n.lv.i===sel),to=visuals?.nodes.find(n=>n.lv.i===i);sel=i;
    if(from&&to&&hero){hop={start:performance.now(),from:from.distance,to:to.distance,duration:Math.min(2200,500+Math.abs(to.distance-from.distance)/region.unitScale*70)};}
    else placeHero();paintNodes();syncDom();kick();
  }
  function resize(){const r=canvas.getBoundingClientRect();width=Math.max(1,r.width);height=Math.max(1,r.height);aspect=width/height;renderer.setPixelRatio(LOW_GPU?.6:Math.min(1.5,devicePixelRatio||1));renderer.setSize(width,height,false);fit();kick();}
  function kick(){if(active&&!raf&&!destroyed){last=0;raf=requestAnimationFrame(frame);}}
  function frame(t){
    raf=0;if(!active||destroyed)return;const dt=Math.min(.05,(t-(last||t))/1000);last=t;const time=t/1000,reduced=motionPreference.matches;
    if(region){
      for(const key of ['yaw','pitch','zoom','panX','panZ'])view[key]+=(view['t'+key[0].toUpperCase()+key.slice(1)]-view[key])*(1-Math.exp(-dt*8));
      look.copy(region.cameraTarget);look.x+=view.panX*region.unitScale;look.z+=view.panZ*region.unitScale;
      const phi=THREE.MathUtils.clamp(spherical.phi-view.pitch,.22,1.36),theta=spherical.theta+view.yaw;
      offset.setFromSphericalCoords(spherical.radius,phi,theta);camera.position.copy(look).add(offset);camera.lookAt(look);
      const h=span*.5*view.zoom;camera.left=-h*aspect;camera.right=h*aspect;camera.bottom=-h;camera.top=h;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
      region.update(time,reduced);
      if(hop&&hero){const k=Math.min(1,(t-hop.start)/hop.duration),e=k*k*(3-2*k),d=THREE.MathUtils.lerp(hop.from,hop.to,e);region.pointAtDistance(d,hero.root.position);hero.root.position.y+=(.07+(reduced?0:Math.abs(Math.sin(k*Math.PI*6))*.06))*region.unitScale;region.pointAtDistance(d+Math.sign(hop.to-hop.from)*.04*region.unitScale,ahead);hero.root.rotation.y=Math.atan2(ahead.x-hero.root.position.x,ahead.z-hero.root.position.z);if(companion){companion.root.position.copy(hero.root.position);companion.root.position.x-=.6*region.unitScale;companion.root.rotation.y=hero.root.rotation.y;}renderer.shadowMap.needsUpdate=true;if(k===1){hop=null;placeHero();}}
      hero?.animate(reduced?0:dt,!!hop,time);companion?.animate(reduced?0:dt,!!hop,time);
      if(visuals){visuals.ring.material.opacity=reduced?.8:.72+Math.sin(time*3)*.15;const size=Math.max(.75*region.unitScale,span*view.zoom/height*19);for(const n of visuals.nodes)n.label.scale.setScalar(size);}
      renderer.render(scene,camera);
    }
    raf=requestAnimationFrame(frame);
  }
  function pick(e){
    if(!visuals||regionIndex!==world)return -1;const rect=canvas.getBoundingClientRect();ndc.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(ndc,camera);
    const hit=ray.intersectObject(visuals.pads,false)[0];if(hit)return visuals.nodes[hit.instanceId].lv.i;
    let best=-1,distance=34;
    for(const n of visuals.nodes){const p=n.label.position.clone().project(camera),d=Math.hypot((p.x*.5+.5)*rect.width-(e.clientX-rect.left),(-p.y*.5+.5)*rect.height-(e.clientY-rect.top));if(d<distance){distance=d;best=n.lv.i;}}
    return best;
  }
  const pinch=()=>{const[a,b]=[...pointers.values()];return{d:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2}};
  const panBy=(dx,dy)=>{const k=span/(region?.unitScale??1)/height*view.zoom;view.tPanX=THREE.MathUtils.clamp(view.tPanX-dx*k,-12,12);view.tPanZ=THREE.MathUtils.clamp(view.tPanZ-dy*k,-12,12);};
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});drag={x:e.clientX,y:e.clientY,lx:e.clientX,ly:e.clientY,moved:pointers.size>1?99:0,pan:e.button===2||e.shiftKey,pinch:pointers.size===2?pinch():null};});
  canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!drag)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const p=pinch();if(drag.pinch){view.tZoom=THREE.MathUtils.clamp(view.tZoom*drag.pinch.d/Math.max(1,p.d),.4,1.7);panBy(p.x-drag.pinch.x,p.y-drag.pinch.y);}drag.pinch=p;return;}const dx=e.clientX-drag.lx,dy=e.clientY-drag.ly;drag.lx=e.clientX;drag.ly=e.clientY;drag.moved=Math.max(drag.moved,Math.hypot(e.clientX-drag.x,e.clientY-drag.y));if(drag.moved<6)return;if(drag.pan)panBy(dx,dy);else{view.tYaw-=dx*.006;view.tPitch=THREE.MathUtils.clamp(view.tPitch+dy*.004,-.4,.6);}});
  canvas.addEventListener('pointerup',e=>{pointers.delete(e.pointerId);if(!drag)return;const moved=drag.moved;if(pointers.size){drag.pinch=null;return;}drag=null;if(moved<8&&state.worldOpen(world)){const i=pick(e);if(i>=0&&state.open(i)){if(i===sel&&!hop)onPlay(i);else moveTo(i);}else if(i>=0){sel=i;paintNodes();syncDom();}}});
  canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);drag=null;});canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{e.preventDefault();view.tZoom=THREE.MathUtils.clamp(view.tZoom*Math.exp(e.deltaY*.0012),.4,1.7);},{passive:false});
  canvas.addEventListener('dblclick',()=>Object.assign(view,{tYaw:0,tPitch:0,tZoom:1,tPanX:0,tPanZ:0}));canvas.style.touchAction='none';
  host.addEventListener('click',e=>{const b=e.target.closest('[data-ow],[data-ow-level]');if(!b)return;if(b.dataset.owLevel!==undefined){moveTo(Number(b.dataset.owLevel));return;}const action=b.dataset.ow;if(action==='prev')setWorld(world-1);else if(action==='next')setWorld(world+1);else if(action==='retry')setWorld(world,{keepSel:true,force:true});else if(action==='play'&&state.open(sel))onPlay(sel);});
  function key(e){if(!active)return false;const open=worlds.find(w=>w.index===world).levels.filter(l=>state.open(l.i)),k=open.findIndex(l=>l.i===sel);if(e.key==='PageDown'||(e.key==='ArrowRight'&&e.shiftKey))setWorld(world+1);else if(e.key==='PageUp'||(e.key==='ArrowLeft'&&e.shiftKey))setWorld(world-1);else if(e.key==='ArrowRight'&&k>=0&&k<open.length-1)moveTo(open[k+1].i);else if(e.key==='ArrowLeft'&&k>0)moveTo(open[k-1].i);else if((e.key==='Enter'||e.key===' ')&&state.open(sel)&&!e.target.closest?.('button'))onPlay(sel);else return false;return true;}
  const observer=new ResizeObserver(()=>{if(active)resize();});observer.observe(canvas);
  return {
    activate(){if(active)return;active=true;resize();sel=state.current();setWorld(levels[sel]?.world??0,{keepSel:true});kick();},
    deactivate(){active=false;if(raf)cancelAnimationFrame(raf);raf=0;},
    refresh(){sel=state.current();setWorld(levels[sel]?.world??0,{keepSel:true});},key,
    get selected(){return sel;},get world(){return world;},get loaded(){return regionIndex===world&&!pending;},get ready(){return pending??Promise.resolve();},
    destroy(){destroyed=true;serial++;active=false;cancelAnimationFrame(raf);observer.disconnect();releaseVisuals();region?.release();hero?.release();companion?.release();library.dispose();actors.dispose();env.dispose();renderer.dispose();}
  };
}

const BADGE = {
  open: { bg: '#1f2937', fg: '#fff' }, done: { bg: '#2f9e44', fg: '#fff' }, here: { bg: '#f08c00', fg: '#fff' },
  boss: { bg: '#c92a2a', fg: '#fff' }, locked: { bg: '#9aa1ad', fg: '#e9ecef' },
};
// a soft five-point star for the node star rows
const STAR_GEO = (() => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 0.45 : 1; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, -Math.sin(a) * r); }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 2 });
  g.center();
  return g;
})();
const STAR_MAT = new THREE.MeshStandardMaterial({ color: 0xffcf3a, roughness: 0.3, metalness: 0.2, emissive: 0x6b4a00, emissiveIntensity: 0.4 });
const STAR_DIM = new THREE.MeshStandardMaterial({ color: 0x6b6f78, roughness: 0.6 });
