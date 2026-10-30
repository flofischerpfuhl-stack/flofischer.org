/**
 * Shading variants for any Three.js scene (written for the hub, meant to move to a shared place for all games).
 *
 *   const shading = createShading('a' | 'b' | 'c');   // or shadeFromUrl() for ?shade=a|b|c
 *   shading.apply(root);        // convert every MeshStandardMaterial under root (skinned/animated meshes included)
 *   shading.setDark(isDark);    // rim / shadow tints per theme (uniforms only, no recompile)
 *   shading.release(root);      // call before disposing a model that was applied (frees its outline hulls)
 *   shading.dispose();
 *
 * A  soft toon: 3 bands with soft edges, saturated colours, strong fresnel rim (warm in light, green in dark). No outline.
 * B  A plus a fine inverted-hull outline (~1.5 px) in a darkened tint of the base colour.
 * C  Wind Waker style: hard 2-band cel shading with a hue-shifted (not grey) shadow colour, flat saturated colours, a hard
 *    highlight blob and a thick (~3 px) outline.
 *
 * Toon bands work by quantising the lighting of the stock standard material (a small onBeforeCompile), so maps, vertex
 * colours, skinning, morphs and IBL keep working. Outlines are backface hulls pushed out along smoothed normals in the
 * vertex shader; a SkinnedMesh gets a SkinnedMesh hull bound to the same skeleton. Outlines go on skinned meshes and on
 * meshes whose material has `userData.outline = true` (the main props), so the cost stays small.
 */
import { THREE } from './three-kit.js';

export const SHADE_VARIANTS = ['a', 'b', 'c'];
export function shadeFromUrl(search = typeof location === 'undefined' ? '' : location.search) {
  const v = new URLSearchParams(search).get('shade')?.toLowerCase();
  return SHADE_VARIANTS.includes(v) ? v : null;
}

const PRESETS = {
  // edge: band thresholds on the direct-light amount; soft: edge softness; lv: brightness per band (dark..lit); sat: saturation boost;
  // rim: strength of the thin edge light; spec: hard highlight blob; outline: hull width in screen px; tone: shadow-band tint (hue shift)
  a: { edge: [.3, .62], soft: .1, lv: [.7, .87, 1], sat: 1.3, deep: .35, rim: .55, spec: 0, outline: 0, tone: { light: [.9, .84, 1], dark: [.8, .86, 1.02] } },
  b: { edge: [.3, .62], soft: .1, lv: [.7, .87, 1], sat: 1.3, deep: .35, rim: .5, spec: 0, outline: 2.2, tone: { light: [.9, .84, 1], dark: [.8, .86, 1.02] } },
  c: { edge: [.36, .36], soft: .012, lv: [.82, 1, 1], sat: 1.25, deep: .7, keyOnly: 1, rim: 0, spec: 1, outline: 4, tone: { light: [.72, .66, 1], dark: [.6, .7, 1.02] }, flat: 1 },
};
const RIM = { light: '#ffd9a0', dark: '#6dffb0' };

const FRAG_PARS = `uniform vec3 uShEdge, uShLv, uShTint, uShRim; uniform vec4 uShCfg; uniform float uShSpec, uShFlat;
`;
const FRAG_BODY = `{
  vec3 shAlb = diffuseColor.rgb;
  float shG = dot(shAlb, vec3(.299, .587, .114));
  float shK = dot(reflectedLight.directDiffuse, vec3(.299, .587, .114)) / max(shG, .03);
  float shT = clamp(shK * 3.14159 / 2.0, 0., 1.6);
  // band input from the *geometry* normal and the directional lights: clean shapes, no normal-map noise (falls back to the full lighting)
  #if NUM_DIR_LIGHTS > 0 && !defined( FLAT_SHADED )
  {
    vec3 shN = normalize(vNormal) * faceDirection; float shAcc = 0.;
    for (int i = 0; i < NUM_DIR_LIGHTS; i++) shAcc += dot(directionalLights[i].color, vec3(.333)) * max(dot(shN, directionalLights[i].direction), 0.);
    // cel mode: one clean terminator from the first (key) light only
    if (uShCfg.y > .5) shAcc = dot(directionalLights[0].color, vec3(.333)) * max(dot(shN, directionalLights[0].direction), 0.);
    shT = clamp(shAcc * .5, 0., 1.6);
  }
  #endif
  float shS1 = smoothstep(uShEdge.x - uShEdge.z, uShEdge.x + uShEdge.z, shT);
  float shS2 = smoothstep(uShEdge.y - uShEdge.z, uShEdge.y + uShEdge.z, shT);
  shAlb = clamp(mix(vec3(shG), shAlb, uShCfg.x), 0., 1.);
  // shadow colour: deeper and hue-shifted (squared albedo is more saturated and darker), tinted cool
  vec3 shDeep = mix(shAlb, shAlb * shAlb, uShCfg.w) * uShTint;
  vec3 shCol = mix(mix(shDeep * uShLv.x, shAlb * uShLv.y, shS1), shAlb * uShLv.z, shS2);
  float shNV = clamp(dot(normalize(normal), normalize(vViewPosition)), 0., 1.);
  shCol = mix(shCol, uShRim, smoothstep(.34, .16, shNV) * smoothstep(.12, .55, shT) * uShCfg.z);
  #if NUM_DIR_LIGHTS > 0
  if (uShSpec > 0.) {
    vec3 shH = normalize(normalize(directionalLights[0].direction) + normalize(vViewPosition));
    vec3 shGN = normalize(normal);
    #ifndef FLAT_SHADED
    shGN = normalize(vNormal) * faceDirection;
    #endif
    float shSp = step(.6, pow(max(dot(shGN, shH), 0.), 36.));
    shCol = mix(shCol, vec3(1., .98, .9), shSp * shS1 * .9);
  }
  #endif
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

export function createShading(variant = 'a') {
  const P = PRESETS[variant] ?? PRESETS.a;
  const U = {
    uShEdge: { value: new THREE.Vector3(P.edge[0], P.edge[1], P.soft) }, uShLv: { value: new THREE.Vector3(...P.lv) }, uShTint: { value: new THREE.Vector3(...P.tone.light) },
    uShRim: { value: new THREE.Color(RIM.light) }, uShCfg: { value: new THREE.Vector4(P.sat, P.keyOnly ? 1 : 0, P.rim, P.deep) },
  };
  const hulls = new Set(), smoothCache = new WeakMap(), key = `shade-${variant}`;

  function convert(material, skinned) {
    if (!material.isMeshStandardMaterial) return;
    // hard highlight only on characters and flagged props, never on the floor / walls
    const spec = P.spec && (skinned || material.userData.outline) ? 1 : 0;
    if (material.userData.shaded === variant) { if (material.userData.shSpec) material.userData.shSpec.value = Math.max(material.userData.shSpec.value, spec); return; }
    material.userData.shaded = variant; const uSpec = material.userData.shSpec = { value: spec };
    const prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey?.bind(material);
    material.onBeforeCompile = (sh, renderer) => {
      prev?.call(material, sh, renderer);
      Object.assign(sh.uniforms, U); sh.uniforms.uShSpec = uSpec;
      sh.fragmentShader = FRAG_PARS + sh.fragmentShader.replace('#include <opaque_fragment>', FRAG_BODY + '#include <opaque_fragment>');
    };
    material.customProgramCacheKey = () => (prevKey ? prevKey() : '') + key;
    material.needsUpdate = true;
  }

  const INK = new THREE.Color('#2a1c40');
  const hullColor = (src, out) => out.copy(src.color).multiplyScalar(variant === 'c' ? .3 : .34).lerp(INK, .22);
  function hullMaterial(src) {
    const mat = new THREE.MeshBasicMaterial({ color: hullColor(src, new THREE.Color()), map: src.map ?? null, vertexColors: src.vertexColors, side: THREE.BackSide, toneMapped: false });
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
    mat.customProgramCacheKey = () => 'hull' + (src.map ? 'm' : '') + (src.vertexColors ? 'v' : '');
    mat.userData.u = u;
    return mat;
  }

  const wsc = new THREE.Vector3(), wp = new THREE.Vector3();
  function addHull(mesh) {
    if (!P.outline || mesh.userData.isHull || mesh.userData.hull) return;
    const m = mesh.material;
    if (Array.isArray(m) || !m.isMeshStandardMaterial || m.transparent || m.alphaTest > 0) return;
    if (!mesh.isSkinnedMesh && !m.userData.outline) return;
    if (!mesh.geometry.attributes.normal) return;
    let geo = smoothCache.get(mesh.geometry);
    if (!geo) { geo = mesh.geometry.clone(); geo.setAttribute('smoothN', smoothNormals(geo)); smoothCache.set(mesh.geometry, geo); }
    const mat = hullMaterial(m), hull = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(geo, mat) : new THREE.Mesh(geo, mat);
    hull.userData.isHull = true; hull.userData.srcGeo = mesh.geometry; hull.frustumCulled = false; hull.renderOrder = mesh.renderOrder;
    hull.position.copy(mesh.position); hull.quaternion.copy(mesh.quaternion); hull.scale.copy(mesh.scale);
    if (mesh.isSkinnedMesh) hull.bind(mesh.skeleton, mesh.bindMatrix);
    hull.onBeforeRender = (renderer, scene, camera) => {
      mesh.getWorldScale(wsc); mesh.getWorldPosition(wp);
      const s = (Math.abs(wsc.x) + Math.abs(wsc.y) + Math.abs(wsc.z)) / 3 || 1, dist = Math.max(.1, camera.position.distanceTo(wp));
      hullColor(m, mat.color); // follows theme changes of the source colour
      mat.userData.u.uHullW.value = P.outline * dist * 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, renderer.domElement.height) / s;
    };
    mesh.parent.add(hull); mesh.userData.hull = hull; hulls.add(hull);
  }

  return {
    variant,
    /** Convert materials and add outline hulls for everything under `root`. Call after any applyIbl for the same root. */
    apply(root) {
      const meshes = []; root.traverse(o => { if (o.isMesh && !o.userData.isHull) meshes.push(o); });
      for (const o of meshes) { for (const m of [].concat(o.material)) convert(m, o.isSkinnedMesh); addHull(o); }
    },
    /** Remove and free the outline hulls under `root` (shared source materials are left to their owner). */
    release(root) {
      const mine = []; root.traverse(o => { if (o.userData.isHull) mine.push(o); });
      for (const h of mine) { h.parent?.remove(h); h.material.dispose(); h.geometry.dispose(); smoothCache.delete(h.userData.srcGeo); hulls.delete(h); }
    },
    setDark(dark) {
      U.uShRim.value.set(dark ? RIM.dark : RIM.light); U.uShLv.value.set(...P.lv.map(v => v * (dark ? .8 : 1))); U.uShTint.value.set(...(dark ? P.tone.dark : P.tone.light));
    },
    dispose() {
      for (const h of hulls) { h.parent?.remove(h); h.material.dispose(); h.geometry.dispose(); }
      hulls.clear();
    },
  };
}
