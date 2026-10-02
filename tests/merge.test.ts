import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { mergeSnapshot } from "../extension/src/content/merge";
import { harvestConversation, snapshotMessages } from "../extension/src/content/harvest";
import { blocksText, type Message } from "../extension/src/model";
import type { Site } from "../extension/src/parsers/site";

const m = (key: string, n = 1): Message => ({
  key,
  role: "user",
  blocks: Array.from({ length: n }, () => ({ t: "p" as const, inl: [{ t: "text" as const, text: key }] })),
});
const keys = (l: Message[]) => l.map((x) => x.key);
const texts = (l: Message[]) => l.map((x) => blocksText(x.blocks));

const site: Site = {
  id: "claude",
  name: "test",
  hosts: [],
  format: { accent: [0, 0, 0], userTint: [0, 0, 0], userLabel: "You", assistantLabel: "Assistant" },
  collect: (doc) => Array.from(doc.querySelectorAll("[data-role]")).map((el) => ({
    el,
    role: el.getAttribute("data-role") as Message["role"],
    key: el.getAttribute("data-id") ?? undefined,
  })),
  parse: ({ el }) => [{ t: "p", inl: [{ t: "text", text: el.textContent ?? "" }] }],
  title: () => "test",
  model: () => undefined,
  scroller: () => null,
};

function page(html: string) {
  return new JSDOM(html).window.document;
}

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

  it("keeps repeated fallback messages across overlapping windows in both directions", () => {
    let acc = mergeSnapshot([], [m("ok"), m("x"), m("ok")]);
    acc = mergeSnapshot(acc, [m("x"), m("ok"), m("y"), m("ok")], "after");
    expect(keys(acc)).toEqual(["ok", "x", "ok#2", "y", "ok#3"]);
    acc = mergeSnapshot(acc, [m("z"), m("ok"), m("x")]);
    expect(keys(acc)).toEqual(["z", "ok", "x", "ok#2", "y", "ok#3"]);
    expect(keys(mergeSnapshot(acc, [m("ok"), m("y"), m("ok")], "after"))).toEqual(keys(acc));
  });

  it("uses retained nodes to distinguish identical-message windows", () => {
    const doc = page('<p data-role="user">ok</p><p data-role="user">ok</p>');
    const acc = mergeSnapshot([], snapshotMessages(site, doc));
    doc.body.firstElementChild!.remove();
    doc.body.insertAdjacentHTML("beforeend", '<p data-role="user">ok</p>');
    const next = mergeSnapshot(acc, snapshotMessages(site, doc), "after");
    expect(texts(next)).toEqual(["ok", "ok", "ok"]);
    expect(new Set(keys(next)).size).toBe(3);
    expect(keys(mergeSnapshot(next, snapshotMessages(site, doc), "after"))).toEqual(keys(next));
  });

  it("uses the sweep direction to break otherwise indistinguishable overlaps", () => {
    const acc = mergeSnapshot([], [m("ok"), m("x"), m("ok")]);
    expect(texts(mergeSnapshot(acc, [m("ok"), m("y"), m("ok")], "after"))).toEqual(["ok", "x", "ok", "y", "ok"]);
    expect(texts(mergeSnapshot(acc, [m("ok"), m("y"), m("ok")], "before"))).toEqual(["ok", "y", "ok", "x", "ok"]);
  });

  it("refreshes a streaming fallback message while preserving its allocated key", () => {
    const doc = page('<p data-role="assistant">Hel</p>');
    const acc = mergeSnapshot([], snapshotMessages(site, doc));
    doc.body.firstElementChild!.textContent = "Hello world";
    const next = mergeSnapshot(acc, snapshotMessages(site, doc));
    expect(texts(next)).toEqual(["Hello world"]);
    expect(keys(next)).toEqual(keys(acc));
  });

  it("refreshes a retained assistant bubble that was initially empty", () => {
    const doc = page('<p data-role="assistant"></p>');
    const acc = mergeSnapshot([], snapshotMessages(site, doc));
    doc.body.firstElementChild!.textContent = "Hello world";
    expect(texts(mergeSnapshot(acc, snapshotMessages(site, doc)))).toEqual(["Hello world"]);
  });

  it("refreshes growing content even when the parser combines partial blocks", () => {
    const doc = page('<p data-role="assistant">Hello</p>');
    const initial = snapshotMessages(site, doc);
    initial[0].blocks.push({ t: "hr" });
    const acc = mergeSnapshot([], initial);
    doc.body.firstElementChild!.textContent = "Hello world";
    const next = mergeSnapshot(acc, snapshotMessages(site, doc));
    expect(texts(next)).toEqual(["Hello world"]);
    expect(next[0].blocks).toHaveLength(1);
  });

  it("reconciles a non-prefix rendering change only with retained node and preceding context", () => {
    const doc = page('<p data-role="user">Question</p><p data-role="assistant">Answer **</p>');
    const acc = mergeSnapshot([], snapshotMessages(site, doc));
    doc.body.lastElementChild!.textContent = "Answer bold";
    const next = mergeSnapshot(acc, snapshotMessages(site, doc), "after");
    expect(texts(next)).toEqual(["Question", "Answer bold"]);
    expect(keys(next)).toEqual(keys(acc));
  });

  it("uses parsed content rather than changing message controls as fallback identity", () => {
    const doc = page('<div data-role="assistant"><button>Stop</button><span>Hel</span></div>');
    const contentSite: Site = {
      ...site,
      parse: ({ el }) => [{ t: "p", inl: [{ t: "text", text: el.querySelector("span")!.textContent! }] }],
    };
    const acc = mergeSnapshot([], snapshotMessages(contentSite, doc));
    doc.querySelector("button")!.textContent = "Copy";
    doc.querySelector("span")!.textContent = "Hello world";
    expect(texts(mergeSnapshot(acc, snapshotMessages(contentSite, doc)))).toEqual(["Hello world"]);
  });

  it("reconciles a remounted streaming tail using its preceding message", () => {
    const doc = page('<p data-role="user">Question</p><p data-role="assistant">Hel</p>');
    const acc = mergeSnapshot([], snapshotMessages(site, doc));
    doc.body.innerHTML = '<p data-role="user">Question</p><p data-role="assistant">Hello world</p>';
    const next = mergeSnapshot(acc, snapshotMessages(site, doc), "after");
    expect(texts(next)).toEqual(["Question", "Hello world"]);
    expect(keys(next)).toEqual(keys(acc));
    doc.body.lastElementChild!.textContent = "Hel";
    expect(texts(mergeSnapshot(next, snapshotMessages(site, doc)))).toEqual(["Question", "Hello world"]);
  });

  it("does not merge distinct prefix-related messages without a node or context anchor", () => {
    const doc = page('<p data-role="assistant">Hello</p>');
    const acc = mergeSnapshot([], snapshotMessages(site, doc));
    doc.body.innerHTML = '<p data-role="assistant">Hello again</p>';
    expect(texts(mergeSnapshot(acc, snapshotMessages(site, doc), "after"))).toEqual(["Hello", "Hello again"]);
  });

  it("does not treat a recycled node with unrelated text as the same message", () => {
    const doc = page('<p data-role="assistant">First answer</p>');
    const acc = mergeSnapshot([], snapshotMessages(site, doc));
    doc.body.firstElementChild!.textContent = "Different answer";
    expect(texts(mergeSnapshot(acc, snapshotMessages(site, doc), "after"))).toEqual(["First answer", "Different answer"]);
  });

  it("checks complete content rather than trusting a bounded fallback hash", () => {
    const prefix = "x".repeat(400);
    const doc = page(`<p data-role="user">${prefix}a</p>`);
    const acc = mergeSnapshot([], snapshotMessages(site, doc));
    doc.body.innerHTML = `<p data-role="user">${prefix}b</p>`;
    expect(mergeSnapshot(acc, snapshotMessages(site, doc), "after")).toHaveLength(2);
  });

  it("trusts genuine site IDs for edits, but never merges different IDs with identical text", () => {
    const doc = page('<p data-role="assistant" data-id="a">Old</p>');
    let acc = mergeSnapshot([], snapshotMessages(site, doc));
    doc.body.innerHTML = '<p data-role="assistant" data-id="a">Rewritten</p><p data-role="assistant" data-id="b">Rewritten</p>';
    acc = mergeSnapshot(acc, snapshotMessages(site, doc), "after");
    expect(keys(acc)).toEqual(["a", "b"]);
    expect(texts(acc)).toEqual(["Rewritten", "Rewritten"]);
  });

  it("places inserted messages before the next genuine ID when the window has gaps", () => {
    const doc = page('<p data-role="user" data-id="a">A</p><p data-role="user" data-id="c">C</p>');
    const acc = mergeSnapshot([], snapshotMessages(site, doc));
    doc.body.innerHTML = '<p data-role="user" data-id="b">B</p><p data-role="user" data-id="c">C</p>';
    expect(keys(mergeSnapshot(acc, snapshotMessages(site, doc), "after"))).toEqual(["a", "b", "c"]);
  });

  it("places disjoint windows according to the harvesting direction", () => {
    const acc = mergeSnapshot([], [m("c"), m("d")]);
    expect(keys(mergeSnapshot(acc, [m("a"), m("b")], "before"))).toEqual(["a", "b", "c", "d"]);
    expect(keys(mergeSnapshot(acc, [m("e"), m("f")], "after"))).toEqual(["c", "d", "e", "f"]);
  });

  it("harvests a final streamed answer without exporting identity metadata", async () => {
    const doc = page('<p data-role="assistant">Hel</p>');
    const conversation = await harvestConversation(site, doc, {
      sleep: async () => { doc.body.firstElementChild!.textContent = "Hello world"; },
    });
    expect(texts(conversation.messages)).toEqual(["Hello world"]);
    expect(Object.keys(conversation.messages[0]).sort()).toEqual(["blocks", "key", "role"]);
  });
});
