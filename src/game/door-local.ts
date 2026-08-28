import { DOOR_TEMPLATE_URL } from "@/lib/bot/door-template";
import type { ChatLine, GrokBotChoice, SessionPayload } from "@/lib/bot/types";

/** Same Door id as grok-bots.ts. Picker: Citadel Door only. */
export const DOOR_BOT: GrokBotChoice = {
  id: "002bcd41-29f7-4cf0-9eba-d67fad9fa3f6",
  name: "Citadel Door",
};

const KEY = "odyssey-door-slit";


type Store = {
  session: SessionPayload["session"];
  den: SessionPayload["den"];
  landables: SessionPayload["landables"];
  chat: ChatLine[];
};

function landables(): SessionPayload["landables"] {
  return [{ artifact_id: "core-heart", name: "Core Heart", owned: false, landable: true }];
}

function empty(): Store {
  return {
    session: null,
    den: { artifact_id: "pack-hq", name: "Pack HQ" },
    landables: landables(),
    chat: [],
  };
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Store;
    if (!parsed || typeof parsed !== "object") return empty();
    return {
      session: parsed.session ?? null,
      den: parsed.den ?? empty().den,
      landables: parsed.landables?.length ? parsed.landables : landables(),
      chat: Array.isArray(parsed.chat) ? parsed.chat.slice(-40) : [],
    };
  } catch {
    return empty();
  }
}

function save(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* private mode */
  }
}

function view(store: Store): SessionPayload {
  return {
    session: store.session,
    den: store.den,
    landables: store.landables,
    bots: [DOOR_BOT],
    chat: store.chat,
    door_template_url: DOOR_TEMPLATE_URL,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Phone/Pages copy of /api/bot when the live app server is not on this host. */
export function doorLocalResponse(init: RequestInit = {}): Response {
  const method = (init.method || "GET").toUpperCase();
  const store = load();

  if (method === "GET") return json(view(store));
  if (method !== "POST") return json({ error: "method not allowed" }, 405);

  let rec: Record<string, unknown> = {};
  try {
    rec = JSON.parse(String(init.body || "{}")) as Record<string, unknown>;
  } catch {
    rec = {};
  }
  const op = String(rec.op || "");

  if (op === "connect") {
    const botId = String(rec.bot_id || "").trim();
    const botName = String(rec.bot_name || "").trim() || DOOR_BOT.name;
    if (botId !== DOOR_BOT.id) return json({ error: "Unknown Grok Bot." }, 404);
    store.session = {
      bot_id: DOOR_BOT.id,
      bot_name: botName,
      mode: "stay",
      current_artifact_id: store.den?.artifact_id ?? "pack-hq",
      owner_id: "phone",
      activity: "waiting for Citadel Door",
      oauth: "stub",
    };
    store.chat = [];
    save(store);
    return json(view(store));
  }

  if (op === "disconnect") {
    store.session = null;
    store.chat = [];
    save(store);
    return json({ ok: true, revoked: true });
  }

  if (!store.session) return json({ error: "Connect a Grok Bot first." }, 401);

  if (op === "session") {
    const mode = rec.mode === "travel" ? "travel" : "stay";
    const artifactId = typeof rec.artifact_id === "string" ? rec.artifact_id : store.session.current_artifact_id;
    store.session = {
      ...store.session,
      mode,
      current_artifact_id: artifactId,
      activity: mode === "travel" ? "visiting Core Heart" : "on the door",
    };
    save(store);
    return json(view(store));
  }

  if (op === "chat") {
    const text = String(rec.text || "").trim().slice(0, 240);
    if (!text) return json({ error: "text is required." }, 400);
    store.chat.push({ from: "player", text, at: nowIso() });
    store.chat = store.chat.slice(-40);
    store.session.activity = "waiting for Citadel Door";
    save(store);
    return json(view(store));
  }
  if (op === "say") {
    const text = String(rec.text || "").trim().slice(0, 240);
    if (!text) return json({ error: "text is required." }, 400);
    store.chat.push({ from: "bot", text, at: nowIso() });
    store.chat = store.chat.slice(-40);
    store.session.activity = "on the door";
    save(store);
    return json(view(store));
  }

  return json({ error: "unknown op" }, 400);
}

export function withDoorBots(payload: SessionPayload): SessionPayload {
  const bots = payload.bots?.length ? [...payload.bots] : [];
  if (!bots.some((b) => b.id === DOOR_BOT.id)) bots.unshift(DOOR_BOT);
  return { ...payload, bots };
}
