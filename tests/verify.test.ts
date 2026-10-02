import { describe, expect, it } from "vitest";
import { normalizeVerify } from "@/lib/payments";

describe("normalizeVerify", () => {
  it("unlocks when ok && paid", () => {
    const result = normalizeVerify({ ok: true, paid: true, product: "chat-to-pdf" }, "sess_1");
    expect(result.ok).toBe(true);
    expect(result.paid).toBe(true);
    expect(result.sessionId).toBe("sess_1");
  });

  it("unlocks on paymentStatus no_payment_required", () => {
    const result = normalizeVerify(
      { ok: true, paid: false, paymentStatus: "no_payment_required", product: "chat-to-pdf" },
      "sess_promo",
    );
    expect(result.paid).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.paymentStatus).toBe("no_payment_required");
  });

  it("does not unlock when neither paid nor promo", () => {
    const result = normalizeVerify(
      { ok: false, paid: false, message: "unpaid" },
      "sess_x",
    );
    expect(result.paid).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("does not unlock when ok is false even if paid is true", () => {
    const result = normalizeVerify({ ok: false, paid: true }, "sess_not_ok_paid");
    expect(result.paid).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("does not unlock promo status when ok is false", () => {
    const result = normalizeVerify(
      { ok: false, paymentStatus: "no_payment_required" },
      "sess_not_ok_promo",
    );
    expect(result.paid).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("accepts snake_case payment_status", () => {
    const result = normalizeVerify(
      { ok: true, payment_status: "no_payment_required", product: "chat-to-pdf" },
      "sess_snake",
    );
    expect(result.paid).toBe(true);
  });

  it("does not unlock a paid session bought for another product", () => {
    const result = normalizeVerify({ ok: true, paid: true, product: "seo-audit" }, "sess_other");
    expect(result.paid).toBe(false);
    expect(result.ok).toBe(false);
  });
});
