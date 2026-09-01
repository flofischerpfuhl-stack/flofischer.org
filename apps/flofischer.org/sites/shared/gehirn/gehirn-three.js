import * as THREE from "three";
import { AnaglyphEffect } from "three/addons/effects/AnaglyphEffect.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const stage = document.querySelector("[data-brain-stage]");
const canvas = document.querySelector("[data-brain-canvas]");

if (stage && canvas) {
  const qualityLow = window.matchMedia("(max-width: 820px), (pointer: coarse)").matches
    || (navigator.hardwareConcurrency || 8) <= 4;
  const progressOutputs = stage.querySelectorAll("[data-brain-progress]");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !qualityLow,
    alpha: true,
    powerPreference: "high-performance",
  });
  const effect = new AnaglyphEffect(renderer);
  const clock = new THREE.Clock();
  const brain = new THREE.Group();
  const specimen = new THREE.Group();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let visible = true;
  let pointerX = 0;
  let pointerY = 0;
  let pointerInside = false;
  let pointerVelocity = 0;
  let previousPointerX = null;
  let spinAngle = -0.36;
  let spinSpeed = 0.16;
  let loaded = false;
  let pointerRect = null;
  let lastRenderAt = 0;

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualityLow ? 1.15 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.86;

  camera.position.set(0, 0.02, 7.15);
  scene.add(brain);
  brain.add(specimen);

  scene.add(new THREE.HemisphereLight(0xf0eee9, 0x16161a, 1.38));

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-3.8, 5, 6.2);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xffffff, 1.65);
  rim.position.set(4.7, -1.2, -4.5);
  scene.add(rim);

  function metadata(object) {
    if (object.userData && object.userData.bx_cat != null) return object.userData;
    if (object.parent && object.parent.userData && object.parent.userData.bx_cat != null) return object.parent.userData;
    return object.userData || {};
  }

  const visibleSystems = new Set(["cortex", "cerebellum", "brainstem"]);
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/libs/draco/");
  draco.setDecoderConfig({ type: "wasm" });

  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.load(
    "/shared/gehirn/models/brain.glb?v=2",
    (gltf) => {
      specimen.add(gltf.scene);
      const bounds = new THREE.Box3();
      let meshIndex = 0;
      const materials = new Map();
      const sourceMaterials = new Set();

      gltf.scene.traverse((object) => {
        if (!object.isMesh) return;
        const data = metadata(object);
        const category = data.bx_cat || "other";
        object.visible = visibleSystems.has(category);
        if (!object.visible) return;

        const materialKey = `${category}:${(meshIndex * 17) % 9}`;
        if (!materials.has(materialKey)) {
          const shade = 0.58 + ((meshIndex * 17) % 9) * 0.009;
          materials.set(materialKey, new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.105, 0.035, shade),
            roughness: category === "cerebellum" ? 0.82 : 0.74,
            metalness: 0.05,
            emissive: new THREE.Color(0x18181b),
            emissiveIntensity: 0.12,
          }));
        }
        const originals = Array.isArray(object.material) ? object.material : [object.material];
        originals.filter(Boolean).forEach((material) => sourceMaterials.add(material));
        object.material = materials.get(materialKey);
        bounds.expandByObject(object);
        meshIndex += 1;
      });
      sourceMaterials.forEach((material) => material.dispose());

      const center = bounds.getCenter(new THREE.Vector3());
      const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius || 1;
      gltf.scene.position.sub(center);
      specimen.scale.setScalar(2.48 / radius);
      specimen.rotation.set(0.04, Math.PI, -0.025);

      loaded = true;
      progressOutputs.forEach((output) => { output.value = "100"; output.textContent = "100"; });
      stage.classList.add("brain-ready");
      draco.dispose();
    },
    (event) => {
      if (!event.total) return;
      const progress = Math.min(99, Math.round((event.loaded / event.total) * 100));
      progressOutputs.forEach((output) => { output.value = String(progress); output.textContent = String(progress); });
    },
    () => {
      stage.classList.add("brain-failed");
      draco.dispose();
    }
  );

  const orbitMaterial = new THREE.LineBasicMaterial({
    color: 0xbebcb7,
    transparent: true,
    opacity: 0.18,
  });

  [2.02, 2.34].forEach((radius, index) => {
    const points = Array.from({ length: 128 }, (_, pointIndex) => {
      const angle = (pointIndex / 128) * Math.PI * 2;
      return new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.61,
        0
      );
    });
    const orbit = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), orbitMaterial);
    orbit.rotation.set(0.18 + index * 0.27, 0.3 - index * 0.4, index * 0.33);
    brain.add(orbit);
  });

  brain.rotation.set(-0.04, -0.36, 0.01);

  function resize() {
    const rect = stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    pointerRect = stage.getBoundingClientRect();
    camera.aspect = width / height;
    camera.position.z = camera.aspect < 0.85 ? 10.1 : 7.15;
    camera.updateProjectionMatrix();
    effect.setSize(width, height);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  resize();

  const visibilityObserver = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    clock.getDelta();
  }, { threshold: 0.05 });
  visibilityObserver.observe(stage);

  stage.addEventListener("pointerenter", () => {
    pointerInside = true;
    previousPointerX = null;
    pointerRect = stage.getBoundingClientRect();
  });

  stage.addEventListener("pointermove", (event) => {
    const rect = pointerRect || stage.getBoundingClientRect();
    const nextPointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    if (previousPointerX !== null) {
      const movement = THREE.MathUtils.clamp(nextPointerX - previousPointerX, -0.22, 0.22);
      pointerVelocity = THREE.MathUtils.clamp(pointerVelocity + movement * 8.5, -2.1, 2.1);
    }
    previousPointerX = nextPointerX;
    pointerX = nextPointerX;
    pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  });

  stage.addEventListener("pointerleave", () => {
    pointerInside = false;
    previousPointerX = null;
    pointerX = 0;
    pointerY = 0;
  });

  function render(now) {
    if (!visible || document.hidden) {
      clock.getDelta();
      return;
    }
    if (qualityLow && now - lastRenderAt < 1000 / 30) return;
    lastRenderAt = now;
    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;
    if (!reducedMotion.matches) {
      const cursorDrive = pointerInside ? pointerX * 0.34 + pointerVelocity : 0;
      const targetSpeed = 0.16 + cursorDrive;
      spinSpeed = THREE.MathUtils.lerp(spinSpeed, targetSpeed, 1 - Math.exp(-delta * 4.8));
      spinAngle += spinSpeed * delta;
      pointerVelocity *= Math.exp(-delta * 7.5);
    }
    brain.rotation.y = reducedMotion.matches ? -0.36 : spinAngle;
    brain.rotation.x += (-0.04 + pointerY * 0.085 - brain.rotation.x) * (1 - Math.exp(-delta * 5));
    specimen.position.y = reducedMotion.matches ? 0 : Math.sin(elapsed * 0.68) * 0.045;
    if (loaded || !stage.classList.contains("brain-failed")) effect.render(scene, camera);
  }

  renderer.setAnimationLoop(render);
}
