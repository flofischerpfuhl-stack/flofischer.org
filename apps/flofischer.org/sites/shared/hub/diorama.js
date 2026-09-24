import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { Batch, smoothstep } from "./diorama/utils.js";
import { createProceduralTextures } from "./diorama/textures.js";
import { createSharedMaterials } from "./diorama/materials.js";
import { buildIsland } from "./diorama/island.js";
import { buildSeele, loadDetailedPlants } from "./diorama/seele.js";
import { buildGehirn } from "./diorama/gehirn.js";
import { SUN_DIRECTION, buildAtmosphere } from "./diorama/atmosphere.js";
import { buildSigns, signTexture } from "./diorama/signs.js";
import { CHAPEL, POND, TOP, WATER_Y } from "./diorama/layout.js";

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
    window.FFLanguage?.set(language);
  }
  return language;
}

function rewriteLocalLinks() {
  if (!isLocal) return;
  document.querySelectorAll("[data-local]").forEach((link) => {
    link.href = link.dataset.local;
  });
}

function configureTexture(texture, { repeat = 1, srgb = true } = {}) {
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    const [repeatX, repeatY] = Array.isArray(repeat) ? repeat : [repeat, repeat];
    texture.repeat.set(repeatX, repeatY);
  }
  texture.anisotropy = qualityLow ? 4 : 8;
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

function loadOptimizedTexture(ktx2Loader, textureLoader, name, fallbackExtension, options = {}) {
  if (options.ktx2 === false) return loadTexture(textureLoader, `/shared/hub/textures/${name}.${fallbackExtension}`, options);
  return new Promise((resolve) => {
    ktx2Loader.load(
      `/shared/hub/textures/${name}.ktx2`,
      (texture) => resolve(configureTexture(texture, options)),
      undefined,
      () => loadTexture(textureLoader, `/shared/hub/textures/${name}.${fallbackExtension}`, options).then(resolve)
    );
  });
}

async function start() {
  setLoadingProgress(4);
  rewriteLocalLinks();
  let language = window.FFLanguage?.get() || document.documentElement.dataset.language || "en";
  language = applyLanguage(language);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: qualityLow,
    alpha: false,
    powerPreference: "high-performance",
  });
  const maxPixelRatio = Math.min(window.devicePixelRatio || 1, qualityLow ? 1.25 : 1.65);
  let pixelRatio = qualityLow ? Math.min(window.devicePixelRatio || 1, 1) : maxPixelRatio;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.debug.checkShaderErrors = isLocal;
  renderer.shadowMap.enabled = !qualityLow;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  setLoadingProgress(10);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x171317);
  scene.fog = new THREE.FogExp2(0x171317, 0.012);

  const initialAspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.PerspectiveCamera(39, initialAspect, 0.1, 120);
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
  const ktx2Loader = new KTX2Loader()
    .setTranscoderPath("https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/libs/basis/")
    .setWorkerLimit(qualityLow ? 2 : 4)
    .detectSupport(renderer);
  let loadedTextures = 0;
  const textureCount = 12;
  const trackedTexture = (name, extension, options) => loadOptimizedTexture(ktx2Loader, textureLoader, name, extension, options).finally(() => {
    loadedTextures += 1;
    setLoadingProgress(10 + (loadedTextures / textureCount) * 50);
  });
  const [
    meadow, forestNormal, rock, rockNormal,
    cobble, bark, facadeA, facadeB, waterNormals, tropicalLeaf,
    chapelFieldstone, chapelRoofTiles,
  ] = await Promise.all([
    trackedTexture("meadow", "jpg", { repeat: 1.7 }),
    trackedTexture("forest-floor-normal", "jpg", { repeat: 1.7, srgb: false }),
    trackedTexture("mossy-rock", "jpg"),
    trackedTexture("mossy-rock-normal", "jpg", { srgb: false }),
    trackedTexture("cobble", "jpg"),
    trackedTexture("bark", "jpg"),
    trackedTexture("facade-a", "jpg"),
    trackedTexture("facade-b", "jpg"),
    trackedTexture("waternormals", "jpg", { srgb: false }),
    trackedTexture("tropical-leaf", "webp", { repeat: 0, ktx2: false }),
    trackedTexture("chapel-fieldstone-v1", "webp"),
    trackedTexture("chapel-roof-biberschwanz-v1", "webp"),
  ]);
  ktx2Loader.dispose();
  setLoadingProgress(62);

  // Everything procedural shares this small "world" context.
  const batches = new Map();
  const world = {
    scene,
    renderer,
    quality: { low: qualityLow },
    textures: {
      meadow, forestNormal, rock, rockNormal, cobble, bark, facadeA, facadeB,
      waterNormals, tropicalLeaf, chapelFieldstone, chapelRoofTiles,
    },
    uniforms: {
      time: { value: 0 },
      side: { value: 0.5 },
      rain: { value: 0 },
      wind: { value: reducedMotion ? 0 : 0.75 },
      grassGlow: { value: 0.16 },
      pixelRatio: { value: pixelRatio },
    },
    materials: {},
    updates: [],
    mist: [],
    steam: [],
    /** Additive light pool on the ground: a cheap stand-in for a point light. */
    addLightPool(x, y, z, radius, color) {
      const pool = new THREE.PlaneGeometry(radius * 2, radius * 2);
      pool.rotateX(-Math.PI / 2);
      world.batch("lightPools").add(pool, new THREE.Matrix4().makeTranslation(x, y + 0.014, z), color);
    },
    batch(name, material = null, options = {}) {
      if (!batches.has(name)) batches.set(name, { batch: new Batch(name), material, options });
      const entry = batches.get(name);
      if (material && !entry.material) entry.material = material;
      if (options && Object.keys(options).length) entry.options = options;
      return entry.batch;
    },
  };
  createProceduralTextures(world.textures);
  createSharedMaterials(world);

  // Lights: warm sunrise over Seele, moonlight and neon over Gehirn.
  const hemi = new THREE.HemisphereLight(0xffe2b8, 0x4b5a32, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc27a, 4.2);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(22);
  sun.castShadow = !qualityLow;
  if (sun.castShadow) {
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 4;
    sun.shadow.camera.far = 44;
    sun.shadow.camera.left = -10.5;
    sun.shadow.camera.right = 10.5;
    sun.shadow.camera.top = 9;
    sun.shadow.camera.bottom = -9;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
  }
  scene.add(sun);
  // Moonlight reuses the key light (same direction keeps the static shadow
  // map valid); a hemisphere ground colour replaces a separate bounce light.
  const sunColor = new THREE.Color(0xffc27a);
  const moonColor = new THREE.Color(0x9cc2ff);
  // Both neon lights sit on visible emitters (billboard, Gehirn sign) so their
  // highlights in the wet street line up with something real.
  const neonPink = new THREE.PointLight(0xff3d7f, 0, 13, 1.5);
  neonPink.position.set(5.3, TOP + 4.9, -2.45);
  scene.add(neonPink);
  const neonCyan = new THREE.PointLight(0x33d6f2, 0, 11, 1.6);
  neonCyan.position.set(3.3, TOP + 2.35, 4.4);
  scene.add(neonCyan);

  // Yield a frame between build stages so the loader keeps animating.
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  buildIsland(world);
  setLoadingProgress(70);
  await nextFrame();
  buildSeele(world);
  setLoadingProgress(78);
  await nextFrame();
  buildGehirn(world);
  setLoadingProgress(84);
  await nextFrame();
  buildAtmosphere(world);
  const portals = buildSigns(world, language);

  // Merge every batch into a single mesh per material.
  for (const [name, entry] of batches) {
    const material = entry.material || world.materials[name];
    if (!material) {
      console.warn(`diorama: batch "${name}" has no material`);
      continue;
    }
    const mesh = entry.batch.mesh(material, { castShadow: Boolean(entry.options.castShadow ?? !qualityLow), receiveShadow: true });
    if (!mesh) continue;
    entry.batch.meshObject = mesh;
    scene.add(mesh);
  }
  setLoadingProgress(88);

  // Environment probes: rendered once, reused as reflections every frame.
  const { materials } = world;
  const hidden = () => [world.water, world.clouds, world.particles.rain, world.particles.petals, world.particles.fireflies].filter(Boolean);
  function captureProbe(position, side, renderTarget) {
    const cubeCamera = new THREE.CubeCamera(0.05, 70, renderTarget);
    cubeCamera.position.copy(position);
    const previous = world.uniforms.side.value;
    applyLighting(side);
    const toHide = hidden().filter((object) => object.visible);
    toHide.forEach((object) => { object.visible = false; });
    cubeCamera.update(renderer, scene);
    toHide.forEach((object) => { object.visible = true; });
    applyLighting(previous);
    renderTarget.texture.needsPMREMUpdate = true;
  }

  // Post: HDR bloom + tone mapping. Anti-aliasing starts with cheap FXAA and is
  // upgraded to 4x MSAA only when the GPU timer proves there is headroom.
  let composer = null;
  let bloom = null;
  let fxaa = null;
  if (!qualityLow) {
    const target = new THREE.WebGLRenderTarget(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio, {
      type: THREE.HalfFloatType,
      samples: 0,
    });
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.2, 0.5, 0.86);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    fxaa = new ShaderPass(FXAAShader);
    composer.addPass(fxaa);
  }
  function updateFxaaResolution() {
    fxaa?.material.uniforms.resolution.value.set(1 / (window.innerWidth * pixelRatio), 1 / (window.innerHeight * pixelRatio));
  }
  updateFxaaResolution();
  function setMsaa(enabled) {
    if (!composer) return;
    for (const renderTarget of [composer.renderTarget1, composer.renderTarget2]) {
      renderTarget.samples = enabled ? 4 : 0;
      renderTarget.dispose();
    }
    fxaa.enabled = !enabled;
  }

  const fogDay = new THREE.Color(0xa0805e);
  const fogNight = new THREE.Color(0x120f1c);
  const hemiDay = new THREE.Color(0xffe0b0);
  const hemiNight = new THREE.Color(0x5d74a8);
  const groundDay = new THREE.Color(0x7d7458);
  const groundNight = new THREE.Color(0x1a1b2c);
  const cloudLitDay = new THREE.Color(1.0, 0.8, 0.62);
  const cloudShadeDay = new THREE.Color(0.62, 0.48, 0.5);
  const cloudLitNight = new THREE.Color(0.17, 0.14, 0.24);
  const cloudShadeNight = new THREE.Color(0.05, 0.04, 0.08);
  function applyLighting(side) {
    world.uniforms.side.value = side;
    scene.fog.color.copy(fogDay).lerp(fogNight, side);
    scene.fog.density = THREE.MathUtils.lerp(0.0075, 0.013, side);
    hemi.color.copy(hemiDay).lerp(hemiNight, side);
    hemi.groundColor.copy(groundDay).lerp(groundNight, side);
    hemi.intensity = THREE.MathUtils.lerp(1.9, 0.72, side);
    sun.color.copy(sunColor).lerp(moonColor, smoothstep(0.2, 0.8, side));
    sun.intensity = THREE.MathUtils.lerp(4.4, 1.25, side);
    neonPink.intensity = THREE.MathUtils.lerp(1.2, 9.5, side);
    neonCyan.intensity = THREE.MathUtils.lerp(0.8, 7.5, side);
    materials.lightPools.opacity = smoothstep(0.2, 0.9, side) * 0.9 + 0.1;
    renderer.toneMappingExposure = THREE.MathUtils.lerp(1.16, 1.02, side);
    if (bloom) bloom.strength = THREE.MathUtils.lerp(0.12, 0.42, side);
    world.uniforms.rain.value = smoothstep(0.35, 0.8, side);
    world.uniforms.grassGlow.value = THREE.MathUtils.lerp(0.1, 0.02, side);
    const water = world.water.material.uniforms;
    water.uLight.value = THREE.MathUtils.lerp(1, 0.35, side);
    water.uEnvIntensity.value = THREE.MathUtils.lerp(1, 0.25, side);
    water.uSunColor.value.setRGB(1, 0.78, 0.5).multiplyScalar(1 - side * 0.85);
    const clouds = world.clouds.material.uniforms;
    clouds.uLit.value.copy(cloudLitDay).lerp(cloudLitNight, side);
    clouds.uShade.value.copy(cloudShadeDay).lerp(cloudShadeNight, side);
    clouds.uSteamOpacity.value = smoothstep(0.3, 0.85, side);
    const { petals, fireflies, rain } = world.particles;
    petals.material.uniforms.uOpacity.value = 1 - smoothstep(0.4, 0.8, side);
    fireflies.material.uniforms.uOpacity.value = 0.65 + 0.35 * smoothstep(0.1, 0.5, side) - smoothstep(0.55, 0.85, side);
    rain.material.uniforms.uOpacity.value = 0.34 * smoothstep(0.38, 0.8, side);
  }
  applyLighting(0.5);

  if (renderer.shadowMap.enabled) {
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
  }
  // Reflection probes are assigned before compiling so every material is
  // compiled once, in its final variant.
  const probeSize = qualityLow ? 128 : 256;
  const pondProbe = new THREE.WebGLCubeRenderTarget(probeSize, { type: THREE.HalfFloatType });
  const streetProbe = new THREE.WebGLCubeRenderTarget(probeSize, { type: THREE.HalfFloatType });
  world.water.material.uniforms.uEnv.value = pondProbe.texture;
  for (const name of ["street", "tiles", "markings"]) materials[name].envMap = streetProbe.texture;
  for (const [name, intensity] of [["lacquer", 0.55], ["roofJP", 0.7], ["concrete", 0.35], ["facadeA", 0.5], ["facadeB", 0.5], ["cables", 0.8]]) {
    materials[name].envMap = streetProbe.texture;
    materials[name].envMapIntensity = intensity;
  }
  materials.metal.envMap = pondProbe.texture;
  materials.metal.envMapIntensity = 0.8;
  materials.copper.envMap = pondProbe.texture;
  materials.copper.envMapIntensity = 0.6;

  // Compile every shader up front, in parallel where the browser supports it,
  // instead of stalling the main thread on first use. Linear HDR variants are
  // used by the probes and the composer; tone-mapped ones only without it.
  try {
    renderer.setRenderTarget(pondProbe);
    await renderer.compileAsync(scene, camera);
    renderer.setRenderTarget(null);
    if (!composer) await renderer.compileAsync(scene, camera);
  } catch (error) {
    renderer.setRenderTarget(null);
    console.warn("diorama: async shader compilation unavailable", error);
  }
  setLoadingProgress(90);
  captureProbe(new THREE.Vector3(POND.x, WATER_Y + 0.45, POND.z), 0, pondProbe);
  captureProbe(new THREE.Vector3(3.6, TOP + 1.3, 0.8), 1, streetProbe);
  setLoadingProgress(92);

  loadDetailedPlants(world, () => {
    if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
    captureProbe(new THREE.Vector3(POND.x, WATER_Y + 0.45, POND.z), 0, pondProbe);
  });

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
      const next = signTexture(portal.userData.kind, language, qualityLow ? 4 : 8);
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

  function applyPixelRatio(next) {
    pixelRatio = next;
    world.uniforms.pixelRatio.value = next;
    renderer.setPixelRatio(next);
    composer?.setPixelRatio(next);
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer?.setSize(window.innerWidth, window.innerHeight);
    updateFxaaResolution();
  }
  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    controls.maxDistance = camera.aspect < 0.72 ? 52 : 38;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer?.setSize(window.innerWidth, window.innerHeight);
    updateFxaaResolution();
  }
  window.addEventListener("resize", resize);

  // Quality governor. With GPU timer queries we measure real GPU cost and
  // spend spare headroom on MSAA and resolution; otherwise frame pacing is used
  // and only ever lowers the resolution.
  const gl = renderer.getContext();
  const fixedQuality = isLocal && new URLSearchParams(location.search).has("fixed");
  const timer = fixedQuality ? null : gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const minPixelRatio = qualityLow ? 0.7 : 0.8;
  const governor = { samples: [], pending: [], active: null, frame: 0, msaa: false, msaaRejected: false, paced: { frames: 0, time: 0 } };
  function beginGpuTimer() {
    governor.frame += 1;
    if (!timer || governor.pending.length >= 6 || governor.frame % 2) return;
    governor.active = gl.createQuery();
    gl.beginQuery(timer.TIME_ELAPSED_EXT, governor.active);
  }
  function endGpuTimer() {
    if (!governor.active) return;
    gl.endQuery(timer.TIME_ELAPSED_EXT);
    governor.pending.push(governor.active);
    governor.active = null;
  }
  function decide(gpuMs) {
    const budget = qualityLow ? 26 : 12.5;
    if (gpuMs > budget) {
      if (governor.msaa) {
        governor.msaa = false;
        governor.msaaRejected = true;
        setMsaa(false);
      } else if (pixelRatio > minPixelRatio + 0.01) {
        applyPixelRatio(Math.max(minPixelRatio, pixelRatio * 0.86));
      } else if (bloom?.enabled && gpuMs > budget * 1.25) bloom.enabled = false;
    } else if (gpuMs < budget * 0.5 && pixelRatio < maxPixelRatio - 0.01) {
      applyPixelRatio(Math.min(maxPixelRatio, pixelRatio * 1.12));
    } else if (gpuMs < budget * 0.56 && composer && !governor.msaa && !governor.msaaRejected) {
      governor.msaa = true;
      setMsaa(true);
    }
  }
  function pollGpuTimer() {
    if (!timer) return;
    const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT);
    while (governor.pending.length) {
      const query = governor.pending[0];
      if (!disjoint && !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
      if (!disjoint) governor.samples.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(query);
      governor.pending.shift();
    }
    if (governor.samples.length >= 16) {
      const sorted = governor.samples.sort((a, b) => a - b);
      governor.samples = [];
      governor.gpuMs = sorted[Math.floor(sorted.length * 0.6)];
      decide(governor.gpuMs);
    }
  }
  function pacedResolution(deltaMs) {
    if (timer || fixedQuality || deltaMs > 250) return;
    const paced = governor.paced;
    paced.frames += 1;
    paced.time += deltaMs;
    if (paced.frames < 75) return;
    const average = paced.time / paced.frames;
    paced.frames = 0;
    paced.time = 0;
    const target = qualityLow ? 1000 / 30 : 1000 / 60;
    if (average > target * 1.28 && pixelRatio > minPixelRatio + 0.01) applyPixelRatio(Math.max(minPixelRatio, pixelRatio * 0.86));
  }

  const clock = new THREE.Clock();
  const cameraDirection = new THREE.Vector3();
  let readyFrames = 0;
  let lastRenderedAt = 0;
  let lastSideValue = "";
  let activeZone = "";
  let side = 0.5;
  function animate(now = 0) {
    if (document.hidden) {
      clock.getDelta();
      return;
    }
    if (qualityLow && now - lastRenderedAt < 1000 / 30) return;
    const frameMs = now - lastRenderedAt;
    lastRenderedAt = now;
    const delta = Math.min(clock.getDelta(), 0.07);
    const elapsed = clock.elapsedTime;
    controls.update();
    // Keep the sky dome centered on the camera so zooming out can never expose
    // its outer edge as a dark disk on narrow mobile viewports.
    world.sky.position.copy(camera.position);

    cameraDirection.copy(camera.position).sub(controls.target).normalize();
    const targetSide = smoothstep(-0.78, 0.78, cameraDirection.x);
    side = THREE.MathUtils.damp(side, targetSide, 3.2, delta);
    const sideValue = targetSide.toFixed(3);
    if (sideValue !== lastSideValue) {
      document.body.style.setProperty("--diorama-side", sideValue);
      lastSideValue = sideValue;
    }
    const nextZone = targetSide < 0.36 ? "seele" : targetSide > 0.64 ? "gehirn" : "bridge";
    if (nextZone !== activeZone) {
      activeZone = nextZone;
      document.body.classList.toggle("side-seele", nextZone === "seele");
      document.body.classList.toggle("side-gehirn", nextZone === "gehirn");
      zoneLabel.textContent = nextZone === "seele" ? "Seele" : nextZone === "gehirn" ? "Gehirn" : "Seele · Gehirn";
    }

    applyLighting(side);
    world.uniforms.time.value = reducedMotion ? 0 : elapsed;
    for (const update of world.updates) update(reducedMotion ? 0 : elapsed, delta, side);

    for (const portal of portals) {
      const group = portal.userData.group;
      group.lookAt(camera.position.x, group.position.y + 1.2, camera.position.z);
      const target = group.userData.baseScale * (portal === hovered ? 1.06 : 1);
      group.scale.setScalar(THREE.MathUtils.damp(group.scale.x, target, 8, delta));
    }

    renderer.info.reset();
    pollGpuTimer();
    if (readyFrames > 30) beginGpuTimer();
    if (composer) composer.render();
    else renderer.render(scene, camera);
    endGpuTimer();
    if (readyFrames > 30) pacedResolution(frameMs);

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
  renderer.setAnimationLoop(animate);
  if (isLocal) {
    window.__diorama = {
      THREE, scene, camera, controls, renderer, world, composer, bloom, governor, setMsaa, applyPixelRatio, applyLighting, CHAPEL,
      get pixelRatio() { return pixelRatio; },
      renderOnce: () => (composer ? composer.render() : renderer.render(scene, camera)),
    };
  }
}

start().catch((error) => {
  console.error(error);
  setLoadingProgress(100);
  loaderOverlay?.classList.add("is-off");
  loaderOverlay?.setAttribute("aria-hidden", "true");
});
