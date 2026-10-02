/**
 * Generic, site-agnostic HTML -> Block[] converter.
 *
 * Site parsers supply `Hooks` for the bits that are specific to their markup (code-block chrome,
 * attachments, math wrappers, hidden UI). Everything here is defensive: unknown elements fall back
 * to "treat as a container, keep the text", so a changed class name degrades formatting instead of
 * losing content.
 */
import type { Block, Inline, ListItem, TableRow, TextRun } from "../model";

export interface Hooks {
  /** Return true to drop the element and its subtree (buttons, sr-only labels, thinking blocks...). */
  skip?(el: Element): boolean;
  /**
   * Site-specific handling. Return a block / blocks to emit them instead of default handling,
   * `null` to drop the element, or `undefined` to use the default behaviour.
   */
  custom?(el: Element): Block | Block[] | null | undefined;
  /** Language label for a <pre> whose class names do not carry one. */
  codeLang?(pre: Element): string;
}

interface Style {
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
  link?: string;
  keepNewlines?: boolean;
}

const BLOCK_TAGS = new Set([
  "p", "pre", "ul", "ol", "table", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "li",
]);
const INLINE_TAGS = new Set([
  "a", "span", "strong", "b", "em", "i", "u", "s", "del", "strike", "code", "kbd", "samp", "mark",
  "sub", "sup", "small", "abbr", "cite", "q", "br", "img", "font", "time", "bdi", "bdo", "var", "wbr",
]);
const ALWAYS_SKIP = new Set([
  "script", "style", "noscript", "template", "svg", "button", "select", "textarea", "iframe",
  "canvas", "audio", "video", "head", "link", "meta",
]);
const HIDDEN_CLASSES = /(^|\s)(sr-only|cdk-visually-hidden|visually-hidden|visuallyhidden)(\s|$)/;

export function isHidden(el: Element): boolean {
  if (el.hasAttribute("hidden")) return true;
  const cls = el.getAttribute("class");
  if (cls && HIDDEN_CLASSES.test(cls)) return true;
  const style = (el as HTMLElement).style;
  if (style && (style.display === "none" || style.visibility === "hidden")) return true;
  return false;
}

/* ------------------------------------------------------------------ math */

export function isMathElement(el: Element): boolean {
  const cls = el.getAttribute("class") ?? "";
  const tag = el.tagName.toLowerCase();
  return (
    tag === "math" ||
    tag === "mjx-container" ||
    /(^|\s)(katex|katex-display|math-inline|math-block|MathJax|mathjax)(\s|$)/.test(cls) ||
    el.hasAttribute("data-math")
  );
}

export function mathTex(el: Element): string {
  const data = el.getAttribute("data-math");
  if (data) return data.trim();
  const ann = el.querySelector('annotation[encoding="application/x-tex"], annotation[encoding="TeX"]');
  if (ann?.textContent) return ann.textContent.trim();
  const alt = el.getAttribute("aria-label") ?? el.getAttribute("alt");
  if (alt) return alt.trim();
  const ml = el.querySelector(".katex-mathml") ?? el.querySelector("math") ?? el;
  return (ml.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function isDisplayMath(el: Element): boolean {
  const cls = el.getAttribute("class") ?? "";
  if (/(^|\s)(katex-display|math-block)(\s|$)/.test(cls)) return true;
  if (el.closest?.(".katex-display, .math-block")) return true;
  if (el.getAttribute("display") === "true" || el.getAttribute("display") === "block") return true;
  return false;
}

/* ------------------------------------------------------------------ code */

/** Text of a code element, keeping line structure for CodeMirror / highlighted markup. */
export function codeText(el: Element): string {
  const lines = el.querySelectorAll(".cm-line");
  if (lines.length) return Array.from(lines).map((l) => l.textContent ?? "").join("\n");
  let out = "";
  const walk = (n: Node) => {
    if (n.nodeType === 3) out += n.textContent ?? "";
    else if (n.nodeType === 1) {
      const e = n as Element;
      const tag = e.tagName.toLowerCase();
      if (tag === "br") out += "\n";
      else if (tag === "button" || tag === "svg" || isHidden(e)) return;
      else for (const c of Array.from(e.childNodes)) walk(c);
    }
  };
  walk(el);
  return out.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
}

const LANG_RE = /^[A-Za-z][\w+#.\-]{0,23}$/;
const CHROME_WORDS = /^(copy|copy code|copied|edit|run|download|code|expand|collapse|wrap|preview)$/i;

export function langFromClass(el: Element | null): string {
  if (!el) return "";
  const cls = el.getAttribute("class") ?? "";
  const m = cls.match(/(?:^|\s)(?:language|lang|highlight-source|hljs-lang)[-_]([\w+#.\-]+)/);
  if (m) return m[1].toLowerCase();
  return (el.getAttribute("data-language") ?? el.getAttribute("data-lang") ?? "").toLowerCase();
}

/** Language label from header chrome that sits before the code (first short alphabetic text). */
export function langFromHeader(pre: Element): string {
  const code = pre.querySelector("code, .cm-content");
  const walker = pre.ownerDocument.createTreeWalker(pre, 4 /* SHOW_TEXT */);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (code && code.contains(n)) break;
    const parent = n.parentElement;
    if (parent && parent.closest("button")) continue;
    const t = (n.textContent ?? "").trim();
    if (!t || CHROME_WORDS.test(t)) continue;
    if (LANG_RE.test(t)) return t.toLowerCase();
    break;
  }
  return "";
}

export function codeBlockFromPre(pre: Element, hooks: Hooks): Block {
  const codeEl = pre.querySelector(".cm-content") ?? pre.querySelector("code") ?? pre;
  const lang =
    langFromClass(codeEl) || langFromClass(pre) || hooks.codeLang?.(pre) || langFromHeader(pre) || "";
  return { t: "code", lang: lang === "plaintext" || lang === "text" ? "" : lang, text: codeText(codeEl) };
}

/* --------------------------------------------------------------- helpers */

const SUP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ",
};
const SUB: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
};
function scriptText(text: string, map: Record<string, string>, fallbackPrefix: string): string {
  const mapped = Array.from(text).map((c) => map[c]);
  if (mapped.every(Boolean)) return mapped.join("");
  return `${fallbackPrefix}(${text})`;
}

function safeLink(el: Element): string | undefined {
  const raw = el.getAttribute("href");
  if (!raw || raw.startsWith("#") || /^\s*javascript:/i.test(raw)) return undefined;
  try {
    const base = el.ownerDocument.baseURI || "https://example.invalid/";
    const u = new URL(raw, base);
    if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:") return u.toString();
  } catch {
    /* ignore */
  }
  return undefined;
}

export function normalizeInlines(inl: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const i of inl) {
    const prev = out[out.length - 1];
    if (i.t === "text") {
      if (!i.text) continue;
      if (
        prev &&
        prev.t === "text" &&
        !!prev.bold === !!i.bold &&
        !!prev.italic === !!i.italic &&
        !!prev.code === !!i.code &&
        !!prev.strike === !!i.strike &&
        prev.link === i.link
      ) {
        prev.text += i.text;
        continue;
      }
      out.push({ ...i });
    } else out.push(i);
  }
  // collapse whitespace runs (not inside code) and trim the ends / around line breaks
  for (let k = 0; k < out.length; k++) {
    const r = out[k];
    if (r.t !== "text" || r.code) continue;
    r.text = r.text.replace(/[ \t\f\v\u00a0]+/g, " ");
  }
  const trimStart = (idx: number) => {
    const r = out[idx];
    if (r && r.t === "text" && !r.code) r.text = r.text.replace(/^ +/, "");
  };
  const trimEnd = (idx: number) => {
    const r = out[idx];
    if (r && r.t === "text" && !r.code) r.text = r.text.replace(/ +$/, "");
  };
  trimStart(0);
  trimEnd(out.length - 1);
  for (let k = 0; k < out.length; k++) {
    if (out[k].t === "br") {
      trimEnd(k - 1);
      trimStart(k + 1);
    }
    const a = out[k];
    const b = out[k + 1];
    if (a?.t === "text" && b?.t === "text" && /\s$/.test(a.text) && /^\s/.test(b.text) && !b.code) {
      b.text = b.text.replace(/^ +/, "");
    }
  }
  while (out.length && out[0].t === "br") out.shift();
  while (out.length && out[out.length - 1].t === "br") out.pop();
  return out.filter((i) => !(i.t === "text" && i.text === ""));
}

export function inlineIsEmpty(inl: Inline[]): boolean {
  return !inl.some((i) => (i.t === "text" ? i.text.trim() !== "" : true));
}

function hasBlockContent(el: Element): boolean {
  for (const tag of BLOCK_TAGS) if (el.getElementsByTagName(tag).length) return true;
  if (el.querySelector(".katex-display, .math-block, .cm-content, [data-math].math-block, table")) return true;
  return false;
}

function preserveNewlines(el: Element): boolean {
  const cls = el.getAttribute("class") ?? "";
  if (/(^|\s)whitespace-pre(-wrap|-line)?(\s|$)/.test(cls)) return true;
  const ws = (el as HTMLElement).style?.whiteSpace;
  return !!ws && /^pre/.test(ws);
}

/* ------------------------------------------------------------ main walker */

export function parseBlocks(root: Element, hooks: Hooks = {}): Block[] {
  const out: Block[] = [];
  let inl: Inline[] = [];

  const flush = () => {
    const n = normalizeInlines(inl);
    inl = [];
    if (!inlineIsEmpty(n)) out.push({ t: "p", inl: n });
  };
  const push = (b: Block | Block[]) => {
    flush();
    for (const x of Array.isArray(b) ? b : [b]) out.push(x);
  };

  const addText = (text: string, st: Style) => {
    if (!text) return;
    const base: TextRun = { t: "text", text: "" };
    if (st.bold) base.bold = true;
    if (st.italic) base.italic = true;
    if (st.code) base.code = true;
    if (st.strike) base.strike = true;
    if (st.link) base.link = st.link;
    if (st.keepNewlines || st.code) {
      const parts = text.replace(/\r\n?/g, "\n").split("\n");
      parts.forEach((p, idx) => {
        if (idx > 0) inl.push({ t: "br" });
        if (p) inl.push({ ...base, text: p });
      });
    } else {
      inl.push({ ...base, text: text.replace(/\s+/g, " ") });
    }
  };

  const walkChildren = (el: Element, st: Style) => {
    for (const c of Array.from(el.childNodes)) walk(c, st);
  };

  const walk = (node: Node, st: Style): void => {
    if (node.nodeType === 3) {
      addText(node.textContent ?? "", st);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (ALWAYS_SKIP.has(tag) || isHidden(el) || hooks.skip?.(el)) return;

    const custom = hooks.custom?.(el);
    if (custom === null) return;
    if (custom !== undefined) {
      push(custom);
      return;
    }

    if (isMathElement(el) && tag !== "annotation") {
      const tex = mathTex(el);
      if (!tex) return;
      if (isDisplayMath(el)) push({ t: "math", tex });
      else inl.push({ t: "math", tex });
      return;
    }

    switch (tag) {
      case "pre":
        push(codeBlockFromPre(el, hooks));
        return;
      case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": {
        flush();
        const sub = parseInlineOnly(el, hooks, { bold: false });
        if (!inlineIsEmpty(sub)) out.push({ t: "h", level: Number(tag[1]) as 1, inl: sub });
        return;
      }
      case "hr":
        push({ t: "hr" });
        return;
      case "ul":
      case "ol": {
        flush();
        out.push(parseList(el, hooks));
        return;
      }
      case "blockquote": {
        flush();
        const blocks = parseBlocks(el, hooks);
        if (blocks.length) out.push({ t: "quote", blocks });
        return;
      }
      case "table": {
        flush();
        const t = parseTable(el, hooks);
        if (t) out.push(t);
        return;
      }
      case "p": {
        flush();
        walkChildren(el, preserveNewlines(el) ? { ...st, keepNewlines: true } : st);
        flush();
        return;
      }
      case "br":
        inl.push({ t: "br" });
        return;
      case "img": {
        const alt = (el.getAttribute("alt") ?? "").trim();
        inl.push({ t: "img", alt });
        return;
      }
      case "strong": case "b":
        walkChildren(el, { ...st, bold: true });
        return;
      case "em": case "i": case "cite": case "var":
        walkChildren(el, { ...st, italic: true });
        return;
      case "del": case "s": case "strike":
        walkChildren(el, { ...st, strike: true });
        return;
      case "code": case "kbd": case "samp":
        walkChildren(el, { ...st, code: true });
        return;
      case "sup":
        addText(scriptText(el.textContent ?? "", SUP, "^"), st);
        return;
      case "sub":
        addText(scriptText(el.textContent ?? "", SUB, "_"), st);
        return;
      case "a": {
        const href = safeLink(el);
        if (hasBlockContent(el)) {
          walkChildren(el, st);
        } else {
          walkChildren(el, href ? { ...st, link: href } : st);
        }
        return;
      }
      case "input": {
        // GitHub-style task checkbox is handled by parseList; stray inputs are ignored.
        return;
      }
      default:
        break;
    }

    // Generic container or unknown inline element.
    const inlineTag = INLINE_TAGS.has(tag);
    const nextStyle = preserveNewlines(el) ? { ...st, keepNewlines: true } : st;
    if (inlineTag && !hasBlockContent(el)) {
      walkChildren(el, nextStyle);
      return;
    }
    if (hasBlockContent(el)) {
      flush();
      walkChildren(el, nextStyle);
      flush();
      return;
    }
    // block-ish wrapper (div/section/li/...) holding only inline content => one paragraph
    flush();
    walkChildren(el, nextStyle);
    flush();
  };

  walkChildren(root, {});
  flush();
  return out;
}

/** Inline-only parse of an element (headings, table cells). */
export function parseInlineOnly(el: Element, hooks: Hooks = {}, base: Style = {}): Inline[] {
  const blocks = parseBlocks(el, hooks);
  return flattenBlocks(blocks, base);
}

export function flattenBlocks(blocks: Block[], _base: Style = {}): Inline[] {
  const out: Inline[] = [];
  const add = (b: Block) => {
    if (out.length && out[out.length - 1].t !== "br") out.push({ t: "br" });
    switch (b.t) {
      case "p":
      case "h":
        out.push(...b.inl);
        break;
      case "code":
        out.push({ t: "text", text: b.text, code: true });
        break;
      case "math":
        out.push({ t: "math", tex: b.tex });
        break;
      case "list":
        b.items.forEach((it, idx) => {
          const prefix = b.ordered ? `${b.start + idx}. ` : "• ";
          if (idx > 0) out.push({ t: "br" });
          out.push({ t: "text", text: prefix });
          out.push(...flattenBlocks(it.blocks));
        });
        break;
      case "quote":
        out.push(...flattenBlocks(b.blocks));
        break;
      case "attach":
        out.push({ t: "text", text: `[${b.label}]`, italic: true });
        break;
      default:
        break;
    }
  };
  blocks.forEach(add);
  while (out.length && out[0].t === "br") out.shift();
  return normalizeInlines(out);
}

function parseList(el: Element, hooks: Hooks): Block {
  const ordered = el.tagName.toLowerCase() === "ol";
  const start = ordered ? parseInt(el.getAttribute("start") ?? "1", 10) || 1 : 1;
  const items: ListItem[] = [];
  const kids = Array.from(el.children).filter((c) => !hooks.skip?.(c) && !isHidden(c));
  for (const li of kids) {
    const tag = li.tagName.toLowerCase();
    if (tag !== "li" && li.getAttribute("role") !== "listitem") {
      // stray wrapper (e.g. <div><li>...) — descend one level
      if (li.querySelector(":scope > li")) {
        for (const inner of Array.from(li.children)) {
          if (inner.tagName.toLowerCase() === "li") items.push(parseItem(inner, hooks));
        }
      }
      continue;
    }
    items.push(parseItem(li, hooks));
  }
  return { t: "list", ordered, start, items };
}

function parseItem(li: Element, hooks: Hooks): ListItem {
  let checked: boolean | undefined;
  const box = li.querySelector(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]');
  if (box) checked = (box as HTMLInputElement).hasAttribute("checked") || (box as HTMLInputElement).checked;
  const blocks = parseBlocks(li, hooks);
  return { blocks: blocks.length ? blocks : [{ t: "p", inl: [] }], ...(checked === undefined ? {} : { checked }) };
}

function parseTable(el: Element, hooks: Hooks): Block | null {
  const rows: TableRow[] = [];
  const align: ("left" | "center" | "right")[] = [];
  const trs = Array.from(el.querySelectorAll("tr")).filter((tr) => tr.closest("table") === el);
  for (const tr of trs) {
    const cells = Array.from(tr.children).filter((c) => /^(td|th)$/i.test(c.tagName));
    if (!cells.length) continue;
    const inThead = !!tr.closest("thead");
    const allTh = cells.every((c) => c.tagName.toLowerCase() === "th");
    rows.push({
      header: inThead || (allTh && rows.length === 0),
      cells: cells.map((c, idx) => {
        if (!rows.length) {
          const a = ((c as HTMLElement).style?.textAlign || c.getAttribute("align") || "").toLowerCase();
          align[idx] = a === "center" || a === "right" ? a : "left";
        }
        return parseInlineOnly(c, hooks);
      }),
    });
  }
  if (!rows.length) return null;
  const cols = Math.max(...rows.map((r) => r.cells.length));
  for (const r of rows) while (r.cells.length < cols) r.cells.push([]);
  for (let i = 0; i < cols; i++) align[i] = align[i] ?? "left";
  if (!rows.some((r) => r.header)) rows[0].header = false;
  return { t: "table", rows, align };
}

/* ------------------------------------------------- plain-text (user) text */

/**
 * Users type raw text, often with markdown fences. Convert ``` fences to code blocks and `x` spans to
 * inline code so the PDF never shows literal backticks.
 */
export function plainTextBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  const flushPara = () => {
    const joined = para.join("\n").trim();
    para = [];
    if (!joined) return;
    const inl: Inline[] = [];
    joined.split("\n").forEach((ln, idx) => {
      if (idx > 0) inl.push({ t: "br" });
      const parts = ln.split(/(`[^`\n]+`)/);
      for (const p of parts) {
        if (!p) continue;
        if (p.length > 2 && p.startsWith("`") && p.endsWith("`")) inl.push({ t: "text", text: p.slice(1, -1), code: true });
        else inl.push({ t: "text", text: p });
      }
    });
    blocks.push({ t: "p", inl });
  };
  let i = 0;
  while (i < lines.length) {
    const fence = lines[i].match(/^\s*(`{3,}|~{3,})\s*([\w+#.\-]*)\s*$/);
    if (fence) {
      flushPara();
      const marker = fence[1][0].repeat(fence[1].length);
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) body.push(lines[i++]);
      i++; // closing fence (or EOF)
      blocks.push({ t: "code", lang: (fence[2] ?? "").toLowerCase(), text: body.join("\n").replace(/\n+$/, "") });
      continue;
    }
    if (lines[i].trim() === "") flushPara();
    else para.push(lines[i]);
    i++;
  }
  flushPara();
  return blocks;
}

export function stableKey(role: string, text: string, salt = ""): string {
  // FNV-1a 32-bit over a bounded prefix + length; collisions are handled by occurrence counting.
  const s = `${role}|${text.length}|${text.slice(0, 400)}|${salt}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** First element in `root` matching any selector (tried in order — selectors are fallbacks). */
export function firstMatch(root: ParentNode, selectors: string[]): Element | null {
  for (const s of selectors) {
    try {
      const el = root.querySelector(s);
      if (el) return el;
    } catch {
      /* invalid selector in this engine: try next */
    }
  }
  return null;
}

export function allMatches(root: ParentNode, selectors: string[]): Element[] {
  for (const s of selectors) {
    try {
      const list = Array.from(root.querySelectorAll(s));
      if (list.length) return list;
    } catch {
      /* try next */
    }
  }
  return [];
}

/** Drop elements nested inside another matched element. */
export function outermost(list: Element[]): Element[] {
  return list.filter((el) => !list.some((o) => o !== el && o.contains(el)));
}

export function textOf(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function matchesAny(el: Element, selectors: string[]): boolean {
  return selectors.some((s) => {
    try {
      return el.matches(s);
    } catch {
      return false;
    }
  });
}

export function queryAny(root: Element, selectors: string[]): Element | null {
  for (const s of selectors) {
    try {
      if (root.matches(s)) return root;
      const f = root.querySelector(s);
      if (f) return f;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * A wrapper <div> that holds exactly one <pre> plus a short header (language label, copy button).
 * Used by sites whose code-block chrome sits outside the <pre>.
 */
export function codeWrapper(el: Element, hooks: Hooks = {}): Block | undefined {
  if (el.tagName.toLowerCase() === "pre" || el.children.length > 4) return undefined;
  const pres = el.querySelectorAll("pre");
  if (pres.length !== 1) return undefined;
  const pre = pres[0];
  if (pre === el.firstElementChild && el.children.length === 1) return undefined; // plain wrapper: default path
  if (el.querySelector("p, ul, ol, table, h1, h2, h3, h4, h5, h6, blockquote")) {
    // paragraphs inside the <pre> subtree do not count, anything else does
    const outside = Array.from(el.querySelectorAll("p, ul, ol, table, h1, h2, h3, h4, h5, h6, blockquote")).some((n) => !pre.contains(n));
    if (outside) return undefined;
  }
  const outsideLen = (el.textContent ?? "").trim().length - (pre.textContent ?? "").trim().length;
  if (outsideLen > 40) return undefined;
  const block = codeBlockFromPre(pre, hooks);
  if (block.t === "code" && !block.lang) {
    const lang = langFromHeader(el);
    if (lang) block.lang = lang;
  }
  return block;
}

export function firstText(el: Element): string {
  const walker = el.ownerDocument.createTreeWalker(el, 4);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = (n.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t) return t;
  }
  return "";
}
