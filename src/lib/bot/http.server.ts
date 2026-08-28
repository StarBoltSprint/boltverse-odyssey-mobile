import { z } from "zod";
import { getSql } from "@/lib/db";
import { CrossSiteRequestError } from "@/lib/auth/isolation.server";
import { UnauthorizedError, requireUserId } from "@/lib/auth/verify.server";
import { createBotService } from "./service.ts";
import { createSqlStore } from "./sql-store.server.ts";
import { rejectApiKeyPayload, stripClientOwner } from "./rules.ts";
import type { BotMode, ForgeOp, ServiceResult } from "./types.ts";

const modeSchema = z.enum(["stay", "travel"]);
const forgeOpSchema = z.enum(["propose", "iterate", "seal"]);
const postSchema = z.object({
  op: z.enum(["connect", "disconnect", "session", "propose", "iterate", "seal", "pulse", "chat", "say"]),
  mode: modeSchema.optional(),
  artifact_id: z.string().min(1).max(96).optional(),
  wish: z.string().max(240).optional(),
  bot_id: z.string().min(1).max(96).optional(),
  bot_name: z.string().min(1).max(96).optional(),
  activity: z.string().min(1).max(240).optional(),
  text: z.string().max(240).optional(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function fromResult<T>(result: ServiceResult<T>): Response {
  if (!result.ok) return json({ error: result.error }, result.status);
  const { ok: _ok, ...rest } = result;
  return json(rest);
}

function oauthConfig() {
  const clientId = process.env.CURSOR_OAUTH_CLIENT_ID?.trim();
  const authorize = process.env.CURSOR_OAUTH_AUTHORIZE_URL?.trim();
  return {
    enabled: Boolean(clientId),
    authorizeUrl: authorize || undefined,
  };
}

async function service() {
  const sql = await getSql();
  return createBotService(createSqlStore(sql), { oauth: oauthConfig() });
}

async function userIdFrom(request: Request): Promise<string> {
  const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
  assertSameSiteRequest();
  const authz = request.headers.get("authorization");
  const bearer = authz?.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : undefined;
  return requireUserId(bearer);
}

export async function handleBot(request: Request): Promise<Response> {
  try {
    const userId = await userIdFrom(request);
    const bot = await service();
    const url = new URL(request.url);

    if (request.method === "GET") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (code) {
        const done = await bot.completeOAuth(userId, state);
        if (!done.ok) return fromResult(done);
        if (url.searchParams.get("redirect") !== "0") {
          return Response.redirect(new URL("/", request.url), 302);
        }
        return json(done);
      }
      return fromResult(await bot.session(userId));
    }

    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

    let raw: unknown = {};
    const text = await request.text();
    if (text.trim()) {
      try {
        raw = JSON.parse(text);
      } catch {
        return json({ error: "invalid JSON" }, 400);
      }
    }
    const keyErr = rejectApiKeyPayload(raw);
    if (keyErr) return json({ error: keyErr }, 400);
    const cleaned = raw && typeof raw === "object" && !Array.isArray(raw)
      ? stripClientOwner(raw as Record<string, unknown>)
      : raw;
    const parsed = postSchema.safeParse(cleaned);
    if (!parsed.success) return json({ error: "invalid request" }, 400);
    const msg = parsed.data;

    if (msg.op === "connect") {
      if (!msg.bot_id || !msg.bot_name) return json({ error: "bot_id and bot_name are required." }, 400);
      return fromResult(await bot.connect(userId, raw));
    }
    if (msg.op === "disconnect") return fromResult(await bot.disconnect(userId));
    if (msg.op === "pulse") {
      if (!msg.bot_id || !msg.activity) return json({ error: "bot_id and activity are required." }, 400);
      return fromResult(await bot.pulse(userId, raw));
    }
    if (msg.op === "session") {
      return fromResult(await bot.setSession(userId, { mode: msg.mode as BotMode | undefined, artifact_id: msg.artifact_id }));
    }
    if (msg.op === "chat") return fromResult(await bot.chat(userId, raw));
    if (msg.op === "say") return fromResult(await bot.say(userId, raw));
    return fromResult(
      await bot.forge(userId, { op: msg.op as ForgeOp, artifact_id: msg.artifact_id, wish: msg.wish }),
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) return json({ error: "Unauthorized" }, 401);
    if (error instanceof CrossSiteRequestError) return json({ error: error.message }, 403);
    console.error("[bot]", error);
    return json({ error: "bot session failed" }, 500);
  }
}
