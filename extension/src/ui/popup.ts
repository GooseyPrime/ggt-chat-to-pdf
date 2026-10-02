import { ext } from "../ext";
import { siteForHost } from "../parsers";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on = true) => $(id).classList.toggle("hidden", !on);

interface Scan {
  ok: boolean;
  error?: string;
  siteName: string;
  title: string;
  model?: string;
  count: number;
}
interface Status {
  progress: { phase: string; messages: number; detail?: string };
  error: string | null;
}

let tabId = -1;
let poll: number | undefined;

function fail(msg: string) {
  show("loading", false);
  show("working", false);
  const e = $("error");
  e.textContent = msg;
  e.classList.remove("hidden");
}

async function currentTab(): Promise<{ id: number; url: string }> {
  // Test hook: ?tab=<id>&url=<url> lets automated tests open this page as a normal tab.
  const q = new URLSearchParams(location.search);
  if (q.get("tab")) return { id: Number(q.get("tab")), url: q.get("url") ?? "" };
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  return { id: tab?.id ?? -1, url: tab?.url ?? "" };
}

async function send<T>(msg: unknown): Promise<T> {
  return (await ext.tabs.sendMessage(tabId, msg)) as T;
}

async function init() {
  const tab = await currentTab();
  tabId = tab.id;
  let host = "";
  try {
    host = new URL(tab.url).hostname;
  } catch {
    /* chrome:// pages etc. have no usable URL */
  }
  show("loading", false);
  if (!siteForHost(host) || tabId < 0) {
    show("unsupported");
    return;
  }
  try {
    // Injected on demand (activeTab). Safe to repeat: the script guards against double registration.
    await ext.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    const scan = await send<Scan>({ type: "ggt-scan" });
    if (!scan?.ok) throw new Error("scan failed");
    $("m-title").textContent = scan.title;
    $("m-site").textContent = scan.siteName;
    $("m-model").textContent = scan.model ?? "";
    show("m-model-label", !!scan.model);
    $("m-model").classList.toggle("hidden", !scan.model);
    $("m-count").textContent = scan.count ? String(scan.count) : "none found yet";
    show("supported");
    if (!scan.count) {
      const e = $("error");
      e.textContent = "No messages found on screen. Open a conversation (and let it finish loading), then try again.";
      e.classList.remove("hidden");
    }
  } catch {
    fail("Couldn't read this page. Reload the tab and click the icon again. (If the site just changed its layout, see the extension's troubleshooting notes.)");
  }
}

async function start(pick: boolean) {
  show("supported", false);
  show("working");
  $("error").classList.add("hidden");
  const loadAll = ($("load-all") as HTMLInputElement).checked;
  try {
    await send({ type: "ggt-harvest", loadAll });
  } catch {
    fail("Lost contact with the page (did it navigate?). Reload and try again.");
    show("supported");
    return;
  }
  poll = window.setInterval(async () => {
    try {
      const st = await send<Status>({ type: "ggt-status" });
      const p = st.progress;
      if (st.error) {
        window.clearInterval(poll);
        fail(st.error === "no-messages" ? "No messages found to export." : `Export failed: ${st.error}`);
        show("supported");
        return;
      }
      $("work-text").textContent =
        p.phase === "loading-history"
          ? `Loading older messages… ${p.messages} so far`
          : p.phase === "reading"
            ? `Reading messages… ${p.messages} so far`
            : "Finishing…";
      if (p.phase === "done" && p.detail) {
        window.clearInterval(poll);
        await ext.tabs.create({ url: ext.runtime.getURL(`studio.html?c=${encodeURIComponent(p.detail)}&go=${pick ? 0 : 1}`) });
        window.close();
      }
    } catch {
      window.clearInterval(poll);
      fail("Lost contact with the page (did it navigate?). Reload and try again.");
      show("supported");
    }
  }, 350);
}

$("go-all").addEventListener("click", () => void start(false));
$("go-pick").addEventListener("click", () => void start(true));
$("cancel").addEventListener("click", async () => {
  window.clearInterval(poll);
  try {
    await send({ type: "ggt-cancel" });
  } catch {
    /* ignore */
  }
  show("working", false);
  show("supported");
});

void init();
