import { describe, expect, it } from "vitest";
import { readPriceCents, shopPriceCents, shopPriceLabel } from "@/lib/prices";

describe("prices", () => {
  it("never invents cents when env is empty", () => {
    expect(shopPriceCents({ NEXT_PUBLIC_PRICE_CENTS: undefined })).toBeNull();
    expect(shopPriceLabel({ NEXT_PUBLIC_PRICE_CENTS: undefined })).toBeNull();
  });

  it("reads mirrored cents without hardcoding a runtime fallback", () => {
    expect(readPriceCents("500")).toBe(500);
    expect(readPriceCents("$5")).toBeNull();
    expect(readPriceCents("")).toBeNull();
    expect(readPriceCents("abc")).toBeNull();
    expect(shopPriceLabel({ NEXT_PUBLIC_PRICE_CENTS: "500" })).toMatch(/\$5/);
  });
});
