import {THREE as T} from './three-kit.js';
import {blocksSight,segmentIntersectsBox,nearestSurface} from './overworld-occlusion.js';
const occluderCache=new WeakMap();
function staticOccluders(root,unit){
  if(occluderCache.has(root))return occluderCache.get(root);
  const records=[];
  root.traverseVisible(mesh=>{
    if(!mesh.isMesh||mesh.userData.owDepthOnly)return;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    if(!materials.some(m=>m?.visible))return;
    let box;
    if(mesh.isInstancedMesh){if(!mesh.boundingBox)mesh.computeBoundingBox();box=mesh.boundingBox.clone();}
    else{if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();box=mesh.geometry.boundingBox.clone();}
    // Authored wind motion is small; this conservative margin keeps its bounds
    // valid without rebuilding all landscape boxes for every stop or rotation.
    box.applyMatrix4(mesh.matrixWorld).expandByScalar(unit*.25);records.push({mesh,box});
  });
  occluderCache.set(root,records);return records;
}

/** Place real signposts beside the selected stop. They stay in world space when
 * the player rotates the map; only arrival or a viewport change places them again.
 * Prefer a clear foreground patch instead of drawing signs through scenery. */
export function* createWayfindingPlan({actions,selected,camera,width,height,unit,pixelsPerMetre=null,occluders,protectedActors=[],protectedLabels=[],protectedMeshes=[],fineOccluders=[],groundOccluders=[],groundFloors=[],groundPath=[],topInset=height<=400?76:110,bottomInset=height>400?48:20}) {
  const started=performance.now(),occlusion={buildMilliseconds:0,builds:0};
  const cameraRight=new T.Vector3(1,0,0).applyQuaternion(camera.quaternion);
  const cameraUp=new T.Vector3(0,1,0).applyQuaternion(camera.quaternion);
  const faceOffset=new T.Vector3(0,0,1).applyQuaternion(camera.quaternion).setY(0).normalize().multiplyScalar(.14*unit);
  const ray=new T.Raycaster(),scale=pixelsPerMetre??height/(camera.top-camera.bottom),margin=18;
  // Keep readable physical boards when the travel camera shows more ground.
  for(const a of actions)a.face.scale.set((a.action.starter?85:95)/scale,(a.action.starter?25:32)/scale,1);
  const project=p=>{const q=p.clone().project(camera);return{x:(q.x*.5+.5)*width,y:(-q.y*.5+.5)*height};};
  const records=occluders.flatMap(root=>staticOccluders(root,unit));
  const groundRecords=[...groundOccluders.flatMap(root=>staticOccluders(root,unit)),...groundFloors.flatMap(root=>staticOccluders(root,unit).map(r=>({...r,floor:true})))];
  const cacheMilliseconds=performance.now()-started,reservedStarted=performance.now();
  const reserved=[...actions.filter(a=>a.action.starter).map(a=>a.face),...protectedLabels].map(face=>{
    const p=project(face.getWorldPosition(new T.Vector3()));return{x:p.x-face.scale.x*scale/2,y:p.y-face.scale.y*scale/2,w:face.scale.x*scale,h:face.scale.y*scale};
  });
  function projectedBox(box){
    const points=[];
    for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])points.push(project(new T.Vector3(x,y,z)));
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
  }
  for(const actor of protectedActors)reserved.push(projectedBox(new T.Box3().setFromObject(actor)));
  // A narrow level arch can lie between text samples. Reserve each physical
  // component's projected volume, not the huge box around all instances.
  for(const mesh of protectedMeshes){
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
    const matrix=new T.Matrix4();
    for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++){
      if(mesh.isInstancedMesh){mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);}else matrix.copy(mesh.matrixWorld);
      reserved.push(projectedBox(mesh.geometry.boundingBox.clone().applyMatrix4(matrix)));
    }
  }
  const reservedMilliseconds=performance.now()-reservedStarted;let rayMilliseconds=0;
  const groups=[
    {side:0,items:actions.filter(a=>a.action.play)},
    ...(height<=400||width<=480?actions.filter(a=>a.action.overview||a.action.sound).map((a,i)=>({side:-1,items:[a],order:i})):[{side:-1,items:actions.filter(a=>a.action.overview||a.action.sound)}]),
    ...actions.filter(a=>a.action.region!==undefined).map((a,i)=>({side:1,items:[a],order:i})),
  ].filter(g=>g.items.length).map(group=>{
    const ordered=group.items.toSorted((a,b)=>Number(!!a.action.sound)-Number(!!b.action.sound)||Number(b.action.region??0)-Number(a.action.region??0));
    const boardW=ordered[0].face.scale.x*scale,boardH=ordered[0].face.scale.y*scale,step=(boardH+6)/(scale*cameraUp.y);
    const initial=project(selected.clone().addScaledVector(cameraRight,1.65*unit).add(new T.Vector3(0,.55*unit,0)));
    return{...group,ordered,boardW,boardH,step,preferredX:group.side===0?initial.x:width*(group.side<0?.2:.8),preferredY:group.side===0?initial.y:height*(height>400?.4:.6)+(group.order||0)*(boardH+6)};
  });
  const fineBounds=[];
  for(const mesh of fineOccluders){
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();const matrix=new T.Matrix4();
    for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++){
      if(mesh.isInstancedMesh){mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);}else matrix.copy(mesh.matrixWorld);
      const box=mesh.geometry.boundingBox.clone().applyMatrix4(matrix),proxy=new T.Mesh(mesh.geometry,mesh.material);proxy.matrixAutoUpdate=false;proxy.matrixWorld.copy(matrix);fineBounds.push({mesh:proxy,box,rect:projectedBox(box)});
    }
  }
  const clearanceCache=new Map(),supportCache=new Map(),counts=groups.map(()=>0);let branches=0,groundMilliseconds=0;const rejection={ground:0,terrain:0,arch:0,clear:0};
  const acceptGround=point=>{
    // A sign may stand on the broad floor beside a route. Its local floor
    // height must match the nearby route; an absolute distance cutoff rejected
    // perfectly usable ground at the edge of a landscape phone view.
    let nearest=Infinity;
    for(const p of groundPath)nearest=Math.min(nearest,(p.x-point.x)**2+(p.z-point.z)**2);
    return groundPath.some(p=>(p.x-point.x)**2+(p.z-point.z)**2<=nearest+(2*unit)**2&&Math.abs(p.y-point.y)<=.45*unit);
  };
  function candidatesFor(group,occupied){
    const {ordered,boardW,boardH,step,preferredX,preferredY}=group;
    const stack=(ordered.length-1)*(boardH+6),loX=margin+boardW/2,hiX=width-margin-boardW/2;
    const loY=topInset+boardH/2+stack,hiY=height-bottomInset-boardH/2;
    const xs=new Set([loX,hiX,T.MathUtils.clamp(preferredX,loX,hiX)]);
    for(const r of occupied)for(const x of[r.x-boardW/2-6.1,r.x+r.w+boardW/2+6.1])if(x>=loX&&x<=hiX)xs.add(x);
    // Include cell interiors, not only obstacle edges: a tree can cover both
    // interval ends while its middle stays clear. Backtracking then has genuinely
    // different physical choices instead of revisiting the same boundary grid.
    const edges=[...xs].sort((a,b)=>a-b);for(let i=1;i<edges.length;i++)if(edges[i]-edges[i-1]>4)xs.add((edges[i]+edges[i-1])/2);
    const candidates=[];
    if(loX<=hiX&&loY<=hiY)for(const x of xs){
      let intervals=[[loY,hiY]];
      for(const r of occupied){
        if(x+boardW/2<=r.x-6||x-boardW/2>=r.x+r.w+6)continue;
        const from=r.y-boardH/2-6.1,to=r.y+r.h+boardH/2+stack+6.1,next=[];
        for(const [lo,hi]of intervals){if(to<=lo||from>=hi)next.push([lo,hi]);else{if(from>lo)next.push([lo,from]);if(to<hi)next.push([to,hi]);}}
        intervals=next;
      }
      for(const [lo,hi]of intervals)for(const y of new Set([lo,hi,(lo+hi)/2,T.MathUtils.clamp(preferredY,lo,hi)]))for(const baseHeight of[group.side===0?.55:1.1,1.8,2.5]){
        const rects=ordered.map((a,i)=>({x:x-boardW/2,y:y-i*(boardH+6)-boardH/2,w:boardW,h:boardH}));
        const score=Math.abs(x-preferredX)*.4+Math.abs(y-preferredY)+(baseHeight-(group.side===0?.55:1.1))*30;
        candidates.push({screenX:x,screenY:y,rects,score,baseHeight,key:`${x.toFixed(3)}/${y.toFixed(3)}`});
      }
    }
    return candidates.sort((a,b)=>a.score-b.score);
  }
  function clear(group,candidate){
    const key=`${group.ordered.length}/${group.boardW}/${candidate.key}/${candidate.baseHeight}`;
    if(groundRecords.length){
      const supportKey=`${candidate.key}/${candidate.baseHeight}`,groundStarted=performance.now();
      let support=supportCache.get(supportKey);
      if(support===undefined){
        ray.setFromCamera(new T.Vector2(candidate.screenX/width*2-1,1-candidate.screenY/height*2),camera);
        const footRay=ray.ray.clone();footRay.origin.sub(faceOffset).y-=candidate.baseHeight*unit;
        support=null;let far=camera.far;
        for(const r of groundRecords){
          if(!r.mesh.visible||!segmentIntersectsBox(footRay,far,r.box))continue;
          const hit=nearestSurface(r.mesh,footRay,far,{minNormalY:.7,accept:r.floor?null:acceptGround,stats:occlusion});
          if(hit&&hit.distance<far){support=hit.point;far=hit.distance;}
        }
        supportCache.set(supportKey,support);
      }
      groundMilliseconds+=performance.now()-groundStarted;
      if(!support){rejection.ground++;return false;}
      candidate.position=support.clone();candidate.position.y+=.015*unit;
      candidate.centers=group.ordered.map((a,i)=>candidate.position.clone().add(faceOffset).add(new T.Vector3(0,candidate.baseHeight*unit+i*group.step,0)));
    }
    else{
      ray.setFromCamera(new T.Vector2(candidate.screenX/width*2-1,1-candidate.screenY/height*2),camera);
      const center=ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),-(selected.y+candidate.baseHeight*unit)),new T.Vector3());if(!center)return false;
      candidate.position=center.sub(faceOffset).add(new T.Vector3(0,-candidate.baseHeight*unit,0));
      candidate.centers=group.ordered.map((a,i)=>candidate.position.clone().add(faceOffset).add(new T.Vector3(0,candidate.baseHeight*unit+i*group.step,0)));
    }
    if(clearanceCache.has(key))return clearanceCache.get(key);
    const rayStarted=performance.now();let clear=true;
    sight:for(const [i,center]of candidate.centers.entries()){
      const face=group.ordered[i].face;
      // Both edges and the full text height must clear scenery and level arches.
      for(const x of[-.45,-.225,0,.225,.45])for(const y of[-.28,0,.28]){
        const point=center.clone().addScaledVector(cameraRight,face.scale.x*x).addScaledVector(cameraUp,face.scale.y*y);
        ray.setFromCamera(point.clone().project(camera),camera);ray.far=ray.ray.origin.distanceTo(point)-unit*.03;
        if(records.some(r=>r.mesh.visible&&segmentIntersectsBox(ray.ray,ray.far,r.box)&&blocksSight(r.mesh,ray.ray,ray.far,occlusion))){clear=false;rejection.terrain++;break sight;}
      }
    }
    // Narrow arch tubes and posts can fall between sparse text probes. Their
    // simple geometry gets a dense four-pixel text-band query at the real
    // depth; a post behind the board must not reserve foreground screen space.
    if(clear&&fineBounds.length){
      fine:for(const [i,center]of candidate.centers.entries()){
        const p=project(center),left=p.x-group.boardW*.45,right=p.x+group.boardW*.45,top=p.y-group.boardH*.28,bottom=p.y+group.boardH*.28;
        for(const r of fineBounds){
          const x0=Math.max(left,r.rect.x),x1=Math.min(right,r.rect.x+r.rect.w),y0=Math.max(top,r.rect.y),y1=Math.min(bottom,r.rect.y+r.rect.h);
          if(x0>x1||y0>y1)continue;
          const nx=Math.max(1,Math.ceil((x1-x0)/4)),ny=Math.max(1,Math.ceil((y1-y0)/4));
          for(let ix=0;ix<=nx;ix++)for(let iy=0;iy<=ny;iy++){
            const x=x0+(x1-x0)*ix/nx,y=y0+(y1-y0)*iy/ny;
            const point=center.clone().addScaledVector(cameraRight,(x-p.x)/scale).addScaledVector(cameraUp,(p.y-y)/scale);
            ray.setFromCamera(point.clone().project(camera),camera);ray.far=ray.ray.origin.distanceTo(point)-unit*.03;
            if(segmentIntersectsBox(ray.ray,ray.far,r.box)&&blocksSight(r.mesh,ray.ray,ray.far,occlusion)){clear=false;rejection.arch++;break fine;}
          }
        }
      }
    }
    rayMilliseconds+=performance.now()-rayStarted;if(clear)rejection.clear++;clearanceCache.set(key,clear);return clear;
  }
  // A few posts: try another clear physical position when the first choice
  // consumes the last space needed by a later post. This avoids greedy dead ends.
  function* plan(index,occupied){
    if(index===groups.length)return[];
    const group=groups[index],candidates=candidatesFor(group,occupied),seen=new Set();counts[index]=Math.max(counts[index],candidates.length);
    for(const candidate of candidates){
      if(seen.has(candidate.key))continue;
      const visible=clear(group,candidate);yield;
      if(!visible)continue;
      seen.add(candidate.key);branches++;
      const rest=yield* plan(index+1,[...occupied,...candidate.rects]);
      if(rest)return[{group,candidate},...rest];
    }
    return null;
  }
  const solution=yield* plan(0,reserved),posts=[];
  for(const [index,group]of groups.entries()){
    const best=solution?.[index]?.candidate;
    if(best){
      group.ordered.forEach((a,i)=>{a.root.position.copy(best.position);a.face.position.set(faceOffset.x,best.baseHeight*unit+i*group.step,faceOffset.z);a.root.children[0].visible=i===group.ordered.length-1;});
      const pole=group.ordered.at(-1).root.children[0],poleHeight=group.ordered.at(-1).face.position.y;
      pole.scale.y=poleHeight/(1.1*unit);pole.position.y=poleHeight/2;reserved.push(...best.rects);
    }
    posts.push({side:group.side,placed:!!best,blocked:best?0:null,candidates:counts[index]});
  }
  const finished=performance.now();
  return{posts,milliseconds:finished-started,startedAt:started,finishedAt:finished,cacheMilliseconds,reservedMilliseconds,rayMilliseconds,occluders:records.length,occlusion,branches,groundMilliseconds,rejection,reserved};
}

/** Synchronous runner for geometry/unit checks. The browser schedules the same
 * generator in small slices so a hard search never blocks touch input. */
export function placeWayfinding(options){
  const plan=createWayfindingPlan(options);let step;do{step=plan.next();}while(!step.done);return step.value;
}
