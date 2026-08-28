import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DOOR_BOT } from "../lib/bot/door-template.ts";
import { doorLocalResponse, withDoorBots } from "./door-local.ts";

const DIRECTOR = { id: "8f3c3da7-07a3-4f42-9f98-70ae0ef07993", name: "Boltverse Director" };

const mem = new Map<string, string>();

function installStorage() {
  const store: Storage = {
    get length() {
      return mem.size;
    },
    clear() {
      mem.clear();
    },
    getItem(key: string) {
      return mem.has(key) ? mem.get(key)! : null;
    },
    key(index: number) {
      return [...mem.keys()][index] ?? null;
    },
    removeItem(key: string) {
      mem.delete(key);
    },
    setItem(key: string, value: string) {
      mem.set(key, value);
    },
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: store });
}

async function body(res: Response) {
  return (await res.json()) as {
    session?: { bot_id: string; bot_name: string; activity: string } | null;
    bots?: { id: string; name: string }[];
    chat?: { from: string; text: string }[];
    error?: string;
  };
}

function post(op: string, extra: Record<string, unknown> = {}) {
  return doorLocalResponse({
    method: "POST",
    body: JSON.stringify({ op, ...extra }),
  });
}

describe("door-local seats Citadel Door only", () => {
  beforeEach(() => {
    mem.clear();
    installStorage();
  });

  it("GET always offers Citadel Door and the public template", async () => {
    const out = await body(doorLocalResponse({ method: "GET" }));
    assert.equal(out.session, null);
    assert.ok(out.bots?.some((b) => b.id === DOOR_BOT.id && b.name === "Citadel Door"));
    assert.ok(!out.bots?.some((b) => b.id === DIRECTOR.id));
  });

  it("connect seats Citadel Door and rejects Director", async () => {
    const bad = await body(post("connect", { bot_id: DIRECTOR.id, bot_name: DIRECTOR.name }));
    assert.equal(bad.error, "Unknown Grok Bot.");
    const ok = await body(post("connect", { bot_id: DOOR_BOT.id, bot_name: "Citadel Door" }));
    assert.equal(ok.session?.bot_id, DOOR_BOT.id);
    assert.equal(ok.session?.bot_name, "Citadel Door");
    assert.equal(ok.session?.activity, "waiting for Citadel Door");
  });

  it("chat writes the player line and never invents a Door voice", async () => {
    await post("connect", { bot_id: DOOR_BOT.id, bot_name: "Citadel Door" });
    const out = await body(post("chat", { text: "hello door" }));
    assert.equal(out.chat?.length, 1);
    assert.equal(out.chat?.[0]?.from, "player");
    assert.equal(out.chat?.[0]?.text, "hello door");
    assert.equal(out.session?.activity, "waiting for Citadel Door");
    assert.ok(out.chat?.every((l) => l.from !== "bot"));
  });

  it("say records the real bot line once", async () => {
    await post("connect", { bot_id: DOOR_BOT.id, bot_name: "Citadel Door" });
    await post("chat", { text: "are you there" });
    const spoken = await body(post("say", { text: "Here. On the door.", at: "2026-08-28T20:00:00.000Z" }));
    assert.equal(spoken.chat?.length, 2);
    assert.equal(spoken.chat?.[1]?.from, "bot");
    assert.equal(spoken.chat?.[1]?.text, "Here. On the door.");
    const again = await body(post("say", { text: "Here. On the door.", at: "2026-08-28T20:00:00.000Z" }));
    assert.equal(again.chat?.length, 2);
  });

  it("withDoorBots never drops Citadel Door", () => {
    const next = withDoorBots({
      session: null,
      den: null,
      landables: [],
      bots: [{ id: DIRECTOR.id, name: DIRECTOR.name }],
      door_template_url: null,
    });
    assert.equal(next.bots[0]?.id, DOOR_BOT.id);
    assert.ok(next.bots.some((b) => b.id === DIRECTOR.id));
  });
});
