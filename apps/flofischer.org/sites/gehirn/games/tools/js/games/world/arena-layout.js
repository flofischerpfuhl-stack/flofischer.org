/** Arena art layout. All gameplay ground remains flat and traversable. */
export const PLAZA_RADIUS=3.75;
export const BIOMES=Object.freeze([
 {name:'Viridis · Klostergarten',path:'153,125,85',stone:0xe8e1cf,shade:'54,103,39',light:'164,190,97',plants:['meadow_grass_short','meadow_clover','meadow_fern_rosette','meadow_daisy'],edge:['woodland_bush_flowering','woodland_oak_old','fw_granite_moss'],tint:0xffffff},
 {name:'Sahrun · Oasengarten',path:'188,146,91',stone:0xf2d7ac,shade:'156,108,55',light:'249,224,172',plants:['meadow_grass_short','meadow_clover','meadow_fern_rosette','meadow_reed'],edge:['woodland_bush_hazel','woodland_palm_sahrun','fw_sandstone_bedded'],tint:0xe1e2bd},
 {name:'Hibern · Wintergarten',path:'155,187,209',stone:0xe6eef2,shade:'136,169,192',light:'242,249,255',plants:['meadow_moss','meadow_clover','meadow_fern_fiddleheads','meadow_daisy'],edge:['fw_snow_wind_drift','woodland_spruce_tiered','fw_ice_crystal_cluster'],tint:0xbacbd2},
 {name:'Vulkara · Aschengarten',path:'110,92,88',stone:0xa7a1a9,shade:'35,35,43',light:'131,116,105',plants:['meadow_grass_short','meadow_leaf_litter','meadow_fern_rosette','meadow_moss'],edge:['woodland_fallen_log','fw_basalt_columns','fw_lava_fissure'],tint:0xb9a68d},
]);
export function ringRadius(angle,R){return R*.48+Math.sin(angle*3+.4)*.32;}
export function pathDistance(x,z,R){
 const r=Math.hypot(x,z),angle=Math.atan2(z,x);let distance=Math.abs(r-ringRadius(angle,R));
 for(let k=0;k<4;k++){const a=.36+k*Math.PI/2,u=x*Math.cos(a)+z*Math.sin(a),v=-x*Math.sin(a)+z*Math.cos(a);if(u>2.8&&u<R+3)distance=Math.min(distance,Math.abs(v-Math.sin(u*.28+k)*.33));}
 return distance;
}
export function gardenCenters(R){
 const out=[];for(const [radius,n,offset]of [[6.4,4,.97],[R*.74,8,.69]])for(let k=0;k<n;k++){const a=offset+k/n*Math.PI*2;let x=Math.cos(a)*radius,z=Math.sin(a)*radius;if(pathDistance(x,z,R)<1.75){x=Math.cos(a+.15)*radius;z=Math.sin(a+.15)*radius;}out.push({x,z,radius:radius<8?2.0:2.35});}return out;
}
