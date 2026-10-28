/** Fernling-Arena: canonical starter lines, moves and temporary fossil ownership. */
export const NATURES=Object.freeze(['green','ember','tide','rock','wind','spark','frost','ore','chime','light','night','star']);
export const SLOTS=Object.freeze(['blaster','drones','wrench','zap','mines']);
const SHAPES=Object.freeze(['shot','orbit','arc','chain','trap']);
export const STARTERS=Object.freeze({
 glimmo:Object.freeze({id:'glimmo',label:'Glimmo',nature:'ember',models:Object.freeze(['GLIMMO','COALBEAR','EMBERWARD'])}),
 mossel:Object.freeze({id:'mossel',label:'Mossel',nature:'green',models:Object.freeze(['MOSSEL','MOORGRIM','GROVEPRINCE'])}),
 plashling:Object.freeze({id:'plashling',label:'Plashling',nature:'tide',models:Object.freeze(['PLASHLING','SPRAYCOUNT','TIDEDUKE'])}),
});
const MOVES=Object.freeze({
 ember:Object.freeze(['ember_shot','ember_ring','tail_flare','leaping_flame','cinder_traps']),
 green:Object.freeze(['seed_shot','leaf_ring','frond_boomerang','creeping_vines','spore_pods']),
 tide:Object.freeze(['bubble_shot','droplet_ring','return_wave','ripple_chain','geyser_pools']),
});
const COMBOS=Object.freeze({ember:Object.freeze(['firestorm','ember_crown']),green:Object.freeze(['seed_storm','leaf_crown']),tide:Object.freeze(['bubble_storm','pearl_crown'])});
export const TRAITS=Object.freeze({boots:'Quick Paws',magnet:'Keen Nose',armour:'Thick Hide',snacks:'Deep Rest',overclock:'Ruhiger Atem'});
export const COMBO_PARTNERS=Object.freeze({blaster:'overclock',drones:'magnet',wrench:'armour',zap:'boots',mines:'snacks'});
export const EVOLUTION_LEVELS=Object.freeze([5,10]);
export const CAPACITIES=Object.freeze({weapons:4,passives:4});
export function starter(id){return STARTERS[id]??STARTERS.glimmo;}
export function stageAtLevel(level){return level>=10?2:level>=5?1:0;}
export function ownMove(nature,slot){const i=SLOTS.indexOf(slot);if(i<0||!NATURES.includes(nature))throw Error('Invalid nature/slot');return MOVES[nature]?.[i]??`${nature}_${SHAPES[i]}`;}
export function moveEffect(weapon){const i=SLOTS.indexOf(weapon.id);return weapon.evo?(COMBOS[weapon.nature]?.[i]??ownMove(weapon.nature,weapon.id)):ownMove(weapon.nature,weapon.id);}
export function weaponKey(nature,slot){ownMove(nature,slot);return `${nature}:${slot}`;}
export function createRun(starterId='glimmo'){
 const chosen=starter(starterId);return{starter:chosen.id,nature:chosen.nature,stage:0,model:chosen.models[0],maxHp:100,hp:100,damageScale:1,fossil:null,weapons:[makeWeapon(chosen.nature,'blaster')]};
}
export function makeWeapon(nature,id,foreign=false){return{uid:weaponKey(nature,id),id,nature,natureIndex:NATURES.indexOf(nature),foreign,lv:1,evo:false,t:.3,phase:0};}
export function findWeapon(run,uid){return run.weapons.find(w=>w.uid===uid);}
export function addOwnMove(run,slot){
 const uid=weaponKey(run.nature,slot);if(findWeapon(run,uid))return false;
 if(run.weapons.length>=CAPACITIES.weapons)return false;
 run.weapons.push(makeWeapon(run.nature,slot));return true;
}
export function evolveToLevel(run,level){
 const target=stageAtLevel(level);if(target<=run.stage)return 0;
 const n=target-run.stage;run.stage=target;run.model=starter(run.starter).models[target];run.maxHp+=20*n;run.hp=Math.min(run.maxHp,run.hp+20*n);run.damageScale=1+.12*target;return n;
}
export function grantFossil(run,nature,slot){
 if(run.fossil||run.weapons.length>=CAPACITIES.weapons||nature===run.nature)return false;
 const weapon=makeWeapon(nature,slot,true);if(findWeapon(run,weapon.uid))return false;
 run.fossil=weapon.uid;run.weapons.push(weapon);return true;
}
// Independent deterministic stream: extra card generation must not perturb the
// existing arena/director RNG. 12% after level 3 is a proposed tuning value.
export function fossilOffer(run,{seed,level,offerIndex}){
 if(run.fossil||run.weapons.length>=CAPACITIES.weapons||level<3)return null;
 let n=(seed^Math.imul(offerIndex+1,0x9e3779b9)^0x46f05517)>>>0;
 const next=()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};
 if(next()>=.12)return null;
 const candidates=NATURES.filter(nature=>nature!==run.nature),nature=candidates[Math.floor(next()*candidates.length)],slot=SLOTS[Math.floor(next()*SLOTS.length)];
 return Object.freeze({type:'fossil',id:weaponKey(nature,slot),slot,nature,move:ownMove(nature,slot),label:`Fernstone · ${nature} · ${ownMove(nature,slot).replaceAll('_',' ')}`,temporary:true});
}
// All pooled damaging entities (shots, arcs, mines and chain segments) include
// these fields in their blank/reset definition and snapshot them at spawn.
export function clearAttackPayload(target){target.weaponUid='';target.move='';target.nature='';target.natureIndex=-1;target.foreign=false;target.combo=false;target.stage=0;target.damageScale=1;return target;}
export function stampAttackPayload(target,weapon,run){target.weaponUid=weapon.uid;target.move=moveEffect(weapon);target.nature=weapon.nature;target.natureIndex=weapon.natureIndex;target.foreign=weapon.foreign;target.combo=weapon.evo;target.stage=run.stage;target.damageScale=run.damageScale;return target;}

export const NATURE_COLORS=Object.freeze({green:'#83bc55',ember:'#ff8c45',tide:'#68cef0',rock:'#c7a277',wind:'#bce9e3',spark:'#ffe269',frost:'#aeddeb',ore:'#bd8551',chime:'#e4bf64',light:'#ffe199',night:'#8b88bd',star:'#c4acf2'});
export const moveName=weapon=>moveEffect(weapon).replaceAll('_',' ').replace(/\b[a-z]/g,c=>c.toUpperCase())+(weapon.evo&&!COMBOS[weapon.nature]?.[SLOTS.indexOf(weapon.id)]?' · Combo':'');
export const ENEMY_MODELS=Object.freeze([
 Object.freeze(['MOSSEL','GLIMMO','MOORGRIM','GROVEPRINCE','SPRAYCOUNT','COALBEAR','GUSTGLIDER']),
 Object.freeze(['MOSSEL','GLIMMO','MOORGRIM','GROVEPRINCE','SPRAYCOUNT','COALBEAR','GUSTGLIDER']),
 Object.freeze(['PLASHLING','GLIMMO','MOORGRIM','TIDEDUKE','SPRAYCOUNT','COALBEAR','GUSTGLIDER']),
 Object.freeze(['MOSSEL','GLIMMO','MOORGRIM','GROVEPRINCE','SPRAYCOUNT','EMBERWARD','GUSTGLIDER']),
]);
export const BOSS_MODELS=Object.freeze({tank:'THORN_GOLEM',drill:'MORWEN',walker:'VEIT_SORN',mothership:'SYNTHET'});
