/**
 * Content script injected on demand (activeTab + scripting.executeScript) when the user clicks the
 * toolbar button. It never runs on its own, never makes network requests, and only talks to the
 * extension via runtime messages.
 */
import { siteForHost } from "../parsers";
import { type Progress, harvestConversation, snapshotMessages } from "./harvest";

type Req =
  | { type: "ggt-scan" }
  | { type: "ggt-harvest"; loadAll: boolean }
  | { type: "ggt-status" }
  | { type: "ggt-cancel" };

interface State {
  progress: Progress;
  result: unknown | null;
  error: string | null;
  signal: { cancelled: boolean };
}

const w = window as unknown as { __ggtChatToPdf?: boolean };
const api: typeof chrome = (globalThis as unknown as { browser?: typeof chrome }).browser ?? chrome;

if (!w.__ggtChatToPdf) {
  w.__ggtChatToPdf = true;
  const state: State = { progress: { phase: "idle", messages: 0 }, result: null, error: null, signal: { cancelled: false } };

  api.runtime.onMessage.addListener((msg: Req, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("ggt-")) return undefined;
    const site = siteForHost(location.hostname);
    if (msg.type === "ggt-scan") {
      if (!site) {
        sendResponse({ ok: false, error: "unsupported-site" });
        return undefined;
      }
      const messages = snapshotMessages(site, document);
      sendResponse({
        ok: true,
        site: site.id,
        siteName: site.name,
        title: site.title(document),
        model: site.model(document),
        count: messages.length,
      });
      return undefined;
    }
    if (msg.type === "ggt-status") {
      sendResponse({ ok: true, progress: state.progress, done: state.progress.phase === "done", error: state.error });
      return undefined;
    }
    if (msg.type === "ggt-cancel") {
      state.signal.cancelled = true;
      sendResponse({ ok: true });
      return undefined;
    }
    if (msg.type === "ggt-harvest") {
      if (!site) {
        sendResponse({ ok: false, error: "unsupported-site" });
        return undefined;
      }
      if (state.progress.phase === "loading-history" || state.progress.phase === "reading") {
        sendResponse({ ok: true, started: false });
        return undefined;
      }
      state.signal = { cancelled: false };
      state.error = null;
      state.result = null;
      state.progress = { phase: "reading", messages: 0 };
      sendResponse({ ok: true, started: true });
      void harvestConversation(site, document, {
        loadAll: msg.loadAll,
        signal: state.signal,
        onProgress: (p) => {
          state.progress = p;
        },
      })
        .then(async (conv) => {
          if (!conv.messages.length) {
            state.error = "no-messages";
            state.progress = { phase: "error", messages: 0 };
            return;
          }
          const key = `capture:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
          await api.storage.local.set({ [key]: { savedAt: Date.now(), conversation: conv } });
          state.result = key;
          state.progress = { phase: "done", messages: conv.messages.length, detail: key };
        })
        .catch((e: unknown) => {
          state.error = e instanceof Error ? e.message : String(e);
          state.progress = { phase: "error", messages: 0 };
        });
      return undefined;
    }
    return undefined;
  });
}
