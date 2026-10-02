import { ext } from "./ext";
import { SHOP_ORIGIN, TOOL_URL } from "./constants";
import { activate, browserStore, hasLicense } from "./license";

const store = browserStore(ext.storage.local);
const doFetch = (u: string, i?: RequestInit) => fetch(u, i) as ReturnType<typeof fetch>;

async function purgeOldCaptures(): Promise<void> {
  const all = await ext.storage.local.get(null);
  const cutoff = Date.now() - 60 * 60 * 1000;
  const stale = Object.entries(all)
    .filter(([k, v]) => k.startsWith("capture:") && ((v as { savedAt?: number })?.savedAt ?? 0) < cutoff)
    .map(([k]) => k);
  if (stale.length) await ext.storage.local.remove(stale);
}

ext.runtime.onInstalled.addListener(() => void purgeOldCaptures());
ext.runtime.onStartup.addListener(() => void purgeOldCaptures());

/** The bridge content script only runs on the shop's tool page; double-check the sender anyway. */
function trustedSender(sender: chrome.runtime.MessageSender): boolean {
  try {
    const u = new URL(sender.url ?? "");
    return u.origin === SHOP_ORIGIN || u.origin === new URL(TOOL_URL).origin;
  } catch {
    return false;
  }
}

ext.runtime.onMessage.addListener((msg: { type?: string; sessionId?: string }, sender, sendResponse) => {
  if (msg?.type === "ggt-activate" && typeof msg.sessionId === "string") {
    if (!trustedSender(sender)) {
      sendResponse({ ok: false, error: "untrusted-sender" });
      return undefined;
    }
    void activate(msg.sessionId, store, doFetch).then((r) => sendResponse(r));
    return true; // async response
  }
  if (msg?.type === "ggt-license-status") {
    void hasLicense(store, doFetch).then((paid) => sendResponse({ paid }));
    return true;
  }
  return undefined;
});
