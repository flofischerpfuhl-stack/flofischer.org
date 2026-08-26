import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Water } from "three/addons/objects/Water.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const KEY = "ff-language";
const isLocal = /localhost|127\.0\.0\.1|workers\.dev/.test(location.hostname);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const qualityLow = window.matchMedia("(max-width: 820px), (pointer: coarse)").matches
  || (navigator.hardwareConcurrency || 8) <= 4;

const canvas = document.querySelector("#diorama-world");
const loaderOverlay = document.querySelector("[data-diorama-loader]");
const loaderProgress = document.querySelector("[data-loader-progress]");
const loaderProgressFill = document.querySelector("[data-loader-progress-fill]");
const loaderProgressValue = document.querySelector("[data-loader-progress-value]");
const fade = document.querySelector("[data-fade]");
const zoneLabel = document.querySelector("[data-zone]");
const loaderStartedAt = performance.now();

function setLoadingProgress(value) {
  const progress = Math.round(THREE.MathUtils.clamp(value, 0, 100));
  loaderProgress?.setAttribute("aria-valuenow", String(progress));
  if (loaderProgressFill) loaderProgressFill.style.transform = `scaleX(${progress / 100})`;
  if (loaderProgressValue) loaderProgressValue.textContent = String(progress);
}

function rng(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function smoothstep(a, b, value) {
  const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function applyLanguage(language, persist = false) {
  if (language !== "de") language = "en";
  document.documentElement.lang = language;
  document.documentElement.dataset.language = language;
  document.querySelectorAll("[data-language-button]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.languageButton === language));
  });
  const body = document.body;
  document.title = language === "de" ? body.dataset.titleDe : body.dataset.titleEn;
  const description = document.querySelector('meta[name="description"]');
  if (description) {
    description.content = language === "de" ? description.dataset.descriptionDe : description.dataset.descriptionEn;
  }
  if (persist) {
    try { localStorage.setItem(KEY, language); } catch (_) {}
  }
  return language;
}

function rewriteLocalLinks() {
  if (!isLocal) return;
  document.querySelectorAll("[data-local]").forEach((link) => {
    link.href = link.dataset.local;
  });
}

function configureTexture(texture, { repeat = 0, srgb = true } = {}) {
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    const [repeatX, repeatY] = Array.isArray(repeat) ? repeat : [repeat, repeat];
    texture.repeat.set(repeatX, repeatY);
  }
  texture.anisotropy = qualityLow ? 4 : 10;
  return texture;
}

function loadTexture(textureLoader, url, options) {
  return new Promise((resolve) => {
    textureLoader.load(
      url,
      (texture) => resolve(configureTexture(texture, options)),
      undefined,
      () => resolve(null)
    );
  });
}

function cylinderBetween(from, to, radius, material, segments = 8) {
  const direction = to.clone().sub(from);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.72, radius, direction.length(), segments),
    material
  );
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = !qualityLow;
  return mesh;
}

function createGabledRoof(width, depth, height, roofMaterial, wallMaterial) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const leftFront = [-halfWidth, 0, halfDepth];
  const leftBack = [-halfWidth, 0, -halfDepth];
  const rightFront = [halfWidth, 0, halfDepth];
  const rightBack = [halfWidth, 0, -halfDepth];
  const ridgeFront = [0, height, halfDepth];
  const ridgeBack = [0, height, -halfDepth];

  const slopeGeometry = new THREE.BufferGeometry();
  slopeGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
    ...leftFront, ...ridgeFront, ...ridgeBack,
    ...leftFront, ...ridgeBack, ...leftBack,
    ...rightFront, ...rightBack, ...ridgeBack,
    ...rightFront, ...ridgeBack, ...ridgeFront,
  ], 3));
  slopeGeometry.setAttribute("uv", new THREE.Float32BufferAttribute([
    0, 1, 0, 0, 1, 0,
    0, 1, 1, 0, 1, 1,
    0, 1, 1, 1, 1, 0,
    0, 1, 1, 0, 0, 0,
  ], 2));
  slopeGeometry.computeVertexNormals();
  const slopes = new THREE.Mesh(slopeGeometry, roofMaterial);
  slopes.castShadow = !qualityLow;

  const gableGeometry = new THREE.BufferGeometry();
  gableGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
    ...leftFront, ...rightFront, ...ridgeFront,
    ...rightBack, ...leftBack, ...ridgeBack,
  ], 3));
  gableGeometry.setAttribute("uv", new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 0.5, 1,
    1, 0, 0, 0, 0.5, 1,
  ], 2));
  gableGeometry.computeVertexNormals();
  const gables = new THREE.Mesh(gableGeometry, wallMaterial);
  gables.castShadow = !qualityLow;

  const roof = new THREE.Group();
  roof.add(slopes, gables);
  return roof;
}

function ellipseContains(x, z, margin = 0) {
  return (x * x) / ((8.15 - margin) ** 2) + (z * z) / ((5.72 - margin) ** 2) < 1;
}

function soulWaterContains(x, z, margin = 0) {
  const pond = ((x + 4.12) / (1.72 + margin)) ** 2
    + ((z - 1.3) / (1.02 + margin)) ** 2 < 1;
  if (pond) return true;
  if (z < 1.55 - margin || z > 4.55 + margin) return false;
  const progress = THREE.MathUtils.clamp((z - 1.55) / 3, 0, 1);
  const center = -4.12 + Math.sin(progress * Math.PI * 1.35) * 0.18;
  const halfWidth = 0.46 + Math.sin(progress * Math.PI) * 0.11 + margin;
  return Math.abs(x - center) < halfWidth;
}

function halfEllipseShape(side, radiusX, radiusZ) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -radiusZ);
  for (let index = 0; index <= 48; index += 1) {
    const progress = index / 48;
    const angle = -Math.PI / 2 + side * progress * Math.PI;
    shape.lineTo(Math.cos(angle) * radiusX, Math.sin(angle) * radiusZ);
  }
  shape.lineTo(0, -radiusZ);
  return shape;
}

function canvasParticle(draw) {
  const element = document.createElement("canvas");
  element.width = element.height = 96;
  const context = element.getContext("2d");
  draw(context, 96);
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function signTexture(kind, language) {
  const element = document.createElement("canvas");
  element.width = 1024;
  element.height = 560;
  const context = element.getContext("2d");

  if (kind === "seele") {
    context.fillStyle = "#e9e1d0";
    context.fillRect(0, 0, element.width, element.height);
    const paper = rng(112);
    for (let index = 0; index < 1700; index += 1) {
      context.fillStyle = paper() > 0.55 ? "rgba(54,42,28,.035)" : "rgba(255,252,233,.045)";
      const size = 0.5 + paper() * 1.4;
      context.fillRect(paper() * element.width, paper() * element.height, size, size);
    }
    context.strokeStyle = "#171410";
    context.lineWidth = 7;
    context.strokeRect(18, 18, 988, 524);
    context.lineWidth = 2;
    context.strokeRect(34, 34, 956, 492);
    context.fillStyle = "#171410";
    context.textAlign = "left";
    context.font = "400 202px Marlboro, Impact, serif";
    context.fillText("SEELE", 82, 320);
    context.font = "600 27px Geist, sans-serif";
    context.fillText(language === "de" ? "APOLOGETIK" : "APOLOGETICS", 91, 410);
    context.strokeStyle = "#40502f";
    context.fillStyle = "#52633b";
    context.lineWidth = 6;
    context.beginPath();
    context.moveTo(845, 458);
    context.bezierCurveTo(820, 365, 887, 270, 842, 116);
    context.stroke();
    for (let index = 0; index < 8; index += 1) {
      const side = index % 2 ? -1 : 1;
      context.save();
      context.translate(848 + side * 18, 420 - index * 39);
      context.rotate(side * 0.72);
      context.beginPath();
      context.ellipse(0, 0, 12, 31, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  } else {
    context.fillStyle = "#111216";
    context.fillRect(0, 0, element.width, element.height);
    context.fillStyle = "#ef3157";
    context.fillRect(0, 0, 10, element.height);
    context.fillStyle = "#00bed7";
    context.fillRect(element.width - 10, 0, 10, element.height);
    context.textAlign = "center";
    context.font = "600 166px 'Cormorant Garamond', Georgia, serif";
    context.fillStyle = "#ef3157";
    context.fillText("GEHIRN", 507, 316);
    context.fillStyle = "#00bed7";
    context.fillText("GEHIRN", 517, 316);
    context.fillStyle = "#efede8";
    context.fillText("GEHIRN", 512, 316);
    context.font = "400 27px 'Share Tech Mono', monospace";
    context.fillStyle = "#c9c6c0";
    context.fillText(language === "de" ? "PROJEKTE" : "PROJECTS", 512, 410);
  }

  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = qualityLow ? 4 : 10;
  return texture;
}

async function start() {
  setLoadingProgress(4);
  rewriteLocalLinks();
  let language = "en";
  try { language = localStorage.getItem(KEY) || document.documentElement.dataset.language || "en"; } catch (_) {}
  language = applyLanguage(language);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !qualityLow,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualityLow ? 1 : 1.65));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = !qualityLow;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  setLoadingProgress(10);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x171317);
  scene.fog = new THREE.FogExp2(0x171317, 0.018);

  const initialAspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.PerspectiveCamera(39, initialAspect, 0.1, 100);
  const initialDirection = new THREE.Vector3(0.6, 9.4, 18.7).normalize();
  const initialDistance = initialAspect < 0.72 ? 41 : initialAspect < 1.08 ? 27 : 20.96;
  camera.position.copy(initialDirection.multiplyScalar(initialDistance));

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.25, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.enablePan = false;
  controls.minDistance = 8.85;
  controls.maxDistance = initialAspect < 0.72 ? 52 : 38;
  controls.minPolarAngle = 0.16;
  controls.maxPolarAngle = Math.PI * 0.68;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.24;
  controls.addEventListener("start", () => {
    document.body.classList.add("is-orbiting");
    controls.autoRotate = false;
  });
  controls.addEventListener("end", () => document.body.classList.remove("is-orbiting"));

  const textureLoader = new THREE.TextureLoader();
  const TEX = "/shared/hub/textures";
  let loadedTextures = 0;
  const trackedTexture = (url, options) => loadTexture(textureLoader, url, options).finally(() => {
    loadedTextures += 1;
    setLoadingProgress(10 + (loadedTextures / 14) * 60);
  });
  const [
    meadow, forestNormal, forestRoughness, rock, rockNormal, asphalt,
    cobble, bark, facadeA, facadeB, waterNormals, tropicalLeaf,
    chapelFieldstone, chapelRoofTiles,
  ] = await Promise.all([
    trackedTexture(`${TEX}/meadow.jpg`, { repeat: 5.4 }),
    trackedTexture(`${TEX}/forest-floor-normal.jpg`, { repeat: 5.4, srgb: false }),
    trackedTexture(`${TEX}/forest-floor-roughness.jpg`, { repeat: 5.4, srgb: false }),
    trackedTexture(`${TEX}/mossy-rock.jpg`, { repeat: 1.8 }),
    trackedTexture(`${TEX}/mossy-rock-normal.jpg`, { repeat: 1.8, srgb: false }),
    trackedTexture(`${TEX}/asphalt.jpg`, { repeat: 2.7 }),
    trackedTexture(`${TEX}/cobble.jpg`, { repeat: 2.2 }),
    trackedTexture(`${TEX}/bark.jpg`, { repeat: 2.0 }),
    trackedTexture(`${TEX}/facade-a.jpg`),
    trackedTexture(`${TEX}/facade-b.jpg`),
    trackedTexture(`${TEX}/waternormals.jpg`, { repeat: 1.7, srgb: false }),
    trackedTexture(`${TEX}/tropical-leaf.png`),
    trackedTexture(`${TEX}/chapel-fieldstone-v1.webp`, { repeat: [1.05, 1.25] }),
    trackedTexture(`${TEX}/chapel-roof-biberschwanz-v1.webp`, { repeat: [1.35, 2.1] }),
  ]);
  setLoadingProgress(72);

  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: { uSide: { value: 0.5 } },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDirection;
      uniform float uSide;
      void main() {
        float height = clamp(vDirection.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 dawnLow = vec3(0.96, 0.58, 0.24);
        vec3 dawnHigh = vec3(0.43, 0.62, 0.68);
        vec3 nightLow = vec3(0.035, 0.045, 0.065);
        vec3 nightHigh = vec3(0.008, 0.012, 0.025);
        vec3 dawn = mix(dawnLow, dawnHigh, pow(height, 0.7));
        vec3 night = mix(nightLow, nightHigh, pow(height, 1.15));
        vec3 color = mix(dawn, night, uSide);
        color += vec3(1.0, 0.56, 0.16) * pow(max(dot(vDirection, normalize(vec3(-0.65, 0.26, -0.2))), 0.0), 82.0) * (1.0-uSide);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(58, 36, 24), skyMaterial);
  sky.frustumCulled = false;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xffd39b, 0x243820, 1.45);
  scene.add(hemi);
  const sunrise = new THREE.DirectionalLight(0xffbd6a, 3.1);
  sunrise.position.set(-12, 14, 8);
  sunrise.castShadow = !qualityLow;
  if (sunrise.castShadow) {
    sunrise.shadow.mapSize.set(2048, 2048);
    sunrise.shadow.camera.near = 1;
    sunrise.shadow.camera.far = 45;
    sunrise.shadow.camera.left = -12;
    sunrise.shadow.camera.right = 12;
    sunrise.shadow.camera.top = 12;
    sunrise.shadow.camera.bottom = -12;
    sunrise.shadow.bias = -0.00035;
  }
  scene.add(sunrise);
  const moonlight = new THREE.DirectionalLight(0x9fc6ff, 0.5);
  moonlight.position.set(12, 13, -7);
  scene.add(moonlight);
  const neonPink = new THREE.PointLight(0xff477a, 0, 13, 1.7);
  neonPink.position.set(4.7, 4.2, -0.3);
  scene.add(neonPink);
  const neonCyan = new THREE.PointLight(0x39d9ef, 0, 12, 1.7);
  neonCyan.position.set(6, 3.1, 2.4);
  scene.add(neonCyan);
  const soulFill = new THREE.PointLight(0xffd89a, 7.6, 18, 1.55);
  soulFill.position.set(-4.8, 6.2, 3.4);
  scene.add(soulFill);
  const undersideFill = new THREE.PointLight(0x9fc2b7, 8.2, 24, 1.35);
  undersideFill.position.set(-1.2, -5.2, 6.8);
  scene.add(undersideFill);

  const islandMaterial = new THREE.MeshStandardMaterial({
    color: 0x544840,
    map: rock,
    normalMap: rockNormal,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughness: 0.92,
    emissive: 0x120f0d,
    emissiveIntensity: 0.34,
  });
  const islandGeometry = new THREE.CylinderGeometry(8.2, 6.7, 2.7, 96, 6, false);
  const islandPosition = islandGeometry.attributes.position;
  for (let index = 0; index < islandPosition.count; index += 1) {
    const x = islandPosition.getX(index);
    const z = islandPosition.getZ(index);
    const angle = Math.atan2(z, x);
    const irregularity = 1 + Math.sin(angle * 5.0) * 0.018 + Math.sin(angle * 11.0 + 0.7) * 0.013;
    islandPosition.setX(index, x * irregularity);
    islandPosition.setZ(index, z * irregularity);
  }
  islandGeometry.computeVertexNormals();
  const island = new THREE.Mesh(islandGeometry, islandMaterial);
  island.scale.z = 0.7;
  island.position.y = -0.74;
  island.castShadow = !qualityLow;
  island.receiveShadow = true;
  scene.add(island);

  const undersideMaterial = new THREE.MeshStandardMaterial({
    color: 0x373238,
    map: rock,
    normalMap: rockNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.97,
    emissive: 0x171419,
    emissiveIntensity: 0.72,
  });
  const underside = new THREE.Mesh(
    new THREE.ConeGeometry(6.68, 5.2, 80, 8, true),
    undersideMaterial
  );
  underside.scale.z = 0.7;
  underside.rotation.z = Math.PI;
  underside.position.y = -4.66;
  underside.castShadow = !qualityLow;
  scene.add(underside);

  const mossRim = new THREE.Mesh(
    new THREE.TorusGeometry(8.0, 0.09, 8, 96),
    new THREE.MeshStandardMaterial({ color: 0x526147, roughness: 0.98 })
  );
  mossRim.rotation.x = Math.PI / 2;
  mossRim.scale.z = 0.7;
  mossRim.position.y = 0.65;
  mossRim.visible = false;
  scene.add(mossRim);

  const undersideRockRandom = rng(241);
  for (let index = 0; index < (qualityLow ? 32 : 66); index += 1) {
    const angle = undersideRockRandom() * Math.PI * 2;
    const radial = Math.sqrt(undersideRockRandom()) * 6.55;
    const x = Math.cos(angle) * radial;
    const z = Math.sin(angle) * radial * 0.7;
    const rockChunk = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.55 + undersideRockRandom() * 0.75, 1),
      undersideMaterial
    );
    rockChunk.position.set(x, -1.6 - undersideRockRandom() * (2.25 - radial * 0.12), z);
    rockChunk.scale.set(
      0.7 + undersideRockRandom() * 0.9,
      0.8 + undersideRockRandom() * 1.7,
      0.7 + undersideRockRandom() * 0.9
    );
    rockChunk.rotation.set(undersideRockRandom(), undersideRockRandom() * Math.PI, undersideRockRandom());
    rockChunk.castShadow = !qualityLow;
    scene.add(rockChunk);
  }

  // Long, irregular stone teeth make the whole shared world read as one
  // suspended island, while leaving both top surfaces untouched.
  const spireRandom = rng(8841);
  for (let index = 0; index < (qualityLow ? 10 : 18); index += 1) {
    const angle = spireRandom() * Math.PI * 2;
    const radial = 1.0 + Math.sqrt(spireRandom()) * 4.9;
    const from = new THREE.Vector3(
      Math.cos(angle) * radial,
      -1.72 - spireRandom() * 0.42,
      Math.sin(angle) * radial * 0.7
    );
    const length = 2.4 + spireRandom() * 3.7 + (1 - radial / 6) * 1.3;
    const to = from.clone().add(new THREE.Vector3(
      (spireRandom() - 0.5) * 1.05,
      -length,
      (spireRandom() - 0.5) * 0.72
    ));
    const direction = to.clone().sub(from);
    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(0.34 + spireRandom() * 0.46, direction.length(), 9, 3, true),
      undersideMaterial
    );
    spire.position.copy(from).add(to).multiplyScalar(0.5);
    spire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    spire.scale.z = 0.72 + spireRandom() * 0.45;
    spire.rotation.y += spireRandom() * Math.PI;
    spire.castShadow = !qualityLow;
    scene.add(spire);
  }

  const voidShadow = new THREE.Mesh(
    new THREE.CircleGeometry(8.4, 64),
    new THREE.MeshBasicMaterial({ color: 0x050507, transparent: true, opacity: 0.18, depthWrite: false })
  );
  voidShadow.rotation.x = -Math.PI / 2;
  voidShadow.scale.set(0.72, 0.42, 0.72);
  voidShadow.position.y = -9.1;
  scene.add(voidShadow);

  const soulGroundMaterial = new THREE.MeshStandardMaterial({
    color: 0x5fc34a,
    map: meadow,
    normalMap: forestNormal,
    normalScale: new THREE.Vector2(0.72, 0.72),
    roughnessMap: forestRoughness,
    roughness: 0.96,
    emissive: 0x143b10,
    emissiveIntensity: 0.2,
  });
  const mindGroundMaterial = new THREE.MeshStandardMaterial({
    color: 0x3c3f4c,
    map: asphalt,
    roughness: 0.44,
    metalness: 0.12,
  });
  const soulGround = new THREE.Mesh(new THREE.ShapeGeometry(halfEllipseShape(-1, 8.05, 5.62), 48), soulGroundMaterial);
  soulGround.rotation.x = -Math.PI / 2;
  soulGround.position.y = 0.665;
  soulGround.receiveShadow = true;
  scene.add(soulGround);
  const mindGround = new THREE.Mesh(new THREE.ShapeGeometry(halfEllipseShape(1, 8.05, 5.62), 48), mindGroundMaterial);
  mindGround.rotation.x = -Math.PI / 2;
  mindGround.position.y = 0.67;
  mindGround.receiveShadow = true;
  scene.add(mindGround);

  const seam = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.05, 10.8),
    new THREE.MeshStandardMaterial({ color: 0x766a59, roughness: 0.75, metalness: 0.12 })
  );
  seam.position.set(0, 0.71, 0);
  scene.add(seam);

  const pondShape = new THREE.Shape();
  pondShape.absellipse(-4.12, -1.3, 1.72, 1.02, 0, Math.PI * 2, false, 0);
  const streamShape = new THREE.Shape();
  streamShape.moveTo(-4.66, -1.55);
  streamShape.bezierCurveTo(-4.42, -2.28, -4.65, -3.25, -4.48, -4.55);
  streamShape.lineTo(-3.65, -4.55);
  streamShape.bezierCurveTo(-3.78, -3.2, -3.55, -2.26, -3.61, -1.55);
  streamShape.closePath();
  const waterGeometry = new THREE.ShapeGeometry([pondShape, streamShape], 48);
  const waterBed = new THREE.Mesh(
    waterGeometry.clone(),
    new THREE.MeshStandardMaterial({ color: 0x0b4e52, roughness: 0.82, metalness: 0.02 })
  );
  waterBed.rotation.x = -Math.PI / 2;
  waterBed.position.y = 0.725;
  waterBed.receiveShadow = true;
  scene.add(waterBed);
  const soulWater = new Water(waterGeometry, {
    textureWidth: qualityLow ? 256 : 512,
    textureHeight: qualityLow ? 256 : 512,
    waterNormals,
    sunDirection: sunrise.position.clone().normalize(),
    sunColor: 0xf2c78c,
    waterColor: 0x0e6d72,
    distortionScale: 0.95,
    alpha: 0.68,
    fog: true,
  });
  soulWater.rotation.x = -Math.PI / 2;
  soulWater.position.y = 0.752;
  soulWater.material.transparent = true;
  soulWater.material.depthWrite = true;
  soulWater.renderOrder = 3;
  scene.add(soulWater);
  setLoadingProgress(78);

  const pathStoneMaterial = new THREE.MeshStandardMaterial({ color: 0xada38d, map: cobble, roughness: 0.94 });
  const pathRandom = rng(735);
  for (let index = 0; index < 26; index += 1) {
    const progress = index / 25;
    const x = THREE.MathUtils.lerp(-4.85, -3.18, progress) + Math.sin(progress * Math.PI * 2.4) * 0.78;
    const z = THREE.MathUtils.lerp(4.15, -0.25, progress);
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.19 + pathRandom() * 0.14, 0.22 + pathRandom() * 0.15, 0.07, 9), pathStoneMaterial);
    stone.position.set(x, 0.73 + pathRandom() * 0.018, z);
    stone.rotation.y = pathRandom() * Math.PI;
    stone.scale.z = 0.62 + pathRandom() * 0.4;
    stone.receiveShadow = true;
    scene.add(stone);
  }

  const bridge = new THREE.Group();
  const bridgeWood = new THREE.MeshStandardMaterial({ color: 0x6b4328, roughness: 0.82 });
  for (let index = 0; index < 11; index += 1) {
    const plank = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.08, 1.72, 2, 0.025), bridgeWood);
    plank.position.set((index - 5) * 0.16, Math.sin(index * 0.32) * 0.025, 0);
    plank.rotation.y = (index % 2 ? 1 : -1) * 0.015;
    bridge.add(plank);
  }
  for (const z of [-0.82, 0.82]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.72, 7), bridgeWood);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, 0.48, z);
    bridge.add(rail);
    for (const x of [-0.72, 0, 0.72]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.52, 7), bridgeWood);
      post.position.set(x, 0.25, z);
      bridge.add(post);
    }
  }
  bridge.position.set(-4.02, 0.84, 3.0);
  bridge.rotation.y = Math.PI / 2;
  scene.add(bridge);

  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x929d79,
    map: rock,
    normalMap: rockNormal,
    normalScale: new THREE.Vector2(0.42, 0.42),
    roughness: 0.96,
    emissive: 0x202719,
    emissiveIntensity: 0.32,
  });
  const rockRandom = rng(53);
  for (let index = 0; index < (qualityLow ? 26 : 52); index += 1) {
    const angle = rockRandom() * Math.PI * 2;
    const radius = index < 16 ? 1.65 + rockRandom() * 0.55 : 6.55 + rockRandom() * 1.15;
    const x = index < 16 ? -4.15 + Math.cos(angle) * radius * 1.18 : Math.cos(angle) * radius;
    const z = index < 16 ? 1.35 + Math.sin(angle) * radius * 0.72 : Math.sin(angle) * radius * 0.69;
    if (!ellipseContains(x, z, -0.15)) continue;
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + rockRandom() * 0.36, 1), rockMaterial);
    mesh.position.set(x, 0.72 + rockRandom() * 0.08, z);
    mesh.scale.set(1 + rockRandom() * 0.9, 0.55 + rockRandom() * 0.5, 0.75 + rockRandom() * 0.7);
    mesh.rotation.set(rockRandom(), rockRandom() * Math.PI, rockRandom());
    mesh.castShadow = !qualityLow;
    scene.add(mesh);
  }

  const grassBladeMap = canvasParticle((context, size) => {
    context.clearRect(0, 0, size, size);
    context.fillStyle = "#ffffff";
    const blades = [
      [47, 94, 50, 21, 54, 94],
      [35, 94, 38, 39, 43, 94],
      [58, 94, 68, 35, 63, 94],
      [25, 94, 17, 53, 31, 94],
      [70, 94, 82, 56, 76, 94],
    ];
    blades.forEach(([left, bottom, tip, top, right]) => {
      context.beginPath();
      context.moveTo(left, bottom);
      context.quadraticCurveTo(tip - 4, (bottom + top) * 0.58, tip, top);
      context.quadraticCurveTo(tip + 4, (bottom + top) * 0.62, right, bottom);
      context.closePath();
      context.fill();
    });
  });
  grassBladeMap.anisotropy = qualityLow ? 2 : 6;
  const grassMaterial = new THREE.MeshStandardMaterial({
    color: 0x65c84b,
    map: grassBladeMap,
    roughness: 0.92,
    side: THREE.DoubleSide,
    vertexColors: true,
    transparent: true,
    alphaTest: 0.18,
    depthWrite: true,
    emissive: 0x1b4613,
    emissiveIntensity: 0.48,
  });
  grassMaterial.userData.time = { value: 0 };
  grassMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = grassMaterial.userData.time;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;");
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\ntransformed.x += sin(uTime*1.15 + instanceMatrix[3].x*0.8 + instanceMatrix[3].z)*0.07*uv.y;"
    );
  };
  const grassGeometry = new THREE.PlaneGeometry(0.064, 0.44, 1, 3);
  grassGeometry.translate(0, 0.22, 0);
  const grassCount = qualityLow ? 3800 : 11800;
  const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, grassCount);
  grass.frustumCulled = false;
  const grassRandom = rng(18);
  const dummy = new THREE.Object3D();
  const instanceColor = new THREE.Color();
  for (let index = 0; index < grassCount; index += 1) {
    let x;
    let z;
    do {
      x = -0.15 - grassRandom() * 7.55;
      z = -5.25 + grassRandom() * 10.5;
    } while (!ellipseContains(x, z, 0.25) || soulWaterContains(x, z, 0.28));
    dummy.position.set(x, 0.69, z);
    dummy.rotation.set(0, grassRandom() * Math.PI, (grassRandom() - 0.5) * 0.16);
    const scale = 0.68 + grassRandom() * 1.05;
    dummy.scale.set(scale, 0.82 + grassRandom() * 0.92, scale);
    dummy.updateMatrix();
    grass.setMatrixAt(index, dummy.matrix);
    instanceColor.setHSL(0.275 + grassRandom() * 0.09, 0.64 + grassRandom() * 0.2, 0.32 + grassRandom() * 0.17);
    grass.setColorAt(index, instanceColor);
  }
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  scene.add(grass);

  const flowerCount = qualityLow ? 90 : 240;
  const petalsPerFlower = 5;
  const flowerRandom = rng(281);
  const flowerStemMaterial = new THREE.MeshStandardMaterial({ color: 0x397b31, roughness: 0.94 });
  const flowerCenterMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd75f,
    emissive: 0x5b3005,
    emissiveIntensity: 0.25,
    roughness: 0.72,
  });
  const stemGeometry = new THREE.CylinderGeometry(0.012, 0.018, 1, 5);
  stemGeometry.translate(0, 0.5, 0);
  const flowerPetalGeometry = new THREE.SphereGeometry(0.055, 6, 4);
  const flowerCenterGeometry = new THREE.SphereGeometry(0.035, 7, 5);
  const flowerStems = new THREE.InstancedMesh(stemGeometry, flowerStemMaterial, flowerCount);
  const flowerCenters = new THREE.InstancedMesh(flowerCenterGeometry, flowerCenterMaterial, flowerCount);
  const flowerPalette = [0xff4f8b, 0xffa83d, 0x9b77ff, 0x39c8ff, 0xfff4df, 0xf05ad8];
  const petalCapacity = Math.ceil(flowerCount / flowerPalette.length) * petalsPerFlower;
  const flowerPetals = flowerPalette.map((color) => new THREE.InstancedMesh(
    flowerPetalGeometry,
    new THREE.MeshBasicMaterial({ color, toneMapped: false }),
    petalCapacity
  ));
  const petalCounts = flowerPalette.map(() => 0);
  for (let index = 0; index < flowerCount; index += 1) {
    let x;
    let z;
    do {
      x = -0.4 - flowerRandom() * 7.1;
      z = -5 + flowerRandom() * 10;
    } while (
      !ellipseContains(x, z, 0.42)
      || soulWaterContains(x, z, 0.38)
      || Math.hypot((x + 3.3) / 1.45, (z + 1.65) / 1.65) < 1
    );

    const height = 0.22 + flowerRandom() * 0.31;
    dummy.position.set(x, 0.7, z);
    dummy.rotation.set((flowerRandom() - 0.5) * 0.08, flowerRandom() * Math.PI, (flowerRandom() - 0.5) * 0.11);
    dummy.scale.set(0.82 + flowerRandom() * 0.35, height, 0.82 + flowerRandom() * 0.35);
    dummy.updateMatrix();
    flowerStems.setMatrixAt(index, dummy.matrix);

    const headY = 0.7 + height;
    dummy.position.set(x, headY, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(0.92 + flowerRandom() * 0.42);
    dummy.updateMatrix();
    flowerCenters.setMatrixAt(index, dummy.matrix);

    const paletteIndex = index % flowerPalette.length;
    const petalMesh = flowerPetals[paletteIndex];
    const phase = flowerRandom() * Math.PI * 2;
    for (let petal = 0; petal < petalsPerFlower; petal += 1) {
      const angle = phase + (petal / petalsPerFlower) * Math.PI * 2;
      const petalIndex = petalCounts[paletteIndex];
      dummy.position.set(
        x + Math.cos(angle) * 0.058,
        headY + 0.006 + Math.sin(petal * 2.7) * 0.006,
        z + Math.sin(angle) * 0.058
      );
      dummy.rotation.set(0, -angle, Math.sin(angle) * 0.16);
      dummy.scale.set(1.25, 0.5, 0.82);
      dummy.updateMatrix();
      petalMesh.setMatrixAt(petalIndex, dummy.matrix);
      petalCounts[paletteIndex] += 1;
    }
  }
  flowerStems.instanceMatrix.needsUpdate = true;
  flowerCenters.instanceMatrix.needsUpdate = true;
  flowerStems.frustumCulled = false;
  flowerCenters.frustumCulled = false;
  flowerPetals.forEach((petalMesh, index) => {
    petalMesh.count = petalCounts[index];
    petalMesh.instanceMatrix.needsUpdate = true;
    petalMesh.frustumCulled = false;
  });
  scene.add(flowerStems, ...flowerPetals, flowerCenters);
  setLoadingProgress(84);

  const barkMaterial = new THREE.MeshStandardMaterial({ color: 0x51402e, map: bark, roughness: 0.91 });
  const leafMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x285a31, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x3d7939, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x719348, roughness: 0.9 }),
  ];
  const leafGeometry = new THREE.DodecahedronGeometry(0.42, 1);
  const proceduralJungle = [];
  let detailLeaves = null;

  function createJungleTree(x, z, scale, seed) {
    const random = rng(seed);
    const group = new THREE.Group();
    const trunkStart = new THREE.Vector3(0, 0, 0);
    const trunkEnd = new THREE.Vector3((random() - 0.5) * 0.35, 2.4 * scale, (random() - 0.5) * 0.25);
    group.add(cylinderBetween(trunkStart, trunkEnd, 0.16 * scale, barkMaterial, 10));
    for (let branchIndex = 0; branchIndex < 7; branchIndex += 1) {
      const angle = (branchIndex / 7) * Math.PI * 2 + random() * 0.5;
      const from = trunkEnd.clone().multiplyScalar(0.58 + random() * 0.28);
      const to = from.clone().add(new THREE.Vector3(
        Math.cos(angle) * (0.75 + random() * 0.65) * scale,
        (0.45 + random() * 0.7) * scale,
        Math.sin(angle) * (0.75 + random() * 0.65) * scale
      ));
      group.add(cylinderBetween(from, to, 0.07 * scale, barkMaterial, 7));
      for (let leafIndex = 0; leafIndex < 5; leafIndex += 1) {
        const leaf = new THREE.Mesh(leafGeometry, leafMaterials[(branchIndex + leafIndex) % leafMaterials.length]);
        leaf.position.copy(to).add(new THREE.Vector3(
          (random() - 0.5) * 0.85 * scale,
          (random() - 0.25) * 0.65 * scale,
          (random() - 0.5) * 0.85 * scale
        ));
        leaf.scale.set(0.72 + random() * 0.48, 0.58 + random() * 0.42, 0.72 + random() * 0.48);
        leaf.rotation.set(random(), random(), random());
        leaf.castShadow = !qualityLow;
        group.add(leaf);
      }
    }
    group.position.set(x, 0.7, z);
    proceduralJungle.push(group);
    scene.add(group);
  }

  const jungleTreeLayout = [
    [-6.35, -2.75, 1.08], [-6.7, 0.5, 0.9], [-5.25, -4.05, 0.83],
    [-2.0, -4.35, 0.78], [-7.05, 3.15, 0.85], [-1.6, 3.9, 0.75],
  ].slice(0, qualityLow ? 4 : 6);
  jungleTreeLayout.forEach((position, index) => createJungleTree(...position, 61 + index * 17));

  if (tropicalLeaf) {
    const detailLeafGeometry = new THREE.PlaneGeometry(0.24, 0.62, 1, 2);
    detailLeafGeometry.translate(0, 0.28, 0);
    const detailLeafMaterial = new THREE.MeshStandardMaterial({
      map: tropicalLeaf,
      color: 0x7ea45e,
      alphaTest: 0.18,
      transparent: true,
      side: THREE.DoubleSide,
      roughness: 0.86,
      vertexColors: true,
    });
    const detailLeafCount = qualityLow ? 760 : 1950;
    detailLeaves = new THREE.InstancedMesh(detailLeafGeometry, detailLeafMaterial, detailLeafCount);
    detailLeaves.frustumCulled = false;
    const detailRandom = rng(625);
    for (let index = 0; index < detailLeafCount; index += 1) {
      const tree = jungleTreeLayout[index % jungleTreeLayout.length];
      const angle = detailRandom() * Math.PI * 2;
      const radius = Math.sqrt(detailRandom()) * (1.25 + tree[2] * 0.9);
      dummy.position.set(
        tree[0] + Math.cos(angle) * radius,
        2.15 + tree[2] * 1.25 + (detailRandom() - 0.45) * 1.55,
        tree[1] + Math.sin(angle) * radius
      );
      dummy.rotation.set(
        (detailRandom() - 0.5) * 1.4,
        detailRandom() * Math.PI * 2,
        (detailRandom() - 0.5) * 1.5
      );
      const scale = 0.72 + detailRandom() * 0.9;
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      detailLeaves.setMatrixAt(index, dummy.matrix);
      instanceColor.setHSL(0.23 + detailRandom() * 0.14, 0.42 + detailRandom() * 0.3, 0.28 + detailRandom() * 0.24);
      detailLeaves.setColorAt(index, instanceColor);
    }
    scene.add(detailLeaves);
  }

  function createPalm(x, z, scale, seed) {
    const random = rng(seed);
    const group = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3((random() - 0.5) * 0.25, 1.3 * scale, 0),
      new THREE.Vector3((random() - 0.45) * 0.55, 2.8 * scale, (random() - 0.5) * 0.25),
    ]);
    const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.11 * scale, 8, false), barkMaterial);
    trunk.castShadow = !qualityLow;
    group.add(trunk);
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: 0x74a94d,
      map: tropicalLeaf,
      alphaTest: tropicalLeaf ? 0.2 : 0,
      transparent: Boolean(tropicalLeaf),
      side: THREE.DoubleSide,
      roughness: 0.88,
    });
    const crown = curve.getPoint(1);
    const leafAxis = new THREE.Vector3(0, 1, 0);
    for (let index = 0; index < 11; index += 1) {
      const angle = (index / 11) * Math.PI * 2;
      const length = (1.82 + random() * 0.46) * scale;
      const leaf = new THREE.Mesh(
        new THREE.PlaneGeometry((0.36 + random() * 0.11) * scale, length, 2, 5),
        leafMaterial
      );
      leaf.geometry.translate(0, length * 0.5, 0);
      leaf.position.copy(crown);
      const direction = new THREE.Vector3(
        Math.cos(angle),
        0.16 - random() * 0.34,
        Math.sin(angle)
      ).normalize();
      leaf.quaternion.setFromUnitVectors(leafAxis, direction);
      leaf.rotateY((random() - 0.5) * 0.18);
      group.add(leaf);
    }
    group.position.set(x, 0.72, z);
    scene.add(group);
  }
  createPalm(-5.45, 3.35, 0.85, 821);
  createPalm(-2.05, -3.05, 0.72, 833);
  if (!qualityLow) createPalm(-7.0, -0.8, 0.68, 847);

  const fernLoader = new GLTFLoader();
  fernLoader.load(
    "/shared/hub/models/fern_02/fern_02.gltf",
    (gltf) => {
      const fernRandom = rng(923);
      for (let index = 0; index < (qualityLow ? 12 : 28); index += 1) {
        const fern = gltf.scene.clone(true);
        let x;
        let z;
        do {
          x = -0.8 - fernRandom() * 6.8;
          z = -4.8 + fernRandom() * 9.6;
        } while (!ellipseContains(x, z, 0.55));
        fern.position.set(x, 0.7, z);
        fern.rotation.y = fernRandom() * Math.PI * 2;
        fern.scale.setScalar(0.24 + fernRandom() * 0.3);
        scene.add(fern);
      }
    },
    undefined,
    () => {}
  );

  const detailedPlantLoader = new GLTFLoader();
  function prepareDetailedModel(root, alphaMap = null, alphaMatcher = () => true) {
    root.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = !qualityLow;
      child.receiveShadow = true;
      if (child.material) {
        child.material.side = THREE.DoubleSide;
        child.material.alphaTest = Math.max(child.material.alphaTest || 0, 0.18);
        if (alphaMap && alphaMatcher(child)) {
          child.material.alphaMap = alphaMap;
          child.material.alphaTest = 0.34;
          child.material.transparent = false;
          child.material.needsUpdate = true;
        }
      }
    });
    return root;
  }
  function placeDetailedModel(source, x, z, height, rotation = 0) {
    const clone = source.clone(true);
    const sourceBox = new THREE.Box3().setFromObject(clone);
    const sourceSize = sourceBox.getSize(new THREE.Vector3());
    const sourceCenter = sourceBox.getCenter(new THREE.Vector3());
    const scale = height / Math.max(sourceSize.y, 0.001);
    clone.scale.setScalar(scale);
    clone.position.set(-sourceCenter.x * scale, -sourceBox.min.y * scale, -sourceCenter.z * scale);
    const holder = new THREE.Group();
    holder.add(clone);
    holder.position.set(x, 0.7, z);
    holder.rotation.y = rotation;
    scene.add(holder);
    return holder;
  }
  Promise.all([
    detailedPlantLoader.loadAsync("/shared/hub/models/polyhaven/pachira_aquatica_01/pachira_aquatica_01_1k.gltf"),
    loadTexture(textureLoader, "/shared/hub/models/polyhaven/pachira_aquatica_01/textures/pachira_aquatica_01_leaves_alpha_1k.png", { srgb: false }),
  ]).then(([treeModel, treeAlpha]) => {
    document.body.dataset.detailedPlants = "ready";
    const treeVariants = [0, 1, 2, 3].map((index) => {
      const variant = new THREE.Group();
      variant.add(treeModel.scene.children[index].clone(true));
      variant.add(treeModel.scene.children[index + 4].clone(true));
      return prepareDetailedModel(variant, treeAlpha, (child) => child.name.includes("leaves"));
    });
    proceduralJungle.forEach((tree) => { tree.visible = false; });
    if (detailLeaves) detailLeaves.visible = false;

    jungleTreeLayout.forEach((position, index) => {
      placeDetailedModel(treeVariants[index % treeVariants.length], position[0], position[1], 3.4 + position[2] * 1.25, index * 1.37);
    });
  }).catch((error) => {
    document.body.dataset.detailedPlants = "failed";
    console.error("Detailed diorama plants failed to load", error);
  });

  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: 0xf0e5d3,
    map: chapelFieldstone,
    roughness: 0.96,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd6cd,
    map: chapelRoofTiles,
    roughness: 0.9,
    emissive: 0x260400,
    emissiveIntensity: 0.1,
  });
  const windowMaterial = new THREE.MeshStandardMaterial({ color: 0xffd48e, emissive: 0xff9b42, emissiveIntensity: 0.9 });
  const chapel = new THREE.Group();
  const nave = new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.55, 3.05, 4, 0.08), stoneMaterial);
  nave.position.y = 0.8;
  nave.castShadow = !qualityLow;
  chapel.add(nave);
  const roof = createGabledRoof(2.52, 3.36, 1.05, roofMaterial, stoneMaterial);
  roof.position.y = 1.54;
  chapel.add(roof);
  const tower = new THREE.Mesh(new RoundedBoxGeometry(0.92, 2.45, 0.95, 3, 0.05), stoneMaterial);
  tower.position.set(0, 1.35, 1.44);
  tower.castShadow = !qualityLow;
  chapel.add(tower);
  const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(0.88, 1.05, 4), roofMaterial);
  towerRoof.rotation.y = Math.PI / 4;
  towerRoof.position.set(0, 3.0, 1.44);
  chapel.add(towerRoof);
  const door = new THREE.Mesh(new RoundedBoxGeometry(0.55, 1.02, 0.08, 4, 0.26), new THREE.MeshStandardMaterial({ color: 0x3a2518, roughness: 0.8 }));
  door.position.set(0, 0.58, 1.96);
  chapel.add(door);
  for (const x of [-0.62, 0.62]) {
    const windowMesh = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.58, 0.04, 3, 0.14), windowMaterial);
    windowMesh.position.set(x, 0.9, 1.58);
    chapel.add(windowMesh);
  }
  const crossMaterial = new THREE.MeshStandardMaterial({ color: 0x2f241a, roughness: 0.6, metalness: 0.15 });
  const cross = new THREE.Group();
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.74, 0.09), crossMaterial);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.09), crossMaterial);
  crossH.position.y = 0.16;
  cross.add(crossV, crossH);
  cross.position.set(0, 3.82, 1.44);
  chapel.add(cross);
  chapel.position.set(-3.3, 0.72, -1.65);
  chapel.rotation.y = -0.1;
  scene.add(chapel);
  const chapelGlow = new THREE.PointLight(0xffbd70, 5.5, 7, 1.8);
  chapelGlow.position.set(-3.3, 2.2, 0.2);
  scene.add(chapelGlow);
  setLoadingProgress(90);

  const wetWood = new THREE.MeshStandardMaterial({ color: 0x291a18, roughness: 0.48, metalness: 0.08 });
  const redWood = new THREE.MeshStandardMaterial({ color: 0x8d191f, roughness: 0.42, metalness: 0.12 });
  const darkRoof = new THREE.MeshStandardMaterial({ color: 0x16191e, roughness: 0.36, metalness: 0.32 });
  const shrine = new THREE.Group();
  const shrineBase = new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.38, 2.5, 3, 0.06), wetWood);
  shrineBase.position.y = 0.19;
  shrine.add(shrineBase);
  for (const x of [-0.92, 0.92]) {
    for (const z of [-0.72, 0.72]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.85, 10), redWood);
      post.position.set(x, 1.14, z);
      shrine.add(post);
    }
  }
  for (let tier = 0; tier < 3; tier += 1) {
    const roofTier = new THREE.Mesh(new THREE.ConeGeometry(2.05 - tier * 0.38, 0.7, 4), darkRoof);
    roofTier.rotation.y = Math.PI / 4;
    roofTier.scale.z = 0.82;
    roofTier.position.y = 1.9 + tier * 0.62;
    shrine.add(roofTier);
  }
  const shrineLight = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.04), windowMaterial.clone());
  shrineLight.material.emissiveIntensity = 1.8;
  shrineLight.position.set(0, 1.1, 1.27);
  shrine.add(shrineLight);
  shrine.position.set(3.35, 0.71, -1.4);
  scene.add(shrine);

  function toriiGate(x, z, scale = 1) {
    const group = new THREE.Group();
    const postGeometry = new THREE.CylinderGeometry(0.11 * scale, 0.15 * scale, 2.75 * scale, 10);
    for (const postX of [-0.9, 0.9]) {
      const post = new THREE.Mesh(postGeometry, redWood);
      post.position.set(postX * scale, 1.38 * scale, 0);
      post.castShadow = !qualityLow;
      group.add(post);
    }
    const lintel = new THREE.Mesh(new RoundedBoxGeometry(2.65 * scale, 0.2 * scale, 0.22 * scale, 3, 0.07), redWood);
    lintel.position.y = 2.62 * scale;
    group.add(lintel);
    const topBeam = new THREE.Mesh(new RoundedBoxGeometry(3.0 * scale, 0.18 * scale, 0.3 * scale, 3, 0.08), redWood);
    topBeam.position.y = 2.94 * scale;
    group.add(topBeam);
    group.position.set(x, 0.72, z);
    group.rotation.y = -0.12;
    scene.add(group);
  }
  toriiGate(4.2, 2.72, 0.88);

  const rightPathMaterial = new THREE.MeshStandardMaterial({ color: 0x55555d, map: cobble, roughness: 0.72, metalness: 0.08 });
  const rightPathRandom = rng(391);
  for (let index = 0; index < 22; index += 1) {
    const progress = index / 21;
    const slab = new THREE.Mesh(
      new RoundedBoxGeometry(0.58 + rightPathRandom() * 0.18, 0.075, 0.28 + rightPathRandom() * 0.14, 2, 0.025),
      rightPathMaterial
    );
    slab.position.set(
      THREE.MathUtils.lerp(4.62, 3.42, progress) + Math.sin(progress * Math.PI * 2) * 0.32,
      0.742,
      THREE.MathUtils.lerp(4.0, -0.05, progress)
    );
    slab.rotation.y = (rightPathRandom() - 0.5) * 0.18;
    slab.receiveShadow = true;
    scene.add(slab);
  }

  const blossomMaterial = new THREE.MeshStandardMaterial({ color: 0xd886a9, emissive: 0x50152d, emissiveIntensity: 0.18, roughness: 0.78 });
  const nightBarkMaterial = new THREE.MeshStandardMaterial({ color: 0x241a1d, roughness: 0.78 });
  function createSakura(x, z, scale, seed) {
    const random = rng(seed);
    const group = new THREE.Group();
    const top = new THREE.Vector3((random() - 0.5) * 0.25, 2.35 * scale, 0);
    group.add(cylinderBetween(new THREE.Vector3(), top, 0.14 * scale, nightBarkMaterial, 8));
    for (let branchIndex = 0; branchIndex < 9; branchIndex += 1) {
      const angle = (branchIndex / 9) * Math.PI * 2 + random() * 0.45;
      const start = top.clone().multiplyScalar(0.56 + random() * 0.32);
      const end = start.clone().add(new THREE.Vector3(
        Math.cos(angle) * (0.65 + random() * 0.7) * scale,
        (0.35 + random() * 0.62) * scale,
        Math.sin(angle) * (0.65 + random() * 0.7) * scale
      ));
      group.add(cylinderBetween(start, end, 0.055 * scale, nightBarkMaterial, 6));
      for (let flowerIndex = 0; flowerIndex < 6; flowerIndex += 1) {
        const cluster = new THREE.Mesh(leafGeometry, blossomMaterial);
        cluster.position.copy(end).add(new THREE.Vector3(
          (random() - 0.5) * 0.9 * scale,
          (random() - 0.5) * 0.62 * scale,
          (random() - 0.5) * 0.9 * scale
        ));
        cluster.scale.setScalar((0.2 + random() * 0.22) * scale);
        group.add(cluster);
      }
    }
    group.position.set(x, 0.72, z);
    scene.add(group);
  }
  [
    [6.35, -2.8, 0.8], [6.55, 1.1, 0.72], [1.2, -4.3, 0.7], [2.0, 3.9, 0.68], [5.7, 3.45, 0.64],
  ].slice(0, qualityLow ? 3 : 5).forEach((position, index) => createSakura(...position, 503 + index * 31));

  const facadeMaterials = [facadeA, facadeB].filter(Boolean).map((map) => new THREE.MeshStandardMaterial({
    map,
    emissiveMap: map,
    emissive: 0xffffff,
    emissiveIntensity: 0.55,
    roughness: 0.42,
    metalness: 0.28,
  }));
  const towerRandom = rng(77);
  for (let index = 0; index < (qualityLow ? 7 : 13); index += 1) {
    const width = 0.55 + towerRandom() * 0.75;
    const height = 2.3 + towerRandom() * 3.8;
    const depth = 0.55 + towerRandom() * 0.7;
    const material = facadeMaterials[index % facadeMaterials.length]
      || new THREE.MeshStandardMaterial({ color: 0x1e222a, roughness: 0.45, metalness: 0.35 });
    const towerMesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 2, 0.045), material);
    const x = 4.8 + towerRandom() * 2.45;
    const z = -4.2 + towerRandom() * 2.2;
    towerMesh.position.set(x, 0.7 + height / 2, z);
    towerMesh.rotation.y = (towerRandom() - 0.5) * 0.35;
    towerMesh.castShadow = !qualityLow;
    scene.add(towerMesh);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.65 + towerRandom(), 5), new THREE.MeshStandardMaterial({ color: 0x292c33, metalness: 0.8, roughness: 0.2 }));
    antenna.position.set(x, 0.7 + height + antenna.geometry.parameters.height / 2, z);
    scene.add(antenna);
  }

  const puddleMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x13232e,
    roughness: 0.08,
    metalness: 0.08,
    transmission: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    transparent: true,
    opacity: 0.82,
  });
  const puddleRandom = rng(882);
  for (let index = 0; index < 14; index += 1) {
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.35 + puddleRandom() * 0.65, 32), puddleMaterial);
    puddle.rotation.x = -Math.PI / 2;
    puddle.scale.y = 0.3 + puddleRandom() * 0.4;
    puddle.position.set(0.8 + puddleRandom() * 6.5, 0.704, -4.6 + puddleRandom() * 8.9);
    if (ellipseContains(puddle.position.x, puddle.position.z, 0.55)) scene.add(puddle);
  }

  const lanternMaterial = new THREE.MeshStandardMaterial({ color: 0x21191a, roughness: 0.5, metalness: 0.3 });
  const lanternGlowMaterial = new THREE.MeshStandardMaterial({ color: 0xffb579, emissive: 0xff4d72, emissiveIntensity: 1.9 });
  for (let index = 0; index < 9; index += 1) {
    const lantern = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.05, 7), lanternMaterial);
    pole.position.y = 0.52;
    const lamp = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.32, 0.24, 2, 0.03), lanternGlowMaterial);
    lamp.position.y = 1.06;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.18, 4), darkRoof);
    cap.rotation.y = Math.PI / 4;
    cap.position.y = 1.31;
    lantern.add(pole, lamp, cap);
    lantern.position.set(0.95 + index * 0.7, 0.72, 2.05 + Math.sin(index * 0.9) * 0.42);
    scene.add(lantern);
  }

  const cableMaterial = new THREE.MeshStandardMaterial({ color: 0x101116, roughness: 0.42, metalness: 0.45 });
  for (let index = 0; index < 7; index += 1) {
    const start = new THREE.Vector3(4.8 + index * 0.28, 3.2 + (index % 3) * 0.6, -3.4);
    const end = new THREE.Vector3(7.15, 2.8 + (index % 4) * 0.72, -0.9 + index * 0.22);
    const middle = start.clone().lerp(end, 0.5);
    middle.y -= 0.55;
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([start, middle, end]), 12, 0.018, 5), cableMaterial));
  }

  const signTextures = {
    seele: signTexture("seele", language),
    gehirn: signTexture("gehirn", language),
  };
  const portals = [];
  function createPortalSign(kind, position) {
    const group = new THREE.Group();
    const dark = kind === "seele" ? 0x231b13 : 0x15171d;
    const frame = new THREE.Mesh(
      new RoundedBoxGeometry(2.25, 1.28, 0.18, 4, 0.055),
      new THREE.MeshStandardMaterial({ color: dark, roughness: 0.58, metalness: kind === "gehirn" ? 0.45 : 0.08 })
    );
    frame.position.y = 1.42;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 1.13),
      new THREE.MeshStandardMaterial({
        map: signTextures[kind],
        emissiveMap: kind === "gehirn" ? signTextures[kind] : null,
        emissive: kind === "gehirn" ? 0xffffff : 0x000000,
        emissiveIntensity: kind === "gehirn" ? 0.65 : 0,
        roughness: kind === "seele" ? 0.88 : 0.35,
        side: THREE.DoubleSide,
      })
    );
    face.position.set(0, 1.42, 0.096);
    for (const x of [-0.84, 0.84]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, 1.75, 8), frame.material);
      post.position.set(x, 0.88, 0);
      group.add(post);
    }
    group.add(frame, face);
    group.position.copy(position);
    group.userData.baseScale = 0.9;
    group.scale.setScalar(group.userData.baseScale);
    face.userData.kind = kind;
    face.userData.group = group;
    portals.push(face);
    scene.add(group);
  }
  createPortalSign("seele", new THREE.Vector3(-4.9, 0.72, 4.25));
  createPortalSign("gehirn", new THREE.Vector3(4.65, 0.72, 4.15));

  const petalTexture = canvasParticle((context, size) => {
    context.translate(size / 2, size / 2);
    const gradient = context.createRadialGradient(-8, -10, 2, 0, 0, 35);
    gradient.addColorStop(0, "rgba(255,248,240,1)");
    gradient.addColorStop(0.45, "rgba(245,155,185,.95)");
    gradient.addColorStop(1, "rgba(220,85,135,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(0, 0, 17, 34, 0.45, 0, Math.PI * 2);
    context.fill();
  });
  const petalCount = qualityLow ? 100 : 360;
  const petalPositions = new Float32Array(petalCount * 3);
  const petalRandom = rng(117);
  for (let index = 0; index < petalCount; index += 1) {
    petalPositions[index * 3] = -7.7 + petalRandom() * 7.35;
    petalPositions[index * 3 + 1] = 0.8 + petalRandom() * 7;
    petalPositions[index * 3 + 2] = -5.2 + petalRandom() * 10.4;
  }
  const petalGeometry = new THREE.BufferGeometry();
  petalGeometry.setAttribute("position", new THREE.BufferAttribute(petalPositions, 3));
  const petalMaterial = new THREE.PointsMaterial({
    map: petalTexture,
    color: 0xffd4df,
    size: qualityLow ? 0.18 : 0.15,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    alphaTest: 0.05,
  });
  const petals = new THREE.Points(petalGeometry, petalMaterial);
  scene.add(petals);

  const rainCount = qualityLow ? 200 : 650;
  const rainPositions = new Float32Array(rainCount * 6);
  const rainRandom = rng(334);
  for (let index = 0; index < rainCount; index += 1) {
    const x = 0.25 + rainRandom() * 8;
    const y = 0.5 + rainRandom() * 9;
    const z = -5.5 + rainRandom() * 11;
    rainPositions[index * 6] = x;
    rainPositions[index * 6 + 1] = y;
    rainPositions[index * 6 + 2] = z;
    rainPositions[index * 6 + 3] = x + 0.05;
    rainPositions[index * 6 + 4] = y - 0.36;
    rainPositions[index * 6 + 5] = z;
  }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
  const rainMaterial = new THREE.LineBasicMaterial({ color: 0xa7d8ea, transparent: true, opacity: 0.0, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial);
  scene.add(rain);

  const fireflyCount = qualityLow ? 45 : 110;
  const fireflyPositions = new Float32Array(fireflyCount * 3);
  const fireflyRandom = rng(912);
  for (let index = 0; index < fireflyCount; index += 1) {
    fireflyPositions[index * 3] = -7.3 + fireflyRandom() * 7;
    fireflyPositions[index * 3 + 1] = 1 + fireflyRandom() * 3.2;
    fireflyPositions[index * 3 + 2] = -4.8 + fireflyRandom() * 9.6;
  }
  const fireflyGeometry = new THREE.BufferGeometry();
  fireflyGeometry.setAttribute("position", new THREE.BufferAttribute(fireflyPositions, 3));
  const fireflies = new THREE.Points(
    fireflyGeometry,
    new THREE.PointsMaterial({ color: 0xffdf78, size: 0.07, transparent: true, opacity: 0.8, depthWrite: false })
  );
  scene.add(fireflies);

  const starCount = qualityLow ? 120 : 480;
  const starPositions = new Float32Array(starCount * 3);
  const starRandom = rng(441);
  for (let index = 0; index < starCount; index += 1) {
    const radius = 34;
    const theta = starRandom() * Math.PI * 2;
    const phi = 0.15 + starRandom() * 1.25;
    starPositions[index * 3] = Math.cos(theta) * Math.sin(phi) * radius;
    starPositions[index * 3 + 1] = Math.cos(phi) * radius;
    starPositions[index * 3 + 2] = Math.sin(theta) * Math.sin(phi) * radius;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({ color: 0xd7e9ff, size: 0.055, transparent: true, opacity: 0.5, depthWrite: false });
  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);

  let composer = null;
  let bloom = null;
  setLoadingProgress(94);
  if (!qualityLow) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.18, 0.35, 0.9);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDown = null;
  let hovered = null;
  function setPointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    hovered = raycaster.intersectObjects(portals, false)[0]?.object || null;
    canvas.classList.toggle("is-over-portal", Boolean(hovered));
  }
  canvas.addEventListener("pointermove", setPointer);
  canvas.addEventListener("pointerleave", () => {
    hovered = null;
    canvas.classList.remove("is-over-portal");
  });
  canvas.addEventListener("pointerdown", (event) => {
    pointerDown = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 7) {
      pointerDown = null;
      return;
    }
    pointerDown = null;
    setPointer(event);
    if (!hovered) return;
    const kind = hovered.userData.kind;
    fade.classList.toggle("is-seele", kind === "seele");
    fade.classList.toggle("is-gehirn", kind === "gehirn");
    fade.classList.add("is-on");
    window.setTimeout(() => {
      location.href = isLocal
        ? (kind === "seele" ? "/__seele/" : "/__gehirn/")
        : `https://${kind}.flofischer.org/`;
    }, 680);
  });

  function refreshSignTextures() {
    for (const portal of portals) {
      const next = signTexture(portal.userData.kind, language);
      portal.material.map?.dispose();
      portal.material.map = next;
      if (portal.userData.kind === "gehirn") portal.material.emissiveMap = next;
      portal.material.needsUpdate = true;
    }
  }
  document.querySelectorAll("[data-language-button]").forEach((button) => {
    button.addEventListener("click", () => {
      language = applyLanguage(button.dataset.languageButton, true);
      refreshSignTextures();
    });
  });

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    controls.maxDistance = camera.aspect < 0.72 ? 52 : 38;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer?.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", resize);

  const clock = new THREE.Clock();
  let readyFrames = 0;
  let lastRenderedAt = 0;
  function animate(now = 0) {
    requestAnimationFrame(animate);
    if (qualityLow && now - lastRenderedAt < 1000 / 20) return;
    lastRenderedAt = now;
    const delta = Math.min(clock.getDelta(), 0.07);
    const elapsed = clock.elapsedTime;
    controls.update();
    // Keep the sky dome centered on the camera so zooming out can never expose
    // its outer edge as a dark disk on narrow mobile viewports.
    sky.position.copy(camera.position);

    const direction = camera.position.clone().sub(controls.target).normalize();
    const side = smoothstep(-0.78, 0.78, direction.x);
    document.body.style.setProperty("--diorama-side", side.toFixed(3));
    document.body.classList.toggle("side-seele", side < 0.38);
    document.body.classList.toggle("side-gehirn", side > 0.62);
    zoneLabel.textContent = side < 0.36 ? "Seele" : side > 0.64 ? "Gehirn" : "Seele · Gehirn";

    skyMaterial.uniforms.uSide.value = THREE.MathUtils.damp(skyMaterial.uniforms.uSide.value, side, 3.2, delta);
    scene.fog.color.set(0x8f7858).lerp(new THREE.Color(0x11101a), side);
    scene.fog.density = THREE.MathUtils.lerp(0.0085, 0.016, side);
    hemi.color.set(0xffe4b4).lerp(new THREE.Color(0x7894c0), side);
    hemi.groundColor.set(0x405d31).lerp(new THREE.Color(0x090a10), side);
    hemi.intensity = THREE.MathUtils.lerp(2.18, 0.86, side);
    sunrise.intensity = THREE.MathUtils.lerp(4.65, 0.62, side);
    moonlight.intensity = THREE.MathUtils.lerp(0.1, 1.2, side);
    neonPink.intensity = 6.8 * side;
    neonCyan.intensity = 5.6 * side;
    soulFill.intensity = THREE.MathUtils.lerp(10.8, 2.8, side);
    chapelGlow.intensity = THREE.MathUtils.lerp(7.6, 1.1, side);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(1.34, 0.96, side);
    if (bloom) bloom.strength = THREE.MathUtils.lerp(0.04, 0.16, side);
    mindGroundMaterial.color.set(0x4a4d59).lerp(new THREE.Color(0x282d3a), side);
    soulGroundMaterial.color.set(0x68cb4d).lerp(new THREE.Color(0x3e7436), side * 0.35);

    soulWater.material.uniforms.time.value = reducedMotion ? 0.35 : elapsed * 0.42;
    grassMaterial.userData.time.value = reducedMotion ? 0 : elapsed;

    const petalsArray = petals.geometry.attributes.position.array;
    if (!reducedMotion) {
      for (let index = 0; index < petalCount; index += 1) {
        petalsArray[index * 3 + 1] -= delta * (0.22 + (index % 9) * 0.025);
        petalsArray[index * 3] += Math.sin(elapsed * 0.55 + index) * delta * 0.12;
        petalsArray[index * 3 + 2] += Math.cos(elapsed * 0.38 + index * 0.4) * delta * 0.08;
        if (petalsArray[index * 3 + 1] < 0.72) petalsArray[index * 3 + 1] = 6.4 + (index % 13) * 0.18;
      }
      petals.geometry.attributes.position.needsUpdate = true;
    }
    petalMaterial.opacity = 0.88 * (1 - smoothstep(0.42, 0.8, side));

    const rainArray = rain.geometry.attributes.position.array;
    if (!reducedMotion && side > 0.25) {
      for (let index = 0; index < rainCount; index += 1) {
        const offset = index * 6;
        rainArray[offset + 1] -= delta * (7.5 + (index % 8));
        rainArray[offset + 4] = rainArray[offset + 1] - 0.36;
        rainArray[offset] += delta * 0.62;
        rainArray[offset + 3] = rainArray[offset] + 0.05;
        if (rainArray[offset + 1] < 0.62) {
          rainArray[offset] = 0.25 + Math.random() * 8;
          rainArray[offset + 1] = 7 + Math.random() * 3;
          rainArray[offset + 2] = -5.4 + Math.random() * 10.8;
          rainArray[offset + 3] = rainArray[offset] + 0.05;
          rainArray[offset + 4] = rainArray[offset + 1] - 0.36;
          rainArray[offset + 5] = rainArray[offset + 2];
        }
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }
    rainMaterial.opacity = 0.3 * smoothstep(0.38, 0.78, side);
    starMaterial.opacity = 0.72 * smoothstep(0.32, 0.86, side);
    fireflies.material.opacity = 0.78 * (1 - smoothstep(0.4, 0.82, side));
    fireflies.rotation.y = elapsed * 0.015;

    for (const portal of portals) {
      const group = portal.userData.group;
      group.lookAt(camera.position.x, group.position.y + 1.2, camera.position.z);
      const target = group.userData.baseScale * (portal === hovered ? 1.06 : 1);
      const scale = THREE.MathUtils.damp(group.scale.x, target, 8, delta);
      group.scale.setScalar(scale);
    }

    if (composer) composer.render();
    else renderer.render(scene, camera);

    readyFrames += 1;
    if (readyFrames === 1) {
      setLoadingProgress(97);
      loaderOverlay?.classList.add("has-preview");
    } else if (readyFrames === 2) {
      setLoadingProgress(99);
    } else if (readyFrames === 3) {
      setLoadingProgress(100);
      const minimumVisibleMs = new URLSearchParams(location.search).get("loader") === "preview" ? 8000 : 1100;
      const remaining = Math.max(0, minimumVisibleMs - (performance.now() - loaderStartedAt));
      window.setTimeout(() => {
        loaderOverlay?.classList.add("is-off");
        loaderOverlay?.setAttribute("aria-hidden", "true");
      }, remaining);
    }
  }
  requestAnimationFrame(animate);
}

start().catch((error) => {
  console.error(error);
  setLoadingProgress(100);
  loaderOverlay?.classList.add("is-off");
  loaderOverlay?.setAttribute("aria-hidden", "true");
});
