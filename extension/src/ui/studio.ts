import { ext } from "../ext";
import { FREE_MESSAGE_CAP, TOOL_URL } from "../constants";
import { type Conversation, type Message } from "../model";
import { Layout } from "../pdf/layout";
import { buildPdf } from "../pdf/render";
import { activate, browserStore, hasLicense } from "../license";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on = true) => $(id).classList.toggle("hidden", !on);
const store = browserStore(ext.storage.local);
const doFetch = (u: string, i?: RequestInit) => fetch(u, i) as ReturnType<typeof fetch>;

let conv: Conversation;
let selected: boolean[] = [];
let licensed = false;

function fatal(msg: string) {
  const f = $("fatal");
  f.textContent = msg;
  f.classList.remove("hidden");
  $("subtitle").textContent = "";
}

function renderList() {
  const ul = $("list");
  ul.textContent = "";
  conv.messages.forEach((m: Message, i) => {
    const li = document.createElement("li");
    li.className = `${m.role}${selected[i] ? "" : " off"}`;
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selected[i];
    cb.id = `m${i}`;
    cb.setAttribute("aria-label", `Include message ${i + 1}`);
    cb.addEventListener("change", () => {
      selected[i] = cb.checked;
      li.classList.toggle("off", !cb.checked);
      updateCount();
    });
    const who = document.createElement("label");
    who.className = "who";
    who.htmlFor = cb.id;
    who.textContent = `${i + 1}. ${m.role === "user" ? "You" : conv.siteName === "Google Gemini" ? "Gemini" : conv.siteName.replace("Microsoft ", "")}`;
    const prev = document.createElement("span");
    prev.className = "prev";
    prev.textContent = Layout.preview(m, 220);
    li.append(cb, who, prev);
    ul.append(li);
  });
  updateCount();
}

function updateCount() {
  const n = selected.filter(Boolean).length;
  $("sel-count").textContent = `${n} of ${conv.messages.length} selected`;
  const note = $("free-note");
  note.textContent =
    n > FREE_MESSAGE_CAP
      ? `Free edition: PDFs carry a watermark and include the first ${FREE_MESSAGE_CAP} selected messages (you have ${n} selected).`
      : `Free edition: PDFs carry a watermark and include up to ${FREE_MESSAGE_CAP} messages.`;
}

function setAll(fn: (m: Message, i: number) => boolean) {
  selected = conv.messages.map(fn);
  renderList();
}

async function refreshLicense() {
  licensed = await hasLicense(store, doFetch);
  show("lic-free", !licensed);
  show("lic-paid", licensed);
}

function say(text: string, kind: "ok" | "bad" | "" = "") {
  const el = $("lic-msg");
  el.textContent = text;
  el.className = `note ${kind}`.trim();
  el.classList.toggle("hidden", !text);
}

function filename(): string {
  const base = ($("title") as HTMLInputElement).value
    .normalize("NFKD")
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "chat";
  return `${base}-${conv.site}-${conv.exportedAt.slice(0, 10)}.pdf`;
}

async function loadFont(file: string): Promise<Uint8Array> {
  const res = await fetch(ext.runtime.getURL(`fonts/${file}`));
  return new Uint8Array(await res.arrayBuffer());
}

async function make() {
  const btn = $("make") as HTMLButtonElement;
  const status = $("status");
  let chosen = conv.messages.filter((_, i) => selected[i]);
  if (!chosen.length) {
    status.textContent = "Select at least one message.";
    return;
  }
  await refreshLicense();
  const total = chosen.length;
  if (!licensed && chosen.length > FREE_MESSAGE_CAP) chosen = chosen.slice(0, FREE_MESSAGE_CAP);
  btn.disabled = true;
  status.textContent = `Building PDF (${chosen.length} messages)…`;
  show("warnings", false);
  await new Promise((r) => setTimeout(r, 30)); // let the status paint before the synchronous layout
  try {
    const out = await buildPdf(
      { ...conv, messages: chosen },
      {
        pageSize: ($("page-size") as HTMLSelectElement).value as "letter" | "a4",
        toc: ($("toc") as HTMLInputElement).checked,
        watermark: !licensed,
        truncatedFrom: !licensed && total > chosen.length ? total : undefined,
        title: ($("title") as HTMLInputElement).value.trim() || conv.title,
        loadFont,
      },
    );
    const blob = new Blob([out.bytes as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename();
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    status.textContent = `Done — ${out.pages} pages saved as ${a.download}`;
    if (out.warnings.length) {
      const w = $("warnings");
      w.textContent = out.warnings.join(" ");
      w.classList.remove("hidden");
    }
  } catch (e) {
    status.textContent = `Couldn't build the PDF: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    btn.disabled = false;
  }
}

async function init() {
  const q = new URLSearchParams(location.search);
  const key = q.get("c") ?? "";
  if (!key.startsWith("capture:")) return fatal("Nothing to export. Open a chat and use the toolbar button.");
  const got = await ext.storage.local.get(key);
  const rec = got[key] as { savedAt?: number; conversation?: Conversation } | undefined;
  await ext.storage.local.remove(key);
  if (!rec?.conversation || typeof rec.savedAt !== "number" || Date.now() - rec.savedAt >= 60 * 60 * 1000) return fatal("This capture has expired (they're kept for one hour). Go back to the chat and click the toolbar button again.");
  conv = rec.conversation;
  selected = conv.messages.map(() => true);
  $("subtitle").textContent = `${conv.siteName}${conv.model ? ` · ${conv.model}` : ""} · ${conv.messages.length} messages captured`;
  ($("title") as HTMLInputElement).value = conv.title;
  ($("toc") as HTMLInputElement).checked = conv.messages.length >= 6;
  renderList();
  show("main");
  await refreshLicense();

  $("sel-all").addEventListener("click", () => setAll(() => true));
  $("sel-none").addEventListener("click", () => setAll(() => false));
  $("sel-user").addEventListener("click", () => setAll((m) => m.role === "user"));
  $("sel-asst").addEventListener("click", () => setAll((m) => m.role === "assistant"));
  $("make").addEventListener("click", () => void make());
  $("unlock").addEventListener("click", () => void ext.tabs.create({ url: `${TOOL_URL}#unlock` }));
  $("have-code").addEventListener("click", () => show("code-form", true));
  $("code-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = ($("code") as HTMLInputElement).value.trim();
    if (!code) return;
    say("Checking with the shop…");
    const r = await activate(code, store, doFetch);
    if (r.ok) {
      say("Unlocked. Your next PDF will be clean.", "ok");
      await refreshLicense();
    } else {
      say(r.offline ? "Couldn't reach the shop. Check your connection and try again." : "That code wasn't recognised as a paid Chat to PDF checkout.", "bad");
    }
  });
  if (q.get("go") === "1") void make();
}

void init();
