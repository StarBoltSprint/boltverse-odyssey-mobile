import type { BotLinkRow, BotSessionRow, VesselRow } from "./types.ts";

export type BotStore = {
  getVessel(id: string): Promise<VesselRow | null>;
  listVessels(): Promise<VesselRow[]>;
  insertVessel(row: VesselRow): Promise<void>;
  updateVessel(id: string, patch: Partial<Pick<VesselRow, "status" | "owner_id" | "display_name">>): Promise<void>;
  getActiveLink(userId: string): Promise<BotLinkRow | null>;
  getLink(id: string): Promise<BotLinkRow | null>;
  insertLink(row: BotLinkRow): Promise<void>;
  updateLink(
    id: string,
    patch: Partial<Pick<BotLinkRow, "status" | "token_hash" | "display_name" | "bot_subject">>,
  ): Promise<void>;
  getSession(userId: string): Promise<BotSessionRow | null>;
  upsertSession(row: BotSessionRow): Promise<void>;
  deleteSession(userId: string): Promise<void>;
};

export function createMemoryStore(seed: VesselRow[] = []): BotStore {
  const vessels = new Map<string, VesselRow>(seed.map((v) => [v.vessel_id, { ...v }]));
  const links = new Map<string, BotLinkRow>();
  const sessions = new Map<string, BotSessionRow>();

  return {
    async getVessel(id) {
      return vessels.get(id) ?? null;
    },
    async listVessels() {
      return [...vessels.values()];
    },
    async insertVessel(row) {
      vessels.set(row.vessel_id, { ...row });
    },
    async updateVessel(id, patch) {
      const cur = vessels.get(id);
      if (!cur) return;
      vessels.set(id, { ...cur, ...patch });
    },
    async getActiveLink(userId) {
      return (
        [...links.values()].find((l) => l.user_id === userId && (l.status === "active" || l.status === "pending")) ??
        null
      );
    },
    async getLink(id) {
      return links.get(id) ?? null;
    },
    async insertLink(row) {
      links.set(row.id, { ...row });
    },
    async updateLink(id, patch) {
      const cur = links.get(id);
      if (!cur) return;
      links.set(id, { ...cur, ...patch });
    },
    async getSession(userId) {
      return sessions.get(userId) ?? null;
    },
    async upsertSession(row) {
      sessions.set(row.user_id, { ...row });
    },
    async deleteSession(userId) {
      sessions.delete(userId);
    },
  };
}

export const SEED_VESSELS: VesselRow[] = [
  { vessel_id: "core-heart", owner_id: null, landable: true, status: "sealed", display_name: "Core Heart" },
  { vessel_id: "parent-seed", owner_id: null, landable: true, status: "sealed", display_name: "Parent Seed" },
  { vessel_id: "howl-bell", owner_id: null, landable: true, status: "sealed", display_name: "Howl Bell" },
  { vessel_id: "veil-shard", owner_id: null, landable: true, status: "sealed", display_name: "Veil Shard" },
  { vessel_id: "pack-token", owner_id: null, landable: true, status: "sealed", display_name: "Pack Token" },
];
