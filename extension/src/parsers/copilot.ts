/**
 * Microsoft Copilot (copilot.microsoft.com) parser.
 *
 * NOT verified against a live logged-in session (Copilot share links require sign-in, so no real DOM
 * could be inspected). Selectors come from the data attributes / Tailwind group classes the web app
 * has used: user turns `[data-content="user-message"]` (inside `group/user-message`), assistant turns
 * `group/ai-message` made of several `group/ai-message-item` blocks. Class names containing "/" are
 * matched with attribute selectors (`[class~="group/ai-message"]`) to avoid CSS escaping problems.
 */
import type { Block } from "../model";
import { type Hooks, allMatches, codeWrapper, firstMatch, matchesAny, outermost, parseBlocks, queryAny, textOf } from "./common";
import { type RawMessage, type Site } from "./site";

export const SELECTORS = {
  user: ['[class~="group/user-message"]', '[data-content="user-message"]', '[data-testid="user-message"]'],
  assistant: ['[class~="group/ai-message"]', '[data-content="ai-message"]', '[data-testid="ai-message"]', '[data-testid="copilot-message"]'],
  userText: ['[data-content="user-message"]', "[data-content]"],
  assistantItem: ['[class~="group/ai-message-item"]', '[data-content="ai-message-item"]'],
  skip: [
    '[data-testid="message-item-reactions"]',
    '[data-testid="citation-list"]',
    '[data-testid="message-actions"]',
    '[aria-label="Copy"]',
    '[data-testid="suggestion-chip"]',
    ".sr-only",
  ],
  title: ['[role="option"][aria-selected="true"] p', '[role="option"][aria-selected="true"]', '[data-testid="chat-title"]'],
  model: ['[data-testid="mode-picker-button"]', 'button[aria-label*="mode" i]', '[data-testid="composer-mode-selector"]'],
  scroller: ['[data-testid="chat-scroll-container"]', '[data-testid="message-list"]', "main"],
};

const hooks: Hooks = {
  skip: (el) => matchesAny(el, SELECTORS.skip),
  // Copilot code block: wrapper div with a header (<span>language</span> + copy button) above pre>code.
  custom: (el) => (el.tagName.toLowerCase() === "div" ? codeWrapper(el, hooks) : undefined),
};

export const copilot: Site = {
  id: "copilot",
  name: "Microsoft Copilot",
  hosts: ["copilot.microsoft.com"],
  format: { accent: [15, 108, 189], userTint: [236, 243, 251], userLabel: "You", assistantLabel: "Copilot" },

  collect(doc) {
    const sel = [...SELECTORS.user, ...SELECTORS.assistant].join(",");
    let nodes: Element[];
    try {
      nodes = outermost(Array.from(doc.querySelectorAll(sel)));
    } catch {
      nodes = [];
    }
    const model = copilot.model(doc);
    return nodes.map<RawMessage>((el) => {
      const role = matchesAny(el, SELECTORS.user) ? "user" : "assistant";
      return { role, el, model: role === "assistant" ? model : undefined };
    });
  },

  parse(raw): Block[] {
    if (raw.role === "user") return parseBlocks(queryAny(raw.el, SELECTORS.userText) ?? raw.el, hooks);
    const items = outermost(allMatches(raw.el, SELECTORS.assistantItem));
    return (items.length ? items : [raw.el]).flatMap((i) => parseBlocks(i, hooks));
  },

  title(doc) {
    const t = textOf(firstMatch(doc, SELECTORS.title));
    if (t) return t;
    const d = doc.title.replace(/\s*[|\-–—]\s*(Microsoft )?Copilot\s*$/i, "").trim();
    return d && !/^(microsoft )?copilot$/i.test(d) ? d : "Copilot conversation";
  },

  model(doc) {
    const t = textOf(firstMatch(doc, SELECTORS.model));
    return t && t.length < 40 ? `Copilot ${t}` : undefined;
  },

  scroller(doc) {
    return firstMatch(doc, SELECTORS.scroller);
  },
};
