import { describe, expect, it } from "vitest";
import { languageFamily, tokenize } from "../extension/src/pdf/highlight";

const kinds = (code: string, lang: string) => tokenize(code, lang).map((l) => l.map((t) => `${t.kind}:${t.text}`));

describe("highlight tokenizer", () => {
  it("python keywords, strings, comments, numbers", () => {
    expect(kinds('def f(x):  # hi\n    return "a" + 1', "python")).toEqual([
      ["kw:def", "plain: ", "fn:f", "plain:(x):  ", "com:# hi"],
      ["plain:    ", "kw:return", "plain: ", "str:\"a\"", "plain: + ", "num:1"],
    ]);
  });
  it("javascript block comments span lines and template strings", () => {
    const lines = tokenize("/* a\n b */ const x = `t`;", "ts");
    expect(lines).toHaveLength(2);
    expect(lines[0][0]).toEqual({ text: "/* a", kind: "com" });
    expect(lines[1][0]).toEqual({ text: " b */", kind: "com" });
    expect(lines[1].some((t) => t.kind === "str" && t.text === "`t`")).toBe(true);
  });
  it("unknown languages are left plain, text is never lost", () => {
    const code = "weird ## stuff 'x'";
    expect(tokenize(code, "brainfudge")).toEqual([[{ text: code, kind: "plain" }]]);
    expect(tokenize(code, "")[0][0].text).toBe(code);
  });
  it("aliases", () => {
    expect(languageFamily("TypeScript")).toBe("js");
    expect(languageFamily("sh")).toBe("sh");
    expect(languageFamily("excel")).toBeNull();
  });
  it("round-trips arbitrary code", () => {
    const code = 'if (a < "b\\"c") {\n\treturn 0x1F; // x\n}\n';
    expect(tokenize(code, "c").map((l) => l.map((t) => t.text).join("")).join("\n")).toBe(code.replace(/\n$/, "\n"));
  });
});
