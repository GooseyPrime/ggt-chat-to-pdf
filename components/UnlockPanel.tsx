"use client";

import { useEffect, useMemo, useState } from "react";
import { FREE_MESSAGE_CAP, TOOL_PATH, chatToPdfSaleLive } from "@/lib/config";
import { startSale, verifySale } from "@/lib/payments";
import { shopPriceLabel } from "@/lib/prices";

const SRC_PAGE = "ggt-chat-to-pdf-page";
const SRC_EXT = "ggt-chat-to-pdf-extension";

type Phase = "idle" | "verifying" | "paid" | "error";

/**
 * Unlock flow: shop checkout (existing /api/sale) -> return with ?session_id -> shop /api/verify ->
 * hand the paid session id to the extension through its bridge content script (which re-verifies).
 * The price shown comes only from NEXT_PUBLIC_PRICE_CENTS, which mirrors the shop's config.
 */
export function UnlockPanel() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [session, setSession] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [extension, setExtension] = useState<"unknown" | "detected" | "activated" | "failed">("unknown");
  const [copied, setCopied] = useState(false);
  const saleLive = useMemo(() => chatToPdfSaleLive(), []);
  const priceLabel = useMemo(() => shopPriceLabel(), []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return;
      const d = e.data as { source?: string; type?: string; ok?: boolean } | null;
      if (!d || d.source !== SRC_EXT) return;
      if (d.type === "hello") setExtension((cur) => (cur === "activated" ? cur : "detected"));
      if (d.type === "activated") setExtension(d.ok ? "activated" : "failed");
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ source: SRC_PAGE, type: "ping" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("session_id") || params.get("sessionId");
    if (!id) return;
    setPhase("verifying");
    void (async () => {
      try {
        const result = await verifySale(id);
        if (result.paid) {
          setSession(id);
          setPhase("paid");
          window.postMessage({ source: SRC_PAGE, type: "activate", sessionId: id }, window.location.origin);
          window.history.replaceState(null, "", `${window.location.pathname}#unlock`);
        } else {
          setPhase("error");
          setMessage(result.message || "We couldn't confirm that payment for Chat to PDF.");
        }
      } catch {
        setPhase("error");
        setMessage("Could not verify the checkout session. Please try again.");
      }
    })();
  }, []);

  async function onBuy() {
    setBusy(true);
    setMessage("");
    try {
      const url = new URL(window.location.href);
      url.search = "";
      url.hash = "";
      const returnUrl = new URL(url.toString());
      const res = await startSale({ url: url.toString(), returnUrl: returnUrl.toString() });
      if (res.ok) window.location.assign(res.checkoutUrl);
      else setMessage(res.message);
    } finally {
      setBusy(false);
    }
  }

  function activateAgain() {
    window.postMessage({ source: SRC_PAGE, type: "activate", sessionId: session }, window.location.origin);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(session);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section id="unlock" className="ctp-section" aria-labelledby="unlock-h">
      <h2 id="unlock-h">Free and clean editions</h2>
      <div className="ctp-tiers">
        <div className="ctp-tier">
          <h3>Free</h3>
          <ul>
            <li>Watermarked PDFs</li>
            <li>First {FREE_MESSAGE_CAP} messages of a chat</li>
            <li>Every other feature included</li>
          </ul>
        </div>
        <div className="ctp-tier ctp-tier--paid">
          <h3>
            Clean {priceLabel ? <span className="ctp-price">{priceLabel}</span> : null}
          </h3>
          <ul>
            <li>No watermark, no branding</li>
            <li>Whole conversation, any length</li>
            <li>One-time purchase, unlocks the extension on this browser</li>
          </ul>
        </div>
      </div>

      {phase === "verifying" ? <p role="status">Confirming your payment with the shop…</p> : null}

      {phase === "paid" ? (
        <div className="ctp-callout" role="status">
          <h3>Payment confirmed — clean PDFs unlocked</h3>
          {extension === "activated" ? (
            <p>The extension in this browser is unlocked. Your next PDF will have no watermark.</p>
          ) : (
            <>
              <p>
                {extension === "detected" || extension === "failed"
                  ? "We found the extension in this browser but couldn't activate it automatically."
                  : "Install the extension (above) in this browser, or activate it manually:"}{" "}
                Open the export window, choose <strong>I already unlocked</strong>, and paste this code:
              </p>
              <p className="ctp-code">
                <code>{session}</code>{" "}
                <button type="button" className="ggt-btn" onClick={copy}>
                  {copied ? "Copied" : "Copy code"}
                </button>
              </p>
              {extension === "detected" || extension === "failed" ? (
                <button type="button" className="ggt-btn" onClick={activateAgain}>
                  Try activating again
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className="ctp-buy">
          {saleLive ? (
            <button type="button" className="ggt-btn" onClick={onBuy} disabled={busy}>
              {busy ? "Opening checkout…" : priceLabel ? `Unlock clean PDFs — ${priceLabel}` : "Unlock clean PDFs"}
            </button>
          ) : (
            <p className="ctp-muted">Checkout for the clean edition isn&apos;t open yet. The free edition works today.</p>
          )}
          <p className="ctp-muted">
            Payment is handled by the Golden Goose Tools shop (Stripe). The extension never sees card details, and the price is
            always the one shown at checkout.
          </p>
          {phase === "error" || message ? (
            <p className="ctp-error" role="alert">
              {message}
            </p>
          ) : null}
        </div>
      )}
      <p className="ctp-muted ctp-tiny">
        Tool page: <code>{TOOL_PATH}</code>
      </p>
    </section>
  );
}
