/**
 * ChatGPT (chatgpt.com) parser.
 *
 * Structure observed on a real public share page (checked in 2026-10): each turn is
 * `section[data-testid="conversation-turn-N"][data-turn="user|assistant"]` containing an
 * `[data-message-author-role]` element (with `data-message-id`, and `data-message-model-slug` on
 * assistant turns) whose rendered markdown lives in `.markdown`. User text is raw text in
 * `.whitespace-pre-wrap`. Older builds used `article` turns, which the fallbacks still cover.
 * See docs/UPDATING-SELECTORS.md before changing anything here.
 */
import type { Block, Role } from "../model";
import { type Hooks, allMatches, firstMatch, matchesAny, outermost, parseBlocks, plainTextBlocks, stableKey, textOf } from "./common";
import { type RawMessage, type Site, hostMatches } from "./site";

export const SELECTORS = {
  /** Turn containers, newest markup first. */
  turn: [
    'section[data-testid^="conversation-turn-"]',
    'article[data-testid^="conversation-turn-"]',
    "[data-turn-id]",
    "article",
  ],
  /** Fallback when no turn wrapper matches: the message elements themselves. */
  message: ["[data-message-author-role]"],
  assistantContent: [".markdown", '[class*="markdown"]', ".prose"],
  userContent: [".whitespace-pre-wrap", '[data-message-author-role="user"]'],
  hidden: [".sr-only", '[data-testid="copy-turn-action-button"]', '[role="group"][aria-label*="actions" i]'],
  scroller: ['[class*="threadScrollVars"]', "main [class*='overflow-y-auto']", "main"],
};

const MODEL_NAMES: Record<string, string> = {
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o mini",
  "gpt-4": "GPT-4",
  "gpt-4-5": "GPT-4.5",
  "gpt-5": "GPT-5",
  "o1": "o1",
  "o3": "o3",
  "o4-mini": "o4-mini",
};

export function prettyModel(slug: string | null | undefined): string | undefined {
  if (!slug) return undefined;
  const s = slug.trim();
  if (!s || s === "auto") return undefined;
  return MODEL_NAMES[s.toLowerCase()] ?? s;
}

function roleOf(turn: Element): Role | null {
  const attr = turn.getAttribute("data-turn") ?? turn.getAttribute("data-message-author-role");
  if (attr === "user" || attr === "assistant") return attr;
  const inner = turn.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role");
  if (inner === "user" || inner === "assistant") return inner;
  const label = textOf(turn.querySelector("h4.sr-only, h5.sr-only, h6.sr-only, .sr-only")).toLowerCase();
  if (label.startsWith("you said")) return "user";
  if (label.includes("said")) return "assistant";
  return null;
}

const hooks: Hooks = {
  skip: (el) => matchesAny(el, SELECTORS.hidden),
  custom(el) {
    // User turns are raw text (not rendered markdown): keep indentation, turn ``` fences into code blocks.
    if (el.classList.contains("whitespace-pre-wrap") && el.children.length === 0 && el.closest('[data-message-author-role="user"]')) {
      return plainTextBlocks(el.textContent ?? "");
    }
    return undefined;
  },
};

export const chatgpt: Site = {
  id: "chatgpt",
  name: "ChatGPT",
  hosts: ["chatgpt.com", "chat.openai.com"],
  format: { accent: [16, 163, 127], userTint: [241, 243, 245], userLabel: "You", assistantLabel: "ChatGPT" },

  collect(doc) {
    let turns = outermost(allMatches(doc, SELECTORS.turn));
    if (!turns.length) turns = outermost(allMatches(doc, SELECTORS.message));
    const out: RawMessage[] = [];
    for (const el of turns) {
      const role = roleOf(el);
      if (!role) continue;
      const msg = el.matches("[data-message-author-role]") ? el : el.querySelector("[data-message-author-role]");
      const slug = msg?.getAttribute("data-message-model-slug") ?? el.querySelector("[data-message-model-slug]")?.getAttribute("data-message-model-slug");
      out.push({
        role,
        el,
        key: msg?.getAttribute("data-message-id") ?? el.getAttribute("data-turn-id") ?? undefined,
        model: role === "assistant" ? prettyModel(slug) : undefined,
      });
    }
    return out;
  },

  parse(raw): Block[] {
    const roleEl = raw.el.matches("[data-message-author-role]") ? raw.el : raw.el.querySelector("[data-message-author-role]") ?? raw.el;
    if (raw.role === "assistant") {
      const contents = outermost(allMatches(roleEl, SELECTORS.assistantContent));
      // Several .markdown blocks can exist per turn (tool calls, multi-part answers).
      const sources = contents.length ? contents : [roleEl];
      return sources.flatMap((c) => parseBlocks(c, hooks));
    }
    // User turns: attachments/images sit beside the text, so parse the whole message element.
    return parseBlocks(roleEl, hooks);
  },

  title(doc) {
    const t = doc.title.replace(/\s*[|\-–—]\s*ChatGPT\s*$/i, "").replace(/^ChatGPT\s*[-–—|]\s*/i, "").trim();
    if (t && !/^ChatGPT$/i.test(t)) return t;
    const sel = firstMatch(doc, ['nav a[aria-current="page"]', 'a[data-active] .truncate', "nav [data-active] span"]);
    return textOf(sel) || "ChatGPT conversation";
  },

  model(doc) {
    const counts = new Map<string, number>();
    doc.querySelectorAll("[data-message-model-slug]").forEach((e) => {
      const m = prettyModel(e.getAttribute("data-message-model-slug"));
      if (m) counts.set(m, (counts.get(m) ?? 0) + 1);
    });
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) return best[0];
    const btn = firstMatch(doc, ['[data-testid="model-switcher-dropdown-button"]', 'button[aria-label^="Model selector"]']);
    const t = textOf(btn).replace(/^ChatGPT\s*/i, "");
    return t || undefined;
  },

  scroller(doc) {
    return firstMatch(doc, SELECTORS.scroller);
  },
};

export function matchesChatGPT(hostname: string): boolean {
  return hostMatches(hostname, chatgpt.hosts);
}
export { stableKey };
