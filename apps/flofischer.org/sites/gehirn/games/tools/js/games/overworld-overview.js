import {THREE as T} from './three-kit.js';

/** Fit the playable route, rather than distant decorative landscape bounds,
 * into the usable overview area. All values remain actual world coordinates. */
export function fitRouteOverview({camera,points,target,width,height,unit,span}){
  const right=new T.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new T.Vector3(0,1,0).applyQuaternion(camera.quaternion);
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const p of points)for(const x of[-1,1])for(const y of[0,1.8])for(const z of[-1,1]){
    const q=p.clone().add(new T.Vector3(x,y,z).multiplyScalar(unit)).sub(target),rx=q.dot(right),uy=q.dot(up);
    minX=Math.min(minX,rx);maxX=Math.max(maxX,rx);minY=Math.min(minY,uy);maxY=Math.max(maxY,uy);
  }
  const left=28,rightEdge=width-28,top=height<=400?76:110,bottom=height-(height>400?48:20);
  const viewHeight=Math.max((maxX-minX)*height/(rightEdge-left),(maxY-minY)*height/(bottom-top));
  const rx=(minX+maxX)/2,uy=(minY+maxY)/2-(height/2-(top+bottom)/2)*viewHeight/height;
  const determinant=right.x*up.z-right.z*up.x;
  return{zoom:viewHeight/span,panX:(rx*up.z-right.z*uy)/determinant/unit,panZ:(right.x*uy-rx*up.x)/determinant/unit};
}

/** Lift only overlapping overview plaques. Sorting bottom-to-top preserves
 * the route's screen ordering and gives each moved plaque a vertical tether. */
export function separateBadgeCenters(points,diameter){
  const result=points.map(p=>({...p})),placed=[],gap=diameter+3;
  for(const index of points.map((_,i)=>i).sort((a,b)=>points[b].y-points[a].y||a-b)){
    const p=result[index];
    for(const q of placed.toSorted((a,b)=>b.y-a.y)){const dx=Math.abs(p.x-q.x);if(dx<gap){const dy=Math.sqrt(gap*gap-dx*dx);if(Math.abs(p.y-q.y)<dy)p.y=q.y-dy;}}
    placed.push(p);
  }
  return result;
}
