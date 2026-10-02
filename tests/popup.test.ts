// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("restores the popup after the initial harvest message disconnects", async () => {
  vi.resetModules();
  document.body.innerHTML = ["loading", "working", "error", "unsupported", "supported", "m-title", "m-site", "m-model", "m-model-label", "m-count", "go-all", "go-pick", "cancel"]
    .map((id) => `<div id="${id}" class="hidden"></div>`).join("") + '<input id="load-all" type="checkbox" checked>';
  const sendMessage = vi.fn().mockResolvedValueOnce({ ok: true, title: "Chat", siteName: "ChatGPT", count: 1 }).mockRejectedValueOnce(new Error("disconnected"));
  vi.stubGlobal("chrome", {
    tabs: { query: vi.fn().mockResolvedValue([{ id: 1, url: "https://chatgpt.com/c/test" }]), sendMessage },
    scripting: { executeScript: vi.fn().mockResolvedValue([]) },
  });
  await import("../extension/src/ui/popup");
  await vi.waitFor(() => expect(document.getElementById("supported")?.classList.contains("hidden")).toBe(false));
  document.getElementById("go-all")?.click();
  await vi.waitFor(() => expect(document.getElementById("error")?.textContent).toContain("Lost contact"));
  expect(document.getElementById("working")?.classList.contains("hidden")).toBe(true);
  expect(document.getElementById("supported")?.classList.contains("hidden")).toBe(false);
});
