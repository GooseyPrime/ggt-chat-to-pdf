"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACCENT,
  FREE_MESSAGE_CAP,
  LIVE,
  TOOL_ID,
  TOOL_NAME,
  TOOL_PATH,
  chatToPdfSaleLive,
  draftStorageKey,
} from "@/lib/config";
import { startSale, verifySale } from "@/lib/payments";
import { applyMessageCap, parseTranscript } from "@/lib/parser";
import { downloadChatPdf } from "@/lib/pdf";
import { shopPriceLabel } from "@/lib/prices";
import type { ParseResult } from "@/lib/types";

export function ChatToPdfApp() {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [unlockNote, setUnlockNote] = useState("");
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [busyPdf, setBusyPdf] = useState(false);

  const saleLive = useMemo(() => chatToPdfSaleLive(), []);
  const priceLabel = useMemo(() => shopPriceLabel(), []);

  const persistDraft = useCallback((text: string) => {
    try {
      sessionStorage.setItem(draftStorageKey(), text);
    } catch {
      /* private mode / quota */
    }
  }, []);

  const restoreDraft = useCallback((): string => {
    try {
      return sessionStorage.getItem(draftStorageKey()) ?? "";
    } catch {
      return "";
    }
  }, []);

  useEffect(() => {
    const saved = restoreDraft();
    if (saved) {
      setRaw(saved);
      const result = parseTranscript(saved);
      setParsed(result.totalCount > 0 ? result : null);
    }

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id") || params.get("sessionId");
    if (!sessionId) return;

    void (async () => {
      try {
        const result = await verifySale(sessionId);
        if (result.paid) {
          setUnlocked(true);
          setUnlockNote(
            result.kind === "local_unlock"
              ? "Local unlock (dev only)."
              : "Payment verified by the shop desk. Clean PDF export is unlocked for this browser session.",
          );
          // Rebuild from in-memory / session draft — no re-upload.
          const draft = restoreDraft();
          if (draft) {
            setRaw(draft);
            const p = parseTranscript(draft);
            setParsed(p.totalCount > 0 ? p : null);
          }
        } else if (result.message) {
          setError(result.message);
        }
      } catch {
        setError("Could not verify the checkout session.");
      }
    })();
  }, [restoreDraft]);

  function onPasteChange(value: string) {
    setRaw(value);
    persistDraft(value);
    setError("");
    if (!value.trim()) {
      setParsed(null);
      return;
    }
    const result = parseTranscript(value);
    setParsed(result.totalCount > 0 ? result : null);
  }

  function onParse() {
    setError("");
    const result = parseTranscript(raw);
    if (result.totalCount === 0) {
      setParsed(null);
      setError("Could not find any messages in that paste. Try role labels like User: / Assistant:.");
      return;
    }
    setParsed(result);
    persistDraft(raw);
  }

  function onDownloadFree() {
    if (!parsed || parsed.messages.length === 0) {
      setError("Paste and parse a transcript first.");
      return;
    }
    setBusyPdf(true);
    setError("");
    try {
      const { messages, capped, omitted } = applyMessageCap(parsed.messages, {
        unlocked: false,
      });
      const note =
        capped || parsed.totalCount > FREE_MESSAGE_CAP
          ? `Free preview includes the first ${FREE_MESSAGE_CAP} of ${parsed.totalCount} messages. ${omitted || parsed.totalCount - FREE_MESSAGE_CAP} more need the paid unlock for a clean full export.`
          : undefined;
      downloadChatPdf({
        messages,
        unlocked: false,
        note,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the PDF.");
    } finally {
      setBusyPdf(false);
    }
  }

  function onDownloadClean() {
    if (!parsed || parsed.messages.length === 0) {
      setError("Paste and parse a transcript first.");
      return;
    }
    if (!unlocked) {
      setError("Clean export requires a verified shop purchase.");
      return;
    }
    setBusyPdf(true);
    setError("");
    try {
      const { messages, capped, omitted } = applyMessageCap(parsed.messages, {
        unlocked: true,
      });
      const note = capped
        ? `Export capped at ${messages.length} messages for safety (${omitted} omitted).`
        : undefined;
      downloadChatPdf({
        messages,
        unlocked: true,
        note,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the PDF.");
    } finally {
      setBusyPdf(false);
    }
  }

  async function onBuy() {
    setError("");
    setPaying(true);
    persistDraft(raw);
    try {
      const returnUrl = window.location.href.split("?")[0] ?? "/";
      const toolUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}${TOOL_PATH}`
          : TOOL_PATH;
      const result = await startSale({ url: toolUrl, returnUrl });
      if (!result.ok) {
        throw new Error(result.message);
      }
      window.location.href = result.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
      setPaying(false);
    }
  }

  const overFreeCap = (parsed?.totalCount ?? 0) > FREE_MESSAGE_CAP;
  const showPaywall = !unlocked && (overFreeCap || (parsed?.totalCount ?? 0) > 0);
  const previewSlice = parsed?.messages.slice(0, 8) ?? [];

  return (
    <main className="ggt-root" style={{ ["--ggt-accent" as string]: ACCENT }}>
      <div className="ggt-wrap">
        <header className="ggt-hero">
          <p className="ggt-eyebrow">Golden Goose Tools</p>
          <h1>{TOOL_NAME}</h1>
          <p className="ggt-lede">
            Paste a chat transcript, download a PDF. Nothing leaves the browser for the free
            pass — parsing and PDF generation stay on your device. Free preview is watermarked
            and capped at {FREE_MESSAGE_CAP} messages.
          </p>
        </header>

        <div className="ctp-field">
          <label className="ctp-label" htmlFor="ctp-paste">
            Chat transcript
          </label>
          <textarea
            id="ctp-paste"
            className="ctp-textarea ggt-input"
            placeholder={`User: Hello\nAssistant: Hi there — how can I help?\n\nOr paste Claude / ChatGPT / alternating blocks…`}
            value={raw}
            onChange={(e) => onPasteChange(e.target.value)}
            aria-label="Chat transcript paste area"
          />
        </div>

        <div className="ctp-actions ggt-input-row">
          <button className="ggt-btn" type="button" onClick={onParse}>
            Parse transcript
          </button>
          {parsed && parsed.totalCount > 0 ? (
            <button
              className="ggt-btn"
              type="button"
              disabled={busyPdf}
              onClick={onDownloadFree}
            >
              {busyPdf ? "Building…" : "Download PDF (free preview)"}
            </button>
          ) : null}
          {unlocked && parsed && parsed.totalCount > 0 ? (
            <button
              className="ggt-btn"
              type="button"
              disabled={busyPdf}
              onClick={onDownloadClean}
            >
              {busyPdf ? "Building…" : "Download clean PDF"}
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="ctp-error" role="alert">
            {error}
          </p>
        ) : null}

        {parsed && parsed.totalCount > 0 ? (
          <section className="ggt-result" id="ctp-results">
            <p className="ctp-note" style={{ marginTop: 0 }}>
              Found <strong>{parsed.totalCount}</strong> message
              {parsed.totalCount === 1 ? "" : "s"} · parse mode: {parsed.mode}
              {overFreeCap && !unlocked
                ? ` · free path uses the first ${FREE_MESSAGE_CAP}; the rest need paid unlock`
                : null}
            </p>

            <ul className="ctp-preview" aria-label="Message preview">
              {previewSlice.map((m, i) => (
                <li key={`${m.role}-${i}`}>
                  <span className="ctp-role">
                    {m.role}
                    {m.meta ? ` · ${m.meta}` : ""}
                  </span>
                  <span className="ctp-snippet">
                    {m.content.slice(0, 140) || "(empty)"}
                    {m.content.length > 140 ? "…" : ""}
                  </span>
                </li>
              ))}
            </ul>
            {parsed.totalCount > previewSlice.length ? (
              <p className="ctp-note">
                Showing first {previewSlice.length} of {parsed.totalCount} in the preview list.
              </p>
            ) : null}
          </section>
        ) : null}

        {unlocked ? (
          <div className="ctp-unlocked">
            <h2>Clean export unlocked</h2>
            <p className="ctp-note">{unlockNote}</p>
            <p className="ctp-note">
              Your paste stays in this browser session (sessionStorage draft). Download the
              clean PDF above — still no upload to our servers.
            </p>
          </div>
        ) : null}

        {showPaywall ? (
          <>
            <aside className="ggt-tally ggt-tally--locked" aria-label="Locked clean export">
              <p style={{ margin: 0 }}>
                {parsed?.totalCount ?? 0} messages · clean export locked · free cap{" "}
                {FREE_MESSAGE_CAP}
              </p>
            </aside>

            <section className="ggt-paywall">
              <h2>Unlock clean PDF export</h2>
              {priceLabel ? (
                <p className="ggt-price">{priceLabel}</p>
              ) : (
                <p className="ctp-note">
                  Price comes from the shop config when the {TOOL_ID} SKU is live. This tool
                  never invents a dollar amount.
                </p>
              )}
              <p className="ctp-note">
                Removes the watermark and exports the full transcript (reasonable safety cap
                applies). Checkout goes through the Golden Goose Tools shop sale desk — no
                Stripe keys in this app.
              </p>

              {!saleLive ? (
                <p className="ctp-note" role="status">
                  Checkout is not live yet for Chat to PDF on the shop sale desk. Until the
                  shop allowlist includes <code>{TOOL_ID}</code>, we refuse checkout so you
                  are not billed as SEO Audit. The free watermarked preview still works.
                </p>
              ) : null}

              <div className="ctp-actions">
                <button
                  className="ggt-btn"
                  type="button"
                  disabled={paying || !saleLive}
                  onClick={() => void onBuy()}
                  title={
                    saleLive
                      ? "Checkout via shop sale desk"
                      : "Checkout disabled until chat-to-pdf is on the shop allowlist"
                  }
                >
                  {paying
                    ? "Starting checkout…"
                    : saleLive
                      ? priceLabel
                        ? `Unlock clean export — ${priceLabel}`
                        : "Unlock clean export"
                      : "Checkout not live yet"}
                </button>
              </div>
            </section>
          </>
        ) : null}

        <p className="ggt-trust">
          Free pass: in-browser only · no transcript upload · draft PRs · Brandon merges ·
          live={String(LIVE)}
        </p>
      </div>
    </main>
  );
}
