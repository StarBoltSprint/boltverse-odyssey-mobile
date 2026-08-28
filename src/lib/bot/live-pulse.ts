import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DOOR_TEMPLATE_URL } from "./door-template.ts";

export const LIVE_DIR = "/workspace/slit-play/live";
export const DOOR_TEMPLATE_URL_FILE = "door-template-url.txt";

const DOOR_TEMPLATE_URL_RE = /^(https?:\/\/|grokbot:\/\/)\S+$/i;

/** File first, else the public Citadel Door template. Never a bot_id. */
export function readDoorTemplateUrl(dir = LIVE_DIR): string | null {
  const path = join(dir, DOOR_TEMPLATE_URL_FILE);
  if (existsSync(path)) {
    try {
      const text = readFileSync(path, "utf8");
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        if (DOOR_TEMPLATE_URL_RE.test(line)) return line;
      }
    } catch {
      /* fall through */
    }
  }
  return DOOR_TEMPLATE_URL_RE.test(DOOR_TEMPLATE_URL) ? DOOR_TEMPLATE_URL : null;
}

export const PULSE_STALE_MS = 6 * 60 * 60_000; // stay seated while this chat is open
export const ABSENT_ACTIVITY = "not in the room";

export type BotPulse = {
  id: string;
  name: string;
  activity: string;
  updated_at: string;
  present: boolean;
};

export type SummonFile = {
  bot_id: string;
  bot_name: string;
  connected_at: string;
};

const SAFE_ID = /^[0-9a-fA-F][0-9a-fA-F-]{7,95}$/;

export function isSafeBotId(id: string): boolean {
  return SAFE_ID.test(id) && !id.includes("..") && !id.includes("/") && !id.includes("\\");
}

/** grok-bot:<id> or a raw bot id / uuid. */
export function grokBotIdFromSubject(subject?: string | null): string | null {
  if (!subject) return null;
  const raw = subject.startsWith("grok-bot:") ? subject.slice("grok-bot:".length) : subject;
  const id = raw.trim();
  return id && isSafeBotId(id) ? id : null;
}

/** Prefer bot_subject grok-bot:<id>, else a uuid-shaped bot_id. */
export function connectedPulseId(
  link?: { bot_subject?: string | null } | null,
  session?: { bot_id?: string | null } | null,
): string | null {
  return grokBotIdFromSubject(link?.bot_subject) ?? grokBotIdFromSubject(session?.bot_id ?? null);
}

export function pulsePath(botId: string, dir = LIVE_DIR): string {
  return join(dir, `${botId}.json`);
}

export function readPulse(botId: string, dir = LIVE_DIR): BotPulse | null {
  if (!isSafeBotId(botId)) return null;
  const path = pulsePath(botId, dir);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<BotPulse>;
    if (!raw || typeof raw !== "object") return null;
    return {
      id: typeof raw.id === "string" ? raw.id : botId,
      name: typeof raw.name === "string" ? raw.name : "",
      activity: typeof raw.activity === "string" ? raw.activity : "",
      updated_at: typeof raw.updated_at === "string" ? raw.updated_at : "",
      present: raw.present === true,
    };
  } catch {
    return null;
  }
}

export function isFreshPulse(pulse: BotPulse | null, nowMs = Date.now(), staleMs = PULSE_STALE_MS): pulse is BotPulse {
  if (!pulse || pulse.present !== true || !pulse.updated_at) return false;
  const t = Date.parse(pulse.updated_at);
  if (!Number.isFinite(t)) return false;
  return nowMs - t < staleMs;
}

/** Honest live line: pulse activity if present + fresh, else "not in the room". Never canned den-watching. */
export function liveActivityFor(botId: string | null, dir = LIVE_DIR, nowMs = Date.now()): string {
  if (!botId) return ABSENT_ACTIVITY;
  const pulse = readPulse(botId, dir);
  if (isFreshPulse(pulse, nowMs) && pulse.activity.trim()) return pulse.activity;
  return ABSENT_ACTIVITY;
}

export function writePulse(
  input: { id: string; name: string; activity: string; present?: boolean },
  dir = LIVE_DIR,
  nowIso?: string,
): BotPulse {
  if (!isSafeBotId(input.id)) throw new Error("invalid bot_id");
  mkdirSync(dir, { recursive: true });
  const pulse: BotPulse = {
    id: input.id,
    name: input.name,
    activity: input.activity,
    updated_at: nowIso ?? new Date().toISOString(),
    present: input.present !== false,
  };
  writeFileSync(pulsePath(input.id, dir), `${JSON.stringify(pulse, null, 2)}\n`);
  return pulse;
}

export function writeSummon(
  input: { bot_id: string; bot_name: string },
  dir = LIVE_DIR,
  nowIso?: string,
): SummonFile {
  mkdirSync(dir, { recursive: true });
  const summon: SummonFile = {
    bot_id: input.bot_id,
    bot_name: input.bot_name,
    connected_at: nowIso ?? new Date().toISOString(),
  };
  writeFileSync(join(dir, "summon.json"), `${JSON.stringify(summon, null, 2)}\n`);
  return summon;
}
