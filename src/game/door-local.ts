import { DOOR_TEMPLATE_URL } from "@/lib/bot/door-template";
import type { ChatLine, GrokBotChoice, SessionPayload } from "@/lib/bot/types";

/** Same Door id as grok-bots.ts. Picker: Citadel Door only. */
export const DOOR_BOT: GrokBotChoice = {
  id: "002bcd41-29f7-4cf0-9eba-d67fad9fa3f6",
  name: "Citadel Door",
};

const KEY = "odyssey-door-slit";
const RE_HI = /\b(hi|hey|hello|here|u there|you there|yo)\b/i;
const RE_HOW = /\b(how are|what.?s up|wyd|doing)\b/i;
const RE_PLAY = /\b(play|circuit|howl|walk|game|door|citadel)\b/i;
const RE_Q = /\?|\b(what|who|how|why|where)\b/i;
const NOISE = new Set(["p", "lol", "lmao", "ok", "k", "kk", "yo", "haha"]);

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

function pickDoorLine(text: string, recent: string[]): string {
  let bank: string[];
  if (RE_HI.test(text) && !RE_HOW.test(text)) {
    bank = ["Here. On the door.", "Yes. I hear you.", "Present. Say it."];
  } else if (RE_HOW.test(text)) {
    bank = ["On the door. Local. No quota.", "Here. Watching the slit.", "Good. You?"];
  } else if (RE_PLAY.test(text)) {
    bank = ["Play copy is local. I'm on this door.", "Citadel door. I have the line.", "Say what you want on this copy."];
  } else if (RE_Q.test(text)) {
    bank = ["Ask it straight. I'm local on this door.", "I can answer here. Short.", "Go."];
  } else {
    bank = ["Heard. Go on.", "On it. Local.", "Yes.", "Got it. Next."];
  }
  const hit = bank.find((line) => !recent.includes(line));
  return hit ?? bank[0];
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
      activity: "on the door",
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

  if (op === "chat" || op === "say") {
    const text = String(rec.text || "").trim().slice(0, 240);
    if (!text) return json({ error: "text is required." }, 400);
    const at = nowIso();
    if (op === "chat") {
      store.chat.push({ from: "player", text, at });
      const quiet = NOISE.has(text.toLowerCase()) || text.length <= 1;
      if (!quiet) {
        const recent = store.chat.filter((l) => l.from === "bot").map((l) => l.text).slice(-8);
        store.chat.push({
          from: "bot",
          text: pickDoorLine(text, recent),
          at: new Date(Date.now() + 400).toISOString(),
        });
        store.session.activity = "answering you on the door";
      }
    } else {
      store.chat.push({ from: "bot", text, at });
    }
    store.chat = store.chat.slice(-40);
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
