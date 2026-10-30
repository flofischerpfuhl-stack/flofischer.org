/**
 * The sea of the overworld archipelago: one level, one shader, one colour for every island and for the harbour water
 * inside an authored region (they share the uniforms). Wind Waker blue: bright shore band with animated foam lines,
 * saturated shallows fading to a deeper blue, slow sparkle highlights; unlit, so cel shading and tone mapping leave it alone.
 * The shore distance (metres from the nearest dry land, 0 on land) comes from a small texture the islands write into.
 */
import { THREE as T } from '../three-kit.js';

export const SEA_Y = 0.14;
const SHORE_RANGE = 12; // metres encoded in the shore texture (white = this far or more)

export function createSea({ x0 = -60, z0 = -70, x1 = 560, z1 = 90, texel = Math.max(0.75, Math.sqrt(((x1 - x0) * (z1 - z0)) / 420000)) } = {}) {
  const w = Math.ceil((x1 - x0) / texel), h = Math.ceil((z1 - z0) / texel);
  const data = new Uint8Array(w * h).fill(255);
  const texture = new T.DataTexture(data, w, h, T.RedFormat, T.UnsignedByteType);
  texture.minFilter = texture.magFilter = T.LinearFilter; texture.wrapS = texture.wrapT = T.ClampToEdgeWrapping; texture.generateMipmaps = false; texture.needsUpdate = true;
  const color = (hex) => new T.Color(hex);
  const uniforms = {
    uTime: { value: 0 }, uShore: { value: texture }, uRect: { value: new T.Vector4(x0, z0, 1 / (w * texel), 1 / (h * texel)) },
    uLook: { value: new T.Vector3() }, uDark: { value: 0 }, uSky: { value: new T.Vector3(1e5, 1, 0) }, uSkyLow: { value: color('#dcefff') }, uSkyTop: { value: color('#4f9fe6') },
    uShallow: { value: color('#86f2e6') }, uMid: { value: color('#2ab2f2') }, uDeep: { value: color('#1a6ad8') }, uFoam: { value: color('#f4ffff') }, uHaze: { value: color('#cfe6f6') },
  };
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
uniform vec3 uShallow, uMid, uDeep, uFoam, uHaze, uSky, uSkyLow, uSkyTop;
float seaHash(vec2 i) { return fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453); }
float seaNoise(vec2 x) { vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(mix(seaHash(i), seaHash(i + vec2(1.0, 0.0)), f.x), mix(seaHash(i + vec2(0.0, 1.0)), seaHash(i + vec2(1.0, 1.0)), f.x), f.y); }`).replace('#include <opaque_fragment>', `{
  vec3 p = vSeaPos;
  float sd = texture2D(uShore, (p.xz - uRect.xy) * uRect.zw).r * ${SHORE_RANGE.toFixed(1)};
  float t = clamp(sd / 8.5, 0.0, 1.0);
  vec3 c = mix(uShallow, uMid, smoothstep(0.0, 0.42, t));
  c = mix(c, uDeep, smoothstep(0.36, 1.0, t));
  c *= 0.95 + 0.07 * sin(p.x * 0.07 + sin(p.z * 0.05) * 2.0) * sin(p.z * 0.09 + 1.3);
  vec2 g = p.xz * vec2(0.95, 1.5) + vec2(uTime * 0.05, 0.0), id = floor(g), fr = fract(g) - 0.5;
  fr -= (vec2(seaHash(id + 3.1), seaHash(id + 9.7)) - 0.5) * 0.3;
  float on = step(0.8, seaHash(id)) * (0.5 + 0.5 * sin(uTime * 0.9 + seaHash(id + 7.3) * 6.2832));
  float dash = (1.0 - smoothstep(0.1, 0.17, length(vec2(fr.x * 0.8, fr.y * 1.6)))) * on;
  vec2 g2 = p.xz * vec2(0.45, 0.8) + vec2(-uTime * 0.03, 5.0), id2 = floor(g2), fr2 = fract(g2) - 0.5;
  float on2 = step(0.9, seaHash(id2 + 1.7)) * (0.5 + 0.5 * sin(uTime * 0.5 + seaHash(id2 + 2.3) * 6.2832));
  float dash2 = (1.0 - smoothstep(0.1, 0.2, length(vec2(fr2.x * 0.42, fr2.y * 1.7)))) * on2;
  c = mix(c, uFoam, min(1.0, dash + dash2) * 0.38 * (0.45 + 0.55 * smoothstep(0.0, 0.4, t)));
  float e = sd + 0.22 * sin(uTime * 1.3 + sd * 3.2 + p.x * 0.17);
  float foam = 1.0 - smoothstep(0.18, 0.5, e);
  float ring = (1.0 - smoothstep(0.05, 0.15, abs(e - 1.55))) * 0.7 * step(0.6, sd) * (1.0 - smoothstep(2.4, 4.0, sd));
  c = mix(c, uFoam, max(foam, ring));
  float fade = smoothstep(150.0, 480.0, length(p.xz - uLook.xz)) * (1.0 - uSky.z);
  c = mix(c, uHaze, fade);
  if (uSky.z > 0.0) {
    float vy = (viewMatrix * vec4(p, 1.0)).y;
    c = mix(c, uHaze, uSky.z * smoothstep(uSky.x - uSky.y * 0.55, uSky.x, vy) * 0.85);
    vec3 sky = mix(uSkyLow, uSkyTop, smoothstep(uSky.x, uSky.x + uSky.y, vy));
    c = mix(c, sky, uSky.z * step(uSky.x, vy));
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
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = SEA_Y; mesh.frustumCulled = false; mesh.renderOrder = -2; mesh.name = 'Sea';
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
    dispose() { mesh.geometry.dispose(); for (const m of materials) m.dispose(); texture.dispose(); },
  };
}
