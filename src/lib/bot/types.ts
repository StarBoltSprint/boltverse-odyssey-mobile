export type BotMode = "stay" | "travel";
export type VesselStatus = "proposed" | "sealed";
export type LinkStatus = "pending" | "active" | "revoked";

export type VesselRow = {
  vessel_id: string;
  owner_id: string | null;
  landable: boolean;
  status: VesselStatus;
  display_name: string;
};

export type BotLinkRow = {
  id: string;
  user_id: string;
  bot_subject: string;
  display_name: string;
  token_hash: string | null;
  status: LinkStatus;
  scopes: string;
};

export type BotSessionRow = {
  id: string;
  user_id: string;
  bot_id: string;
  mode: BotMode;
  current_artifact_id: string | null;
  activity: string;
  updated_at: string;
};

export type Landable = {
  artifact_id: string;
  name: string;
  owned: boolean;
  landable: boolean;
};

export type BotSessionView = {
  bot_id: string;
  bot_name: string;
  mode: BotMode;
  current_artifact_id: string | null;
  owner_id: string;
  activity: string;
  oauth: "stub" | "cursor";
};

export type GrokBotChoice = {
  id: string;
  name: string;
};

export type ChatLine = {
  from: "player" | "bot";
  text: string;
  at: string;
};

export type SessionPayload = {
  session: BotSessionView | null;
  den: { artifact_id: string; name: string } | null;
  landables: Landable[];
  bots: GrokBotChoice[];
  chat?: ChatLine[];
  token?: string;
  oauth_url?: string;
  /** Public Citadel Door template import URL, or null if unpublished. Not a bot_id. */
  door_template_url: string | null;
};

export type ForgeOp = "propose" | "iterate" | "seal";

export type ServiceError = {
  ok: false;
  status: number;
  error: string;
};

export type ServiceOk<T> = { ok: true } & T;
export type ServiceResult<T> = ServiceOk<T> | ServiceError;

export const FORBIDDEN_KEY_FIELDS = [
  "xai_api_key",
  "api_key",
  "grok_api_key",
  "openai_api_key",
  "xaiApiKey",
  "apiKey",
] as const;
