// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { chatgpt, claude, copilot, gemini } from "../extension/src/parsers";
import { FontBook } from "../extension/src/pdf/fonts";
import { Layout, PAGE_SIZES } from "../extension/src/pdf/layout";
import { buildPdf } from "../extension/src/pdf/render";
import { conversationFrom, fontLoader } from "./helpers/convo";
import type { Block, Conversation, Inline } from "../extension/src/model";

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

  for (const pageSize of ["letter", "a4"] as const) {
    for (const header of ["normal", "multiple", "none", "oversized"] as const) {
      it(`splits oversized table rows within ${pageSize} pages with ${header} headers`, () => {
        const size = PAGE_SIZES[pageSize];
        const g = { ...size, left: 58, right: 58, top: 66, bottom: 62 };
        const doc = new jsPDF({ unit: "pt", format: [size.w, size.h] });
        const layout = new Layout(new FontBook(doc, false), g);
        const cell = (prefix: string, count: number): Inline[] =>
          Array.from({ length: count }, (_, i): Inline[] => [
            ...(i ? [{ t: "br" } as const] : []),
            { t: "text", text: `${prefix}${i}` },
          ]).flat();
        const table: Extract<Block, { t: "table" }> = {
          t: "table",
          align: ["right", "center"],
          rows: [
            ...(header === "none" ? [] : [{
              header: true,
              cells: [cell("Heading", header === "oversized" ? 95 : 1), cell("Other", 1)],
            }]),
            ...(header === "multiple" ? [{
              header: true,
              cells: [cell("Subheading", 1), cell("Detail", 1)],
            }] : []),
            { header: false, cells: [cell("Left", 150), cell("Right", 83)] },
            { header: false, cells: [cell("Tail", 1), []] },
          ],
        };
        layout.newPage();
        layout.y = size.h - g.bottom - 45;
        layout.blocks([table], { x: g.left, w: layout.contentW });

        const pages = layout.pages.filter((page) => page.fg.some((op) => op.k === "text"));
        expect(pages.length).toBeGreaterThanOrEqual(3);
        const texts = pages.flatMap((page) => page.fg.flatMap((op) => op.k === "text" ? [op.s] : []));
        for (const [prefix, count] of [["Left", 150], ["Right", 83], ["Tail", 1]] as const) {
          expect(texts.filter((text) => text.startsWith(prefix))).toEqual(
            Array.from({ length: count }, (_, i) => `${prefix}${i}`),
          );
        }
        if (header === "oversized") {
          expect(texts.filter((text) => text.startsWith("Heading"))).toEqual(
            Array.from({ length: 95 }, (_, i) => `Heading${i}`),
          );
          expect(texts.filter((text) => text === "Other0")).toHaveLength(1);
        }
        for (const page of pages) {
          if (header === "normal" || header === "multiple") {
            expect(page.fg.filter((op) => op.k === "text" && op.s === "Heading0")).toHaveLength(1);
            expect(page.fg.filter((op) => op.k === "text" && op.s === "Other0")).toHaveLength(1);
          }
          if (header === "multiple") {
            expect(page.fg.filter((op) => op.k === "text" && op.s === "Subheading0")).toHaveLength(1);
            expect(page.fg.filter((op) => op.k === "text" && op.s === "Detail0")).toHaveLength(1);
          }
          for (const op of [...page.fg, ...page.bg.map((bg) => bg.op)]) {
            if (op.k === "text") {
              expect(op.y).toBeGreaterThanOrEqual(g.top);
              expect(op.y + op.size * 0.2).toBeLessThanOrEqual(size.h - g.bottom);
            } else if (op.k === "line") {
              expect(Math.min(op.y1, op.y2)).toBeGreaterThanOrEqual(g.top);
              expect(Math.max(op.y1, op.y2)).toBeLessThanOrEqual(size.h - g.bottom);
            } else if (op.k === "rect") {
              expect(op.y).toBeGreaterThanOrEqual(g.top);
              expect(op.y + op.h).toBeLessThanOrEqual(size.h - g.bottom);
            }
          }
        }
      });
    }
  }

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
