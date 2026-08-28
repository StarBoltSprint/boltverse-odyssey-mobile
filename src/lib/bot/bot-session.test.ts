import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rejectApiKeyPayload, writeGuard, presenceGuard, mintArtifactId, forgerSlug } from "./rules.ts";
import { createMemoryStore, SEED_VESSELS } from "./store.ts";
import { createBotService, hashToken } from "./service.ts";
import { listGrokBots } from "./grok-bots.ts";
import { ABSENT_ACTIVITY, liveActivityFor, writePulse } from "./live-pulse.ts";
import { inboxPath, readChat } from "./live-chat.ts";

const DIRECTOR = {
  bot_id: "8f3c3da7-07a3-4f42-9f98-70ae0ef07993",
  bot_name: "Boltverse Director",
};

const LISTED = [{ id: DIRECTOR.bot_id, name: DIRECTOR.bot_name }];

function ids() {
  let n = 0;
  return {
    id: () => `id${++n}`,
    hash: () => `h${n + 1}`,
    token: () => `tok${++n}`,
  };
}

function pulseDir() {
  return mkdtempSync(join(tmpdir(), "slit-pulse-"));
}

function service(dir?: string) {
  return createBotService(createMemoryStore(SEED_VESSELS), {
    ids: ids(),
    listBots: () => LISTED,
    pulseDir: dir ?? pulseDir(),
  });
}

describe("connect never accepts an API key", () => {
  it("requires bot_id and bot_name", async () => {
    const bot = service();
    const missing = await bot.connect("dev-user", { op: "connect" });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.status, 400);
    const unknown = await bot.connect("dev-user", { bot_id: "missing", bot_name: "Ghost" });
    assert.equal(unknown.ok, false);
    if (!unknown.ok) assert.equal(unknown.status, 404);
  });

  it("rejects xai_api_key and api_key fields", async () => {
    const bot = service();
    const a = await bot.connect("dev-user", { xai_api_key: "sk-secret" });
    assert.equal(a.ok, false);
    if (!a.ok) assert.equal(a.status, 400);
    const b = await bot.connect("dev-user", { api_key: "sk-secret" });
    assert.equal(b.ok, false);
    assert.ok(rejectApiKeyPayload({ grok_api_key: "x" }));
    assert.equal(rejectApiKeyPayload({}), null);
    assert.equal(rejectApiKeyPayload({ display_name: "ok" }), null);
  });

  it("creates a stay session on the player's own den", async () => {
    const bot = service();
    const out = await bot.connect("dev-user", DIRECTOR);
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.ok(out.session);
    assert.equal(out.session?.mode, "stay");
    assert.equal(out.session?.owner_id, "dev-user");
    assert.equal(out.session?.bot_name, "Boltverse Director");
    assert.ok(out.bots.some((b) => b.id === DIRECTOR.bot_id && b.name === "Boltverse Director"));
    assert.ok(out.session?.current_artifact_id?.startsWith("artifact_dev-user_"));
    assert.equal(out.den?.artifact_id, out.session?.current_artifact_id);
    assert.ok(out.token);
    assert.equal(out.token && hashToken(out.token).length, 64);
    assert.ok(out.landables.some((l) => l.artifact_id === "core-heart" && !l.owned));
  });
});

describe("stay / travel presence and writes", () => {
  it("stay cannot presence on a foreign landable", async () => {
    const bot = service();
    await bot.connect("dev-user", DIRECTOR);
    const stay = await bot.setSession("dev-user", { mode: "stay", artifact_id: "core-heart" });
    assert.equal(stay.ok, false);
    if (!stay.ok) assert.equal(stay.status, 403);
  });

  it("travel can presence on a landable but cannot patch or seal it", async () => {
    const bot = service();
    await bot.connect("dev-user", DIRECTOR);
    const travel = await bot.setSession("dev-user", { mode: "travel", artifact_id: "core-heart" });
    assert.equal(travel.ok, true);
    if (!travel.ok) return;
    assert.equal(travel.session?.mode, "travel");
    assert.equal(travel.session?.current_artifact_id, "core-heart");

    const iterate = await bot.forge("dev-user", { op: "iterate", artifact_id: "core-heart" });
    assert.equal(iterate.ok, false);
    if (!iterate.ok) assert.equal(iterate.status, 403);

    const seal = await bot.forge("dev-user", { op: "seal", artifact_id: "core-heart" });
    assert.equal(seal.ok, false);
    if (!seal.ok) assert.equal(seal.status, 403);
  });

  it("another player's artifact write is 403", async () => {
    const store = createMemoryStore(SEED_VESSELS);
    const bot = createBotService(store, { ids: ids(), listBots: () => LISTED, pulseDir: pulseDir() });
    await bot.connect("alice", DIRECTOR);
    await store.insertVessel({
      vessel_id: "artifact_bob_ffff",
      owner_id: "bob",
      landable: true,
      status: "sealed",
      display_name: "Bob den",
    });
    const patch = await bot.forge("alice", { op: "iterate", artifact_id: "artifact_bob_ffff" });
    assert.equal(patch.ok, false);
    if (!patch.ok) assert.equal(patch.status, 403);
  });

  it("stay can write the den they are inside", async () => {
    const bot = service();
    const connected = await bot.connect("dev-user", DIRECTOR);
    assert.ok(connected.ok && connected.session);
    if (!connected.ok || !connected.session) return;
    const den = connected.session.current_artifact_id!;
    const iterate = await bot.forge("dev-user", { op: "iterate", artifact_id: den });
    assert.equal(iterate.ok, true);
  });

  it("new claims must propose before seal", async () => {
    const bot = service();
    await bot.connect("dev-user", DIRECTOR);
    await bot.setSession("dev-user", { mode: "travel", artifact_id: "core-heart" });
    const id = mintArtifactId(forgerSlug("dev-user"), "claim1");
    const sealFirst = await bot.forge("dev-user", { op: "seal", artifact_id: id });
    assert.equal(sealFirst.ok, false);
    const proposed = await bot.forge("dev-user", { op: "propose", artifact_id: id, wish: "A quiet den" });
    assert.equal(proposed.ok, true);
    if (!proposed.ok) return;
    assert.equal(proposed.status, "proposed");
    assert.equal(proposed.owner_id, "dev-user");
    const sealed = await bot.forge("dev-user", { op: "seal", artifact_id: id });
    assert.equal(sealed.ok, true);
    if (!sealed.ok) return;
    assert.equal(sealed.status, "sealed");
  });
});

describe("revoke invalidates the session", () => {
  it("GET session is empty after disconnect", async () => {
    const bot = service();
    await bot.connect("dev-user", DIRECTOR);
    const cut = await bot.disconnect("dev-user");
    assert.equal(cut.ok, true);
    const after = await bot.session("dev-user");
    assert.equal(after.ok, true);
    if (!after.ok) return;
    assert.equal(after.session, null);
    const write = await bot.forge("dev-user", { op: "iterate", artifact_id: "core-heart" });
    assert.equal(write.ok, false);
    if (!write.ok) assert.equal(write.status, 401);
  });
});

describe("listGrokBots", () => {
  it("reads real profiles and skips groups and unused names", () => {
    const bots = listGrokBots();
    assert.ok(bots.some((b) => b.id === DIRECTOR.bot_id && b.name === "Boltverse Director"));
    assert.ok(bots.every((b) => b.name !== "New Bot"));
    assert.ok(bots.every((b) => b.name.toLowerCase() !== "money"));
    assert.ok(bots.every((b) => b.name.toLowerCase() !== "live smoothness"));
  });
});

describe("ownership helpers", () => {
  it("seed vessels without owner_id are not writable", () => {
    const seed = SEED_VESSELS[0];
    const gate = writeGuard("travel", seed, "dev-user", "core-heart");
    assert.equal(gate.ok, false);
    const stay = presenceGuard("stay", seed, "dev-user");
    assert.equal(stay.ok, false);
    const travel = presenceGuard("travel", seed, "dev-user");
    assert.equal(travel.ok, true);
  });

  it("mints Decree #601 ids", () => {
    assert.equal(mintArtifactId("dev-user", "ab12"), "artifact_dev-user_ab12");
    assert.equal(forgerSlug("Dev User!"), "dev-user");
  });
});

describe("live pulse for any connected bot", () => {
  it("connect without a pulse is honest, not a canned den line", async () => {
    const dir = pulseDir();
    const bot = service(dir);
    const out = await bot.connect("dev-user", DIRECTOR);
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.session?.bot_name, "Boltverse Director");
    assert.equal(out.session?.activity, ABSENT_ACTIVITY);
    assert.equal(out.session?.activity.includes("watching their den"), false);
    const summon = JSON.parse(readFileSync(join(dir, "summon.json"), "utf8")) as {
      bot_id: string;
      bot_name: string;
      connected_at: string;
    };
    assert.equal(summon.bot_id, DIRECTOR.bot_id);
    assert.equal(summon.bot_name, "Boltverse Director");
    assert.ok(summon.connected_at);
  });

  it("fresh pulse overrides session activity for that bot id", async () => {
    const dir = pulseDir();
    const bot = service(dir);
    await bot.connect("dev-user", DIRECTOR);
    const pulsed = await bot.pulse("dev-user", { op: "pulse", bot_id: DIRECTOR.bot_id, activity: "in this chat with you" });
    assert.equal(pulsed.ok, true);
    if (!pulsed.ok) return;
    assert.equal(pulsed.session?.activity, "in this chat with you");
    assert.equal(pulsed.pulse.present, true);
    assert.equal(pulsed.pulse.id, DIRECTOR.bot_id);
    const again = await bot.session("dev-user");
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.session?.bot_name, "Boltverse Director");
    assert.equal(again.session?.activity, "in this chat with you");
  });

  it("stale pulse is not in the room", async () => {
    const dir = pulseDir();
    writePulse(
      { id: DIRECTOR.bot_id, name: "Boltverse Director", activity: "in this chat with you", present: true },
      dir,
      new Date(Date.now() - 120_000).toISOString(),
    );
    const bot = service(dir);
    await bot.connect("dev-user", DIRECTOR);
    const out = await bot.session("dev-user");
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.session?.activity, ABSENT_ACTIVITY);
    assert.equal(liveActivityFor(DIRECTOR.bot_id, dir), ABSENT_ACTIVITY);
  });

  it("another listed bot can pulse its own file", async () => {
    const other = { bot_id: "b436b8a3-a4ed-4067-8d20-46b527b5c2a3", bot_name: "Bolt Brain" };
    const listed = [LISTED[0], { id: other.bot_id, name: other.bot_name }];
    const dir = pulseDir();
    const bot = createBotService(createMemoryStore(SEED_VESSELS), {
      ids: ids(),
      listBots: () => listed,
      pulseDir: dir,
    });
    await bot.connect("dev-user", other);
    const missing = await bot.session("dev-user");
    assert.equal(missing.ok && missing.session?.activity, ABSENT_ACTIVITY);
    const pulsed = await bot.pulse("dev-user", { bot_id: other.bot_id, activity: "forging a kiln" });
    assert.equal(pulsed.ok, true);
    if (!pulsed.ok) return;
    assert.equal(pulsed.session?.bot_name, "Bolt Brain");
    assert.equal(pulsed.session?.activity, "forging a kiln");
    const file = JSON.parse(readFileSync(join(dir, `${other.bot_id}.json`), "utf8")) as { activity: string };
    assert.equal(file.activity, "forging a kiln");
  });
});

describe("in-game chat with the connected bot", () => {
  it("stores a player line on the grok bot uuid, not the lnk_ id", async () => {
    const dir = pulseDir();
    const bot = service(dir);
    const connected = await bot.connect("dev-user", DIRECTOR);
    assert.equal(connected.ok, true);
    if (!connected.ok) return;
    assert.ok(connected.session?.bot_id.startsWith("lnk_"));
    const out = await bot.chat("dev-user", { op: "chat", text: "hey director" });
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.chat?.length, 1);
    assert.equal(out.chat?.[0]?.from, "player");
    assert.equal(out.chat?.[0]?.text, "hey director");
    assert.ok(out.chat?.[0]?.at);
    const again = await bot.session("dev-user");
    assert.equal(again.ok && again.chat?.[0]?.text, "hey director");
    const stored = readChat(DIRECTOR.bot_id, dir);
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.from, "player");
    assert.equal(existsSync(join(dir, `chat-${connected.session?.bot_id}.json`)), false);
    const inbox = readFileSync(inboxPath(dir), "utf8").trim().split("\n").map((line) => JSON.parse(line) as {
      bot_id: string;
      bot_name: string;
      text: string;
      at: string;
    });
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0]?.bot_id, DIRECTOR.bot_id);
    assert.equal(inbox[0]?.bot_name, "Boltverse Director");
    assert.equal(inbox[0]?.text, "hey director");
  });

  it("rejects empty, overlong, and API-key chat", async () => {
    const bot = service();
    await bot.connect("dev-user", DIRECTOR);
    const empty = await bot.chat("dev-user", { op: "chat", text: "   " });
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.status, 400);
    const long = await bot.chat("dev-user", { op: "chat", text: "x".repeat(241) });
    assert.equal(long.ok, false);
    const keyed = await bot.chat("dev-user", { op: "chat", text: "hi", api_key: "sk-secret" });
    assert.equal(keyed.ok, false);
    if (!keyed.ok) assert.equal(keyed.status, 400);
  });

  it("say appends a bot line and never auto-replies to chat", async () => {
    const dir = pulseDir();
    const bot = service(dir);
    await bot.connect("dev-user", DIRECTOR);
    const player = await bot.chat("dev-user", { text: "are you there" });
    assert.equal(player.ok, true);
    if (!player.ok) return;
    assert.equal(player.chat?.length, 1);
    assert.equal(player.chat?.every((l) => l.from === "player"), true);
    const spoken = await bot.say("dev-user", { text: "yes, at the slit" });
    assert.equal(spoken.ok, true);
    if (!spoken.ok) return;
    assert.equal(spoken.chat?.length, 2);
    assert.equal(spoken.chat?.[1]?.from, "bot");
    assert.equal(spoken.chat?.[1]?.text, "yes, at the slit");
    const stored = readChat(DIRECTOR.bot_id, dir);
    assert.equal(stored.map((l) => l.from).join(","), "player,bot");
  });

  it("disconnect keeps the chat file", async () => {
    const dir = pulseDir();
    const bot = service(dir);
    await bot.connect("dev-user", DIRECTOR);
    await bot.chat("dev-user", { text: "stay in the log" });
    const cut = await bot.disconnect("dev-user");
    assert.equal(cut.ok, true);
    const after = await bot.session("dev-user");
    assert.equal(after.ok && after.session, null);
    const stored = readChat(DIRECTOR.bot_id, dir);
    assert.equal(stored[0]?.text, "stay in the log");
  });
});
