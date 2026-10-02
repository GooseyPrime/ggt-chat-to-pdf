/**
 * Licence handling. The extension never sees a price or a card: payment happens on the shop's Stripe
 * checkout; afterwards the shop's `/api/verify` is the only authority. We store the checkout session
 * id and re-ask the shop (see `isPaidSession` — the same rules as the web tool's `normalizeVerify`).
 */
import { SHOP_ORIGIN, TOOL_ID } from "./constants";

export interface LicenseRecord {
  sessionId: string;
  verifiedAt: number;
}
export interface Store {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}
export type Fetch = (input: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export const LICENSE_KEY = "license";
export const REVERIFY_MS = 24 * 60 * 60 * 1000;
/** If the shop cannot be reached, a previously verified licence keeps working this long. */
export const OFFLINE_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

/** Mirror of the tool's verify rules: ok, paid (or a zero-amount promo) and bought for THIS product. */
export function isPaidSession(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  const status = typeof d.paymentStatus === "string" ? d.paymentStatus : typeof d.payment_status === "string" ? d.payment_status : undefined;
  return d.ok === true && (d.paid === true || status === "no_payment_required") && d.product === TOOL_ID;
}

export type VerifyOutcome = "paid" | "unpaid" | "offline";

export async function verifySession(sessionId: string, doFetch: Fetch, origin = SHOP_ORIGIN): Promise<VerifyOutcome> {
  if (!/^[\w\-:.]{6,200}$/.test(sessionId)) return "unpaid";
  try {
    const url = `${origin}/api/verify?session_id=${encodeURIComponent(sessionId)}`;
    const res = await doFetch(url, { method: "GET", headers: { Accept: "application/json" } });
    const data = await res.json().catch(() => null);
    if (data === null && !res.ok) return "offline";
    return isPaidSession(data) ? "paid" : "unpaid";
  } catch {
    return "offline";
  }
}

export async function activate(sessionId: string, store: Store, doFetch: Fetch, now = Date.now()): Promise<{ ok: boolean; offline?: boolean }> {
  const r = await verifySession(sessionId.trim(), doFetch);
  if (r === "paid") {
    await store.set(LICENSE_KEY, { sessionId: sessionId.trim(), verifiedAt: now } satisfies LicenseRecord);
    return { ok: true };
  }
  return { ok: false, offline: r === "offline" };
}

/** Is the clean tier active right now? Re-verifies with the shop at most once a day. */
export async function hasLicense(store: Store, doFetch: Fetch, now = Date.now()): Promise<boolean> {
  const rec = (await store.get(LICENSE_KEY)) as LicenseRecord | undefined;
  if (!rec || typeof rec.sessionId !== "string") return false;
  if (now - rec.verifiedAt < REVERIFY_MS) return true;
  const r = await verifySession(rec.sessionId, doFetch);
  if (r === "paid") {
    await store.set(LICENSE_KEY, { sessionId: rec.sessionId, verifiedAt: now } satisfies LicenseRecord);
    return true;
  }
  if (r === "offline") return now - rec.verifiedAt < OFFLINE_GRACE_MS;
  await store.remove(LICENSE_KEY);
  return false;
}

export function browserStore(area: chrome.storage.StorageArea): Store {
  return {
    async get(key) {
      const out = await area.get(key);
      return out[key];
    },
    async set(key, value) {
      await area.set({ [key]: value });
    },
    async remove(key) {
      await area.remove(key);
    },
  };
}
