import { describe, expect, it } from "vitest";
import { normalizeVerify } from "@/lib/payments";

describe("normalizeVerify", () => {
  it("unlocks when ok && paid", () => {
    const result = normalizeVerify({ ok: true, paid: true }, "sess_1");
    expect(result.ok).toBe(true);
    expect(result.paid).toBe(true);
    expect(result.sessionId).toBe("sess_1");
  });

  it("unlocks on paymentStatus no_payment_required", () => {
    const result = normalizeVerify(
      { ok: true, paid: false, paymentStatus: "no_payment_required" },
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

  it("accepts snake_case payment_status", () => {
    const result = normalizeVerify(
      { ok: true, payment_status: "no_payment_required" },
      "sess_snake",
    );
    expect(result.paid).toBe(true);
  });
});
