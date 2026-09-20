import {
  TOOL_ID,
  allowLocalUnlock,
  chatToPdfSaleLive,
  shopOrigin,
} from "./config";

export type SaleRequest = {
  /** Tool page URL (shop path or current origin+path). */
  url: string;
  returnUrl: string;
};

export type SaleResult =
  | { ok: true; checkoutUrl: string; sessionId?: string }
  | {
      ok: false;
      message: string;
      code?: "sku_not_live" | "unconfigured" | "shop_error";
    };

export type VerifyResult = {
  ok: boolean;
  paid: boolean;
  kind?: string;
  message?: string;
  sessionId?: string;
  paymentStatus?: string;
};

const LOCAL_SESSION = "local";

/**
 * Start checkout via shop POST /api/sale.
 * Body: { url, product: "chat-to-pdf", toolId: "chat-to-pdf" }
 *
 * NEVER falls through to seo-audit / accessibility. Until the desk allowlist includes
 * chat-to-pdf, refuse here.
 */
export async function startSale(input: SaleRequest): Promise<SaleResult> {
  if (!chatToPdfSaleLive()) {
    return {
      ok: false,
      code: "sku_not_live",
      message:
        "Checkout for Chat to PDF is not live on the shop sale desk yet. The free watermarked preview (first 20 messages) still works. We will not send you through SEO Audit or Accessibility checkout (that would charge the wrong price).",
    };
  }

  const origin = shopOrigin();
  if (!origin) {
    if (allowLocalUnlock()) {
      const next = new URL(input.returnUrl);
      next.searchParams.set("session_id", LOCAL_SESSION);
      return { ok: true, checkoutUrl: next.toString(), sessionId: LOCAL_SESSION };
    }
    return {
      ok: false,
      code: "unconfigured",
      message: "Shop payments are not configured. Set NEXT_PUBLIC_SHOP_ORIGIN.",
    };
  }

  const body = JSON.stringify({
    url: input.url,
    product: TOOL_ID,
    toolId: TOOL_ID,
  });

  const result = await postSale(`${origin}/api/sale`, body);
  if (result.ok) return result;
  return { ok: false, code: "shop_error", message: result.message };
}

/**
 * Verify via shop GET /api/verify?session_id= or POST { sessionId }.
 * Unlock when ok && paid. $0 promo (paymentStatus "no_payment_required") still unlocks.
 */
export async function verifySale(sessionId: string): Promise<VerifyResult> {
  if (!sessionId) {
    return {
      ok: false,
      paid: false,
      kind: "invalid_request",
      message: "Missing checkout session id.",
    };
  }

  const origin = shopOrigin();
  if (!origin) {
    if (allowLocalUnlock() && sessionId === LOCAL_SESSION) {
      return {
        ok: true,
        paid: true,
        sessionId,
        kind: "local_unlock",
        paymentStatus: "no_payment_required",
      };
    }
    return {
      ok: false,
      paid: false,
      kind: "unconfigured",
      message: "Shop verification is not configured.",
    };
  }

  if (allowLocalUnlock() && sessionId === LOCAL_SESSION) {
    return {
      ok: true,
      paid: true,
      sessionId,
      kind: "local_unlock",
      paymentStatus: "no_payment_required",
    };
  }

  const getUrl = new URL(`${origin}/api/verify`);
  getUrl.searchParams.set("session_id", sessionId);
  const getRes = await fetch(getUrl.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const getBody = await readJson(getRes);
  if (isVerifyShape(getBody)) return normalizeVerify(getBody, sessionId);

  const postRes = await fetch(`${origin}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sessionId, session_id: sessionId }),
  });
  const postBody = await readJson(postRes);
  if (isVerifyShape(postBody)) return normalizeVerify(postBody, sessionId);

  return {
    ok: false,
    paid: false,
    kind: "invalid_response",
    message: "The shop did not confirm this sale.",
  };
}

async function postSale(url: string, body: string): Promise<SaleResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
    });
    const data = await readJson(res);
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      const checkoutUrl =
        asString(record.url) ?? asString(record.checkoutUrl) ?? asString(record.checkout_url);

      if (!res.ok || record.ok === false) {
        return {
          ok: false,
          code: "shop_error",
          message:
            asString(record.message) ??
            "The shop sale desk refused this checkout. Chat to PDF may not be on the allowlist yet.",
        };
      }

      if (record.ok === true && checkoutUrl) {
        return {
          ok: true,
          checkoutUrl,
          sessionId: asString(record.sessionId) ?? asString(record.session_id),
        };
      }
      return {
        ok: false,
        code: "shop_error",
        message: asString(record.message) ?? "The shop could not start checkout.",
      };
    }
    return { ok: false, code: "shop_error", message: "The shop could not start checkout." };
  } catch {
    return {
      ok: false,
      code: "shop_error",
      message: "Could not reach the shop payment desk.",
    };
  }
}

function isVerifyShape(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      ("paid" in (value as object) || "ok" in (value as object)),
  );
}

/** Exported for unit tests — unlock when ok&&paid OR paymentStatus no_payment_required. */
export function normalizeVerify(
  data: Record<string, unknown>,
  sessionId: string,
): VerifyResult {
  const paymentStatus = asString(data.paymentStatus) ?? asString(data.payment_status);
  const paidFlag = data.paid === true;
  const zeroPromo = paymentStatus === "no_payment_required";
  const okFlag = data.ok === true;
  const paid = okFlag && (paidFlag || zeroPromo);

  return {
    ok: paid,
    paid,
    kind: asString(data.kind),
    message: asString(data.message),
    sessionId: asString(data.sessionId) ?? asString(data.session_id) ?? sessionId,
    paymentStatus,
  };
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
