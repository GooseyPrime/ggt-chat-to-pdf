# Golden Goose Tools — Chat to PDF

A **browser extension** (Chrome / Edge Manifest V3, Firefox-compatible build) that turns a conversation on
**ChatGPT, Google Gemini, Microsoft Copilot or Claude** into a nicely formatted PDF in one or two clicks.
Everything is processed locally in the browser — nothing is uploaded.

This repo contains

| Path | What |
| --- | --- |
| `extension/` | The extension (TypeScript, bundled with esbuild, **no UI libraries / no Tailwind**) |
| `app/`, `components/`, `lib/` | The Next.js install page served at **`/tools/chat-to-pdf`** (install steps, supported sites, privacy statement, zip download, store-link placeholders, unlock flow) |
| `scripts/` | `build-extension.mjs` (bundle + package + zip), `e2e.mjs` (real-Chromium run), icon/zip helpers |
| `tests/` | Vitest unit tests + saved HTML fixtures per site (`tests/fixtures/<site>/`) |
| `docs/` | [Updating selectors](docs/UPDATING-SELECTORS.md) · [What was verified and how](docs/VERIFICATION.md) |

## How the extension works

1. Click the toolbar button on a chat page. The popup injects a content script **on demand** (`activeTab` +
   `scripting`; there are no always-on content scripts on the chat sites).
2. **Export whole chat** or **Choose messages…**. The content script scrolls the conversation to load
   lazily-loaded history, then sweeps down collecting messages (virtualised lists are handled by
   `content/merge.ts`). Each site has its own parser in `extension/src/parsers/<site>.ts`.
3. A studio tab opens (title, page size, table of contents on/off, per-message checklist) and builds the PDF
   with jsPDF through our own layout engine (`extension/src/pdf/`): title page, optional TOC with links, headers,
   “Page X of Y”, user vs assistant styling, syntax-coloured code, tables, lists, quotes, math, link
   annotations, PDF bookmarks.
4. **Free edition**: watermark + first 20 messages (`FREE_MESSAGE_CAP`). **Clean edition**: unlocked through the
   shop's existing sale/verify flow — see below.

### Editions / unlock (price comes from the shop only)

* The install page's **Unlock** button runs the existing flow: `POST {shop}/api/sale`
  `{ url, product: "chat-to-pdf", toolId: "chat-to-pdf" }` → Stripe Checkout on the shop → return with
  `?session_id=` → `GET {shop}/api/verify?session_id=` (must be `ok`, paid or zero-amount promo, and
  `product === "chat-to-pdf"`).
* On success the page hands the session id to the extension (a tiny bridge content script that runs only on
  the shop's `/tools/chat-to-pdf` page); the extension **re-verifies with the shop itself**, caches the result
  (re-check every 24 h, 14-day offline grace). Fallback: paste the code into *I already unlocked* in the
  studio window.
* **No price is hard-coded in the extension** (a test enforces it for `extension/`). The page shows a price label only
  from `NEXT_PUBLIC_PRICE_CENTS`, which mirrors the shop config. No Stripe secrets or SDK in this repo.

## Develop

```bash
npm install
npm run typecheck && npm test        # unit tests (parsers on fixtures, PDF engine, licence, build)
npm run build:extension              # dist/extension-{chromium,firefox}/ + dist/chat-to-pdf-*-v<version>.zip + SHA256SUMS
npm run dev                          # install page at http://localhost:3000/tools/chat-to-pdf
```

Load for manual testing: `chrome://extensions` → Developer mode → **Load unpacked** → `dist/extension-chromium`
(Firefox: `about:debugging` → *Load Temporary Add-on* → `dist/extension-firefox/manifest.json`).

End-to-end (real Chromium, fixtures served at the real hostnames via network interception):

```bash
npx playwright-core install chromium
node scripts/build-extension.mjs --target test --no-public && node scripts/e2e.mjs   # needs pdftotext for PDF checks
```

`npm run build` runs `prebuild`, which builds the extension zips into `public/downloads/` so the install page
can serve them at `/tools/chat-to-pdf/downloads/…`. Build-time overrides: `CTP_SHOP_ORIGIN`, `CTP_TOOL_URL`.

PDF sample generation: `PDF_OUT=/some/dir npx vitest run tests/pdf.test.ts` writes the fixture PDFs.

## Page theme

`<html data-ggt-theme="iris">` — palette comes from `ggt-design-kit` page themes (pinned to the kit's theme
commit); fonts and component styling are the kit's. Plain CSS only.

## Pull requests

**Draft PRs only. Brandon merges.** `LIVE` stays `false` until Cos/Brandon sign off.
