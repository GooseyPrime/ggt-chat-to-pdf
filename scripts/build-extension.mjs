#!/usr/bin/env node
// Build + package the browser extension.
//   node scripts/build-extension.mjs [--target chromium|firefox|test|all] [--out dist]
// Targets: chromium (Chrome/Edge/Brave MV3), firefox (MV3 event page + gecko id), test (chromium +
// host permissions for the four chat sites so automated tests can inject without a toolbar click).
import { build } from "esbuild";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { iconPng } from "./lib/icons.mjs";
import { zip } from "./lib/zip.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const targets = (arg("target", "all") === "all" ? ["chromium", "firefox"] : [arg("target")]);
const outRoot = path.resolve(root, arg("out", "dist"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const SHOP_ORIGIN = (process.env.CTP_SHOP_ORIGIN || "https://www.goldengoosetools.com").replace(/\/$/, "");
const TOOL_URL = process.env.CTP_TOOL_URL || `${SHOP_ORIGIN}/tools/chat-to-pdf`;
const CHAT_SITES = ["https://chatgpt.com/*", "https://chat.openai.com/*", "https://gemini.google.com/*", "https://copilot.microsoft.com/*", "https://claude.ai/*"];

const FONTS = ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "DejaVuSansMono.ttf"];
const fontDir = path.join(root, "node_modules", "dejavu-fonts-ttf");

const stubOptional = {
  name: "stub-optional-jspdf-deps",
  setup(b) {
    // jsPDF lazily imports these for html()/svg() features we never call; keep them out of the bundle.
    b.onResolve({ filter: /^(html2canvas|dompurify|canvg)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default undefined;", loader: "js" }));
  },
};

async function bundle(dir, target) {
  const entries = {
    content: "extension/src/content/index.ts",
    background: "extension/src/background.ts",
    bridge: "extension/src/bridge.ts",
    popup: "extension/src/ui/popup.ts",
    studio: "extension/src/ui/studio.ts",
  };
  await build({
    entryPoints: Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, path.join(root, v)])),
    outdir: dir,
    bundle: true,
    format: "iife",
    target: target === "firefox" ? ["firefox115"] : ["chrome102"],
    minify: true,
    legalComments: "none",
    plugins: [stubOptional],
    define: { __SHOP_ORIGIN__: JSON.stringify(SHOP_ORIGIN), __TOOL_URL__: JSON.stringify(TOOL_URL) },
    logLevel: "warning",
  });
}

function manifestFor(target) {
  const m = JSON.parse(fs.readFileSync(path.join(root, "extension", "manifest.template.json"), "utf8"));
  m.version = pkg.version;
  const shopMatch = `${SHOP_ORIGIN}/*`;
  const toolOrigin = new URL(TOOL_URL);
  const toolMatch = `${toolOrigin.origin}${toolOrigin.pathname.replace(/\/$/, "")}*`;
  m.host_permissions = [shopMatch];
  m.content_scripts[0].matches = [toolMatch];
  if (target === "test") m.host_permissions.push(...CHAT_SITES);
  if (target === "firefox") {
    m.background = { scripts: ["background.js"] };
    delete m.minimum_chrome_version;
    m.browser_specific_settings = { gecko: { id: "chat-to-pdf@goldengoosetools.com", strict_min_version: "115.0" } };
  }
  return m;
}

function collect(dir) {
  const files = [];
  const walk = (d, rel = "") => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, `${rel}${e.name}/`);
      else files.push({ name: `${rel}${e.name}`, data: fs.readFileSync(p) });
    }
  };
  walk(dir);
  return files;
}

async function buildTarget(target) {
  const dir = path.join(outRoot, `extension-${target}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "icons"), { recursive: true });
  fs.mkdirSync(path.join(dir, "fonts"), { recursive: true });
  await bundle(dir, target);
  for (const f of ["popup.html", "studio.html", "ui.css"]) fs.copyFileSync(path.join(root, "extension/src/ui", f), path.join(dir, f));
  for (const s of [16, 32, 48, 128]) fs.writeFileSync(path.join(dir, "icons", `icon-${s}.png`), iconPng(s));
  for (const f of FONTS) fs.copyFileSync(path.join(fontDir, "ttf", f), path.join(dir, "fonts", f));
  fs.copyFileSync(path.join(fontDir, "LICENSE"), path.join(dir, "fonts", "LICENSE-DejaVu.txt"));
  fs.writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifestFor(target), null, 2)}\n`);
  fs.writeFileSync(path.join(dir, "PRIVACY.txt"), fs.readFileSync(path.join(root, "extension", "PRIVACY.txt")));
  const zipName = `chat-to-pdf-${target}-v${pkg.version}.zip`;
  const buf = zip(collect(dir));
  fs.writeFileSync(path.join(outRoot, zipName), buf);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  console.log(`${target}: ${path.relative(root, dir)}  ->  ${zipName} (${(buf.length / 1024).toFixed(0)} KB) sha256=${sha}`);
  return { target, zipName, sha, bytes: buf.length };
}

fs.mkdirSync(outRoot, { recursive: true });
const results = [];
for (const t of targets) results.push(await buildTarget(t));
fs.writeFileSync(path.join(outRoot, "SHA256SUMS"), results.map((r) => `${r.sha}  ${r.zipName}`).join("\n") + "\n");

// Landing page downloads (served at /tools/chat-to-pdf/downloads/…).
if (!process.argv.includes("--no-public")) {
  const pub = path.join(root, "public", "downloads");
  fs.rmSync(pub, { recursive: true, force: true });
  fs.mkdirSync(pub, { recursive: true });
  for (const r of results) if (r.target !== "test") fs.copyFileSync(path.join(outRoot, r.zipName), path.join(pub, r.zipName));
  fs.writeFileSync(path.join(pub, "SHA256SUMS"), results.filter((r) => r.target !== "test").map((r) => `${r.sha}  ${r.zipName}`).join("\n") + "\n");
}
