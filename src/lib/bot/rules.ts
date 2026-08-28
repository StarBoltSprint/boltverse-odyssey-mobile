import { FORBIDDEN_KEY_FIELDS, type BotMode, type VesselRow } from "./types.ts";

/** Reject any player API-key field. Connect never accepts a personal xAI/Grok key. */
export function rejectApiKeyPayload(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const rec = body as Record<string, unknown>;
  for (const key of FORBIDDEN_KEY_FIELDS) {
    if (key in rec && rec[key] != null && rec[key] !== "") {
      return "API keys are not accepted. Connect your Grok Bot account.";
    }
  }
  return null;
}

export function forgerSlug(userId: string): string {
  const slug = userId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug || "player";
}

/** Decree #601: artifact_{forger_slug}_{hash}. owner_id is a separate field. */
export function mintArtifactId(slug: string, hash: string): string {
  return `artifact_${slug}_${hash}`;
}

export function isOwnedBy(vessel: VesselRow | null | undefined, userId: string): boolean {
  return Boolean(vessel?.owner_id && vessel.owner_id === userId);
}

export function presenceGuard(
  mode: BotMode,
  vessel: VesselRow | null,
  userId: string,
): { ok: true } | { ok: false; status: number; error: string } {
  if (!vessel) return { ok: false, status: 404, error: "Unknown artifact." };
  if (mode === "stay") {
    if (!isOwnedBy(vessel, userId)) {
      return { ok: false, status: 403, error: "Stay is only inside your own artifact." };
    }
    return { ok: true };
  }
  if (!vessel.landable) {
    return { ok: false, status: 403, error: "That artifact is not landable." };
  }
  return { ok: true };
}

export function writeGuard(
  mode: BotMode,
  vessel: VesselRow | null,
  userId: string,
  currentArtifactId: string | null,
): { ok: true } | { ok: false; status: number; error: string } {
  if (!vessel) return { ok: false, status: 404, error: "Unknown artifact." };
  if (!isOwnedBy(vessel, userId)) {
    return { ok: false, status: 403, error: "Write, forge, iterate, and seal are only allowed on artifacts you own." };
  }
  if (mode === "stay") {
    if (!currentArtifactId || currentArtifactId !== vessel.vessel_id) {
      return { ok: false, status: 403, error: "Stay writes only on the owned artifact you are inside." };
    }
  }
  return { ok: true };
}

export function activityLine(
  mode: BotMode,
  vessel: VesselRow | null,
  denName: string | null,
): string {
  if (mode === "stay") return denName ? `watching their den · ${denName}` : "watching their den";
  if (vessel) return `guest on ${vessel.display_name}`;
  return "traveling";
}

export function stripClientOwner(body: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  delete next.owner_id;
  delete next.ownerId;
  delete next.user_id;
  delete next.userId;
  return next;
}
