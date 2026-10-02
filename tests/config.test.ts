import { describe, expect, it } from "vitest";
import { chatToPdfSaleLive, shopSaleProducts } from "@/lib/config";

describe("shopSaleProducts", () => {
  it("uses default products when the override is unset", () => {
    expect(chatToPdfSaleLive({ NEXT_PUBLIC_SHOP_SALE_PRODUCTS: undefined })).toBe(true);
  });

  it.each(["", "   "])("disables all products for an empty override %j", (override) => {
    expect(shopSaleProducts({ NEXT_PUBLIC_SHOP_SALE_PRODUCTS: override })).toEqual(new Set());
    expect(chatToPdfSaleLive({ NEXT_PUBLIC_SHOP_SALE_PRODUCTS: override })).toBe(false);
  });

  it("uses explicitly configured products", () => {
    expect(shopSaleProducts({ NEXT_PUBLIC_SHOP_SALE_PRODUCTS: " seo-audit, accessibility " }))
      .toEqual(new Set(["seo-audit", "accessibility"]));
  });
});
