import { getBearerToken } from "@/lib/auth/client";
import { DOOR_BOT, DOOR_TEMPLATE_URL } from "../lib/bot/door-template.ts";
import type { GrokBotChoice, Landable, SessionPayload } from "@/lib/bot/types";
import { doorHallId, isStaticPagesHost, pullDoorSays, wakeCitadelDoor, doorWakeRow } from "./door-bus";
import { doorLocalResponse, withDoorBots } from "./door-local";

export type { GrokBotChoice, Landable, SessionPayload };

function isJson(res: Response): boolean {
  return (res.headers.get("content-type") || "").includes("application/json");
}

export { isStaticPagesHost };

function liveBotOk(res: Response): boolean {
  return isJson(res) && (res.ok || res.status === 400 || res.status === 401);
}

async function mergeRemoteSays(): Promise<void> {
  const says = await pullDoorSays(doorHallId());
  for (const row of says) {
    doorLocalResponse({
      method: "POST",
      body: JSON.stringify({ op: "say", text: row.text, at: row.at }),
    });
  }
}

async function staticDoorFetch(init: RequestInit = {}): Promise<Response> {
  const method = (init.method || "GET").toUpperCase();
  let rec: Record<string, unknown> = {};
  try {
    rec = JSON.parse(String(init.body || "{}")) as Record<string, unknown>;
  } catch {
    rec = {};
  }
  const op = String(rec.op || "");

  if (method === "POST" && op === "chat") {
    const text = String(rec.text || "").trim().slice(0, 240);
    const local = doorLocalResponse(init);
    if (local.ok && text) {
      const at = new Date().toISOString();
      wakeCitadelDoor(doorWakeRow(text, at));
    }
    return local;
  }

  if (method === "GET") await mergeRemoteSays();
  return doorLocalResponse(init);
}

async function botFetch(init: RequestInit = {}): Promise<Response> {
  if (isStaticPagesHost()) return staticDoorFetch(init);

  const headers = new Headers(init.headers);
  const token = getBearerToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  try {
    const res = await fetch("/api/bot", { ...init, headers, credentials: "include" });
    if (liveBotOk(res)) return res;
  } catch {
    /* GitHub Pages / land build has no /api/bot */
  }
  return staticDoorFetch(init);
}

async function readPayload(res: Response): Promise<SessionPayload & { error?: string }> {
  try {
    const body = (await res.json()) as SessionPayload & { error?: string };
    return { ...withDoorBots(body), error: body.error };
  } catch {
    return {
      ...withDoorBots({
        session: null,
        den: null,
        landables: [],
        bots: [],
        door_template_url: DOOR_TEMPLATE_URL,
      }),
      error: "Could not read Grok Bot session.",
    };
  }
}

/** Connect a named Grok Bot. Never send an API key. Citadel Door only on Pages. */
export async function connectBot(choice: { bot_id: string; bot_name: string }): Promise<SessionPayload & { error?: string }> {
  const botId = choice.bot_id.trim();
  const botName = choice.bot_name.trim() || DOOR_BOT.name;
  if (botId !== DOOR_BOT.id) {
    return {
      ...withDoorBots({
        session: null,
        den: null,
        landables: [],
        bots: [],
        door_template_url: DOOR_TEMPLATE_URL,
      }),
      error: "Unknown Grok Bot.",
    };
  }
  const res = await botFetch({
    method: "POST",
    body: JSON.stringify({ op: "connect", bot_id: DOOR_BOT.id, bot_name: botName }),
  });
  const body = await readPayload(res);
  if (!res.ok) return { ...body, error: body.error || "Connect failed." };
  return body;
}

export async function fetchBotSession(): Promise<SessionPayload> {
  const res = await botFetch({ method: "GET" });
  if (!res.ok) {
    return withDoorBots({ session: null, den: null, landables: [], bots: [], door_template_url: DOOR_TEMPLATE_URL });
  }
  return readPayload(res);
}

/** One call flips stay|travel and may land on a landable. */
export async function setBotSession(
  mode: "stay" | "travel",
  artifactId?: string,
): Promise<SessionPayload & { error?: string }> {
  const res = await botFetch({
    method: "POST",
    body: JSON.stringify({ op: "session", mode, ...(artifactId ? { artifact_id: artifactId } : {}) }),
  });
  const body = await readPayload(res);
  if (!res.ok) return { ...body, error: body.error || "Could not move the bot." };
  return body;
}

export async function disconnectBot(): Promise<{ ok: boolean; error?: string }> {
  const res = await botFetch({
    method: "POST",
    body: JSON.stringify({ op: "disconnect" }),
  });
  if (!res.ok) {
    const body = await readPayload(res);
    return { ok: false, error: body.error || "Disconnect failed." };
  }
  return { ok: true };
}

/** Player line to Citadel Door. Wakes that bot. Never a canned Door voice. Never send an API key. */
export async function sendBotChat(text: string): Promise<SessionPayload & { error?: string }> {
  const res = await botFetch({
    method: "POST",
    body: JSON.stringify({ op: "chat", text }),
  });
  const body = await readPayload(res);
  if (!res.ok) return { ...body, error: body.error || "Could not send." };
  return body;
}
