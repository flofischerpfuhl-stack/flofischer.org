/** Convert the artists' explicit absolute-TRS recipes to Three clips once.
 * Shared workshop/game runtime. Procedural gameplay aim remains controller-owned.
 */
import * as T from 'three';

const fields = {translation:{property:'position',width:3,Track:T.VectorKeyframeTrack},rotation:{property:'quaternion',width:4,Track:T.QuaternionKeyframeTrack},scale:{property:'scale',width:3,Track:T.VectorKeyframeTrack}};

function normalizedRecipe(recipe) {
  if(recipe.schema!=='fernworld.rigid-motion/1')return recipe;
  const clips={};
  for(const [name,clip]of Object.entries(recipe.clips)) {
    if(clip.interpolation!=='LINEAR_TRANSLATION_SCALE_QUATERNION_SLERP')throw new Error('Unsupported whole-TRS interpolation');
    const tracks=[];
    for(const [node,keys]of Object.entries(clip.tracks))for(const path of Object.keys(fields)) {
      tracks.push({node,path,times:keys.map(k=>k.time),values:keys.map(k=>k[path]),interpolation:'LINEAR'});
    }
    clips[name]={...clip,tracks,inPlace:recipe.travel?.in_place,controllerSpeed:name==='Travel'?recipe.travel?.controller_speed_units_per_second:undefined};
  }
  return{schema:'fernworld.rigid-motion.v1',quaternionOrder:'xyzw',asset:recipe.asset,restTRS:recipe.nodes,clips};
}

export function recipeClips(root, recipe) {
  recipe=normalizedRecipe(recipe);
  if (recipe.schema !== 'fernworld.rigid-motion.v1' || recipe.quaternionOrder !== 'xyzw') throw new Error('Unsupported motion recipe schema');
  const nodes = new Map();
  for (const [name, trs] of Object.entries(recipe.restTRS)) {
    const matches=[];root.traverse(o=>{if(o.name===name)matches.push(o)});
    if(matches.length!==1)throw new Error(`Ambiguous or missing recipe node ${name}`);
    // UUIDs change when AssetLibrary creates an actor. The unique authored name
    // survives cloning and lets one immutable clip work with every actor.
    if(!name||T.PropertyBinding.sanitizeNodeName(name)!==name)throw new Error(`Unbindable recipe node ${name}`);
    for(const [path,{width}]of Object.entries(fields))if(!Array.isArray(trs[path])||trs[path].length!==width||!trs[path].every(Number.isFinite))throw new Error(`Invalid rest transform ${name}`);
    nodes.set(name,matches[0]);
  }
  if(!nodes.size)throw new Error('No rest transforms');
  const result=[];
  for(const [name,recipeClip]of Object.entries(recipe.clips)) {
    const duration=recipeClip.duration;if(!(duration>0)||!Number.isFinite(duration))throw new Error(`Invalid duration ${name}`);
    const tracks=[],covered=new Set();
    for(const track of recipeClip.tracks) {
      const field=fields[track.path],node=nodes.get(track.node),key=track.node+'/'+track.path;
      if(!field||!node||covered.has(key))throw new Error(`Invalid/duplicate track ${key}`);
      const {times,values}=track;
      if(!times.length||times.length!==values.length||times.some((t,i)=>!Number.isFinite(t)||t<0||t>duration+1e-7||(i&&t<=times[i-1])))throw new Error(`Invalid key times ${key}`);
      if(values.some(v=>!Array.isArray(v)||v.length!==field.width||!v.every(Number.isFinite)))throw new Error(`Invalid key values ${key}`);
      if(track.path==='rotation'&&values.some(v=>Math.abs(Math.hypot(...v)-1)>1e-4))throw new Error(`Non-unit quaternion ${key}`);
      if(!['LINEAR','STEP'].includes(track.interpolation))throw new Error(`Unsupported interpolation ${key}`);
      tracks.push(new field.Track(node.name+'.'+field.property,times,values.flat(),track.interpolation==='STEP'?T.InterpolateDiscrete:T.InterpolateLinear));covered.add(key);
    }
    // Every clip defines every untouched channel, so a preceding recoil/disabled
    // pose cannot contaminate the next state when mixers change actions.
    for(const [nodeName,node]of nodes)for(const [path,field]of Object.entries(fields)) {
      if(covered.has(nodeName+'/'+path))continue;
      const value=recipe.restTRS[nodeName][path];
      tracks.push(new field.Track(node.name+'.'+field.property,[0,duration],[...value,...value]));
    }
    const clip=new T.AnimationClip(name,duration,tracks);clip.userData={loop:!!recipeClip.loop,inPlace:!!recipeClip.inPlace,controllerSpeed:recipeClip.controllerSpeed,sourceRecipe:recipe.asset};result.push(clip);
  }
  return result;
}
