/** Cabinet-only presentation refit. The shared authored geometry is never changed. */
export const cabinetHeight = y => y <= 1.1 ? y * 1.2 : y <= 1.6 ? 1.32 + (y - 1.1) * 3.2 : 2.92 + (y - 1.6) * 1.45;

export function fitCabinetHousing(source) {
 const geometry=source.clone(),positions=geometry.attributes.position;
 for(let i=0;i<positions.count;i++)positions.setXYZ(i,positions.getX(i)*3,cabinetHeight(positions.getY(i)),positions.getZ(i)*1.2);
 geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
 return geometry;
}

export function cabinetScreenCorners(surface) {
 return surface.cornerPositionsGltf.map(([x,y,z])=>[x*3,cabinetHeight(y),z*1.2+.006]);
}

/** Keep the physical marquee readable without changing the shared cabinet mesh. */
export function updateCabinetMarquee(cabinet, title, worldPerPixel = null) {
 const width=worldPerPixel?512:2048,fontSize=worldPerPixel?Math.round(15*worldPerPixel*512/1.956):95;
 const height=worldPerPixel?Math.ceil(fontSize*1.6):144,physicalHeight=worldPerPixel?1.956*height/width:.13775;
 const key=`${width}:${height}:${fontSize}:${title}`;if(cabinet.marqueeTextKey===key)return;cabinet.marqueeTextKey=key;
 const texture=cabinet.marquee.material.map,canvas=texture.image;if(canvas.width!==width||canvas.height!==height)texture.dispose();canvas.width=width;canvas.height=height;
 const g=canvas.getContext('2d');g.fillStyle='#244c37';g.fillRect(0,0,width,height);g.fillStyle='#edf4e9';g.font=`650 ${fontSize}px Geist, system-ui`;g.textAlign='center';g.textBaseline='middle';g.fillText(title,width/2,height/2,width*.96);
 const geometry=cabinet.marquee.geometry,positions=geometry.attributes.position;
 for(let i=0;i<positions.count;i++)positions.setY(i,Math.sign(positions.getY(i))*physicalHeight/2);
 positions.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();cabinet.marquee.material.map.needsUpdate=true;
}
