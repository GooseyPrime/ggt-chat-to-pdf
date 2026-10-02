/**
 * Runs only on the shop's /tools/chat-to-pdf page. Lets the page tell the extension "this checkout
 * session was paid" (the extension re-verifies with the shop itself) and lets the page detect that
 * the extension is installed. It exposes nothing else.
 */
import { ext } from "./ext";

const SRC_PAGE = "ggt-chat-to-pdf-page";
const SRC_EXT = "ggt-chat-to-pdf-extension";

function hello() {
  window.postMessage({ source: SRC_EXT, type: "hello", version: ext.runtime.getManifest().version }, location.origin);
}

window.addEventListener("message", (e: MessageEvent) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const d = e.data as { source?: string; type?: string; sessionId?: unknown } | null;
  if (!d || d.source !== SRC_PAGE) return;
  if (d.type === "ping") hello();
  if (d.type === "activate" && typeof d.sessionId === "string") {
    void ext.runtime
      .sendMessage({ type: "ggt-activate", sessionId: d.sessionId })
      .then((r: { ok?: boolean; offline?: boolean } | undefined) => {
        window.postMessage({ source: SRC_EXT, type: "activated", ok: !!r?.ok, offline: !!r?.offline }, location.origin);
      })
      .catch(() => window.postMessage({ source: SRC_EXT, type: "activated", ok: false }, location.origin));
  }
});
hello();
