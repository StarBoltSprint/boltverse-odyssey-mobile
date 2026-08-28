import type { Sql } from "@/lib/db";
import type { BotStore } from "./store.ts";
import type { BotLinkRow, BotSessionRow, LinkStatus, VesselRow, VesselStatus } from "./types.ts";

function asVessel(row: Record<string, unknown>): VesselRow {
  return {
    vessel_id: String(row.vessel_id),
    owner_id: row.owner_id == null ? null : String(row.owner_id),
    landable: Boolean(row.landable),
    status: row.status === "proposed" ? "proposed" : "sealed",
    display_name: String(row.display_name),
  };
}

function asLink(row: Record<string, unknown>): BotLinkRow {
  const status = row.status === "pending" || row.status === "revoked" ? (row.status as LinkStatus) : "active";
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    bot_subject: String(row.bot_subject),
    display_name: String(row.display_name),
    token_hash: row.token_hash == null ? null : String(row.token_hash),
    status,
    scopes: String(row.scopes ?? "stay,travel,write_owned"),
  };
}

function asSession(row: Record<string, unknown>): BotSessionRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    bot_id: String(row.bot_id),
    mode: row.mode === "travel" ? "travel" : "stay",
    current_artifact_id: row.current_artifact_id == null ? null : String(row.current_artifact_id),
    activity: String(row.activity ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export function createSqlStore(sql: Sql): BotStore {
  return {
    async getVessel(id) {
      const rows = await sql.query("select vessel_id, owner_id, landable, status, display_name from vessels where vessel_id = $1", [id]);
      return rows[0] ? asVessel(rows[0]) : null;
    },
    async listVessels() {
      const rows = await sql.query("select vessel_id, owner_id, landable, status, display_name from vessels order by created_at asc");
      return rows.map(asVessel);
    },
    async insertVessel(row) {
      await sql.query(
        `insert into vessels (vessel_id, owner_id, landable, status, display_name)
         values ($1, $2, $3, $4, $5)`,
        [row.vessel_id, row.owner_id, row.landable, row.status as VesselStatus, row.display_name],
      );
    },
    async updateVessel(id, patch) {
      const cur = await this.getVessel(id);
      if (!cur) return;
      await sql.query(
        `update vessels set owner_id = $2, status = $3, display_name = $4 where vessel_id = $1`,
        [id, patch.owner_id === undefined ? cur.owner_id : patch.owner_id, patch.status ?? cur.status, patch.display_name ?? cur.display_name],
      );
    },
    async getActiveLink(userId) {
      const rows = await sql.query(
        `select id, user_id, bot_subject, display_name, token_hash, status, scopes
         from bot_links where user_id = $1 and status in ('active', 'pending')
         order by created_at desc limit 1`,
        [userId],
      );
      return rows[0] ? asLink(rows[0]) : null;
    },
    async getLink(id) {
      const rows = await sql.query(
        `select id, user_id, bot_subject, display_name, token_hash, status, scopes from bot_links where id = $1`,
        [id],
      );
      return rows[0] ? asLink(rows[0]) : null;
    },
    async insertLink(row) {
      await sql.query(
        `insert into bot_links (id, user_id, bot_subject, display_name, token_hash, status, scopes)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, row.user_id, row.bot_subject, row.display_name, row.token_hash, row.status, row.scopes],
      );
    },
    async updateLink(id, patch) {
      const cur = await this.getLink(id);
      if (!cur) return;
      const status = patch.status ?? cur.status;
      await sql.query(
        `update bot_links
         set status = $2, token_hash = $3, display_name = $4, bot_subject = $5,
             revoked_at = case when $2 = 'revoked' then now() else revoked_at end
         where id = $1`,
        [id, status, patch.token_hash === undefined ? cur.token_hash : patch.token_hash, patch.display_name ?? cur.display_name, patch.bot_subject ?? cur.bot_subject],
      );
    },
    async getSession(userId) {
      const rows = await sql.query(
        `select id, user_id, bot_id, mode, current_artifact_id, activity, updated_at
         from bot_sessions where user_id = $1`,
        [userId],
      );
      return rows[0] ? asSession(rows[0]) : null;
    },
    async upsertSession(row) {
      await sql.query(
        `insert into bot_sessions (id, user_id, bot_id, mode, current_artifact_id, activity, updated_at)
         values ($1, $2, $3, $4, $5, $6, now())
         on conflict (user_id) do update set
           bot_id = excluded.bot_id,
           mode = excluded.mode,
           current_artifact_id = excluded.current_artifact_id,
           activity = excluded.activity,
           updated_at = now()`,
        [row.id, row.user_id, row.bot_id, row.mode, row.current_artifact_id, row.activity],
      );
    },
    async deleteSession(userId) {
      await sql.query(`delete from bot_sessions where user_id = $1`, [userId]);
    },
  };
}
