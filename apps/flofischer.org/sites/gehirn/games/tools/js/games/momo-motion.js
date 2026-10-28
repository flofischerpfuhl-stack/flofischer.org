/** Arena presentation only. Simulation aim, hit timing and movement stay authoritative. */
const TAU=Math.PI*2;
export const wrappedAngle=a=>((a+Math.PI)%TAU+TAU)%TAU-Math.PI;
export function followHeading(current,target,dt,rate=7){return current+Math.max(-rate*dt,Math.min(rate*dt,wrappedAngle(target-current)));}
// One complete left/right contact cycle per travelled stride, never world time.
export const STRIDE_METRES=Object.freeze({GLIMMO:1.65,COALBEAR:2.1,EMBERWARD:2.6,MOSSEL:1.45,MOORGRIM:1.9,GROVEPRINCE:2.4,PLASHLING:1.45,SPRAYCOUNT:1.85,TIDEDUKE:2.35,GUSTGLIDER:2.6});
export function strideTime(model,distance,duration,scale=1){return distance/(STRIDE_METRES[model]*scale)*duration;}
export function releaseTime(model,slot){return slot==='wrench'?.4:slot==='mines'?(model==='MOSSEL'||model==='MOORGRIM'||model==='GROVEPRINCE'?.6:.54):.475;}
export function castClip(slot){return slot==='wrench'?'Attack_Sweep':slot==='mines'?'GroundPulse':'Attack_Cast';}
// Upper-body casts keep planted and travelling paws on their base contact cycle.
export const castTrack=name=>! /^(?:root|pelvis|hips|fore_|hind_|upperleg|lowerleg|foot|toes)/i.test(name.split('.')[0]);
export const FREED_RECOIL=.28,FREED_BREAK=.65,FREED_ESCAPE=1.6;
