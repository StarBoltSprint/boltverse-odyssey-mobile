import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DOOR_BOT } from "../lib/bot/door-template.ts";
import {
  DOOR_BUS_TOPIC,
  doorWakeRow,
  isDoorBusRow,
  isStaticPagesHost,
  publishDoorSay,
  wakeCitadelDoor,
} from "./door-bus.ts";

const DIRECTOR = "8f3c3da7-07a3-4f42-9f98-70ae0ef07993";
const mem = new Map<string, string>();
const posts: { url: string; body: string }[] = [];

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

describe("static Pages Door wake", () => {
  beforeEach(() => {
    mem.clear();
    posts.length = 0;
    installStorage();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async (url: string | URL, init?: RequestInit) => {
        posts.push({ url: String(url), body: String(init?.body || "") });
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      },
    });
  });

  it("treats github.io as a static Pages host", () => {
    assert.equal(isStaticPagesHost("starboltsprint.github.io"), true);
    assert.equal(isStaticPagesHost("localhost"), false);
    assert.equal(isStaticPagesHost("127.0.0.1"), false);
  });

  it("wake row is Citadel Door only — never Director", () => {
    const row = doorWakeRow("hello", "2026-08-28T20:00:00.000Z", "hall_test");
    assert.equal(row.bot_id, DOOR_BOT.id);
    assert.equal(row.bot_name, "Citadel Door");
    assert.equal(row.from, "player");
    assert.equal(isDoorBusRow(row), true);
    assert.equal(
      isDoorBusRow({ ...row, bot_id: DIRECTOR }),
      false,
    );
    assert.ok(DOOR_BUS_TOPIC.includes(DOOR_BOT.id));
    assert.ok(!DOOR_BUS_TOPIC.includes(DIRECTOR));
  });

  it("wakeCitadelDoor POSTs the player line and ignores Director", async () => {
    wakeCitadelDoor(doorWakeRow("ping", "2026-08-28T20:00:00.000Z", "hall_test"));
    wakeCitadelDoor({
      bot_id: DIRECTOR,
      bot_name: "Boltverse Director",
      hall_id: "hall_test",
      from: "player",
      text: "nope",
      at: "2026-08-28T20:00:01.000Z",
    });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(posts.length, 1);
    const sent = JSON.parse(posts[0]!.body) as { bot_id: string; text: string };
    assert.equal(sent.bot_id, DOOR_BOT.id);
    assert.equal(sent.text, "ping");
    assert.ok(posts[0]!.url.includes(DOOR_BOT.id));
  });

  it("publishDoorSay posts a bot line and never a canned player echo", async () => {
    publishDoorSay({
      bot_id: DOOR_BOT.id,
      bot_name: "Citadel Door",
      hall_id: "hall_test",
      from: "bot",
      text: "Here.",
      at: "2026-08-28T20:00:02.000Z",
    });
    publishDoorSay({
      bot_id: DOOR_BOT.id,
      bot_name: "Citadel Door",
      hall_id: "hall_test",
      from: "player",
      text: "should not publish as say",
      at: "2026-08-28T20:00:03.000Z",
    });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(posts.length, 1);
    const sent = JSON.parse(posts[0]!.body) as { from: string; text: string };
    assert.equal(sent.from, "bot");
    assert.equal(sent.text, "Here.");
  });
});
