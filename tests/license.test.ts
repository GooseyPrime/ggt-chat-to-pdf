import { describe, expect, it } from "vitest";
import { LICENSE_KEY, OFFLINE_GRACE_MS, REVERIFY_MS, type Fetch, type Store, activate, hasLicense, isPaidSession, verifySession } from "../extension/src/license";

function memStore(initial: Record<string, unknown> = {}): Store & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    async get(k) { return data[k]; },
    async set(k, v) { data[k] = v; },
    async remove(k) { delete data[k]; },
  };
}
const reply = (body: unknown, ok = true): Fetch => async () => ({ ok, json: async () => body });
const offline: Fetch = async () => { throw new Error("network"); };
const PAID = { ok: true, paid: true, product: "chat-to-pdf" };

describe("isPaidSession (same rules as the web tool)", () => {
  it.each([
    [PAID, true],
    [{ ok: true, paymentStatus: "no_payment_required", product: "chat-to-pdf" }, true],
    [{ ok: true, paid: true, product: "seo-audit" }, false],
    [{ ok: true, paid: true }, false],
    [{ ok: false, paid: true, product: "chat-to-pdf" }, false],
    [{ ok: true, paid: false, product: "chat-to-pdf" }, false],
    [null, false],
    ["paid", false],
  ])("%j -> %s", (body, expected) => expect(isPaidSession(body)).toBe(expected));
});

describe("verifySession", () => {
  it("asks the shop's /api/verify with the session id", async () => {
    let seen = "";
    const f: Fetch = async (url) => { seen = url; return { ok: true, json: async () => PAID }; };
    expect(await verifySession("cs_test_abc123", f, "https://shop.example")).toBe("paid");
    expect(seen).toBe("https://shop.example/api/verify?session_id=cs_test_abc123");
  });
  it("rejects junk ids without any network call", async () => {
    let called = false;
    const f: Fetch = async () => { called = true; return { ok: true, json: async () => PAID }; };
    expect(await verifySession("x", f)).toBe("unpaid");
    expect(await verifySession("a b c d e f g", f)).toBe("unpaid");
    expect(called).toBe(false);
  });
  it("network failure is 'offline', a negative answer is 'unpaid'", async () => {
    expect(await verifySession("cs_test_abc123", offline)).toBe("offline");
    expect(await verifySession("cs_test_abc123", reply({ ok: true, paid: false, product: "chat-to-pdf" }))).toBe("unpaid");
    expect(await verifySession("cs_test_abc123", async () => ({ ok: false, json: async () => { throw new Error("bad"); } }))).toBe("offline");
  });
  it("does not interpret unsuccessful HTTP responses as payment decisions", async () => {
    expect(await verifySession("cs_test_abc123", reply({ ok: false, error: "unavailable" }, false))).toBe("offline");
    expect(await verifySession("cs_test_abc123", reply(PAID, false))).toBe("offline");
    expect(await verifySession("cs_test_abc123", async () => ({ ok: true, json: async () => { throw new Error("bad"); } }))).toBe("offline");
  });
});

describe("activate / hasLicense", () => {
  it("stores a verified session and nothing else", async () => {
    const s = memStore();
    expect(await activate("  cs_test_abc123 ", s, reply(PAID), 1000)).toEqual({ ok: true });
    expect(s.data[LICENSE_KEY]).toEqual({ sessionId: "cs_test_abc123", verifiedAt: 1000 });
  });
  it("does not store a rejected one", async () => {
    const s = memStore();
    expect(await activate("cs_test_abc123", s, reply({ ok: true, paid: true, product: "other" }))).toEqual({ ok: false, offline: false });
    expect(s.data[LICENSE_KEY]).toBeUndefined();
    expect(await activate("cs_test_abc123", s, offline)).toEqual({ ok: false, offline: true });
  });
  it("is active without re-checking within a day, re-verifies after, and revokes when the shop says unpaid", async () => {
    const rec = { sessionId: "cs_test_abc123", verifiedAt: 0 };
    let calls = 0;
    const counting = (body: unknown): Fetch => async () => { calls++; return { ok: true, json: async () => body }; };
    const s = memStore({ [LICENSE_KEY]: rec });
    expect(await hasLicense(s, counting(PAID), REVERIFY_MS - 1)).toBe(true);
    expect(calls).toBe(0);
    expect(await hasLicense(s, counting(PAID), REVERIFY_MS + 5)).toBe(true);
    expect(calls).toBe(1);
    expect((s.data[LICENSE_KEY] as typeof rec).verifiedAt).toBe(REVERIFY_MS + 5);
    expect(await hasLicense(s, counting({ ok: true, paid: false, product: "chat-to-pdf" }), 3 * REVERIFY_MS)).toBe(false);
    expect(s.data[LICENSE_KEY]).toBeUndefined();
  });
  it("keeps working offline for the grace period only", async () => {
    const s = memStore({ [LICENSE_KEY]: { sessionId: "cs_test_abc123", verifiedAt: 0 } });
    expect(await hasLicense(s, offline, REVERIFY_MS * 3)).toBe(true);
    expect(await hasLicense(s, offline, OFFLINE_GRACE_MS + 1)).toBe(false);
  });
  it("preserves the license record on JSON server errors without extending grace", async () => {
    const rec = { sessionId: "cs_test_abc123", verifiedAt: 0 };
    const s = memStore({ [LICENSE_KEY]: rec });
    const serverError = reply({ ok: false, error: "unavailable" }, false);
    expect(await hasLicense(s, serverError, REVERIFY_MS * 3)).toBe(true);
    expect(s.data[LICENSE_KEY]).toEqual(rec);
    expect(await hasLicense(s, serverError, OFFLINE_GRACE_MS)).toBe(false);
    expect(s.data[LICENSE_KEY]).toEqual(rec);
    expect(await activate(rec.sessionId, memStore(), serverError)).toEqual({ ok: false, offline: true });
  });
  it("no record, no licence", async () => {
    expect(await hasLicense(memStore(), reply(PAID))).toBe(false);
  });
});
