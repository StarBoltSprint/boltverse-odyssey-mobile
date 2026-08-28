export type RealmId = "star-core" | "citadel" | "circuit" | "personal" | "shared";

export type Realm = {
  id: RealmId;
  name: string;
  line: string;
  open: boolean;
  x: number;
  y: number;
  z: number;
  color: number;
  scale: number;
};

/** SMiR decree: Boltverse is many realms. Circuit is the second-realm den. */
export const REALMS: Realm[] = [
  {
    id: "star-core",
    name: "Star Core",
    line: "Parent. Not a walk. Nobody keeps its name.",
    open: false,
    x: 0,
    y: 7.4,
    z: 0,
    color: 0xf0c24a,
    scale: 1.85,
  },
  {
    id: "citadel",
    name: "Thunderwolf Citadel",
    line: "First hall. Relic constellation. Not densified here yet.",
    open: false,
    x: -11.2,
    y: 1.6,
    z: -5.4,
    color: 0xe8b44a,
    scale: 1.15,
  },
  {
    id: "circuit",
    name: "Luminous Circuit",
    line: "Second realm. Year 0 Core Spire. Open.",
    open: true,
    x: 9.4,
    y: -1.2,
    z: 6.8,
    color: 0x4ec8e8,
    scale: 1.25,
  },
  {
    id: "personal",
    name: "Personal Realm",
    line: "Your den. Waiting on a first howl.",
    open: false,
    x: -6.8,
    y: -5.6,
    z: 9.2,
    color: 0x7ee8f2,
    scale: 0.72,
  },
  {
    id: "shared",
    name: "Shared Pack",
    line: "The Pack's common sky. Not raised yet.",
    open: false,
    x: 6.2,
    y: -6.4,
    z: -8.6,
    color: 0xd4b46a,
    scale: 0.78,
  },
];

export const REALM_THREADS: [RealmId, RealmId][] = [
  ["star-core", "citadel"],
  ["star-core", "circuit"],
  ["star-core", "personal"],
  ["star-core", "shared"],
  ["citadel", "circuit"],
  ["circuit", "personal"],
  ["circuit", "shared"],
];
