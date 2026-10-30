/** Arena presentation only. Simulation aim, hit timing and movement stay authoritative. */
import { PLAYER_SCALE } from './momo-scale.js';
const TAU=Math.PI*2;
export const wrappedAngle=a=>((a+Math.PI)%TAU+TAU)%TAU-Math.PI;
export function followHeading(current,target,dt,rate=7){return current+Math.max(-rate*dt,Math.min(rate*dt,wrappedAngle(target-current)));}
// One complete left/right contact cycle per travelled stride, never world time. The upright forms (momo-gait.js) plant each foot at exactly this cycle length.
// Stride per native model metre; times the display scale (momo-scale.js) it is the distance of one contact cycle.
const STRIDE_PER_SCALE=Object.freeze({GLIMMO:.9167,COALBEAR:2.4706,EMBERWARD:1.63,MOSSEL:.5472,MOORGRIM:1.8627,GROVEPRINCE:1.81,PLASHLING:.4028,SPRAYCOUNT:.84,TIDEDUKE:2.35,GUSTGLIDER:2.6});
export const STRIDE_NATIVE=STRIDE_PER_SCALE;
export const STRIDE_METRES=Object.freeze(Object.fromEntries(Object.entries(STRIDE_PER_SCALE).map(([id,k])=>[id,k*(PLAYER_SCALE[id]??1)])));
export function strideTime(model,distance,duration,scale=1){return distance/(STRIDE_METRES[model]*scale)*duration;}
export function releaseTime(model,slot){return slot==='wrench'?.4:slot==='mines'?(model==='MOSSEL'||model==='MOORGRIM'||model==='GROVEPRINCE'?.6:.54):.475;}
export function castClip(slot){return slot==='wrench'?'Attack_Sweep':slot==='mines'?'GroundPulse':'Attack_Cast';}
// Upper-body casts keep planted and travelling paws on their base contact cycle.
export const castTrack=name=>! /^(?:root|pelvis|hips|fore_|hind_|leg_|upperleg|lowerleg|foot|toes)/i.test(name.split('.')[0]);
export const FREED_RECOIL=.28,FREED_BREAK=.65,FREED_ESCAPE=1.6;
