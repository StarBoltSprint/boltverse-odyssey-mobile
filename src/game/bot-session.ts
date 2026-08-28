import { getBearerToken } from "@/lib/auth/client";
import { DOOR_TEMPLATE_URL } from "@/lib/bot/door-template";
import type { GrokBotChoice, Landable, SessionPayload } from "@/lib/bot/types";
import { doorLocalResponse, withDoorBots } from "./door-local";

export type { GrokBotChoice, Landable, SessionPayload };

function isJson(res: Response): boolean {
  return (res.headers.get("content-type") || "").includes("application/json");
}

async function botFetch(init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getBearerToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const extra = String(import.meta.env.VITE_BOT_API || "").trim();
  const urls = extra ? [extra.replace(/\/$/, ""), "/api/bot"] : ["/api/bot"];
  for (const url of urls) {
    try {
      const res = await fetch(url, { ...init, headers, credentials: "include" });
      if (isJson(res)) return res;
    } catch {
      /* Pages / offline — fall through */
    }
  }
  return doorLocalResponse(init);
}

async function readPayload(res: Response): Promise<SessionPayload & { error?: string }> {
  try {
    const body = (await res.json()) as SessionPayload & { error?: string };
    return withDoorBots(body);
  } catch {
    return withDoorBots({
      session: null,
      den: null,
      landables: [],
      bots: [],
      door_template_url: DOOR_TEMPLATE_URL,
      error: "Could not read Grok Bot session.",
    });
  }
}

/** Connect a named Grok Bot. Never send an API key. */
export async function connectBot(choice: { bot_id: string; bot_name: string }): Promise<SessionPayload & { error?: string }> {
  const res = await botFetch({
    method: "POST",
    body: JSON.stringify({ op: "connect", bot_id: choice.bot_id, bot_name: choice.bot_name }),
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

/** Player line to the connected Grok Bot. Never send an API key. */
export async function sendBotChat(text: string): Promise<SessionPayload & { error?: string }> {
  const res = await botFetch({
    method: "POST",
    body: JSON.stringify({ op: "chat", text }),
  });
  const body = await readPayload(res);
  if (!res.ok) return { ...body, error: body.error || "Could not send." };
  return body;
}
