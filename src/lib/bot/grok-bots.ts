import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GrokBotChoice } from "./types.ts";

export const GROK_BOTS_DIR = "/home/box/agent-data/agents";

/** Only the shared door bot is offered in-game. Other Grok Bots stay in the app. */
export const DOOR_BOT_ID = "002bcd41-29f7-4cf0-9eba-d67fad9fa3f6";

/** Real Grok Bots from local agent profiles. Game picker: Citadel Door only. */
export function listGrokBots(root = GROK_BOTS_DIR): GrokBotChoice[] {
  if (!existsSync(root)) return [];
  const dir = join(root, DOOR_BOT_ID);
  const profilePath = join(dir, "profile.json");
  if (!existsSync(profilePath)) return [];
  if (existsSync(join(dir, "group.json"))) return [];
  try {
    const profile = JSON.parse(readFileSync(profilePath, "utf8")) as { name?: unknown };
    const name = typeof profile.name === "string" ? profile.name.trim() : "";
    if (!name) return [];
    return [{ id: DOOR_BOT_ID, name }];
  } catch {
    return [];
  }
}
