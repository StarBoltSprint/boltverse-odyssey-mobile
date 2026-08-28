import * as THREE from "three";
import { createInput, type InputHandle } from "./input";
import { createAudio, type AudioBus } from "./audio";
import { buildRaising } from "./raising-world";

export type RaisingHud = {
  mode: "title" | "play" | "pause";
  toast: string | null;
  lookX: number;
  lookZ: number;
};

export type RaisingHandle = {
  dispose: () => void;
  land: () => void;
  setMode: (m: RaisingHud["mode"]) => void;
  input: InputHandle;
  audio: AudioBus;
};

const LOOK_R = 36;
const DIST_MIN = 18;
const DIST_MAX = 56;

export function startRaising(
  canvas: HTMLCanvasElement,
  onHud: (h: RaisingHud) => void,
): RaisingHandle {
  const mobile =
    typeof window !== "undefined" &&
    ((navigator.maxTouchPoints || 0) > 0 ||
      window.matchMedia("(pointer: coarse)").matches ||
      window.innerWidth < 900);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !mobile,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.setClearColor(0x5aa4dc, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x8ec4e0, 48, 150);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.4, 700);

  const world = buildRaising();
  scene.add(world.group);

  const input = createInput(canvas);
  const audio = createAudio();

  const player = { x: 8.6, z: 7.4, yaw: 0.7 };
  let lookX = 0;
  let lookZ = 0;
  let camYaw = Math.PI / 4;
  let camDist = 40;
  const CAM_ELEV = 0.98;
  let mode: RaisingHud["mode"] = "title";
  let toast: string | null = null;
  let toastAt = 0;
  let last = performance.now();
  let running = true;
  let lastHud = 0;
  let panVX = 0;
  let panVZ = 0;

  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x6ec8dc });
  const headMat = new THREE.MeshLambertMaterial({ color: 0xd4b46a, emissive: 0x8a6018, emissiveIntensity: 0.25 });
  const avatar = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 0.52, 4, 8), bodyMat);
  torso.position.y = 0.78;
  torso.castShadow = true;
  avatar.add(torso);
  const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), headMat);
  head.position.y = 1.55;
  head.scale.set(0.92, 0.92, 0.92);
  avatar.add(head);
  avatar.position.set(player.x, 1.12, player.z);
  avatar.rotation.y = player.yaw;
  scene.add(avatar);

  const pointers = new Map<number, { x: number; y: number }>();
  let dragLastX = 0;
  let dragLastY = 0;
  let dragging = false;
  let pinch0 = 0;
  let dist0 = camDist;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (w < 2 || h < 2) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  function emit() {
    onHud({
      mode,
      toast,
      lookX,
      lookZ,
    });
  }

  function clampLook() {
    const r = Math.hypot(lookX, lookZ);
    if (r > LOOK_R) {
      const s = LOOK_R / r;
      lookX *= s;
      lookZ *= s;
    }
  }

  function placeIsoCam(yaw: number, dist: number, lx: number, lz: number) {
    const elev = CAM_ELEV;
    const lookY = 3.4;
    const horiz = dist * Math.cos(elev);
    camera.position.set(lx + Math.sin(yaw) * horiz, lookY + dist * Math.sin(elev), lz + Math.cos(yaw) * horiz);
    camera.lookAt(lx, lookY, lz);
  }

  function panBy(dx: number, dy: number) {
    const k = camDist * 0.0017;
    const rx = Math.cos(camYaw);
    const rz = -Math.sin(camYaw);
    const tx = Math.sin(camYaw);
    const tz = Math.cos(camYaw);
    const mx = rx * dx * k + tx * dy * k;
    const mz = rz * dx * k + tz * dy * k;
    lookX += mx;
    lookZ += mz;
    panVX = mx;
    panVZ = mz;
    clampLook();
  }

  function pinchSep() {
    const pts = Array.from(pointers.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  function onPointerDown(e: PointerEvent) {
    if (mode !== "play") return;
    e.preventDefault();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* samsung */
    }
    if (pointers.size === 1) {
      dragLastX = e.clientX;
      dragLastY = e.clientY;
      panVX = 0;
      panVZ = 0;
      dragging = true;
      try {
        audio.unlock();
      } catch {
        /* samsung */
      }
    } else {
      dragging = false;
      pinch0 = pinchSep();
      dist0 = camDist;
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (mode !== "play") return;
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      const s = pinchSep();
      if (pinch0 > 10 && s > 10) {
        camDist = THREE.MathUtils.clamp(dist0 * (pinch0 / s), DIST_MIN, DIST_MAX);
      }
      return;
    }
    if (dragging) {
      panBy(e.clientX - dragLastX, e.clientY - dragLastY);
      dragLastX = e.clientX;
      dragLastY = e.clientY;
    }
  }

  function onPointerUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* samsung */
    }
    if (pointers.size === 1) {
      const p = Array.from(pointers.values())[0];
      dragLastX = p.x;
      dragLastY = p.y;
      dragging = true;
      pinch0 = 0;
    } else if (pointers.size === 0) {
      dragging = false;
    } else {
      pinch0 = pinchSep();
      dist0 = camDist;
    }
  }

  function onWheel(e: WheelEvent) {
    if (mode !== "play") return;
    e.preventDefault();
    const next = camDist * (1 + e.deltaY * 0.0016);
    camDist = THREE.MathUtils.clamp(next, DIST_MIN, DIST_MAX);
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  function land() {
    if (mode === "play") return;
    mode = "play";
    camDist = 36;
    camYaw = Math.PI / 4;
    lookX = 0;
    lookZ = 0;
    try {
      audio.unlock();
      audio.land();
    } catch {
      /* gesture */
    }
    emit();
  }

  function loop(now: number) {
    if (!running) return;
    const raw = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    input.beginFrame();
    if (input.justPressed.pause && mode === "play") mode = "pause";
    else if (input.justPressed.pause && mode === "pause") mode = "play";

    const dt = mode === "play" ? raw : raw * 0.15;

    if (mode === "title") {
      camYaw += raw * 0.16;
      placeIsoCam(camYaw, 42, 0, 0);
      world.tick(now / 1000, raw, 0, 0);
      renderer.render(scene, camera);
      if (now - lastHud > 120) {
        lastHud = now;
        emit();
      }
      requestAnimationFrame(loop);
      return;
    }

    const act = input.actions;
    if (!dragging && pointers.size < 2) {
      const k = camDist * 9 * dt;
      const rx = Math.cos(camYaw);
      const rz = -Math.sin(camYaw);
      const tx = Math.sin(camYaw);
      const tz = Math.cos(camYaw);
      lookX += rx * act.moveX * k + tx * -act.moveY * k;
      lookZ += rz * act.moveX * k + tz * -act.moveY * k;
      if (Math.abs(act.lookY) > 0.08) {
        camDist = THREE.MathUtils.clamp(camDist - act.lookY * 22 * dt, DIST_MIN, DIST_MAX);
      }
      lookX += panVX;
      lookZ += panVZ;
      panVX *= Math.exp(-8 * dt);
      panVZ *= Math.exp(-8 * dt);
      clampLook();
    }

    if (toast && now - toastAt > 3800) toast = null;

    head.rotation.y = now / 900;
    placeIsoCam(camYaw, camDist, lookX, lookZ);
    world.tick(now / 1000, dt, 0, 0);

    renderer.render(scene, camera);
    if (now - lastHud > 80) {
      lastHud = now;
      emit();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  const probe = {
    getYaw: () => camYaw,
    getSpeed: () => Math.hypot(panVX, panVZ) * 60,
    getCam: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z, fov: camera.fov, dist: camDist }),
    setKeys: (codes: string[]) => {
      input.keys.clear();
      for (const c of codes) input.keys.add(c);
    },
  };
  (window as unknown as { __controlsTest?: typeof probe }).__controlsTest = probe;

  emit();

  return {
    dispose() {
      running = false;
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      input.dispose();
      audio.dispose();
      world.dispose();
      renderer.dispose();
    },
    land,
    setMode(m) {
      mode = m;
      emit();
    },
    input,
    audio,
  };
}
