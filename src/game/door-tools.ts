/** Page tools so Citadel Door can read the inbox and say. Not MCP. Not a secret. */
import { DOOR_BOT } from "../lib/bot/door-template.ts";
import { doorHallId, pickSayHallId, publishDoorSay, pullDoorWakes, type DoorBusRow } from "./door-bus";
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
      say: (text: string, hallId?: string) => Promise<unknown>;
    };
  }
  interface Navigator {
    modelContext?: { registerTool?: (t: unknown) => Promise<void> | void };
  }
}

function sessionView() {
  return doorLocalResponse({ method: "GET" }).json();
}

const TOOLS: Tool[] = [
  {
    name: "read_door_inbox",
    description:
      "Read player lines waiting on Citadel Door from every hall. Use waiting[].hall_id when you say. Do not hop through Director.",
    execute: async () => {
      const local = (await sessionView()) as { chat?: { from: string; text: string; at: string }[] };
      const waiting = await pullDoorWakes();
      return {
        bot_id: DOOR_BOT.id,
        bot_name: DOOR_BOT.name,
        hall_id: doorHallId(),
        chat: local.chat ?? [],
        waiting,
        reply_with: "say_on_door { text, hall_id } — hall_id from waiting[].hall_id",
      };
    },
  },
  {
    name: "say_on_door",
    description:
      "Speak as Citadel Door in the player's hall. Pass hall_id from read_door_inbox.waiting. Real say only.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" }, hall_id: { type: "string" } },
      required: ["text"],
    },
    execute: async (args) => {
      const text = String(args?.text || "").trim().slice(0, 240);
      if (!text) return { ok: false, error: "text is required." };
      const waiting = await pullDoorWakes();
      const hallId = pickSayHallId(args?.hall_id, waiting, doorHallId());
      const at = new Date().toISOString();
      const res = doorLocalResponse({
        method: "POST",
        body: JSON.stringify({ op: "say", text, at }),
      });
      const row: DoorBusRow = {
        bot_id: DOOR_BOT.id,
        bot_name: DOOR_BOT.name,
        hall_id: hallId,
        from: "bot",
        text,
        at,
      };
      publishDoorSay(row);
      return { ok: res.ok, bot_id: DOOR_BOT.id, hall_id: hallId, text, at };
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
    say: (text: string, hallId?: string) => Promise.resolve(bag.say_on_door.execute({ text, hall_id: hallId })),
  };
  const mc = navigator.modelContext;
  if (mc?.registerTool) {
    for (const t of TOOLS) {
      void Promise.resolve(
        mc.registerTool({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema ?? { type: "object", properties: {} },
          execute: (args: Record<string, unknown>) => t.execute(args),
        }),
      ).catch(() => {
        /* page still has window.__LC_TOOLS__ */
      });
    }
  }
}
