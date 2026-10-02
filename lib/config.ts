/** Tool registry stub — shop may list id `chat-to-pdf`, path `/tools/chat-to-pdf`. */
export const TOOL_ID = "chat-to-pdf";
export const TOOL_SLUG = "chat-to-pdf";
export const TOOL_PATH = "/tools/chat-to-pdf";
export const TOOL_NAME = "Chat to PDF";
/** Page theme id from ggt-design-kit (Iris). */
export const THEME = "iris";

export const LIVE = false;

/** Free tier: watermarked PDFs of at most this many messages (mirrors extension/src/constants.ts; tested). */
export const FREE_MESSAGE_CAP = 20;

export const FREE_WATERMARK = "Golden Goose Tools — free preview";

/**
 * Store listings. Leave null until a listing is live — the install page then shows a
 * "coming soon" placeholder instead of a link.
 */
export const STORE_LINKS: { chrome: string | null; edge: string | null; firefox: string | null } = {
  chrome: null,
  edge: null,
  firefox: null,
};

/** Supported chat sites (mirrors extension/src/parsers; tested). */
export const SUPPORTED_SITES = [
  { id: "chatgpt", name: "ChatGPT", host: "chatgpt.com" },
  { id: "gemini", name: "Google Gemini", host: "gemini.google.com" },
  { id: "copilot", name: "Microsoft Copilot", host: "copilot.microsoft.com" },
  { id: "claude", name: "Claude", host: "claude.ai" },
] as const;

const DEFAULT_SALE_PRODUCTS =
  "seo-audit,accessibility,fix-it,a11y-statement,quote-invoice,chat-to-pdf,cottage-food-labels,maker-label-pack,listing-optimizer,domain-ssl-report";

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
 * Products the shop sale desk accepts (mirrors SALE_PRODUCT_IDS in the shop).
 * Override with NEXT_PUBLIC_SHOP_SALE_PRODUCTS; an empty value disables all products.
 * If it omits `chat-to-pdf`, checkout refuses rather than falling through to another product's price.
 */
export function shopSaleProducts(env: Env = publicEnv()): Set<string> {
  const raw = env.NEXT_PUBLIC_SHOP_SALE_PRODUCTS;
  const list = (raw === undefined ? DEFAULT_SALE_PRODUCTS : raw.trim())
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(list);
}

export function chatToPdfSaleLive(env: Env = publicEnv()): boolean {
  return shopSaleProducts(env).has(TOOL_ID);
}

export function allowLocalUnlock(env: Env = publicEnv()): boolean {
  // Development only: never honoured in a production build.
  return process.env.NODE_ENV !== "production" && env.NEXT_PUBLIC_ALLOW_LOCAL_UNLOCK === "true";
}

export function publicBasePath(env: Env = publicEnv()): string {
  return env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") ?? "";
}
