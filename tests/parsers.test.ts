// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { chatgpt, claude, copilot, gemini, siteForHost } from "../extension/src/parsers";
import { blocksText } from "../extension/src/model";
import { find, kinds, loadFixture, readAll } from "./helpers/load";

/** Shared expectations: nothing leaks literal markdown, UI chrome or hidden text into the output. */
function expectClean(messages: ReturnType<typeof readAll>) {
  for (const m of messages) {
    const t = blocksText(m.blocks);
    expect(t, "literal fence").not.toContain("```");
    expect(t, "copy button text").not.toMatch(/\bCopy code\b|\bCopy message\b|Thought process/);
    expect(t).not.toMatch(/You said|ChatGPT said/);
  }
}

describe("site routing", () => {
  it("maps hosts to parsers", () => {
    expect(siteForHost("chatgpt.com")?.id).toBe("chatgpt");
    expect(siteForHost("chat.openai.com")?.id).toBe("chatgpt");
    expect(siteForHost("gemini.google.com")?.id).toBe("gemini");
    expect(siteForHost("copilot.microsoft.com")?.id).toBe("copilot");
    expect(siteForHost("claude.ai")?.id).toBe("claude");
    expect(siteForHost("www.claude.ai")?.id).toBe("claude");
    expect(siteForHost("evilclaude.ai")).toBeNull();
    expect(siteForHost("example.com")).toBeNull();
  });
});

describe("ChatGPT parser", () => {
  it("reads roles, title, model", () => {
    loadFixture("chatgpt");
    const msgs = readAll(chatgpt);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(chatgpt.title(document)).toBe("Sorting algorithms explained");
    expect(chatgpt.model(document)).toBe("GPT-4o");
    expect(msgs[1].key).toBe("m-asst-1");
    expectClean(msgs);
  });

  it("turns the user's raw ``` fence into a code block and `x` into inline code", () => {
    loadFixture("chatgpt");
    const [user] = readAll(chatgpt);
    const code = find(user.blocks, "code");
    expect(code).toHaveLength(1);
    expect(code[0]).toMatchObject({ lang: "python", text: "def qs(a):\n    return a" });
    expect(JSON.stringify(user.blocks)).toContain('"code":true');
    expect(kinds(user.blocks)[0]).toBe("p"); // image placeholder first
    expect(JSON.stringify(user.blocks[0])).toContain("Uploaded image");
  });

  it("parses markdown structures of the assistant answer", () => {
    loadFixture("chatgpt");
    const a = readAll(chatgpt)[1].blocks;
    expect(find(a, "h")[0]).toMatchObject({ level: 2 });
    const lists = find(a, "list");
    expect(lists.length).toBe(3); // top-level ul, nested ul, ol
    expect(lists.find((l) => l.ordered)?.start).toBe(3);
    const code = find(a, "code")[0];
    expect(code.lang).toBe("python");
    expect(code.text).toMatch(/^def quicksort\(items\):\n {4}if len\(items\) <= 1:/);
    expect(code.text).not.toContain("Copy");
    const table = find(a, "table")[0];
    expect(table.rows).toHaveLength(3);
    expect(table.rows[0].header).toBe(true);
    expect(table.align).toEqual(["left", "right", "left"]);
    const maths = JSON.stringify(a);
    expect(maths).toContain('"tex":"T(n) = 2T(n/2) + n"');
    expect(find(a, "math")[0].tex).toBe("T(n) = \\Theta(n \\log n)");
    expect(find(a, "quote")).toHaveLength(1);
    expect(maths).toContain('"link":"https://en.wikipedia.org/wiki/Quicksort"');
    expect(maths).toContain("Recursion tree diagram");
    expect(kinds(a)).toContain("hr");
  });
});

describe("Claude parser", () => {
  it("reads roles, title, model, excludes thinking blocks and action buttons", () => {
    loadFixture("claude");
    const msgs = readAll(claude);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(claude.title(document)).toBe("Refactoring a config loader");
    expect(claude.model(document)).toBe("Claude Sonnet 4.5");
    const t = blocksText(msgs[1].blocks);
    expect(t).not.toContain("internal reasoning");
    expect(t).not.toContain("Retry");
    expectClean(msgs);
  });

  it("parses code with language label, ordered list, table, artifact, math", () => {
    loadFixture("claude");
    const [user, asst] = readAll(claude);
    expect(JSON.stringify(user.blocks)).toContain('"code":true');
    expect(JSON.stringify(user.blocks)).toContain('"br"');
    const code = find(asst.blocks, "code")[0];
    expect(code.lang).toBe("typescript");
    expect(code.text).toContain("cache ??= JSON.parse");
    expect(code.text).not.toContain("Copy");
    expect(find(asst.blocks, "table")[0].rows).toHaveLength(2);
    expect(find(asst.blocks, "attach")[0]).toMatchObject({ kind: "artifact", label: "Artifact: Config loader" });
    expect(JSON.stringify(asst.blocks)).toContain('"tex":"O(1)"');
  });
});

describe("Gemini parser", () => {
  it("reads custom elements, title from the selected sidebar entry, model", () => {
    loadFixture("gemini");
    const msgs = readAll(gemini);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(gemini.title(document)).toBe("Planning a trip to Lisbon");
    expect(gemini.model(document)).toBe("Gemini 2.5 Pro");
    expect(blocksText(msgs[0].blocks)).toBe("Plan three days in Lisbon.\nBudget is moderate.");
    const t = blocksText(msgs[1].blocks);
    expect(t).not.toContain("must be excluded");
    expect(t).not.toContain("Share");
    expectClean(msgs);
  });

  it("parses code-block elements, tables, data-math", () => {
    loadFixture("gemini");
    const a = readAll(gemini)[1].blocks;
    const code = find(a, "code")[0];
    expect(code.lang).toBe("python");
    expect(code.text).toBe('budget = {"hotel": 90, "food": 45}\nprint(sum(budget.values()))');
    expect(find(a, "table")[0].rows).toHaveLength(3);
    expect(JSON.stringify(a)).toContain('"tex":"\\\\frac{120+95}{2}"');
    expect(find(a, "math")[0].tex).toBe("\\sum_{i=1}^{n} x_i");
    expect(find(a, "h")[0].level).toBe(3);
  });

  it("falls back to the document title and handles an empty page", () => {
    document.open();
    document.write("<html><head><title>Gemini - Taxes</title></head><body></body></html>");
    document.close();
    expect(gemini.collect(document)).toEqual([]);
    expect(gemini.title(document)).toBe("Taxes");
  });
});

describe("Copilot parser", () => {
  it("reads group/user-message and group/ai-message turns; drops reactions", () => {
    loadFixture("copilot");
    const msgs = readAll(copilot);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(copilot.title(document)).toBe("Spreadsheet formulas");
    const t = blocksText(msgs[1].blocks);
    expect(t).not.toMatch(/Like|Dislike/);
    expectClean(msgs);
  });

  it("parses code wrapper with language header, table without thead, strike, link", () => {
    loadFixture("copilot");
    const a = readAll(copilot)[1].blocks;
    const code = find(a, "code")[0];
    expect(code).toMatchObject({ lang: "excel", text: '=SUMIF(A:A, "<>")\n=SUM(A2:A100)' });
    const table = find(a, "table")[0];
    expect(table.rows).toHaveLength(3);
    expect(table.rows[0].header).toBe(true);
    expect(JSON.stringify(a)).toContain('"strike":true');
    expect(JSON.stringify(a)).toContain("support.microsoft.com/excel");
  });
});

describe("defensive behaviour", () => {
  it("returns no messages (not an error) on an unrelated page", () => {
    document.open();
    document.write("<html><body><h1>Hello</h1></body></html>");
    document.close();
    for (const s of [chatgpt, claude, gemini, copilot]) expect(s.collect(document)).toEqual([]);
  });

  it("ChatGPT falls back to [data-message-author-role] when turn wrappers are gone", () => {
    document.open();
    document.write(`<html><body>
      <div data-message-author-role="user"><div class="whitespace-pre-wrap">hi</div></div>
      <div data-message-author-role="assistant"><div class="markdown"><p>hello</p></div></div></body></html>`);
    document.close();
    const msgs = readAll(chatgpt);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(blocksText(msgs[1].blocks)).toBe("hello");
  });

  it("unknown wrapper classes still yield text (generic container fallback)", () => {
    document.open();
    document.write(`<html><body><div data-testid="user-message"><div class="x9"><span>Plain</span> <span>text</span></div></div></body></html>`);
    document.close();
    expect(blocksText(readAll(claude)[0].blocks)).toBe("Plain text");
  });
});
