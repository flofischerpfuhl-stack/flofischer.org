/** Fernhaven canteen: authored cabinets and furniture, lazy character atelier. */
import { THREE, createRenderer, addLights, studioEnvironment, applyIbl, LOW_GPU } from './three-kit.js';
import { Baker, Batch, mtx } from './world/decor.js';
import { ChannelLibrary } from '../../games-assets/fernworld/runtime/channel-library.js';
import { profile, game as gameProfile, starsTotal, exportCode, importCode, onChange, upgradeLevel } from './profile.js';
import { UPGRADES, purchaseUpgrade, jobs, acceptJob, claimJob, TOURNAMENT_RINGS, selectTournamentRing } from './hub-progress.js';

const ASSETS = new URL('../../games-assets/', import.meta.url);
export const GAMES = [
 {id:'fern-rangers',title:'Fern Rangers',color:'#567553',accent:'#edc76b',cover:'cover-fern-rangers',tagline:'Gemeinsam halten wir Fernhaven frei.',blurb:'Führe Captain Hazel und ihre Legion durch vier Regionen. Vergrößere deinen Trupp, befreie Gefangene und halte Orvans Maschinen auf. Nach dem Finale wartet die Sturmbastion.',levels:44},
 {id:'pips-tower',title:'Pip’s Tower',color:'#be682b',accent:'#ffd48b',cover:'cover-pips-tower',tagline:'Ein Zug verändert alles.',blurb:'Pip und Biscuit erkunden versiegelte Fossilgewölbe. Löse die Mechanismen, lenke Wasser und Lava und bring die Fundstücke sicher ins Museum.',levels:44},
 {id:'momo',title:'Hexennacht',color:'#37745e',accent:'#b6e6c1',cover:'cover-momo',tagline:'Eine Keeperin. Dein Fernling. Eine lange Nacht.',blurb:'Wähle Glimmo, Mossel oder Plashling und stelle dich mit Momo dem Hexbann. Entwickle deinen Fernling, verbinde seine Fähigkeiten und befreie die Bewohner der Abteihöfe.',levels:44},
 {id:'tanks',title:'Bounce Brigade',color:'#487a9d',accent:'#f1c166',cover:'cover-tanks',tagline:'Der beste Weg ist selten gerade.',blurb:'Hazel tritt mit ihrem Spielzeugpanzer beim großen Turnier an. Nutze Banden, weiche Gummigeschossen aus und fordere die rivalisierenden Clubs heraus.',levels:44},
];
const FORMS = [
 ['PIP_KESSEL','Pip','Spitzhacke · Fossilien bergen'],['PIP_FIRE_THROW','Glut','Feuerwurf · Handschuh und Glutwerkzeug'],
 ['PIP_BUBBLE_FLOAT','Blase','Schweben · Blasenwerkzeug'],['PIP_VINE_HOOK','Ranke','Rankenhaken · Greifen und Schwingen'],
 ['PIP_STONE_STOMPER','Stein','Steinstampfer · Schwere Ausrüstung'],['PIP_GALE_GLIDER','Wind','Gleitumhang · In der Luft gleiten'],
 ['PIP_SPARK_LEAP','Funke','Funkenhandschuhe · Zusätzlicher Sprung'],['PIP_FROST_BRIDGE','Frost','Frostwerkzeug · Eine Brücke formen'],
];
const escaped = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const canvasTexture = (w,h,draw) => { const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t; };
const loadArt = name => new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`Cover ${name} failed to load`));image.src=new URL(`covers/${name}.webp`,ASSETS).href;});

export function mountHub(host,{onPlay}) {
 host.classList.add('gm-hub','fw-canteen');
 host.innerHTML=`<div class="gm-hub__stage"><canvas class="gm-hub__canvas" aria-hidden="true"></canvas><header class="fw-canteen__heading"><span>FERNWORLD</span><h1>Fernhaven</h1><p>Die Kantine der Fern Rangers</p></header><nav class="fw-canteen__services" aria-label="Kantine"><button data-hub="workshop">Owlberts Werkstatt</button><button data-hub="jobs">Tortellinis Aufträge</button><button data-hub="atelier">Pips Ausrüstung</button><button data-hub="save">Spielstand</button></nav><div class="fw-canteen__loading" role="status">Die Kantine öffnet…</div><section class="fw-canteen__game" aria-live="polite"></section><dialog class="fw-canteen__dialog"><button class="fw-canteen__close" aria-label="Schließen">×</button><div class="fw-canteen__dialogbody"></div></dialog></div>`;
 const canvas=host.querySelector('canvas'),panel=host.querySelector('.fw-canteen__game'),dialog=host.querySelector('dialog'),body=dialog.querySelector('.fw-canteen__dialogbody'),loading=host.querySelector('.fw-canteen__loading');
 const renderer=createRenderer(canvas),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.05,100),env=studioEnvironment(renderer),library=new ChannelLibrary();
 scene.background=new THREE.Color('#d5dfd6');
 const stage=new THREE.Scene();stage.background=scene.background.clone();addLights(stage,{dir:[-4,8,7],shadowBox:8,mapSize:2048,intensity:2.3,ambient:1.05});
 addLights(scene,{dir:[-4,8,7],shadowBox:8,mapSize:1024,intensity:2.3,ambient:1.05});
 const baker=new Baker();scene.add(baker.quad);const stageMeshes=[];const cabinets=[],actors=[],ownedMaterials=new Set(),ownedTextures=new Set();
 let active=false,raf=0,last=0,focus=0,ready=false,dirty=true,disposed=false,service='',formActor=null,formLibrary=null,formRequest=0,formIndex=0,formYaw=0,drag=null;
 const heroRoot=new THREE.Group();heroRoot.position.set(0,.1,1.6);scene.add(heroRoot);
 const target=new THREE.Vector3(0,1.0,-.3),wanted=new THREE.Vector3(0,1.0,-.3);
 window.__hubView={renderer,scene,camera,get ready(){return ready},get cabinetCount(){return cabinets.length},get form(){return formActor?.id},get sourceScene(){return stage}};

 function renderPanel(){const g=GAMES[focus],p=gameProfile(g.id);panel.innerHTML=`<div class="fw-canteen__gamehead"><button data-hub="prev" aria-label="Vorheriges Spiel">‹</button><div><p>FERNHAVEN · ${profile().coins.toLocaleString('de')} GROSCHEN</p><h2>${g.title}</h2></div><button data-hub="next" aria-label="Nächstes Spiel">›</button></div><p>${g.tagline}</p><p class="fw-canteen__blurb">${g.blurb}</p><div class="fw-canteen__progress">★ ${starsTotal(g.id)} / 132 · ${Object.values(p.stars).filter(x=>x>0).length} / 44 Level</div><button class="fw-canteen__play" data-hub="play">${p.plays?'Weiterspielen':'Spielen'}</button>`;}
 function serviceBody(){
  const p=profile();
  if(service==='workshop')body.innerHTML=`<h2>Owlberts Werkstatt</h2><p>${p.coins} Groschen</p>${UPGRADES.map(x=>{const n=upgradeLevel(x.key),cost=x.cost*(n+1);return `<article><h3>${x.title} <small>${n}/${x.max}</small></h3><p>${x.description}</p><button data-buy="${x.key}" ${n>=x.max||p.coins<cost?'disabled':''}>${n>=x.max?'Vollständig ausgebaut':`${cost} Groschen`}</button></article>`}).join('')}`;
  if(service==='workshop')body.insertAdjacentHTML('beforeend',`<article><h3>Dein Turnierzeichen</h3><p>Die Farbe deines eigenen Markierungsrings in Bounce Brigade. Die Spielregeln bleiben gleich.</p><div class="fw-canteen__forms">${TOURNAMENT_RINGS.map(r=>{const own=r.id==='fern'||p.cosmetics.owned.includes(`tournament-ring:${r.id}`),chosen=(p.cosmetics.equipped['tournament-ring']||'fern')===r.id;return `<button data-ring="${r.id}" aria-pressed="${chosen}" ${!own&&p.coins<r.cost?'disabled':''}><span style="color:${r.color}">●</span> ${r.title}${chosen?' · Aktiv':own?'':` · ${r.cost}`}</button>`;}).join('')}</div></article>`);
  if(service==='jobs')body.innerHTML=`<h2>Tortellinis Aufträge</h2><p>Neue Aufträge jeden Tag. Dein Fortschritt zählt ab der Annahme.</p>${jobs().map(j=>`<article><h3>${j.title}</h3><p>${j.description}</p><p>${j.active?`${j.progress} / ${j.target} · `:''}${j.reward} Groschen</p><button data-job="${j.id}" ${j.claimed||j.active&&j.progress<j.target?'disabled':''}>${j.claimed?'Abgeholt':j.active?'Belohnung abholen':'Annehmen'}</button></article>`).join('')}`;
  if(service==='save')body.innerHTML=`<h2>Dein Spielstand</h2><p>Dein Fortschritt wird in diesem Browser gespeichert. Mit einem Code kannst du ihn auf ein anderes Gerät mitnehmen.</p><textarea aria-label="Spielstandcode" rows="4" spellcheck="false"></textarea><div><button data-hub="export">Code anzeigen / kopieren</button><button data-hub="import">Code laden</button></div><p role="status" data-save-status></p><p><a href="${new URL('fernworld/credits.html',ASSETS).href}" target="_blank" rel="noopener">Asset-Credits und Lizenzen</a></p>`;
  if(service==='atelier')body.innerHTML=`<h2>Pips Ausrüstung</h2><p>Jedes Powerup hat sein eigenes Werkzeug. Wähle eine Form und ziehe das Modell zum Drehen.</p><div class="fw-canteen__forms">${FORMS.map((f,i)=>`<button data-form="${i}" aria-pressed="${i===formIndex}">${f[1]}</button>`).join('')}</div><p data-form-status>${FORMS[formIndex][2]}</p>`;
 }
 function closeService(){service='';dialog.close();panel.hidden=false;++formRequest;releaseForm();resize();}
 function openService(kind){if(dialog.open)dialog.close();service=kind;serviceBody();dialog.classList.toggle('is-atelier',kind==='atelier');if(kind==='atelier')dialog.show();else dialog.showModal();panel.hidden=kind==='atelier';if(kind==='atelier')loadForm(formIndex);else{++formRequest;releaseForm();}resize();}
 function releaseForm(){if(formActor){formActor.mixer.stopAllAction();formActor.mixer.uncacheRoot(formActor.scene);formActor.release();formActor=null;}formLibrary?.dispose();formLibrary=null;}
 async function loadForm(index){
  formIndex=index;serviceBody();const serial=++formRequest;releaseForm();const own=new ChannelLibrary();formLibrary=own;
  try {const {definition}=await own.definition(FORMS[index][0]);const actor=await own.create(FORMS[index][0],definition.lods?.lo?'lo':undefined);
   if(serial!==formRequest||disposed){actor.release();own.dispose();return;}
   const mixer=new THREE.AnimationMixer(actor.scene),idle=actor.animations.find(x=>/^(Idle|Ground_Idle)$/i.test(x.name));if(idle)mixer.clipAction(idle).play();mixer.update(.2);
   const box=new THREE.Box3().setFromObject(actor.scene),height=box.max.y-box.min.y;actor.scene.scale.multiplyScalar(2.65/height);actor.scene.position.y=-box.min.y*2.65/height;actor.scene.rotation.y=formYaw;heroRoot.add(actor.scene);applyIbl(actor.scene,env,.7);formActor={...actor,mixer};
   body.querySelector('[data-form-status]').textContent=FORMS[index][2];
  }catch(error){if(serial!==formRequest||disposed)return;console.error('[canteen atelier]',error);body.querySelector('[data-form-status]').textContent='Diese Form konnte nicht geladen werden. Wähle sie erneut.';}
 }
 async function npc(id,pos,height,angle=0){const actor=await library.create(id,'lo');if(disposed){actor.release();return;}const wrapper=new THREE.Group(),mixer=new THREE.AnimationMixer(actor.scene),idle=actor.animations.find(x=>/idle/i.test(x.name))??actor.animations[0];if(idle)mixer.clipAction(idle).play();mixer.update(.3);const b=new THREE.Box3().setFromObject(actor.scene),s=height/(b.max.y-b.min.y);actor.scene.scale.setScalar(s);actor.scene.position.y=-b.min.y*s;wrapper.add(actor.scene);wrapper.position.set(...pos);wrapper.rotation.y=angle;scene.add(wrapper);applyIbl(actor.scene,env,.7);actors.push({...actor,wrapper,mixer});}
 async function prepare(){
  const ids=['fw_floor_timber','fw_wall_timber_straight','fw_table_oak','fw_chair_oak','fw_keg_oak','fw_barrel_oak','fw_shelves_oak','fw_books_stack','fw_plate_supper','fw_bottle_corked','fw_window_round','fw_planter_terracotta','meadow_fern_arching','meadow_bellflower'];
  const models=Object.fromEntries(await Promise.all(ids.map(async id=>[id,await library.model(id,'lo')]))),batches=new Map();
  const put=(id,pos,rot=0,scale=1)=>{for(const g of models[id]){if(!batches.has(g.mat))batches.set(g.mat,new Batch());batches.get(g.mat).add(g.geometry,mtx(pos,[0,rot,0],scale));}};
  for(let x=-2;x<=2;x++)for(let z=-1;z<=1;z++)put('fw_floor_timber',[x*2.6,0,z*2.6]);
  for(let x=-2;x<=2;x++)put(Math.abs(x)===2?'fw_window_round':'fw_wall_timber_straight',[x*2.6,.1,-3.8]);
  for(const x of [-4.8,4.8]){put('fw_table_oak',[x,.1,.3]);put('fw_chair_oak',[x,.1,1.2],Math.PI);put('fw_plate_supper',[x,.85,.25],0,.8);put('fw_bottle_corked',[x+.25,.85,.25]);put('fw_planter_terracotta',[x,.1,-3.1]);put('meadow_fern_arching',[x,.54,-3.1],x,.65);put('meadow_bellflower',[x+.1,.53,-3.1],0,.3);}
  put('fw_keg_oak',[-5.7,.1,-2]);put('fw_barrel_oak',[5.7,.1,-2]);put('fw_shelves_oak',[0,.75,-3.5]);put('fw_books_stack',[0,2.19,-3.45]);
  for(const [mat,b]of batches){const mesh=b.mesh({glow:mat==='glow',roughness:mat==='gloss'?.3:.8,shadow:true});stage.add(mesh);stageMeshes.push(mesh);}
  const surface=await library.json('interactives/fossil-equipment.SURFACE_CONTRACT.json');
  for(let i=0;i<GAMES.length;i++){
   const g=GAMES[i],cab=await library.create('ARCADE_CABINET','lo');cab.scene.position.set((i-1.5)*1.32,.1,-1.7);cab.scene.userData.canteenGame=g.id;stage.add(cab.scene);cabinets.push(cab);
   const art=await loadArt(g.cover);cab.scene.traverse(n=>{if(!n.isMesh||!n.material.map)return;const material=n.material.clone(),original=material.map,atlas=document.createElement('canvas');atlas.width=atlas.height=1024;const ctx=atlas.getContext('2d');ctx.drawImage(original.image,0,0,1024,1024);
    for(const key of ['ScreenSurface','CoverSurface']){const s=surface.surfaces[`ARCADE_CABINET.${key}`],[x0,y0,x1,y1]=s.pixelRectFromTopLeft,board=document.createElement('canvas');board.width=Math.round(s.physicalAspectRatio*256);board.height=256;const c=board.getContext('2d');c.fillStyle=g.color;c.fillRect(0,0,board.width,256);
     if(key==='ScreenSurface'){const scale=Math.max(board.width/art.width,256/art.height);c.drawImage(art,(board.width-art.width*scale)/2,(256-art.height*scale)/2,art.width*scale,art.height*scale);}else{c.fillStyle='#fff8e6';c.textAlign='center';c.textBaseline='middle';c.font='700 135px system-ui';c.fillText(g.title,board.width/2,128,board.width*.94);}
     ctx.drawImage(board,x0,y0,x1-x0,y1-y0);
    }
    const tex=original.clone();tex.source=new THREE.Source(atlas);tex.name=`canteen-${g.id}`;tex.needsUpdate=true;material.map=tex;n.material=material;ownedTextures.add(tex);ownedMaterials.add(material);
   });
  }
  for(const [id,pos,rot]of [['WORKSHOP_BENCH',[-3.6,.1,-1.65],.25],['JOB_BOARD',[3.7,.3,-2.1],-.2]]){const actor=await library.create(id,'lo');actor.scene.position.set(...pos);actor.scene.rotation.y=rot;stage.add(actor.scene);}
  applyIbl(stage,env,.7);
  await Promise.all([npc('PROFESSOR_OWLBERT',[-3.6,.1,-.15],1.4,.28),npc('MAYOR_TORTELLINI',[3.65,.1,-.35],1.26,-.28)]);
  if(disposed)return;ready=true;dirty=true;loading.hidden=true;resize();
 }
 function resize(){if(!active||disposed)return;const r=canvas.getBoundingClientRect();if(r.width<2||r.height<2)return;renderer.setPixelRatio(LOW_GPU?.6:Math.min(devicePixelRatio||1,1.5));renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();dirty=true;}
 function frame(now){if(!active||disposed)return;const dt=Math.min(.05,(now-(last||now))/1000);last=now;
  const portrait=camera.aspect<.9,atelier=service==='atelier';
  wanted.set(atelier?0:portrait?(focus-1.5)*1.32:0,atelier?(portrait?.95:1.5):1.15,atelier?1.6:-.6);const moving=target.distanceToSquared(wanted)>1e-7;if(moving)target.lerp(wanted,1-Math.exp(-dt*7));else target.copy(wanted);
  const distance=atelier?(portrait?10.5:6.8):portrait?10:11.5;camera.position.set(target.x+.35,target.y+(atelier?1.1:4.8),target.z+distance);camera.lookAt(target);camera.updateMatrixWorld();
  if(moving)dirty=true;
  if(ready&&dirty){dirty=false;baker.bake(renderer,stage,camera,LOW_GPU?1:1.5);scene.background=null;}
  for(const actor of actors){actor.wrapper.visible=!atelier;actor.mixer.update(dt);}if(formActor){formActor.scene.rotation.y=formYaw;formActor.mixer.update(dt);}
  if(ready)renderer.render(scene,camera);raf=requestAnimationFrame(frame);
 }
 function setFocus(index){focus=(index+4)%4;renderPanel();dirty=true;}
 const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
 canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,yaw:formYaw};try{canvas.setPointerCapture(e.pointerId);}catch{/* synthetic or already released pointer */}});
 canvas.addEventListener('pointermove',e=>{if(drag&&service==='atelier')formYaw=drag.yaw+(e.clientX-drag.x)*.012;});
 canvas.addEventListener('pointerup',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag=null;if(service==='atelier')return;if(Math.abs(dx)>45){setFocus(focus-Math.sign(dx));return;}if(Math.hypot(dx,dy)>8)return;const r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,camera);const hit=ray.intersectObjects(cabinets.map(c=>c.scene),true)[0];if(hit){const i=cabinets.findIndex(c=>c.scene.getObjectById(hit.object.id));if(i===focus)onPlay(GAMES[i].id);else setFocus(i);}});
 canvas.addEventListener('pointercancel',()=>{drag=null;});
 host.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
  if(b.classList.contains('fw-canteen__close')){closeService();return;}
  if(b.dataset.ring){selectTournamentRing(b.dataset.ring);return;}if(b.dataset.buy){purchaseUpgrade(b.dataset.buy);return;}if(b.dataset.job){const j=jobs().find(x=>x.id===b.dataset.job);j.active?claimJob(j.id):acceptJob(j.id);return;}if(b.dataset.form!==undefined){loadForm(Number(b.dataset.form));return;}
  const action=b.dataset.hub;if(action==='prev')setFocus(focus-1);else if(action==='next')setFocus(focus+1);else if(action==='play')onPlay(GAMES[focus].id);else if(['workshop','jobs','atelier','save'].includes(action))openService(action);
  else if(action==='export'){const code=exportCode();body.querySelector('textarea').value=code;try{await navigator.clipboard.writeText(code);body.querySelector('[data-save-status]').textContent='Code kopiert.';}catch{body.querySelector('[data-save-status]').textContent='Dein Code ist bereit zum Kopieren.';}}
  else if(action==='import'){const code=body.querySelector('textarea').value;try{importCode(code);body.querySelector('[data-save-status]').textContent='Spielstand geladen.';}catch(error){body.querySelector('[data-save-status]').textContent=error.message;}}
 });
 dialog.addEventListener('cancel',e=>{e.preventDefault();closeService();});
 const onKey=e=>{if(!active)return;if(e.key==='Escape'&&dialog.open){closeService();return;}if(dialog.open||e.target.closest?.('input,textarea,select'))return;if(e.key==='ArrowLeft'){setFocus(focus-1);e.preventDefault();}else if(e.key==='ArrowRight'){setFocus(focus+1);e.preventDefault();}else if(e.key==='Enter'&&!e.target.closest?.('button,a'))onPlay(GAMES[focus].id);};window.addEventListener('keydown',onKey);
 const unsubscribe=onChange(()=>{renderPanel();if(service==='workshop'||service==='jobs')serviceBody();});const observer=new ResizeObserver(resize);observer.observe(canvas);
 renderPanel();const prepared=prepare().catch(error=>{console.error('[canteen]',error);loading.textContent='Die Kantine konnte nicht geladen werden. Lade die Seite erneut.';throw error;});prepared.catch(()=>{});
 return {activate(){if(active)return;active=true;resize();last=0;raf=requestAnimationFrame(frame);},deactivate(){active=false;cancelAnimationFrame(raf);if(dialog.open)closeService();},get focus(){return GAMES[focus].id;},get ready(){return prepared;},boxes:cabinets,destroy(){disposed=true;active=false;cancelAnimationFrame(raf);++formRequest;releaseForm();observer.disconnect();unsubscribe();window.removeEventListener('keydown',onKey);for(const a of actors){a.mixer.stopAllAction();a.mixer.uncacheRoot(a.scene);}library.dispose();for(const m of stageMeshes){m.geometry.dispose();m.material.dispose();}for(const world of [stage,scene])world.traverse(n=>n.shadow?.map?.dispose());for(const m of ownedMaterials)m.dispose();for(const t of ownedTextures)t.dispose();baker.dispose();env.dispose?.();renderer.dispose();}};
}
