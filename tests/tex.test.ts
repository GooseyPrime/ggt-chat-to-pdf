import { describe, expect, it } from "vitest";
import { texToText } from "../extension/src/pdf/tex";

describe("texToText", () => {
  it.each([
    ["E = mc^2", "E = mc²"],
    ["x_1 + x_2", "x₁ + x₂"],
    ["\\alpha + \\beta \\leq \\gamma", "α + β ≤ γ"],
    ["\\frac{a}{b}", "a/b"],
    ["\\frac{a+b}{c}", "(a+b)/c"],
    ["\\sqrt{x}", "√x"],
    ["\\sqrt{x+1}", "√(x+1)"],
    ["\\sum_{i=1}^{n} x_i", "∑ᵢ₌₁ⁿ xᵢ"],
    ["\\int_0^\\infty e^{-x} dx", "∫₀^∞ e⁻ˣ dx".replace("e⁻ˣ", "e^(−x)")],
    ["\\mathbb{R}^n", "ℝⁿ"],
    ["\\text{if } x > 0", "if x > 0"],
    ["a \\times b \\cdot c", "a × b · c"],
    ["\\left( \\frac{1}{2} \\right)", "( 1/2 )"],
    ["\\hat{x}", "x\u0302"],
  ])("%s", (tex, out) => {
    expect(texToText(tex)).toBe(out);
  });

  it("falls back gracefully on unknown commands", () => {
    expect(texToText("\\foo{x}")).toContain("foo");
  });
  it("converts a small matrix", () => {
    expect(texToText("\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}")).toBe("[ 1, 2; 3, 4 ]");
  });
});
