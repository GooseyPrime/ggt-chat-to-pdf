// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chatgpt, claude, copilot, gemini } from "../extension/src/parsers";
import { buildPdf } from "../extension/src/pdf/render";
import { conversationFrom, fontLoader } from "./helpers/convo";
import type { Conversation } from "../extension/src/model";

const OUT = process.env.PDF_OUT;
const raw = (b: Uint8Array) => Buffer.from(b).toString("latin1");

async function render(conv: Conversation, extra: Partial<Parameters<typeof buildPdf>[1]> = {}) {
  return buildPdf(conv, { pageSize: "letter", toc: true, watermark: false, loadFont: fontLoader, compress: false, ...extra });
}

describe("PDF engine", () => {
  for (const site of [chatgpt, claude, gemini, copilot]) {
    it(`renders the ${site.name} fixture`, async () => {
      const conv = conversationFrom(site);
      const free = await render(conv, { watermark: true });
      const paid = await render(conv, { watermark: false });
      for (const r of [free, paid]) {
        expect(raw(r.bytes).startsWith("%PDF-1.")).toBe(true);
        expect(r.pages).toBeGreaterThanOrEqual(3); // title + toc + content
      }
      const freeText = raw(free.bytes);
      const paidText = raw(paid.bytes);
      expect(freeText).toContain("FREE PREVIEW");
      expect(paidText).not.toContain("FREE PREVIEW");
      expect(paidText).not.toContain("free preview");
      // never any literal backtick fences in the output
      expect(paidText).not.toContain("```");
      expect(paidText).toContain(conv.title.slice(0, 10));
      expect(paidText).toContain("Page 2 of");
      if (OUT) {
        fs.mkdirSync(OUT, { recursive: true });
        const compressed = await buildPdf(conv, { pageSize: "letter", toc: true, watermark: true, loadFont: fontLoader });
        fs.writeFileSync(path.join(OUT, `${site.id}-free.pdf`), compressed.bytes);
        const clean = await buildPdf(conv, { pageSize: "letter", toc: true, watermark: false, loadFont: fontLoader });
        fs.writeFileSync(path.join(OUT, `${site.id}-clean.pdf`), clean.bytes);
      }
    });
  }

  it("TOC can be switched off and A4 is honoured", async () => {
    const conv = conversationFrom(chatgpt);
    const withToc = await render(conv, { toc: true });
    const without = await render(conv, { toc: false, pageSize: "a4" });
    expect(without.pages).toBe(withToc.pages - 1);
    expect(raw(without.bytes)).toMatch(/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/);
    expect(raw(without.bytes)).not.toContain("(Contents)");
    expect(raw(withToc.bytes)).toContain("(Contents)");
  });

  it("long conversations paginate and keep every message (TOC spills to extra pages)", async () => {
    const base = conversationFrom(chatgpt);
    const messages = Array.from({ length: 140 }, (_, i) => ({ ...base.messages[i % 3], key: `n${i}` }));
    const r = await render({ ...base, messages });
    expect(r.pages).toBeGreaterThan(30);
    const t = raw(r.bytes);
    expect(t).toContain("message 140");
    expect(t).toMatch(/Page \d+ of \d+/);
  });

  it("reports characters it cannot draw instead of failing", async () => {
    const base = conversationFrom(chatgpt);
    base.messages[0].blocks = [{ t: "p", inl: [{ t: "text", text: "Hello 你好 世界 ✓ α" }] }];
    const r = await render(base);
    expect(r.warnings.join(" ")).toMatch(/can't be drawn/);
  });

  it("free preview note appears when truncated", async () => {
    const conv = conversationFrom(chatgpt);
    const r = await render(conv, { watermark: true, truncatedFrom: 57 });
    expect(raw(r.bytes)).toContain("of 57 messages");
  });
});
