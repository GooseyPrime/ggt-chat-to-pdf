import { ext } from "./ext";
import { SHOP_ORIGIN, TOOL_URL } from "./constants";
import { activate, browserStore, hasLicense } from "./license";

const store = browserStore(ext.storage.local);
const doFetch = (u: string, i?: RequestInit) => fetch(u, i) as ReturnType<typeof fetch>;
const CAPTURE_TTL_MS = 60 * 60 * 1000;

async function purgeOldCaptures(): Promise<void> {
  const all = await ext.storage.local.get(null);
  const stale: string[] = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith("capture:")) continue;
    const expiresAt = ((value as { savedAt?: number })?.savedAt ?? 0) + CAPTURE_TTL_MS;
    if (expiresAt <= Date.now()) stale.push(key);
    else await ext.alarms.create(key, { when: expiresAt });
  }
  if (stale.length) await ext.storage.local.remove(stale);
}

ext.runtime.onInstalled.addListener(() => void purgeOldCaptures());
ext.runtime.onStartup.addListener(() => void purgeOldCaptures());
ext.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const [key, change] of Object.entries(changes)) {
    if (!key.startsWith("capture:")) continue;
    if (change.newValue) {
      const savedAt = (change.newValue as { savedAt?: number }).savedAt ?? 0;
      void ext.alarms.create(key, { when: savedAt + CAPTURE_TTL_MS });
    } else {
      void ext.alarms.clear(key);
    }
  }
});
ext.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith("capture:")) void purgeOldCaptures();
});

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
