import { createHash, randomBytes } from "node:crypto";
import {
  forgerSlug,
  mintArtifactId,
  presenceGuard,
  rejectApiKeyPayload,
  writeGuard,
} from "./rules.ts";
import type { BotStore } from "./store.ts";
import { listGrokBots } from "./grok-bots.ts";
import {
  ABSENT_ACTIVITY,
  LIVE_DIR,
  connectedPulseId,
  isSafeBotId,
  liveActivityFor,
  readDoorTemplateUrl,
  readPulse,
  writePulse,
  writeSummon,
  type BotPulse,
} from "./live-pulse.ts";
import { appendChat, appendInbox, cleanChatText, readChat } from "./live-chat.ts";
import type {
  BotMode,
  BotSessionRow,
  ForgeOp,
  GrokBotChoice,
  Landable,
  ServiceResult,
  SessionPayload,
  VesselRow,
} from "./types.ts";

export type BotIds = {
  id: () => string;
  hash: () => string;
  token: () => string;
};

export type BotOAuth = {
  enabled: boolean;
  authorizeUrl?: string;
};

export type BotService = ReturnType<typeof createBotService>;

const SCOPES = "stay,travel,write_owned";

export function defaultIds(): BotIds {
  return {
    id: () => randomBytes(8).toString("hex"),
    hash: () => randomBytes(4).toString("hex"),
    token: () => randomBytes(32).toString("hex"),
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createBotService(
  store: BotStore,
  opts: {
    ids?: BotIds;
    oauth?: BotOAuth;
    now?: () => string;
    listBots?: () => GrokBotChoice[];
    pulseDir?: string;
  } = {},
) {
  const ids = opts.ids ?? defaultIds();
  const oauth = opts.oauth ?? { enabled: false };
  const now = opts.now ?? (() => new Date().toISOString());
  const listBots = opts.listBots ?? listGrokBots;
  const pulseDir = opts.pulseDir ?? LIVE_DIR;

  async function denOf(userId: string): Promise<VesselRow | null> {
    const all = await store.listVessels();
    return (
      all.find((v) => v.owner_id === userId && v.status === "sealed") ??
      all.find((v) => v.owner_id === userId) ??
      null
    );
  }

  async function landablesOf(userId: string): Promise<Landable[]> {
    const all = await store.listVessels();
    return all
      .filter((v) => v.landable && v.status === "sealed")
      .map((v) => ({
        artifact_id: v.vessel_id,
        name: v.display_name,
        owned: v.owner_id === userId,
        landable: true,
      }));
  }

  async function view(userId: string, token?: string, oauthUrl?: string): Promise<SessionPayload> {
    const session = await store.getSession(userId);
    const link = session ? await store.getLink(session.bot_id) : await store.getActiveLink(userId);
    const den = await denOf(userId);
    const landables = await landablesOf(userId);
    const bots = listBots();
    if (!session || !link || link.status !== "active") {
      return { session: null, den: den ? { artifact_id: den.vessel_id, name: den.display_name } : null, landables, bots, chat: [], door_template_url: readDoorTemplateUrl(pulseDir) };
    }
    const grokId = connectedPulseId(link, session);
    return {
      session: {
        bot_id: link.id,
        bot_name: link.display_name,
        mode: session.mode,
        current_artifact_id: session.current_artifact_id,
        owner_id: userId,
        activity: liveActivityFor(grokId, pulseDir),
        oauth: oauth.enabled ? "cursor" : "stub",
      },
      den: den ? { artifact_id: den.vessel_id, name: den.display_name } : null,
      landables,
      bots,
      chat: readChat(grokId, pulseDir),
      door_template_url: readDoorTemplateUrl(pulseDir),
      ...(token ? { token } : {}),
      ...(oauthUrl ? { oauth_url: oauthUrl } : {}),
    };
  }

  async function ensureDen(userId: string): Promise<VesselRow> {
    const existing = await denOf(userId);
    if (existing && existing.status === "sealed") return existing;
    if (existing && existing.status === "proposed") {
      await store.updateVessel(existing.vessel_id, { status: "sealed" });
      return { ...existing, status: "sealed" };
    }
    const vesselId = mintArtifactId(forgerSlug(userId), ids.hash());
    const proposed: VesselRow = {
      vessel_id: vesselId,
      owner_id: userId,
      landable: true,
      status: "proposed",
      display_name: "Your den",
    };
    await store.insertVessel(proposed);
    await store.updateVessel(vesselId, { status: "sealed" });
    return { ...proposed, status: "sealed" };
  }

  async function writeSession(
    userId: string,
    botId: string,
    mode: BotMode,
    vessel: VesselRow | null,
    _den: VesselRow | null,
  ): Promise<BotSessionRow> {
    const row: BotSessionRow = {
      id: ids.id(),
      user_id: userId,
      bot_id: botId,
      mode,
      current_artifact_id: vessel?.vessel_id ?? null,
      activity: ABSENT_ACTIVITY,
      updated_at: now(),
    };
    const prev = await store.getSession(userId);
    if (prev) row.id = prev.id;
    await store.upsertSession(row);
    return row;
  }

  async function activateLink(
    userId: string,
    pick: { botId: string; displayName: string },
  ): Promise<{ linkId: string; token: string }> {
    const token = ids.token();
    const tokenHash = hashToken(token);
    const subject = `grok-bot:${pick.botId}`;
    const existing = await store.getActiveLink(userId);
    if (existing) {
      await store.updateLink(existing.id, {
        status: "active",
        token_hash: tokenHash,
        display_name: pick.displayName,
        bot_subject: subject,
      });
      return { linkId: existing.id, token };
    }
    const id = `lnk_${ids.id()}`;
    await store.insertLink({
      id,
      user_id: userId,
      bot_subject: subject,
      display_name: pick.displayName,
      token_hash: tokenHash,
      status: oauth.enabled ? "pending" : "active",
      scopes: SCOPES,
    });
    return { linkId: id, token };
  }

  async function addLine(
    userId: string,
    body: unknown,
    from: "player" | "bot",
  ): Promise<ServiceResult<SessionPayload>> {
    const keyErr = rejectApiKeyPayload(body);
    if (keyErr) return { ok: false, status: 400, error: keyErr };
    const rec = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    const text = cleanChatText(rec.text);
    if (typeof rec.text === "string" && rec.text.trim().length > 240) {
      return { ok: false, status: 400, error: "text is too long." };
    }
    if (!text) return { ok: false, status: 400, error: "text is required." };
    const live = await store.getSession(userId);
    const link = live ? await store.getLink(live.bot_id) : await store.getActiveLink(userId);
    if (!live || !link || link.status !== "active") {
      return { ok: false, status: 401, error: "Connect a Grok Bot first." };
    }
    const grokId = connectedPulseId(link, live);
    if (!grokId) return { ok: false, status: 400, error: "Unknown Grok Bot." };
    const at = now();
    appendChat(grokId, { from, text, at }, pulseDir);
    if (from === "player") {
      appendInbox({ bot_id: grokId, bot_name: link.display_name, text, at }, pulseDir);
    }
    return { ok: true, ...(await view(userId)) };
  }

  return {
    async connect(userId: string, body: unknown): Promise<ServiceResult<SessionPayload>> {
      const keyErr = rejectApiKeyPayload(body);
      if (keyErr) return { ok: false, status: 400, error: keyErr };
      const rec = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
      const botId = typeof rec.bot_id === "string" ? rec.bot_id.trim() : "";
      const botName = typeof rec.bot_name === "string" ? rec.bot_name.trim() : "";
      if (!botId || !botName) {
        return { ok: false, status: 400, error: "bot_id and bot_name are required." };
      }
      const chosen = listBots().find((b) => b.id === botId);
      if (!chosen) return { ok: false, status: 404, error: "Unknown Grok Bot." };
      const displayName = chosen.name;
      const den = await ensureDen(userId);
      const { linkId, token } = await activateLink(userId, { botId, displayName });
      writeSummon({ bot_id: botId, bot_name: displayName }, pulseDir, now());
      const link = await store.getLink(linkId);
      if (oauth.enabled && link?.status === "pending") {
        const url =
          oauth.authorizeUrl ||
          `/api/bot?code=cursor-stub&state=${encodeURIComponent(linkId)}`;
        return { ok: true, ...(await view(userId, undefined, url)) };
      }
      await writeSession(userId, linkId, "stay", den, den);
      return { ok: true, ...(await view(userId, token)) };
    },

    async completeOAuth(userId: string, state: string | null): Promise<ServiceResult<SessionPayload>> {
      const link = state ? await store.getLink(state) : await store.getActiveLink(userId);
      if (!link || link.user_id !== userId) {
        return { ok: false, status: 404, error: "No pending Grok Bot link." };
      }
      if (link.status === "revoked") {
        return { ok: false, status: 403, error: "This Grok Bot link was revoked." };
      }
      await store.updateLink(link.id, { status: "active" });
      const den = await ensureDen(userId);
      await writeSession(userId, link.id, "stay", den, den);
      return { ok: true, ...(await view(userId)) };
    },

    async disconnect(userId: string): Promise<ServiceResult<{ revoked: true }>> {
      const link = await store.getActiveLink(userId);
      if (link) await store.updateLink(link.id, { status: "revoked" });
      await store.deleteSession(userId);
      return { ok: true, revoked: true };
    },

    async session(userId: string): Promise<ServiceResult<SessionPayload>> {
      const live = await store.getSession(userId);
      if (live) {
        const link = await store.getLink(live.bot_id);
        if (!link || link.status !== "active") {
          await store.deleteSession(userId);
        }
      }
      return { ok: true, ...(await view(userId)) };
    },

    async setSession(
      userId: string,
      input: { mode?: BotMode; artifact_id?: string },
    ): Promise<ServiceResult<SessionPayload>> {
      const live = await store.getSession(userId);
      const link = live ? await store.getLink(live.bot_id) : await store.getActiveLink(userId);
      if (!live || !link || link.status !== "active") {
        return { ok: false, status: 401, error: "Connect a Grok Bot first." };
      }
      const den = await denOf(userId);
      const mode: BotMode = input.mode ?? live.mode;
      let vessel: VesselRow | null = null;
      if (input.artifact_id) {
        vessel = await store.getVessel(input.artifact_id);
        const gate = presenceGuard(mode, vessel, userId);
        if (!gate.ok) return gate;
      } else if (mode === "stay") {
        vessel = den;
        if (!vessel) return { ok: false, status: 403, error: "Stay needs an owned artifact." };
      } else {
        const guests = (await store.listVessels()).filter(
          (v) => v.landable && v.status === "sealed" && v.owner_id !== userId,
        );
        vessel = guests[0] ?? den;
        const gate = presenceGuard(mode, vessel, userId);
        if (!gate.ok) return gate;
      }
      await writeSession(userId, link.id, mode, vessel, den);
      return { ok: true, ...(await view(userId)) };
    },

    async pulse(userId: string, body: unknown): Promise<ServiceResult<{ pulse: BotPulse } & SessionPayload>> {
      const keyErr = rejectApiKeyPayload(body);
      if (keyErr) return { ok: false, status: 400, error: keyErr };
      const rec = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
      const botId = typeof rec.bot_id === "string" ? rec.bot_id.trim() : "";
      const activity = typeof rec.activity === "string" ? rec.activity.trim() : "";
      if (!botId || !activity) {
        return { ok: false, status: 400, error: "bot_id and activity are required." };
      }
      if (!isSafeBotId(botId)) return { ok: false, status: 400, error: "invalid bot_id" };
      const chosen = listBots().find((b) => b.id === botId);
      const named = typeof rec.bot_name === "string" ? rec.bot_name.trim() : "";
      const name = chosen?.name || named || readPulse(botId, pulseDir)?.name || "Grok Bot";
      const pulse = writePulse({ id: botId, name, activity, present: true }, pulseDir, now());
      return { ok: true, pulse, ...(await view(userId)) };
    },

    async chat(userId: string, body: unknown): Promise<ServiceResult<SessionPayload>> {
      return addLine(userId, body, "player");
    },

    async say(userId: string, body: unknown): Promise<ServiceResult<SessionPayload>> {
      return addLine(userId, body, "bot");
    },

    async forge(
      userId: string,
      input: { op: ForgeOp; artifact_id?: string; wish?: string },
    ): Promise<ServiceResult<{ artifact_id: string; status: VesselRow["status"]; owner_id: string }>> {
      const live = await store.getSession(userId);
      const link = live ? await store.getLink(live.bot_id) : null;
      if (!live || !link || link.status !== "active") {
        return { ok: false, status: 401, error: "Connect a Grok Bot first." };
      }
      if (input.op === "propose") {
        const vesselId = input.artifact_id || mintArtifactId(forgerSlug(userId), ids.hash());
        const existing = await store.getVessel(vesselId);
        if (existing) {
          const gate = writeGuard(live.mode, existing, userId, live.current_artifact_id);
          if (!gate.ok) return gate;
          return { ok: true, artifact_id: existing.vessel_id, status: existing.status, owner_id: userId };
        }
        if (live.mode === "stay" && live.current_artifact_id && live.current_artifact_id !== vesselId) {
          return { ok: false, status: 403, error: "Stay writes only on the owned artifact you are inside." };
        }
        const row: VesselRow = {
          vessel_id: vesselId,
          owner_id: userId,
          landable: true,
          status: "proposed",
          display_name: (input.wish || "New claim").slice(0, 64),
        };
        await store.insertVessel(row);
        return { ok: true, artifact_id: vesselId, status: "proposed", owner_id: userId };
      }

      if (!input.artifact_id) return { ok: false, status: 400, error: "artifact_id is required." };
      const vessel = await store.getVessel(input.artifact_id);
      const gate = writeGuard(live.mode, vessel, userId, live.current_artifact_id);
      if (!gate.ok) return gate;
      if (!vessel) return { ok: false, status: 404, error: "Unknown artifact." };

      if (input.op === "seal") {
        if (vessel.status !== "proposed") {
          return { ok: false, status: 403, error: "Seal follows propose. This artifact is not a new claim." };
        }
        await store.updateVessel(vessel.vessel_id, { status: "sealed" });
        return { ok: true, artifact_id: vessel.vessel_id, status: "sealed", owner_id: userId };
      }

      if (vessel.status !== "proposed" && vessel.status !== "sealed") {
        return { ok: false, status: 403, error: "Iterate only on a claim you own." };
      }
      return { ok: true, artifact_id: vessel.vessel_id, status: vessel.status, owner_id: userId };
    },
  };
}
