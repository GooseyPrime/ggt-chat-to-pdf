import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FREE_MESSAGE_CAP, FREE_WATERMARK, SUPPORTED_SITES, TOOL_ID } from "@/lib/config";
import * as ext from "../extension/src/constants";
import { SITES } from "../extension/src/parsers";

describe("landing page and extension agree", () => {
  it("free-tier cap, watermark text and tool id match", () => {
    expect(ext.FREE_MESSAGE_CAP).toBe(FREE_MESSAGE_CAP);
    expect(ext.FREE_WATERMARK_TEXT).toBe(FREE_WATERMARK);
    expect(ext.TOOL_ID).toBe(TOOL_ID);
  });
  it("supported sites listed on the page equal the parsers' hosts", () => {
    expect(SUPPORTED_SITES.map((s) => s.id).sort()).toEqual(SITES.map((s) => s.id).sort());
    for (const s of SUPPORTED_SITES) expect(SITES.find((x) => x.id === s.id)?.hosts).toContain(s.host);
  });
  it("no price is hard-coded in the extension sources", () => {
    const dir = path.join(__dirname, "..", "extension");
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of walk(dir).filter((f) => /\.(ts|html|json|txt)$/.test(f))) {
      const text = fs.readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/\$\s?\d+(\.\d\d)?\b/);
    }
  });
});
