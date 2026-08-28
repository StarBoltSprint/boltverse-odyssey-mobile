import * as THREE from "three";
import { ARTIFACTS, ARTIFACT_THREADS, type ArtifactId, type SkyView } from "./artifacts";

export type ConstellationWorld = {
  group: THREE.Group;
  tick: (t: number, dt: number) => void;
  setView: (v: SkyView) => void;
  select: (id: ArtifactId) => void;
  dispose: () => void;
};

function toonRamp() {
  const c = new Uint8Array([40, 36, 28, 255, 110, 96, 60, 255, 200, 180, 120, 255, 255, 248, 220, 255]);
  const tex = new THREE.DataTexture(c, 4, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const RAMP = toonRamp();

function toon(color: number, emissive = 0, emissiveIntensity = 0) {
  return new THREE.MeshToonMaterial({ color, gradientMap: RAMP, emissive, emissiveIntensity });
}

function relicCoreHeart() {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.82, 0.28, 8), toon(0x8a8498, 0x3a3448, 0.1));
  pad.position.y = 0.14;
  g.add(pad);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.58, 1.7, 6), toon(0x4ec8e8, 0x1a88b0, 0.42));
  shaft.position.y = 1.08;
  g.add(shaft);
  const heart = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.32, 0),
    new THREE.MeshPhysicalMaterial({
      color: 0x7ee8f2,
      roughness: 0.12,
      metalness: 0.08,
      transmission: 0.55,
      thickness: 0.6,
      emissive: 0x2aa0c0,
      emissiveIntensity: 0.55,
    }),
  );
  heart.position.y = 1.15;
  g.add(heart);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.62, 6), toon(0xf0c24a, 0xb07810, 0.4));
  hat.position.y = 2.12;
  g.add(hat);
  return g;
}

function relicParentSeed() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.72, 0), toon(0xf0c24a, 0xb07810, 0.55));
  core.position.y = 0.82;
  g.add(core);
  const inner = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), toon(0xffe28a, 0xf0c24a, 0.8));
  inner.position.y = 0.82;
  inner.rotation.y = Math.PI / 4;
  g.add(inner);
  for (let i = 0; i < 4; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 4), toon(0xd4b46a, 0x8a6018, 0.28));
    const a = (i / 4) * Math.PI * 2;
    spike.position.set(Math.cos(a) * 0.55, 0.82, Math.sin(a) * 0.55);
    spike.rotation.z = -Math.PI / 2;
    spike.rotation.y = -a;
    g.add(spike);
  }
  return g;
}

function relicHowlBell() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 1.05, 10), toon(0xc4844a, 0x6a3a18, 0.22));
  body.position.y = 0.72;
  g.add(body);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xd4b46a, 0x8a6018, 0.28));
  dome.position.y = 1.22;
  g.add(dome);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.07, 6, 12), toon(0xf0c24a, 0xb07810, 0.3));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.22;
  g.add(rim);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.055, 6, 10), toon(0xf0c24a, 0xb07810, 0.35));
  loop.position.y = 1.92;
  g.add(loop);
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), toon(0x8a6238, 0x3a2810, 0.12));
  clapper.position.y = 0.28;
  g.add(clapper);
  return g;
}

function relicVeilShard() {
  const g = new THREE.Group();
  const mat = toon(0x5ad08a, 0x1a7040, 0.38);
  const tall = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.85, 5), mat);
  tall.position.y = 0.95;
  g.add(tall);
  const side = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.15, 5), toon(0x7ee8b0, 0x2a8858, 0.28));
  side.position.set(0.28, 0.62, 0.1);
  side.rotation.z = -0.28;
  g.add(side);
  const base = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), toon(0x3a8860, 0x145030, 0.2));
  base.position.y = 0.22;
  g.add(base);
  return g;
}

function relicPackToken() {
  const g = new THREE.Group();
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.2, 12), toon(0xd4b46a, 0x8a6018, 0.32));
  coin.position.y = 0.82;
  coin.rotation.z = 0.18;
  g.add(coin);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.08, 6, 12), toon(0xf0c24a, 0xb07810, 0.4));
  rim.position.y = 0.82;
  rim.rotation.x = Math.PI / 2;
  rim.rotation.z = 0.18;
  g.add(rim);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), toon(0x4ec8e8, 0x1a88b0, 0.55));
  gem.position.y = 0.96;
  g.add(gem);
  return g;
}

function buildRelic(id: ArtifactId) {
  switch (id) {
    case "core-heart":
      return relicCoreHeart();
    case "parent-seed":
      return relicParentSeed();
    case "howl-bell":
      return relicHowlBell();
    case "veil-shard":
      return relicVeilShard();
    case "pack-token":
      return relicPackToken();
  }
}

type Node = {
  id: ArtifactId;
  group: THREE.Group;
  relic: THREE.Group;
  halo: THREE.Mesh;
  star: THREE.Vector3;
  hall: THREE.Vector3;
  hallScale: number;
  starScale: number;
};

export function buildConstellation(): ConstellationWorld {
  const group = new THREE.Group();
  group.name = "boltverse-sky";

  const skyGeo = new THREE.SphereGeometry(220, 24, 16);
  const sky = new THREE.Mesh(
    skyGeo,
    new THREE.MeshBasicMaterial({ color: 0x070918, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.renderOrder = -2;
  group.add(sky);

  const starRoot = new THREE.Group();
  const starGeo = new THREE.SphereGeometry(0.08, 6, 4);
  const starMat = new THREE.MeshBasicMaterial({ color: 0xe8eef8, transparent: true, opacity: 0.08 });
  for (let i = 0; i < 90; i++) {
    const s = new THREE.Mesh(starGeo, starMat);
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(2 * Math.random() - 1);
    const r = 28 + Math.random() * 70;
    s.position.set(r * Math.sin(v) * Math.cos(u), r * Math.cos(v) * 0.55, r * Math.sin(v) * Math.sin(u));
    s.scale.setScalar(0.4 + Math.random() * 1.4);
    starRoot.add(s);
  }
  group.add(starRoot);

  const threadRoot = new THREE.Group();
  const byId = new Map(ARTIFACTS.map((a) => [a.id, a]));
  const threadMats: THREE.LineBasicMaterial[] = [];
  for (const [a, b] of ARTIFACT_THREADS) {
    const ra = byId.get(a)!;
    const rb = byId.get(b)!;
    const pts = [new THREE.Vector3(ra.x, ra.y, ra.z), new THREE.Vector3(rb.x, rb.y, rb.z)];
    const mat = new THREE.LineBasicMaterial({
      color: 0xd4b46a,
      transparent: true,
      opacity: 0,
    });
    threadMats.push(mat);
    threadRoot.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
  group.add(threadRoot);

  const hall = new THREE.Group();
  hall.name = "hall";
  const matStone = toon(0x3a3e4c, 0x12141c, 0.08);
  const matGold = toon(0xf0c24a, 0xb07810, 0.28);
  const matFloor = toon(0x1a1e2a, 0x0a0c14, 0.06);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(14.5, 15.2, 0.45, 12), matFloor);
  floor.position.y = -0.1;
  hall.add(floor);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(11.4, 0.18, 6, 16), matGold);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.16;
  hall.add(ring);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.85, 1.7, 8), matStone);
  plinth.position.y = 0.85;
  hall.add(plinth);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.1, 6, 12), matGold);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 1.72;
  hall.add(lip);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.42, 0.22, 8), matStone);
  top.position.y = 1.82;
  hall.add(top);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, 4.6, 6), matStone);
    col.position.set(Math.cos(a) * 11.2, 2.4, Math.sin(a) * 11.2);
    hall.add(col);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.38, 0.28, 6), matGold);
    cap.position.set(col.position.x, 4.82, col.position.z);
    hall.add(cap);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.55, 8), matStone);
    pad.position.set(Math.cos(a) * 6.4, 0.32, Math.sin(a) * 6.4);
    hall.add(pad);
  }
  group.add(hall);

  const nodes: Node[] = [];
  for (const a of ARTIFACTS) {
    const wrap = new THREE.Group();
    wrap.name = a.id;
    wrap.position.set(a.x, a.y, a.z);
    const relic = buildRelic(a.id);
    wrap.add(relic);
    const glow = a.open ? 0.22 : 0.1;
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.55, 12, 10),
      new THREE.MeshBasicMaterial({
        color: a.color,
        transparent: true,
        opacity: glow,
        depthWrite: false,
      }),
    );
    halo.position.y = 0.9;
    wrap.add(halo);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.9, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.85;
    hit.userData.artifactId = a.id;
    wrap.add(hit);
    wrap.add(new THREE.PointLight(a.color, a.open ? 2.8 : 1.05, 14, 1.4));
    group.add(wrap);
    nodes.push({
      id: a.id,
      group: wrap,
      relic,
      halo,
      star: new THREE.Vector3(a.x, a.y, a.z),
      hall: new THREE.Vector3(),
      hallScale: 1,
      starScale: a.scale,
    });
  }

  group.add(new THREE.HemisphereLight(0x8aa4d0, 0x1a1020, 1.05));
  const sun = new THREE.DirectionalLight(0xffe8b0, 1.35);
  sun.position.set(-16, 22, 10);
  group.add(sun);

  let view: SkyView = "constellation";
  let pick: ArtifactId = "core-heart";
  const tmp = new THREE.Vector3();

  function seatHall() {
    const others = nodes.filter((n) => n.id !== pick);
    let i = 0;
    for (const n of nodes) {
      if (n.id === pick) {
        n.hall.set(0, 1.92, 0);
        n.hallScale = 1.7;
      } else {
        const a = (i / Math.max(1, others.length)) * Math.PI * 2 + 0.4;
        n.hall.set(Math.cos(a) * 6.4, 0.58, Math.sin(a) * 6.4);
        n.hallScale = 0.62;
        i += 1;
      }
    }
  }
  seatHall();
  hall.visible = false;
  for (const n of nodes) {
    n.group.position.copy(n.star);
    n.group.scale.setScalar(n.starScale);
  }

  function setView(v: SkyView) {
    view = v;
  }

  function select(id: ArtifactId) {
    pick = id;
    seatHall();
  }

  function tick(t: number, dt: number) {
    const k = 1 - Math.exp(-dt * 5.4);
    hall.visible = view === "relic";

    const threadOp = view === "constellation" ? 0.7 : 0;
    for (const mat of threadMats) mat.opacity = THREE.MathUtils.lerp(mat.opacity, threadOp, k);
    threadRoot.visible = view === "constellation" || threadMats[0].opacity > 0.05;
    starMat.opacity = THREE.MathUtils.lerp(starMat.opacity, view === "constellation" ? 0.9 : 0.08, k);
    starRoot.visible = starMat.opacity > 0.05;

    for (const n of nodes) {
      tmp.copy(view === "relic" ? n.hall : n.star);
      n.group.position.lerp(tmp, k);
      const want = view === "relic" ? n.hallScale : n.starScale;
      n.group.scale.setScalar(THREE.MathUtils.lerp(n.group.scale.x, want, k));
      n.relic.rotation.y += dt * (n.id === pick && view === "relic" ? 0.55 : 0.18);
      if (view === "constellation") n.group.position.y += Math.sin(t * 0.7 + n.star.x) * 0.012;
      const hm = n.halo.material as THREE.MeshBasicMaterial;
      hm.opacity = THREE.MathUtils.lerp(hm.opacity, n.id === pick ? 0.3 : view === "relic" ? 0.04 : 0.12, k);
    }
  }

  function dispose() {
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat.dispose();
      }
    });
    group.clear();
  }

  return { group, tick, setView, select, dispose };
}
