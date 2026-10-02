import { afterEach, describe, expect, it, vi } from "vitest";

const HOUR = 60 * 60 * 1000;

async function background() {
  vi.resetModules();
  const get = vi.fn().mockResolvedValue({});
  const remove = vi.fn().mockResolvedValue(undefined);
  const create = vi.fn().mockResolvedValue(undefined);
  const clear = vi.fn().mockResolvedValue(true);
  const onInstalled = vi.fn();
  const onStartup = vi.fn();
  const onChanged = vi.fn();
  const onAlarm = vi.fn();
  vi.stubGlobal("chrome", {
    storage: { local: { get, remove }, onChanged: { addListener: onChanged } },
    alarms: { create, clear, onAlarm: { addListener: onAlarm } },
    runtime: {
      onInstalled: { addListener: onInstalled },
      onStartup: { addListener: onStartup },
      onMessage: { addListener: vi.fn() },
    },
  });
  await import("../extension/src/background");
  return { get, remove, create, clear, installed: onInstalled.mock.calls[0][0], startup: onStartup.mock.calls[0][0], changed: onChanged.mock.calls[0][0], alarm: onAlarm.mock.calls[0][0] };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("capture retention", () => {
  it("schedules deletion for each new capture and clears consumed capture alarms", async () => {
    const bg = await background();
    bg.changed({ "capture:new": { newValue: { savedAt: 1000 } }, license: { newValue: {} } }, "local");
    expect(bg.create).toHaveBeenCalledExactlyOnceWith("capture:new", { when: 1000 + HOUR });
    bg.changed({ "capture:new": { oldValue: { savedAt: 1000 } } }, "local");
    expect(bg.clear).toHaveBeenCalledExactlyOnceWith("capture:new");
    bg.changed({ "capture:sync": { newValue: { savedAt: 1000 } } }, "sync");
    expect(bg.create).toHaveBeenCalledTimes(1);
  });

  it.each(["installed", "startup", "alarm"] as const)("purges expired captures and restores pending alarms on %s", async (event) => {
    vi.useFakeTimers();
    vi.setSystemTime(2 * HOUR);
    const bg = await background();
    bg.get.mockResolvedValue({
      "capture:expired": { savedAt: HOUR },
      "capture:pending": { savedAt: HOUR + 1000 },
      license: { verifiedAt: 0 },
    });
    if (event === "alarm") bg.alarm({ name: "capture:expired" });
    else bg[event]();
    await vi.waitFor(() => expect(bg.remove).toHaveBeenCalledWith(["capture:expired"]));
    expect(bg.create).toHaveBeenCalledWith("capture:pending", { when: 2 * HOUR + 1000 });
  });
});
