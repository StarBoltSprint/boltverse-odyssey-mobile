import { MAX_WISH, sanitizeRemix, type RemixWorld } from "@/game/forged";
import { rejectApiKeyPayload } from "@/lib/bot/rules.ts";

const SYSTEM = `You remix Luminous Circuit (Boltverse Odyssey Year 0 toy citadel).
Output ONLY NDJSON, one object per line. No markdown.
{"t":"log","v":"$ grok build remix --circuit"}
{"t":"theme","v":"crystal"}
{"t":"name","v":"Two To Four Words"}
{"t":"line","v":"short poetic line"}
{"t":"building","v":{"name":"Kiln","kind":"kiln","line":"what this post does"}}
{"t":"building","v":{"name":"Den","kind":"den","line":"..."}}
{"t":"building","v":{"name":"Canal","kind":"canal","line":"..."}}
{"t":"building","v":{"name":"Spire","kind":"spire","line":"..."}}
{"t":"lore","v":"Two sentences. Toy citadel voice."}
{"t":"log","v":"sealing remix…"}
{"t":"done"}
theme: crystal|ember|tide|void|grove|storm. kind: kiln|den|canal|spire|plaza|dock.
Keep it kind. No violence, NSFW, real people. This is a REMIX of an existing engine, not a new game.`;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** If a Grok Bot session is live, remix writes follow stay/travel ownership. No player API keys. */
async function rejectBotWrite(
  request: Request,
  body: { artifact_id?: string },
): Promise<Response | null> {
  try {
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const authz = request.headers.get("authorization");
    const bearer = authz?.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : undefined;
    const user = await getSessionUser(bearer);
    if (!user) return null;
    const { getSql } = await import("@/lib/db");
    const { createSqlStore } = await import("@/lib/bot/sql-store.server.ts");
    const { createBotService } = await import("@/lib/bot/service.ts");
    const bot = createBotService(createSqlStore(await getSql()));
    const snap = await bot.session(user.id);
    if (!snap.ok || !snap.session) return null;
    const artifactId = body.artifact_id || snap.session.current_artifact_id || undefined;
    const write = await bot.forge(user.id, { op: "iterate", artifact_id: artifactId });
    if (!write.ok) return json({ error: write.error }, write.status);
    return null;
  } catch {
    return null;
  }
}

export async function handleForge(request: Request) {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return json({ error: "The forge is cold. Turn on SpaceXAI APIs when you publish." }, 503);

  let body: { wish?: string; artifact_id?: string } = {};
  try {
    body = (await request.json()) as { wish?: string; artifact_id?: string };
  } catch {
    return json({ error: "Bad howl." }, 400);
  }
  const keyErr = rejectApiKeyPayload(body);
  if (keyErr) return json({ error: keyErr }, 400);
  const blocked = await rejectBotWrite(request, body);
  if (blocked) return blocked;
  const wish = String(body.wish ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_WISH);
  if (wish.length < 4) return json({ error: "Howl a little longer." }, 400);

  const ac = new AbortController();
  const kill = setTimeout(() => ac.abort(), 32000);
  const upstream = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    signal: ac.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.6",
      temperature: 0.85,
      max_tokens: 800,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Remix Luminous Circuit:\n${wish}` },
      ],
    }),
  }).catch(() => null);

  if (!upstream || !upstream.ok || !upstream.body) {
    clearTimeout(kill);
    return json({ error: "Grok could not strike the remix." }, 502);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let sseBuf = "";
      let text = "";
      let lineBuf = "";
      const seen = new Set<string>();
      const emitLine = (raw: string) => {
        const row = raw.trim();
        if (!row.startsWith("{") || seen.has(row)) return;
        try {
          const ev = JSON.parse(row) as { t?: string };
          if (!ev.t) return;
          seen.add(row);
          send(ev);
        } catch {
          /* partial */
        }
      };
      try {
        const reader = upstream.body!.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuf += decoder.decode(value, { stream: true });
          const chunks = sseBuf.split("\n");
          sseBuf = chunks.pop() ?? "";
          for (const ln of chunks) {
            const line = ln.trim();
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const payload = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
              const delta = payload.choices?.[0]?.delta?.content ?? "";
              if (!delta) continue;
              text += delta;
              lineBuf += delta;
              if (lineBuf.includes("\n")) {
                const parts = lineBuf.split("\n");
                lineBuf = parts.pop() ?? "";
                for (const p of parts) emitLine(p);
              }
            } catch {
              /* skip */
            }
          }
        }
        emitLine(lineBuf);
        const world = worldFromStream(text, wish);
        if (world) send({ t: "world", world });
        else send({ t: "error", v: "The remix would not hold." });
      } catch {
        send({ t: "error", v: "The star core went quiet." });
      } finally {
        clearTimeout(kill);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
    },
  });
}

function worldFromStream(text: string, wish: string): RemixWorld | null {
  const events: Record<string, unknown> = { wish, at: Date.now(), buildings: [], log: [] };
  for (const ln of text.split("\n")) {
    const row = ln.trim();
    if (!row.startsWith("{")) continue;
    try {
      const ev = JSON.parse(row) as { t?: string; v?: unknown };
      if (ev.t === "name") events.name = ev.v;
      else if (ev.t === "line") events.line = ev.v;
      else if (ev.t === "lore") events.lore = ev.v;
      else if (ev.t === "theme") events.theme = ev.v;
      else if (ev.t === "building" && ev.v) (events.buildings as unknown[]).push(ev.v);
      else if (ev.t === "log" && typeof ev.v === "string") (events.log as string[]).push(ev.v);
    } catch {
      /* skip */
    }
  }
  return sanitizeRemix(events, wish);
}
