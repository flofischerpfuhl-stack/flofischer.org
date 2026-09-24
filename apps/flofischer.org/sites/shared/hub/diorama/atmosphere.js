import * as THREE from "three";
import { GLSL_NOISE, rng } from "./utils.js";
import { RX, RZ, TOP, insideIsland } from "./layout.js";

export const SUN_DIRECTION = new THREE.Vector3(-0.62, 0.34, 0.42).normalize();
export const MOON_DIRECTION = new THREE.Vector3(0.58, 0.46, -0.52).normalize();

function buildSky(world) {
  const material = new THREE.ShaderMaterial({
    name: "sky",
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSide: world.uniforms.side,
      uTime: world.uniforms.time,
      uSunDir: { value: SUN_DIRECTION },
      uMoonDir: { value: MOON_DIRECTION },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = vec4(clip.xy, clip.w * 0.99999, clip.w);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uSide;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uMoonDir;
      varying vec3 vDirection;
      ${GLSL_NOISE}
      float ffHash13(vec3 p3) {
        p3 = fract(p3 * 0.1031);
        p3 += dot(p3, p3.zyx + 31.32);
        return fract((p3.x + p3.y) * p3.z);
      }
      float fbm(vec2 p) {
        float sum = 0.0;
        float amplitude = 0.5;
        for (int octave = 0; octave < 3; octave++) {
          sum += ffNoise2(p) * amplitude;
          p = p * 2.03 + vec2(17.1, 9.2);
          amplitude *= 0.5;
        }
        return sum;
      }
      void main() {
        vec3 d = normalize(vDirection);
        float h = d.y;
        float sunDot = max(dot(d, uSunDir), 0.0);
        vec3 zenith = vec3(0.2, 0.36, 0.58);
        vec3 horizon = vec3(1.0, 0.62, 0.34);
        vec3 below = vec3(0.86, 0.58, 0.46);
        vec3 deep = vec3(0.36, 0.29, 0.38);
        vec3 day = mix(horizon, zenith, smoothstep(-0.02, 0.62, h));
        day = mix(day, below, smoothstep(0.0, -0.22, h));
        day = mix(day, deep, smoothstep(-0.15, -0.9, h));
        // Warm light spilling over the cloud sea beneath the sun.
        float sunSide = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);
        day += vec3(0.5, 0.26, 0.1) * pow(sunSide, 3.0) * smoothstep(-0.7, -0.05, h) * smoothstep(0.1, -0.05, h) * 0.55;
        day += vec3(1.0, 0.45, 0.14) * pow(sunDot, 4.0) * 0.5;
        day += vec3(1.0, 0.78, 0.5) * pow(sunDot, 48.0) * 0.9;
        day += vec3(1.0, 0.92, 0.72) * smoothstep(0.9990, 0.9995, sunDot) * 8.0;

        // Branches are coherent across large screen regions, so skipping the
        // cloud and star work below the horizon is a real saving.
        float cloud = 0.0;
        if (h > -0.12 && h < 0.9) {
          vec2 cloudUv = d.xz / max(h + 0.22, 0.06) * 0.85;
          float cloudNoise = fbm(cloudUv * 1.4 + vec2(uTime * 0.006, uTime * 0.002));
          cloud = smoothstep(0.5, 0.78, cloudNoise) * smoothstep(-0.12, 0.2, h) * (1.0 - smoothstep(0.55, 0.9, h));
        }
        vec3 cloudDay = mix(vec3(0.86, 0.5, 0.44), vec3(1.0, 0.84, 0.66), pow(sunDot, 2.0));
        day = mix(day, cloudDay, cloud * 0.62);

        vec3 night = mix(vec3(0.05, 0.035, 0.085), vec3(0.006, 0.01, 0.03), smoothstep(-0.05, 0.55, h));
        night = mix(night, vec3(0.012, 0.01, 0.02), smoothstep(-0.2, -0.9, h));
        night += vec3(0.55, 0.06, 0.32) * exp(-abs(h - 0.02) * 8.0) * 0.16;
        night += vec3(0.04, 0.32, 0.42) * exp(-abs(h + 0.14) * 5.0) * 0.07;
        if (h > 0.02 && uSide > 0.02) {
          vec3 starCell = floor(d * 170.0);
          vec3 starLocal = fract(d * 170.0) - 0.5;
          float starSeed = ffHash13(starCell);
          float star = step(0.9962, starSeed) * smoothstep(0.32, 0.0, length(starLocal));
          star *= 0.55 + 0.45 * sin(uTime * (0.8 + starSeed * 3.0) + starSeed * 60.0);
          night += vec3(0.85, 0.92, 1.0) * star * smoothstep(0.02, 0.25, h) * 1.6 * (1.0 - cloud);
        }
        float moonDot = dot(d, uMoonDir);
        float moonDisc = smoothstep(0.99935, 0.9996, moonDot);
        float crater = ffNoise2(d.xy * 900.0) * 0.25;
        night += vec3(0.9, 0.93, 1.0) * moonDisc * (2.2 - crater);
        night += vec3(0.35, 0.45, 0.7) * pow(max(moonDot, 0.0), 60.0) * 0.3;
        vec3 cloudNight = vec3(0.05, 0.035, 0.08) + vec3(0.32, 0.05, 0.2) * smoothstep(0.35, 0.0, h) * 0.35;
        night = mix(night, cloudNight, cloud * 0.72);

        gl_FragColor = vec4(mix(day, night, uSide), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 20), material);
  sky.frustumCulled = false;
  // Drawn after the opaque island so only genuinely visible sky pixels are shaded.
  sky.renderOrder = 10;
  sky.name = "sky";
  world.scene.add(sky);
  world.sky = sky;
}

/**
 * Every soft billboard in one draw call: the cloud sea below the island, the
 * waterfall mist and steam rising from Gehirn's manholes.
 */
function buildClouds(world) {
  const random = rng(606);
  const entries = [];
  const low = world.quality.low;
  const cloudCount = low ? 16 : 30;
  for (let index = 0; index < cloudCount; index += 1) {
    const angle = random() * Math.PI * 2;
    const ring = index < cloudCount * 0.65;
    const radius = ring ? 10 + random() * 9 : 18 + random() * 8;
    const y = ring ? -6.5 - random() * 6 : -3 + random() * 7;
    entries.push({ x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius * 0.8, size: ring ? 5 + random() * 5 : 6 + random() * 6, alpha: ring ? 0.35 + random() * 0.3 : 0.3 + random() * 0.2, kind: 0, stretch: 1.3 + random() * 0.7 });
  }
  for (const mist of world.mist) {
    entries.push({ x: mist.position.x, y: mist.position.y, z: mist.position.z, size: mist.size, alpha: mist.alpha, kind: 1, stretch: 1 });
  }
  for (const vent of world.steam) {
    for (let puff = 0; puff < 4; puff += 1) {
      entries.push({ x: vent.x, y: vent.y, z: vent.z, size: 0.75, alpha: 0.2, kind: 2, stretch: 1, seed: puff / 4 });
    }
  }
  const geometry = new THREE.InstancedBufferGeometry();
  const plane = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute("position", plane.attributes.position);
  geometry.setAttribute("uv", plane.attributes.uv);
  geometry.setIndex(plane.index);
  const centers = new Float32Array(entries.length * 4);
  const info = new Float32Array(entries.length * 4);
  entries.forEach((entry, index) => {
    centers.set([entry.x, entry.y, entry.z, entry.size], index * 4);
    info.set([entry.seed ?? random(), entry.alpha, entry.kind, entry.stretch], index * 4);
  });
  geometry.setAttribute("aCloud", new THREE.InstancedBufferAttribute(centers, 4));
  geometry.setAttribute("aInfo", new THREE.InstancedBufferAttribute(info, 4));
  geometry.instanceCount = entries.length;
  const material = new THREE.ShaderMaterial({
    name: "clouds",
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: world.uniforms.time,
      uMap: { value: world.textures.cloud },
      uLit: { value: new THREE.Color() },
      uShade: { value: new THREE.Color() },
      uSteam: { value: new THREE.Color(0.78, 0.72, 0.84) },
      uSteamOpacity: { value: 1 },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aCloud;
      attribute vec4 aInfo;
      uniform float uTime;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vSeed;
      varying float vKind;
      varying float vDepth;
      void main() {
        vec3 center = aCloud.xyz;
        float size = aCloud.w;
        float life = 1.0;
        if (aInfo.z > 1.5) {
          float t = fract(uTime * 0.16 + aInfo.x);
          center.y += t * 1.5;
          center.x += sin(t * 5.0 + aInfo.x * 11.0) * 0.14;
          size *= 0.35 + t * 1.3;
          life = sin(t * 3.14159);
        } else {
          center.x += sin(uTime * 0.045 + aInfo.x * 6.28) * 0.4;
          center.z += cos(uTime * 0.037 + aInfo.x * 3.1) * 0.3;
          if (aInfo.z > 0.5) size *= 1.0 + 0.12 * sin(uTime * 1.4 + aInfo.x * 9.0);
        }
        vec4 mvPosition = modelViewMatrix * vec4(center, 1.0);
        mvPosition.xy += position.xy * vec2(size * aInfo.w, size);
        gl_Position = projectionMatrix * mvPosition;
        vUv = uv;
        vAlpha = aInfo.y * life;
        vSeed = aInfo.x;
        vKind = aInfo.z;
        vDepth = -mvPosition.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uLit;
      uniform vec3 uShade;
      uniform vec3 uSteam;
      uniform float uSteamOpacity;
      uniform float uOpacity;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vSeed;
      varying float vKind;
      varying float vDepth;
      void main() {
        float angle = vSeed * 6.2831;
        vec2 centered = vUv - 0.5;
        vec2 rotated = vec2(centered.x * cos(angle) - centered.y * sin(angle), centered.x * sin(angle) + centered.y * cos(angle)) + 0.5;
        float mask = texture2D(uMap, vKind > 0.5 ? rotated : vUv).a;
        vec3 color = mix(uShade, uLit, smoothstep(0.15, 0.85, vUv.y));
        if (vKind > 1.5) color = uSteam;
        else if (vKind > 0.5) color = mix(uLit, vec3(1.0), 0.35);
        float alpha = mask * vAlpha * uOpacity * smoothstep(0.8, 5.0, vDepth) * (vKind > 1.5 ? uSteamOpacity : 1.0);
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const clouds = new THREE.Mesh(geometry, material);
  clouds.frustumCulled = false;
  clouds.renderOrder = 5;
  clouds.name = "clouds";
  world.scene.add(clouds);
  world.clouds = clouds;
}

function pointsMaterial(world, { vertex, fragment, blending = THREE.NormalBlending, uniforms = {} }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending,
    uniforms: {
      uTime: world.uniforms.time,
      uOpacity: { value: 1 },
      uPixelRatio: world.uniforms.pixelRatio,
      uMap: { value: world.textures.glow },
      ...uniforms,
    },
    vertexShader: vertex,
    fragmentShader: fragment,
  });
}

function buildParticles(world) {
  const low = world.quality.low;
  const random = rng(117);

  // Drifting blossom petals on the Seele side.
  const petalCount = low ? 110 : 320;
  const petalPositions = new Float32Array(petalCount * 3);
  const petalSeeds = new Float32Array(petalCount);
  for (let index = 0; index < petalCount; index += 1) {
    petalPositions.set([-7.6 + random() * 7.3, random() * 6.5, -5 + random() * 10], index * 3);
    petalSeeds[index] = random();
  }
  const petalGeometry = new THREE.BufferGeometry();
  petalGeometry.setAttribute("position", new THREE.BufferAttribute(petalPositions, 3));
  petalGeometry.setAttribute("aSeed", new THREE.BufferAttribute(petalSeeds, 1));
  const petals = new THREE.Points(petalGeometry, pointsMaterial(world, {
    vertex: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vSeed;
      void main() {
        vec3 p = position;
        float fall = 0.18 + aSeed * 0.2;
        p.y = ${TOP.toFixed(2)} + 0.05 + mod(p.y - uTime * fall, 6.5);
        p.x += sin(uTime * 0.55 + aSeed * 30.0) * 0.35;
        p.z += cos(uTime * 0.4 + aSeed * 17.0) * 0.28;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = (4.0 + aSeed * 3.0) * uPixelRatio * (10.0 / -mvPosition.z);
        vSeed = aSeed;
      }
    `,
    fragment: /* glsl */ `
      uniform float uOpacity;
      uniform float uTime;
      varying float vSeed;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float angle = vSeed * 6.28 + uTime * (0.6 + vSeed);
        c = vec2(c.x * cos(angle) - c.y * sin(angle), c.x * sin(angle) + c.y * cos(angle));
        float petal = smoothstep(0.5, 0.35, length(c * vec2(1.0, 1.9)));
        if (petal < 0.05) discard;
        vec3 color = mix(vec3(1.0, 0.86, 0.9), vec3(0.98, 0.62, 0.76), vSeed);
        gl_FragColor = vec4(color, petal * uOpacity * 0.9);
        #include <colorspace_fragment>
      }
    `,
  }));
  petals.frustumCulled = false;
  petals.name = "petals";
  world.scene.add(petals);

  // Fireflies.
  const fireflyCount = low ? 40 : 110;
  const fireflyPositions = new Float32Array(fireflyCount * 3);
  const fireflySeeds = new Float32Array(fireflyCount);
  for (let index = 0; index < fireflyCount; index += 1) {
    let x;
    let z;
    do {
      x = -7.4 + random() * 7;
      z = -5 + random() * 10;
    } while (!insideIsland(x, z, 0.4));
    fireflyPositions.set([x, TOP + 0.3 + random() * 2.4, z], index * 3);
    fireflySeeds[index] = random();
  }
  const fireflyGeometry = new THREE.BufferGeometry();
  fireflyGeometry.setAttribute("position", new THREE.BufferAttribute(fireflyPositions, 3));
  fireflyGeometry.setAttribute("aSeed", new THREE.BufferAttribute(fireflySeeds, 1));
  const fireflies = new THREE.Points(fireflyGeometry, pointsMaterial(world, {
    blending: THREE.AdditiveBlending,
    vertex: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vGlow;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.3 + aSeed * 40.0) * 0.35;
        p.y += sin(uTime * 0.5 + aSeed * 23.0) * 0.18;
        p.z += cos(uTime * 0.27 + aSeed * 31.0) * 0.35;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vGlow = pow(max(sin(uTime * (1.2 + aSeed) + aSeed * 50.0), 0.0), 3.0);
        gl_PointSize = (5.0 + vGlow * 7.0) * uPixelRatio * (10.0 / -mvPosition.z);
      }
    `,
    fragment: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uOpacity;
      varying float vGlow;
      void main() {
        float glow = texture2D(uMap, gl_PointCoord).a;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.36) * (0.4 + vGlow * 1.6), glow * uOpacity * (0.25 + vGlow));
      }
    `,
  }));
  fireflies.frustumCulled = false;
  fireflies.name = "fireflies";
  world.scene.add(fireflies);

  // GPU rain on the Gehirn side: each streak loops without CPU updates.
  const rainCount = low ? 260 : 900;
  const rainPositions = new Float32Array(rainCount * 6);
  const rainEnds = new Float32Array(rainCount * 2);
  const rainSpeeds = new Float32Array(rainCount * 2);
  const rainFloors = new Float32Array(rainCount * 2);
  for (let index = 0; index < rainCount; index += 1) {
    const x = 0.15 + random() * (RX + 0.6);
    const z = (random() * 2 - 1) * (RZ + 0.5);
    const y = random() * 10.5;
    const speed = 6.5 + random() * 3;
    const floor = insideIsland(x, z, -0.02) ? TOP + 0.02 : -7;
    rainPositions.set([x, y, z, x, y, z], index * 6);
    rainEnds.set([0, 1], index * 2);
    rainSpeeds.set([speed, speed], index * 2);
    rainFloors.set([floor, floor], index * 2);
  }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
  rainGeometry.setAttribute("aEnd", new THREE.BufferAttribute(rainEnds, 1));
  rainGeometry.setAttribute("aSpeed", new THREE.BufferAttribute(rainSpeeds, 1));
  rainGeometry.setAttribute("aFloor", new THREE.BufferAttribute(rainFloors, 1));
  const rainMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: world.uniforms.time, uOpacity: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aEnd;
      attribute float aSpeed;
      attribute float aFloor;
      uniform float uTime;
      varying float vFade;
      void main() {
        float top = 10.5;
        float y = top - mod(top - position.y + uTime * aSpeed, top - aFloor);
        vec3 p = vec3(position.x - (top - y) * 0.06, y - aEnd * 0.32, position.z);
        vFade = aEnd;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vFade;
      void main() {
        gl_FragColor = vec4(vec3(0.66, 0.84, 0.95), uOpacity * (0.25 + vFade * 0.75));
        #include <colorspace_fragment>
      }
    `,
  });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial);
  rain.frustumCulled = false;
  rain.name = "rain";
  world.scene.add(rain);

  world.particles = { petals, fireflies, rain };
}

export function buildAtmosphere(world) {
  buildSky(world);
  buildClouds(world);
  buildParticles(world);
}
