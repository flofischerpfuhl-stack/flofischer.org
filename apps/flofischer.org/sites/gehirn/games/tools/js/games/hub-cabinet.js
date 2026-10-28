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
