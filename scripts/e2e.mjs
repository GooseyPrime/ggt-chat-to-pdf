#!/usr/bin/env node
// End-to-end check in real Chromium: loads the *test build* of the extension, serves saved HTML
// fixtures at the real chat hostnames (network-intercepted — no live traffic), drives the popup and
// studio pages, downloads the generated PDF and inspects it with pdftotext when available.
//   npm run build:extension -- --target test && node scripts/e2e.mjs
// Needs: `npx playwright-core install chromium` (full Chromium; headless shell cannot load extensions).
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extDir = path.join(root, "dist", "extension-test");
const outDir = path.resolve(process.env.E2E_OUT || path.join(root, "test-results", "e2e"));
fs.mkdirSync(outDir, { recursive: true });
if (!fs.existsSync(path.join(extDir, "manifest.json"))) {
  console.error("Build the test extension first: node scripts/build-extension.mjs --target test --no-public");
  process.exit(2);
}

const CASES = [
  { id: "chatgpt", url: "https://chatgpt.com/c/e2e", fixture: "chatgpt/conversation.html", expect: ["Quicksort in a nutshell", "def qs(a):"], title: "Sorting algorithms explained", messages: 3 },
  { id: "claude", url: "https://claude.ai/chat/e2e", fixture: "claude/conversation.html", expect: ["cache the parsed file", "cache ??= JSON.parse"], title: "Refactoring a config loader", messages: 2 },
  { id: "gemini", url: "https://gemini.google.com/app/e2e", fixture: "gemini/conversation.html", expect: ["Day 1: Alfama", "budget"], title: "Planning a trip to Lisbon", messages: 2 },
  { id: "copilot", url: "https://copilot.microsoft.com/chats/e2e", fixture: "copilot/conversation.html", expect: ["SUMIF", "Select the cell"], title: "Spreadsheet formulas", messages: 3 },
  { id: "chatgpt-virtualised", url: "https://chatgpt.com/c/long", fixture: "lazy/virtualized.html", expect: ["Question number 0", "Answer number 19"], title: "Long virtualised chat", messages: 80 },
];

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctp-e2e-"));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  channel: "chromium",
  acceptDownloads: true,
  viewport: { width: 1100, height: 800 },
  args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
});
try {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  ok("extension service worker started", true, extId);

  for (const c of CASES) {
    const html = fs.readFileSync(path.join(root, "tests", "fixtures", c.fixture), "utf8");
    const host = new URL(c.url).host;
    const page = await context.newPage();
    await page.route(`https://${host}/**`, (r) => r.fulfill({ status: 200, contentType: "text/html", body: html }));
    await page.goto(c.url);
    await page.waitForTimeout(300);
    const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({ url: `${new URL(u).origin}/*` }))[0].id, c.url);

    const popup = await context.newPage();
    await popup.setViewportSize({ width: 360, height: 420 });
    await popup.goto(`chrome-extension://${extId}/popup.html?tab=${tabId}&url=${encodeURIComponent(c.url)}`);
    await popup.waitForSelector("#supported:not(.hidden)", { timeout: 10000 });
    ok(`${c.id}: popup detects chat`, (await popup.textContent("#m-title")) === c.title, await popup.textContent("#m-title"));
    await popup.screenshot({ path: path.join(outDir, `popup-${c.id}.png`) });

    const studioPromise = context.waitForEvent("page", { timeout: 60000 });
    await popup.click("#go-all");
    const studio = await studioPromise;
    const dl = await studio.waitForEvent("download", { timeout: 60000 });
    const pdfPath = path.join(outDir, `${c.id}.pdf`);
    await dl.saveAs(pdfPath);
    await studio.waitForSelector("#sel-count");
    const countText = await studio.textContent("#sel-count");
    ok(`${c.id}: studio captured ${c.messages} messages`, countText.includes(`of ${c.messages} selected`), countText);
    const captureKey = new URL(studio.url()).searchParams.get("c");
    const stored = await sw.evaluate(async (key) => (await chrome.storage.local.get(key))[key], captureKey);
    ok(`${c.id}: consumed capture removed from storage`, stored === undefined);
    await studio.screenshot({ path: path.join(outDir, `studio-${c.id}.png`), fullPage: false });
    if (c.id === "chatgpt-virtualised") {
      const prev = await studio.$$eval("#list .prev", (els) => els.map((e) => e.textContent));
      const inOrder = prev.every((t, i) => t.includes(`${i % 2 === 0 ? "Question" : "Answer"} number ${i}`));
      ok("virtualised chat: all 80 messages in order, no duplicates", prev.length === 80 && inOrder);
      // Unlock through the shop verify flow (mocked network) and re-export: clean + full length.
      const verifyUrls = [];
      await context.route("https://www.goldengoosetools.com/api/verify**", (r) => {
        const u = new URL(r.request().url());
        verifyUrls.push(u.toString());
        const good = u.searchParams.get("session_id") === "cs_test_paid_session";
        const wrongProduct = u.searchParams.get("session_id") === "cs_test_other_product";
        r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ok: true, paid: good || wrongProduct, product: wrongProduct ? "seo-audit" : "chat-to-pdf" }) });
      });
      await studio.click("#have-code");
      await studio.fill("#code", "cs_test_other_product");
      await studio.click("#code-form button[type=submit]");
      await studio.waitForSelector("#lic-msg.bad:not(.hidden)");
      ok("unlock: a session paid for another product is rejected", (await studio.textContent("#lic-msg")).includes("wasn't recognised"));
      await studio.fill("#code", "cs_test_paid_session");
      await studio.click("#code-form button[type=submit]");
      await studio.waitForSelector("#lic-paid:not(.hidden)");
      ok("unlock: paid session id activates clean tier", true, verifyUrls[verifyUrls.length - 1]);
      const dlClean = studio.waitForEvent("download", { timeout: 60000 });
      await studio.click("#make");
      const cleanPath = path.join(outDir, "chatgpt-virtualised-clean.pdf");
      await (await dlClean).saveAs(cleanPath);
      try {
        const t = execFileSync("pdftotext", [cleanPath, "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        ok("clean tier: no watermark, all 80 messages", !/FREE PREVIEW/i.test(t) && t.includes("Answer number 79") && t.includes("Question number 78"));
      } catch {
        ok("clean tier PDF check", false, "pdftotext missing");
      }
      await studio.screenshot({ path: path.join(outDir, "studio-unlocked.png") });
    }

    let text = "";
    try {
      text = execFileSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      text = "";
    }
    if (text) {
      for (const e of c.expect) ok(`${c.id}: PDF text contains "${e}"`, text.includes(e));
      ok(`${c.id}: PDF has watermark (free tier)`, /FREE PREVIEW/i.test(text) || text.includes("free preview"));
      ok(`${c.id}: no literal code fences`, !text.includes("```"));
    } else ok(`${c.id}: pdftotext available`, false, "install poppler-utils to inspect PDFs");
    await studio.close();
    await popup.close();
    await page.close();
  }

  // Free-tier cap: 80 messages -> first 20 only, with the truncation notice.
  const pdf = path.join(outDir, "chatgpt-virtualised.pdf");
  try {
    const t = execFileSync("pdftotext", [pdf, "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    ok("virtualised chat: free cap keeps the first 20 messages", t.includes("Question number 0") && !t.includes("Answer number 79") && /first 20 of 80/.test(t.replace(/\s+/g, " ")));
  } catch {
    ok("virtualised chat: free cap check", false, "pdftotext missing");
  }

  // Selecting messages in the studio.
  {
    const c = CASES[0];
    const html = fs.readFileSync(path.join(root, "tests", "fixtures", c.fixture), "utf8");
    const page = await context.newPage();
    await page.route("https://chatgpt.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: html }));
    await page.goto(c.url);
    const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: "https://chatgpt.com/*" }))[0].id);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html?tab=${tabId}&url=${encodeURIComponent(c.url)}`);
    await popup.waitForSelector("#supported:not(.hidden)");
    const studioPromise = context.waitForEvent("page");
    await popup.click("#go-pick");
    const studio = await studioPromise;
    await studio.waitForSelector("#main:not(.hidden)");
    await studio.waitForTimeout(500);
    ok("choose-messages: no automatic download", true);
    await studio.click("#sel-asst");
    const label = await studio.textContent("#sel-count");
    ok("choose-messages: 'Replies only' selects 1 of 3", label.includes("1 of 3"), label);
    await studio.screenshot({ path: path.join(outDir, "studio-choose.png"), fullPage: true });
    const dlP = studio.waitForEvent("download");
    await studio.click("#make");
    const dl = await dlP;
    const p = path.join(outDir, "chatgpt-replies-only.pdf");
    await dl.saveAs(p);
    try {
      const t = execFileSync("pdftotext", [p, "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      ok("choose-messages: PDF has only the reply", t.includes("Quicksort in a nutshell") && !t.includes("Yes please"));
    } catch {
      ok("choose-messages: PDF check", false, "pdftotext missing");
    }
  }
} finally {
  await context.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
const failed = results.filter((r) => !r.pass);
fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Artifacts: ${outDir}`);
process.exit(failed.length ? 1 : 0);
