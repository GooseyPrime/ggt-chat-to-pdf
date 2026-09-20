# Golden Goose Tools — Chat to PDF

Paste a chat transcript → download a PDF. **Free pass stays in the browser** (nothing uploaded). Watermarked preview, first **20** messages. Paid unlock (shop sale/verify desk) removes the watermark for a clean export.

- Accent: Slate blue `#6f86a6` (`--ggt-accent`)
- Registry: id `chat-to-pdf`, path `/tools/chat-to-pdf`, **`live: false`**
- Sale body: `{ url, product: "chat-to-pdf", toolId: "chat-to-pdf" }`
- Until the shop allowlist includes `chat-to-pdf`, checkout is **refused** (never falls through to `seo-audit` / `accessibility`)
- **No Stripe secrets / no Stripe SDK** in this repo
- Design kit only: `ggt-design-kit` (plain CSS — no Tailwind, no UI libraries)

## Honesty rules

- Free PDF generation is **client-side only** (`jspdf`). The pasted transcript is never sent to an API route.
- Free preview always shows a visible watermark (“Golden Goose Tools — free preview”).
- If the paste has more than 20 messages, free convert uses the first 20 and clearly says the rest need paid unlock.
- Price display uses `NEXT_PUBLIC_PRICE_CENTS` only — never invent `$5` / `500` as a runtime fallback.

## Local

```bash
npm i && npm run dev
```

Open http://localhost:3000 or http://localhost:3000/tools/chat-to-pdf

Optional local unlock (never default on / never in production):

```bash
# .env.local
NEXT_PUBLIC_ALLOW_LOCAL_UNLOCK=true
NEXT_PUBLIC_SHOP_SALE_PRODUCTS=chat-to-pdf
# NEXT_PUBLIC_PRICE_CENTS=500
```

With local unlock enabled and no shop origin, checkout redirects with `?session_id=local`.

## Checks

```bash
npm run typecheck && npm test && npm run build
```

## Pull requests

**Draft PRs only. Brandon merges.**

Do not push live or open ready-for-review PRs without Cos/Brandon sign-off. `LIVE` stays `false` until they say otherwise.
