import {THREE as T} from './three-kit.js';
const geometryBlocks=new WeakMap();
const inverse=new T.Matrix4(),localRay=new T.Ray(),end=new T.Vector3(),entry=new T.Vector3();
const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),hit=new T.Vector3();
const fallback=new T.Raycaster();

/** A conservative segment/box test: boxes beyond the sign cannot obscure it. */
export function segmentIntersectsBox(ray,far,box){
  return box.containsPoint(ray.origin)||!!(ray.intersectBox(box,entry)&&entry.distanceToSquared(ray.origin)<=far*far);
}

function makeBlock(p,index,count,start){
  // Ordinary attributes can be read directly. Keep Three's getters for decoded
  // normalized/half-float values and interleaved attribute layouts.
  const direct=p.isBufferAttribute&&!p.normalized&&!p.isFloat16BufferAttribute,positions=p.array,stride=p.itemSize;
  // Merged environment geometry retains nearby source triangles consecutively.
  // Bounds are conservative even when a block crosses several original meshes.
  const finish=Math.min(count,start+384),limit=Math.min(count,finish+2);
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(let i=start;i<limit;i++){
    const vertex=index?index.getX(i):i,offset=vertex*stride;
    const x=direct?positions[offset]:p.getX(vertex),y=direct?positions[offset+1]:p.getY(vertex),z=direct?positions[offset+2]:p.getZ(vertex);
    minX=Math.min(minX,x);minY=Math.min(minY,y);minZ=Math.min(minZ,z);
    maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);maxZ=Math.max(maxZ,z);
  }
  const box=new T.Box3(new T.Vector3(minX,minY,minZ),new T.Vector3(maxX,maxY,maxZ));
  return{start,finish,box};
}

function blocksFor(geometry,stats){
  if(geometryBlocks.has(geometry))return geometryBlocks.get(geometry);
  const started=performance.now(),p=geometry.attributes.position,index=geometry.index,blocks=[];
  const count=index?index.count:p.count;
  for(let start=0;start<count;start+=384)blocks.push(makeBlock(p,index,count,start));
  geometryBlocks.set(geometry,blocks);if(stats){stats.buildMilliseconds+=performance.now()-started;stats.builds++;}return blocks;
}

/** Prepare complete cache entries in roughly 4 ms slices. The caller owns
 * scheduling/cancellation; unfinished entries never become query-visible. */
export function* prepareOcclusionGeometries(geometries,stats=null){
  let sliceStarted=null;
  for(const geometry of geometries){
    if(geometryBlocks.has(geometry))continue;
    if(sliceStarted===null)sliceStarted=performance.now();
    const p=geometry.attributes.position,index=geometry.index,count=index?index.count:p.count,blocks=[];
    for(let start=0;start<count;start+=384){
      const elapsed=performance.now()-sliceStarted;
      if(elapsed>=4){
        if(stats)stats.buildMilliseconds+=elapsed;
        yield;
        sliceStarted=performance.now();
        // A synchronous query (or another iterator) may have completed the
        // geometry while this iterator was suspended. Keep that complete entry.
        if(geometryBlocks.has(geometry))break;
      }
      blocks.push(makeBlock(p,index,count,start));
    }
    if(!geometryBlocks.has(geometry)){
      geometryBlocks.set(geometry,blocks);
      if(stats)stats.builds++;
    }
  }
  if(stats&&sliceStarted!==null)stats.buildMilliseconds+=performance.now()-sliceStarted;
}

/** Exact triangle occlusion, accelerated by cached local blocks. No triangle or
 * material is removed from the scene; this changes only the placement query. */
export function blocksSight(mesh,worldRay,far,stats){
  const geometry=mesh.geometry;
  if(mesh.isInstancedMesh||mesh.isSkinnedMesh||mesh.morphTargetInfluences){
    fallback.ray.copy(worldRay);fallback.near=0;fallback.far=far;
    return fallback.intersectObject(mesh,false).length>0;
  }
  inverse.copy(mesh.matrixWorld).invert();localRay.copy(worldRay).applyMatrix4(inverse);
  end.copy(worldRay.direction).multiplyScalar(far).add(worldRay.origin).applyMatrix4(inverse);
  const localFar=localRay.origin.distanceTo(end),maxDistance2=localFar*localFar;
  const p=geometry.attributes.position,index=geometry.index,materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const ranges=Array.isArray(mesh.material)?geometry.groups:[{start:0,count:index?index.count:p.count,materialIndex:0}];
  const draw=geometry.drawRange;
  for(const block of blocksFor(geometry,stats)){
    if(!segmentIntersectsBox(localRay,localFar,block.box))continue;
    for(const range of ranges){
      const material=materials[range.materialIndex];if(!material?.visible)continue;
      const rangeStart=Math.max(range.start,draw.start),rangeEnd=Math.min(range.start+range.count,draw.start+draw.count,index?index.count:p.count);
      // Three starts each draw/material range at its exact first index, even
      // when that offset is not a multiple of three. Blocks may split a triangle.
      const from=rangeStart+Math.ceil((Math.max(block.start,rangeStart)-rangeStart)/3)*3,to=Math.min(block.finish,rangeEnd);
      for(let i=from;i<to;i+=3){
        a.fromBufferAttribute(p,index?index.getX(i):i);b.fromBufferAttribute(p,index?index.getX(i+1):i+1);c.fromBufferAttribute(p,index?index.getX(i+2):i+2);
        const point=material.side===T.BackSide?localRay.intersectTriangle(c,b,a,true,hit):localRay.intersectTriangle(a,b,c,material.side!==T.DoubleSide,hit);
        if(point&&point.distanceToSquared(localRay.origin)<=maxDistance2)return true;
      }
    }
  }
  return false;
}

/** Nearest permitted terrain surface, in world coordinates. Rejected surfaces
 * do not hide later eligible hits (for example a walkway below a roof). */
export function nearestSurface(mesh,worldRay,far,{minNormalY=.55,accept=null,stats=null}={}){
  let nearest=null;
  const point=new T.Vector3(),normal=new T.Vector3(),normalMatrix=new T.Matrix3();
  const worldMatrix=new T.Matrix4(),instanceMatrix=new T.Matrix4();
  const permits=()=>normal.y>=minNormalY&&(!accept||accept(point,normal));
  // Preserve Three's posed geometry handling for deforming meshes.
  if(mesh.isSkinnedMesh||mesh.morphTargetInfluences){
    const caster=new T.Raycaster(worldRay.origin,worldRay.direction,0,far);
    for(const intersection of caster.intersectObject(mesh,false)){
      const material=Array.isArray(mesh.material)?mesh.material[intersection.face.materialIndex]:mesh.material;
      if(!material?.visible)continue;
      worldMatrix.copy(mesh.matrixWorld);
      if(intersection.instanceId!==undefined){mesh.getMatrixAt(intersection.instanceId,instanceMatrix);worldMatrix.multiply(instanceMatrix);}
      point.copy(intersection.point);normal.copy(intersection.face.normal).applyNormalMatrix(normalMatrix.getNormalMatrix(worldMatrix));
      if(permits())return{point:point.clone(),normal:normal.clone(),distance:intersection.distance};
    }
    return null;
  }
  const geometry=mesh.geometry,p=geometry.attributes.position,index=geometry.index,count=index?index.count:p.count;
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const ranges=Array.isArray(mesh.material)?geometry.groups:[{start:0,count,materialIndex:0}],draw=geometry.drawRange;
  const blocks=blocksFor(geometry,stats),matrixInverse=new T.Matrix4(),ray=new T.Ray(),endpoint=new T.Vector3();
  const va=new T.Vector3(),vb=new T.Vector3(),vc=new T.Vector3(),localHit=new T.Vector3(),edge=new T.Vector3();
  const instances=mesh.isInstancedMesh?mesh.count:1;
  for(let instance=0;instance<instances;instance++){
    worldMatrix.copy(mesh.matrixWorld);
    if(mesh.isInstancedMesh){mesh.getMatrixAt(instance,instanceMatrix);worldMatrix.multiply(instanceMatrix);}
    matrixInverse.copy(worldMatrix).invert();ray.copy(worldRay).applyMatrix4(matrixInverse);
    const limit=nearest?nearest.distance:far;
    let localFar=Number.isFinite(limit)?ray.origin.distanceTo(endpoint.copy(worldRay.direction).multiplyScalar(limit).add(worldRay.origin).applyMatrix4(matrixInverse)):Infinity;
    let maxDistance2=localFar*localFar;
    normalMatrix.getNormalMatrix(worldMatrix);
    for(const block of blocks){
      if(!segmentIntersectsBox(ray,localFar,block.box))continue;
      for(const range of ranges){
        const material=materials[range.materialIndex];if(!material?.visible)continue;
        const rangeStart=Math.max(range.start,draw.start),rangeEnd=Math.min(range.start+range.count,draw.start+draw.count,count);
        const from=rangeStart+Math.ceil((Math.max(block.start,rangeStart)-rangeStart)/3)*3,to=Math.min(block.finish,rangeEnd);
        for(let i=from;i<to;i+=3){
          va.fromBufferAttribute(p,index?index.getX(i):i);vb.fromBufferAttribute(p,index?index.getX(i+1):i+1);vc.fromBufferAttribute(p,index?index.getX(i+2):i+2);
          const found=material.side===T.BackSide?ray.intersectTriangle(vc,vb,va,true,localHit):ray.intersectTriangle(va,vb,vc,material.side!==T.DoubleSide,localHit);
          if(!found||found.distanceToSquared(ray.origin)>maxDistance2)continue;
          point.copy(found).applyMatrix4(worldMatrix);
          const distance=point.distanceTo(worldRay.origin);
          if(distance>far||(nearest&&distance>=nearest.distance))continue;
          normal.subVectors(vc,vb).cross(edge.subVectors(va,vb)).normalize().applyNormalMatrix(normalMatrix);
          if(permits()){
            nearest={point:point.clone(),normal:normal.clone(),distance};
            // Only an accepted surface bounds subsequent searches. A rejected
            // roof must not prevent finding the eligible platform below it.
            maxDistance2=found.distanceToSquared(ray.origin);localFar=Math.sqrt(maxDistance2);
          }
        }
      }
    }
  }
  return nearest;
}
