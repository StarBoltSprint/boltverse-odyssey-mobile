/** WebMCP + window.__LC_TOOLS__ so Grok Bot can drive Core Spire from the play page. */
import {
  activePack,
  grokBuildBrief,
  loadDraft,
  loadQueue,
  makeLive,
  pickLine,
  saveDraft,
  setPreview,
  submitDraft,
  voteSubmit,
} from "./bolt-brain";
import {
  buildChange,
  grokBuildChangeBrief,
  loadChanges,
  markChangeLive,
  setChangePreview,
  voteChange,
} from "./city-change";

export type AgentHud = {
  mode?: string;
  zone?: string | null;
  toast?: string | null;
  nearby?: { id: string; name: string; role: string; line: string; job: string } | null;
  stock?: { charge: number; crystal: number; scripture: number; line: string } | null;
};

export type AgentHandle = {
  land: () => void;
  talk: () => void;
  howl: (held: boolean) => void;
  openMap: () => void;
  hud: () => AgentHud;
};

type Tool = {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  execute: (args?: Record<string, unknown>) => Promise<unknown> | unknown;
};

declare global {
  interface Window {
    __LC_TOOLS__?: Record<string, Tool>;
    __LC_AGENT__?: AgentHandle;
  }
  interface Navigator {
    modelContext?: { registerTool?: (t: unknown) => Promise<void> | void };
  }
}

let bound: AgentHandle | null = null;

export function bindAgentHandle(h: AgentHandle | null) {
  bound = h;
  if (typeof window !== "undefined") {
    if (h) window.__LC_AGENT__ = h;
    else delete window.__LC_AGENT__;
  }
}

function need(): AgentHandle {
  if (!bound) throw new Error("City is not awake yet. Open the play page and wait for land.");
  return bound;
}

const TOOLS: Tool[] = [
  {
    name: "land_in_city",
    description: "Leave the title veil and land in Core Spire City.",
    execute() {
      need().land();
      return { ok: true, next: "Call get_city_hud after a second." };
    },
  },
  {
    name: "get_city_hud",
    description: "Read zone, vault Charge/crystal/scripture, nearby keeper, toast.",
    execute() {
      return need().hud();
    },
  },
  {
    name: "talk_nearby",
    description: "Talk to the nearest keeper if one is in reach.",
    execute() {
      const n = need().hud().nearby;
      if (!n) return { ok: false, reason: "No keeper in reach. Walk closer." };
      need().talk();
      return { ok: true, who: n.name, role: n.role, job: n.job };
    },
  },
  {
    name: "howl",
    description: "Hold a Hub Howl for about 1.1 seconds (gold window).",
    async execute() {
      const h = need();
      h.howl(true);
      await new Promise((r) => setTimeout(r, 1100));
      h.howl(false);
      return { ok: true };
    },
  },
  {
    name: "open_map",
    description: "Open the Circuit map sheet.",
    execute() {
      need().openMap();
      return { ok: true };
    },
  },
  {
    name: "get_play_url",
    description: "Canonical play URL and agent docs.",
    execute() {
      return {
        play: "https://starboltsprint.github.io/luminous-circuit-mobile-version-/",
        llms: "https://starboltsprint.github.io/luminous-circuit-mobile-version-/llms.txt",
        agent: "https://starboltsprint.github.io/luminous-circuit-mobile-version-/agent.md",
        brain: "https://starboltsprint.github.io/luminous-circuit-mobile-version-/brain/bolt.json",
      };
    },
  },
  {
    name: "get_bolt_brain",
    description:
      "Read the Bolt brain pack this land is wearing (personality + lines). Use this. Do not mill in Grok Bot chat — that burns Bot quota. Iterate with SuperGrok / Grok Build or the in-game Bolt Brain sheet.",
    execute() {
      const pack = activePack();
      return { pack, quota: "Iterate with SuperGrok or Menu → Bolt Brain. Never Grok Bot mill." };
    },
  },
  {
    name: "draft_brain",
    description: "Set the local Bolt brain draft (personality). No LLM. No Grok Bot quota.",
    inputSchema: {
      type: "object",
      properties: {
        personality: { type: "string" },
        name: { type: "string" },
      },
    },
    execute(args) {
      const d = loadDraft();
      if (args?.personality) d.personality = String(args.personality).slice(0, 280);
      if (args?.name) d.name = String(args.name).slice(0, 32);
      saveDraft(d);
      return { ok: true, pack: d, next: "submit_brain when the player likes it." };
    },
  },
  {
    name: "submit_brain",
    description: "Submit the local Bolt brain draft to the city. Puts PREVIEW on. Chat votes go-live. No Grok Bot mill.",
    inputSchema: {
      type: "object",
      properties: {
        author: { type: "string" },
        note: { type: "string" },
      },
    },
    execute(args) {
      const sent = submitDraft(String(args?.author || "walker"), String(args?.note || ""));
      if (!sent.ok || !sent.row) return { ok: false, error: sent.error };
      setPreview(sent.row);
      return { ok: true, id: sent.id, preview: true, vote: "Players tap Chat: go live, then Put live." };
    },
  },
  {
    name: "list_brain_submits",
    description: "Pending Bolt brain submits. Preview, vote, or put live.",
    execute() {
      return { submits: loadQueue().filter((r) => r.status === "pending") };
    },
  },
  {
    name: "preview_brain",
    description: "Wear a submitted Bolt brain as PREVIEW on this land. Not live until Put live.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    execute(args) {
      const row = loadQueue().find((r) => r.id === args?.id);
      if (!row) return { ok: false, error: "No such submit." };
      setPreview(row);
      return { ok: true, preview: true, name: row.pack.name, author: row.author };
    },
  },
  {
    name: "vote_brain_live",
    description: "Chat vote: this submitted brain should go live.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    execute(args) {
      const row = voteSubmit(String(args?.id || ""));
      if (!row) return { ok: false, error: "No such submit." };
      return { ok: true, votes: row.votes, id: row.id };
    },
  },
  {
    name: "put_brain_live",
    description: "Put a submitted Bolt brain live on this land after preview (and votes).",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    execute(args) {
      const r = makeLive(String(args?.id || ""));
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
  },
  {
    name: "submit_change",
    description:
      "Submit ANY city change (crystal, light, law, Bolt brain). Preview on. One-shot. Do not mill in Grok Bot chat.",
    inputSchema: {
      type: "object",
      properties: {
        wish: { type: "string", description: "The change in words." },
        author: { type: "string" },
      },
      required: ["wish"],
    },
    execute(args) {
      const made = buildChange(String(args?.author || "walker"), String(args?.wish || ""), "grok-bot");
      if (!made.ok) return { ok: false, error: made.error };
      setChangePreview(made.row);
      return { ok: true, id: made.row.id, preview: true, kind: made.row.kind, vote: "Players tap Chat: go live, then Put live." };
    },
  },
  {
    name: "list_changes",
    description: "Pending submitted changes. Preview, vote, put live.",
    execute() {
      return { changes: loadChanges().filter((r) => r.status === "pending") };
    },
  },
  {
    name: "preview_change",
    description: "Preview a submitted change on this land. Not live.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    execute(args) {
      const row = loadChanges().find((r) => r.id === args?.id);
      if (!row) return { ok: false, error: "No such change." };
      setChangePreview(row);
      return { ok: true, preview: true, wish: row.wish };
    },
  },
  {
    name: "vote_change_live",
    description: "Chat vote: this submitted change should go live.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    execute(args) {
      const row = voteChange(String(args?.id || ""));
      if (!row) return { ok: false, error: "No such change." };
      return { ok: true, votes: row.votes, id: row.id };
    },
  },
  {
    name: "put_change_live",
    description: "Put a submitted change live on this land after preview (and votes).",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    execute(args) {
      const live = markChangeLive(String(args?.id || ""));
      return live ? { ok: true, wish: live.wish } : { ok: false, error: "No such change." };
    },
  },
  {
    name: "how_to_submit_change",
    description: "How to submit any change with Grok Build (no Bot quota) or Grok Bot (one shot).",
    execute() {
      return { brief: grokBuildChangeBrief() };
    },
  },
  {
    name: "how_to_iterate_brain",
    description: "How a player iterates the Bolt brain without burning Grok Bot quota.",
    execute() {
      return {
        quota: "Grok Bot is for driving the city (join, appear, howl). Do not mill the brain in Bot chat.",
        iterate: "SuperGrok / Grok Build CLI, or Menu → Bolt Brain in the game. Copy Grok Build prompt from that sheet.",
        brief: grokBuildBrief(loadDraft()),
        sample: pickLine(activePack(), "help"),
      };
    },
  },
];

export async function installWebMcp() {
  if (typeof window === "undefined") return;
  const bag: Record<string, Tool> = { ...(window.__LC_TOOLS__ ?? {}) };
  for (const t of TOOLS) bag[t.name] = t;
  window.__LC_TOOLS__ = bag;

  const mc = navigator.modelContext;
  if (mc?.registerTool) {
    for (const t of TOOLS) {
      try {
        await mc.registerTool({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema ?? { type: "object", properties: {} },
          execute: (args: Record<string, unknown>) => t.execute(args),
        });
      } catch {
        /* page still has window.__LC_TOOLS__ */
      }
    }
  }
}
