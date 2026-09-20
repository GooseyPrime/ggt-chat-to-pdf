# Registry stub — Chat to PDF

| Field | Value |
| --- | --- |
| id / product / toolId | `chat-to-pdf` |
| path | `/tools/chat-to-pdf` |
| live | `false` until Cos/Brandon stranger-smoke |
| accent | Slate blue `#6f86a6` (`--ggt-accent`) |
| free | Paste → PDF in-browser, watermarked, first 20 messages |
| paid | Clean export via shop sale/verify; price from shop `NEXT_PUBLIC_PRICE_CENTS` (500¢ / $5) |
| group | Shop |

## Sale desk

Shop `POST /api/sale` body:

```json
{ "url": "https://goldengoosetools.com/tools/chat-to-pdf", "product": "chat-to-pdf", "toolId": "chat-to-pdf" }
```

Single SKU — no standard/plus variants. Amount from shop config only.

**GoldenGooseTools#43** restored `chat-to-pdf` on main `SALE_PRODUCT_IDS`. Default `NEXT_PUBLIC_SHOP_SALE_PRODUCTS` includes `chat-to-pdf` so paid checkout is live when shop origin is configured. Catalogue `live` stays **false** until Brandon lists. Override env to omit `chat-to-pdf` if you need to force `sku_not_live`.
