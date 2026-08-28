#!/usr/bin/env node
/**
 * Phone QA — Pixel 7 viewport against the live Odyssey play URL.
 * Prints JSON + writes screenshots. Exit 1 on fail.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const PLAY = process.env.PLAY_URL || "https://starboltsprint.github.io/boltverse-odyssey-mobile/";
const OUT = process.env.PHONE_QA_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "screenshots", "phone-qa");
const PIXEL = devices["Pixel 7"] ?? {
  viewport: { width: 412, height: 915 },
  userAgent:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  isMobile: true,
  hasTouch: true,
};

mkdirSync(OUT, { recursive: true });

const fails = [];
const shots = [];

function fail(reason) {
  fails.push(reason);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...PIXEL,
  locale: "en-US",
});
const page = await context.newPage();
page.setDefaultTimeout(25000);

try {
  await page.goto(PLAY, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const throne = join(OUT, "01-throne.png");
  await page.screenshot({ path: throne, fullPage: false });
  shots.push(throne);

  const talk = page.locator("[data-grok-bot-slit] .citadel-slit-go").first();
  if (!(await talk.count())) fail("No Talk button on the Door chip.");
  else {
    await talk.click();
    await page.waitForTimeout(900);
  }

  const hall = join(OUT, "02-door-hall.png");
  await page.screenshot({ path: hall, fullPage: false });
  shots.push(hall);

  const box = await page.locator("[data-grok-bot-slit]").first().boundingBox();
  const vp = page.viewportSize();
  if (!box || !vp) fail("Door slit not on screen.");
  else {
    const cover = (box.width * box.height) / (vp.width * vp.height);
    if (box.width < vp.width * 0.92) fail(`Door hall width ${Math.round(box.width)} < 92% of ${vp.width}.`);
    if (box.height < vp.height * 0.85) fail(`Door hall height ${Math.round(box.height)} < 85% of ${vp.height}.`);
    if (cover < 0.85) fail(`Door hall covers ${Math.round(cover * 100)}% of the phone. Need ≥ 85%.`);
  }

  const full = await page.locator('[data-grok-bot-slit][data-full="true"]').count();
  if (!full) fail("Slit is not data-full=true after Talk.");

  const stars = page.getByRole("button", { name: /^stars$/i });
  if ((await stars.count()) && (await stars.first().isVisible())) fail("Stars still visible under Door hall.");

  const title = page.getByRole("heading", { name: /citadel door/i });
  if (!(await title.count())) fail("Citadel Door title missing.");

  const importBtn = page.getByRole("button", { name: /import door bot/i });
  if (!(await importBtn.count())) fail("Import door bot missing.");

  const connect = page.getByRole("button", { name: /connect citadel door/i });
  if (await connect.count()) {
    await connect.click();
    await page.waitForTimeout(900);
    const chat = join(OUT, "03-chat.png");
    await page.screenshot({ path: chat, fullPage: false });
    shots.push(chat);
    const send = page.getByRole("button", { name: /^send$/i });
    if (!(await send.count())) fail("Chat composer Send missing after connect.");
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
}

const verdict = {
  ok: fails.length === 0,
  play: PLAY,
  device: "Pixel 7",
  fails,
  shots,
};

console.log(JSON.stringify(verdict, null, 2));
process.exit(fails.length ? 1 : 0);
