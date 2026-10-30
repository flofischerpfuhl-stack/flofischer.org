import { THREE as T } from '../three-kit.js';

/**
 * Where a perspective camera must stand, looking along a fixed direction (phi from straight up, theta around), for `points` to fill the
 * frame between the insets: iterates distance and the look point on the ground until the projected box fits.
 * Returns { look, distance }.
 */
export function perspectiveFit({ fov = 30, aspect, points, phi, theta, width, height, topInset = 0, bottomInset = 0, side = 20, iterations = 14 }) {
  const camera = new T.PerspectiveCamera(fov, aspect, 0.5, 4000), dir = new T.Vector3().setFromSphericalCoords(1, phi, theta), look = new T.Vector3(), q = new T.Vector3();
  for (const p of points) look.add(p); look.divideScalar(points.length);
  const y = look.y, frameW = Math.max(40, width - 2 * side), frameH = Math.max(40, height - topInset - bottomInset), cx = side + frameW / 2, cy = topInset + frameH / 2, elev = Math.max(0.2, Math.sin(Math.PI / 2 - phi));
  let distance = 160;
  const right = new T.Vector3(), up = new T.Vector3(), fwd = new T.Vector3(), ground = new T.Vector3();
  for (let n = 0; n < iterations; n++) {
    camera.position.copy(look).addScaledVector(dir, distance); camera.lookAt(look); camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of points) { q.copy(p).project(camera); const sx = (q.x * 0.5 + 0.5) * width, sy = (-q.y * 0.5 + 0.5) * height; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
    const scale = Math.max((x1 - x0) / frameW, (y1 - y0) / frameH), mpp = (2 * Math.tan((fov * Math.PI) / 360) * distance) / height;
    camera.matrixWorld.extractBasis(right, up, fwd); ground.set(-fwd.x, 0, -fwd.z).normalize();
    look.addScaledVector(right, ((x0 + x1) / 2 - cx) * mpp).addScaledVector(ground, (-((y0 + y1) / 2 - cy) * mpp) / elev); look.y = y;
    distance *= scale ** 0.95 || 1;
  }
  return { look, distance };
}
