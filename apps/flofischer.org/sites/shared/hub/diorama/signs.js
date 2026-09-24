import * as THREE from "three";
import { rng, taperedTube } from "./utils.js";
import { GEHIRN_SIGN, SEELE_SIGN, terrainHeight } from "./layout.js";

export function signTexture(kind, language, anisotropy = 8) {
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
  texture.anisotropy = anisotropy;
  return texture;
}

function roundedRectPath(width, height, radius, z) {
  const points = [];
  const corners = [
    [width / 2 - radius, height / 2 - radius, 0],
    [-width / 2 + radius, height / 2 - radius, Math.PI / 2],
    [-width / 2 + radius, -height / 2 + radius, Math.PI],
    [width / 2 - radius, -height / 2 + radius, Math.PI * 1.5],
  ];
  for (const [cx, cy, start] of corners) {
    for (let step = 0; step <= 4; step += 1) {
      const angle = start + (step / 4) * (Math.PI / 2);
      points.push(new THREE.Vector3(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, z));
    }
  }
  points.push(points[0].clone());
  return points;
}

export function buildSigns(world, language) {
  const { materials } = world;
  const portals = [];
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3b24, map: world.textures.woodGrain, roughness: 0.78 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x3a2618, map: world.textures.woodGrain, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.35, metalness: 0.7 });
  const shingles = new THREE.MeshStandardMaterial({ color: 0xd9a898, map: world.textures.chapelRoofTiles, roughness: 0.82 });
  const footing = new THREE.MeshStandardMaterial({ color: 0x8a8278, roughness: 0.9 });

  function portal(kind, [x, z]) {
    const group = new THREE.Group();
    const seele = kind === "seele";
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(2.08, 1.12),
      new THREE.MeshStandardMaterial({
        map: signTexture(kind, language, world.quality.low ? 4 : 8),
        emissive: seele ? 0x000000 : 0xffffff,
        emissiveIntensity: seele ? 0 : 0.7,
        roughness: seele ? 0.86 : 0.32,
        side: THREE.DoubleSide,
      }),
    );
    if (!seele) face.material.emissiveMap = face.material.map;
    face.position.set(0, 1.42, 0.05);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.26, 1.3, 0.08), seele ? darkWood : steel);
    frame.position.y = 1.42;
    group.add(frame, face);
    if (seele) {
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.25, 0.1), wood);
        post.position.set(side * 1.02, 1.1, -0.02);
        group.add(post);
        const slab = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.05, 0.36), shingles);
        slab.position.set(side * 0.6, 2.32, 0);
        slab.rotation.z = -side * 0.42;
        group.add(slab);
      }
      const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), darkWood);
      ridge.rotation.x = Math.PI / 2;
      ridge.position.y = 2.6;
      group.add(ridge);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.1), wood);
      beam.position.y = 2.12;
      group.add(beam);
    } else {
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.1, 0.12), steel);
        post.position.set(side * 0.86, 1.02, -0.05);
        group.add(post);
      }
      const pink = taperedTube(roundedRectPath(2.3, 1.34, 0.12, 0.07).slice(0, 11), 0.018, 0.018, { radial: 6, segments: 40 });
      const cyan = taperedTube(roundedRectPath(2.3, 1.34, 0.12, 0.07).slice(10), 0.018, 0.018, { radial: 6, segments: 40 });
      const pinkTube = new THREE.Mesh(pink, materials.neonPink);
      const cyanTube = new THREE.Mesh(cyan, materials.neonCyan);
      pinkTube.position.y = cyanTube.position.y = 1.42;
      group.add(pinkTube, cyanTube);
    }
    for (const side of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.12, 8), seele ? footing : steel);
      foot.position.set(side * (seele ? 1.02 : 0.86), 0.04, 0);
      group.add(foot);
    }
    group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = !world.quality.low;
        child.receiveShadow = true;
      }
    });
    group.position.set(x, terrainHeight(x, z) - 0.02, z);
    if (!seele) world.addLightPool(x, terrainHeight(x, z), z + 0.2, 1.1, new THREE.Color(0.42, 0.12, 0.3));
    group.userData.baseScale = 0.86;
    group.scale.setScalar(group.userData.baseScale);
    face.userData.kind = kind;
    face.userData.group = group;
    portals.push(face);
    world.scene.add(group);
  }
  portal("seele", SEELE_SIGN);
  portal("gehirn", GEHIRN_SIGN);
  return portals;
}
