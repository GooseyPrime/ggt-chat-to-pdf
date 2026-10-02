/**
 * Product constants shared by the extension. NOTE: no price lives here — the price is owned by the
 * shop (lib/config.ts in the shop repo) and only ever shown on the shop/landing page.
 */
export const TOOL_ID = "chat-to-pdf";
export const FREE_MESSAGE_CAP = 20;
export const FREE_WATERMARK_TITLE = "FREE PREVIEW";
export const FREE_WATERMARK_TEXT = "Golden Goose Tools — free preview";
export const CREATOR = "Chat to PDF — Golden Goose Tools";

/** Injected at build time (scripts/build-extension.mjs); safe defaults for tests / dev. */
declare const __SHOP_ORIGIN__: string;
declare const __TOOL_URL__: string;
export const SHOP_ORIGIN: string = typeof __SHOP_ORIGIN__ !== "undefined" ? __SHOP_ORIGIN__ : "https://www.goldengoosetools.com";
export const TOOL_URL: string = typeof __TOOL_URL__ !== "undefined" ? __TOOL_URL__ : `${SHOP_ORIGIN}/tools/chat-to-pdf`;
