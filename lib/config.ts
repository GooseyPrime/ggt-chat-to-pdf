/** Tool registry stub — shop may list id `chat-to-pdf`, path `/tools/chat-to-pdf`. */
export const TOOL_ID = "chat-to-pdf";
export const TOOL_SLUG = "chat-to-pdf";
export const TOOL_PATH = "/tools/chat-to-pdf";
export const TOOL_NAME = "Chat to PDF";
/** Slate blue — Cos accent for this tool. */
export const ACCENT = "#6f86a6";

/** Catalogue listing — stays false until Brandon/Cos list after stranger-smoke. */
export const LIVE = false;

/** Free path converts at most this many messages (watermarked). */
export const FREE_MESSAGE_CAP = 20;

/** Paid unlock still caps for safety (no watermark). */
export const PAID_MESSAGE_MAX = 500;

export const FREE_WATERMARK = "Golden Goose Tools — free preview";

/**
 * Default mirrors shop SALE_PRODUCT_IDS after GoldenGooseTools#43.
 * Override with NEXT_PUBLIC_SHOP_SALE_PRODUCTS; omit chat-to-pdf to force sku_not_live.
 */
export const DEFAULT_SHOP_SALE_PRODUCTS =
  "seo-audit,accessibility,fix-it,a11y-statement,quote-invoice,chat-to-pdf,cottage-food-labels,maker-label-pack,listing-optimizer,domain-ssl-report";

const DRAFT_STORAGE_KEY = "ggt-chat-to-pdf-draft";

export function draftStorageKey(): string {
  return DRAFT_STORAGE_KEY;
}

type Env = Record<string, string | undefined>;

function publicEnv(): Env {
  return {
    NEXT_PUBLIC_SHOP_ORIGIN: process.env.NEXT_PUBLIC_SHOP_ORIGIN,
    NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH,
    NEXT_PUBLIC_SHOP_SALE_PRODUCTS: process.env.NEXT_PUBLIC_SHOP_SALE_PRODUCTS,
    NEXT_PUBLIC_PRICE_CENTS: process.env.NEXT_PUBLIC_PRICE_CENTS,
    NEXT_PUBLIC_ALLOW_LOCAL_UNLOCK: process.env.NEXT_PUBLIC_ALLOW_LOCAL_UNLOCK,
  };
}

export function shopOrigin(env: Env = publicEnv()): string | null {
  const raw = env.NEXT_PUBLIC_SHOP_ORIGIN?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

/**
 * Products the shop sale desk currently accepts.
 * Default mirrors main SALE_PRODUCT_IDS (includes chat-to-pdf after #43).
 * Still refuse if env omit chat-to-pdf — never fall through to SEO pricing.
 */
export function shopSaleProducts(env: Env = publicEnv()): Set<string> {
  const raw = env.NEXT_PUBLIC_SHOP_SALE_PRODUCTS?.trim();
  const list = (raw && raw.length > 0 ? raw : DEFAULT_SHOP_SALE_PRODUCTS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(list);
}

export function chatToPdfSaleLive(env: Env = publicEnv()): boolean {
  return shopSaleProducts(env).has(TOOL_ID);
}

export function allowLocalUnlock(env: Env = publicEnv()): boolean {
  return env.NEXT_PUBLIC_ALLOW_LOCAL_UNLOCK === "true";
}

export function publicBasePath(env: Env = publicEnv()): string {
  return env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") ?? "";
}
