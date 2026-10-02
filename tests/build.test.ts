import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { unzip, zip } from "../scripts/lib/zip.mjs";
import { iconPng } from "../scripts/lib/icons.mjs";

describe("zip writer", () => {
  it("round-trips files (deflate + stored) with valid CRCs, sorted and reproducible", () => {
    const files = [
      { name: "b/two.txt", data: Buffer.from("hello ".repeat(500)) },
      { name: "a.bin", data: Buffer.from([0, 1, 2, 3]) },
    ];
    const z1 = zip(files);
    expect(zip(files).equals(z1)).toBe(true);
    const back = unzip(z1);
    expect(back.map((f: { name: string }) => f.name)).toEqual(["a.bin", "b/two.txt"]);
    expect(back[1].data.toString()).toBe("hello ".repeat(500));
  });
  it("is readable by the system unzip when available", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zt-"));
    fs.writeFileSync(path.join(dir, "t.zip"), zip([{ name: "x/y.txt", data: Buffer.from("ok") }]));
    try {
      expect(execFileSync("unzip", ["-p", path.join(dir, "t.zip"), "x/y.txt"], { encoding: "utf8" })).toBe("ok");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  });
});

describe("icons", () => {
  it("produce PNGs of the requested size", () => {
    for (const s of [16, 48, 128]) {
      const png = iconPng(s);
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(png.readUInt32BE(16)).toBe(s);
      expect(png.readUInt32BE(20)).toBe(s);
    }
  });
});

describe("extension build", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "ctp-build-"));
  execFileSync("node", ["scripts/build-extension.mjs", "--target", "all", "--out", out, "--no-public"], { cwd: path.join(__dirname, ".."), stdio: "pipe" });
  const read = (t: string, f: string) => fs.readFileSync(path.join(out, `extension-${t}`, f), "utf8");

  it("chromium manifest is MV3 with minimal permissions and no always-on access to chat sites", () => {
    const m = JSON.parse(read("chromium", "manifest.json"));
    expect(m.manifest_version).toBe(3);
    expect(m.permissions.sort()).toEqual(["activeTab", "alarms", "scripting", "storage"]);
    expect(m.host_permissions).toEqual(["https://www.goldengoosetools.com/*"]);
    expect(m.content_scripts).toHaveLength(1);
    expect(m.content_scripts[0].matches).toEqual(["https://www.goldengoosetools.com/tools/chat-to-pdf*"]);
    expect(JSON.stringify(m)).not.toMatch(/chatgpt\.com|claude\.ai|gemini\.google|copilot\.microsoft/);
    expect(m.background.service_worker).toBe("background.js");
    for (const f of ["background.js", "content.js", "bridge.js", "popup.js", "studio.js", "popup.html", "studio.html", "ui.css", "PRIVACY.txt", "fonts/DejaVuSans.ttf", "icons/icon-128.png"]) {
      expect(fs.existsSync(path.join(out, "extension-chromium", f)), f).toBe(true);
    }
  });
  it("firefox manifest uses an event page and a gecko id", () => {
    const m = JSON.parse(read("firefox", "manifest.json"));
    expect(m.background).toEqual({ scripts: ["background.js"] });
    expect(m.browser_specific_settings.gecko.id).toMatch(/@/);
    expect(m.minimum_chrome_version).toBeUndefined();
  });
  it("bundles contain no remote code references or eval", () => {
    for (const f of ["studio.js", "popup.js", "content.js", "background.js", "bridge.js"]) {
      const js = read("chromium", f);
      expect(js, f).not.toMatch(/\beval\(|new Function\(|<script[^>]+src=["']https?:/);
    }
    expect(read("chromium", "studio.html")).not.toMatch(/https?:\/\//);
    expect(read("chromium", "popup.html")).not.toMatch(/https?:\/\//);
  });
  it("zip artifacts are valid and match SHA256SUMS", async () => {
    const sums = fs.readFileSync(path.join(out, "SHA256SUMS"), "utf8").trim().split("\n");
    expect(sums).toHaveLength(2);
    const crypto = await import("node:crypto");
    for (const line of sums) {
      const [sha, name] = line.split("  ");
      const buf = fs.readFileSync(path.join(out, name));
      expect(crypto.createHash("sha256").update(buf).digest("hex")).toBe(sha);
      const names = unzip(buf).map((f: { name: string }) => f.name);
      expect(names).toContain("manifest.json");
    }
  });
});
