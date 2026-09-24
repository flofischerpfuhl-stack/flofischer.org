import * as THREE from "three";
import { GLSL_NOISE, canvasTexture, patchMaterial, rng } from "./utils.js";

function asphaltTexture() {
  return canvasTexture(512, 512, (context, width, height) => {
    const image = context.createImageData(width, height);
    const random = rng(99);
    for (let index = 0; index < width * height; index += 1) {
      const base = 58 + random() * 26;
      const aggregate = random() > 0.93 ? 34 * random() : 0;
      const value = base + aggregate;
      image.data[index * 4] = value;
      image.data[index * 4 + 1] = value;
      image.data[index * 4 + 2] = value + 3;
      image.data[index * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    // Soft tonal blotches, patch repairs and fine cracks.
    for (let index = 0; index < 70; index += 1) {
      const x = random() * width;
      const y = random() * height;
      const radius = 20 + random() * 80;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      const dark = random() > 0.5;
      gradient.addColorStop(0, dark ? "rgba(20,20,24,0.28)" : "rgba(120,120,126,0.14)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = gradient;
      for (const ox of [-width, 0, width]) {
        for (const oy of [-height, 0, height]) {
          context.save();
          context.translate(ox, oy);
          context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
          context.restore();
        }
      }
    }
    context.strokeStyle = "rgba(14,14,16,0.55)";
    context.lineWidth = 1.2;
    for (let index = 0; index < 14; index += 1) {
      let x = random() * width;
      let y = random() * height;
      context.beginPath();
      context.moveTo(x, y);
      for (let step = 0; step < 9; step += 1) {
        x += (random() - 0.5) * 34;
        y += (random() - 0.5) * 34;
        context.lineTo(x, y);
      }
      context.stroke();
    }
  }, { repeat: 0.42, anisotropy: 8 });
}

const WET_STREET = /* glsl */ `
  uniform float uTime;
  uniform float uRain;
  uniform vec3 uBoxMin;
  uniform vec3 uBoxMax;
  uniform vec3 uProbe;
  varying vec3 vStreetWorld;
  ${GLSL_NOISE}
  vec2 ffRipple(vec2 p, float time) {
    vec2 cell = floor(p);
    vec2 local = fract(p) - 0.5;
    float seed = ffHash12(cell);
    float t = fract(time * 0.8 + seed);
    vec2 center = (vec2(ffHash12(cell + 3.7), ffHash12(cell + 9.1)) - 0.5) * 0.55;
    vec2 delta = local - center;
    float radius = length(delta);
    float wave = radius - t * 0.48;
    float ring = sin(wave * 58.0) * smoothstep(0.07, 0.0, abs(wave)) * (1.0 - t);
    return delta / max(radius, 0.001) * ring;
  }
`;

/**
 * Wet asphalt: puddles become mirror-like, rain rings animate inside them and
 * the night probe is box-projected so neon reflections line up with the city.
 */
function createStreetMaterial(world, map) {
  const material = new THREE.MeshStandardMaterial({
    name: "street",
    map,
    color: 0xb4b6be,
    roughness: 0.46,
    metalness: 0.0,
    vertexColors: true,
    envMapIntensity: 1.25,
  });
  const uniforms = {
    uTime: world.uniforms.time,
    uRain: world.uniforms.rain,
    uBoxMin: { value: new THREE.Vector3(-0.2, 0.3, -6.2) },
    uBoxMax: { value: new THREE.Vector3(8.6, 10.0, 6.2) },
    uProbe: { value: new THREE.Vector3(3.6, 1.3, 0.8) },
  };
  material.userData.probeUniforms = uniforms;
  patchMaterial(material, {
    key: "street",
    uniforms,
    vertexHead: "varying vec3 vStreetWorld;",
    vertex: [["worldpos_vertex", "$&\nvStreetWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;"]],
    fragmentHead: WET_STREET,
    fragment: [
      ["color_fragment", `$&
        float puddleNoise = ffNoise2(vStreetWorld.xz * 0.62 + 3.0) * 0.62 + ffNoise2(vStreetWorld.xz * 1.9) * 0.38;
        float roadBias = smoothstep(0.5, 0.7, vStreetWorld.x) * smoothstep(2.05, 1.8, vStreetWorld.x) * 0.1;
        float puddle = smoothstep(0.55, 0.61, puddleNoise + roadBias);
        diffuseColor.rgb *= mix(1.0, 0.32, puddle);`],
      ["roughnessmap_fragment", `$&
        roughnessFactor = mix(roughnessFactor * (0.85 + ffNoise2(vStreetWorld.xz * 3.1) * 0.3), 0.035, puddle);`],
      ["normal_fragment_maps", `$&
        if (puddle * uRain > 0.01) {
          vec2 ripple = ffRipple(vStreetWorld.xz * 2.6, uTime) + ffRipple(vStreetWorld.xz * 3.7 + 17.0, uTime * 1.13) * 0.8;
          normal = normalize(normal + (viewMatrix * vec4(ripple.x, 0.0, ripple.y, 0.0)).xyz * 0.22 * puddle * uRain);
        }`],
    ],
  });
  // Box-projected (parallax corrected) reflections.
  const baseCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    baseCompile(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <envmap_physical_pars_fragment>",
      THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
        "reflectVec = inverseTransformDirection( reflectVec, viewMatrix );",
        `reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
        {
          vec3 dir = normalize(reflectVec);
          vec3 toMax = (uBoxMax - vStreetWorld) / dir;
          vec3 toMin = (uBoxMin - vStreetWorld) / dir;
          vec3 far = max(toMax, toMin);
          float hit = min(min(far.x, far.y), far.z);
          reflectVec = vStreetWorld + dir * hit - uProbe;
        }`
      )
    );
  };
  return material;
}

/**
 * Foliage lighting: normals are blended towards the sky so cards and blades
 * read as soft volumes instead of flickering planes.
 */
export function softFoliage(material, { time, upWeight = 0.9, wind = 0, translucency = 0.0, key }) {
  const uniforms = { uTime: time };
  return patchMaterial(material, {
    key,
    uniforms,
    vertexHead: "uniform float uTime;",
    vertex: wind ? [["begin_vertex", `$&
      {
        vec3 anchor = (modelMatrix * vec4(position, 1.0)).xyz;
        #ifdef USE_INSTANCING
          anchor = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
        #endif
        float sway = sin(uTime * 1.6 + anchor.x * 1.3 + anchor.z * 0.9) + sin(uTime * 2.7 + anchor.z * 2.1) * 0.5;
        transformed += vec3(sway, 0.0, sway * 0.6) * ${wind.toFixed(4)};
      }`]] : [],
    fragment: [
      ["normal_fragment_begin", `$&
        normal = normalize(normal + ${upWeight.toFixed(3)} * normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));`],
      ...(translucency ? [["emissivemap_fragment", `$&
        totalEmissiveRadiance += diffuseColor.rgb * ${translucency.toFixed(3)};`]] : []),
    ],
  });
}

export function createSharedMaterials(world) {
  const { materials, textures } = world;
  materials.street = createStreetMaterial(world, asphaltTexture());
  materials.roots = new THREE.MeshStandardMaterial({ name: "roots", map: textures.bark, vertexColors: true, roughness: 0.92 });
  materials.foliage = softFoliage(new THREE.MeshLambertMaterial({
    name: "foliage",
    vertexColors: true,
    side: THREE.DoubleSide,
  }), { time: world.uniforms.time, upWeight: 0.7, wind: 0.012, translucency: 0.08, key: "foliage" });
  materials.pipes = new THREE.MeshStandardMaterial({ name: "pipes", vertexColors: true, roughness: 0.42, metalness: 0.55 });
  materials.neonPink = new THREE.MeshBasicMaterial({ name: "neonPink", color: new THREE.Color(4.2, 0.55, 1.35) });
  materials.neonCyan = new THREE.MeshBasicMaterial({ name: "neonCyan", color: new THREE.Color(0.35, 3.2, 3.8) });
  materials.warmGlow = new THREE.MeshBasicMaterial({ name: "warmGlow", color: new THREE.Color(3.4, 1.9, 0.8), vertexColors: true });
  materials.lightPools = new THREE.MeshBasicMaterial({
    name: "lightPools",
    map: textures.lightPool,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  materials.stone = new THREE.MeshStandardMaterial({ name: "stone", map: textures.chapelFieldstone, vertexColors: true, roughness: 0.93 });
  materials.plaster = new THREE.MeshStandardMaterial({ name: "plaster", vertexColors: true, roughness: 0.88 });
  materials.wood = new THREE.MeshStandardMaterial({ name: "wood", vertexColors: true, roughness: 0.8, map: textures.woodGrain });
  materials.metal = new THREE.MeshStandardMaterial({ name: "metal", vertexColors: true, roughness: 0.38, metalness: 0.85 });
  materials.paint = new THREE.MeshStandardMaterial({ name: "paint", vertexColors: true, roughness: 0.55, metalness: 0.05 });
  materials.concrete = new THREE.MeshStandardMaterial({ name: "concrete", map: textures.concrete, vertexColors: true, roughness: 0.82 });
}

