# Registry stub — Chat to PDF

| Field | Value |
| --- | --- |
| id / product / toolId | `chat-to-pdf` |
| path | `/tools/chat-to-pdf` (install / landing page for the browser extension) |
| live | `false` until Cos/Brandon stranger-smoke |
| theme | Iris (`data-ggt-theme="iris"`, accent `#9b8ae0`) |
| product | Browser extension (Chrome/Edge MV3 + Firefox build) for ChatGPT, Gemini, Copilot, Claude |
| free | Watermarked PDFs, first 20 messages, processed locally |
| paid | Clean PDFs via shop sale/verify; price from shop `NEXT_PUBLIC_PRICE_CENTS` (display only; the shop owns the amount) |
| group | Shop |

## Sale desk

Shop `POST /api/sale` body:

```json
{ "url": "https://www.goldengoosetools.com/tools/chat-to-pdf", "product": "chat-to-pdf", "toolId": "chat-to-pdf" }
```

Single SKU — no standard/plus variants. Amount from shop config only. Verification: `GET /api/verify?session_id=`
must return `ok` + paid (or `no_payment_required`) + `product: "chat-to-pdf"`; the extension performs the same check.

This app still **refuses checkout** until `NEXT_PUBLIC_SHOP_SALE_PRODUCTS` includes `chat-to-pdf` (mirrors the desk).
No fallthrough to another product.
