/**
 * Hub camera framing: pure maths on [x, y, z] arrays (no Three.js), so the fit can be unit-tested.
 * The camera always looks along a fixed direction; only distance and the look-at point are solved.
 */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const madd = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** Unit view direction (camera to target) for a yaw (about Y) and a downward pitch in degrees. */
export function viewDirection(yawDeg = 0, pitchDeg = 8) {
  const y = yawDeg * Math.PI / 180, p = pitchDeg * Math.PI / 180;
  return norm([Math.sin(y) * Math.cos(p), -Math.sin(p), -Math.cos(y) * Math.cos(p)]);
}

export function cameraBasis(dir) {
  const right = norm(cross(dir, [0, 1, 0]));
  return { right, up: cross(right, dir) };
}

/** Project a point to NDC for a camera at `position` looking along `dir`. */
export function projectNdc(point, position, dir, fovDeg, aspect) {
  const { right, up } = cameraBasis(dir), rel = sub(point, position), depth = dot(rel, dir);
  const t = Math.tan(fovDeg * Math.PI / 360);
  return { x: dot(rel, right) / (depth * t * aspect), y: dot(rel, up) / (depth * t), depth };
}

/**
 * Fit every point inside the view (|ndc| <= margin on both axes), centred on their extents.
 * `lift` shifts the framing up (+) or down (-) in NDC, e.g. to leave room for the overlay below.
 */
export function fitPoints(points, { dir, fovDeg, aspect, margin = .92, lift = 0 }) {
  const { right, up } = cameraBasis(dir), t = Math.tan(fovDeg * Math.PI / 360);
  const c0 = points.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map(v => v / points.length);
  const xs = points.map(p => dot(sub(p, c0), right)), ys = points.map(p => dot(sub(p, c0), up));
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  let target = madd(madd(c0, right, cx), up, cy), distance = .1;
  for (const p of points) {
    const rel = sub(p, target), x = Math.abs(dot(rel, right)), y = Math.abs(dot(rel, up)), z = dot(rel, dir);
    distance = Math.max(distance, x / (margin * t * aspect) - z, y / (margin * t) - z);
  }
  target = madd(target, up, -lift * t * distance);
  return { target, position: madd(target, dir, -distance), distance, fovDeg };
}

/** Frame so that `point` is horizontally centred, `width` metres span the view at its depth, and it sits at ndcY. */
export function fitWidth(point, width, { dir, fovDeg, aspect, ndcY = 0 }) {
  const { up } = cameraBasis(dir), t = Math.tan(fovDeg * Math.PI / 360), distance = width / 2 / (t * aspect);
  const target = madd(point, up, -ndcY * t * distance);
  return { target, position: madd(target, dir, -distance), distance, fovDeg };
}

/** Portrait phones show a single cabinet; everything else shows the whole room. */
export const isPortrait = aspect => aspect < .9;
