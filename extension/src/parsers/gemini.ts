/**
 * Google Gemini (gemini.google.com) parser.
 *
 * NOT verified against a live logged-in session (conversations are private; no public share DOM was
 * reachable while building). Selectors follow the Angular custom elements the app has used for
 * years — `user-query` / `model-response` — with class-based fallbacks and open-shadow-root search.
 * Update `SELECTORS` first when Gemini changes markup; fixtures live in tests/fixtures/gemini.
 */
import type { Block } from "../model";
import { type Hooks, allMatches, firstMatch, langFromClass, matchesAny, outermost, parseBlocks, queryAny, textOf } from "./common";
import { type RawMessage, type Site } from "./site";

export const SELECTORS = {
  user: ["user-query", ".user-query-container", '[data-test-id="user-query"]'],
  assistant: ["model-response", ".model-response-container", '[data-test-id="model-response"]'],
  userText: [".query-text", "div.query-content", ".user-query-bubble-with-background", ".query-text-line"],
  assistantBody: ["message-content .markdown", ".markdown", "message-content", ".model-response-text"],
  skip: [
    "model-thoughts",
    ".thoughts-container",
    ".thoughts-content",
    "sources-carousel",
    "response-container-footer",
    ".response-footer",
    ".action-buttons",
    "message-actions",
    "mat-icon",
    ".mat-mdc-tooltip-trigger.copy-button",
    ".cdk-visually-hidden",
  ],
  codeBlock: ["code-block", ".code-block"],
  codeHeader: [".code-block-decoration span", ".code-block-decoration"],
  model: ['[data-test-id="bard-mode-menu-button"]', ".current-mode-title", "bard-mode-switcher button", ".input-area-switch-label"],
  title: ['[data-test-id="conversation"].selected .conversation-title', ".conversation.selected .conversation-title", ".conversation-title"],
  scroller: ['[data-test-id="chat-history-container"]', "infinite-scroller", "#chat-history", "main"],
};

const hooks: Hooks = {
  skip: (el) => matchesAny(el, SELECTORS.skip),
  custom(el) {
    if (matchesAny(el, SELECTORS.codeBlock)) {
      const code = el.querySelector("pre code, code, .code-container, pre") ?? el;
      const header = textOf(firstMatch(el, SELECTORS.codeHeader)).toLowerCase();
      const lang = langFromClass(code) || (/^[a-z][\w+#.\-]{0,23}$/.test(header) ? header : "");
      return { t: "code", lang: lang === "code" ? "" : lang, text: (code.textContent ?? "").replace(/^\n+|\n+$/g, "") } as Block;
    }
    return undefined;
  },
};

/** querySelectorAll that also looks inside open shadow roots (Gemini has used both light and shadow DOM). */
export function deepQueryAll(root: ParentNode, selector: string, limit = 4000): Element[] {
  const out: Element[] = [];
  const visit = (node: ParentNode) => {
    try {
      out.push(...Array.from(node.querySelectorAll(selector)));
    } catch {
      return;
    }
    if (out.length > limit) return;
    for (const el of Array.from(node.querySelectorAll("*"))) {
      const sr = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
      if (sr) visit(sr);
    }
  };
  visit(root);
  return out;
}

export const gemini: Site = {
  id: "gemini",
  name: "Google Gemini",
  hosts: ["gemini.google.com"],
  format: { accent: [66, 103, 210], userTint: [238, 242, 252], userLabel: "You", assistantLabel: "Gemini" },

  collect(doc) {
    const sel = [...SELECTORS.user, ...SELECTORS.assistant].join(",");
    let nodes = outermost(Array.from(doc.querySelectorAll(sel)));
    if (!nodes.length) nodes = outermost(deepQueryAll(doc, sel));
    const model = gemini.model(doc);
    return nodes.map<RawMessage>((el) => {
      const role = matchesAny(el, SELECTORS.user) ? "user" : "assistant";
      return { role, el, model: role === "assistant" ? model : undefined };
    });
  },

  parse(raw): Block[] {
    if (raw.role === "user") {
      const lines = allMatches(raw.el, [".query-text-line"]);
      const body = queryAny(raw.el, SELECTORS.userText.filter((s) => s !== ".query-text-line"));
      return (body ? [body] : lines.length ? lines : [raw.el]).flatMap((el) => parseBlocks(el, hooks));
    }
    const bodies = outermost(allMatches(raw.el, SELECTORS.assistantBody));
    return (bodies.length ? bodies : [raw.el]).flatMap((b) => parseBlocks(b, hooks));
  },

  title(doc) {
    const t = textOf(firstMatch(doc, SELECTORS.title));
    if (t) return t;
    const d = doc.title.replace(/\s*[|\-–—]\s*Google Gemini\s*$/i, "").replace(/^Gemini\s*[-–—|]\s*/i, "").trim();
    return d && !/^(google )?gemini$/i.test(d) ? d : "Gemini conversation";
  },

  model(doc) {
    const t = textOf(firstMatch(doc, SELECTORS.model));
    return t ? (/gemini/i.test(t) ? t : `Gemini ${t}`) : undefined;
  },

  scroller(doc) {
    return firstMatch(doc, SELECTORS.scroller);
  },
};
