/**
 * Shared cel shading for every Fernwork game (Wind Waker look). Written for the hub, now used by hub and Fern Rangers.
 *
 *   const shading = createShading(shadeFromUrl());        // 'c' by default, ?shade=none turns it off, ?shade=a|b for the old variants
 *   env.userData.shading = shading;                       // applyIbl(root, env, ...) then converts every standard material it touches
 *   shading.apply(root, { outline: 'skinned' });          // converts Standard AND Lambert materials (also instanced / baked / vertex-coloured)
 *                                                         // and adds outline hulls where allowed
 *   shading.setDark(isDark);  shading.release(root);  shading.dispose();
 *
 * Variants
 *   a  soft toon: 3 soft bands, saturated colours, strong rim. No outline.      b  a plus a fine outline.
 *   c  Wind Waker: ONE hard terminator from the key light, hue-shifted shadow colour (not grey), flat saturated colours,
 *      at most one clean highlight blob (only on smooth glossy materials), thin ink outline on characters.
 *
 * How it stays cheap and generic
 *  - Bands are a fragment-only patch (onBeforeCompile) of the stock lit materials, so skinning, instancing, morphs,
 *    vertex colours, the baked-crowd atlas shaders and IBL hooks keep working untouched. Band input is the GEOMETRY normal
 *    and the key light (plus the shadow map when the material receives it): no normal-map noise, one clean terminator.
 *  - Flattening: textured characters sample a lower mip (uShBias) and their luminance is posterised, which kills painted
 *    gradients and fur speckle while keeping dark eyes and mouths (they stay far from every band edge).
 *  - Outlines: inverted-hull on skinned / flagged meshes (one extra draw each). Crowds (InstancedMesh, baked batches) get
 *    NO hull; they get an in-shader ink edge instead (darkened silhouette from the view angle, zero extra draw calls).
 */
import { THREE } from './three-kit.js';

export const SHADE_VARIANTS = ['a', 'b', 'c'];
/** `?shade=a|b|c|none`. Default is the shared Wind Waker cel look (c). */
export function shadeFromUrl(search = typeof location === 'undefined' ? '' : location.search, fallback = 'c') {
  const v = new URLSearchParams(search).get('shade')?.toLowerCase();
  if (v === 'none' || v === 'off' || v === '0') return null;
  return SHADE_VARIANTS.includes(v) ? v : fallback;
}

const PRESETS = {
  // edge: band thresholds on the key-light amount; soft: edge softness; lv: brightness per band (dark..lit); sat: saturation;
  // deep: how much darker/saturated the shadow colour is; rim: thin edge light; spec: hard highlight blob; outline: hull width in px;
  // tone: shadow tint (hue shift); levels: luminance posterisation steps (0 off); bias: texture mip bias; ink: in-shader edge darkening
  a: { edge: [.3, .62], soft: .1, lv: [.7, .87, 1], sat: 1.3, deep: .35, rim: .55, spec: 0, outline: 0, ink: 0, bias: 0, levels: 0, tone: { light: [.9, .84, 1], dark: [.8, .86, 1.02] } },
  b: { edge: [.3, .62], soft: .1, lv: [.7, .87, 1], sat: 1.3, deep: .35, rim: .5, spec: 0, outline: 2.2, ink: 0, bias: 0, levels: 0, tone: { light: [.9, .84, 1], dark: [.8, .86, 1.02] } },
  c: { edge: [.27, .27], soft: .012, lv: [.84, 1, 1], sat: 1.22, deep: .45, keyOnly: 1, rim: 0, spec: 1, outline: 2.6, ink: .5, bias: 2, levels: 6, tone: { light: [.8, .74, 1], dark: [.62, .72, 1.02] } },
};
const RIM = { light: '#ffd9a0', dark: '#6dffb0' };

const FRAG_PARS = `uniform vec3 uShEdge, uShLv, uShTint, uShRim; uniform vec4 uShCfg; uniform float uShSpec, uShInk, uShBias, uShLevels, uShAmb, uShDim, uShDimK;
`;
// Runs right before opaque_fragment, replaces the lit result with the cel colour. `normal` / vViewPosition exist in Standard and Lambert.
const FRAG_BODY = `{
  vec3 shAlb = diffuseColor.rgb;
  float shG = dot(shAlb, vec3(.299, .587, .114));
  float shK = dot(reflectedLight.directDiffuse, vec3(.299, .587, .114)) / max(shG, .03);
  float shT = clamp(shK * 3.14159 / 2.0, 0., 1.6);
  // band input from the geometry normal and the key light: clean shapes, no normal-map noise (falls back to the full lighting)
  #if NUM_DIR_LIGHTS > 0 && !defined( FLAT_SHADED )
  {
    vec3 shN = normalize(vNormal) * faceDirection; float shAcc = 0.;
    for (int i = 0; i < NUM_DIR_LIGHTS; i++) shAcc += dot(directionalLights[i].color, vec3(.333)) * max(dot(shN, directionalLights[i].direction), 0.);
    if (uShCfg.y > .5) shAcc = dot(directionalLights[0].color, vec3(.333)) * max(dot(shN, directionalLights[0].direction), 0.);
    shT = clamp(shAcc * .5, 0., 1.6);
    // cast shadows (the existing shadow map, no extra pass): where the real lighting is darker than the geometry says, follow it
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    if (shG > .06) shT = min(shT, clamp(shK * 3.14159 / 2.0, 0., 1.6) * 1.05);
    #endif
  }
  #endif
  float shS1 = smoothstep(uShEdge.x - uShEdge.z, uShEdge.x + uShEdge.z, shT);
  float shS2 = smoothstep(uShEdge.y - uShEdge.z, uShEdge.y + uShEdge.z, shT);
  // flat albedo: posterise the luminance (soft steps), keep the hue
  if (uShLevels > 0.) {
    // steps in sqrt space so dark colours (navy coat, brown shoes) keep their hue instead of dropping to black
    float shL = max(shG, .02), shQ = sqrt(shL) * uShLevels, shD = (floor(shQ) + smoothstep(.3, .7, fract(shQ))) / uShLevels;
    shAlb *= max(shD * shD, shL * .6) / shL;
  }
  shAlb = clamp(mix(vec3(dot(shAlb, vec3(.299, .587, .114))), shAlb, uShCfg.x), 0., 1.);
  // shadow colour: deeper and hue-shifted (squared albedo is more saturated and darker), tinted cool
  vec3 shDeep = mix(shAlb, shAlb * shAlb, uShCfg.w) * uShTint;
  vec3 shCol = mix(mix(shDeep * uShLv.x, shAlb * uShLv.y, shS1), shAlb * uShLv.z, shS2);
  // keep the scene's own ambient hue (hemisphere light: warm meadow, red ember, cold frost) without its brightness noise
  if (uShAmb > 0.) {
    vec3 shIrr = reflectedLight.indirectDiffuse * 3.14159 / max(shAlb, vec3(.04));
    float shIl = max(dot(shIrr, vec3(.333)), .001);
    shCol *= mix(vec3(1.), clamp(shIrr / shIl, .6, 1.5), uShAmb);
  }
  float shNV = clamp(dot(normalize(normal), normalize(vViewPosition)), 0., 1.);
  shCol = mix(shCol, uShRim, smoothstep(.34, .16, shNV) * smoothstep(.12, .55, shT) * uShCfg.z);
  #if NUM_DIR_LIGHTS > 0
  if (uShSpec > 0.) {
    vec3 shH = normalize(normalize(directionalLights[0].direction) + normalize(vViewPosition));
    vec3 shGN = normalize(normal);
    #ifndef FLAT_SHADED
    shGN = normalize(vNormal) * faceDirection;
    #endif
    // one smooth blob per form: wide cosine lobe, one soft step (anti-aliased by the lobe slope)
    float shSp = smoothstep(.62, .68, pow(max(dot(shGN, shH), 0.), 18.));
    shCol = mix(shCol, vec3(1., .98, .9), shSp * shS1 * .85);
  }
  #endif
  // in-shader ink edge for things without a hull (crowds, scenery): darken the silhouette from the view angle
  if (uShInk > 0.) shCol *= mix(1., .38, uShInk * smoothstep(.3, .14, shNV));
  // theme exposure: scenes that dim their lights (not their colours) in the dark theme would otherwise stay bright
  shCol *= mix(1., uShDim, uShDimK);
  outgoingLight = shCol + totalEmissiveRadiance;
}
`;

/** Averaged normals per position, so the hull has no cracks at hard edges. */
function smoothNormals(geometry) {
  const pos = geometry.attributes.position, nor = geometry.attributes.normal, acc = new Map(), keyOf = i => `${pos.getX(i).toFixed(4)}|${pos.getY(i).toFixed(4)}|${pos.getZ(i).toFixed(4)}`;
  for (let i = 0; i < pos.count; i++) { const k = keyOf(i); let a = acc.get(k); if (!a) acc.set(k, a = [0, 0, 0]); a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i); }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const a = acc.get(keyOf(i)), l = Math.hypot(a[0], a[1], a[2]) || 1; out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l; }
  return new THREE.BufferAttribute(out, 3);
}

// small facial / detail parts get no hull of their own: their hulls would poke out of the head as dark rings
const DETAIL_PART = /eye|pupil|iris|brow|lash|mouth|teeth|tooth|tongue|nostril|whisker/i;
const radiusOf = mesh => { const g = mesh.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); return g.boundingSphere.radius * Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z); };
const isLit = m => m && (m.isMeshStandardMaterial || m.isMeshLambertMaterial);

/** opts.ambient: 0..1, how much of the scene's own ambient hue (hemisphere light) tints the cel colours (hub: 0, Rangers: worlds differ). */
export function createShading(variant = 'c', { ambient = 0 } = {}) {
  const P = PRESETS[variant] ?? PRESETS.c;
  const U = {
    uShEdge: { value: new THREE.Vector3(P.edge[0], P.edge[1], P.soft) }, uShLv: { value: new THREE.Vector3(...P.lv) }, uShTint: { value: new THREE.Vector3(...P.tone.light) },
    uShRim: { value: new THREE.Color(RIM.light) }, uShDim: { value: 1 }, uShCfg: { value: new THREE.Vector4(P.sat, P.keyOnly ? 1 : 0, P.rim, P.deep) },
  };
  const done = new WeakMap(), hulls = new Set(), smoothCache = new WeakMap(), key = `shade-${variant}`;

  /**
   * Convert one lit material (idempotent). `mesh` tells how it is used: skinned (character), instanced (crowd / batch) or plain.
   * Textured characters get the flatten treatment; crowds and plain meshes with an outline hull get the in-shader ink edge
   * unless a hull is added by apply().
   */
  function convert(material, mesh) {
    if (!isLit(material)) return;
    // a crowd = instanced standard material (baked troop / enemy batches, merged crowds); instanced Lambert is scenery (grass, flowers)
    const skinned = !!mesh?.isSkinnedMesh, instanced = !!mesh?.isInstancedMesh && !!material.isMeshStandardMaterial && material.side === THREE.FrontSide;
    const spec = P.spec && material.roughness != null && material.roughness <= .5 && !material.normalMap && (skinned || instanced || material.userData.outline) ? 1 : 0;
    const flat = P.levels && (skinned || instanced || material.userData.celFlat) ? 1 : 0, bias = material.map && flat ? P.bias : 0;
    const ink = P.ink && (instanced || material.userData.celInk) ? P.ink : 0;
    const known = done.get(material);
    if (known) {
      const u = known; u.uShSpec.value = Math.max(u.uShSpec.value, spec); u.uShInk.value = Math.max(u.uShInk.value, ink); return;
    }
    const u = { uShSpec: { value: spec }, uShInk: { value: ink }, uShBias: { value: bias }, uShLevels: { value: flat ? P.levels : 0 }, uShAmb: { value: ambient }, uShDimK: { value: skinned ? .3 : 1 } };
    done.set(material, u);
    const prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey?.bind(material);
    material.onBeforeCompile = (sh, renderer) => {
      prev?.call(material, sh, renderer);
      Object.assign(sh.uniforms, U, u);
      let frag = sh.fragmentShader.replace('#include <opaque_fragment>', FRAG_BODY + '#include <opaque_fragment>');
      // lower mip for painted textures (texture2D with a bias argument is plain GLSL ES 3.00)
      if (bias > 0 && material.map) frag = frag.replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'texture2D( map, vMapUv, uShBias )'));
      sh.fragmentShader = FRAG_PARS + frag;
    };
    material.customProgramCacheKey = () => (prevKey ? prevKey() : '') + key + (bias > 0 ? 'b' : '');
    material.needsUpdate = true;
  }

  const INK = new THREE.Color('#2a1c40');
  const hullColor = (src, out) => out.copy(src.color).multiplyScalar(variant === 'c' ? .25 : .34).lerp(INK, variant === 'c' ? .7 : .22);
  function hullMaterial(src) {
    const mat = new THREE.MeshBasicMaterial({ color: hullColor(src, new THREE.Color()), vertexColors: src.vertexColors, side: THREE.BackSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 3 }); // pushed back: relief on the body (nose, lips, folds) must not show hull lines
    const u = { uHullW: { value: 0 } };
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'attribute vec3 smoothN; uniform float uHullW;\n' + sh.vertexShader.replace('#include <skinning_vertex>', `#include <skinning_vertex>
        vec3 hullN = smoothN;
        #ifdef USE_SKINNING
          hullN = (skinMatrix * vec4(hullN, 0.)).xyz;
        #endif
        transformed += normalize(hullN) * uHullW;`);
    };
    mat.customProgramCacheKey = () => 'hull' + (src.vertexColors ? 'v' : '');
    mat.userData.u = u;
    return mat;
  }

  const wsc = new THREE.Vector3(), wp = new THREE.Vector3();
  function addHull(mesh, biggest, all) {
    if (!P.outline || mesh.userData.isHull || mesh.userData.hull || mesh.isInstancedMesh) return false;
    const m = mesh.material;
    if (Array.isArray(m) || !m.isMeshStandardMaterial || m.transparent || m.alphaTest > 0) return false;
    if (!mesh.isSkinnedMesh && !m.userData.outline && !all) return false;
    if (!mesh.geometry.attributes.normal) return false;
    if (mesh.isSkinnedMesh && (DETAIL_PART.test(mesh.name) || (biggest > 0 && radiusOf(mesh) < biggest * .18))) return false;
    let geo = smoothCache.get(mesh.geometry);
    if (!geo) { geo = mesh.geometry.clone(); geo.setAttribute('smoothN', smoothNormals(geo)); smoothCache.set(mesh.geometry, geo); }
    const mat = hullMaterial(m), hull = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(geo, mat) : new THREE.Mesh(geo, mat);
    hull.userData.isHull = true; hull.userData.srcGeo = mesh.geometry; hull.frustumCulled = false; hull.renderOrder = mesh.renderOrder; hull.castShadow = false; hull.receiveShadow = false;
    if (mesh.isSkinnedMesh) { hull.position.copy(mesh.position); hull.quaternion.copy(mesh.quaternion); hull.scale.copy(mesh.scale); hull.bind(mesh.skeleton, mesh.bindMatrix); }
    hull.onBeforeRender = (renderer, scene, camera) => {
      mesh.getWorldScale(wsc); mesh.getWorldPosition(wp);
      const s = (Math.abs(wsc.x) + Math.abs(wsc.y) + Math.abs(wsc.z)) / 3 || 1, dist = Math.max(.1, camera.position.distanceTo(wp));
      hullColor(m, mat.color); // follows theme changes of the source colour
      mat.userData.u.uHullW.value = P.outline * dist * 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, renderer.domElement.height) / s;
    };
    // skinned: sibling bound to the same skeleton; rigid: child of the mesh, so animated node transforms carry it along
    (mesh.isSkinnedMesh ? mesh.parent : mesh).add(hull); mesh.userData.hull = hull; hulls.add(hull);
    return true;
  }

  return {
    variant,
    convert,
    /**
     * Convert materials (Standard and Lambert, instanced or not) and add outline hulls under `root`.
     * opts.outline: 'skinned' (default: skinned meshes and flagged materials), 'flagged' (only userData.outline, no characters), false (none).
     * opts.all: outline every non-instanced mesh (rigid bosses and machines), not only skinned / flagged ones.
     * opts.ink: also give plain (non-instanced) meshes the in-shader ink edge.
     */
    apply(root, { outline = 'skinned', ink = false, all = false } = {}) {
      const meshes = []; root.traverse(o => { if (o.isMesh && !o.userData.isHull) meshes.push(o); });
      let biggest = 0; for (const o of meshes) if (o.isSkinnedMesh) biggest = Math.max(biggest, radiusOf(o));
      for (const o of meshes) {
        for (const m of [].concat(o.material)) { if (ink && m && !o.isInstancedMesh && !o.isSkinnedMesh) m.userData.celInk = true; convert(m, o); }
        if (outline === 'skinned' || (outline === 'flagged' && !o.isSkinnedMesh)) addHull(o, biggest, all); // 'skinned' = skinned meshes + flagged props
      }
    },
    /** Remove and free the outline hulls under `root` (shared source materials are left to their owner). */
    release(root) {
      const mine = []; root.traverse(o => { if (o.userData.isHull) mine.push(o); });
      for (const h of mine) { h.parent?.remove(h); h.material.dispose(); h.geometry.dispose(); smoothCache.delete(h.userData.srcGeo); hulls.delete(h); }
    },
    /** Theme colours (uniforms only, no recompile). `dim`: brightness of the dark theme for scenery (characters follow it at 30 %). */
    setDark(dark, { dim = 1 } = {}) {
      U.uShDim.value = dark ? dim : 1;
      U.uShRim.value.set(dark ? RIM.dark : RIM.light); U.uShLv.value.set(...P.lv.map(v => v * (dark ? .8 : 1))); U.uShTint.value.set(...(dark ? P.tone.dark : P.tone.light));
    },
    dispose() {
      for (const h of hulls) { h.parent?.remove(h); h.material.dispose(); h.geometry.dispose(); }
      hulls.clear();
    },
  };
}
