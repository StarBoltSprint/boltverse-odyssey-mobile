import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DOOR_BOT } from "../lib/bot/door-template.ts";
import {
  DOOR_BUS_TOPIC,
  doorWakeRow,
  filterDoorRows,
  isDoorBusRow,
  isStaticPagesHost,
  pickSayHallId,
  publishDoorSay,
  pullDoorSays,
  pullDoorWakes,
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

  it("player wakes are readable from any hall; says stay on the player hall", () => {
    const playerA = doorWakeRow("hello from A", "2026-08-28T20:00:00.000Z", "hall_A");
    const playerB = doorWakeRow("hello from B", "2026-08-28T20:00:01.000Z", "hall_B");
    const sayA: ReturnType<typeof doorWakeRow> = {
      ...playerA,
      from: "bot",
      text: "Here.",
      at: "2026-08-28T20:00:02.000Z",
    };
    const director = { ...playerA, bot_id: DIRECTOR, bot_name: "Boltverse Director", from: "bot" as const };
    const rows = [playerA, playerB, sayA, director];
    const wakes = filterDoorRows(rows, { from: "player" });
    assert.equal(wakes.length, 2);
    assert.deepEqual(
      wakes.map((r) => r.hall_id),
      ["hall_A", "hall_B"],
    );
    const playerSees = filterDoorRows(rows, { from: "bot", hallId: "hall_A" });
    assert.equal(playerSees.length, 1);
    assert.equal(playerSees[0]?.text, "Here.");
    assert.equal(filterDoorRows(rows, { from: "bot", hallId: "hall_B" }).length, 0);
  });

  it("say targets the player's hall, not the Door cloud hall", () => {
    const waiting = [doorWakeRow("ping", "2026-08-28T20:00:00.000Z", "hall_player")];
    assert.equal(pickSayHallId("hall_explicit_1", waiting, "hall_cloud"), "hall_explicit_1");
    assert.equal(pickSayHallId("", waiting, "hall_cloud"), "hall_player");
    assert.equal(pickSayHallId(undefined, [], "hall_cloud"), "hall_cloud");
  });

  it("pullDoorWakes sees every player hall; pullDoorSays stays on one hall", async () => {
    const ndjson = [
      { id: "1", event: "message", message: JSON.stringify(doorWakeRow("from A", "2026-08-28T20:00:00.000Z", "hall_A")) },
      {
        id: "2",
        event: "message",
        message: JSON.stringify({
          bot_id: DOOR_BOT.id,
          bot_name: "Citadel Door",
          hall_id: "hall_A",
          from: "bot",
          text: "Here A.",
          at: "2026-08-28T20:00:02.000Z",
        }),
      },
      { id: "3", event: "message", message: JSON.stringify(doorWakeRow("from B", "2026-08-28T20:00:03.000Z", "hall_B")) },
    ]
      .map((row) => JSON.stringify(row))
      .join("\n");
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async () => new Response(ndjson, { status: 200, headers: { "content-type": "application/x-ndjson" } }),
    });
    const wakes = await pullDoorWakes();
    assert.equal(wakes.length, 2);
    assert.deepEqual(
      wakes.map((r) => r.hall_id),
      ["hall_A", "hall_B"],
    );
    const saysA = await pullDoorSays("hall_A");
    assert.equal(saysA.length, 1);
    assert.equal(saysA[0]?.text, "Here A.");
    const saysB = await pullDoorSays("hall_B");
    assert.equal(saysB.length, 0);
  });
});
