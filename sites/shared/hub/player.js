import * as THREE from "three";

const YAW_LIMIT = 0.68;
const PITCH_LIMIT = 0.2;

export function createLook({ camera, canvas, reducedMotion }) {
  const look = { yaw: 0, pitch: -0.035 };
  const target = { yaw: 0, pitch: -0.035 };
  const home = new THREE.Vector3(0, 2.12, 5.85);
  let dragging = false;
  let pointerId = null;
  let enabled = true;
  let lastX = 0;
  let lastY = 0;

  function apply() {
    const lean = Math.sin(look.yaw);
    camera.position.set(
      home.x - lean * 0.72,
      home.y + look.pitch * 0.65,
      home.z - Math.abs(look.yaw) * 0.28
    );
    camera.rotation.order = "YXZ";
    camera.rotation.y = look.yaw;
    camera.rotation.x = look.pitch;
  }

  function addLook(dx, dy) {
    target.yaw = THREE.MathUtils.clamp(target.yaw + dx * 0.00135, -YAW_LIMIT, YAW_LIMIT);
    target.pitch = THREE.MathUtils.clamp(target.pitch + dy * 0.001, -PITCH_LIMIT, PITCH_LIMIT);
  }

  function onPointerDown(event) {
    if (!enabled) return;
    if (event.button !== undefined && event.button !== 0) return;
    dragging = true;
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    document.body.classList.add("is-looking");
    try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
  }

  function onPointerUp(event) {
    if (pointerId !== null && event.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    document.body.classList.remove("is-looking");
  }

  function onPointerMove(event) {
    if (!enabled || !dragging) return;
    if (pointerId !== null && event.pointerId !== pointerId) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    addLook(dx, dy);
  }

  function onKey(event) {
    if (!enabled) return;
    const step = 0.07;
    if (event.code === "ArrowLeft" || event.code === "KeyA") target.yaw = Math.min(YAW_LIMIT, target.yaw + step);
    if (event.code === "ArrowRight" || event.code === "KeyD") target.yaw = Math.max(-YAW_LIMIT, target.yaw - step);
    if (event.code === "ArrowUp" || event.code === "KeyW") target.pitch = Math.min(PITCH_LIMIT, target.pitch + step);
    if (event.code === "ArrowDown" || event.code === "KeyS") target.pitch = Math.max(-PITCH_LIMIT, target.pitch - step);
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("keydown", onKey);

  apply();

  return {
    look,
    get yaw() { return look.yaw; },
    get side() {
      return THREE.MathUtils.smoothstep(-look.yaw, -0.42, 0.42);
    },
    update(dt, elapsed) {
      look.yaw = THREE.MathUtils.damp(look.yaw, target.yaw, 6.8, dt);
      look.pitch = THREE.MathUtils.damp(look.pitch, target.pitch, 6.8, dt);
      apply();
    },
  };
}
