import * as THREE from "three";
import { ARTIFACTS, type Artifact, type ArtifactId, type SkyView } from "./artifacts";
import { buildConstellation } from "./constellation-world";

export type SkyHud = {
  pick: Artifact | null;
  toast: string | null;
  view: SkyView;
};

export type SkyHandle = {
  dispose: () => void;
  enter: () => ArtifactId | null;
  setView: (v: SkyView) => void;
  select: (id: ArtifactId) => void;
};

function artifactById(id: ArtifactId | null): Artifact | null {
  if (!id) return null;
  return ARTIFACTS.find((a) => a.id === id) ?? null;
}

export function startSky(
  canvas: HTMLCanvasElement,
  onHud: (h: SkyHud) => void,
  _onEnter: (id: ArtifactId) => void,
): SkyHandle {
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
  renderer.setClearColor(0x070918, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x070918, 0.012);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.4, 400);

  const world = buildConstellation();
  scene.add(world.group);
  world.setView("constellation");
  world.select("core-heart");

  let view: SkyView = "constellation";
  let yaw = 0.55;
  let dist = 34;
  let elev = 0.52;
  let lookY = 1.2;
  let fogD = 0.003;
  let pickId: ArtifactId = "core-heart";
  let toast: string | null = "Swipe the sky. Tap a star.";
  let toastAt = performance.now();
  let last = performance.now();
  let running = true;
  let lastHud = 0;

  const pointers = new Map<number, { x: number; y: number }>();
  let dragLastX = 0;
  let dragLastY = 0;
  let dragging = false;
  let moved = 0;
  let pinch0 = 0;
  let dist0 = dist;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function distMin() {
    return view === "relic" ? 8 : 16;
  }
  function distMax() {
    return view === "relic" ? 22 : 58;
  }

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
    onHud({ pick: artifactById(pickId), toast, view });
  }

  function placeCam() {
    const horiz = dist * Math.cos(elev);
    camera.position.set(Math.sin(yaw) * horiz, dist * Math.sin(elev) + 0.4, Math.cos(yaw) * horiz);
    camera.lookAt(0, lookY, 0);
  }

  function hitArtifact(cx: number, cy: number): ArtifactId | null {
    const r = canvas.getBoundingClientRect();
    if (r.width < 2) return null;
    ndc.x = ((cx - r.left) / r.width) * 2 - 1;
    ndc.y = -((cy - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(world.group, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        const id = o.userData.artifactId as ArtifactId | undefined;
        if (id) return id;
        o = o.parent;
      }
    }
    return null;
  }

  function pinchSep() {
    const pts = Array.from(pointers.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  function onPointerDown(e: PointerEvent) {
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
      dragging = true;
      moved = 0;
    } else {
      dragging = false;
      pinch0 = pinchSep();
      dist0 = dist;
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      const s = pinchSep();
      if (pinch0 > 10 && s > 10) dist = THREE.MathUtils.clamp(dist0 * (pinch0 / s), distMin(), distMax());
      return;
    }
    if (dragging) {
      const dx = e.clientX - dragLastX;
      const dy = e.clientY - dragLastY;
      moved += Math.abs(dx) + Math.abs(dy);
      yaw -= dx * 0.005;
      if (view === "constellation") {
        dist = THREE.MathUtils.clamp(dist + dy * 0.04, distMin(), distMax());
      } else {
        elev = THREE.MathUtils.clamp(elev + dy * 0.0022, 0.12, 0.72);
      }
      dragLastX = e.clientX;
      dragLastY = e.clientY;
    }
  }

  function onPointerUp(e: PointerEvent) {
    const wasTap = dragging && moved < 14 && pointers.size <= 1;
    const x = e.clientX;
    const y = e.clientY;
    pointers.delete(e.pointerId);
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* samsung */
    }
    if (pointers.size === 0) dragging = false;
    else if (pointers.size === 1) {
      const p = Array.from(pointers.values())[0];
      dragLastX = p.x;
      dragLastY = p.y;
      dragging = true;
    }
    if (!wasTap) return;
    const id = hitArtifact(x, y);
    if (!id) return;
    pickId = id;
    world.select(id);
    const art = artifactById(id);
    toast = art?.open ? `${art.name} — open.` : art ? `${art.name} — sealed.` : null;
    toastAt = performance.now();
    emit();
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    dist = THREE.MathUtils.clamp(dist * (1 + e.deltaY * 0.0016), distMin(), distMax());
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  function applyView(v: SkyView) {
    view = v;
    world.setView(v);
    dist = THREE.MathUtils.clamp(dist, distMin(), distMax());
    toast = v === "relic" ? "Turn the relic. Pick another below." : "Swipe the sky. Tap a star.";
    toastAt = performance.now();
    emit();
  }

  function loop(now: number) {
    if (!running) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const ease = 1 - Math.exp(-dt * 4.2);
    const wantDist = view === "relic" ? 20 : 34;
    const wantElev = view === "relic" ? 0.42 : 0.52;
    const wantLook = view === "relic" ? 1.9 : 1.2;
    const wantFog = view === "relic" ? 0.018 : 0.003;
    if (!dragging && pointers.size === 0) {
      dist += (wantDist - dist) * ease * 0.35;
      elev += (wantElev - elev) * ease;
    }
    lookY += (wantLook - lookY) * ease;
    fogD += (wantFog - fogD) * ease;
    (scene.fog as THREE.FogExp2).density = fogD;
    if (!dragging && pointers.size === 0) yaw += (view === "constellation" ? 0.1 : 0.06) * dt;
    if (toast && now - toastAt > 3800) toast = null;
    world.tick(now / 1000, dt);
    placeCam();
    renderer.render(scene, camera);
    if (now - lastHud > 80) {
      lastHud = now;
      emit();
    }
    requestAnimationFrame(loop);
  }
  emit();
  requestAnimationFrame(loop);

  return {
    dispose() {
      running = false;
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      world.dispose();
      renderer.dispose();
    },
    enter() {
      const a = artifactById(pickId);
      return a?.open ? a.id : null;
    },
    setView(v) {
      applyView(v);
    },
    select(id) {
      pickId = id;
      world.select(id);
      const art = artifactById(id);
      toast = art?.open ? `${art.name} — open.` : art ? `${art.name} — sealed.` : null;
      toastAt = performance.now();
      emit();
    },
  };
}
