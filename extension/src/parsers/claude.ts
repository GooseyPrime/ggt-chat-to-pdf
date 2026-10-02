/**
 * Claude (claude.ai) parser.
 *
 * Structure observed on a real public share page (checked in 2026-10): the transcript is
 * `[data-testid="transcript-list"]`; user turns are `[data-testid="user-message"]` (text in
 * `p.whitespace-pre-wrap`, inline `code`), assistant turns are `[data-testid="assistant-message"]`
 * wrapping `.font-claude-response` > `.standard-markdown`. Code blocks, thinking blocks and artifact
 * cards are not present in the page we could inspect, so those selectors are documented best-effort.
 */
import type { Block } from "../model";
import { type Hooks, allMatches, codeWrapper, firstMatch, firstText, matchesAny, outermost, parseBlocks, queryAny, textOf } from "./common";
import { type RawMessage, type Site } from "./site";

export const SELECTORS = {
  user: ['[data-testid="user-message"]', "[data-user-message]", ".font-user-message"],
  assistant: [".font-claude-response", ".font-claude-message", '[data-testid="assistant-message"]'],
  assistantBody: [".standard-markdown", ".progressive-markdown", ".prose", ".grid-cols-1"],
  /** Extended-thinking / tool UI that is not part of the answer. */
  skip: ['[data-testid*="thinking" i]', '[class*="thinking" i]', '[data-testid="message-actions"]', "#markdown-artifact"],
  artifact: [".artifact-block-cell", '[data-testid*="artifact" i]'],
  model: ['[data-testid="model-selector-dropdown"]', 'button[data-testid*="model" i]'],
  titleButton: ['[data-testid="chat-title-button"]', "header h1", "[data-testid='chat-title']"],
  scroller: ['[data-testid="transcript-list"]', "main"],
};

const hooks: Hooks = {
  skip(el) {
    return matchesAny(el, SELECTORS.skip);
  },
  custom(el) {
    if (matchesAny(el, SELECTORS.artifact)) {
      const label = firstText(el).slice(0, 80) || "Artifact";
      return { t: "attach", kind: "artifact", label: `Artifact: ${label}` };
    }
    // Claude code block: a div holding a language label and a pre>code.
    if (el.tagName.toLowerCase() === "div") return codeWrapper(el, hooks);
    return undefined;
  },
};

export const claude: Site = {
  id: "claude",
  name: "Claude",
  hosts: ["claude.ai"],
  format: { accent: [193, 95, 60], userTint: [244, 240, 232], userLabel: "You", assistantLabel: "Claude" },

  collect(doc) {
    let nodes: Element[];
    try {
      nodes = Array.from(doc.querySelectorAll([...SELECTORS.user, ...SELECTORS.assistant].join(",")));
    } catch {
      nodes = [];
    }
    // `.font-claude-response` sits inside `[data-testid=assistant-message]`: keep the outer node only.
    return outermost(nodes).map((el) => ({
      role: matchesAny(el, SELECTORS.user) ? ("user" as const) : ("assistant" as const),
      el,
    }));
  },

  parse(raw): Block[] {
    if (raw.role === "user") {
      const blocks = parseBlocks(queryAny(raw.el, SELECTORS.user) ?? raw.el, hooks);
      const row = raw.el.closest('[class~="group/message-row"]');
      const attachments = row ? allMatches(row, ['[data-testid="file-thumbnail"]']).filter((el) => !raw.el.contains(el)) : [];
      return [...blocks, ...attachments.flatMap((el) => parseBlocks(el, hooks))];
    }
    const bodies = outermost(allMatches(raw.el, SELECTORS.assistantBody));
    const sources = bodies.length ? bodies : [raw.el];
    return sources.flatMap((b) => parseBlocks(b, hooks));
  },

  title(doc) {
    const fromBtn = textOf(firstMatch(doc, SELECTORS.titleButton));
    if (fromBtn && !/^claude$/i.test(fromBtn)) return fromBtn;
    const t = doc.title.replace(/\s*[|\-–—]\s*Claude\s*$/i, "").trim();
    return t && !/^claude$/i.test(t) ? t : "Claude conversation";
  },

  model(doc) {
    const t = textOf(firstMatch(doc, SELECTORS.model));
    return t || undefined;
  },

  scroller(doc) {
    const list = firstMatch(doc, ['[data-testid="transcript-list"]']);
    // The transcript's scrolling ancestor is found generically by the harvester; hint with the list.
    return list ?? firstMatch(doc, SELECTORS.scroller);
  },
};
