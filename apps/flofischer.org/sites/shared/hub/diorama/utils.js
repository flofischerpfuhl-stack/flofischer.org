import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export const clamp = THREE.MathUtils.clamp;
export const lerp = THREE.MathUtils.lerp;

export function rng(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

export function smoothstep(a, b, value) {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Seeded simplex noise (Gustavson). Only used while building geometry, so it
// favours clarity over micro-optimisation.
const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1],
  [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

export function createNoise(seed = 1) {
  const random = rng(seed);
  const p = new Uint8Array(256);
  for (let index = 0; index < 256; index += 1) p[index] = index;
  for (let index = 255; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [p[index], p[swap]] = [p[swap], p[index]];
  }
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let index = 0; index < 512; index += 1) {
    perm[index] = p[index & 255];
    permMod12[index] = perm[index] % 12;
  }

  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  function n2(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = GRAD3[permMod12[ii + perm[jj]]];
      t0 *= t0;
      n += t0 * t0 * (g[0] * x0 + g[1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = GRAD3[permMod12[ii + i1 + perm[jj + j1]]];
      t1 *= t1;
      n += t1 * t1 * (g[0] * x1 + g[1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = GRAD3[permMod12[ii + 1 + perm[jj + 1]]];
      t2 *= t2;
      n += t2 * t2 * (g[0] * x2 + g[1] * y2);
    }
    return 70 * n;
  }

  const F3 = 1 / 3;
  const G3 = 1 / 6;
  const grad3 = new Float32Array(GRAD3.flat());
  function corner(gi, x, y, z) {
    let t = 0.6 - x * x - y * y - z * z;
    if (t < 0) return 0;
    t *= t;
    const g = gi * 3;
    return t * t * (grad3[g] * x + grad3[g + 1] * y + grad3[g + 2] * z);
  }
  // Allocation-free: this runs a few hundred thousand times while building.
  function n3(xin, yin, zin) {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);
    let i1; let j1; let k1; let i2; let j2; let k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    const n = corner(permMod12[ii + perm[jj + perm[kk]]], x0, y0, z0)
      + corner(permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]], x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3)
      + corner(permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]], x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3)
      + corner(permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]], x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3);
    return 32 * n;
  }

  function fbm2(x, y, octaves = 4) {
    let amplitude = 0.5;
    let frequency = 1;
    let sum = 0;
    for (let octave = 0; octave < octaves; octave += 1) {
      sum += amplitude * n2(x * frequency, y * frequency);
      frequency *= 2.03;
      amplitude *= 0.5;
    }
    return sum;
  }

  function fbm3(x, y, z, octaves = 4) {
    let amplitude = 0.5;
    let frequency = 1;
    let sum = 0;
    for (let octave = 0; octave < octaves; octave += 1) {
      sum += amplitude * n3(x * frequency, y * frequency, z * frequency);
      frequency *= 2.07;
      amplitude *= 0.5;
    }
    return sum;
  }

  return { n2, n3, fbm2, fbm3 };
}

const tmpObject = new THREE.Object3D();
export function matrixFrom(position = [0, 0, 0], rotation = [0, 0, 0], scale = 1) {
  tmpObject.position.set(...position);
  if (rotation.isQuaternion) tmpObject.quaternion.copy(rotation);
  else tmpObject.rotation.set(rotation[0], rotation[1], rotation[2], rotation[3] || "XYZ");
  if (Array.isArray(scale)) tmpObject.scale.set(...scale);
  else tmpObject.scale.setScalar(scale);
  tmpObject.updateMatrix();
  return tmpObject.matrix.clone();
}

/** Indexed icosphere, so displaced blobs shade smoothly instead of faceted. */
const icosphereCache = new Map();
export function smoothIcosahedron(radius = 1, detail = 2) {
  if (!icosphereCache.has(detail)) {
    const source = new THREE.IcosahedronGeometry(1, detail);
    source.deleteAttribute("normal");
    source.deleteAttribute("uv");
    icosphereCache.set(detail, mergeVertices(source));
    source.dispose();
  }
  const geometry = icosphereCache.get(detail).clone();
  if (radius !== 1) geometry.scale(radius, radius, radius);
  return geometry;
}

/** Axis-aligned box projection so merged masonry keeps one texel density. */
export function boxProjectUV(geometry, scale = 1, offset = [0, 0]) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = new Float32Array(position.count * 2);
  const [scaleU, scaleV] = Array.isArray(scale) ? scale : [scale, scale];
  for (let index = 0; index < position.count; index += 1) {
    const nx = Math.abs(normal.getX(index));
    const ny = Math.abs(normal.getY(index));
    const nz = Math.abs(normal.getZ(index));
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    let u;
    let v;
    if (ny >= nx && ny >= nz) { u = x; v = z; }
    else if (nx >= nz) { u = z; v = y; }
    else { u = x; v = y; }
    uv[index * 2] = u * scaleU + offset[0];
    uv[index * 2 + 1] = v * scaleV + offset[1];
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/**
 * Collects many small static pieces and merges them into a single draw call.
 * Every piece is normalised to position/normal/uv/color so they can share one
 * material with vertex colours for variation.
 */
export class Batch {
  constructor(name = "batch") {
    this.name = name;
    this.parts = [];
  }

  add(source, matrix = null, color = null, { worldUV = 0, uvOffset = [0, 0], keepColor = true } = {}) {
    let geometry = source.clone();
    for (const name of Object.keys(geometry.attributes)) {
      if (!["position", "normal", "uv", "color"].includes(name)) geometry.deleteAttribute(name);
    }
    geometry.morphAttributes = {};
    if (!geometry.index) {
      const count = geometry.attributes.position.count;
      const index = new (count > 65535 ? Uint32Array : Uint16Array)(count);
      for (let item = 0; item < count; item += 1) index[item] = item;
      geometry.setIndex(new THREE.BufferAttribute(index, 1));
    }
    if (matrix) geometry.applyMatrix4(matrix);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    if (worldUV) boxProjectUV(geometry, worldUV, uvOffset);
    if (!geometry.attributes.uv) {
      geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    }
    const count = geometry.attributes.position.count;
    const tint = color ? new THREE.Color(color) : null;
    if (!geometry.attributes.color || !keepColor) {
      const colors = new Float32Array(count * 3);
      const existing = keepColor ? geometry.attributes.color : null;
      for (let item = 0; item < count; item += 1) {
        colors[item * 3] = (existing ? existing.getX(item) : 1) * (tint ? tint.r : 1);
        colors[item * 3 + 1] = (existing ? existing.getY(item) : 1) * (tint ? tint.g : 1);
        colors[item * 3 + 2] = (existing ? existing.getZ(item) : 1) * (tint ? tint.b : 1);
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    } else if (tint) {
      const colors = geometry.attributes.color;
      for (let item = 0; item < count; item += 1) {
        colors.setXYZ(item, colors.getX(item) * tint.r, colors.getY(item) * tint.g, colors.getZ(item) * tint.b);
      }
    }
    if (geometry.attributes.color.itemSize !== 3) {
      const colors = new Float32Array(count * 3);
      for (let item = 0; item < count; item += 1) {
        colors[item * 3] = geometry.attributes.color.getX(item);
        colors[item * 3 + 1] = geometry.attributes.color.getY(item);
        colors[item * 3 + 2] = geometry.attributes.color.getZ(item);
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
    this.parts.push(geometry);
    return this;
  }

  get empty() {
    return this.parts.length === 0;
  }

  geometry() {
    if (!this.parts.length) return null;
    const needs32 = this.parts.reduce((sum, part) => sum + part.attributes.position.count, 0) > 65535;
    if (needs32) {
      for (const part of this.parts) {
        if (!(part.index.array instanceof Uint32Array)) part.setIndex(new THREE.BufferAttribute(Uint32Array.from(part.index.array), 1));
      }
    }
    const merged = mergeGeometries(this.parts, false);
    this.parts.forEach((part) => part.dispose());
    this.parts = [];
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }

  mesh(material, { castShadow = false, receiveShadow = true, name = this.name } = {}) {
    const geometry = this.geometry();
    if (!geometry) return null;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}

/**
 * Tube along a Catmull-Rom curve whose radius can taper or follow a function.
 * Used for roots, branches, palm trunks, pipes and cables.
 */
export function taperedTube(points, radiusStart, radiusEnd = radiusStart, {
  radial = 6, segments = 0, radiusFn = null, uvScale = [1, 1], cap = false,
} = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => (point.isVector3 ? point : new THREE.Vector3(...point))));
  const tubular = segments || Math.max(4, points.length * 3);
  const frames = curve.computeFrenetFrames(tubular, false);
  const length = curve.getLength();
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const point = new THREE.Vector3();
  for (let ring = 0; ring <= tubular; ring += 1) {
    const t = ring / tubular;
    curve.getPointAt(t, point);
    const normal = frames.normals[ring];
    const binormal = frames.binormals[ring];
    const radius = radiusFn ? radiusFn(t) : lerp(radiusStart, radiusEnd, t);
    for (let side = 0; side <= radial; side += 1) {
      const angle = (side / radial) * Math.PI * 2;
      const sin = Math.sin(angle);
      const cos = -Math.cos(angle);
      const nx = cos * normal.x + sin * binormal.x;
      const ny = cos * normal.y + sin * binormal.y;
      const nz = cos * normal.z + sin * binormal.z;
      positions.push(point.x + radius * nx, point.y + radius * ny, point.z + radius * nz);
      normals.push(nx, ny, nz);
      uvs.push((side / radial) * uvScale[0], t * length * uvScale[1]);
    }
  }
  for (let ring = 0; ring < tubular; ring += 1) {
    for (let side = 0; side < radial; side += 1) {
      const a = ring * (radial + 1) + side;
      const b = (ring + 1) * (radial + 1) + side;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  if (cap) {
    curve.getPointAt(1, point);
    const tangent = curve.getTangentAt(1);
    const center = positions.length / 3;
    positions.push(point.x, point.y, point.z);
    normals.push(tangent.x, tangent.y, tangent.z);
    uvs.push(0.5, length * uvScale[1]);
    const last = tubular * (radial + 1);
    for (let side = 0; side < radial; side += 1) indices.push(last + side, last + side + 1, center);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/** Writes a colour per vertex computed from position/normal. */
export function paintVertices(geometry, paint) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < position.count; index += 1) {
    color.setRGB(1, 1, 1);
    paint(color, position.getX(index), position.getY(index), position.getZ(index),
      normal ? normal.getX(index) : 0, normal ? normal.getY(index) : 1, normal ? normal.getZ(index) : 0, index);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function canvasTexture(width, height, draw, { srgb = true, repeat = 0, anisotropy = 4, mipmaps = true } = {}) {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  const context = element.getContext("2d");
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(element);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...(Array.isArray(repeat) ? repeat : [repeat, repeat]));
  }
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = mipmaps;
  if (!mipmaps) texture.minFilter = THREE.LinearFilter;
  return texture;
}

/**
 * Small wrapper around onBeforeCompile so several shader tweaks stay readable.
 * `replace` is a list of [chunk, code] pairs where `code` may reference the
 * original chunk as `$&`.
 */
export function patchMaterial(material, { uniforms = {}, vertexHead = "", fragmentHead = "", vertex = [], fragment = [], key }) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (vertexHead) shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${vertexHead}`);
    if (fragmentHead) shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${fragmentHead}`);
    for (const [chunk, code] of vertex) {
      const token = `#include <${chunk}>`;
      if (!shader.vertexShader.includes(token)) console.warn(`patchMaterial: missing ${token}`);
      shader.vertexShader = shader.vertexShader.replace(token, code.replaceAll("$&", token));
    }
    for (const [chunk, code] of fragment) {
      const token = `#include <${chunk}>`;
      if (!shader.fragmentShader.includes(token)) console.warn(`patchMaterial: missing ${token}`);
      shader.fragmentShader = shader.fragmentShader.replace(token, code.replaceAll("$&", token));
    }
  };
  material.customProgramCacheKey = () => key || material.name || material.uuid;
  return material;
}

/** GLSL hash / noise helpers shared by several patched materials. */
export const GLSL_NOISE = /* glsl */ `
  float ffHash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float ffNoise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(ffHash12(i), ffHash12(i + vec2(1.0, 0.0)), u.x),
               mix(ffHash12(i + vec2(0.0, 1.0)), ffHash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`;
