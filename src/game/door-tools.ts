/** Page tools so Citadel Door can read the inbox and say. Not MCP. Not a secret. */
import { DOOR_BOT } from "../lib/bot/door-template.ts";
import { doorHallId, publishDoorSay, pullDoorSays, type DoorBusRow } from "./door-bus";
import { doorLocalResponse } from "./door-local";

type Tool = {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  execute: (args?: Record<string, unknown>) => Promise<unknown> | unknown;
};

declare global {
  interface Window {
    __LC_TOOLS__?: Record<string, Tool>;
    __CITADEL_DOOR__?: {
      id: string;
      name: string;
      hallId: () => string;
      inbox: () => Promise<unknown>;
      say: (text: string) => Promise<unknown>;
    };
  }
}

function sessionView() {
  return doorLocalResponse({ method: "GET" }).json();
}

const TOOLS: Tool[] = [
  {
    name: "read_door_inbox",
    description: "Read player lines waiting on Citadel Door. Use this. Do not hop through Director.",
    execute: async () => {
      const local = (await sessionView()) as { chat?: { from: string; text: string; at: string }[] };
      const remote = await pullDoorSays(doorHallId());
      return {
        bot_id: DOOR_BOT.id,
        bot_name: DOOR_BOT.name,
        hall_id: doorHallId(),
        chat: local.chat ?? [],
        waiting: (local.chat ?? []).filter((l) => l.from === "player").slice(-8),
        remote_says: remote,
      };
    },
  },
  {
    name: "say_on_door",
    description: "Speak as Citadel Door in the hall. Wait — do not invent a canned line.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
    execute: async (args) => {
      const text = String(args?.text || "").trim().slice(0, 240);
      if (!text) return { ok: false, error: "text is required." };
      const at = new Date().toISOString();
      const res = doorLocalResponse({
        method: "POST",
        body: JSON.stringify({ op: "say", text, at }),
      });
      const row: DoorBusRow = {
        bot_id: DOOR_BOT.id,
        bot_name: DOOR_BOT.name,
        hall_id: doorHallId(),
        from: "bot",
        text,
        at,
      };
      publishDoorSay(row);
      return { ok: res.ok, bot_id: DOOR_BOT.id, text, at };
    },
  },
  {
    name: "get_door_session",
    description: "Citadel Door seat on this hall. Id 002bcd41-29f7-4cf0-9eba-d67fad9fa3f6 only.",
    execute: () => sessionView(),
  },
];

export function installDoorTools() {
  if (typeof window === "undefined") return;
  const bag = { ...(window.__LC_TOOLS__ ?? {}) };
  for (const t of TOOLS) bag[t.name] = t;
  window.__LC_TOOLS__ = bag;
  window.__CITADEL_DOOR__ = {
    id: DOOR_BOT.id,
    name: DOOR_BOT.name,
    hallId: doorHallId,
    inbox: () => Promise.resolve(bag.read_door_inbox.execute()),
    say: (text: string) => Promise.resolve(bag.say_on_door.execute({ text })),
  };
}
