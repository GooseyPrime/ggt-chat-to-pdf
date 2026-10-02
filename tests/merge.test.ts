import { describe, expect, it } from "vitest";
import { mergeSnapshot } from "../extension/src/content/merge";
import type { Message } from "../extension/src/model";

const m = (key: string, n = 1): Message => ({
  key,
  role: "user",
  blocks: Array.from({ length: n }, () => ({ t: "p" as const, inl: [{ t: "text" as const, text: key }] })),
});
const keys = (l: Message[]) => l.map((x) => x.key);

describe("mergeSnapshot (virtualised / lazy-loaded lists)", () => {
  it("keeps order when older messages load above", () => {
    let acc = mergeSnapshot([], [m("c"), m("d")]);
    acc = mergeSnapshot(acc, [m("a"), m("b"), m("c"), m("d")]);
    expect(keys(acc)).toEqual(["a", "b", "c", "d"]);
  });

  it("stitches overlapping windows while scrolling down", () => {
    let acc: Message[] = [];
    acc = mergeSnapshot(acc, [m("a"), m("b"), m("c")]);
    acc = mergeSnapshot(acc, [m("b"), m("c"), m("d"), m("e")]);
    acc = mergeSnapshot(acc, [m("d"), m("e"), m("f")]);
    expect(keys(acc)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("keeps two identical messages in one snapshot", () => {
    const acc = mergeSnapshot([], [m("ok"), m("x"), m("ok")]);
    expect(keys(acc)).toEqual(["ok", "x", "ok#2"]);
    expect(keys(mergeSnapshot(acc, [m("ok"), m("x"), m("ok")]))).toEqual(["ok", "x", "ok#2"]);
  });

  it("replaces a message that was partially rendered earlier", () => {
    let acc = mergeSnapshot([], [m("a", 1)]);
    acc = mergeSnapshot(acc, [m("a", 3)]);
    expect(acc[0].blocks).toHaveLength(3);
  });

  it("is idempotent", () => {
    const snap = [m("a"), m("b")];
    expect(keys(mergeSnapshot(mergeSnapshot([], snap), snap))).toEqual(["a", "b"]);
  });
});
