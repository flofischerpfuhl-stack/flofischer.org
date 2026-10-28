/** Shape a built stone surface without changing its authored triangulation,
 * colours or normals away from the deliberate plaza/stepping-stone boundary. */
import {THREE} from '../three-kit.js';
export function clipStoneSurface(geometry,matrix,{x=0,z=0,radius,sides=32}){
 const P=geometry.attributes.position,N=geometry.attributes.normal,C=geometry.attributes.color,index=geometry.index,normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix),point=new THREE.Vector3(),normal=new THREE.Vector3(),vertices=[],positions=[],normals=[],colours=[];
 for(let i=0;i<P.count;i++){point.fromBufferAttribute(P,i).applyMatrix4(matrix);normal.fromBufferAttribute(N,i).applyMatrix3(normalMatrix).normalize();vertices.push([point.x,point.y,point.z,normal.x,normal.y,normal.z,C.getX(i),C.getY(i),C.getZ(i)]);}
 const innerRadius=radius*Math.cos(Math.PI/sides),inner2=innerRadius*innerRadius;
 const emit=v=>{positions.push(v[0],v[1],v[2]);normals.push(v[3],v[4],v[5]);colours.push(v[6],v[7],v[8]);};
 const count=index?index.count:P.count;
 for(let t=0;t<count;t+=3){let polygon=[vertices[index?index.getX(t):t],vertices[index?index.getX(t+1):t+1],vertices[index?index.getX(t+2):t+2]];
  if(polygon.every(v=>(v[0]-x)**2+(v[2]-z)**2<=inner2)){for(const v of polygon)emit(v);continue;}
  if(polygon.every(v=>v[0]>x+radius)||polygon.every(v=>v[0]<x-radius)||polygon.every(v=>v[2]>z+radius)||polygon.every(v=>v[2]<z-radius))continue;
  for(let side=0;side<sides&&polygon.length;side++){
   const angle=side/sides*Math.PI*2,nx=Math.cos(angle),nz=Math.sin(angle),limit=radius*Math.cos(Math.PI/sides),out=[];let a=polygon.at(-1),da=(a[0]-x)*nx+(a[2]-z)*nz-limit;
   for(const b of polygon){const db=(b[0]-x)*nx+(b[2]-z)*nz-limit;if((da<=0)!==(db<=0)){const f=da/(da-db);out.push(a.map((value,i)=>value+(b[i]-value)*f));}if(db<=0)out.push(b);a=b;da=db;}polygon=out;
  }
  for(let k=1;k+1<polygon.length;k++)for(const v of [polygon[0],polygon[k],polygon[k+1]])emit(v);
 }
 const clipped=new THREE.BufferGeometry();clipped.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));clipped.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));clipped.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));clipped.normalizeNormals();return clipped;
}
