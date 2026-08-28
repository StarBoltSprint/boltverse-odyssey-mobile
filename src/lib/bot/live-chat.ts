import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isSafeBotId, LIVE_DIR } from "./live-pulse.ts";
import type { ChatLine } from "./types.ts";

export const CHAT_MAX = 240;

export function chatPath(botId: string, dir = LIVE_DIR): string {
  return join(dir, `chat-${botId}.json`);
}

export function inboxPath(dir = LIVE_DIR): string {
  return join(dir, "inbox.jsonl");
}

function isChatLine(raw: unknown): raw is ChatLine {
  if (!raw || typeof raw !== "object") return false;
  const rec = raw as Record<string, unknown>;
  return (
    (rec.from === "player" || rec.from === "bot") &&
    typeof rec.text === "string" &&
    typeof rec.at === "string"
  );
}

export function readChat(botId: string | null, dir = LIVE_DIR): ChatLine[] {
  if (!botId || !isSafeBotId(botId)) return [];
  const path = chatPath(botId, dir);
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(isChatLine);
  } catch {
    return [];
  }
}

export function appendChat(botId: string, line: ChatLine, dir = LIVE_DIR): ChatLine[] {
  if (!isSafeBotId(botId)) throw new Error("invalid bot_id");
  mkdirSync(dir, { recursive: true });
  const next = [...readChat(botId, dir), line];
  writeFileSync(chatPath(botId, dir), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

function firstNonCommentLine(path: string): string | null {
  if (!existsSync(path)) return null;
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const s = line.trim();
      if (s && !s.startsWith("#")) return s;
    }
  } catch {
    return null;
  }
  return null;
}

function botIdFromRow(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const id = (row as Record<string, unknown>).bot_id;
  return typeof id === "string" && isSafeBotId(id) ? id : null;
}

const DIRECTOR_ID = "8f3c3da7-07a3-4f42-9f98-70ae0ef07993";

/**
 * Per-bot wakes/<bot_id>.url, else Director id may use legacy wake-url.txt.
 * Director is not a hop for other bots — never fall through to Director's URL.
 * Never log the URL.
 */
function resolveWakeUrl(botId: string | null, dir: string): string | null {
  if (!botId || !isSafeBotId(botId)) return null;
  const perBot = firstNonCommentLine(join(dir, "wakes", `${botId}.url`));
  if (perBot) return perBot;
  if (botId === DIRECTOR_ID) return firstNonCommentLine(join(dir, "wake-url.txt"));
  return null;
}

/**
 * Per-bot wakes/<bot_id>.key, else Director id may use legacy wake-key.txt.
 * Never attach Director's key to another bot's POST. Never log the key.
 */
function resolveWakeHeaders(botId: string | null, dir: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const candidates: string[] = [];
  if (botId && isSafeBotId(botId)) candidates.push(join(dir, "wakes", `${botId}.key`));
  if (botId === DIRECTOR_ID) candidates.push(join(dir, "wake-key.txt"));
  for (const keyPath of candidates) {
    if (!existsSync(keyPath)) continue;
    try {
      const key = readFileSync(keyPath, "utf8").trim();
      if (key) {
        headers.Authorization = `Bearer ${key}`;
        headers["X-Webhook-Key"] = key;
        break;
      }
    } catch {
      /* never log the key */
    }
  }
  return headers;
}

function writeWakeMiss(botId: string | null, dir: string): void {
  try {
    mkdirSync(dir, { recursive: true });
    const id = botId && isSafeBotId(botId) ? botId : "unknown";
    writeFileSync(join(dir, "wake-miss.txt"), `${id} ${new Date().toISOString()}\n`);
  } catch {
    /* miss log only; no secrets */
  }
}

/** Fire-and-forget seated-bot wake. Missing/empty URL or POST failure must not block chat. */
export function wakeSeatedBot(row: unknown, dir = LIVE_DIR): void {
  const botId = botIdFromRow(row);
  const url = resolveWakeUrl(botId, dir);
  if (!url) {
    writeWakeMiss(botId, dir);
    return;
  }
  void fetch(url, { method: "POST", headers: resolveWakeHeaders(botId, dir), body: JSON.stringify(row) }).catch(() => {
    /* best-effort; do not fail Send */
  });
  try {
    writeFileSync(join(dir, "wake-stamp.txt"), `${Date.now()}\n`);
  } catch {
    /* watcher debounce only; never log wake url/key */
  }
}

/** @deprecated alias — same as wakeSeatedBot */
export function wakeDirector(row: unknown, dir = LIVE_DIR): void {
  wakeSeatedBot(row, dir);
}

export function appendInbox(
  row: { bot_id: string; bot_name: string; text: string; at: string },
  dir = LIVE_DIR,
): void {
  mkdirSync(dir, { recursive: true });
  appendFileSync(inboxPath(dir), `${JSON.stringify(row)}\n`);
  wakeSeatedBot(row, dir);
}

/** Trim + length-check. Empty / overlong / non-string → null. Does not invent a bot reply. */
export function cleanChatText(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > CHAT_MAX) return null;
  return trimmed;
}
