import { describe, expect, it } from "vitest";
import { FREE_MESSAGE_CAP } from "@/lib/config";
import { applyMessageCap, freePreviewMessages, parseTranscript } from "@/lib/parser";

describe("parseTranscript", () => {
  it("counts User:/Assistant: role lines as discrete messages", () => {
    const raw = [
      "User: Hello there",
      "Assistant: Hi! How can I help?",
      "User: Summarize this.",
      "Assistant: Sure — here is a summary.",
    ].join("\n");
    const result = parseTranscript(raw);
    expect(result.mode).toBe("roles");
    expect(result.totalCount).toBe(4);
    expect(result.messages[0]?.role).toBe("User");
    expect(result.messages[1]?.role).toBe("Assistant");
  });

  it("recognizes ChatGPT / Claude / Human / You / System labels", () => {
    const raw = [
      "Human: ping",
      "Claude: pong",
      "You: again",
      "ChatGPT: ok",
      "System: note",
    ].join("\n");
    const result = parseTranscript(raw);
    expect(result.totalCount).toBe(5);
    expect(result.messages.map((m) => m.role)).toEqual([
      "Human",
      "Claude",
      "You",
      "ChatGPT",
      "System",
    ]);
  });

  it("parses markdown-ish role headers", () => {
    const raw = ["**User**", "Hello", "", "### Assistant", "World"].join("\n");
    const result = parseTranscript(raw);
    expect(result.mode).toBe("markdown");
    expect(result.totalCount).toBe(2);
    expect(result.messages[0]?.content).toContain("Hello");
    expect(result.messages[1]?.role).toBe("Assistant");
  });

  it("falls back to alternating blank-line blocks labeled Message N", () => {
    const raw = "First block here\n\nSecond block here\n\nThird block";
    const result = parseTranscript(raw);
    expect(result.mode).toBe("alternating");
    expect(result.totalCount).toBe(3);
    expect(result.messages[0]?.role).toBe("Message 1");
    expect(result.messages[2]?.role).toBe("Message 3");
  });

  it("keeps bracket timestamps as meta without inventing speakers", () => {
    const raw = ["[2024-01-01 12:00] User: hi", "Assistant: hello"].join("\n");
    const result = parseTranscript(raw);
    expect(result.totalCount).toBe(2);
    expect(result.messages[0]?.meta).toBe("2024-01-01 12:00");
    expect(result.messages[0]?.role).toBe("User");
  });

  it("does not force roles mode for a single non-solid role hit", () => {
    const result = parseTranscript("User:");
    expect(result.mode).toBe("alternating");
    expect(result.messages[0]?.role).toBe("Message 1");
  });

  it("still allows one solid role message", () => {
    const result = parseTranscript("User: Hello");
    expect(result.mode).toBe("roles");
    expect(result.totalCount).toBe(1);
    expect(result.messages[0]?.role).toBe("User");
  });
});

describe("20-message free cap", () => {
  function manyMessages(n: number): string {
    return Array.from({ length: n }, (_, i) =>
      i % 2 === 0 ? `User: msg ${i + 1}` : `Assistant: reply ${i + 1}`,
    ).join("\n");
  }

  it("reports totalCount above 20 while freePreviewMessages slices to 20", () => {
    const result = parseTranscript(manyMessages(30));
    expect(result.totalCount).toBe(30);
    const preview = freePreviewMessages(result.messages);
    expect(preview).toHaveLength(FREE_MESSAGE_CAP);
    expect(preview[0]?.content).toContain("msg 1");
  });

  it("applyMessageCap free path caps at 20 and reports omitted", () => {
    const result = parseTranscript(manyMessages(25));
    const capped = applyMessageCap(result.messages, { unlocked: false });
    expect(capped.cap).toBe(20);
    expect(capped.messages).toHaveLength(20);
    expect(capped.capped).toBe(true);
    expect(capped.omitted).toBe(5);
  });

  it("applyMessageCap paid path allows more than 20", () => {
    const result = parseTranscript(manyMessages(25));
    const capped = applyMessageCap(result.messages, { unlocked: true });
    expect(capped.messages).toHaveLength(25);
    expect(capped.capped).toBe(false);
  });
});
