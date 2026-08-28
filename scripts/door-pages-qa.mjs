#!/usr/bin/env node
/**
 * Static land Door QA — desktop and phone viewports. No /api/bot.
 * Exit 1 on fail. Screenshots under /workspace/screenshots.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const PLAY = process.env.PLAY_URL || "http://127.0.0.1:8080/";
const OUT = "/workspace/screenshots/door-pages-qa";
const DOOR_ID = "002bcd41-29f7-4cf0-9eba-d67fad9fa3f6";
const DIRECTOR = "8f3c3da7-07a3-4f42-9f98-70ae0ef07993";
const TOPIC = `https://ntfy.sh/sbs-citadel-door-${DOOR_ID}`;

mkdirSync(OUT, { recursive: true });

const fails = [];
function fail(reason) {
  fails.push(reason);
}

const viewports = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "phone", width: 390, height: 844, isMobile: true, hasTouch: true },
];

const browser = await chromium.launch({ headless: true });

try {
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: Boolean(vp.isMobile),
      hasTouch: Boolean(vp.hasTouch),
    });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const wakes = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().startsWith(TOPIC)) wakes.push(req.postData() || "");
    });

    await page.goto(PLAY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: join(OUT, `${vp.name}-01-citadel.png`) });

    const talk = page.locator("[data-grok-bot-slit] .citadel-slit-go").first();
    if (!(await talk.count())) {
      fail(`${vp.name}: no Talk button`);
      await context.close();
      continue;
    }
    await talk.click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, `${vp.name}-02-pick.png`) });

    const title = page.getByRole("heading", { name: /citadel door/i });
    if (!(await title.count())) fail(`${vp.name}: Citadel Door title missing`);
    if (await page.getByRole("button", { name: /connect citadel door/i }).count() === 0) {
      fail(`${vp.name}: Connect Citadel Door missing`);
    }
    if (await page.getByRole("button", { name: /director/i }).count()) {
      fail(`${vp.name}: Director shown in picker`);
    }

    await page.getByRole("button", { name: /connect citadel door/i }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, `${vp.name}-03-hall.png`) });

    const input = page.locator("[data-grok-bot-slit] input[name=line]");
    if (!(await input.count())) {
      fail(`${vp.name}: chat composer missing after Connect`);
      await context.close();
      continue;
    }
    const line = `${vp.name} ping ${Date.now()}`;
    await input.fill(line);
    await page.getByRole("button", { name: /^send$/i }).click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(OUT, `${vp.name}-04-sent.png`) });

    const you = page.locator("[data-grok-bot-slit] [data-from=player] span");
    if (!(await you.filter({ hasText: line }).count())) fail(`${vp.name}: player line not in hall`);

    const botLines = await page.locator("[data-grok-bot-slit] [data-from=bot] span").allTextContents();
    const canned = botLines.filter((t) => t && t !== "…" && !t.includes("Import Citadel Door"));
    if (canned.length) fail(`${vp.name}: invented Door voice before a real say: ${canned.join(" | ")}`);

    await page.waitForTimeout(400);
    if (!wakes.length) fail(`${vp.name}: Send did not POST a Citadel Door wake`);
    else {
      const row = JSON.parse(wakes[0]);
      if (row.bot_id !== DOOR_ID) fail(`${vp.name}: wake bot_id ${row.bot_id}`);
      if (row.bot_id === DIRECTOR) fail(`${vp.name}: wake used Director`);
      if (row.from !== "player" || row.text !== line) fail(`${vp.name}: wake text mismatch`);
    }

    const hallId = await page.evaluate(() => localStorage.getItem("odyssey-door-hall"));
    if (!hallId) fail(`${vp.name}: no hall_id`);
    const at = new Date().toISOString();
    const reply = `${vp.name} door here`;
    const posted = await page.evaluate(
      async ({ topic, row }) => {
        const res = await fetch(topic, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(row) });
        return res.ok;
      },
      {
        topic: TOPIC,
        row: {
          bot_id: DOOR_ID,
          bot_name: "Citadel Door",
          hall_id: hallId,
          from: "bot",
          text: reply,
          at,
        },
      },
    );
    if (!posted) fail(`${vp.name}: could not publish Door say`);

    await page.waitForTimeout(2200);
    await page.screenshot({ path: join(OUT, `${vp.name}-05-reply.png`) });
    const heard = await page.locator("[data-grok-bot-slit] [data-from=bot] span").filter({ hasText: reply }).count();
    if (!heard) fail(`${vp.name}: real Door say did not appear in the hall`);

    await context.close();
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
}

const verdict = { ok: fails.length === 0, play: PLAY, fails, out: OUT };
console.log(JSON.stringify(verdict, null, 2));
process.exit(fails.length ? 1 : 0);
