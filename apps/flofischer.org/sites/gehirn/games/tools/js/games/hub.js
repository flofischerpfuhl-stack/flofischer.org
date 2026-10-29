/** Fernhaven canteen: authored cabinets and furniture, lazy character atelier. */
import { THREE, createRenderer, addLights, studioEnvironment, applyIbl, LOW_GPU } from './three-kit.js';
import { createLoadingStatus } from './loading-status.js';
import { formatLoadProgress } from '../../games-assets/fernworld/runtime/loading-cache.js';
import { hubProgress } from './hub-progress-view.js';
import { fitCabinetHousing, cabinetScreenCorners, updateCabinetMarquee } from './hub-cabinet.js';
import { createHubSigns } from './hub-signs.js';
import { createHubDepth } from './hub-depth.js';
import { createHubBakeCache } from './hub-bake-cache.js';
import { Baker, Batch, mtx } from './world/decor.js';
import { ChannelLibrary } from '../../games-assets/fernworld/runtime/channel-library.js';
import { profile, game as gameProfile, exportCode, importCode, onChange, upgradeLevel } from './profile.js';
import { UPGRADES, purchaseUpgrade, jobs, acceptJob, claimJob, TOURNAMENT_RINGS, selectTournamentRing } from './hub-progress.js';

const CABINET_STEP=2.6,CABINET_Z=-4.9;
const UPGRADE_NOTES=['Pro Stufe ein Legionär mehr am Levelstart.','Pro Stufe 5 % höhere Feuerrate.','Ein Lösungshinweis pro Versuch in Pips Turm.','Eine zusätzliche Natur-Karte am Laufbeginn.'];
const FORM_USES=['Spitzhacke','Feuerwurf','Schweben','Rankenhaken','Stampfer','Gleiten','Extrasprung','Frostbrücke'];
const STONES=['FERNSTONE_ORE','FERNSTONE_EMBER','FERNSTONE_TIDE','FERNSTONE_GREEN','FERNSTONE_ROCK','FERNSTONE_WIND','FERNSTONE_SPARK','FERNSTONE_FROST'];
const ASSETS = new URL('../../games-assets/', import.meta.url);
export const GAMES = [
 {id:'fern-rangers',title:'Fern Rangers',color:'#567553',accent:'#edc76b',cover:'cover-fern-rangers',tagline:'Gemeinsam halten wir Fernhaven frei.',blurb:'Führe Captain Hazel und ihre Legion durch vier Regionen. Vergrößere deinen Trupp, befreie Gefangene und halte Orvans Maschinen auf. Nach dem Finale wartet die Sturmbastion.',levels:55},
 {id:'pips-tower',title:'Pip’s Tower',color:'#be682b',accent:'#ffd48b',cover:'cover-pips-tower',tagline:'Ein Zug verändert alles.',blurb:'Pip und Biscuit erkunden versiegelte Fossilgewölbe. Löse die Mechanismen, lenke Wasser und Lava und sammle Gold und Groschen. Fernstones geben Pip neue Fähigkeiten.',levels:44},
 {id:'momo',title:'Fernling-Arena',color:'#37745e',accent:'#b6e6c1',cover:'cover-momo',tagline:'Dein Fernling. Deine Entwicklung. Deine Arena.',blurb:'Wähle Glimmo, Mossel oder Plashling. Entwickle deinen Fernling, verbinde seine Fähigkeiten und bewähre dich in den Arenen der vier Regionen.',levels:44},
 {id:'tanks',title:'Bounce Brigade',color:'#487a9d',accent:'#f1c166',cover:'cover-tanks',tagline:'Der beste Weg ist selten gerade.',blurb:'Hazel tritt mit ihrem Spielzeugpanzer beim großen Turnier an. Nutze Banden, weiche Gummigeschossen aus und fordere die rivalisierenden Clubs heraus.',levels:44},
];
const FORMS = [
 ['PIP_KESSEL','Pip','Spitzhacke · Fossilien bergen'],['PIP_FIRE_THROW','Glut','Feuerwurf · Handschuh und Glutwerkzeug'],
 ['PIP_BUBBLE_FLOAT','Blase','Schweben · Blasenwerkzeug'],['PIP_VINE_HOOK','Ranke','Rankenhaken · Greifen und Schwingen'],
 ['PIP_STONE_STOMPER','Stein','Steinstampfer · Schwere Ausrüstung'],['PIP_GALE_GLIDER','Wind','Gleitumhang · In der Luft gleiten'],
 ['PIP_SPARK_LEAP','Funke','Funkenhandschuhe · Zusätzlicher Sprung'],['PIP_FROST_BRIDGE','Frost','Frostwerkzeug · Eine Brücke formen'],
];
const escaped = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const loadArt = name => new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`Cover ${name} failed to load`));image.src=new URL(`covers/${name}.webp`,ASSETS).href;});

export function mountHub(host,{onPlay}) {
 host.classList.add('gm-hub','fw-canteen');
 host.innerHTML=`<div class="gm-hub__stage"><canvas class="gm-hub__canvas" aria-hidden="true"></canvas><header class="fw-canteen__heading sr-only"><span>FERNWORLD</span><h1>Fernhaven</h1><p>Die Kantine der Fern Rangers</p></header><nav class="fw-canteen__services sr-only" aria-label="Orte in Fernhaven"><button data-hub="overview">Kantine erkunden</button><button data-hub="save">Spielstand</button></nav><div class="fw-canteen__places sr-only" aria-label="Direkt zu einem Ort"><button data-hub="workshop">Owlbert <span>Werkstatt</span></button><button data-hub="jobs">Tortellini <span>Aufträge</span></button><button data-hub="atelier">Pip <span>Ausrüstung</span></button></div><div class="fw-canteen__loading" role="status"><div class="gm-scene-loading__body"><span data-hub-load="text">Die Kantine öffnet…</span><progress class="gm-scene-loading__progress" data-hub-load="progress" aria-label="Aktueller Ladeschritt der Kantine"></progress><small data-hub-load="detail">Spieldaten · Modelle · Szene und Licht</small></div></div><section class="fw-canteen__game sr-only" aria-live="polite"></section><dialog class="fw-canteen__dialog" aria-label="Ort in Fernhaven"><button class="fw-canteen__close" aria-label="Schließen">×</button><div class="fw-canteen__dialogbody"></div></dialog></div>`;
 const canvas=host.querySelector('canvas'),panel=host.querySelector('.fw-canteen__game'),dialog=host.querySelector('dialog'),body=dialog.querySelector('.fw-canteen__dialogbody'),loading=host.querySelector('.fw-canteen__loading');
 const loadingStatus=createLoadingStatus({root:loading,text:loading.querySelector('[data-hub-load="text"]'),progress:loading.querySelector('progress'),detail:loading.querySelector('[data-hub-load="detail"]')});
 loadingStatus.begin('Die Kantine öffnet …');
 const renderer=createRenderer(canvas),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.05,100),env=studioEnvironment(renderer),library=new ChannelLibrary({onProgress:event=>loadingStatus.update(event)});
 scene.background=new THREE.Color('#d5dfd6');
 const signs=createHubSigns(scene);
 const coarsePointer=matchMedia('(pointer: coarse)');
 const compactView=()=>coarsePointer.matches||canvas.clientWidth<640||canvas.clientHeight<480;
 const fittedFov=(width,height,distance)=>THREE.MathUtils.radToDeg(2*Math.atan(Math.max(width/(camera.aspect*.9),height/.86)/(2*distance)));
 const controlHeight=(width,height,distance=5)=>46*Math.max(width/(camera.aspect*.9),height/.86)/Math.max(1,canvas.clientHeight);
 const stage=new THREE.Scene();stage.background=scene.background.clone();const roomLights=addLights(stage,{dir:[-4,8,7],shadowBox:8,mapSize:2048,intensity:2.3,ambient:1.05});
 const actorLights=addLights(scene,{dir:[-4,8,7],shadowBox:8,mapSize:1024,intensity:2.3,ambient:1.05});
 const baker=new Baker(),bakeCache=createHubBakeCache(baker),motionDepth=createHubDepth(THREE);scene.add(baker.quad);const stageMeshes=[];const cabinets=[],actors=[],ownedMaterials=new Set(),ownedTextures=new Set(),ownedGeometries=new Set(),interactives=[],workshopObjects=[],atelierObjects=[],ringModels=[];
 const places=[{id:'workshop',point:new THREE.Vector3(-3.8,1.45,.2)},{id:'jobs',point:new THREE.Vector3(5.6,1.6,-.1)},{id:'atelier',point:new THREE.Vector3(2.9,1.3,3.0)}];
 const themeMedia=matchMedia('(prefers-color-scheme: dark)'),motionMedia=matchMedia('(prefers-reduced-motion: reduce)');
 const siteDark=()=>document.documentElement.dataset.theme?document.documentElement.dataset.theme==='dark':themeMedia.matches;
 function theme(){bakeCache.clear();const dark=siteDark();stage.background=new THREE.Color(dark?'#142230':'#b9d9e5');scene.background=stage.background.clone();roomLights.light.intensity=dark?1.15:1.9;roomLights.hemi.intensity=dark?.32:.55;roomLights.light.color.set(dark?'#e6d2b1':'#fff4df');actorLights.light.intensity=dark?1.2:1.9;actorLights.hemi.intensity=dark?.45:.72;for(const world of[stage,scene])world.traverse(n=>{if(n.isMesh){for(const m of Array.isArray(n.material)?n.material:[n.material])if(m.isMeshStandardMaterial)m.envMapIntensity=dark?.22:.4;}});signs.retheme();dirty=true;}
 const themeObserver=new MutationObserver(theme);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});themeMedia.addEventListener('change',theme);
 let active=false,raf=0,last=0,focus=0,cameraDistance=6,cameraElevation=1,cameraYaw=0,cameraMotion=false,ready=false,dirty=true,disposed=false,service='',overview=false,roomIndex=0,returnFocus=null,formActor=null,formLibrary=null,formRequest=0,formIndex=0,formYaw=0,drag=null;
 const heroRoot=new THREE.Group();heroRoot.position.set(2.3,.42,3.0);scene.add(heroRoot);
 const target=new THREE.Vector3(0,1.0,-.3),wanted=new THREE.Vector3(0,1.0,-.3);
 const diagnostics={renderer,scene,camera,get ready(){return ready},get moving(){return cameraMotion},get bakeCache(){return bakeCache.stats},get cabinetCount(){return cabinets.length},get form(){return formActor?.id},get formAngle(){return formYaw},get roomIndex(){return roomIndex},get sourceScene(){return stage},get service(){return service},get readingPaper(){return jobRead},get workshopPage(){return stationPage},get ringFocus(){return ringFocus},get overview(){return overview},get focus(){return GAMES[focus].id},get controlBounds(){return signs.bounds(camera,canvas)},get signs(){return signs.signs.map(s=>({title:s.options.title,action:s.options.action,position:s.mesh.position.toArray(),visible:s.mesh.visible}))}};window.__hubView=diagnostics;

 function progressFor(g){return hubProgress(g.id,gameProfile(g.id),g.id==='fern-rangers'?profile().games['fern-rangers-sturmbastion']:undefined);}
 function renderPanel(){const g=GAMES[focus],p=gameProfile(g.id),totals=progressFor(g);panel.innerHTML=`<div class="fw-canteen__gamehead"><p>FERNHAVEN · ${profile().coins.toLocaleString('de')} GROSCHEN</p><h2>${g.title}</h2></div><p>${g.tagline}</p><p class="fw-canteen__blurb">${g.blurb}</p><div class="fw-canteen__progress">★ ${totals.stars} / ${totals.maxStars} · ${totals.cleared} / ${totals.levels} Level</div><button class="fw-canteen__play" data-hub="play">${p.plays?'Weiterspielen':'Spielen'}</button><nav class="fw-canteen__games" aria-label="Spiel auswählen">${GAMES.map((x,i)=>`<button data-game-focus="${i}" aria-label="${escaped(x.title)}" aria-pressed="${i===focus}" title="${escaped(x.title)}"><img src="${new URL(`covers/${x.cover}.webp`,ASSETS).href}" alt="" width="1200" height="800"><span>${x.title}</span></button>`).join('')}</nav>`;}
 function serviceBody(){
  if(service&&signsReady)updateSigns();
  const p=profile();
  if(service==='workshop')body.innerHTML=`<h2>Owlberts Werkstatt</h2><p>${p.coins} Groschen</p>${UPGRADES.map(x=>{const n=upgradeLevel(x.key),cost=x.cost*(n+1);return `<article><h3>${x.title} <small>${n}/${x.max}</small></h3><p>${x.description}</p><button data-buy="${x.key}" ${n>=x.max||p.coins<cost?'disabled':''}>${n>=x.max?'Vollständig ausgebaut':`${cost} Groschen`}</button></article>`}).join('')}`;
  if(service==='workshop')body.insertAdjacentHTML('beforeend',`<article><h3>Dein Turnierzeichen</h3><p>Die Farbe deines eigenen Markierungsrings in Bounce Brigade. Die Spielregeln bleiben gleich.</p><div class="fw-canteen__forms">${TOURNAMENT_RINGS.map(r=>{const own=r.id==='fern'||p.cosmetics.owned.includes(`tournament-ring:${r.id}`),chosen=(p.cosmetics.equipped['tournament-ring']||'fern')===r.id;return `<button data-ring="${r.id}" aria-pressed="${chosen}" ${!own&&p.coins<r.cost?'disabled':''}><span style="color:${r.color}">●</span> ${r.title}${chosen?' · Aktiv':own?'':` · ${r.cost}`}</button>`;}).join('')}</div></article>`);
  if(service==='jobs')body.innerHTML=`<h2>Tortellinis Aufträge</h2><p>Neue Aufträge jeden Tag. Dein Fortschritt zählt ab der Annahme.</p>${jobs().map(j=>`<article><h3>${j.title}</h3><p>${j.description}</p><p>${j.active?`${j.progress} / ${j.target} · `:''}${j.reward} Groschen</p><button data-job="${j.id}" ${j.claimed||j.active&&j.progress<j.target?'disabled':''}>${j.claimed?'Abgeholt':j.active?'Belohnung abholen':'Annehmen'}</button></article>`).join('')}`;
  if(service==='save')body.innerHTML=`<h2>Dein Spielstand</h2><p>Dein Fortschritt wird in diesem Browser gespeichert. Mit einem Code kannst du ihn auf ein anderes Gerät mitnehmen.</p><textarea aria-label="Spielstandcode" rows="4" spellcheck="false"></textarea><div><button data-hub="export">Code anzeigen / kopieren</button><button data-hub="import">Code laden</button></div><p role="status" data-save-status></p><p><a href="${new URL('fernworld/credits.html',ASSETS).href}" target="_blank" rel="noopener">Asset-Credits und Lizenzen</a></p>`;
  if(service==='atelier')body.innerHTML=`<h2>Pips Ausrüstung</h2><p>Jedes Powerup hat sein eigenes Werkzeug. Wähle eine Form und ziehe das Modell zum Drehen.</p><div class="fw-canteen__forms">${FORMS.map((f,i)=>`<button data-form="${i}" aria-pressed="${i===formIndex}">${f[1]}</button>`).join('')}</div><p data-form-status>${FORMS[formIndex][2]}</p>`;
 }
 function closeService(){bakeCache.clear();jobRead=-1;service='';dialog.close();updateSigns();host.classList.remove('has-service');panel.hidden=false;++formRequest;releaseForm();returnFocus?.focus({preventScroll:true});returnFocus=null;resize();}
 function openService(kind){bakeCache.clear();returnFocus=document.activeElement;overview=false;host.classList.remove('is-overview');if(dialog.open)dialog.close();service=kind;if(kind==='jobs')jobRead=compactView()?0:-1;const station=places.findIndex(p=>p.id===kind);if(station>=0)roomIndex=station;serviceBody();host.classList.add('has-service');dialog.classList.toggle('is-atelier',kind==='atelier');dialog.classList.toggle('is-fallback',kind!=='save');dialog.show();panel.hidden=true;stationPage=0;updateSigns();if(kind==='atelier'){loadAtelier();loadForm(formIndex);}else{++formRequest;releaseForm();}resize();}
 function releaseForm(){if(formActor){formActor.mixer.stopAllAction();formActor.mixer.uncacheRoot(formActor.scene);formActor.release();formActor=null;}formLibrary?.dispose();formLibrary=null;}
 async function loadForm(index){
  formIndex=index;serviceBody();const serial=++formRequest;releaseForm();const own=new ChannelLibrary({onProgress:event=>{if(serial!==formRequest)return;const text=formatLoadProgress(event);const status=body.querySelector('[data-form-status]');if(status)status.textContent=text;if(stationHeading)stationHeading.set({title:event.phase==='download'?'Werkzeug laden …':'Form vorbereiten …'});}});formLibrary=own;
  try {const {definition}=await own.definition(FORMS[index][0]);const actor=await own.create(FORMS[index][0],definition.lods?.lo?'lo':undefined);
   if(serial!==formRequest||disposed){actor.release();own.dispose();return;}
   const mixer=new THREE.AnimationMixer(actor.scene),idle=actor.animations.find(x=>/^(Idle|Ground_Idle)$/i.test(x.name));if(idle)mixer.clipAction(idle).play();mixer.update(.2);
   const box=new THREE.Box3().setFromObject(actor.scene),height=box.max.y-box.min.y;actor.scene.scale.multiplyScalar(1.7/height);actor.scene.position.y=-box.min.y*1.7/height;actor.scene.rotation.y=formYaw;heroRoot.add(actor.scene);applyIbl(actor.scene,env,.7);formActor={...actor,mixer};
   body.querySelector('[data-form-status]').textContent=FORMS[index][2];updateSigns();
  }catch(error){if(serial!==formRequest||disposed)return;console.error('[canteen atelier]',error);const text=error.code==='ASSET_VERSION_MISMATCH'?'Das Spiel wurde aktualisiert. Lade die Seite neu.':'Diese Form konnte nicht geladen werden. Wähle sie erneut.';body.querySelector('[data-form-status]').textContent=text;if(stationHeading)stationHeading.set({title:text});}
 }
 let signsReady=false,signsCompact=false,stationPage=0,ringFocus=0,jobRead=-1,atelierLoad=null,jobBoardRoot=null,ringDisplay=null;const cabinetSigns=[],placeSigns=[],workshopSigns=[],jobSigns=[],formSigns=[],ringSigns=[];let stationHeading,stationBack,stationPrev,stationNext,overviewReturn,roomPrev,roomNext,formDetail,ringDetail;
 function physical(options){return signs.add(options);}
 function cabinetFace(i,x,y){const cabinet=cabinets[i];cabinet.scene.updateMatrixWorld(true);const caster=new THREE.Raycaster(new THREE.Vector3(cabinet.scene.position.x+x,y,CABINET_Z+5),new THREE.Vector3(0,0,-1));const hit=caster.intersectObject(cabinet.scene,true)[0];return hit?[hit.point.x,hit.point.y,hit.point.z+.006]:[cabinet.scene.position.x+x,y,CABINET_Z+.65];}
 function chooseRing(index){if(service!=='workshop'){openService('workshop');stationPage=UPGRADES.length;ringFocus=index;updateSigns();return;}if(stationPage!==UPGRADES.length||ringFocus!==index){stationPage=UPGRADES.length;ringFocus=index;updateSigns();return;}selectTournamentRing(TOURNAMENT_RINGS[index].id);updateSigns();}
 function buildSigns(){
  GAMES.forEach((g,i)=>{const x=(i-1.5)*CABINET_STEP;cabinetSigns.push({
   title:physical({title:`★ ${progressFor(g).stars} / ${progressFor(g).maxStars} · ${profile().coins} G`,kind:'engraving',width:1.6,height:.18,ink:'#f4f2dc',position:cabinetFace(i,0,.68)}),
   play:physical({title:'SPIELEN',kind:'button',width:.43,height:.43,position:[x,1.39,CABINET_Z+.66],run:()=>onPlay(g.id)}),
   playLabel:physical({title:'SPIELEN',kind:'engraving',width:.8,height:.16,position:cabinetFace(i,0,1.05)}),
   previous:physical({title:'‹',kind:'wayfinder',width:.35,height:.3,position:[x-.77,1.39,CABINET_Z+.64],run:()=>setFocus(focus-1)}),
   next:physical({title:'›',kind:'wayfinder',width:.35,height:.3,position:[x+.77,1.39,CABINET_Z+.64],run:()=>setFocus(focus+1)}),
   room:physical({title:'← KANTINE',kind:'engraving',width:1.3,height:.17,ink:'#f4f2dc',position:cabinetFace(i,0,.48),run:()=>{overview=true;updateSigns();}}),
   save:physical({title:'Spielstand',kind:'engraving',width:.44,height:.12,ink:'#f4f2dc',position:[x+.82,.4,CABINET_Z+1.216],run:()=>openService('save')})
  });});
  for(const p of places){const title={workshop:'Owlberts Werkstatt',jobs:'Tortellinis Aufträge',atelier:'Pips Ausrüstung'}[p.id];placeSigns.push(physical({title,kind:'wayfinder',width:1.65,height:.27,post:1.3,position:[p.point.x,p.point.y+.25,p.point.z+.8],run:()=>openService(p.id)}));}
  overviewReturn=physical({title:'SPIELECKE →',kind:'wayfinder',width:1.5,height:.25,post:1.1,position:[-.8,1.2,1.2],run:()=>{overview=false;updateSigns();}});
  roomPrev=physical({title:'‹',kind:'wayfinder',width:.4,height:.25,post:.65,run:()=>{roomIndex=(roomIndex+2)%3;updateSigns();}});roomNext=physical({title:'›',kind:'wayfinder',width:.4,height:.25,post:.65,run:()=>{roomIndex=(roomIndex+1)%3;updateSigns();}});
  stationHeading=physical({title:'',kind:'engraving',width:2.1,height:.24});stationBack=physical({title:'← KANTINE',kind:'wayfinder',width:1.1,height:.25,post:.65,run:()=>{if(service==='jobs'&&jobRead>=0&&!compactView()){jobRead=-1;updateSigns();return;}closeService();overview=true;updateSigns();}});
  stationPrev=physical({title:'‹',kind:'wayfinder',width:.35,height:.25,run:()=>swipePage(-1)});stationNext=physical({title:'›',kind:'wayfinder',width:.35,height:.25,run:()=>swipePage(1)});
  UPGRADES.forEach(x=>workshopSigns.push(physical({title:x.title,text:x.description,kind:'ledger',width:1.22,height:.87,run:uv=>{if(uv&&uv.y>(workshopSigns[UPGRADES.indexOf(x)]?.actionFraction??.22))return;purchaseUpgrade(x.key);updateSigns();}})));
  jobs().forEach(j=>jobSigns.push(physical({title:j.title,text:j.description,kind:'paper',width:.93,height:.95,run:uv=>{const index=jobs().findIndex(x=>x.id===j.id);if(service!=='jobs'){openService('jobs');stationPage=index;jobRead=index;updateSigns();return;}if(jobRead!==index){stationPage=index;jobRead=index;updateSigns();return;}if(uv&&uv.y>(jobSigns[index]?.actionFraction??.22))return;const current=jobs().find(x=>x.id===j.id);current.active?claimJob(j.id):acceptJob(j.id);updateSigns();}})));
  FORMS.forEach((f,i)=>formSigns.push(physical({title:f[1],kind:'slate',width:.32,height:.18,run:()=>loadForm(i)})));
  TOURNAMENT_RINGS.forEach((r,i)=>ringSigns.push(physical({title:r.title,kind:'slate',width:.48,height:.16,run:()=>chooseRing(i)})));
  ringDetail=physical({title:'',kind:'slate',width:1.7,height:.18,position:[-.825,1.02,-.385],run:uv=>{if(compactView()&&uv&&uv.y>(ringDetail?.actionFraction??.22))return;chooseRing(ringFocus);}});
  formDetail=physical({title:'',kind:'slate',width:.9,height:.2,position:[2.3,.55,3.705]});
  signsReady=true;updateSigns();
 }
 function updateSigns(){if(!signsReady)return;if(service)bakeCache.clear();dirty=true;const portrait=compactView();if(signsCompact&&!portrait){for(const sign of signs.signs){sign.mesh.scale.setScalar(1);sign.resize(sign.options.width,sign.options.height);if(sign.options.position)sign.mesh.position.fromArray(sign.options.position);if(sign.options.rotation)sign.mesh.rotation.fromArray(sign.options.rotation);else sign.mesh.rotation.set(0,sign.options.yaw??0,0);for(const post of sign.mesh.children.filter(n=>n.userData.signPost)){post.scale.setScalar(1);post.position.y=-1.5;post.visible=true;}}}signsCompact=portrait;
  for(let i=0;i<cabinetSigns.length;i++){for(const sign of Object.values(cabinetSigns[i]))sign.mesh.visible=!service&&!overview&&i===focus;cabinetSigns[i].title.set({title:`★ ${progressFor(GAMES[i]).stars} / ${progressFor(GAMES[i]).maxStars} · ${profile().coins} G`});}
  placeSigns.forEach((sign,i)=>{sign.mesh.visible=!service&&overview&&(!portrait||i===roomIndex);const p=places[i].point,ox=p.x+(i===0?-.65:i===1?.7:.2);sign.mesh.rotation.y=0;if(i===1){sign.mesh.position.set(portrait?p.x-.6:4.8,portrait?.65:2.4,portrait?-1.4:.7);if(portrait)sign.mesh.rotation.y=-Math.PI/2;}else if(i===2)sign.mesh.position.set(portrait?ox:3.4,.75,p.z+1);else sign.mesh.position.set(portrait?ox:p.x,p.y+.25,p.z+.8);sign.mesh.scale.setScalar(portrait?.85:1);});overviewReturn.mesh.visible=overview&&!service;roomPrev.mesh.visible=roomNext.mesh.visible=portrait&&overview&&!service;
  if(portrait){const p=places[roomIndex].point,ox=p.x+(roomIndex===0?-.65:roomIndex===1?.7:.2);overviewReturn.mesh.rotation.y=roomIndex===1?-Math.PI/2:0;roomPrev.mesh.rotation.y=roomNext.mesh.rotation.y=roomIndex===1?-Math.PI/2:0;overviewReturn.mesh.position.set(ox,.65,p.z+1.1);overviewReturn.mesh.scale.setScalar(.75);roomPrev.mesh.position.set(ox-.7,1,p.z+1);roomNext.mesh.position.set(ox+.7,1,p.z+1);if(roomIndex===1){overviewReturn.mesh.position.set(p.x-1,.32,-1.4);roomPrev.mesh.position.set(p.x-.7,1,-2.1);roomNext.mesh.position.set(p.x-.7,1,-.7);}}else{overviewReturn.mesh.rotation.y=0;overviewReturn.mesh.position.set(-.8,1.2,1.2);overviewReturn.mesh.scale.setScalar(1);}
  formDetail.mesh.visible=service==='atelier';ringDetail.mesh.visible=service==='workshop'&&stationPage===UPGRADES.length;
  for(const group of[workshopSigns,formSigns,ringSigns])for(const sign of group)sign.mesh.visible=false;
  if(jobBoardRoot)jobBoardRoot.visible=true;
  jobs().forEach((item,i)=>{const paper=jobSigns[i],p=places[1].point;paper.mesh.visible=!!jobBoardRoot?.visible;paper.mesh.position.set(p.x-.104,1.62,p.z+(i-1)*1.02);paper.mesh.rotation.set(0,-Math.PI/2,(i-1)*.035);paper.set({text:`${item.description} ${item.active?`${item.progress} / ${item.target}. `:''}${item.reward} Groschen`,action:item.claimed?'Abgeholt':item.active?item.progress>=item.target?'Belohnung abholen':'In Arbeit':'Auftrag annehmen',disabled:jobRead===i&&(item.claimed||item.active&&item.progress<item.target)});});
  for(const sign of[stationHeading,stationBack,stationPrev,stationNext])sign.mesh.visible=!!service&&service!=='save';
  if(!service||service==='save'){layoutCompactSigns();return;}
  const p=places.find(p=>p.id===service),x=p.point.x,z=p.point.z;
  stationHeading.set({title:{workshop:'Owlberts Werkstatt',jobs:'Tortellinis Aufträge',atelier:'Pips Ausrüstung'}[service]});stationHeading.mesh.position.set(x-.104,2.55,z);stationHeading.mesh.rotation.y=service==='jobs'?-Math.PI/2:0;stationHeading.mesh.scale.setScalar(1);stationHeading.mesh.visible=service==='jobs';if(portrait&&service!=='atelier')stationHeading.mesh.visible=false;
  for(const sign of[stationBack,stationPrev,stationNext])sign.mesh.rotation.y=service==='jobs'?-Math.PI/2:0;stationBack.mesh.scale.setScalar(1);stationBack.set({title:'← KANTINE'});stationBack.mesh.position.set(x-.7,.65,z+1.4);stationPrev.mesh.visible=stationNext.mesh.visible=false;
  if(service==='workshop'){
   stationPage=Math.min(UPGRADES.length,stationPage);
   if(stationPage===UPGRADES.length){
    stationHeading.mesh.visible=true;stationHeading.mesh.position.set(-.825,1.96,-.38);stationHeading.mesh.scale.setScalar(.85);stationHeading.set({title:`Turnierzeichen · ${profile().coins} G`});
    ringSigns.forEach((sign,i)=>{const r=TOURNAMENT_RINGS[i],p=profile(),chosen=(p.cosmetics.equipped['tournament-ring']||'fern')===r.id,owned=r.id==='fern'||p.cosmetics.owned.includes(`tournament-ring:${r.id}`);sign.mesh.visible=true;sign.mesh.position.set(-1.65+i*.55,1.3,-.385);sign.set({title:r.title});if(ringModels[i]){ringModels[i].scale.setScalar(chosen?1.1:1);ringModels[i].material.emissive.set(chosen?r.color:'#000000');ringModels[i].material.emissiveIntensity=chosen?.16:0;}});
    const focused=TOURNAMENT_RINGS[ringFocus],p=profile(),selected=(p.cosmetics.equipped['tournament-ring']||'fern')===focused.id,owned=focused.id==='fern'||p.cosmetics.owned.includes(`tournament-ring:${focused.id}`);ringDetail.set({title:`${focused.title} · ${selected?'Aktiv':owned?'Antippen: anlegen':`${focused.cost} G · Antippen: kaufen`}`});
    stationPrev.mesh.visible=true;stationPrev.mesh.position.set(-1.7,.6,.05);stationNext.mesh.visible=false;stationBack.mesh.position.set(-.75,canvas.clientHeight<480?1.05:.6,.8);
   }else{
    const item=UPGRADES[stationPage],n=upgradeLevel(item.key),cost=item.cost*(n+1),toolX=x+(stationPage-1.5)*.65;
    const ledger=workshopSigns[stationPage];ledger.mesh.visible=true;ledger.mesh.position.set(toolX+.9,1.64,z+.82);ledger.mesh.rotation.x=-.12;ledger.set({text:`Guthaben: ${profile().coins} G. ${UPGRADE_NOTES[stationPage]} Stufe ${n}/${item.max}`,action:n>=item.max?'Ausgebaut':`${cost} Groschen · Kaufen`,disabled:n>=item.max||profile().coins<cost});
    workshopObjects.forEach((o,i)=>{o.root.scale.setScalar(i===stationPage?1.1:1);});
    stationBack.mesh.position.set(portrait?toolX+.35:x-.85,.65,z+1.3);if(!portrait&&canvas.clientHeight<480)stationBack.mesh.position.set(toolX+1.7,1.1,z+1.3);
    stationPrev.mesh.visible=stationPage>0;stationNext.mesh.visible=true;stationPrev.mesh.position.set(toolX-.52,1.02,z+.92);stationNext.mesh.position.set(toolX+.52,1.02,z+.92);
   }
  }
  if(service==='jobs'){
   stationPage=Math.min(2,stationPage);jobs().forEach((item,i)=>{const paper=jobSigns[i];paper.mesh.visible=true;paper.mesh.position.set(x-.104,1.62,z+(i-1)*1.02);paper.mesh.rotation.set(0,-Math.PI/2,(i-1)*.035);paper.set({text:`${item.description} ${item.active?`${item.progress} / ${item.target}. `:''}${item.reward} Groschen`,action:item.claimed?'Abgeholt':item.active?item.progress>=item.target?'Belohnung abholen':'In Arbeit':'Auftrag annehmen',disabled:jobRead===i&&(item.claimed||item.active&&item.progress<item.target)});});
   if(portrait||jobRead>=0){const paperZ=z+(stationPage-1)*1.02;stationPrev.mesh.visible=stationPage>0;stationNext.mesh.visible=stationPage<2;stationPrev.mesh.position.set(x-.3,.82,paperZ-.58);stationNext.mesh.position.set(x-.3,.82,paperZ+.58);stationBack.mesh.position.set(x-.6,.55,paperZ);if(jobRead>=0){stationPrev.mesh.visible=stationNext.mesh.visible=false;stationBack.mesh.scale.setScalar(.65);stationBack.mesh.position.set(x-.18,1.05,paperZ);stationBack.set({title:'← ZUM BRETT'});}}
  }
  if(service==='atelier'){
   stationHeading.mesh.visible=true;stationHeading.mesh.position.set(3.66,1.95,2.365);stationHeading.mesh.scale.setScalar(.5);stationHeading.mesh.rotation.y=0;
   heroRoot.position.set(x-.55,.42,z+.05);formDetail.set({title:`${FORMS[formIndex][1]} · ${FORM_USES[formIndex]}`});formSigns.forEach((sign,i)=>{sign.mesh.visible=true;const column=i%2,row=Math.floor(i/2),h=1.35-row*.32;sign.mesh.position.set(column?4.25:2.93,h+.22,z-.7+row*.32+.15);sign.set({title:`${i===formIndex?'● ':''}${FORMS[i][1]}`});});stationBack.mesh.position.set(portrait?x-.35:x-1.45,portrait?.3:.65,portrait?z+1.2:z+2.55);
  }
  layoutCompactSigns();
 }
 function stationFrame(kind=service){
  if(kind==='workshop'&&stationPage===UPGRADES.length)return compactView()?{x:-3.625,z:1.0,yaw:0}:{x:-.825,z:-.4,yaw:0};
  if(kind==='jobs')return {x:5.0,z:-1.4+(stationPage-1)*1.02,yaw:-Math.PI/2};
  if(kind==='atelier')return {x:3.1,z:3.0,yaw:0};
  return {x:places[0].point.x+(stationPage-1.5)*.65+.85,z:1.02,yaw:0};
 }
 function placeSign(sign,frame,x,y,front,width,height){
  sign.mesh.position.set(frame.x+Math.cos(frame.yaw)*x+Math.sin(frame.yaw)*front,y,frame.z-Math.sin(frame.yaw)*x+Math.cos(frame.yaw)*front);
  sign.mesh.rotation.set(0,frame.yaw,0);sign.mesh.scale.set(width/sign.options.width,height/sign.options.height,1);sign.resize(width,height);for(const post of sign.mesh.children.filter(n=>n.userData.signPost)){const length=Math.max(.08,y-height/2);post.visible=true;post.scale.set(1/sign.mesh.scale.x,length/(3*sign.mesh.scale.y),1);post.position.y=-(height/2+length/2)/sign.mesh.scale.y;}
 }
 function layoutCompactSigns(){
  ringDisplay?.position.set(compactView()?-2.8:0,0,compactView()?1.4:0);
  for(const c of cabinetSigns){c.room.set({kind:compactView()?'slate':'engraving'});c.save.set({kind:compactView()?'slate':'engraving'});for(const name of['play','previous','next','room','save']){c[name].mesh.scale.setScalar(1);if(!compactView())c[name].resize(c[name].options.width,c[name].options.height);}}
  if(!compactView()){ringDetail?.set({text:'',action:'',disabled:false});for(const actor of actors){actor.wrapper.position.copy(actor.home);actor.wrapper.rotation.y=actor.homeYaw;}cabinets.forEach((cab,i)=>updateCabinetMarquee(cab,GAMES[i].title));return;}
  const owlbert=actors.find(a=>a.place==='workshop');if(owlbert)owlbert.wrapper.position.set(-5.6,.6,.35);const mayor=actors.find(a=>a.place==='jobs');if(mayor){mayor.wrapper.position.set(4.65,.1,(service==='jobs'?stationFrame('jobs').z:-1.4)+1.65);mayor.wrapper.rotation.y=-Math.PI/2;}
  if(service!=='jobs'&&!(overview&&roomIndex===1))for(const paper of jobSigns)paper.mesh.visible=false;
  const worldPerPixel=controlHeight(2.9,3.9)/46;cabinets.forEach((cab,i)=>updateCabinetMarquee(cab,GAMES[i].title,worldPerPixel));
  if(!service&&!overview){const c=cabinetSigns[focus],x=(focus-1.5)*CABINET_STEP,frame={x,z:CABINET_Z,yaw:0},h=controlHeight(2.9,3.9)*44/46;
   placeSign(c.play,frame,0,1.48,.68,h,h);placeSign(c.previous,frame,-.9,1.48,.66,h*1.1,h);placeSign(c.next,frame,.9,1.48,.66,h*1.1,h);
   for(const [name,offset]of[['room',-.65],['save',.65]]){const face=cabinetFace(focus,offset,.42);c[name].mesh.position.fromArray(face);if(name==='save')c[name].mesh.position.z=CABINET_Z+1.225;const height=name==='room'?h*1.2:h;c[name].mesh.scale.set(1.2/c[name].options.width,height/c[name].options.height,1);c[name].resize(1.2,height);}
   c.title.mesh.position.fromArray(cabinetFace(focus,0,.86));const statusHeight=24*worldPerPixel;c.title.mesh.scale.set(1.8/c.title.options.width,statusHeight/c.title.options.height,1);c.title.resize(1.8,statusHeight);return;
  }
  if(overview&&!service){const p=places[roomIndex],frame=roomIndex===1?{x:4.8,z:-1.4,yaw:-Math.PI/2}:{x:p.point.x+(roomIndex===0?-.45:.2),z:p.point.z+.4,yaw:0};
   const caption=placeSigns[roomIndex];placeSign(caption,frame,roomIndex===0?.3:roomIndex===1?.45:0,roomIndex===2?1.05:.9,.75,2.15,.5);for(const post of caption.mesh.children.filter(n=>n.userData.signPost))post.visible=false;
   const h=controlHeight(3.4,3.1)*3.2/5,offset=roomIndex===1?.45:0;placeSign(roomPrev,frame,offset-2.4*h,.55,1.8,1.2*h,h);placeSign(roomNext,frame,offset+2.4*h,.55,1.8,1.2*h,h);placeSign(overviewReturn,frame,offset,.55,1.8,3*h,h);return;
  }
  if(service==='save')return;
  const frame=stationFrame();stationHeading.mesh.visible=false;
  const front=service==='atelier'?1.6:1.3,h=controlHeight(service==='workshop'||service==='jobs'?3.7:3.0,service==='jobs'||service==='atelier'?2.8:2.6)*(5-front)/5,offset=service==='jobs'?.45:0;
  placeSign(stationBack,frame,offset,.6,front,3*h,h);stationBack.set({title:'← KANTINE'});
  placeSign(stationPrev,frame,offset-2.4*h,.6,front,1.2*h,h);placeSign(stationNext,frame,offset+2.4*h,.6,front,1.2*h,h);
  if(service==='workshop'&&stationPage<UPGRADES.length){const ledger=workshopSigns[stationPage];placeSign(ledger,frame,0,1.7,.35,2.2,1.7);stationPrev.mesh.visible=stationPage>0;stationNext.mesh.visible=true;}
  if(service==='workshop'&&stationPage===UPGRADES.length){
   for(const sign of ringSigns)sign.mesh.visible=false;
   const ring=TOURNAMENT_RINGS[ringFocus],p=profile(),selected=(p.cosmetics.equipped['tournament-ring']||'fern')===ring.id,owned=ring.id==='fern'||p.cosmetics.owned.includes(`tournament-ring:${ring.id}`);
   placeSign(ringDetail,frame,0,2.5,0,2.2,1.2);ringDetail.set({title:ring.title,text:selected?'Aktiv':owned?'Gehört dir':`${ring.cost} Groschen`,action:selected?'Angelegt':owned?'Anlegen':'Kaufen',disabled:selected});
   stationPrev.mesh.visible=true;stationNext.mesh.visible=ringFocus<TOURNAMENT_RINGS.length-1;
  }
  if(service==='jobs'){
   jobs().forEach((_,i)=>jobSigns[i].mesh.visible=i===stationPage);placeSign(jobSigns[stationPage],frame,0,1.8,0,2.0,1.8);
   stationPrev.mesh.visible=stationPage>0;stationNext.mesh.visible=stationPage<jobs().length-1;jobRead=stationPage;
  }
  if(service==='atelier'){
   for(const sign of formSigns)sign.mesh.visible=false;
   placeSign(formDetail,frame,0,2.4,.8,2.2,.5);
   stationPrev.mesh.visible=formIndex>0;stationNext.mesh.visible=formIndex<FORMS.length-1;
  }
 }
 function ownSceneMaterials(root){const copies=new Map();root.traverse(node=>{if(!node.isMesh)return;const copy=material=>{if(!copies.has(material)){const cloned=material.clone();copies.set(material,cloned);ownedMaterials.add(cloned);}return copies.get(material);};node.material=Array.isArray(node.material)?node.material.map(copy):copy(node.material);});}
 function modelProp(model,height,pos){const root=new THREE.Group();for(const g of model){const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:g.mat==='gloss'?.35:.8});ownedMaterials.add(material);root.add(new THREE.Mesh(g.geometry,material));}const b=new THREE.Box3().setFromObject(root),k=height/(b.max.y-b.min.y);for(const child of root.children){child.scale.setScalar(k);child.position.y=-b.min.y*k;}root.position.set(...pos);stage.add(root);return root;}
 async function loadAtelier(){if(atelierLoad)return atelierLoad;atelierLoad=Promise.all(STONES.map(async(id,i)=>{const actor=await library.create(id,'lo');if(disposed){actor.release();return;}ownSceneMaterials(actor.scene);const b=new THREE.Box3().setFromObject(actor.scene),k=.27/(b.max.y-b.min.y);actor.scene.scale.setScalar(k);actor.scene.position.y=-b.min.y*k;const root=new THREE.Group();root.add(actor.scene);root.name=`Form_${FORMS[i][0]}`;const column=i%2,row=Math.floor(i/2),p=places[2].point;root.position.set(p.x+.45+column*.62,1.35-row*.32+.1,p.z-.7+row*.32);stage.add(root);interactives.push({root,run:()=>loadForm(i)});atelierObjects.push({...actor,root});applyIbl(root,env,.65);})).then(()=>{if(disposed)return;motionDepth.add(stage);bakeCache.clear();dirty=true;updateSigns();}).catch(error=>{atelierLoad=null;if(disposed)return;console.error('[canteen powerups]',error);if(stationHeading)stationHeading.set({title:error.code==='ASSET_VERSION_MISMATCH'?'AKTUALISIERT · NEU LADEN':'Werkzeuge konnten nicht geladen werden',run:error.code==='ASSET_VERSION_MISMATCH'?()=>location.reload():()=>loadAtelier()});});return atelierLoad;}
 async function npc(id,pos,height,angle=0,place=''){const {definition}=await library.definition(id);const actor=await library.create(id,definition.lods?.lo?'lo':undefined);if(disposed){actor.release();return;}ownSceneMaterials(actor.scene);const wrapper=new THREE.Group(),mixer=new THREE.AnimationMixer(actor.scene),idle=actor.animations.find(x=>/idle/i.test(x.name))??actor.animations[0];if(idle)mixer.clipAction(idle).play();mixer.update(.3);const b=new THREE.Box3().setFromObject(actor.scene),s=height/(b.max.y-b.min.y);actor.scene.scale.setScalar(s);actor.scene.position.y=-b.min.y*s;wrapper.add(actor.scene);wrapper.position.set(...pos);wrapper.rotation.y=angle;scene.add(wrapper);applyIbl(actor.scene,env,.7);actors.push({...actor,wrapper,mixer,place,home:wrapper.position.clone(),homeYaw:angle});if(place)interactives.push({root:wrapper,place});}
 function solid(geometry,material,position,rotation){ownedGeometries.add(geometry);ownedMaterials.add(material);const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);if(rotation)mesh.rotation.set(...rotation);mesh.castShadow=true;mesh.receiveShadow=true;stage.add(mesh);return mesh;}
 async function prepare(){
  loadingStatus.update({phase:'prepare',stage:'Die Kantine wird eingerichtet …'});
  const ids=['fw_floor_timber','fw_wall_timber_straight','fw_table_oak','fw_chair_oak','fw_keg_oak','fw_barrel_oak','fw_shelves_oak','fw_books_stack','fw_plate_supper','fw_bottle_corked','fw_window_round','fw_planter_terracotta','meadow_fern_arching','meadow_bellflower','fw_street_light_sporecell'];
  const models=Object.fromEntries(await Promise.all(ids.map(async id=>[id,await library.model(id,'lo')]))),batches=new Map();
  const put=(id,pos,rot=0,scale=1)=>{for(const g of models[id]){if(!batches.has(g.mat))batches.set(g.mat,new Batch());batches.get(g.mat).add(g.geometry,mtx(pos,[0,rot,0],scale));}};
  for(let x=-2;x<=2;x++)for(let z=-2;z<=6;z++)put('fw_floor_timber',[x*2.6,0,z*2.6]);
  for(let x=-2;x<=2;x++)put(Math.abs(x)===2?'fw_window_round':'fw_wall_timber_straight',[x*2.6,.1,-6.4],0,[1,1.65,1]);
  for(const side of[-1,1])for(let z=-1;z<=4;z++)put(z===0?'fw_window_round':'fw_wall_timber_straight',[side*6.4,.1,z*2.6],side>0?-Math.PI/2:Math.PI/2,[1,1.65,1]);
  for(const [x,z]of[[-.7,1.8],[.8,4.5]]){put('fw_table_oak',[x,.1,z]);put('fw_chair_oak',[x-.9,.1,z],Math.PI/2);put('fw_chair_oak',[x+.9,.1,z],-Math.PI/2);put('fw_plate_supper',[x,.86,z],0,.8);put('fw_bottle_corked',[x+.35,.86,z+.15]);}
  for(const x of[-5.6,5.6]){put('fw_planter_terracotta',[x,.1,-5.6]);put('meadow_fern_arching',[x,.54,-5.6],x,.8);put('meadow_bellflower',[x+.1,.53,-5.6],0,.4);}
  for(const [x,z]of[[-5.9,-.3],[5.8,-2.3],[5.9,5.5]])put('fw_street_light_sporecell',[x,.1,z],x>0?Math.PI:0);
  put('fw_keg_oak',[-5.8,.1,2]);put('fw_barrel_oak',[-5.8,.1,3]);put('fw_shelves_oak',[-5.95,1.1,-2],Math.PI/2);put('fw_books_stack',[-5.72,2.54,-2]);
  for(const [mat,b]of batches){const mesh=b.mesh({glow:mat==='glow',roughness:mat==='gloss'?.3:.8,shadow:true});stage.add(mesh);stageMeshes.push(mesh);}
  // The window openings look into an actual quiet exterior, not the edge of a floating floor.
  const hill=new THREE.MeshStandardMaterial({color:'#78975a',roughness:1});for(const [x,y,z,scale]of[[-6,-1.5,-12,[8,4,5]],[5,-2,-15,[11,5,6]]]){const m=solid(new THREE.SphereGeometry(1,12,6),hill,[x,y,z]);m.scale.set(...scale);}
  solid(new THREE.PlaneGeometry(42,32),new THREE.MeshStandardMaterial({color:'#86a96c',roughness:1}),[0,-.1,-10],[-Math.PI/2,0,0]);
  const ceiling=solid(new THREE.PlaneGeometry(13,21),new THREE.MeshStandardMaterial({color:'#98764e',roughness:.95}),[0,4.55,3.9],[Math.PI/2,0,0]);ceiling.castShadow=false;for(const z of[-3.9,1.3,6.5,11.7])solid(new THREE.BoxGeometry(13,.18,.16),new THREE.MeshStandardMaterial({color:'#67482d',roughness:.9}),[0,4.42,z]);
  const surface=await library.json('interactives/fossil-equipment.SURFACE_CONTRACT.json');
  for(let i=0;i<GAMES.length;i++){
   const g=GAMES[i],cab=await library.create('ARCADE_CABINET','lo'),x=(i-1.5)*CABINET_STEP;cab.scene.position.set(x,.1,CABINET_Z);cab.scene.userData.canteenGame=g.id;stage.add(cab.scene);cabinets.push(cab);
   loadingStatus.update({phase:'prepare',stage:`Automat vorbereiten · ${g.title}`});const art=await loadArt(g.cover);
   cab.sourceGeometries=[];cab.scene.traverse(n=>{if(!n.isMesh)return;cab.sourceGeometries.push(n.geometry);const geometry=fitCabinetHousing(n.geometry);n.geometry=geometry;ownedGeometries.add(geometry);if(!n.material.map)return;
    const material=n.material.clone(),original=material.map,atlas=document.createElement('canvas');atlas.width=atlas.height=1024;const ctx=atlas.getContext('2d');ctx.drawImage(original.image,0,0,1024,1024);
    const s=surface.surfaces['ARCADE_CABINET.CoverSurface'],[x0,y0,x1,y1]=s.pixelRectFromTopLeft;const marquee=document.createElement('canvas');marquee.width=2048;marquee.height=144;const label=marquee.getContext('2d');label.fillStyle='#244c37';label.fillRect(0,0,2048,144);label.fillStyle='#edf4e9';label.font='650 95px Geist, system-ui';label.textAlign='center';label.textBaseline='middle';label.fillText(g.title,1024,72,1960);ctx.drawImage(marquee,x0,y0,x1-x0,y1-y0);const marqueeTexture=new THREE.CanvasTexture(marquee);marqueeTexture.colorSpace=THREE.SRGBColorSpace;ownedTextures.add(marqueeTexture);const marqueeMaterial=new THREE.MeshBasicMaterial({map:marqueeTexture,toneMapped:false});ownedMaterials.add(marqueeMaterial);const marqueeGeometry=new THREE.PlaneGeometry(1.956,.13775);ownedGeometries.add(marqueeGeometry);cab.marquee=new THREE.Mesh(marqueeGeometry,marqueeMaterial);cab.marquee.position.set(0,3.099,.452);cab.marquee.name=`Marquee_${g.id}`;
    const tex=original.clone();tex.source=new THREE.Source(atlas);tex.name=`canteen-${g.id}`;tex.needsUpdate=true;material.map=tex;n.material=material;ownedTextures.add(tex);ownedMaterials.add(material);
   });
   cab.scene.add(cab.marquee);
   const corners=cabinetScreenCorners(surface.surfaces['ARCADE_CABINET.ScreenSurface']);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(corners.flat(),3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();ownedGeometries.add(geometry);const texture=new THREE.Texture(art);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;ownedTextures.add(texture);const material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});ownedMaterials.add(material);const display=new THREE.Mesh(geometry,material);display.name=`Display_${g.id}`;cab.scene.add(display);cab.display=display;
   // A tangible notebook is the save action; its caption is engraved on its small stand.
   solid(new THREE.BoxGeometry(.46,.38,.42),new THREE.MeshStandardMaterial({color:'#685038',roughness:.8}),[x+.82,.29,CABINET_Z+1]);const book=modelProp(models.fw_books_stack,.16,[x+.82,.49,CABINET_Z+1]);interactives.push({root:book,run:()=>openService('save')});
  }
  const bench=await library.create('WORKSHOP_BENCH','lo');ownSceneMaterials(bench.scene);bench.scene.position.set(-3.8,.1,.2);bench.scene.scale.set(2.1,1,1.2);stage.add(bench.scene);interactives.push({root:bench.scene,place:'workshop'});
  solid(new THREE.BoxGeometry(4.4,.08,.45),new THREE.MeshStandardMaterial({color:'#7b5b37',roughness:.85}),[-3.4,1.15,.98]);for(const x of[-5.2,-1.6])solid(new THREE.CylinderGeometry(.055,.075,1.0,8),new THREE.MeshStandardMaterial({color:'#66492e',roughness:.85}),[x,.61,1.05]);
  solid(new THREE.BoxGeometry(.84,.09,.72),new THREE.MeshStandardMaterial({color:'#7b5b37',roughness:.85}),[-1.9,1.12,.35]);solid(new THREE.CylinderGeometry(.06,.08,1.0,8),new THREE.MeshStandardMaterial({color:'#66492e',roughness:.85}),[-1.7,.61,.35]);
  const board=await library.create('JOB_BOARD','lo');ownSceneMaterials(board.scene);board.scene.position.set(5.6,.1,-.1);board.scene.rotation.y=-Math.PI/2;board.scene.scale.set(2.8,1.65,1);stage.add(board.scene);jobBoardRoot=board.scene;interactives.push({root:board.scene,place:'jobs'});
  // Upgrades live on the bench as a troop figurine, spore bottle, notebook and Keepstone tool.
  const toy=await library.create('DUCK_LEGIONARY','lo');ownSceneMaterials(toy.scene);const toyMixer=new THREE.AnimationMixer(toy.scene),toyIdle=toy.animations.find(c=>/idle/i.test(c.name));if(toyIdle){toyMixer.clipAction(toyIdle).play();toyMixer.update(.3);}const keepstone=await library.create('KEEPSTONE_TOOL','lo');ownSceneMaterials(keepstone.scene);
  const toolModels=[toy,null,null,keepstone];for(let i=0;i<4;i++){const x=-3.8+(i-1.5)*.65;let root;if(toolModels[i]){const actor=toolModels[i],b=new THREE.Box3().setFromObject(actor.scene),k=.40/(b.max.y-b.min.y);actor.scene.scale.setScalar(k);actor.scene.position.y=-b.min.y*k;root=new THREE.Group();root.add(actor.scene);root.position.set(x,1.15,.6);stage.add(root);}else root=modelProp(models[i===1?'fw_bottle_corked':'fw_books_stack'],i===1?.40:.25,[x,1.15,.6]);solid(new THREE.CylinderGeometry(.25,.28,.10,8),new THREE.MeshStandardMaterial({color:'#67533b',roughness:.85}),[x,1.09,.6]);root.name=`Upgrade_${UPGRADES[i].key}`;workshopObjects.push({root});interactives.push({root,run:()=>{if(service!=='workshop'){openService('workshop');stationPage=i;updateSigns();return;}if(stationPage===i)purchaseUpgrade(UPGRADES[i].key);else stationPage=i;updateSigns();}});}
  const ringStart=stage.children.length;
  for(let i=0;i<TOURNAMENT_RINGS.length;i++){const r=TOURNAMENT_RINGS[i],x=-1.65+i*.55,material=new THREE.MeshStandardMaterial({color:r.color,metalness:.5,roughness:.32}),ring=solid(new THREE.TorusGeometry(.15,.035,8,28),material,[x,1.61,-.65]);ring.name=`TournamentRing_${r.id}`;ringModels.push(ring);const cushion=solid(new THREE.CylinderGeometry(.17,.17,.06,24),new THREE.MeshStandardMaterial({color:'#24342a',roughness:.95}),[x,1.61,-.69],[Math.PI/2,0,0]);interactives.push({root:cushion,run:()=>chooseRing(i)});solid(new THREE.CylinderGeometry(.23,.25,1.3,12),new THREE.MeshStandardMaterial({color:'#715237',roughness:.8}),[x,.75,-.65]);interactives.push({root:ring,run:()=>chooseRing(i)});}
  solid(new THREE.BoxGeometry(2.3,.18,.12),new THREE.MeshStandardMaterial({color:'#715237',roughness:.8}),[-.825,1.96,-.45]);for(const x of[-1.96,.31])solid(new THREE.BoxGeometry(.065,1.8,.065),new THREE.MeshStandardMaterial({color:'#715237',roughness:.8}),[x,1.04,-.45]);
  ringDisplay=new THREE.Group();ringDisplay.name='Fernhaven_Ring_Stand';for(const part of stage.children.slice(ringStart))ringDisplay.add(part);stage.add(ringDisplay);
  // The main model stands on a round fitting plinth; powerups occupy a stepped display beside it.
  solid(new THREE.BoxGeometry(1.32,.16,.12),new THREE.MeshStandardMaterial({color:'#715237',roughness:.8}),[3.66,1.95,2.3]);for(const x of[3.03,4.29])solid(new THREE.BoxGeometry(.06,1.8,.06),new THREE.MeshStandardMaterial({color:'#715237',roughness:.8}),[x,1.04,2.3]);
  for(let i=0;i<8;i++){const column=i%2,row=Math.floor(i/2),h=1.35-row*.32,gemX=3.35+column*.62,labelX=column?4.25:2.93,poleX=column?gemX+.25:gemX-.25,z=2.3+row*.32;solid(new THREE.BoxGeometry(.045,.26,.045),new THREE.MeshStandardMaterial({color:'#715237',roughness:.8}),[column?gemX+.25:gemX-.25,h+.13,z+.1]);solid(new THREE.BoxGeometry(Math.abs(labelX-poleX),.035,.045),new THREE.MeshStandardMaterial({color:'#715237',roughness:.8}),[(labelX+poleX)/2,h+.22,z+.1]);}solid(new THREE.BoxGeometry(.08,.18,.08),new THREE.MeshStandardMaterial({color:'#715237',roughness:.8}),[2.3,.51,3.62]);
  solid(new THREE.CylinderGeometry(.57,.64,.32,32),new THREE.MeshStandardMaterial({color:'#587055',roughness:.72}),[2.35,.26,3.05]);for(let i=0;i<8;i++){const column=i%2,row=Math.floor(i/2),h=1.35-row*.32;solid(new THREE.BoxGeometry(.52,h-.1,.48),new THREE.MeshStandardMaterial({color:'#685138',roughness:.8}),[3.35+column*.62,(h+.1)/2,2.3+row*.32]);}
  for(const [x,z]of[[-5.6,-.3],[5.5,-2.3],[5.6,5.5]]){const light=new THREE.PointLight('#ffd69a',12,5,2);light.position.set(x,2.5,z);stage.add(light);}
  const contactCanvas=document.createElement('canvas');contactCanvas.width=contactCanvas.height=128;const cg=contactCanvas.getContext('2d'),gradient=cg.createRadialGradient(64,64,5,64,64,64);gradient.addColorStop(0,'rgba(26,20,12,.48)');gradient.addColorStop(.55,'rgba(26,20,12,.22)');gradient.addColorStop(1,'rgba(26,20,12,0)');cg.fillStyle=gradient;cg.fillRect(0,0,128,128);const contactTexture=new THREE.CanvasTexture(contactCanvas);ownedTextures.add(contactTexture);const contactMaterial=new THREE.MeshBasicMaterial({map:contactTexture,transparent:true,depthWrite:false,toneMapped:false});ownedMaterials.add(contactMaterial);const contactGeometry=new THREE.PlaneGeometry(1,1);contactGeometry.rotateX(-Math.PI/2);ownedGeometries.add(contactGeometry);const contacts=[...GAMES.map((_,i)=>[(i-1.5)*CABINET_STEP,CABINET_Z+.1,2.5,1.4]),[-.7,1.8,2.0,2.0],[.8,4.5,2,2],[-3.8,.3,3.8,1.5],[5.6,-.1,1,4.1],[2.35,3.05,1.5,1.5],[-5.35,.35,.9,.9],[5.25,-2.4,.9,.9]],contactMesh=new THREE.InstancedMesh(contactGeometry,contactMaterial,contacts.length),dummy=new THREE.Object3D();contacts.forEach(([x,z,w,d],i)=>{dummy.position.set(x,.104,z);dummy.scale.set(w,1,d);dummy.updateMatrix();contactMesh.setMatrixAt(i,dummy.matrix);});stage.add(contactMesh);
  applyIbl(stage,env,.65);
  await Promise.all([npc('PROFESSOR_OWLBERT',[-5.35,.1,.35],1.4,.25,'workshop'),npc('MAYOR_TORTELLINI',[5.25,.1,-2.4],1.35,-.35,'jobs'),npc('PIP_KESSEL',[2.35,.42,3.05],1.65,-.1,'atelier')]);
  if(disposed)return;loadingStatus.update({phase:'prepare',stage:'Beschriftungen und Licht vorbereiten …'});await document.fonts.ready;if(disposed)return;buildSigns();motionDepth.add(stage);theme();for(const texture of ownedTextures)renderer.initTexture(texture);ready=true;dirty=true;loadingStatus.finish();resize();
 }
 function resize(){if(!active||disposed)return;bakeCache.clear();const r=canvas.getBoundingClientRect();if(r.width<2||r.height<2)return;renderer.setPixelRatio(LOW_GPU?.6:Math.min(devicePixelRatio||1,1.5));renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();updateSigns();dirty=true;}
 function frame(now){if(!active||disposed)return;const dt=Math.min(.05,(now-(last||now))/1000);last=now;
  const portrait=compactView(),atelier=service==='atelier',place=places.find(p=>p.id===service),cabX=(focus-1.5)*CABINET_STEP;
  const subject=place?place.point.clone():new THREE.Vector3(cabX,1.85,CABINET_Z+.30);if(service==='workshop'){if(stationPage===UPGRADES.length)subject.set(-.825,1.45,-.65);else subject.x+=(stationPage-1.5)*.65+.25;}if(service==='jobs'&&(portrait||jobRead>=0))subject.z+=(stationPage-1)*1.02;
  if(overview){if(portrait){wanted.copy(places[roomIndex].point);if(roomIndex===0)wanted.x-=.65;else if(roomIndex===1)wanted.z=-1.4;}else wanted.set(0,1.1,-3.4);}else wanted.copy(subject).add(new THREE.Vector3(atelier&&portrait?.3:0,portrait?.15:0,0));
  let desiredFov=33;let desiredYaw=service==='jobs'||overview&&portrait&&roomIndex===1?-Math.PI/2:0;let desiredDistance=overview?(portrait?(roomIndex===1?10.5:roomIndex===2?9.2:8.5):17.8):service?(service==='workshop'&&stationPage===UPGRADES.length?(canvas.clientHeight<480?3.9:portrait?8.0:6.5):service==='jobs'&&jobRead>=0?(canvas.clientHeight<480?2.5:3.4):portrait?(atelier?10.2:service==='jobs'?5.9:10.2):service==='jobs'?7.5:service==='workshop'&&canvas.clientHeight<480?3.9:8.0):portrait?7.1:6.5,desiredElevation=overview?(portrait?1.3:1.6):service==='jobs'&&jobRead>=0?.35:portrait?1.1:.8;
  if(compactView()){
   if(!service&&!overview){wanted.set(cabX,1.68,CABINET_Z+.3);desiredDistance=5;desiredFov=fittedFov(2.9,3.9,5);desiredElevation=1.1;desiredYaw=0;}
   else if(overview&&!service){const p=places[roomIndex];wanted.set(roomIndex===1?4.8:p.point.x+(roomIndex===0?-.45:.2),1.3,roomIndex===1?-.95:p.point.z+.4);desiredDistance=5;desiredFov=fittedFov(3.4,3.1,5);desiredElevation=.4;desiredYaw=roomIndex===1?-Math.PI/2:0;}
   else if(service==='workshop'&&stationPage===UPGRADES.length){const frame=stationFrame();wanted.set(frame.x,1.6,frame.z);desiredDistance=5;desiredFov=fittedFov(3.1,3.3,5);desiredElevation=.15;desiredYaw=0;}
   else if(service==='workshop'&&stationPage<UPGRADES.length||service==='jobs'||service==='atelier'){const frame=stationFrame();wanted.set(frame.x,service==='jobs'?1.4:1.3,frame.z+(service==='jobs'?.45:0));desiredDistance=5;desiredFov=fittedFov(service==='workshop'||service==='jobs'?3.7:3.0,service==='jobs'||service==='atelier'?2.8:2.6,5);desiredElevation=.15;desiredYaw=frame.yaw;}
  }
  const moving=Math.abs(camera.fov-desiredFov)>.01||Math.abs(cameraYaw-desiredYaw)>.001||target.distanceToSquared(wanted)>1e-7||Math.abs(cameraDistance-desiredDistance)>.001||Math.abs(cameraElevation-desiredElevation)>.001;cameraMotion=moving;if(moving)target.lerp(wanted,motionMedia.matches?1:1-Math.exp(-dt*12));else target.copy(wanted);
  const ease=motionMedia.matches?1:1-Math.exp(-dt*12);cameraDistance+=(desiredDistance-cameraDistance)*ease;cameraElevation+=(desiredElevation-cameraElevation)*ease;cameraYaw+=(desiredYaw-cameraYaw)*ease;camera.fov+=(desiredFov-camera.fov)*ease;camera.updateProjectionMatrix();
  camera.position.set(target.x+Math.sin(cameraYaw)*cameraDistance+(overview&&!portrait?0:.1)*Math.cos(cameraYaw),target.y+cameraElevation,target.z+Math.cos(cameraYaw)*cameraDistance-.1*Math.sin(cameraYaw));camera.lookAt(target);camera.updateMatrixWorld();
  if(service==='workshop'||service==='jobs')signs.updateFooters(camera,canvas);
  if(moving)dirty=true;

  for(const actor of actors){actor.wrapper.visible=!(atelier&&actor.place==='atelier');actor.mixer.update(motionMedia.matches?0:dt);}if(formActor){formActor.scene.rotation.y=formYaw;formActor.mixer.update(motionMedia.matches?0:dt);}

  if(ready){scene.background=null;if(moving){baker.quad.visible=false;motionDepth.setEnabled(true);try{renderer.render(stage,camera);}finally{motionDepth.setEnabled(false);}const clear=renderer.autoClear;renderer.autoClear=false;renderer.render(scene,camera);renderer.autoClear=clear;dirty=true;}else{if(dirty){bakeCache.bake(renderer,stage,camera,LOW_GPU?1:1.5);dirty=false;}baker.quad.visible=true;renderer.render(scene,camera);}}raf=requestAnimationFrame(frame);
 }
 function setFocus(index){if(service)closeService();overview=false;host.classList.remove('is-overview');focus=(index+GAMES.length)%GAMES.length;renderPanel();updateSigns();dirty=true;}
 function hitAt(e){const sign=signs.hit(e,camera,canvas),r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,camera);if(sign){const blockers=[];for(const root of[stage,...actors.filter(a=>a.wrapper.visible).map(a=>a.wrapper)])root.traverseVisible(n=>{if(!n.isMesh||n.userData.hubDepthOnly)return;const material=Array.isArray(n.material)?n.material:[n.material];if(material.some(m=>m.visible&&!m.transparent&&m.depthWrite))blockers.push(n);});const front=ray.intersectObjects(blockers,false)[0];if(!front||front.distance>=sign.hitDistance-.02)return {sign};}const roots=[...interactives.filter(x=>x.root.visible).map(x=>x.root),...cabinets.map(c=>c.scene)],hit=ray.intersectObjects(roots,true)[0];if(!hit)return null;const place=interactives.find(x=>x.root.getObjectById(hit.object.id));if(place)return place;const index=cabinets.findIndex(c=>c.scene.getObjectById(hit.object.id));return index>=0?{index}:null;}
 const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),contacts=new Set();let multiTouch=false;
 canvas.addEventListener('pointerdown',e=>{contacts.add(e.pointerId);if(contacts.size>1){multiTouch=true;drag=null;signs.press(null);return;}if(multiTouch)return;const hit=hitAt(e);drag={pointerId:e.pointerId,x:e.clientX,y:e.clientY,lastY:e.clientY,yaw:formYaw,hit,scrolled:false};signs.press(hit?.sign);try{canvas.setPointerCapture(e.pointerId);}catch{/* synthetic or already released pointer */}});
 canvas.addEventListener('pointermove',e=>{
  if(multiTouch)return;if(drag){if(e.pointerId!==drag.pointerId)return;const dy=e.clientY-drag.lastY;drag.lastY=e.clientY;if(drag.hit?.sign?.scrollMax>0&&Math.abs(e.clientY-drag.y)>8){signs.scroll(drag.hit.sign,-dy,camera,canvas);drag.scrolled=true;}
   else if(service==='atelier'&&!drag.hit?.sign)formYaw=drag.yaw+(e.clientX-drag.x)*.012;
  }else{const hit=hitAt(e);signs.hover(hit?.sign);canvas.style.cursor=hit?'pointer':'grab';}
 });
 function swipePage(step){
  if(overview&&!service){roomIndex=(roomIndex+step+places.length)%places.length;updateSigns();}
  else if(service==='workshop'){if(stationPage===UPGRADES.length){if(step>0)ringFocus=Math.min(TOURNAMENT_RINGS.length-1,ringFocus+1);else if(ringFocus>0)ringFocus--;else stationPage--;}else stationPage=Math.max(0,Math.min(UPGRADES.length,stationPage+step));updateSigns();}
  else if(service==='jobs'){stationPage=Math.max(0,Math.min(jobs().length-1,stationPage+step));jobRead=stationPage;updateSigns();}
  else if(service==='atelier')loadForm(Math.max(0,Math.min(FORMS.length-1,formIndex+step)));
  else if(!service)setFocus(focus+step);
 }
 canvas.addEventListener('pointerup',e=>{contacts.delete(e.pointerId);if(multiTouch){if(!contacts.size)multiTouch=false;drag=null;signs.press(null);return;}if(!drag||e.pointerId!==drag.pointerId)return;const gesture=drag,dx=e.clientX-drag.x,dy=e.clientY-drag.y;signs.press(null);drag=null;
  if(gesture.scrolled)return;
  if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)&&service!=='atelier'){swipePage(-Math.sign(dx));return;}
  if(service==='atelier'&&Math.abs(dy)>45&&Math.abs(dy)>Math.abs(dx)){swipePage(-Math.sign(dy));return;}
  if(Math.hypot(dx,dy)>8)return;
  const hit=gesture.hit;if(hit?.sign){if(!hit.sign.options.disabled)hit.sign.options.run?.(hit.sign.hitUv);return;}if(hit?.run){hit.run();dirty=true;return;}if(hit?.place){openService(hit.place);return;}if(hit?.index!==undefined){if(hit.index===focus&&!overview)onPlay(GAMES[hit.index].id);else setFocus(hit.index);}
 });
 canvas.addEventListener('wheel',e=>{const hit=hitAt(e);if(hit?.sign?.scrollMax>0){signs.scroll(hit.sign,e.deltaY,camera,canvas);e.preventDefault();}},{passive:false});
 canvas.addEventListener('pointercancel',e=>{contacts.delete(e.pointerId);multiTouch=contacts.size>0;signs.press(null);drag=null;});
 host.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.gameFocus!==undefined){setFocus(Number(b.dataset.gameFocus));return;}
  if(b.classList.contains('fw-canteen__close')){closeService();return;}
  if(b.dataset.ring){selectTournamentRing(b.dataset.ring);return;}if(b.dataset.buy){purchaseUpgrade(b.dataset.buy);return;}if(b.dataset.job){const j=jobs().find(x=>x.id===b.dataset.job);j.active?claimJob(j.id):acceptJob(j.id);return;}if(b.dataset.form!==undefined){loadForm(Number(b.dataset.form));return;}
  const action=b.dataset.hub;if(action==='prev')setFocus(focus-1);else if(action==='next')setFocus(focus+1);else if(action==='play')onPlay(GAMES[focus].id);else if(action==='overview'){if(service)closeService();overview=!overview;host.classList.toggle('is-overview',overview);updateSigns();dirty=true;}else if(['workshop','jobs','atelier','save'].includes(action))openService(action);
  else if(action==='export'){const code=exportCode();body.querySelector('textarea').value=code;try{await navigator.clipboard.writeText(code);body.querySelector('[data-save-status]').textContent='Code kopiert.';}catch{body.querySelector('[data-save-status]').textContent='Dein Code ist bereit zum Kopieren.';}}
  else if(action==='reload'){location.reload();}
  else if(action==='import'){const code=body.querySelector('textarea').value;try{importCode(code);body.querySelector('[data-save-status]').textContent='Spielstand geladen.';}catch(error){body.querySelector('[data-save-status]').textContent=error.message;}}
 });
 host.addEventListener('focusin',e=>{let sign=null;const b=e.target.closest('button');if(!b)return;if(b.dataset.buy){stationPage=UPGRADES.findIndex(x=>x.key===b.dataset.buy);updateSigns();sign=workshopSigns[stationPage];}else if(b.dataset.job){stationPage=jobs().findIndex(x=>x.id===b.dataset.job);jobRead=stationPage;updateSigns();sign=jobSigns[stationPage];}else if(b.dataset.form!==undefined)sign=formSigns[Number(b.dataset.form)];else if(b.dataset.ring){stationPage=UPGRADES.length;updateSigns();sign=ringSigns[TOURNAMENT_RINGS.findIndex(r=>r.id===b.dataset.ring)];}else if(b.dataset.hub==='play')sign=cabinetSigns[focus]?.play;else if(b.dataset.hub==='overview')sign=cabinetSigns[focus]?.room;else if(b.dataset.hub==='save')sign=cabinetSigns[focus]?.save;else if(b.classList.contains('fw-canteen__close'))sign=stationBack;else if(b.dataset.hub)sign=placeSigns[places.findIndex(p=>p.id===b.dataset.hub)];signs.hover(sign);});
 dialog.addEventListener('cancel',e=>{e.preventDefault();closeService();});
 const onKey=e=>{if(!active)return;if(e.key==='Escape'&&service){if(service==='jobs'&&jobRead>=0&&!compactView()){jobRead=-1;updateSigns();return;}closeService();return;}if(e.target.closest?.('input,textarea,select'))return;if(service){if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&service!=='save'){swipePage(e.key==='ArrowRight'?1:-1);e.preventDefault();}return;}if(e.key==='Escape'&&overview){overview=false;host.classList.remove('is-overview');updateSigns();dirty=true;return;}if(e.key==='ArrowLeft'){swipePage(-1);e.preventDefault();}else if(e.key==='ArrowRight'){swipePage(1);e.preventDefault();}else if(e.key==='Enter'&&!e.target.closest?.('button,a')){if(overview)openService(places[roomIndex].id);else onPlay(GAMES[focus].id);}};window.addEventListener('keydown',onKey);
 const unsubscribe=onChange(()=>{bakeCache.clear();renderPanel();if(service==='workshop'||service==='jobs')serviceBody();updateSigns();});const observer=new ResizeObserver(resize);observer.observe(canvas);
 theme();renderPanel();const prepared=prepare().catch(error=>{if(disposed)return;console.error('[canteen]',error);loadingStatus.fail(error.code==='ASSET_VERSION_MISMATCH'?'Das Spiel wurde aktualisiert. Lade die Seite neu.':'Die Kantine konnte nicht geladen werden. Lade die Seite erneut.');const reload=document.createElement('button');reload.dataset.hub='reload';reload.textContent='Seite neu laden';loading.querySelector('.gm-scene-loading__body').append(reload);throw error;});prepared.catch(()=>{});
 return {activate(){if(active)return;active=true;resize();last=0;raf=requestAnimationFrame(frame);},deactivate(){active=false;cancelAnimationFrame(raf);contacts.clear();multiTouch=false;drag=null;signs.press(null);if(service)closeService();},get focus(){return GAMES[focus].id;},get ready(){return prepared;},boxes:cabinets,destroy(){loadingStatus.finish();disposed=true;if(window.__hubView===diagnostics)delete window.__hubView;active=false;cancelAnimationFrame(raf);++formRequest;releaseForm();observer.disconnect();themeObserver.disconnect();themeMedia.removeEventListener('change',theme);unsubscribe();window.removeEventListener('keydown',onKey);for(const a of actors){a.mixer.stopAllAction();a.mixer.uncacheRoot(a.scene);}motionDepth.release();library.dispose();for(const m of stageMeshes){m.geometry.dispose();m.material.dispose();}for(const world of [stage,scene])world.traverse(n=>n.shadow?.map?.dispose());for(const m of ownedMaterials)m.dispose();for(const t of ownedTextures)t.dispose();for(const g of ownedGeometries)g.dispose();signs.destroy();bakeCache.clear();baker.dispose();env.dispose?.();renderer.dispose();}};
}
