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
    headers: { "Content-Type": "application/json" },
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

export type DoorBusFilter = {
  from?: "player" | "bot";
  hallId?: string | null;
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

/** Keep Citadel Door rows only. Player wakes are not hall-bound; says are. */
export function filterDoorRows(rows: DoorBusRow[], filter: DoorBusFilter = {}): DoorBusRow[] {
  return rows.filter((row) => {
    if (row.bot_id !== DOOR_BOT.id || row.bot_id === DIRECTOR_ID) return false;
    if (filter.from && row.from !== filter.from) return false;
    if (filter.hallId && row.hall_id !== filter.hallId) return false;
    return true;
  });
}

/** Citadel Door answers the player's hall, not its own cloud-computer hall. */
export function pickSayHallId(explicit: unknown, waiting: DoorBusRow[], fallback: string): string {
  if (typeof explicit === "string" && explicit.trim().length >= 8) return explicit.trim();
  const last = [...waiting].reverse().find((row) => row.from === "player" && row.hall_id);
  if (last?.hall_id) return last.hall_id;
  return fallback;
}

async function pullDoorBus(filter: DoorBusFilter, opts: { since: "all" | "cursor"; rememberCursor: boolean }): Promise<DoorBusRow[]> {
  const cursor = opts.since === "cursor" ? readSince() : null;
  const url = new URL(`${DOOR_BUS_URL}/json`);
  url.searchParams.set("poll", "1");
  url.searchParams.set("since", cursor || "all");
  try {
    const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    if (!res.ok) return [];
    const text = await res.text();
    const rows: DoorBusRow[] = [];
    let lastId = cursor;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parsed = parseNtfyLine(line);
      if (parsed.id) lastId = parsed.id;
      if (parsed.row) rows.push(parsed.row);
    }
    if (opts.rememberCursor && lastId && lastId !== cursor) writeSince(lastId);
    return filterDoorRows(rows, filter);
  } catch {
    return [];
  }
}

/** Player lines on the public inbox — every hall. Citadel Door reads this from its own browser. */
export async function pullDoorWakes(): Promise<DoorBusRow[]> {
  return pullDoorBus({ from: "player" }, { since: "all", rememberCursor: false });
}

/** Pull Citadel Door says for this hall. Never returns Director lines. */
export async function pullDoorSays(hallId = doorHallId()): Promise<DoorBusRow[]> {
  return pullDoorBus({ from: "bot", hallId }, { since: "cursor", rememberCursor: true });
}
