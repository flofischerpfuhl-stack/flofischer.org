/** A continuous expedition through authored Fernworld regions; only its visible chapter owns GPU resources. */
import { THREE, createRenderer, addLights, studioEnvironment, applyIbl, LOW_GPU } from './three-kit.js';
import { createLoadingStatus } from './loading-status.js';
import { WorldLibrary, fitWorldCamera } from '../../games-assets/fernworld/runtime/world-library.js';
import { ChannelLibrary } from '../../games-assets/fernworld/runtime/channel-library.js';
import { landscape } from './world/overworld-landscape.js';
import { fernhaven, gradeRegion } from './world/fernhaven-landscape.js';
import { createWayfindingPlan } from './overworld-wayfinding.js';
import { fitRouteOverview, separateBadgeCenters } from './overworld-overview.js';
import { prepareOcclusionGeometries } from './overworld-occlusion.js';
import { figure } from './world/figure.js';
import { icon } from '../../../assets/kit/icons.js';

const REGIONS = ['viridis', 'sahrun', 'hibern', 'vulkara', 'sturmbastion'];
const NAMES = ['Viridis', 'Sahrun', 'Hibern', 'Vulkara', 'Sturmbastion'];
const MAPS = {
  'fern-rangers': { family: 'rangers', hero: 'CAPTAIN_HAZEL' },
  'pips-tower': { family: 'pip', hero: 'PIP_KESSEL', companion: 'BISCUIT_GLEAMPUP' },
  momo: { family: 'momo', hero: 'GLIMMO' },
  tanks: { family: 'bounce', hero: 'TOY_HAZEL' },
};
const SKY = ['#78b4ea','#e3c393','#c5dce9','#b698ab','#a8b2c4'];
const JOURNEYS={rangers:['Waldpfade & Außenposten','Dünen & Karawanen','Schneepässe & Festungen','Basaltpfade & Maschinen'],pip:['Das grüne Fossilgewölbe','Das versunkene Archiv','Die Reifgalerie','Die Basaltkrone'],momo:['Lichtungen & Fernlinge','Oasen & Fernlinge','Schneefelder & Fernlinge','Glutlicht & Fernlinge'],bounce:['Der Waldpokal','Das Dünenturnier','Der Winterpokal','Das Kraterfinale']};
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



/** Resolve opaque environment visibility before its unchanged PBR colour pass.
 * Children inherit the exact source transforms, including authored moving pivots.
 * Live figures, sprites and blended water are deliberately outside this layer. */
function opaqueDepthLayer(roots) {
  const sources = [], meshes = [], materials = new Map();
  for (const root of roots) root.traverse(node => {
    if (node.isMesh && !node.userData.owDepthOnly) sources.push(node);
  });
  const depthMaterial = original => {
    if (materials.has(original)) return materials.get(original);
    const material = new THREE.MeshBasicMaterial({
      colorWrite: false, depthWrite: true, depthTest: original.depthTest,
      depthFunc: original.depthFunc, side: original.side,
      map: original.map, alphaMap: original.alphaMap, alphaTest: original.alphaTest,
      opacity: original.opacity, vertexColors: original.vertexColors,
      alphaToCoverage: original.alphaToCoverage,
      polygonOffset: original.polygonOffset,
      polygonOffsetFactor: original.polygonOffsetFactor,
      polygonOffsetUnits: original.polygonOffsetUnits,
      clippingPlanes: original.clippingPlanes,
      clipIntersection: original.clipIntersection,
    });
    // A disabled material preserves mixed opaque/transparent geometry groups.
    material.visible = original.visible && !original.transparent && original.depthWrite;
    materials.set(original, material); return material;
  };
  for (const source of sources) {
    // Authored environment exports are static meshes. Unsupported vertex deformation
    // stays on the original path instead of writing an approximate depth surface.
    if (source.isSkinnedMesh || source.morphTargetInfluences || source.material?.displacementMap) continue;
    const originals = Array.isArray(source.material) ? source.material : [source.material];
    if (!originals.some(m => m.visible && !m.transparent && m.depthWrite)) continue;
    const mapped = originals.map(depthMaterial), material = Array.isArray(source.material) ? mapped : mapped[0];
    let mesh;
    if (source.isInstancedMesh) {
      mesh = new THREE.InstancedMesh(source.geometry, material, source.count);
      mesh.instanceMatrix.array.set(source.instanceMatrix.array.subarray(0, source.count * 16));
      mesh.instanceMatrix.needsUpdate = true;
    } else mesh = new THREE.Mesh(source.geometry, material);
    mesh.name = `DepthOnly_${source.name}`; mesh.userData.owDepthOnly = true;
    mesh.renderOrder = -100; mesh.frustumCulled = source.frustumCulled;
    mesh.layers.mask = source.layers.mask;
    source.add(mesh); meshes.push(mesh);
  }
  return { release() {
    for (const mesh of meshes) { mesh.removeFromParent(); if (mesh.isInstancedMesh) mesh.dispose(); }
    for (const material of materials.values()) material.dispose();
    meshes.length = 0; materials.clear();
  }};
}

export function mountOverworld(host, { gameId, levels, state, onPlay, onSelect, onProgress, hero:heroId, getHero, starters = [], onStarter, getSound, onSound, title = '' }) {
  const config = MAPS[gameId];
  if (!config) throw new Error(`No authored world family for ${gameId}`);
  host.classList.add('gm-ow');
  host.innerHTML = `
    <canvas class="gm-ow__canvas" aria-label="Reise durch die 3D-Welt. Pfeiltasten: nächstes Ziel. Enter: spielen. Bild auf und ab: Region. Home: Übersicht." tabindex="0"></canvas>
    <div class="gm-ow__top"><div class="gm-ow__world"><span class="gm-ow__kicker" data-ow="kicker"></span><strong data-ow="world"></strong><span class="gm-ow__levelcompact" data-ow="level-name"></span></div><div class="gm-ow__stars">${icon('star',{size:16})}<span class="fw-num" data-ow="stars"></span></div></div>
    <div class="gm-ow__nav gm-ow__sr"><button type="button" class="fw-iconbtn gm-hud__btn" data-ow="prev" aria-label="Vorherige Region">${icon('chevron-left',{size:22})}</button><button type="button" class="fw-iconbtn gm-hud__btn" data-ow="next" aria-label="Nächste Region">${icon('chevron-right',{size:22})}</button></div>
    <nav class="gm-ow__journey" data-ow="journey" aria-label="Deine Reise durch Fernworld"></nav>
    <div class="gm-ow__tools gm-ow__sr"><button class="fw-btn fw-btn--sm" data-ow="reset">Übersicht</button><button class="fw-btn fw-btn--sm" data-ow="sound" aria-pressed="true">Ton an</button><button class="fw-btn fw-btn--sm" data-ow="levels" aria-expanded="false">Level wählen</button></div><p class="gm-ow__context" data-ow="context"></p>
    <p class="gm-ow__hint">Ziel antippen · am leuchtenden Tor starten · ziehen: umsehen</p>
    <div class="gm-ow__lock" data-ow="lock" hidden></div>
    <section class="gm-ow__card gm-ow__sr" data-ow="card" aria-live="polite" hidden></section>
    <div class="gm-ow__loading" data-ow="loading" role="status"><span data-ow="loading-text">Die Reise wird vorbereitet…</span><progress class="gm-scene-loading__progress" data-ow="loading-progress" aria-label="Aktueller Ladeschritt der Region"></progress><small data-ow="loading-detail">Spieldaten · Modelle · Szene und Licht</small><button class="fw-btn fw-btn--sm" data-ow="retry" hidden>Erneut versuchen</button></div>
    <ol class="gm-ow__list gm-ow__sr" data-ow="list" aria-label="${escapeText(title)} – Level" hidden></ol>`;
  const $ = key => host.querySelector(`[data-ow="${key}"]`), canvas = host.querySelector('canvas');
  const renderer = createRenderer(canvas), scene = new THREE.Scene();
  renderer.shadowMap.autoUpdate = false;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 200);
  const env = studioEnvironment(renderer), lights = addLights(scene, { dir: [-12, 24, 15], shadowBox: 18, mapSize: 2048, intensity: 2.4, ambient: 1.1 });
  const worlds = [...new Set(levels.map(l => l.world ?? 0))].sort((a,b)=>a-b).map(index => ({ index, levels: levels.map((lv,i)=>({...lv,i})).filter(l=>(l.world??0)===index) }));
  const loadingStatus=createLoadingStatus({root:$('loading'),text:$('loading-text'),progress:$('loading-progress'),detail:$('loading-detail')});
  const loadProgress=event=>{onProgress?.(event);loadingStatus.update(event);};
  const library = new WorldLibrary({onProgress:loadProgress}), actors = new ChannelLibrary({onProgress:loadProgress});
  const view = { yaw: 0, pitch: 0, zoom: 1, panX: 0, panZ: 0, tYaw: 0, tPitch: 0, tZoom: 1, tPanX: 0, tPanZ: 0 };
  let world = 0, sel = 0, active = false, raf = 0, last = 0, hop = null, drag = null;
  let region = null, regionIndex = -1, visuals = null, serial = 0, pendingIndex = -1, pending = null, destroyed = false, versionMismatch=false;
  let initialized=false,lastCurrent=-1,entryAt=0,entryDirection=1,skyTexture=null,regionSpacing=0;const regionCache=new Map(),arrivalFrom=new THREE.Vector3();
  let starterPicking=false,starterPickerVersion=0;let travelView=true, wayfindingDirty=true, wayfindingReport=null, wayfindingTask=null, wayfindingGeneration=0;const canceledWayfinding=[];
  let hero = null, companion = null, span = 30, aspect = 1, width = 1, height = 1;
  const look = new THREE.Vector3(), ahead = new THREE.Vector3(), offset = new THREE.Vector3(), signOffset = new THREE.Vector3(), spherical = new THREE.Spherical();
  const pointers = new Map(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const debugView = { renderer, scene, camera, get wayfinding(){return wayfindingReport}, get region() { return region?.definition; },get hero(){return loadedHero},get heroPosition(){return hero?.root.position.toArray()},get choosingStarter(){return starterPicking},get starters(){return starterActors.map(a=>({id:a.id,visible:a.root.visible,position:a.root.position.toArray()}))},get targets(){return visuals?{nodes:visuals.nodes.map(n=>({i:n.lv.i,open:state.open(n.lv.i),position:n.label.position.toArray()})),actions:visuals.actions.filter(a=>a.root.visible).map(a=>({action:a.action,position:a.face.getWorldPosition(new THREE.Vector3()).toArray(),size:a.face.getWorldScale(new THREE.Vector3()).toArray()}))}:{}},get selected(){return sel},get world(){return world},get cachedRegions(){return [...regionCache.keys()]} };
  const themeMedia=matchMedia('(prefers-color-scheme: dark)');
  function background(){
    const dark=document.documentElement.dataset.theme?document.documentElement.dataset.theme==='dark':themeMedia.matches;
    const c=document.createElement('canvas');c.width=768;c.height=512;const g=c.getContext('2d'),base=new THREE.Color(SKY[world]);
    if(dark)base.multiplyScalar(.35);const sky=`#${base.getHexString()}`,gradient=g.createLinearGradient(0,0,0,512);gradient.addColorStop(0,dark?'#101b2a':sky);gradient.addColorStop(.6,dark?sky:'#f5efe0');gradient.addColorStop(1,dark?'#19232d':sky);g.fillStyle=gradient;g.fillRect(0,0,768,512);
    const sun=g.createRadialGradient(140,95,5,140,95,150);sun.addColorStop(0,dark?'#d4e7f455':'#fff6ccaa');sun.addColorStop(1,'#ffffff00');g.fillStyle=sun;g.fillRect(0,0,350,280);
    for(let layer=0;layer<3;layer++){g.beginPath();g.moveTo(0,512);for(let x=0;x<=768;x+=24){const wave=Math.sin(x*.009+world*1.9+layer)*26+Math.sin(x*.023+layer*3.1)*11;g.lineTo(x,310+layer*55+wave*(world===2?1.7:1));}g.lineTo(768,512);g.closePath();const ridge=new THREE.Color(['#658d76','#b28754','#8da7c6','#8d6777','#6a7e92'][world]);if(dark)ridge.multiplyScalar(.65);g.fillStyle=`#${ridge.getHexString()}${['26','38','49'][layer]}`;g.fill();}
    skyTexture?.dispose();skyTexture=new THREE.CanvasTexture(c);skyTexture.colorSpace=THREE.SRGBColorSpace;scene.background=skyTexture;kick();
  }
  const themeObserver=new MutationObserver(background);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});themeMedia.addEventListener('change',background);background();

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
  let heroLoad = null, loadedHero = null, requestedHero = null, heroVersion = 0, starterActors = [], starterLoad = null;
  function ensureActors() {
    const wanted=getHero?.()??heroId??config.hero;
    if(hero&&loadedHero===wanted){if(heroLoad&&requestedHero!==wanted){heroVersion++;requestedHero=wanted;heroLoad=null;}return Promise.resolve();}
    if(heroLoad&&requestedHero===wanted)return heroLoad;
    requestedHero=wanted;const request=++heroVersion;
    const job=Promise.allSettled([makeActor(wanted,1.4),!companion&&config.companion?makeActor(config.companion,.65):Promise.resolve(null)]).then(results=>{
      const failed=results.find(r=>r.status==='rejected');
      if(failed||destroyed||request!==heroVersion){for(const r of results)if(r.status==='fulfilled')r.value?.release();if(failed)throw failed.reason;return;}
      hero?.release();hero=results[0].value;if(results[1].value)companion=results[1].value;loadedHero=wanted;placeHero();
    }).finally(()=>{if(request===heroVersion)heroLoad=null;});
    heroLoad=job;return job;
  }
  function ensureStarters(){
    if(!starters.length||starterLoad)return starterLoad??Promise.resolve();
    starterLoad=Promise.allSettled(starters.map(async(s)=>({id:s.id,label:s.label,...await makeActor(s.id.toUpperCase(),1.1)}))).then(results=>{
      for(const r of results){if(r.status==='fulfilled'){if(destroyed)r.value.release();else starterActors.push(r.value);}else console.error('[games] starter model failed',r.reason);}
      placeStarters();
    });return starterLoad;
  }
  function placeStarters(anchor=visuals?.nodes.find(n=>n.lv.i===sel)?.pos){
    if(!anchor||!region)return;
    for(let i=0;i<starterActors.length;i++){
      const a=starterActors[i];a.root.visible=starterPicking&&regionIndex===world;
      const facing=region.cameraPosition.clone().sub(region.cameraTarget).setY(0).normalize(),right=new THREE.Vector3(facing.z,0,-facing.x),spacing=Math.max(1.8*region.unitScale,90*(camera.top-camera.bottom)/height);a.root.scale.setScalar(region.unitScale);a.root.position.copy(anchor).addScaledVector(facing,2*region.unitScale).addScaledVector(right,(i-1)*spacing);a.root.rotation.y=.45;
      const sign=visuals?.actions.find(sign=>sign.action.starter===a.id);
      if(sign){sign.root.visible=a.root.visible;sign.root.position.copy(anchor).addScaledVector(facing,2.9*region.unitScale).addScaledVector(right,(i-1)*spacing).add(new THREE.Vector3(0,-region.unitScale,0));}
    }
  }

  function pickerVisibility(){
    for(const a of visuals?.actions??[])a.root.visible=a.action.starter?starterPicking:!starterPicking&&(!a.action.play||state.open(sel));
    placeHero();placeStarters();
    host.querySelector('.gm-ow__hint').textContent=starterPicking?'Wähle deinen Fernling direkt in der Szene.':starters.length?'Fernling antippen: wählen · Ziel antippen: reisen':'Ziel antippen · am leuchtenden Tor starten · ziehen: umsehen';
  }
  async function openStarterPicker(){
    if(!starters.length||starterPicking)return;const version=++starterPickerVersion;
    if(!starterActors.length)loadingStatus.begin('Fernlinge werden vorbereitet …');
    await ensureStarters();if(destroyed||!active||version!==starterPickerVersion)return;
    starterPicking=true;invalidateWayfinding();wayfindingDirty=false;loadingStatus.finish();pickerVisibility();
    wayfindingReport={complete:true,phase:'starter-choice',world,selected:sel,width,height,posts:[],milliseconds:0,maxSliceMilliseconds:0};kick();
  }
  function closeStarterPicker(){
    starterPickerVersion++;starterPicking=false;pickerVisibility();invalidateWayfinding();kick();
  }

  function releaseVisuals(held=visuals) {
    if (!held) return;
    held.group.removeFromParent();held.depth?.release();held.context?.release();
    held.group.traverse(n=>{if(n.userData.owOwned){n.dispose?.();n.geometry?.dispose();n.material?.map?.dispose();n.material?.dispose();}});
    for (const n of held.nodes) { for (const map of Object.values(n.maps)) map.dispose(); n.label.material.dispose(); }
    for (const mesh of [held.pads, held.stars, held.ring, held.gates, held.posts]) { mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose?.(); }
    if(held===visuals)visuals = null;
  }
  function makeNodes(w, wd) {
    const unit = w.unitScale, group = new THREE.Group(), nodes = [];
    const pads = new THREE.InstancedMesh(new THREE.CylinderGeometry(.43*unit,.48*unit,.065*unit,24), new THREE.MeshStandardMaterial({color:0xffffff,roughness:.72}), wd.levels.length);
    pads.receiveShadow = true;
    const stars = new THREE.InstancedMesh(STAR_GEO.clone(), new THREE.MeshStandardMaterial({color:0xffffff,roughness:.4,metalness:.15}), wd.levels.length*3);
    const gates=new THREE.InstancedMesh(new THREE.TorusGeometry(.80*unit,.09*unit,8,28,Math.PI),new THREE.MeshStandardMaterial({color:0x77bca4,emissive:0x315d43,emissiveIntensity:.5,roughness:.6}),wd.levels.length);
    const posts=new THREE.InstancedMesh(new THREE.CylinderGeometry(.09*unit,.12*unit,.75*unit,7),new THREE.MeshStandardMaterial({color:0x77bca4,roughness:.8}),wd.levels.length*2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.65*unit,.045*unit,8,36),new THREE.MeshBasicMaterial({color:0xffdf83,transparent:true,opacity:.85}));
    ring.rotation.x = -Math.PI/2;
    const dummy = new THREE.Object3D();
    wd.levels.forEach((lv,k)=>{
      const p=w.nodePositions[k].clone();
      dummy.position.copy(p); dummy.position.y+=.04*unit; dummy.scale.setScalar(lv.boss?1.25:1);dummy.updateMatrix();pads.setMatrixAt(k,dummy.matrix);
      const maps = Object.fromEntries(Object.entries(BADGE).map(([key,col])=>[key,badge(lv.boss?'★':String(k+1),col)]));
      const label=new THREE.Sprite(new THREE.SpriteMaterial({map:maps.open,depthTest:false,transparent:true}));
      label.position.copy(p);label.position.y+=1.65*unit;label.renderOrder=2;group.add(label);
      dummy.position.copy(p);dummy.position.y+=.75*unit;dummy.rotation.set(0,Math.atan2(w.nodeTangents[k].x,w.nodeTangents[k].z),0);dummy.scale.setScalar(1);dummy.updateMatrix();gates.setMatrixAt(k,dummy.matrix);const yaw=dummy.rotation.y;for(let side=0;side<2;side++){dummy.position.copy(p).add(new THREE.Vector3(Math.cos(yaw)*(side?1:-1)*.8,.375,-Math.sin(yaw)*(side?1:-1)*.8).multiplyScalar(unit));dummy.updateMatrix();posts.setMatrixAt(k*2+side,dummy.matrix);}dummy.rotation.set(0,0,0);
      nodes.push({lv,pos:p,label,maps,index:k,distance:w.nodeDistances[k]});
    });
    const badgeLinks=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xd9cba0,transparent:true,opacity:.85}));badgeLinks.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(nodes.length*6),3));badgeLinks.geometry.setDrawRange(0,0);badgeLinks.frustumCulled=false;badgeLinks.userData.owOwned=true;group.add(pads,stars,ring,gates,posts,badgeLinks);scene.add(group);
    const fernhavenWorld=config.family==='rangers'&&world===0;if(fernhavenWorld)gradeRegion(w.root);const context=fernhavenWorld?fernhaven(w,()=>{wayfindingDirty=true;kick();}):landscape(w,world===4?'rangers':config.family,world);scene.add(context.group);applyIbl(context.group,env,.55);
    const actions=[];
    function sign(action,text,pos,color=0x8e6540) {
      const root=new THREE.Group();root.position.copy(pos);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.055*unit,.07*unit,1.1*unit,6),new THREE.MeshStandardMaterial({color:0x66533a}));pole.position.y=.55*unit;pole.userData.owOwned=true;root.add(pole);
      const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');const paint=value=>{ctx.clearRect(0,0,512,128);ctx.fillStyle='#'+new THREE.Color(color).getHexString();ctx.fillRect(0,0,512,128);ctx.strokeStyle='#d6bc7b';ctx.lineWidth=10;ctx.strokeRect(7,7,498,114);ctx.fillStyle='#fff6d8';ctx.font=`700 ${action.starter?88:72}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(value,256,65,480);};paint(text);
      const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;root.userData.setLabel=value=>{paint(value);texture.needsUpdate=true;};
      const face=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:true}));face.position.y=1.22*unit;face.scale.set(1.9*unit,.64*unit,1);face.userData.owOwned=true;root.add(face);group.add(root);actions.push({action,root,face,pos:face.position.clone().add(pos),routePosition:pos.clone()});return root;
    }
    const first=nodes[0].pos,last=nodes.at(-1).pos;
    if(world<worlds.at(-1).index){const trail=new THREE.InstancedMesh(new THREE.BoxGeometry(.48*unit,.05*unit,.65*unit),new THREE.MeshStandardMaterial({color:config.family==='bounce'?0xd3b681:0xa79d7a,roughness:.95}),9);trail.userData.owOwned=true;for(let i=0;i<9;i++){dummy.position.copy(last).add(new THREE.Vector3(1+i*.85,.02,-.5-i*.25).multiplyScalar(unit));dummy.rotation.set(0,.25,0);dummy.scale.setScalar(1);dummy.updateMatrix();trail.setMatrixAt(i,dummy.matrix);}group.add(trail);}
    const lookout=first.clone().add((config.family==='pip'?new THREE.Vector3(-.9,0,-1.8):new THREE.Vector3(-2.1,0,-1)).multiplyScalar(unit));
    let back=null;if(world>0){back=sign({region:world-1},'‹ '+NAMES[world-1],lookout.clone());back.children[0].scale.y=2;back.children[0].position.y=1.1*unit;back.children[1].position.y=2.15*unit;}
    if(world<worlds.at(-1).index)sign({region:world+1},NAMES[world+1]+' ›',last.clone().add(new THREE.Vector3(2.1,0,-.5).multiplyScalar(unit)));
    for(let i=0;i<starters.length;i++){const a=starters[i],facing=w.cameraPosition.clone().sub(w.cameraTarget).setY(0).normalize(),right=new THREE.Vector3(facing.z,0,-facing.x),tag=sign({starter:a.id},a.label,first.clone().addScaledVector(facing,2.9*unit).addScaledVector(right,(i-1)*1.8*unit).add(new THREE.Vector3(0,-unit,0)),0x596d50);tag.children[1].scale.set(1.7*unit,.5*unit,1);tag.children[1].material.depthTest=false;tag.children[1].renderOrder=3;tag.visible=false;}
    const overview=sign({overview:true},'⌖ Aussicht',lookout,0x52675d);overview.children[0].visible=world===0;
    const sound=sign({sound:true},(getSound?.()??true)?'Ton an':'Ton aus',lookout.clone(),0x53696a),soundHeight=world>0?3.1:2.2;sound.children[0].scale.y=soundHeight/1.1;sound.children[0].position.y=soundHeight*unit/2;sound.children[1].position.y=(soundHeight-.05)*unit;overview.children[0].visible=false;if(back)back.children[0].visible=false;sound.userData.soundEnabled=getSound?.()??true;
    const start=sign({play:true},'▶ START',first.clone().add(new THREE.Vector3(1.5,0,.2).multiplyScalar(unit)),0x42755e);start.children[0].scale.y=.4;start.children[0].position.y=.22*unit;start.children[1].position.y=.4*unit;
    const depth=opaqueDepthLayer([w.root,context.group]);
    return {group,pads,stars,ring,gates,posts,nodes,unit,context,actions,start,overview,sound,depth,badgeLinks};
  }
  function syncSound(enabled=getSound?.()??true){const text=enabled?'Ton an':'Ton aus';$('sound').textContent=text;$('sound').setAttribute('aria-pressed',String(enabled));for(const held of regionCache.values()){const target=held.visuals.sound;if(target.userData.soundEnabled!==enabled){target.userData.soundEnabled=enabled;target.userData.setLabel(text);}}}
  function toggleSound(){const enabled=onSound?.();syncSound(typeof enabled==='boolean'?enabled:(getSound?.()??true));}
  function paintNodes() {
    invalidateWayfinding();
    if (!visuals || regionIndex!==world) return;
    const dummy=new THREE.Object3D(),colour=new THREE.Color();let count=0;
    for(const n of visuals.nodes){
      const open=state.open(n.lv.i),score=state.stars(n.lv.i),look=!open?'locked':n.lv.i===sel?'here':score?'done':n.lv.boss?'boss':'open';
      visuals.pads.setColorAt(n.index,colour.set(!open?0x87908f:score?0x9cbb7a:n.lv.boss?0xbe735d:0xeadbb8));
      n.label.material.map=n.maps[look];visuals.gates.setColorAt(n.index,colour.set(!open?0x6d7470:n.lv.i===sel?0xffd077:score?0x8ed09b:0x7bc4bd));visuals.posts.setColorAt(n.index*2,colour);visuals.posts.setColorAt(n.index*2+1,colour);
      for(let k=0;k<score;k++){dummy.position.copy(n.pos);dummy.position.x+=(k-(score-1)/2)*.27*visuals.unit;dummy.position.y+=.48*visuals.unit;dummy.rotation.set(0,0,0);dummy.scale.setScalar(.10*visuals.unit);dummy.updateMatrix();visuals.stars.setMatrixAt(count,dummy.matrix);visuals.stars.setColorAt(count++,colour.set(0xffce55));}
    }
    visuals.posts.instanceColor.needsUpdate=true;visuals.gates.instanceColor.needsUpdate=true;visuals.pads.instanceColor.needsUpdate=true;visuals.stars.count=count;visuals.stars.instanceMatrix.needsUpdate=true;if(visuals.stars.instanceColor)visuals.stars.instanceColor.needsUpdate=true;
    const selected=visuals.nodes.find(n=>n.lv.i===sel);visuals.ring.visible=!!selected;
    if(selected){visuals.ring.position.copy(selected.pos);visuals.ring.position.y+=.09*visuals.unit;visuals.start.position.copy(selected.pos).add(new THREE.Vector3(1.65,.03,.25).multiplyScalar(visuals.unit));visuals.start.visible=state.open(sel);}
  }
  function syncDom() {
    const wd=worlds.find(w=>w.index===world);
    $('kicker').textContent=`${title} · ${world===4?'Bonus':`${world+1} / ${worlds.length}`}`;
    $('level-name').textContent=levels[sel]?.name??'';$('level-name').title=levels[sel]?.name??'';
    $('context').textContent=`${levels[sel]?.name??''} · ${world===4?'Die Sturmbastion':JOURNEYS[config.family][world]}`;
    const journeyKey=worlds.map(w=>`${w.index}:${state.worldOpen(w.index)}:${w.levels.reduce((n,l)=>n+state.stars(l.i),0)}`).join('|')+`/${world}`;
    if($('journey').dataset.key!==journeyKey){$('journey').dataset.key=journeyKey;$('journey').innerHTML=worlds.map(w=>`<button type="button" data-region="${w.index}" aria-current="${world===w.index?'step':'false'}" aria-label="${NAMES[w.index]}${state.worldOpen(w.index)?'':', gesperrt'}" style="--region:${SKY[w.index]}"><span class="gm-ow__regionmark">${state.worldOpen(w.index)?w.index+1:icon('lock',{size:13})}</span><span>${NAMES[w.index]}<small>${w.levels.reduce((n,l)=>n+state.stars(l.i),0)} / ${w.levels.length*3} ★</small></span></button>`).join('');}
    $('world').textContent=NAMES[world];$('world').title=regionIndex===world?(region.layout.title??NAMES[world]):NAMES[world];
    $('stars').textContent=`${levels.reduce((n,_,i)=>n+state.stars(i),0)} / ${levels.length*3}`;
    $('prev').disabled=world===worlds[0].index;$('next').disabled=world===worlds.at(-1).index;
    $('lock').hidden=state.worldOpen(world);$('lock').textContent=state.worldOpen(world)?'':state.need(world);
    const lv=levels[sel],card=$('card');card.hidden=!lv || (lv.world??0)!==world || !state.worldOpen(world);
    if(!card.hidden){const n=wd.levels.findIndex(l=>l.i===sel)+1,st=state.stars(sel),best=state.best(sel),open=state.open(sel);
      card.innerHTML=`<div class="gm-ow__cardhead"><span class="gm-ow__kicker">${lv.boss?'Boss':`Level ${world+1}-${n}`}</span><strong>${escapeText(lv.name)}</strong></div><div class="gm-ow__cardstars" aria-label="${st} von 3 Sternen">${[0,1,2].map(k=>`<span class="${k<st?'is-on':''}">${icon('star',{size:18})}</span>`).join('')}</div>${best?`<div class="gm-ow__best">Bestwert <span class="fw-num">${best.toLocaleString('de')}</span></div>`:''}<button type="button" class="fw-btn fw-btn--primary gm-ow__play" data-ow="play" ${open?'':'disabled'}>${icon(open?'play':'lock',{size:16})}${open?(st?'Noch einmal spielen':'Spielen'):'Gesperrt'}</button>`;
    }
    const listKey=wd.levels.map(l=>`${l.i}:${state.stars(l.i)}:${state.open(l.i)}`).join('|')+`/${sel}`;
    if($('list').dataset.key!==listKey){$('list').dataset.key=listKey;$('list').innerHTML=wd.levels.map(lv=>`<li><button type="button" data-ow-level="${lv.i}" aria-current="${sel===lv.i?'step':'false'}" ${state.open(lv.i)?'':'disabled'}>${escapeText(lv.name)}<span>${state.open(lv.i)?`${state.stars(lv.i)} / 3 ★`:'Gesperrt'}</span></button></li>`).join('');}
    syncSound();
  }
  function fit() {
    if(!region)return;
    span=fitWorldCamera(camera,region,aspect,1.08);
    offset.copy(region.cameraPosition).sub(region.cameraTarget);spherical.setFromVector3(offset);
  }
  function placeHero() {
    const n=visuals?.nodes.find(n=>n.lv.i===sel), visible=!!n&&!starterPicking&&regionIndex===world&&state.worldOpen(world);
    if(hero)hero.root.visible=visible;if(companion)companion.root.visible=visible;
    if(!visible)return;
    hero.root.scale.setScalar(region.unitScale);hero.root.position.copy(n.pos);hero.root.position.y+=.07*region.unitScale;
    const tangent=region.nodeTangents[n.index];hero.root.rotation.y=Math.atan2(tangent.x,tangent.z);
    if(companion){companion.root.scale.setScalar(region.unitScale);companion.root.position.copy(hero.root.position).addScaledVector(new THREE.Vector3(-tangent.z,0,tangent.x),.65*region.unitScale);companion.root.rotation.y=hero.root.rotation.y;}
  }
  function setWorld(value,{keepSel=false,force=false}={}) {
    const destination=Math.max(worlds[0].index,Math.min(worlds.at(-1).index,value));if(!state.worldOpen(destination)){$('lock').hidden=false;$('lock').textContent=state.need(destination);return Promise.resolve();}
    starterPicking=false;starterPickerVersion++;const previous=world;world=destination;entryDirection=world>=previous?1:-1;
    $('list').hidden=true;$('levels').setAttribute('aria-expanded','false');
    const wd=worlds.find(w=>w.index===world),current=state.current();
    if(!keepSel || (levels[sel]?.world??0)!==world)sel=wd.levels.some(l=>l.i===current)?current:wd.levels[0].i;
    hop=null;syncDom();
    if(!force&&regionIndex===world){++serial;pendingIndex=-1;pending=null;loadingStatus.finish();paintNodes();placeHero();kick();return Promise.resolve();}
    if(!force&&pendingIndex===world&&pending)return pending;
    invalidateWayfinding();const request=++serial,target=world;pendingIndex=target;versionMismatch=false;
    loadingStatus.begin(`Reise nach ${NAMES[target]} …`);host.classList.toggle('is-travelling',!!region);$('retry').hidden=true;
    if(hero)hero.root.visible=false;if(companion)companion.root.visible=false;for(const a of starterActors)a.root.visible=false;
    pending=(async()=>{
      let next, reuse=false;
      try{
        const cached=regionCache.get(target);reuse=!!cached;next=cached?.region??await library.region(target===4?'sturmbastion':config.family,REGIONS[target]);await ensureActors();if(target===0)await ensureStarters();
        if(request!==serial||destroyed){if(!cached)next.release();return;}
        const hadRegion=!!region;arrivalFrom.copy(region?look:next.cameraTarget);
        if(visuals){visuals.group.visible=false;visuals.context.group.visible=false;}
        region=next;regionIndex=target;
        if(!cached){
          if(!regionSpacing)regionSpacing=Math.max(region.bounds.getSize(new THREE.Vector3()).x,region.bounds.getSize(new THREE.Vector3()).z)*1.13;
          const shift=new THREE.Vector3(target*regionSpacing,0,(target%2)*regionSpacing*.08);
          region.root.position.add(shift);region.bounds.translate(shift);region.cameraPosition.add(shift);region.cameraTarget.add(shift);for(const v of [...region.nodePositions,...region.route])v.add(shift);
          scene.add(region.root);visuals=makeNodes(region,wd);
        }else{visuals=cached.visuals;visuals.group.visible=true;visuals.context.group.visible=true;}
        if(!hadRegion)arrivalFrom.copy(region.cameraTarget);
        regionCache.delete(target);regionCache.set(target,{region,visuals});
        while(regionCache.size>2){const [index,held]=regionCache.entries().next().value;regionCache.delete(index);releaseVisuals(held.visuals);held.region.release();}
        background();entryAt=performance.now();Object.assign(view,{yaw:0,pitch:0,zoom:1,panX:0,panZ:0,tYaw:0,tPitch:0,tZoom:1,tPanX:0,tPanZ:0});
        const box=region.bounds,size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
        const radius=Math.max(size.x,size.z)*.55;
        lights.light.position.copy(center).add(new THREE.Vector3(-radius*.8,radius*1.5,radius));lights.light.target.position.copy(center);lights.light.target.updateMatrixWorld();
        Object.assign(lights.light.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius,near:Math.max(.001,radius*.02),far:radius*6});lights.light.shadow.camera.updateProjectionMatrix();
        applyIbl(region.root,env,.55);fit();paintNodes();placeHero();placeStarters();pickerVisibility();focusNode(true);renderer.shadowMap.needsUpdate=true;
        loadingStatus.begin('Reisekarte wird vorbereitet …');host.classList.remove('is-travelling');syncDom();if(state.open(sel))onSelect?.(sel);kick();
      }catch(error){if(next&&!reuse&&region!==next)next.release();if(request!==serial||destroyed)return;console.error('[games] map load failed',error);versionMismatch=error.code==='ASSET_VERSION_MISMATCH';loadingStatus.fail(versionMismatch?'Das Spiel wurde aktualisiert. Lade die Seite neu.':'Diese Region konnte nicht geladen werden. Versuch es noch einmal.');$('retry').textContent=versionMismatch?'Seite neu laden':'Erneut versuchen';$('retry').hidden=false;}
      finally{if(request===serial){pendingIndex=-1;pending=null;}}
    })();return pending;
  }
  function moveTo(i) {
    if(starterPicking)closeStarterPicker();
    if(!levels[i])return;
    if((levels[i].world??0)!==world){sel=i;return setWorld(levels[i].world??0,{keepSel:true});}
    if(i===sel)return;
    const from=visuals?.nodes.find(n=>n.lv.i===sel),to=visuals?.nodes.find(n=>n.lv.i===i);sel=i;
    if(from&&to&&hero){let distance=from.distance;if(hop){const k=Math.min(1,(performance.now()-hop.start)/hop.duration);distance=THREE.MathUtils.lerp(hop.from,hop.to,k*k*(3-2*k));}hop={start:performance.now(),from:distance,to:to.distance,duration:Math.min(2200,500+Math.abs(to.distance-distance)/region.unitScale*70)};}
    else placeHero();paintNodes();syncDom();focusNode();if(state.open(sel)&&regionIndex===world)onSelect?.(sel);kick();
  }
  function invalidateWayfinding(){
    if(wayfindingTask){
      wayfindingTask.prep?.return();wayfindingTask.search?.return();
      if(wayfindingTask.cpuMilliseconds)canceledWayfinding.push({generation:wayfindingTask.generation,cpuMilliseconds:wayfindingTask.cpuMilliseconds,world:wayfindingTask.world,selected:wayfindingTask.selected});
      if(canceledWayfinding.length>12)canceledWayfinding.shift();
    }
    wayfindingTask=null;wayfindingGeneration++;wayfindingDirty=true;
    if(wayfindingReport)wayfindingReport={...wayfindingReport,complete:false,phase:'waiting'};
  }
  function advanceWayfinding(settled){
    if(!visuals||!region)return;
    if(!wayfindingTask){
      const startedAt=performance.now(),geometries=new Set();
      for(const root of[region.root,visuals.context.group,visuals.gates,visuals.posts])root.traverseVisible(mesh=>{if(mesh.isMesh&&!mesh.userData.owDepthOnly)geometries.add(mesh.geometry);});
      const preparation={buildMilliseconds:0,builds:0};
      wayfindingTask={generation:wayfindingGeneration,world,selected:sel,width,height,startedAt,preparation,prep:prepareOcclusionGeometries(geometries,preparation),search:null,cpuMilliseconds:performance.now()-startedAt,maxSliceMilliseconds:0,slices:[]};
      loadingStatus.begin('Reisekarte wird vorbereitet …');
      wayfindingReport={complete:false,phase:'index',world,selected:sel,width,height,startedAt};
    }
    const task=wayfindingTask;
    if(task.generation!==wayfindingGeneration||task.world!==world||task.selected!==sel||task.width!==width||task.height!==height){invalidateWayfinding();return;}
    const sliceStart=performance.now();let result=null;
    if(task.prep){const step=task.prep.next();if(step.done)task.prep=null;}
    if(!task.prep&&settled){
      if(!task.search){
        const selected=visuals.nodes.find(n=>n.lv.i===sel);if(!selected)return;
        placeStarters();scene.updateMatrixWorld(true);
        const canvasRect=canvas.getBoundingClientRect(),hudRects=[...host.querySelectorAll('.gm-ow__top,.gm-ow__context')].map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height),hintRect=host.querySelector('.gm-ow__hint').getBoundingClientRect();
        const topInset=Math.max(8,...hudRects.map(r=>r.bottom-canvasRect.top+8)),bottomInset=hintRect.width&&hintRect.height?Math.max(8,canvasRect.bottom-hintRect.top+8):8;
        task.search=createWayfindingPlan({actions:visuals.actions.filter(a=>a.root.visible),selected:selected.pos,camera:camera.clone(),width,height,unit:region.unitScale,topInset,bottomInset,occluders:[region.root,visuals.context.group],groundOccluders:[region.root],groundFloors:visuals.context.group.children.filter(n=>n.isMesh&&n.visible&&['CircleGeometry','PlaneGeometry'].includes(n.geometry.type)&&!n.material.transparent),groundPath:region.route,fineOccluders:[visuals.gates,visuals.posts],protectedLabels:visuals.nodes.map(n=>n.label),protectedActors:[hero?.root,companion?.root,...starterActors.filter(a=>a.root.visible).map(a=>a.root)].filter(Boolean)});
        wayfindingReport.phase='placement';$('loading-text').textContent='Reisekarte wird vorbereitet …';$('loading-detail').textContent='';
      }
      do{const step=task.search.next();if(step.done){result=step.value;break;}}while(performance.now()-sliceStart<5);
    }
    const elapsed=performance.now()-sliceStart;task.cpuMilliseconds+=elapsed;wayfindingReport.workCpuMilliseconds=task.cpuMilliseconds;task.maxSliceMilliseconds=Math.max(task.maxSliceMilliseconds,elapsed);wayfindingReport.maxSliceMilliseconds=task.maxSliceMilliseconds;
    if(elapsed>.05)task.slices.push({at:sliceStart,milliseconds:elapsed});
    if(result){
      const finishedAt=performance.now();wayfindingReport={...result,complete:true,phase:'ready',world,selected:sel,width,height,startedAt:task.startedAt,finishedAt,milliseconds:task.cpuMilliseconds,totalMilliseconds:task.cpuMilliseconds,durationMilliseconds:finishedAt-task.startedAt,maxSliceMilliseconds:task.maxSliceMilliseconds,slices:task.slices,preparation:task.preparation,canceled:canceledWayfinding.slice()};
      wayfindingTask=null;wayfindingDirty=false;loadingStatus.finish();renderer.shadowMap.needsUpdate=true;
    }
  }
  function focusNode(immediate=false){$('lock').hidden=true;travelView=true;invalidateWayfinding();const n=visuals?.nodes.find(n=>n.lv.i===sel);if(!n||!region)return;const target=n.pos.clone();if(aspect<.9){const next=visuals.nodes[n.index+1];if(config.family==='pip'&&next)target.lerp(next.pos,.35);}view.tPanX=(target.x-region.cameraTarget.x)/region.unitScale;view.tPanZ=(target.z-region.cameraTarget.z)/region.unitScale;view.tZoom=Math.min(.62,Math.max(5.5,Math.min(aspect<.9?(config.family==='pip'?12:16):11,height/42))*region.unitScale/span);if(immediate){view.panX=view.tPanX;view.panZ=view.tPanZ;view.zoom=view.tZoom;arrivalFrom.copy(n.pos);}}
  function overviewTarget(){
    if(!region||!visuals)return{zoom:1,panX:0,panZ:0};
    const base=camera.clone(),s=spherical.clone();s.phi=THREE.MathUtils.clamp(s.phi,.22,1.36);base.position.copy(region.cameraTarget).add(new THREE.Vector3().setFromSpherical(s));base.lookAt(region.cameraTarget);base.updateMatrixWorld(true);
    return fitRouteOverview({camera:base,points:visuals.nodes.map(n=>n.pos),target:region.cameraTarget,width,height,unit:region.unitScale,span});
  }
  function resetView(){if(wayfindingTask)invalidateWayfinding();$('lock').hidden=true;travelView=false;const target=overviewTarget();Object.assign(view,{tYaw:0,tPitch:0,tZoom:target.zoom,tPanX:target.panX,tPanZ:target.panZ});}
  function resize(){invalidateWayfinding();const r=canvas.getBoundingClientRect();width=Math.max(1,r.width);height=Math.max(1,r.height);aspect=width/height;renderer.setPixelRatio(LOW_GPU?.6:Math.min(1.5,devicePixelRatio||1));renderer.setSize(width,height,false);fit();if(travelView)focusNode();else if(region){const target=overviewTarget();Object.assign(view,{tZoom:target.zoom,tPanX:target.panX,tPanZ:target.panZ});}kick();}
  function kick(){if(active&&!raf&&!destroyed){last=0;raf=requestAnimationFrame(frame);}}
  function placeBadges(){
    if(!visuals)return;
    const scale=height/(camera.top-camera.bottom),size=Math.max(.55*region.unitScale,24/scale);
    for(const n of visuals.nodes){n.label.position.copy(n.pos);n.label.position.y+=1.65*region.unitScale;n.label.scale.setScalar(size);}
    visuals.badgeLinks.visible=false;
    if(travelView)return;
    const projected=visuals.nodes.map(n=>{const p=n.label.position.clone().project(camera);return{x:(p.x*.5+.5)*width,y:(-p.y*.5+.5)*height};}),separated=separateBadgeCenters(projected,size*scale),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion),vertices=visuals.badgeLinks.geometry.attributes.position;
    let count=0;
    for(let i=0;i<visuals.nodes.length;i++){
      const lift=(projected[i].y-separated[i].y)/(scale*up.y);if(lift<.001)continue;
      const n=visuals.nodes[i],start=n.pos.clone();start.y+=1.5*region.unitScale;n.label.position.y+=lift;
      vertices.setXYZ(count++,start.x,start.y,start.z);vertices.setXYZ(count++,n.label.position.x,n.label.position.y,n.label.position.z);
    }
    vertices.needsUpdate=true;visuals.badgeLinks.geometry.setDrawRange(0,count);visuals.badgeLinks.visible=count>0;
  }
  function frame(t){
    raf=0;if(!active||destroyed)return;const dt=Math.min(.05,(t-(last||t))/1000);last=t;const time=t/1000,reduced=motionPreference.matches;
    if(region){
      for(const key of ['yaw','pitch','zoom','panX','panZ'])view[key]+=(view['t'+key[0].toUpperCase()+key.slice(1)]-view[key])*(1-Math.exp(-dt*8));
      look.copy(region.cameraTarget);look.x+=view.panX*region.unitScale;look.z+=view.panZ*region.unitScale;const arrival=reduced?0:Math.max(0,1-(t-entryAt)/850);if(arrival>0)look.lerp(arrivalFrom,arrival*arrival*(3-2*arrival));look.y=travelView?(hero?.root.position.y??region.cameraTarget.y)+(aspect<.9?1.5:.7)*region.unitScale:region.cameraTarget.y;
      if(hop&&hero){look.x=hero.root.position.x;look.z=hero.root.position.z;}
      const phi=THREE.MathUtils.clamp(spherical.phi-view.pitch,.22,1.36),theta=spherical.theta+view.yaw;
      offset.setFromSphericalCoords(spherical.radius,phi,theta);camera.position.copy(look).add(offset);camera.lookAt(look);
      const h=span*.5*view.zoom;camera.left=-h*aspect;camera.right=h*aspect;camera.bottom=-h;camera.top=h;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);placeBadges();
      if(wayfindingDirty&&!starterPicking&&travelView&&regionIndex===world){
        const settled=!hop&&t-entryAt>850&&Math.abs(view.zoom-view.tZoom)<.0002&&Math.abs(view.panX-view.tPanX)+Math.abs(view.panZ-view.tPanZ)<.002&&Math.abs(view.yaw-view.tYaw)+Math.abs(view.pitch-view.tPitch)<.002;
        advanceWayfinding(settled);
      }
      if(!travelView&&regionIndex===world&&(wayfindingReport?.phase!=='overview'||wayfindingReport.width!==width||wayfindingReport.height!==height)){
        if(wayfindingTask)invalidateWayfinding();wayfindingDirty=false;wayfindingReport={complete:true,phase:'overview',world,selected:sel,width,height};loadingStatus.finish();
      }
      for(const held of regionCache.values())held.region.update(time,reduced);
      if(hop&&hero){const k=Math.min(1,(t-hop.start)/hop.duration),e=k*k*(3-2*k),d=THREE.MathUtils.lerp(hop.from,hop.to,e);region.pointAtDistance(d,hero.root.position);hero.root.position.y+=(.07+(reduced?0:Math.abs(Math.sin(k*Math.PI*6))*.06))*region.unitScale;region.pointAtDistance(d+Math.sign(hop.to-hop.from)*.04*region.unitScale,ahead);hero.root.rotation.y=Math.atan2(ahead.x-hero.root.position.x,ahead.z-hero.root.position.z);if(companion){companion.root.position.copy(hero.root.position);companion.root.position.x-=.6*region.unitScale;companion.root.rotation.y=hero.root.rotation.y;}renderer.shadowMap.needsUpdate=true;if(k===1){hop=null;placeHero();}}
      if(hop&&hero)placeStarters(hero.root.position);else if(starterPicking){placeStarters();const scale=height/(camera.top-camera.bottom);for(const a of visuals.actions.filter(a=>a.action.starter))a.face.scale.set(85/scale,25/scale,1);wayfindingReport={...wayfindingReport,complete:true,phase:'starter-choice',world,selected:sel,width,height};}
      for(const a of starterActors)if(a.root.visible)a.animate(reduced?0:dt,!!hop,time);
      hero?.animate(reduced?0:dt,!!hop,time);companion?.animate(reduced?0:dt,!!hop,time);
      if(visuals){signOffset.copy(offset).setY(0).normalize().multiplyScalar(.14*region.unitScale);for(const a of visuals.actions){a.face.position.x=signOffset.x;a.face.position.z=signOffset.z;}visuals.ring.material.opacity=reduced?.8:.72+Math.sin(time*3)*.15;}
      renderer.render(scene,camera);
    }else renderer.render(scene,camera);
    raf=requestAnimationFrame(frame);
  }
  function pick(e){
    if(!visuals||regionIndex!==world)return -1;const rect=canvas.getBoundingClientRect();ndc.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(ndc,camera);
    for(const a of starterActors){if(a.root.visible&&ray.intersectObject(a.root,true).length)return {starter:a.id};}
    if(starters.length&&hero?.root.visible&&ray.intersectObject(hero.root,true).length)return{starterMenu:true};
    // Sprite raycasts hit the whole square, including its transparent corners.
    // Respect the painted badge so a nearer empty corner cannot steal a tap
    // from the visible neighbouring level (especially in the full overview).
    const badgeHit=ray.intersectObjects(visuals.nodes.map(n=>n.label),false).find(hit=>{
      const image=hit.object.material.map.image,uv=hit.uv;
      if(!uv)return false;
      const x=Math.max(0,Math.min(image.width-1,Math.floor(uv.x*image.width))),y=Math.max(0,Math.min(image.height-1,Math.floor((1-uv.y)*image.height)));
      return image.getContext('2d').getImageData(x,y,1,1).data[3]>=128;
    });if(badgeHit)return visuals.nodes.find(n=>n.label===badgeHit.object).lv.i;
    const actions=visuals.actions.filter(a=>a.root.visible),faceHit=ray.intersectObjects(actions.map(a=>a.face),false)[0];if(faceHit){const action=actions.find(a=>a.face===faceHit.object).action;if(!wayfindingTask||action.starter||action.overview)return action;}
    const hit=ray.intersectObjects([visuals.pads,visuals.gates,visuals.posts],false)[0];if(hit)return visuals.nodes[hit.object===visuals.posts?Math.floor(hit.instanceId/2):hit.instanceId].lv.i;
    let nearAction=null,nearDistance=24;for(const a of actions){const p=a.face.getWorldPosition(new THREE.Vector3()).project(camera),distance=Math.hypot((p.x*.5+.5)*rect.width-(e.clientX-rect.left),(-p.y*.5+.5)*rect.height-(e.clientY-rect.top));if(distance<nearDistance){nearDistance=distance;nearAction=a.action;}}if(nearAction&&(!wayfindingTask||nearAction.overview))return nearAction;
    let best=-1,distance=24;
    for(const n of visuals.nodes){const p=n.label.position.clone().project(camera),d=Math.hypot((p.x*.5+.5)*rect.width-(e.clientX-rect.left),(-p.y*.5+.5)*rect.height-(e.clientY-rect.top));if(d<distance){distance=d;best=n.lv.i;}}
    return best;
  }
  const pinch=()=>{const[a,b]=[...pointers.values()];return{d:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2}};
  const panBy=(dx,dy)=>{const k=span/(region?.unitScale??1)/height*view.zoom;view.tPanX=THREE.MathUtils.clamp(view.tPanX-dx*k,-12,12);view.tPanZ=THREE.MathUtils.clamp(view.tPanZ-dy*k,-12,12);};
  canvas.addEventListener('pointerdown',e=>{try{canvas.setPointerCapture(e.pointerId);}catch{/* synthetic or already released pointer */}pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});drag={x:e.clientX,y:e.clientY,lx:e.clientX,ly:e.clientY,moved:pointers.size>1?99:0,pan:e.button===2||e.shiftKey,pinch:pointers.size===2?pinch():null};});
  canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!drag)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){if(wayfindingTask)invalidateWayfinding();const p=pinch();if(drag.pinch){view.tZoom=THREE.MathUtils.clamp(view.tZoom*drag.pinch.d/Math.max(1,p.d),.14,1.7);panBy(p.x-drag.pinch.x,p.y-drag.pinch.y);}drag.pinch=p;return;}const dx=e.clientX-drag.lx,dy=e.clientY-drag.ly;drag.lx=e.clientX;drag.ly=e.clientY;drag.moved=Math.max(drag.moved,Math.hypot(e.clientX-drag.x,e.clientY-drag.y));if(drag.moved<6)return;if(wayfindingTask)invalidateWayfinding();if(drag.pan)panBy(dx,dy);else{view.tYaw-=dx*.006;view.tPitch=THREE.MathUtils.clamp(view.tPitch+dy*.004,-.4,.6);}});
  canvas.addEventListener('pointerup',e=>{pointers.delete(e.pointerId);if(!drag)return;const moved=drag.moved;if(pointers.size){const remaining=pointers.values().next().value;drag.pinch=null;drag.x=drag.lx=remaining.x;drag.y=drag.ly=remaining.y;drag.moved=99;return;}drag=null;if(moved<8&&state.worldOpen(world)){const i=pick(e);if(i&&typeof i==='object'){if(i.starterMenu){openStarterPicker();}else if(i.starter){closeStarterPicker();onStarter?.(i.starter);}else if(i.sound){toggleSound();}else if(i.overview){if(travelView)resetView();else focusNode();}else if(i.play&&state.open(sel)&&!hop)onPlay(sel);else if(i.region!==undefined){if(state.worldOpen(i.region))setWorld(i.region);else{$('lock').textContent=state.need(i.region);$('lock').hidden=false;}}return;}if(i>=0&&state.open(i)){if(i===sel&&!hop){if(travelView)onPlay(i);else focusNode();}else moveTo(i);}else if(i>=0){sel=i;paintNodes();syncDom();}}});
  canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);drag=null;});canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{if(wayfindingTask)invalidateWayfinding();e.preventDefault();view.tZoom=THREE.MathUtils.clamp(view.tZoom*Math.exp(e.deltaY*.0012),.14,1.7);},{passive:false});
  canvas.addEventListener('dblclick',resetView);canvas.style.touchAction='none';
  host.addEventListener('click',e=>{const b=e.target.closest('[data-ow],[data-ow-level],[data-region]');if(!b)return;if(b.dataset.region!==undefined){setWorld(Number(b.dataset.region));return;}if(b.dataset.owLevel!==undefined){moveTo(Number(b.dataset.owLevel));$('list').hidden=true;$('levels').setAttribute('aria-expanded','false');return;}const action=b.dataset.ow;if(action==='levels'){$('list').hidden=!$('list').hidden;b.setAttribute('aria-expanded',String(!$('list').hidden));}else if(action==='sound')toggleSound();else if(action==='reset')resetView();else if(action==='prev')setWorld(world-1);else if(action==='next')setWorld(world+1);else if(action==='retry'){if(versionMismatch)location.reload();else setWorld(world,{keepSel:true,force:true});}else if(action==='play'&&state.open(sel))onPlay(sel);});
  function key(e){if(!active||e.target.closest?.('input,textarea,select'))return false;if(starterPicking&&e.key==='Escape'){closeStarterPicker();return true;}if(e.key==='Escape'&&!$('list').hidden){$('list').hidden=true;$('levels').setAttribute('aria-expanded','false');$('levels').focus();return true;}if(e.key==='Home'){resetView();return true;}const open=worlds.find(w=>w.index===world).levels.filter(l=>state.open(l.i)),k=open.findIndex(l=>l.i===sel);if(e.key==='PageDown'||(e.key==='ArrowRight'&&e.shiftKey))setWorld(world+1);else if(e.key==='PageUp'||(e.key==='ArrowLeft'&&e.shiftKey))setWorld(world-1);else if(e.key==='ArrowRight'&&k>=0&&k<open.length-1)moveTo(open[k+1].i);else if(e.key==='ArrowLeft'&&k>0)moveTo(open[k-1].i);else if((e.key==='Enter'||e.key===' ')&&state.open(sel)&&!e.target.closest?.('button'))onPlay(sel);else return false;return true;}
  const observer=new ResizeObserver(()=>{if(active)resize();});observer.observe(canvas);
  return {
    syncSound,
    activate(){window.__owView=debugView;if(active)return;active=true;resize();if(!initialized){initialized=true;lastCurrent=state.current();sel=lastCurrent;setWorld(levels[sel]?.world??0,{keepSel:true});}else{syncDom();kick();}},
    deactivate(){if(starterPicking)closeStarterPicker();if(wayfindingTask)invalidateWayfinding();active=false;if(raf)cancelAnimationFrame(raf);raf=0;},
    refresh(){const current=state.current();if(!initialized||current!==lastCurrent){lastCurrent=current;sel=current;setWorld(levels[sel]?.world??0,{keepSel:true});}else{paintNodes();syncDom();placeHero();kick();}},key,
    async refreshHero(){try{await ensureActors();placeHero();placeStarters();invalidateWayfinding();kick();}catch(error){console.error('[games] companion change failed',error);versionMismatch=error.code==='ASSET_VERSION_MISMATCH';loadingStatus.fail(versionMismatch?'Das Spiel wurde aktualisiert. Lade die Seite neu.':'Dein Fernling konnte nicht geladen werden. Versuch es erneut.');$('retry').textContent=versionMismatch?'Seite neu laden':'Erneut versuchen';$('loading').hidden=false;$('retry').hidden=false;}},
    get selected(){return sel;},get world(){return world;},get loaded(){return regionIndex===world&&!pending;},get ready(){return pending??Promise.resolve();},
    destroy(){wayfindingTask?.prep?.return();wayfindingTask?.search?.return();loadingStatus.finish();destroyed=true;serial++;active=false;cancelAnimationFrame(raf);observer.disconnect();themeObserver.disconnect();themeMedia.removeEventListener('change',background);skyTexture?.dispose();for(const held of regionCache.values()){releaseVisuals(held.visuals);held.region.release();}regionCache.clear();heroVersion++;hero?.release();companion?.release();for(const a of starterActors)a.release();library.dispose();actors.dispose();env.dispose();renderer.dispose();}
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
