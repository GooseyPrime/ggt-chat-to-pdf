import { afterEach, describe, expect, it } from "vitest";
import { startSale } from "@/lib/payments";

const ORIGINAL = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL);
});

describe("startSale", () => {
  it("refuses checkout when chat-to-pdf is not on the shop allowlist", async () => {
    process.env.NEXT_PUBLIC_SHOP_SALE_PRODUCTS = "seo-audit,accessibility";
    process.env.NEXT_PUBLIC_SHOP_ORIGIN = "https://goldengoosetools.com";
    delete process.env.NEXT_PUBLIC_ALLOW_LOCAL_UNLOCK;

    const result = await startSale({
      url: "https://goldengoosetools.com/tools/chat-to-pdf",
      returnUrl: "https://tool.example/tools/chat-to-pdf",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("sku_not_live");
      expect(result.message.toLowerCase()).toMatch(/not live|seo|accessibility/);
    }
  });

  it("does not return a checkout URL when SKU is missing (no fallthrough)", async () => {
    process.env.NEXT_PUBLIC_SHOP_SALE_PRODUCTS = "seo-audit,accessibility";
    process.env.NEXT_PUBLIC_SHOP_ORIGIN = "https://goldengoosetools.com";

    const result = await startSale({
      url: "https://example.com/tools/chat-to-pdf",
      returnUrl: "https://tool.example/",
    });

    expect(result.ok).toBe(false);
    expect("checkoutUrl" in result).toBe(false);
  });
});
