export type ArtifactId = "core-heart" | "parent-seed" | "howl-bell" | "veil-shard" | "pack-token";

export type SkyView = "relic" | "constellation";

export type Artifact = {
  id: ArtifactId;
  name: string;
  line: string;
  open: boolean;
  enter: "circuit" | null;
  x: number;
  y: number;
  z: number;
  color: number;
  scale: number;
  cover: string;
  maker: string;
  face: string;
  badge: string;
  ribbon: string;
  res: number;
  podium: boolean;
  hero?: boolean;
};

/** Five example player-worlds. Only Core Heart opens the Year 0 spire. */
export const ARTIFACTS: Artifact[] = [
  {
    id: "core-heart",
    name: "Core Heart",
    line: "Year 0 crystal. The first raising lives inside.",
    open: true,
    enter: "circuit",
    x: 11.4,
    y: 1.4,
    z: 7.6,
    color: 0x4ec8e8,
    scale: 1.35,
    cover: "/luminous-circuit/spire-heart.jpg",
    maker: "First Raising",
    face: "/luminous-circuit/citizens/gold-crown.png",
    badge: "Open",
    ribbon: "Year 0",
    res: 100,
    podium: true,
    hero: true,
  },
  {
    id: "parent-seed",
    name: "Parent Seed",
    line: "West light, unspent. The walk has not started.",
    open: false,
    enter: null,
    x: 0,
    y: 7.2,
    z: 0,
    color: 0xf0c24a,
    scale: 1.55,
    cover: "/luminous-circuit/gold-crystal.jpg",
    maker: "West Light",
    face: "/luminous-circuit/citizens/gold-plate.png",
    badge: "Relic",
    ribbon: "Seed",
    res: 64,
    podium: true,
  },
  {
    id: "howl-bell",
    name: "Howl Bell",
    line: "First-hall relic. Silent until the citadel densifies.",
    open: false,
    enter: null,
    x: -11.8,
    y: 2.4,
    z: -6.2,
    color: 0xc4844a,
    scale: 1.25,
    cover: "/luminous-circuit/kiln-body.jpg",
    maker: "First Hall",
    face: "/luminous-circuit/citizens/facet-violet-helm.png",
    badge: "Relic",
    ribbon: "Bell",
    res: 41,
    podium: true,
  },
  {
    id: "veil-shard",
    name: "Veil Shard",
    line: "Wild glass. A personal den waiting on a howl.",
    open: false,
    enter: null,
    x: -7.4,
    y: 0.2,
    z: 11.2,
    color: 0x5ad08a,
    scale: 1.18,
    cover: "/luminous-circuit/tower-cyan.jpg",
    maker: "Wild Glass",
    face: "/luminous-circuit/citizens/facet-cyan.png",
    badge: "Relic",
    ribbon: "Wild",
    res: 22,
    podium: false,
  },
  {
    id: "pack-token",
    name: "Pack Token",
    line: "Common mark of the Shared Pack. Not struck yet.",
    open: false,
    enter: null,
    x: 8.4,
    y: -0.4,
    z: -10.8,
    color: 0xd4b46a,
    scale: 1.12,
    cover: "/luminous-circuit/plaza-floor.jpg",
    maker: "Shared Pack",
    face: "/luminous-circuit/citizens/light-disc.png",
    badge: "Relic",
    ribbon: "Pack",
    res: 9,
    podium: false,
  },
];

export const PODIUM_ORDER: ArtifactId[] = ["parent-seed", "core-heart", "howl-bell"];

export const ARTIFACT_THREADS: [ArtifactId, ArtifactId][] = [
  ["parent-seed", "core-heart"],
  ["parent-seed", "howl-bell"],
  ["parent-seed", "veil-shard"],
  ["parent-seed", "pack-token"],
  ["core-heart", "veil-shard"],
  ["core-heart", "pack-token"],
  ["howl-bell", "pack-token"],
  ["howl-bell", "veil-shard"],
];

export function artifactById(id: ArtifactId | null): Artifact | null {
  if (!id) return null;
  return ARTIFACTS.find((a) => a.id === id) ?? null;
}
