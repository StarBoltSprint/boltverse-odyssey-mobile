import { DOOR_BOT } from "../lib/bot/door-template.ts";

/** Public Citadel Door inbox topic. Derived from the public bot id. Not a wake URL. Not a secret. */
export const DOOR_BUS_TOPIC = `sbs-citadel-door-${DOOR_BOT.id}`;
export const DOOR_BUS_URL = `https://ntfy.sh/${DOOR_BUS_TOPIC}`;

/** GitHub Pages (and any github.io host) has no Grok Build /api/bot. */
export function isStaticPagesHost(hostname = typeof location === "undefined" ? "" : location.hostname): boolean {
  return /\.github\.io$/i.test(hostname);
}

const HALL_KEY = "odyssey-door-hall";
const SINCE_KEY = "odyssey-door-bus-since";
const DIRECTOR_ID = "8f3c3da7-07a3-4f42-9f98-70ae0ef07993";

export type DoorBusRow = {
  bot_id: string;
  bot_name: string;
  hall_id: string;
  from: "player" | "bot";
  text: string;
  at: string;
};

export function doorHallId(): string {
  try {
    const existing = localStorage.getItem(HALL_KEY);
    if (existing && existing.length >= 8) return existing;
    const id = `hall_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
    localStorage.setItem(HALL_KEY, id);
    return id;
  } catch {
    return "hall_anon";
  }
}

function readSince(): string | null {
  try {
    return localStorage.getItem(SINCE_KEY);
  } catch {
    return null;
  }
}

function writeSince(id: string) {
  try {
    localStorage.setItem(SINCE_KEY, id);
  } catch {
    /* private mode */
  }
}

export function isDoorBusRow(raw: unknown): raw is DoorBusRow {
  if (!raw || typeof raw !== "object") return false;
  const rec = raw as Record<string, unknown>;
  if (rec.bot_id !== DOOR_BOT.id) return false;
  if (rec.bot_id === DIRECTOR_ID) return false;
  if (rec.from !== "player" && rec.from !== "bot") return false;
  if (typeof rec.text !== "string" || !rec.text.trim()) return false;
  if (typeof rec.at !== "string" || !rec.at) return false;
  if (typeof rec.hall_id !== "string" || !rec.hall_id) return false;
  if (typeof rec.bot_name !== "string") return false;
  return rec.text.trim().length <= 240;
}

export function doorWakeRow(text: string, at: string, hallId = doorHallId()): DoorBusRow {
  return {
    bot_id: DOOR_BOT.id,
    bot_name: DOOR_BOT.name,
    hall_id: hallId,
    from: "player",
    text: text.trim().slice(0, 240),
    at,
  };
}

function postDoorBus(row: DoorBusRow): void {
  void fetch(DOOR_BUS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Title: "Citadel Door", Tags: "door" },
    body: JSON.stringify(row),
  }).catch(() => {
    /* best-effort; do not fail Send */
  });
}

/** Fire-and-forget per-bot wake. Citadel Door only. Never Director. Missing bus must not block Send. */
export function wakeCitadelDoor(row: DoorBusRow): void {
  if (!isDoorBusRow(row) || row.from !== "player") return;
  if (row.bot_id !== DOOR_BOT.id || row.bot_id === DIRECTOR_ID) return;
  postDoorBus(row);
}

/** Publish a real Citadel Door say onto the public inbox. Never Director. Never a canned line. */
export function publishDoorSay(row: DoorBusRow): void {
  if (!isDoorBusRow(row) || row.from !== "bot") return;
  if (row.bot_id !== DOOR_BOT.id || row.bot_id === DIRECTOR_ID) return;
  postDoorBus(row);
}

type NtfyEvent = {
  id?: string;
  event?: string;
  message?: string;
};

function parseNtfyLine(line: string): { id?: string; row: DoorBusRow | null } {
  try {
    const ev = JSON.parse(line) as NtfyEvent;
    if (ev.event && ev.event !== "message") return { id: ev.id, row: null };
    if (typeof ev.message !== "string") return { id: ev.id, row: null };
    try {
      const row = JSON.parse(ev.message) as unknown;
      return { id: ev.id, row: isDoorBusRow(row) ? row : null };
    } catch {
      return { id: ev.id, row: null };
    }
  } catch {
    return { row: null };
  }
}

/** Pull Citadel Door says for this hall. Never returns Director lines. */
export async function pullDoorSays(hallId = doorHallId()): Promise<DoorBusRow[]> {
  const since = readSince();
  const url = new URL(`${DOOR_BUS_URL}/json`);
  url.searchParams.set("poll", "1");
  if (since) url.searchParams.set("since", since);
  try {
    const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    if (!res.ok) return [];
    const text = await res.text();
    const out: DoorBusRow[] = [];
    let lastId = since;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parsed = parseNtfyLine(line);
      if (parsed.id) lastId = parsed.id;
      const row = parsed.row;
      if (!row || row.from !== "bot") continue;
      if (row.bot_id !== DOOR_BOT.id || row.bot_id === DIRECTOR_ID) continue;
      if (row.hall_id !== hallId) continue;
      out.push(row);
    }
    if (lastId && lastId !== since) writeSince(lastId);
    return out;
  } catch {
    return [];
  }
}
