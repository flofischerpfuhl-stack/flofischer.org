/**
 * The sea of the overworld archipelago: one level, one shader, one colour for every island and for the harbour water
 * inside an authored region (they share the uniforms). Wind Waker blue: bright shore band with animated foam lines,
 * saturated shallows fading to a deeper blue, slow sparkle highlights; unlit, so cel shading and tone mapping leave it alone.
 * The shore distance (metres from the nearest dry land, 0 on land) comes from a small texture the islands write into.
 */
import { THREE as T } from '../three-kit.js';

export const SEA_Y = 0.14;
const SHORE_RANGE = 12; // metres encoded in the shore texture (white = this far or more)

/** flavour 0 = water (Wind Waker sea), 1 = cloud sea (flat soft billows, no shore foam), 2 = playroom floor (planks, a rug, contact shadows). palette overrides the colours. */
export function createSea({ x0 = -60, z0 = -70, x1 = 560, z1 = 90, texel = Math.max(0.75, Math.sqrt(((x1 - x0) * (z1 - z0)) / 420000)), flavour = 0, palette = null, level = 0, rug = null } = {}) {
  const w = Math.ceil((x1 - x0) / texel), h = Math.ceil((z1 - z0) / texel);
  const data = new Uint8Array(w * h).fill(255);
  const texture = new T.DataTexture(data, w, h, T.RedFormat, T.UnsignedByteType);
  texture.minFilter = texture.magFilter = T.LinearFilter; texture.wrapS = texture.wrapT = T.ClampToEdgeWrapping; texture.generateMipmaps = false; texture.needsUpdate = true;
  const color = (hex) => new T.Color(hex);
  const uniforms = {
    uTime: { value: 0 }, uShore: { value: texture }, uRect: { value: new T.Vector4(x0, z0, 1 / (w * texel), 1 / (h * texel)) },
    uLook: { value: new T.Vector3() }, uDark: { value: 0 }, uSky: { value: new T.Vector3(1e5, 1, 0) }, uSkyLow: { value: color('#dcefff') }, uSkyTop: { value: color('#4f9fe6') },
    uShallow: { value: color('#8cf4e8') }, uMid: { value: color('#3dbdf6') }, uDeep: { value: color('#2c82e6') }, uFoam: { value: color('#f4ffff') }, uHaze: { value: color('#cfe6f6') },
    uFlavour: { value: flavour }, uRug: { value: new T.Vector4(rug?.x ?? 0, rug?.z ?? 0, rug?.rx ?? 1, rug?.rz ?? 1) }, uRugA: { value: color(rug?.a ?? '#b23a48') }, uRugB: { value: color(rug?.b ?? '#f2d9a0') },
  };
  if (palette) for (const [key, hex] of Object.entries(palette)) { const slot = { shallow: 'uShallow', mid: 'uMid', deep: 'uDeep', foam: 'uFoam', haze: 'uHaze', skyLow: 'uSkyLow', skyTop: 'uSkyTop' }[key]; if (slot) uniforms[slot].value.set(hex); }
  const materials = [], layers = new Map();
  function stamp({ tile, tw, th, wx, wz, tileTexel }, cx0 = 0, cz0 = 0, cx1 = w, cz1 = h) {
    const ix0 = Math.round((wx - x0) / texel), iz0 = Math.round((wz - z0) / texel);
    for (let j = Math.max(0, cz0 - iz0); j < th * tileTexel / texel; j++) {
      const dz = iz0 + j, sj = Math.min(th - 1, Math.floor((j * texel) / tileTexel));
      if (dz < cz0 || dz >= cz1) { if (dz >= cz1) break; continue; }
      for (let i = Math.max(0, cx0 - ix0); i < tw * tileTexel / texel; i++) {
        const dx = ix0 + i; if (dx >= cx1) break; if (dx < cx0) continue;
        const si = Math.min(tw - 1, Math.floor((i * texel) / tileTexel)), v = tile[sj * tw + si];
        data[dz * w + dx] = Math.min(data[dz * w + dx], v);
      }
    }
  }
  const patch = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSeaPos;').replace('#include <project_vertex>', '#include <project_vertex>\nvSeaPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vSeaPos;
uniform float uTime, uDark; uniform sampler2D uShore; uniform vec4 uRect; uniform vec3 uLook;
uniform vec3 uShallow, uMid, uDeep, uFoam, uHaze, uSky, uSkyLow, uSkyTop, uRugA, uRugB; uniform float uFlavour; uniform vec4 uRug;
float seaHash(vec2 i) { return fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453); }
float seaNoise(vec2 x) { vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(mix(seaHash(i), seaHash(i + vec2(1.0, 0.0)), f.x), mix(seaHash(i + vec2(0.0, 1.0)), seaHash(i + vec2(1.0, 1.0)), f.x), f.y); }`).replace('#include <opaque_fragment>', `{
  vec3 p = vSeaPos;
  float sd = texture2D(uShore, (p.xz - uRect.xy) * uRect.zw).r * ${SHORE_RANGE.toFixed(1)};
  float t = clamp(sd / 8.5, 0.0, 1.0);
  vec3 c;
  if (uFlavour < 0.5) {
  c = mix(uShallow, uMid, smoothstep(0.0, 0.42, t));
  c = mix(c, uDeep, smoothstep(0.36, 1.0, t));
  c *= 0.95 + 0.07 * sin(p.x * 0.07 + sin(p.z * 0.05) * 2.0) * sin(p.z * 0.09 + 1.3);
  vec2 g = p.xz * vec2(0.95, 1.5) + vec2(uTime * 0.05, 0.0), id = floor(g), fr = fract(g) - 0.5;
  fr -= (vec2(seaHash(id + 3.1), seaHash(id + 9.7)) - 0.5) * 0.3;
  float on = step(0.8, seaHash(id)) * (0.5 + 0.5 * sin(uTime * 0.9 + seaHash(id + 7.3) * 6.2832));
  float dash = (1.0 - smoothstep(0.1, 0.17, length(vec2(fr.x * 0.8, fr.y * 1.6)))) * on;
  vec2 g2 = p.xz * vec2(0.45, 0.8) + vec2(-uTime * 0.03, 5.0), id2 = floor(g2), fr2 = fract(g2) - 0.5;
  float on2 = step(0.9, seaHash(id2 + 1.7)) * (0.5 + 0.5 * sin(uTime * 0.5 + seaHash(id2 + 2.3) * 6.2832));
  float dash2 = (1.0 - smoothstep(0.1, 0.2, length(vec2(fr2.x * 0.42, fr2.y * 1.7)))) * on2;
  c = mix(c, uFoam, min(1.0, dash + dash2) * 0.38 * (0.45 + 0.55 * smoothstep(0.0, 0.4, t)) * (1.0 - smoothstep(35.0, 150.0, length(vSeaPos - cameraPosition))));
  float e = sd + 0.22 * sin(uTime * 1.3 + sd * 3.2 + p.x * 0.17);
  float foam = 1.0 - smoothstep(0.18, 0.5, e);
  float ring = (1.0 - smoothstep(0.05, 0.15, abs(e - 1.55))) * 0.7 * step(0.6, sd) * (1.0 - smoothstep(2.4, 4.0, sd));
  c = mix(c, uFoam, max(foam, ring));
  } else if (uFlavour < 1.5) {
  float b = seaNoise(p.xz * 0.022 + vec2(uTime * 0.012, 0.0)) * 0.6 + seaNoise(p.xz * 0.06 - vec2(0.0, uTime * 0.01)) * 0.3 + seaNoise(p.xz * 0.16) * 0.1;
  c = mix(uDeep, uMid, smoothstep(0.33, 0.365, b));
  c = mix(c, uShallow, smoothstep(0.5, 0.535, b));
  c = mix(c, uFoam, smoothstep(0.66, 0.69, b));
  } else {
  float row = floor(p.z / 3.4), u = (p.x + seaHash(vec2(row, 3.0)) * 17.0) / 15.0;
  vec2 id = vec2(floor(u), row);
  c = mix(uDeep, uShallow, seaHash(id + 4.0) * 0.85) * (0.93 + 0.14 * seaHash(id));
  c *= 0.97 + 0.03 * sin(p.x * 2.6 + seaHash(id) * 20.0 + sin(p.z * 4.0) * 0.6);
  float gap = max(1.0 - smoothstep(0.0, 0.18, 7.5 - abs(fract(u) - 0.5) * 15.0), 1.0 - smoothstep(0.0, 0.1, 1.7 - abs(fract(p.z / 3.4) - 0.5) * 3.4));
  c = mix(c, uFoam, gap * 0.5);
  vec2 q = (p.xz - uRug.xy) * uRug.zw; float rr = length(q);
  if (rr < 1.0) {
    vec2 g = floor(p.xz / 3.2); float chk = mod(g.x + g.y, 2.0);
    vec3 rug = mix(uRugA, uRugA * 1.14, chk);
    float ang = atan(q.y, q.x) * 14.0, border = smoothstep(0.84, 0.845, rr), ring = smoothstep(0.9, 0.905, rr) - smoothstep(0.935, 0.94, rr);
    rug = mix(rug, uRugB, border); rug = mix(rug, uRugA * 0.75, ring * step(0.5, fract(ang)));
    rug = mix(rug, uRugB, smoothstep(0.972, 0.975, rr) * step(0.5, fract(ang * 2.0)));
    c = mix(c, rug, 1.0 - smoothstep(0.985, 1.0, rr));
  }
  c *= mix(0.5, 1.0, smoothstep(0.0, 5.0, sd));
  }
  float fade = smoothstep(150.0, 480.0, length(p.xz - uLook.xz)) * (1.0 - uSky.z);
  c = mix(c, uHaze, fade);
  if (uSky.z > 0.0) {
    float vy = (viewMatrix * vec4(p, 1.0)).y;
    c = mix(c, uHaze, uSky.z * smoothstep(uSky.x - uSky.y * 0.55, uSky.x, vy) * 0.85);
    vec3 sky = mix(uSkyLow, uSkyTop, smoothstep(uSky.x, uSky.x + uSky.y, vy));
    c = mix(c, sky, uSky.z * step(uSky.x, vy));
    if (uFlavour > 0.5 && uSky.z > 0.999 && vy >= uSky.x) discard;
  }
  c *= 1.0 - 0.5 * uDark;
  gl_FragColor = vec4(c, 1.0);
}`);
  };
  /** One material per mesh that should look like the sea (the sea plane itself, the harbour water of a region). */
  function material() {
    const m = new T.MeshBasicMaterial({ toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
    m.onBeforeCompile = patch; m.customProgramCacheKey = () => 'fw-sea';
    m.userData.sea = true; materials.push(m); return m;
  }
  const mesh = new T.Mesh(new T.PlaneGeometry(1400, 1400), material());
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = SEA_Y + level; mesh.frustumCulled = false; mesh.renderOrder = -2; mesh.name = 'Sea';
  return {
    mesh, material, uniforms,
    /** Writes a tile of shore distances (Uint8, 0 = land, 255 = open sea) at world metres (wx, wz), `texel` wide cells. One layer per tile position; layers combine by minimum. */
    paint(tile, tw, th, wx, wz, tileTexel) {
      layers.set(`${wx}/${wz}`, { tile, tw, th, wx, wz, tileTexel });
      stamp(layers.get(`${wx}/${wz}`)); texture.needsUpdate = true;
    },
    /** Removes the layer painted at (wx, wz) and restores what the other layers say in its place. */
    clear(wx, wz, tw, th, tileTexel) {
      layers.delete(`${wx}/${wz}`);
      const ix0 = Math.max(0, Math.round((wx - x0) / texel)), iz0 = Math.max(0, Math.round((wz - z0) / texel)), ix1 = Math.min(w, Math.round((wx - x0) / texel + tw * tileTexel / texel)), iz1 = Math.min(h, Math.round((wz - z0) / texel + th * tileTexel / texel));
      for (let dz = iz0; dz < iz1; dz++) data.fill(255, dz * w + ix0, dz * w + ix1);
      for (const layer of layers.values()) stamp(layer, ix0, iz0, ix1, iz1);
      texture.needsUpdate = true;
    },
    /** World view: the sea ends at a horizon `h` view-space metres above the look point, with `span` metres of sky above it; on 0..1 fades it in. */
    setSky(h, span, on) { uniforms.uSky.value.set(h, span, on); },
    setDark(dark) { uniforms.uDark.value = dark ? 1 : 0; },
    update(time, look) { uniforms.uTime.value = time; uniforms.uLook.value.copy(look); mesh.position.x = look.x; mesh.position.z = look.z; },
    level, flavour,
    dispose() { mesh.geometry.dispose(); for (const m of materials) m.dispose(); texture.dispose(); },
  };
}
