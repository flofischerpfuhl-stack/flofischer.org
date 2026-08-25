import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createLook } from "./player.js";

const TEX = "/shared/hub/textures";
const ART = "/shared/hub/art";
const SYMBOLS = "/shared/seele/symbols";
const dummy = new THREE.Object3D();
const _color = new THREE.Color();
const FOG_SEELE = new THREE.Color(0xd08a38);
const FOG_GEHIRN = new THREE.Color(0x0a0810);

const PORTALS = [
  { id: "seele", x: -1.85, z: 1.25, r: 2.8, url: "https://seele.flofischer.org/", local: "/__seele/" },
  { id: "gehirn", x: 1.85, z: 1.25, r: 2.8, url: "https://gehirn.flofischer.org/", local: "/__gehirn/" },
];

function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function smoothstep(a, b, x) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function vnoise(x, z) {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const h = (ix, iz) => {
    const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(h(i, j), h(i + 1, j), ux),
    THREE.MathUtils.lerp(h(i, j + 1), h(i + 1, j + 1), ux),
    uz
  );
}

function fbm(x, z) {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let n = 0; n < 4; n += 1) {
    v += vnoise(x * f, z * f) * a;
    a *= 0.5;
    f *= 2.05;
  }
  return v;
}

function riverCenterAt(z) {
  const distance = THREE.MathUtils.clamp((5 - z) / 30, 0, 1);
  return -1.18 - distance * 10.45 + Math.sin((z + 2.4) * 0.29) * 0.34;
}

function riverHalfWidthAt(z) {
  const distance = THREE.MathUtils.clamp((5 - z) / 30, 0, 1);
  return THREE.MathUtils.lerp(2.45, 1.48, distance) + Math.sin(z * 0.41) * 0.08;
}

function heightAt(x, z) {
  const n = fbm(x * 0.11, z * 0.11);
  const side = smoothstep(-3.5, 3.5, x);
  const riverCenter = riverCenterAt(z);
  const riverWidth = riverHalfWidthAt(z);
  const riverDistance = Math.abs(x - riverCenter);
  const riverBed = 1 - smoothstep(riverWidth * 0.72, riverWidth * 1.04, riverDistance);
  const bank = smoothstep(riverWidth * 0.63, riverWidth * 1.08, riverDistance)
    * (1 - smoothstep(riverWidth * 1.05, riverWidth * 1.92, riverDistance));
  const gardenBase = (n - 0.44) * 0.72 + Math.sin(x * 0.29 + z * 0.09) * 0.1;
  const riverFloor = -0.58 + (n - 0.5) * 0.12;
  const garden = THREE.MathUtils.lerp(gardenBase + bank * (0.24 + n * 0.28), riverFloor, riverBed);
  const court = (n - 0.5) * 0.12;
  const knoll = Math.exp(-((x + 8.5) ** 2 + (z + 5) ** 2) / 30) * 0.72;
  return THREE.MathUtils.lerp(garden + knoll, court, side);
}

function isRiver(x, z, margin = 0) {
  const center = riverCenterAt(z);
  const width = riverHalfWidthAt(z) + margin;
  return Math.abs(x - center) < width;
}

function configureTex(tex, { repeat = 0, aniso = 8 } = {}) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
  }
  return tex;
}

function loadTex(loader, url, opts) {
  return new Promise((resolve) => {
    loader.load(url, (tex) => resolve(configureTex(tex, opts)), undefined, () => resolve(null));
  });
}

function petalCanvas(hexA, hexB) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(28, 22, 3, 32, 32, 26);
  grad.addColorStop(0, hexA);
  grad.addColorStop(0.55, hexB);
  grad.addColorStop(1, "rgba(255,120,160,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(32, 8);
  g.bezierCurveTo(54, 12, 56, 38, 32, 58);
  g.bezierCurveTo(8, 38, 10, 12, 32, 8);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function flowerCanvas() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.translate(64, 64);
  g.fillStyle = "#f7f1e4";
  for (let i = 0; i < 6; i += 1) {
    g.rotate(Math.PI / 3);
    g.beginPath();
    g.ellipse(0, -22, 9, 24, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#e6c14a";
  g.beginPath();
  g.arc(0, 0, 7, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function leafCanvas() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const gradient = g.createLinearGradient(24, 102, 96, 20);
  gradient.addColorStop(0, "rgba(17,65,35,0.98)");
  gradient.addColorStop(0.55, "rgba(74,146,65,1)");
  gradient.addColorStop(1, "rgba(154,190,81,0.96)");
  g.fillStyle = gradient;
  g.beginPath();
  g.moveTo(64, 8);
  g.bezierCurveTo(108, 29, 111, 78, 64, 118);
  g.bezierCurveTo(18, 80, 20, 29, 64, 8);
  g.fill();
  g.strokeStyle = "rgba(229,238,174,0.72)";
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(64, 112);
  g.lineTo(64, 18);
  g.stroke();
  g.lineWidth = 1.2;
  for (let y = 34; y < 102; y += 13) {
    const spread = (108 - y) * 0.34;
    g.beginPath();
    g.moveTo(64, y);
    g.lineTo(64 - spread, y - 11);
    g.moveTo(64, y);
    g.lineTo(64 + spread, y - 11);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function paintSeeleSign(ctx, w, h, language) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#e9e1d0";
  ctx.fillRect(0, 0, w, h);

  const paper = rng(812);
  for (let index = 0; index < 2100; index += 1) {
    const alpha = 0.018 + paper() * 0.026;
    ctx.fillStyle = paper() > 0.55
      ? `rgba(74,56,34,${alpha})`
      : `rgba(255,250,230,${alpha})`;
    const size = 0.5 + paper() * 1.5;
    ctx.fillRect(paper() * w, paper() * h, size, size);
  }

  ctx.strokeStyle = "#171410";
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 18, w - 36, h - 36);
  ctx.lineWidth = 2;
  ctx.strokeRect(34, 34, w - 68, h - 68);

  ctx.save();
  ctx.translate(w * 0.82, h * 0.73);
  ctx.strokeStyle = "rgba(49,65,35,0.82)";
  ctx.fillStyle = "rgba(61,82,42,0.82)";
  ctx.lineCap = "round";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 110);
  ctx.bezierCurveTo(-10, 40, 16, -22, -5, -126);
  ctx.stroke();
  for (let index = 0; index < 8; index += 1) {
    const y = 82 - index * 28;
    const side = index % 2 ? -1 : 1;
    ctx.save();
    ctx.translate(side * (8 + index * 1.3), y);
    ctx.rotate(side * (0.6 + index * 0.025));
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 31, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = "rgba(138,68,38,0.88)";
  for (let index = 0; index < 5; index += 1) {
    ctx.beginPath();
    ctx.arc(-5 + Math.sin(index * 2.1) * 18, 18 - index * 31, 8 - index * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = "#171410";
  ctx.textAlign = "left";
  ctx.font = "400 214px Marlboro, Impact, serif";
  ctx.fillText("SEELE", 86, h * 0.55);
  ctx.font = "600 27px Geist, sans-serif";
  ctx.letterSpacing = "7px";
  ctx.fillText(language === "de" ? "APOLOGETIK" : "APOLOGETICS", 94, h * 0.73);
  ctx.letterSpacing = "0px";
}

function paintGehirnSign(ctx, w, h, language) {
  ctx.fillStyle = "#131315";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ef3157";
  ctx.fillRect(0, 0, 8, h);
  ctx.fillStyle = "#00bed7";
  ctx.fillRect(w - 8, 0, 8, h);
  ctx.textAlign = "center";
  ctx.font = "600 150px 'Cormorant Garamond', Georgia, serif";
  ctx.fillStyle = "rgba(239,49,87,0.9)";
  ctx.fillText("GEHIRN", w / 2 - 5, h * 0.55);
  ctx.fillStyle = "rgba(0,190,215,0.9)";
  ctx.fillText("GEHIRN", w / 2 + 5, h * 0.55);
  ctx.fillStyle = "#efede8";
  ctx.fillText("GEHIRN", w / 2, h * 0.55);
  ctx.font = "400 26px 'Share Tech Mono', monospace";
  ctx.fillStyle = "#b8b4ad";
  ctx.fillText(language === "de" ? "PROJEKTE" : "PROJECTS", w / 2, h * 0.78);
}

function makeSignTexture(paint, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return {
    texture,
    redraw(language, extra) {
      paint(ctx, w, h, language, extra);
      texture.needsUpdate = true;
    },
  };
}

function curvedPlateGeometry(width, height, depth) {
  const geometry = new THREE.PlaneGeometry(width, height, 64, 18);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const normalized = Math.abs(position.getX(index)) / (width * 0.5);
    position.setZ(index, -Math.pow(normalized, 1.75) * depth);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function backdropMaterial(texture, innerSide) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: {
      uMap: { value: texture },
      uInnerSide: { value: innerSide },
    },
    vertexShader: [
      "varying vec2 vUv;",
      "void main(){",
      "  vUv = uv;",
      "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform sampler2D uMap;",
      "uniform float uInnerSide;",
      "varying vec2 vUv;",
      "void main(){",
      "  vec4 image = texture2D(uMap, vUv);",
      "  float topBottom = smoothstep(0.0, 0.045, vUv.y) * smoothstep(0.0, 0.05, 1.0-vUv.y);",
      "  float outer = uInnerSide > 0.0 ? smoothstep(0.0, 0.08, vUv.x) : smoothstep(0.0, 0.08, 1.0-vUv.x);",
      "  float inner = uInnerSide > 0.0 ? smoothstep(0.0, 0.2, 1.0-vUv.x) : smoothstep(0.0, 0.2, vUv.x);",
      "  gl_FragColor = vec4(image.rgb, image.a * topBottom * outer * mix(0.35, 1.0, inner));",
      "}",
    ].join("\n"),
  });
}

function panoramaMaterial(texture, side) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    transparent: true,
    uniforms: {
      uMap: { value: texture },
      uSide: { value: side },
    },
    vertexShader: [
      "varying vec3 vDirection;",
      "void main(){",
      "  vDirection = position;",
      "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform sampler2D uMap;",
      "uniform float uSide;",
      "varying vec3 vDirection;",
      "void main(){",
      "  vec3 direction = normalize(vDirection);",
      "  float angle = atan(direction.x, -direction.z);",
      "  float leftU = clamp(1.0 + angle / 1.45, 0.0, 1.0);",
      "  float rightU = clamp(angle / 1.45, 0.0, 1.0);",
      "  float imageU = mix(leftU, rightU, step(0.0, uSide));",
      "  float imageV = clamp(0.52 + asin(direction.y) / 1.35, 0.0, 1.0);",
      "  vec4 image = texture2D(uMap, vec2(imageU, imageV));",
      "  float leftMask = 1.0 - smoothstep(-0.075, 0.08, angle);",
      "  float rightMask = smoothstep(-0.08, 0.075, angle);",
      "  float mask = mix(leftMask, rightMask, step(0.0, uSide));",
      "  gl_FragColor = vec4(image.rgb, image.a * mask);",
      "}",
    ].join("\n"),
  });
}

function createRiverStrip({ rows = 72, columns = 14, inset = 0 }) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const bases = [];
  for (let row = 0; row <= rows; row += 1) {
    const progress = row / rows;
    const z = 7 - progress * 31;
    const center = riverCenterAt(z);
    const width = Math.max(0.25, riverHalfWidthAt(z) - inset);
    for (let column = 0; column <= columns; column += 1) {
      const across = column / columns;
      const x = center + THREE.MathUtils.lerp(-width, width, across);
      positions.push(x, 0.115, z);
      bases.push(x, z, across);
      uvs.push(across * 2.4, progress * 10.0);
    }
  }
  const stride = columns + 1;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * stride + column;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.userData.bases = bases;
  return geometry;
}

function createRiver(scene, qualityLow, normalTexture, bedTexture) {
  if (normalTexture) {
    normalTexture.colorSpace = THREE.NoColorSpace;
    normalTexture.wrapS = normalTexture.wrapT = THREE.RepeatWrapping;
    normalTexture.repeat.set(2.2, 7.5);
  }
  const waterGeometry = createRiverStrip({
    rows: qualityLow ? 46 : 74,
    columns: qualityLow ? 8 : 16,
    inset: 0.08,
  });
  const cubeTarget = new THREE.WebGLCubeRenderTarget(qualityLow ? 64 : 128, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    colorSpace: THREE.SRGBColorSpace,
  });
  const cubeCamera = new THREE.CubeCamera(0.15, 72, cubeTarget);
  cubeCamera.position.set(-4.2, 0.6, -2.8);
  scene.add(cubeCamera);
  const waterMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: true,
    uniforms: {
      uNormalMap: { value: normalTexture },
      uEnvMap: { value: cubeTarget.texture },
      uTime: { value: 0 },
      uFogColor: { value: FOG_SEELE.clone() },
      uFogNear: { value: 11 },
      uFogFar: { value: 38 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform sampler2D uNormalMap;
      uniform samplerCube uEnvMap;
      uniform float uTime;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vec2 flowA = vec2(uTime * 0.011, uTime * 0.026);
        vec2 flowB = vec2(-uTime * 0.017, uTime * 0.013);
        vec3 normalA = texture2D(uNormalMap, vUv * vec2(0.72, 0.46) + flowA).xyz * 2.0 - 1.0;
        vec3 normalB = texture2D(uNormalMap, vUv.yx * vec2(0.54, 0.83) + flowB).xyz * 2.0 - 1.0;
        vec3 waterNormal = normalize(vec3(
          (normalA.x + normalB.y) * 0.27,
          1.0,
          (normalA.y + normalB.x) * 0.23
        ));
        vec3 viewDir = normalize(cameraPosition - vWorld);
        vec3 reflected = textureCube(uEnvMap, reflect(-viewDir, waterNormal)).rgb;
        float fresnel = 0.13 + 0.78 * pow(1.0 - max(dot(viewDir, waterNormal), 0.0), 3.6);
        float ribbon = sin(vUv.y * 5.4 - uTime * 0.42 + sin(vUv.x * 8.0)) * 0.5 + 0.5;
        vec3 deep = vec3(0.018, 0.19, 0.17);
        vec3 shallow = vec3(0.035, 0.37, 0.32);
        vec3 color = mix(deep, shallow, 0.34 + ribbon * 0.12);
        color = mix(color, reflected, fresnel * 0.72);
        vec3 sunDir = normalize(vec3(-0.72, 0.56, 0.24));
        float glint = pow(max(dot(reflect(-sunDir, waterNormal), viewDir), 0.0), 118.0);
        color += vec3(1.0, 0.68, 0.3) * glint * 1.3;
        color += vec3(0.12, 0.34, 0.27) * pow(max(0.0, 1.0 - abs(vUv.x - 1.2) / 1.2), 4.0) * 0.08;
        float distanceToCamera = length(vWorld - cameraPosition);
        color = mix(color, uFogColor, smoothstep(uFogNear, uFogFar, distanceToCamera));
        gl_FragColor = vec4(color, 0.84);
      }
    `,
  });
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.renderOrder = 3;
  scene.add(water);

  const riverbed = new THREE.Mesh(
    createRiverStrip({ rows: qualityLow ? 32 : 58, columns: qualityLow ? 7 : 12, inset: 0.18 }),
    new THREE.MeshStandardMaterial({
      color: 0x2c3d31,
      map: bedTexture || null,
      roughness: 1,
      metalness: 0,
    })
  );
  const bedPosition = riverbed.geometry.attributes.position;
  const bedBases = riverbed.geometry.userData.bases;
  for (let index = 0; index < bedPosition.count; index += 1) {
    const x = bedBases[index * 3];
    const z = bedBases[index * 3 + 1];
    const across = bedBases[index * 3 + 2];
    const bowl = Math.sin(across * Math.PI);
    bedPosition.setY(index, -0.2 - bowl * 0.28 + (fbm(x * 0.4, z * 0.4) - 0.5) * 0.08);
  }
  bedPosition.needsUpdate = true;
  riverbed.geometry.computeVertexNormals();
  riverbed.receiveShadow = true;
  scene.add(riverbed);

  return { water, riverbed, cubeCamera, cubeTarget, normalTexture };
}

function irregularRockGeometry(seed, detail = 2) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const position = geometry.attributes.position;
  const random = rng(seed);
  const stretch = new THREE.Vector3(0.88 + random() * 0.44, 0.5 + random() * 0.2, 0.82 + random() * 0.46);
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const detailNoise = 0.82 + fbm((x + seed) * 1.8, (z - seed) * 1.8) * 0.34;
    position.setXYZ(index, x * stretch.x * detailNoise, y * stretch.y * detailNoise, z * stretch.z * detailNoise);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createRiverRocks(scene, qualityLow, rockTexture, rockNormal, rockRoughness) {
  const materials = [0x45453a, 0x5d5a45, 0x373d33].map((color) => new THREE.MeshStandardMaterial({
    color,
    map: rockTexture || null,
    normalMap: rockNormal || null,
    normalScale: new THREE.Vector2(0.52, 0.52),
    roughnessMap: rockRoughness || null,
    roughness: 0.9,
    metalness: 0.01,
    emissive: 0x11180e,
    emissiveIntensity: 0.12,
  }));
  const group = new THREE.Group();
  const random = rng(308);
  const count = qualityLow ? 24 : 42;
  for (let index = 0; index < count; index += 1) {
    const z = 6.2 - random() * 26;
    const center = riverCenterAt(z);
    const width = riverHalfWidthAt(z);
    const direction = index % 2 ? 1 : -1;
    const x = center + direction * (width + 0.12 + random() * 1.22);
    const rock = new THREE.Mesh(irregularRockGeometry(420 + index, qualityLow ? 1 : 2), materials[index % materials.length]);
    const size = 0.36 + random() * (z > -4 ? 0.95 : 0.64);
    rock.position.set(x, heightAt(x, z) + size * 0.2 - 0.1, z);
    rock.scale.set(size * (0.9 + random() * 0.65), size, size * (0.8 + random() * 0.7));
    rock.rotation.set(random() * 0.22, random() * Math.PI * 2, (random() - 0.5) * 0.18);
    rock.castShadow = !qualityLow;
    rock.receiveShadow = true;
    group.add(rock);
  }
  const submergedCount = qualityLow ? 8 : 14;
  for (let index = 0; index < submergedCount; index += 1) {
    const z = 4 - random() * 20;
    const width = riverHalfWidthAt(z) * 0.68;
    const x = riverCenterAt(z) + (random() - 0.5) * width * 2;
    const rock = new THREE.Mesh(irregularRockGeometry(710 + index, 1), materials[(index + 1) % materials.length]);
    const size = 0.22 + random() * 0.48;
    rock.position.set(x, -0.14 - random() * 0.17, z);
    rock.scale.set(size * 1.3, size * 0.7, size);
    rock.rotation.y = random() * Math.PI;
    group.add(rock);
  }
  scene.add(group);
  return group;
}

function softMistTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(128, 64, 4, 128, 64, 122);
  gradient.addColorStop(0, "rgba(255,239,205,0.72)");
  gradient.addColorStop(0.38, "rgba(230,242,210,0.32)");
  gradient.addColorStop(1, "rgba(218,232,200,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createRiverMist(scene, qualityLow) {
  const texture = softMistTexture();
  const random = rng(551);
  const sprites = [];
  const count = qualityLow ? 5 : 9;
  for (let index = 0; index < count; index += 1) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: index % 2 ? 0xe1e8cd : 0xffdfaa,
      transparent: true,
      opacity: 0.055 + random() * 0.065,
      depthWrite: false,
      blending: THREE.NormalBlending,
      fog: true,
    });
    const sprite = new THREE.Sprite(material);
    const z = 2 - random() * 19;
    sprite.position.set(riverCenterAt(z) + (random() - 0.5) * riverHalfWidthAt(z), 0.65 + random() * 1.2, z);
    const scale = 4.5 + random() * 5.8;
    sprite.scale.set(scale, scale * 0.38, 1);
    sprite.userData.drift = 0.09 + random() * 0.12;
    sprite.userData.phase = random() * Math.PI * 2;
    scene.add(sprite);
    sprites.push(sprite);
  }
  return sprites;
}

function createFernBanks(scene, source, qualityLow) {
  if (!source) return { group: null, plants: [] };
  source.traverse((object) => {
    if (!object.isMesh) return;
    object.material = object.material.clone();
    object.material.side = THREE.DoubleSide;
    object.material.alphaTest = Math.max(object.material.alphaTest || 0, 0.16);
    object.material.transparent = false;
    object.material.roughness = Math.max(object.material.roughness || 0.5, 0.68);
    object.castShadow = !qualityLow;
    object.receiveShadow = true;
  });
  const group = new THREE.Group();
  const plants = [];
  const random = rng(1541);
  const count = qualityLow ? 15 : 27;
  for (let index = 0; index < count; index += 1) {
    const plant = source.clone(true);
    const z = 5.7 - random() * 24;
    const direction = index % 2 ? 1 : -1;
    const x = riverCenterAt(z) + direction * (riverHalfWidthAt(z) + 0.32 + random() * 1.65);
    const scale = 0.46 + random() * 0.62;
    plant.position.set(x, heightAt(x, z) - 0.03, z);
    plant.rotation.y = random() * Math.PI * 2;
    plant.rotation.z = (random() - 0.5) * 0.09;
    plant.scale.setScalar(scale);
    plant.userData.baseRotationZ = plant.rotation.z;
    plant.userData.phase = random() * Math.PI * 2;
    group.add(plant);
    plants.push(plant);
  }
  scene.add(group);
  return { group, plants };
}

function createMossRockBanks(scene, source, qualityLow) {
  if (!source) return null;
  const templates = source.children.length ? source.children : [source];
  templates.forEach((template) => {
    template.traverse((object) => {
      if (!object.isMesh) return;
      object.material = object.material.clone();
      object.material.roughness = Math.max(object.material.roughness || 0.5, 0.78);
      object.castShadow = !qualityLow;
      object.receiveShadow = true;
    });
  });
  const group = new THREE.Group();
  const random = rng(2088);
  const count = qualityLow ? 18 : 32;
  for (let index = 0; index < count; index += 1) {
    const rock = templates[index % templates.length].clone(true);
    const z = 5.4 - random() * 25;
    const direction = index % 2 ? 1 : -1;
    const x = riverCenterAt(z) + direction * (riverHalfWidthAt(z) + 0.08 + random() * 1.2);
    const scale = 0.34 + random() * (z > -3 ? 0.62 : 0.42);
    rock.position.set(x, heightAt(x, z) - 0.08, z);
    rock.rotation.set((random() - 0.5) * 0.18, random() * Math.PI * 2, (random() - 0.5) * 0.12);
    rock.scale.setScalar(scale);
    group.add(rock);
  }
  scene.add(group);
  return group;
}

function createWindCutout(texture, position, width, rotationY, aspect = 1.5) {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.045,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: true,
  });
  const time = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = time;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nuniform float uWindTime;\nvarying vec2 vCutoutUv;"
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      [
        "#include <begin_vertex>",
        "vCutoutUv = uv;",
        "float anchored = smoothstep(0.05, 0.78, uv.y);",
        "transformed.x += sin(uWindTime * 0.72 + uv.y * 5.0 + position.x * 0.25) * 0.055 * anchored;",
        "transformed.z += cos(uWindTime * 0.54 + uv.x * 7.0) * 0.04 * anchored;",
      ].join("\n")
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec2 vCutoutUv;"
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <alphatest_fragment>",
      [
        "float edgeFeather = smoothstep(0.0, 0.085, vCutoutUv.x)",
        "  * smoothstep(0.0, 0.085, 1.0 - vCutoutUv.x)",
        "  * smoothstep(0.0, 0.055, vCutoutUv.y)",
        "  * smoothstep(0.0, 0.055, 1.0 - vCutoutUv.y);",
        "diffuseColor.a *= edgeFeather;",
        "#include <alphatest_fragment>",
      ].join("\n")
    );
  };
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / aspect, 32, 20),
    material
  );
  mesh.position.copy(position);
  mesh.rotation.y = rotationY;
  mesh.renderOrder = 5;
  mesh.userData.windTime = time;
  return mesh;
}

export async function startHub({ canvas, onFrame, reducedMotion }) {
  const qualityLow =
    window.matchMedia("(max-width: 820px), (pointer: coarse)").matches ||
    (navigator.hardwareConcurrency || 8) <= 4;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !qualityLow,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualityLow ? 1.25 : 1.7));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  renderer.shadowMap.enabled = !qualityLow;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG_SEELE.clone(), 12, 42);
  scene.background = FOG_SEELE.clone();

  const camera = new THREE.PerspectiveCamera(47, window.innerWidth / window.innerHeight, 0.08, 160);

  const manager = new THREE.LoadingManager();
  const loader = new THREE.TextureLoader(manager);
  const [
    meadow, forestFloor, forestFloorNormal, forestFloorRoughness,
    mossyRock, mossyRockNormal, mossyRockRoughness, waterNormals,
    asphalt, wood, bark, cobble,
    facadeA, facadeB, cross, lilies, seeleBackdropTex, gehirnBackdropTex,
    seeleForegroundTex, gehirnForegroundTex,
  ] = await Promise.all([
    loadTex(loader, `${TEX}/meadow.jpg`, { repeat: 1 }),
    loadTex(loader, `${TEX}/forest-floor.jpg`, { repeat: 2.8 }),
    loadTex(loader, `${TEX}/forest-floor-normal.jpg`, { repeat: 2.8 }),
    loadTex(loader, `${TEX}/forest-floor-roughness.jpg`, { repeat: 2.8 }),
    loadTex(loader, `${TEX}/mossy-rock.jpg`, { repeat: 1.6 }),
    loadTex(loader, `${TEX}/mossy-rock-normal.jpg`, { repeat: 1.6 }),
    loadTex(loader, `${TEX}/mossy-rock-roughness.jpg`, { repeat: 1.6 }),
    loadTex(loader, `${TEX}/waternormals.jpg`, { repeat: 1 }),
    loadTex(loader, `${TEX}/asphalt.jpg`, { repeat: 1 }),
    loadTex(loader, `${TEX}/wood.jpg`, { repeat: 2 }),
    loadTex(loader, `${TEX}/bark.jpg`, { repeat: 2 }),
    loadTex(loader, `${TEX}/cobble.jpg`, { repeat: 2 }),
    loadTex(loader, `${TEX}/facade-a.jpg`),
    loadTex(loader, `${TEX}/facade-b.jpg`),
    loadTex(loader, `${SYMBOLS}/botanical-cross.png`),
    loadTex(loader, `${SYMBOLS}/marian-lilies.png`),
    loadTex(loader, `${ART}/seele-jungle-v2.webp`),
    loadTex(loader, `${ART}/gehirn-city-v2.webp`),
    loadTex(loader, `${ART}/seele-riverbank-v3.png`),
    loadTex(loader, `${ART}/gehirn-foreground-v2.webp`),
  ]);
  const fernAsset = await new Promise((resolve) => {
    new GLTFLoader(manager).load(
      "/shared/hub/models/fern_02/fern_02.gltf",
      (gltf) => resolve(gltf.scene),
      undefined,
      () => resolve(null)
    );
  });
  const mossRockAsset = await new Promise((resolve) => {
    new GLTFLoader(manager).load(
      "/shared/hub/models/rock_moss_set_01/rock_moss_set_01.gltf",
      (gltf) => resolve(gltf.scene),
      undefined,
      () => resolve(null)
    );
  });

  const meadowTex = forestFloor || meadow;
  const asphaltTex = asphalt;
  const woodTex = wood;
  const barkTex = bark;
  const cobbleTex = cobble;
  if (forestFloorNormal) forestFloorNormal.colorSpace = THREE.NoColorSpace;
  if (forestFloorRoughness) forestFloorRoughness.colorSpace = THREE.NoColorSpace;
  if (mossyRockNormal) mossyRockNormal.colorSpace = THREE.NoColorSpace;
  if (mossyRockRoughness) mossyRockRoughness.colorSpace = THREE.NoColorSpace;
  if (waterNormals) waterNormals.colorSpace = THREE.NoColorSpace;
  if (meadowTex) meadowTex.wrapS = meadowTex.wrapT = THREE.RepeatWrapping;
  if (asphaltTex) asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping;

  const updaters = [];
  const timeMats = [];
  const lookCtl = createLook({ camera, canvas, reducedMotion });

  const hemi = new THREE.HemisphereLight(0xffb45c, 0x1e4a28, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff8a32, 2.6);
  sun.position.set(-18, 16, 6);
  sun.castShadow = !qualityLow;
  if (sun.castShadow) {
    sun.shadow.mapSize.set(1536, 1536);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 48;
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -16;
    sun.shadow.bias = -0.0004;
  }
  scene.add(sun);
  const moon = new THREE.DirectionalLight(0xb7d4ff, 0.55);
  moon.position.set(16, 12, -4);
  scene.add(moon);
  const sakuraLamp = new THREE.PointLight(0xff8ab8, 14, 11, 1.7);
  sakuraLamp.position.set(5.4, 4.2, -1.6);
  scene.add(sakuraLamp);
  const chapelLamp = new THREE.PointLight(0xffc56a, 7, 9, 2);
  chapelLamp.position.set(-7.2, 2.4, -5.4);
  scene.add(chapelLamp);
  const hallLamp = new THREE.PointLight(0xffd9a0, 8, 8, 1.8);
  hallLamp.position.set(8.4, 2.3, -5.2);
  scene.add(hallLamp);
  const jungleFill = new THREE.PointLight(0xffd6a0, 7.5, 18, 1.55);
  jungleFill.position.set(-5.8, 5.4, 4.2);
  scene.add(jungleFill);

  /* Sky — world-aligned day/night halves, no flat plates */
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 dayLow = vec3(1.0, 0.48, 0.16);
        vec3 dayHigh = vec3(0.18, 0.62, 0.38);
        vec3 nightLow = vec3(0.12, 0.04, 0.12);
        vec3 nightHigh = vec3(0.03, 0.03, 0.07);
        float side = smoothstep(-0.07, 0.07, d.x);
        vec3 day = mix(dayLow, dayHigh, pow(h, 0.7));
        day += vec3(0.85, 0.18, 0.45) * pow(1.0 - h, 2.2) * 0.45;
        vec3 night = mix(nightLow, nightHigh, pow(h, 1.15));
        vec3 col = mix(day, night, side);
        vec3 sunDir = normalize(vec3(-0.72, 0.32, 0.18));
        col += vec3(1.0, 0.55, 0.18) * pow(max(dot(d, sunDir), 0.0), 90.0) * 0.95 * (1.0 - side);
        vec3 moonDir = normalize(vec3(0.55, 0.42, -0.12));
        col += vec3(0.95, 0.32, 0.42) * pow(max(dot(d, moonDir), 0.0), 70.0) * 1.1 * side;
        col += vec3(0.28, 0.04, 0.08) * side * pow(1.0 - h, 2.2);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(80, 40, 24), skyMat));

  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xff7a24, fog: false, toneMapped: false })
  );
  sunBall.position.set(-22, 9, -6);
  scene.add(sunBall);
  const moonBall = new THREE.Mesh(
    new THREE.SphereGeometry(3.4, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xe84862, fog: false, toneMapped: false })
  );
  moonBall.position.set(18, 11, -12);
  scene.add(moonBall);

  /* The generated vistas are only distant cycloramas. Real geometry fills the foreground. */
  const panoramaGeometry = new THREE.SphereGeometry(68, 72, 36);
  const seeleBackdrop = new THREE.Mesh(panoramaGeometry, panoramaMaterial(seeleBackdropTex, -1));
  seeleBackdrop.position.y = 2.1;
  seeleBackdrop.renderOrder = -12;
  scene.add(seeleBackdrop);
  const gehirnBackdrop = new THREE.Mesh(panoramaGeometry.clone(), panoramaMaterial(gehirnBackdropTex, 1));
  gehirnBackdrop.position.y = 2.1;
  gehirnBackdrop.renderOrder = -11;
  scene.add(gehirnBackdrop);

  const seeleMidground = createWindCutout(
    seeleForegroundTex,
    new THREE.Vector3(-5.0, 2.55, -2.35),
    11.8,
    0.08
  );
  seeleMidground.visible = false;
  const gehirnMidground = createWindCutout(
    gehirnForegroundTex,
    new THREE.Vector3(5.05, 3.35, -2.65),
    11.8,
    -0.08
  );
  gehirnMidground.visible = false;
  const seeleForeground = createWindCutout(
    seeleForegroundTex,
    new THREE.Vector3(-6.05, 2.56, 0.62),
    15.1,
    0.11,
    1672 / 941
  );
  seeleForeground.material.opacity = 0.98;
  scene.add(seeleForeground);
  const gehirnForeground = createWindCutout(
    gehirnForegroundTex,
    new THREE.Vector3(7.0, 3.65, 0.75),
    14.6,
    -0.16
  );
  gehirnForeground.material.opacity = 0.94;
  scene.add(gehirnForeground);

  /* Terrain */
  const terrainMat = new THREE.ShaderMaterial({
    uniforms: {
      uMeadow: { value: meadowTex },
      uAsphalt: { value: asphaltTex },
      uFogColor: { value: FOG_SEELE.clone() },
      uFogNear: { value: 12 },
      uFogFar: { value: 42 },
    },
    vertexShader: `
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMeadow;
      uniform sampler2D uAsphalt;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        float side = smoothstep(-2.2, 2.4, vWorld.x);
        vec3 forestWide = texture2D(uMeadow, vWorld.xz * 0.21).rgb;
        vec3 forestDetail = texture2D(uMeadow, vWorld.xz * 0.63 + vec2(0.17,0.31)).rgb;
        vec3 meadow = mix(forestWide, forestDetail, 0.34) * vec3(0.72, 0.78, 0.62);
        vec3 wet = texture2D(uAsphalt, vWorld.xz * 0.42).rgb * vec3(0.55, 0.62, 0.78);
        vec3 col = mix(meadow, wet, side);
        float ndl = max(dot(normalize(vNormal), normalize(vec3(-0.5, 0.8, 0.2))), 0.0);
        col *= mix(vec3(0.82, 0.88, 0.68) * (0.43 + 0.57 * ndl), vec3(0.38, 0.42, 0.55) * (0.35 + 0.45 * ndl), side);
        vec3 view = normalize(cameraPosition - vWorld);
        vec3 ref = reflect(-normalize(vec3(-0.2, 0.9, 0.3)), normalize(vNormal));
        col += pow(max(dot(ref, view), 0.0), 48.0) * side * vec3(0.25, 0.45, 0.55);
        float dist = length(vWorld - cameraPosition);
        col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, dist));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const terrainGeo = new THREE.PlaneGeometry(48, 40, qualityLow ? 70 : 110, qualityLow ? 60 : 90);
  terrainGeo.rotateX(-Math.PI / 2);
  const pos = terrainGeo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  terrainGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.receiveShadow = true;
  scene.add(terrain);

  /* A real PBR forest-floor layer supplies the close-range material response seen in
     the Firewood reference while the blended terrain below preserves the two-world seam. */
  const seeleGroundGeo = new THREE.PlaneGeometry(
    25.5,
    40,
    qualityLow ? 52 : 88,
    qualityLow ? 58 : 86
  );
  seeleGroundGeo.rotateX(-Math.PI / 2);
  const seeleGroundPosition = seeleGroundGeo.attributes.position;
  for (let index = 0; index < seeleGroundPosition.count; index += 1) {
    const worldX = seeleGroundPosition.getX(index) - 11.25;
    const worldZ = seeleGroundPosition.getZ(index);
    seeleGroundPosition.setXYZ(index, worldX, heightAt(worldX, worldZ) + 0.012, worldZ);
  }
  seeleGroundPosition.needsUpdate = true;
  seeleGroundGeo.computeVertexNormals();
  const seeleGround = new THREE.Mesh(
    seeleGroundGeo,
    new THREE.MeshStandardMaterial({
      color: 0x81906e,
      map: meadowTex,
      normalMap: forestFloorNormal || null,
      normalScale: new THREE.Vector2(0.72, 0.72),
      roughnessMap: forestFloorRoughness || null,
      roughness: 0.94,
      metalness: 0,
    })
  );
  seeleGround.receiveShadow = true;
  scene.add(seeleGround);

  const riverScene = createRiver(scene, qualityLow, waterNormals, meadowTex);
  const river = riverScene.water;
  const riverRocks = createRiverRocks(scene, qualityLow, mossyRock, mossyRockNormal, mossyRockRoughness);
  riverRocks.visible = false;
  const mossRockBanks = createMossRockBanks(scene, mossRockAsset, qualityLow);
  const fernBanks = createFernBanks(scene, fernAsset, qualityLow);
  const riverMist = createRiverMist(scene, qualityLow);

  const riftMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime;
      void main() {
        float x = (vUv.x - 0.5) * 2.0;
        float glow = exp(-x * x * 22.0) * (0.28 + 0.2 * sin(vUv.y * 24.0 + uTime));
        vec3 col = mix(vec3(0.9, 0.72, 0.35), mix(vec3(0.94,0.2,0.34), vec3(0.0,0.74,0.84), 0.5), smoothstep(-0.2,0.2,x));
        gl_FragColor = vec4(col, glow);
      }
    `,
  });
  timeMats.push(riftMat);
  const rift = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 28), riftMat);
  rift.rotation.x = -Math.PI / 2;
  rift.position.set(0, 0.04, -2);
  rift.visible = false;

  const threshold = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.06, 2.4),
    new THREE.MeshStandardMaterial({ color: 0xe2d3b0, roughness: 0.72 })
  );
  threshold.position.set(0, heightAt(0, 4.1) + 0.02, 4.1);
  threshold.visible = false;

  /* Jungle mounds close the left horizon */
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x2f7a38 });
  const hillRng = rng(19);
  for (let i = 0; i < 0; i += 1) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), hillMat);
    const x = -8 - hillRng() * 14;
    const z = -6 - hillRng() * 16;
    hill.position.set(x, heightAt(x, z) + 0.2, z);
    hill.scale.set(3.8 + hillRng() * 3.2, 2.2 + hillRng() * 1.6, 3.2 + hillRng() * 2.4);
    hill.castShadow = true;
    scene.add(hill);
  }
  /* Night mountains — real volume behind Gehirn */
  const nightHillMat = new THREE.MeshBasicMaterial({ color: 0x120e18 });
  const ridgeMat = new THREE.MeshBasicMaterial({ color: 0x1c1624 });
  for (let i = 0; i < 0; i += 1) {
    const h = 10 + hillRng() * 14;
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(5.5 + hillRng() * 4, h, 6), i % 2 ? nightHillMat : ridgeMat);
    mountain.position.set(10 + i * 3.4 + hillRng() * 2, h * 0.28, -16 - hillRng() * 8);
    mountain.rotation.y = hillRng() * Math.PI;
    scene.add(mountain);
  }

  /* Grass */
  const grassGeo = new THREE.PlaneGeometry(0.04, 0.24, 1, 3);
  grassGeo.translate(0, 0.12, 0);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x718d48, roughness: 0.86, side: THREE.DoubleSide });
  grassMat.userData.uTime = { value: 0 };
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = grassMat.userData.uTime;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\nuniform float uTime;`);
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       transformed.x += sin(uTime * 1.5 + instanceMatrix[3].x * 0.8) * 0.12 * uv.y * uv.y;`
    );
  };
  const grassCount = qualityLow ? 3200 : 7600;
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
  grass.frustumCulled = false;
  const gRng = rng(4);
  for (let i = 0; i < grassCount; i += 1) {
    let x = -1.1 - gRng() * 14;
    let z = -12 + gRng() * 18;
    for (let attempt = 0; attempt < 5 && isRiver(x, z, 0.16); attempt += 1) {
      x = -1.1 - gRng() * 14;
      z = -12 + gRng() * 18;
    }
    dummy.position.set(x, heightAt(x, z), z);
    dummy.rotation.set(0, gRng() * Math.PI, (gRng() - 0.5) * 0.2);
    const s = 0.65 + gRng() * 0.5;
    dummy.scale.set(s, 0.6 + gRng() * 0.45, s);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    _color.setHSL(0.22 + gRng() * 0.12, 0.34 + gRng() * 0.24, 0.17 + gRng() * 0.2);
    grass.setColorAt(i, _color);
  }
  grass.castShadow = !qualityLow;
  grass.visible = true;
  scene.add(grass);

  const lilyTex = flowerCanvas();
  const lilyGeo = new THREE.PlaneGeometry(0.28, 0.28);
  lilyGeo.translate(0, 0.14, 0);
  const lilyMat = new THREE.MeshBasicMaterial({ map: lilyTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const lilyCount = qualityLow ? 280 : 720;
  const liliesMesh = new THREE.InstancedMesh(lilyGeo, lilyMat, lilyCount);
  liliesMesh.frustumCulled = false;
  const lRng = rng(8);
  for (let i = 0; i < lilyCount; i += 1) {
    let x = -1.4 - lRng() * 12;
    let z = -10 + lRng() * 15;
    for (let attempt = 0; attempt < 5 && isRiver(x, z, 0.12); attempt += 1) {
      x = -1.4 - lRng() * 12;
      z = -10 + lRng() * 15;
    }
    dummy.position.set(x, heightAt(x, z), z);
    dummy.rotation.y = lRng() * Math.PI * 2;
    dummy.scale.setScalar(0.55 + lRng() * 0.5);
    dummy.updateMatrix();
    liliesMesh.setMatrixAt(i, dummy.matrix);
  }
  liliesMesh.visible = false;

  function scatterColorFlowers(hex, count, seed) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    g.translate(32, 32);
    g.fillStyle = hex;
    for (let i = 0; i < 5; i += 1) {
      g.rotate((Math.PI * 2) / 5);
      g.beginPath();
      g.ellipse(0, -12, 6, 14, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#f0d36a";
    g.beginPath();
    g.arc(0, 0, 4, 0, Math.PI * 2);
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(0.22, 0.22);
    geo.translate(0, 0.11, 0);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    const r = rng(seed);
    for (let i = 0; i < count; i += 1) {
      let x = -1.2 - r() * 13;
      let z = -11 + r() * 16;
      for (let attempt = 0; attempt < 5 && isRiver(x, z, 0.12); attempt += 1) {
        x = -1.2 - r() * 13;
        z = -11 + r() * 16;
      }
      dummy.position.set(x, heightAt(x, z), z);
      dummy.rotation.y = r() * Math.PI * 2;
      dummy.scale.setScalar(0.7 + r() * 0.7);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.visible = false;
  }
  scatterColorFlowers("#c34f6f", qualityLow ? 70 : 170, 21);
  scatterColorFlowers("#d88335", qualityLow ? 55 : 135, 33);
  scatterColorFlowers("#73569c", qualityLow ? 35 : 80, 47);

  /* Trees */
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, map: barkTex, roughness: 0.9 });
  const nightBark = new THREE.MeshStandardMaterial({ color: 0x1e1714, map: barkTex, roughness: 0.88 });
  const blossomPts = { day: [], night: [] };
  const xAxis = new THREE.Vector3(1, 0, 0);
  const zAxis = new THREE.Vector3(0, 0, 1);
  const yUp = new THREE.Vector3(0, 1, 0);

  function growSakura(origin, night, seed, size) {
    const group = new THREE.Group();
    const r = rng(seed);
    const mat = night ? nightBark : barkMat;
    function branch(from, dir, len, rad, depth) {
      const ndir = dir.clone().normalize();
      const to = from.clone().addScaledVector(ndir, len);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.62, rad, len, 6), mat);
      cyl.position.copy(from).addScaledVector(ndir, len * 0.5);
      cyl.quaternion.setFromUnitVectors(yUp, ndir);
      cyl.castShadow = true;
      group.add(cyl);
      if (depth <= 0 || len < 0.38) {
        (night ? blossomPts.night : blossomPts.day).push(to.clone().add(origin));
        return;
      }
      const n = depth > 2 ? 3 : 2;
      for (let i = 0; i < n; i += 1) {
        const next = ndir.clone();
        next.applyAxisAngle(xAxis, (r() - 0.5) * 1.05);
        next.applyAxisAngle(zAxis, (r() - 0.5) * 1.05);
        next.y += 0.2;
        branch(to, next, len * (0.56 + r() * 0.18), rad * 0.66, depth - 1);
      }
    }
    branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 2.15 * size, 0.2 * size, qualityLow ? 4 : 5);
    group.position.copy(origin);
    scene.add(group);
  }

  /* High-detail image cutouts carry the canopy; procedural particles supply motion and depth. */

  const jungleLeafTexture = leafCanvas();
  const jungleLeafTime = { value: 0 };
  const jungleLeafMat = new THREE.MeshBasicMaterial({
    map: jungleLeafTexture,
    transparent: true,
    alphaTest: 0.16,
    side: THREE.DoubleSide,
    vertexColors: true,
    toneMapped: true,
  });
  jungleLeafMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = jungleLeafTime;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nuniform float uWindTime;"
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      [
        "#include <begin_vertex>",
        "float windPhase = instanceMatrix[3].x * 0.73 + instanceMatrix[3].z * 0.41;",
        "transformed.x += sin(uWindTime * 1.18 + windPhase) * 0.08 * (uv.y + 0.2);",
        "transformed.y += cos(uWindTime * 0.83 + windPhase) * 0.025 * uv.y;",
      ].join("\n")
    );
  };
  const tRng = rng(55);
  const jungleTrees = [];
  const treeCount = qualityLow ? 13 : 22;
  for (let i = 0; i < treeCount; i += 1) {
    const x = -5.0 - tRng() * 14;
    const z = -1.0 - tRng() * 13;
    const h = 3.4 + tRng() * 3.8;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.22, h, 10), barkMat);
    trunk.position.set(x, heightAt(x, z) + h / 2, z);
    trunk.rotation.z = (tRng() - 0.5) * 0.1;
    trunk.castShadow = true;
    trunk.visible = false;
    jungleTrees.push({ x, z, h, ground: heightAt(x, z) });
  }
  const leavesPerTree = qualityLow ? 72 : 138;
  const jungleLeaves = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.5, 0.82, 1, 3),
    jungleLeafMat,
    treeCount * leavesPerTree
  );
  jungleLeaves.frustumCulled = false;
  let leafIndex = 0;
  jungleTrees.forEach((tree, treeIndex) => {
    for (let index = 0; index < leavesPerTree; index += 1) {
      const angle = tRng() * Math.PI * 2;
      const radius = Math.sqrt(tRng()) * (1.35 + tree.h * 0.16);
      const vertical = (tRng() - 0.36) * (1.65 + tree.h * 0.16);
      dummy.position.set(
        tree.x + Math.cos(angle) * radius,
        tree.ground + tree.h + vertical,
        tree.z + Math.sin(angle) * radius
      );
      dummy.rotation.set((tRng() - 0.5) * 1.1, tRng() * Math.PI * 2, (tRng() - 0.5) * 1.3);
      const scale = 0.5 + tRng() * 0.85;
      dummy.scale.set(scale * (0.72 + tRng() * 0.35), scale, scale);
      dummy.updateMatrix();
      jungleLeaves.setMatrixAt(leafIndex, dummy.matrix);
      _color.setHSL(
        0.25 + tRng() * 0.12,
        0.52 + tRng() * 0.27,
        0.26 + tRng() * 0.22 + (treeIndex % 7 === 0 ? 0.07 : 0)
      );
      jungleLeaves.setColorAt(leafIndex, _color);
      leafIndex += 1;
    }
  });
  jungleLeaves.instanceMatrix.needsUpdate = true;
  if (jungleLeaves.instanceColor) jungleLeaves.instanceColor.needsUpdate = true;
  jungleLeaves.visible = false;

  const vineMat = new THREE.MeshLambertMaterial({ color: 0x2d6b2e });
  for (let i = 0; i < 12; i += 1) {
    const x = -4 - tRng() * 10;
    const z = -tRng() * 8;
    const pts = [];
    for (let k = 0; k < 6; k += 1) {
      pts.push(new THREE.Vector3(x + Math.sin(k + i) * 0.35, 5.5 - k * 0.85, z + Math.cos(k * 0.7) * 0.25));
    }
    /* Vines are represented in the high-detail foreground plates. */
  }

  const dayPetal = petalCanvas("#fff4f0", "#ffb7c9");
  const nightPetal = petalCanvas("#ffe0ea", "#ff6d9a");
  function scatterBlossoms(points, tex, countMul, emissive) {
    const geo = new THREE.PlaneGeometry(0.22, 0.26);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      color: emissive ? 0xffffff : 0xfff0f4,
    });
    const extra = Math.floor(points.length * countMul);
    const mesh = new THREE.InstancedMesh(geo, mat, extra);
    mesh.frustumCulled = false;
    const r = rng(99 + extra);
    for (let i = 0; i < extra; i += 1) {
      const p = points[i % points.length];
      dummy.position.set(p.x + (r() - 0.5) * 1.3, p.y + (r() - 0.4) * 0.9, p.z + (r() - 0.5) * 1.3);
      dummy.rotation.set(r() * 0.6, r() * Math.PI, r() * 0.6);
      dummy.scale.setScalar(0.55 + r() * 0.8);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    scene.add(mesh);
  }
  scatterBlossoms(blossomPts.day, jungleLeafTexture, qualityLow ? 4 : 7, false);
  scatterBlossoms(blossomPts.night, nightPetal, qualityLow ? 4 : 6, true);

  /* Falling petals */
  function falling(tex, count, origin, spread, night) {
    const geo = new THREE.PlaneGeometry(0.16, 0.2);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    const state = [];
    const r = rng(night ? 2 : 5);
    for (let i = 0; i < count; i += 1) {
      state.push({
        x: origin.x + (r() - 0.5) * spread,
        y: 1.5 + r() * 4.5,
        z: origin.z + (r() - 0.5) * spread,
        s: 0.6 + r() * 0.7,
        spin: (r() - 0.5) * 2,
        vy: 0.28 + r() * 0.35,
      });
    }
    scene.add(mesh);
    updaters.push((dt, elapsed) => {
      if (night && lookCtl.side < 0.25) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      for (let i = 0; i < state.length; i += 1) {
        const p = state[i];
        p.y -= p.vy * dt;
        p.x += Math.sin(elapsed * 0.6 + i) * dt * 0.25;
        p.z += Math.cos(elapsed * 0.4 + i) * dt * 0.18;
        if (p.y < heightAt(p.x, p.z) + 0.05) {
          p.x = origin.x + (Math.random() - 0.5) * spread;
          p.y = 3.2 + Math.random() * 3;
          p.z = origin.z + (Math.random() - 0.5) * spread;
        }
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.spin * elapsed, p.spin, elapsed * 0.3);
        dummy.scale.setScalar(p.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }
  falling(dayPetal, qualityLow ? 90 : 220, new THREE.Vector3(-7, 0, -3), 8, false);
  falling(nightPetal, qualityLow ? 120 : 280, new THREE.Vector3(6, 0, -2), 6.5, true);

  /* Chapel */
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xf0e6d0, map: cobbleTex, roughness: 0.82 });
  const chapel = new THREE.Group();
  const nave = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.5, 4.6), stoneMat);
  nave.position.y = 1.25;
  nave.castShadow = true;
  chapel.add(nave);
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.14, 3.1), new THREE.MeshStandardMaterial({ color: 0x6a3828, map: woodTex, roughness: 0.7 }));
  r1.position.set(0, 2.85, 0.75);
  r1.rotation.x = 0.52;
  const r2 = r1.clone();
  r2.position.z = -0.75;
  r2.rotation.x = -0.52;
  chapel.add(r1, r2);
  const glow = new THREE.MeshStandardMaterial({ color: 0xffd18a, emissive: 0xffc056, emissiveIntensity: 1.3 });
  [-0.95, 0.95].forEach((x) => {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.06), glow);
    w.position.set(x, 1.35, 2.32);
    chapel.add(w);
  });
  const cv = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 0.1), new THREE.MeshStandardMaterial({ color: 0xf2ead8 }));
  cv.position.y = 3.85;
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.1), cv.material);
  ch.position.y = 3.62;
  chapel.add(cv, ch);
  chapel.position.set(-7.4, heightAt(-7.4, -5.6), -5.6);
  chapel.rotation.y = 0.35;
  chapel.visible = false;

  if (cross) {
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.7),
      new THREE.MeshBasicMaterial({ map: cross, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    );
    plate.position.set(-4.8, heightAt(-4.8, 0.6) + 1.35, 0.6);
    plate.lookAt(0, plate.position.y, 6);
    plate.visible = false;
  }
  if (lilies) {
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 1.4),
      new THREE.MeshBasicMaterial({ map: lilies, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    );
    plate.position.set(-2.6, heightAt(-2.6, -3.2) + 1.2, -3.2);
    plate.lookAt(0, plate.position.y, 6);
    plate.visible = false;
  }

  /* Torii + temple */
  const verm = new THREE.MeshStandardMaterial({
    color: 0xb13228,
    roughness: 0.42,
    metalness: 0.08,
    emissive: 0x4a1018,
    emissiveIntensity: 0.28,
  });
  const blackLacquer = new THREE.MeshStandardMaterial({ color: 0x161214, roughness: 0.55, metalness: 0.2 });
  const torii = new THREE.Group();
  [-1.15, 1.15].forEach((x) => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 3.2, 10), verm);
    col.position.set(x, 1.6, 0);
    col.castShadow = true;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.38), blackLacquer);
    base.position.set(x, 0.09, 0);
    torii.add(col, base);
  });
  const kasagi = new THREE.Mesh(new THREE.BoxGeometry(3.15, 0.14, 0.38), verm);
  kasagi.position.y = 3.18;
  const shimaki = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.1, 0.24), verm);
  shimaki.position.y = 2.9;
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.12, 0.16), verm);
  nuki.position.y = 1.95;
  torii.add(kasagi, shimaki, nuki);
  torii.position.set(4.15, heightAt(4.15, 0.35), 0.35);
  torii.rotation.y = -0.55;
  scene.add(torii);

  const hall = new THREE.Group();
  const plat = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.28, 4.4), blackLacquer);
  plat.position.y = 0.14;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 2.15, 3.5),
    new THREE.MeshStandardMaterial({ color: 0x2a211c, map: woodTex, roughness: 0.7 })
  );
  body.position.y = 1.3;
  body.castShadow = true;
  const shoji = new THREE.MeshStandardMaterial({ color: 0xffe6c0, emissive: 0xffc878, emissiveIntensity: 1.15 });
  [-0.9, 0.9].forEach((x) => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.15, 0.05), shoji);
    s.position.set(x, 1.2, 1.78);
    hall.add(s);
  });
  const roofA = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.12, 2.6), blackLacquer);
  roofA.position.set(0, 2.55, 0.7);
  roofA.rotation.x = 0.48;
  const roofB = roofA.clone();
  roofB.position.z = -0.7;
  roofB.rotation.x = -0.48;
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.1, 0.18), verm);
  ridge.position.y = 3.05;
  hall.add(plat, body, roofA, roofB, ridge);
  hall.position.set(8.6, heightAt(8.6, -5.1), -5.1);
  hall.rotation.y = -0.4;
  scene.add(hall);

  function lantern(x, z) {
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: 0x8a8478, map: cobbleTex, roughness: 0.8 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42), stone);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.55, 6), stone);
    shaft.position.y = 0.34;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), glow);
    box.position.y = 0.76;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.18, 4), blackLacquer);
    cap.position.y = 0.98;
    cap.rotation.y = Math.PI / 4;
    g.add(base, shaft, box, cap);
    g.position.set(x, heightAt(x, z), z);
    scene.add(g);
  }
  lantern(3.1, -0.6);
  lantern(6.2, -3.2);
  lantern(7.4, -6.6);
  lantern(4.8, -4.4);
  lantern(10.2, -4.8);
  lantern(8.8, -1.2);
  lantern(12.4, -8.1);
  lantern(5.4, 1.6);

  function pagoda(x, z, stories, rot) {
    const g = new THREE.Group();
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x2a211c, map: woodTex, roughness: 0.7 });
    for (let i = 0; i < stories; i += 1) {
      const w = 2.15 - i * 0.28;
      const storey = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.62, w * 0.7), woodDark);
      storey.position.y = 0.42 + i * 0.95;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.62, 0.32, 4), blackLacquer);
      roof.position.y = 0.82 + i * 0.95;
      roof.rotation.y = Math.PI / 4;
      const eave = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, w), verm);
      eave.position.y = 0.7 + i * 0.95;
      g.add(storey, roof, eave);
    }
    g.position.set(x, heightAt(x, z), z);
    g.rotation.y = rot || 0;
    scene.add(g);
  }
  pagoda(11.4, -9.2, 5, -0.3);
  pagoda(16.2, -6.4, 4, 0.4);

  function machiya(x, z, h, rot) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, h, 2.4),
      new THREE.MeshStandardMaterial({ color: 0x3a2c22, map: woodTex, roughness: 0.74 })
    );
    body.position.y = h / 2;
    body.castShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.1, 2.7), blackLacquer);
    roof.position.y = h + 0.12;
    const grid = new THREE.Mesh(new THREE.BoxGeometry(0.9, h * 0.45, 0.04), shoji);
    grid.position.set(0, h * 0.55, 1.22);
    g.add(body, roof, grid);
    g.position.set(x, heightAt(x, z), z);
    g.rotation.y = rot;
    scene.add(g);
  }
  const mRng = rng(81);
  for (let i = 0; i < 8; i += 1) {
    machiya(6.4 + (i % 4) * 2.1 + mRng() * 0.4, -2.2 - Math.floor(i / 4) * 3.4 - mRng(), 2.4 + mRng() * 1.6, -0.5 + mRng() * 0.3);
  }

  const stair = new THREE.Group();
  for (let i = 0; i < 10; i += 1) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.12, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x6a645c, map: cobbleTex, roughness: 0.8 })
    );
    step.position.set(0, i * 0.22, -i * 0.48);
    stair.add(step);
  }
  stair.position.set(9.4, heightAt(9.4, -3.6), -3.6);
  stair.rotation.y = -0.45;
  scene.add(stair);

  const facades = [facadeA, facadeB].filter(Boolean);
  const twRng = rng(44);
  for (let i = 0; i < (qualityLow ? 8 : 14); i += 1) {
    const map = facades[i % facades.length];
    if (!map) continue;
    const w = 1.6 + twRng() * 2.2;
    const h = 6 + twRng() * 16;
    const d = 1.5 + twRng() * 2;
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({
        map,
        emissiveMap: map,
        emissive: 0xffffff,
        emissiveIntensity: 0.38,
        roughness: 0.46,
        metalness: 0.2,
      })
    );
    const x = 12 + twRng() * 12;
    const z = 2 - twRng() * 16;
    b.position.set(x, heightAt(x, z) + h / 2, z);
    b.rotation.y = (twRng() - 0.5) * 0.5;
    b.castShadow = true;
    scene.add(b);
  }

  const cableMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.5, metalness: 0.4 });
  for (let i = 0; i < 10; i += 1) {
    const a = new THREE.Vector3(8 + twRng() * 10, 6 + twRng() * 8, -2 - twRng() * 10);
    const c = new THREE.Vector3(10 + twRng() * 10, 5 + twRng() * 7, -4 - twRng() * 8);
    const mid = a.clone().lerp(c, 0.5);
    mid.y -= 1.6;
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, mid, c]), 10, 0.03, 4, false), cableMat));
  }

  /* Signs */
  await Promise.race([
    document.fonts.ready.catch(() => {}),
    new Promise((resolve) => window.setTimeout(resolve, 1200)),
  ]);
  const seeleSign = makeSignTexture(paintSeeleSign, 1024, 640);
  const gehirnSign = makeSignTexture(paintGehirnSign, 1024, 512);
  let language = document.documentElement.dataset.language || "en";
  seeleSign.redraw(language);
  gehirnSign.redraw(language);

  const seeleShell = new THREE.Mesh(
    new RoundedBoxGeometry(2.32, 1.45, 0.2, 5, 0.075),
    new THREE.MeshStandardMaterial({ color: 0x211b13, roughness: 0.66, metalness: 0.08 })
  );
  const seeleBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(2.16, 1.29),
    new THREE.MeshStandardMaterial({ map: seeleSign.texture, roughness: 0.88 })
  );
  seeleBoard.userData.portal = "seele";
  const sPostL = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 2.05, 10), new THREE.MeshStandardMaterial({ color: 0x292117, roughness: 0.72, metalness: 0.1 }));
  const sPostR = sPostL.clone();
  const seeleGrp = new THREE.Group();
  const seeleIsland = new THREE.Mesh(
    irregularRockGeometry(1218, qualityLow ? 1 : 2),
    new THREE.MeshStandardMaterial({
      color: 0x526044,
      map: mossyRock || null,
      normalMap: mossyRockNormal || null,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: mossyRockRoughness || null,
      roughness: 0.92,
    })
  );
  seeleIsland.position.set(0, 0.13, -0.02);
  seeleIsland.scale.set(1.44, 0.42, 0.92);
  seeleIsland.receiveShadow = true;
  sPostL.position.set(-0.92, 1.02, 0);
  sPostR.position.set(0.92, 1.02, 0);
  seeleShell.position.y = 1.58;
  seeleBoard.position.set(0, 1.58, 0.106);
  seeleGrp.add(seeleIsland, sPostL, sPostR, seeleShell, seeleBoard);
  seeleGrp.position.set(PORTALS[0].x, 0.04, PORTALS[0].z);
  seeleGrp.lookAt(0.2, seeleGrp.position.y, 6.2);
  seeleGrp.userData.baseScale = 0.82;
  seeleGrp.scale.setScalar(seeleGrp.userData.baseScale);
  seeleBoard.userData.group = seeleGrp;
  scene.add(seeleGrp);

  const metal = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.35, metalness: 0.7 });
  const gehirnShell = new THREE.Mesh(
    new RoundedBoxGeometry(2.5, 1.23, 0.18, 5, 0.055),
    metal
  );
  const gehirnBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(2.34, 1.07),
    new THREE.MeshStandardMaterial({
      map: gehirnSign.texture,
      emissiveMap: gehirnSign.texture,
      emissive: 0xffffff,
      emissiveIntensity: 0.65,
      roughness: 0.32,
    })
  );
  gehirnBoard.userData.portal = "gehirn";
  const gGrp = new THREE.Group();
  const gp1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.85, 0.07), metal);
  const gp2 = gp1.clone();
  gp1.position.set(-1.03, 0.98, 0);
  gp2.position.set(1.03, 0.98, 0);
  gehirnShell.position.y = 1.52;
  gehirnBoard.position.set(0, 1.52, 0.096);
  const barR = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.035, 0.055), new THREE.MeshBasicMaterial({ color: 0xef3157 }));
  barR.position.y = 0.92;
  const barC = barR.clone();
  barC.material = new THREE.MeshBasicMaterial({ color: 0x00bed7 });
  barC.position.y = 1.92;
  gGrp.add(gp1, gp2, gehirnShell, gehirnBoard, barR, barC);
  gGrp.position.set(PORTALS[1].x, heightAt(PORTALS[1].x, PORTALS[1].z), PORTALS[1].z);
  gGrp.lookAt(-0.2, gGrp.position.y, 6.2);
  gGrp.userData.baseScale = 0.82;
  gGrp.scale.setScalar(gGrp.userData.baseScale);
  gehirnBoard.userData.group = gGrp;
  scene.add(gGrp);

  /* Rain */
  const rainCount = qualityLow ? 900 : 2200;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(rainCount * 3);
  const rainRng = rng(77);
  for (let i = 0; i < rainCount; i += 1) {
    rainPos[i * 3] = 1.2 + rainRng() * 18;
    rainPos[i * 3 + 1] = rainRng() * 10;
    rainPos[i * 3 + 2] = -14 + rainRng() * 20;
  }
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color: 0xa8dbe6, size: 0.035, transparent: true, opacity: 0.45, depthWrite: false,
  }));
  scene.add(rain);
  updaters.push((dt) => {
    rain.visible = lookCtl.side > 0.28;
    if (!rain.visible) return;
    const arr = rain.geometry.attributes.position.array;
    for (let i = 0; i < rainCount; i += 1) {
      arr[i * 3 + 1] -= (10 + (i % 7)) * dt;
      arr[i * 3] += dt * 1.1;
      if (arr[i * 3 + 1] < 0) {
        arr[i * 3] = 1.2 + Math.random() * 18;
        arr[i * 3 + 1] = 8 + Math.random() * 4;
        arr[i * 3 + 2] = -14 + Math.random() * 20;
      }
    }
    rain.geometry.attributes.position.needsUpdate = true;
  });

  /* Fireflies / pollen */
  const sparkCount = qualityLow ? 80 : 180;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(sparkCount * 3);
  const sRng = rng(12);
  for (let i = 0; i < sparkCount; i += 1) {
    sparkPos[i * 3] = -14 + sRng() * 28;
    sparkPos[i * 3 + 1] = 0.4 + sRng() * 3.5;
    sparkPos[i * 3 + 2] = -12 + sRng() * 18;
  }
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    color: 0xf0e2b0, size: 0.055, transparent: true, opacity: 0.7, depthWrite: false,
  }));
  scene.add(sparks);
  updaters.push((dt, elapsed) => {
    const arr = sparks.geometry.attributes.position.array;
    for (let i = 0; i < sparkCount; i += 1) {
      arr[i * 3 + 1] += Math.sin(elapsed * 0.7 + i) * dt * 0.2;
    }
    sparks.geometry.attributes.position.needsUpdate = true;
    const t = lookCtl.side;
    sparks.material.color.setRGB(0.94 - t * 0.15, 0.88 - t * 0.5, 0.69 + t * 0.15);
  });

  const clickable = [seeleBoard, gehirnBoard];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hit = { current: null };
  let pointerDownAt = null;
  let pointerActive = false;
  function setPointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    pointerActive = true;
  }
  canvas.addEventListener("pointermove", setPointer);
  canvas.addEventListener("pointerleave", () => {
    pointerActive = false;
    canvas.classList.remove("is-over-portal");
  });
  canvas.addEventListener("pointerdown", (event) => {
    pointerDownAt = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!pointerDownAt) return;
    const dist = Math.hypot(event.clientX - pointerDownAt.x, event.clientY - pointerDownAt.y);
    pointerDownAt = null;
    if (dist > 7) return;
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(clickable, false);
    if (hits[0]?.object?.userData?.portal) hit.current = hits[0].object.userData.portal;
  });

  let composer = null;
  let bloomPass = null;
  let gradePass = null;
  if (!qualityLow) {
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.18, 0.4, 0.84);
      composer.addPass(bloomPass);
      gradePass = new ShaderPass({
        uniforms: { tDiffuse: { value: null }, uSide: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uSide; varying vec2 vUv;
        void main() {
          vec2 centered = vUv - 0.5;
          float radius2 = dot(centered, centered);
          vec2 lensUv = 0.5 + centered * (1.0 + radius2 * 0.035);
          vec2 off = vec2(0.0016 * uSide, 0.0);
          vec4 col = texture2D(tDiffuse, lensUv);
          float r = texture2D(tDiffuse, lensUv + off).r;
          float b = texture2D(tDiffuse, lensUv - off).b;
            vec3 rgb = mix(col.rgb * vec3(1.04, 1.02, 0.94), vec3(r, col.g, b), uSide * 0.8);
            gl_FragColor = vec4(rgb, col.a);
          }
        `,
      });
      composer.addPass(gradePass);
      composer.addPass(new OutputPass());
    } catch (_) {
      composer = null;
    }
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer?.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", resize);

  const clock = new THREE.Clock();
  const centerRay = new THREE.Vector2(0, 0);
  let renderFrame = 0;
  let lastRenderedAt = 0;

  function animate(now = 0) {
    requestAnimationFrame(animate);
    if (qualityLow && now - lastRenderedAt < 1000 / 30) return;
    lastRenderedAt = now;
    const dt = Math.min(clock.getDelta(), 0.08);
    const elapsed = clock.elapsedTime;
    lookCtl.update(dt, elapsed);

    timeMats.forEach((m) => { if (m.uniforms?.uTime) m.uniforms.uTime.value = elapsed; });
    grassMat.userData.uTime.value = elapsed;
    jungleLeafTime.value = reducedMotion ? 0 : elapsed;
    seeleMidground.userData.windTime.value = reducedMotion ? 0 : elapsed;
    gehirnMidground.userData.windTime.value = reducedMotion ? 0 : elapsed;
    seeleForeground.userData.windTime.value = reducedMotion ? 0 : elapsed;
    gehirnForeground.userData.windTime.value = reducedMotion ? 0 : elapsed;
    if (riverScene.normalTexture) {
      riverScene.normalTexture.offset.x = (elapsed * (reducedMotion ? 0.002 : 0.011)) % 1;
      riverScene.normalTexture.offset.y = (elapsed * (reducedMotion ? 0.004 : 0.024)) % 1;
    }
    river.material.uniforms.uTime.value = reducedMotion ? 0 : elapsed;
    if (!reducedMotion) {
      const waterPosition = river.geometry.attributes.position;
      const waterBases = river.geometry.userData.bases;
      for (let index = 0; index < waterPosition.count; index += 1) {
        const x = waterBases[index * 3];
        const z = waterBases[index * 3 + 1];
        const across = waterBases[index * 3 + 2];
        const edgeCalm = Math.sin(across * Math.PI);
        const wave = Math.sin(z * 1.48 + elapsed * 0.62) * 0.012
          + Math.sin(x * 2.76 - z * 0.73 - elapsed * 0.46) * 0.007;
        waterPosition.setY(index, 0.115 + wave * (0.45 + edgeCalm * 0.55));
      }
      waterPosition.needsUpdate = true;
      if (renderFrame % 7 === 0) river.geometry.computeVertexNormals();
    }

    const side = lookCtl.side;
    seeleForeground.material.opacity = 0.98 * (1 - smoothstep(0.31, 0.5, side));
    scene.fog.color.copy(FOG_SEELE).lerp(FOG_GEHIRN, side);
    scene.fog.near = THREE.MathUtils.lerp(11, 8, side);
    scene.fog.far = THREE.MathUtils.lerp(38, 24, side);
    scene.background.copy(scene.fog.color);
    terrainMat.uniforms.uFogColor.value.copy(scene.fog.color);
    terrainMat.uniforms.uFogNear.value = scene.fog.near;
    terrainMat.uniforms.uFogFar.value = scene.fog.far;
    river.material.uniforms.uFogColor.value.copy(scene.fog.color);
    river.material.uniforms.uFogNear.value = scene.fog.near;
    river.material.uniforms.uFogFar.value = scene.fog.far;
    hemi.color.set(0xffb45c).lerp(_color.set(0xe8b0c8), side);
    hemi.groundColor.set(0x1e4a28).lerp(_color.set(0x0c0c10), side);
    hemi.intensity = THREE.MathUtils.lerp(1.2, 0.32, side);
    sun.intensity = THREE.MathUtils.lerp(2.15, 0.15, side);
    jungleFill.intensity = THREE.MathUtils.lerp(7.5, 0.25, side);
    moon.intensity = THREE.MathUtils.lerp(0.12, 0.7, side);
    sakuraLamp.intensity = 10 + Math.sin(elapsed * 1.2) * 3;
    renderer.toneMappingExposure = THREE.MathUtils.lerp(1.02, 0.8, side);
    if (bloomPass) bloomPass.strength = THREE.MathUtils.lerp(0.1, 0.42, side);
    if (gradePass) gradePass.uniforms.uSide.value = side;

    riverMist.forEach((sprite, index) => {
      sprite.position.x += Math.sin(elapsed * sprite.userData.drift + sprite.userData.phase) * dt * 0.045;
      sprite.material.opacity = (0.05 + (index % 3) * 0.018) * (1 - smoothstep(0.48, 0.82, side));
    });
    if (!reducedMotion) {
      fernBanks.plants.forEach((plant) => {
        plant.rotation.z = plant.userData.baseRotationZ
          + Math.sin(elapsed * 0.72 + plant.userData.phase) * 0.018;
      });
    }

    if (!qualityLow && side < 0.76 && renderFrame % 4 === 0) {
      const wasVisible = river.visible;
      river.visible = false;
      riverScene.cubeCamera.update(renderer, scene);
      river.visible = wasVisible;
    }

    updaters.forEach((fn) => fn(dt, elapsed));

    let hovered = null;
    if (pointerActive) {
      raycaster.setFromCamera(pointer, camera);
      hovered = raycaster.intersectObjects(clickable, false)[0]?.object || null;
    }
    canvas.classList.toggle("is-over-portal", Boolean(hovered));
    [seeleBoard, gehirnBoard].forEach((board) => {
      const group = board.userData.group;
      const targetScale = group.userData.baseScale * (board === hovered ? 1.045 : 1);
      const scale = THREE.MathUtils.damp(group.scale.x, targetScale, 10, dt);
      group.scale.setScalar(scale);
      if (board.material.emissiveIntensity !== undefined) {
        const base = board === gehirnBoard ? 0.65 : 0;
        board.material.emissiveIntensity = THREE.MathUtils.damp(
          board.material.emissiveIntensity,
          base + (board === hovered ? 0.38 : 0),
          9,
          dt
        );
      }
    });

    raycaster.setFromCamera(centerRay, camera);
    const aimed = raycaster.intersectObjects(clickable, false)[0];
    let portal = aimed?.object?.userData?.portal
      ? PORTALS.find((p) => p.id === aimed.object.userData.portal)
      : null;
    if (!portal) {
      if (lookCtl.yaw > 0.38) portal = PORTALS[0];
      else if (lookCtl.yaw < -0.38) portal = PORTALS[1];
    }

    const zoneName = side < 0.35 ? "Seele" : side > 0.65 ? "Gehirn" : "Seele · Gehirn";

    if (composer) composer.render();
    else renderer.render(scene, camera);

    if (onFrame) {
      onFrame({
        side,
        portal,
        clickPortal: hit.current,
        zoneName,
      });
    }
    hit.current = null;
    renderFrame += 1;
  }

  requestAnimationFrame(animate);

  return {
    PORTALS,
    setLanguage(next) {
      language = next;
      seeleSign.redraw(language);
      gehirnSign.redraw(language);
    },
  };
}
