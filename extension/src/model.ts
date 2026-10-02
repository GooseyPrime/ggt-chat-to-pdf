/** Shared data model: what the DOM parsers produce and the PDF engine consumes. */

export type SiteId = "chatgpt" | "gemini" | "copilot" | "claude";
export type Role = "user" | "assistant";

export interface TextRun {
  t: "text";
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
  link?: string;
}
export type Inline =
  | TextRun
  | { t: "math"; tex: string }
  | { t: "br" }
  | { t: "img"; alt: string };

export interface ListItem {
  blocks: Block[];
  /** true / false for GitHub-style task items, undefined for ordinary items. */
  checked?: boolean;
}
export interface TableRow {
  header: boolean;
  cells: Inline[][];
}

export type Block =
  | { t: "p"; inl: Inline[] }
  | { t: "h"; level: 1 | 2 | 3 | 4 | 5 | 6; inl: Inline[] }
  | { t: "code"; lang: string; text: string }
  | { t: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { t: "quote"; blocks: Block[] }
  | { t: "table"; rows: TableRow[]; align: ("left" | "center" | "right")[] }
  | { t: "math"; tex: string }
  | { t: "attach"; kind: "image" | "file" | "artifact" | "other"; label: string }
  | { t: "hr" };

export interface Message {
  /** Stable key used to de-duplicate while harvesting a virtualised list. */
  key: string;
  role: Role;
  blocks: Block[];
  model?: string;
}

export interface Conversation {
  site: SiteId;
  siteName: string;
  title: string;
  model?: string;
  /** ISO timestamp of export. */
  exportedAt: string;
  messages: Message[];
}

export const SITE_NAMES: Record<SiteId, string> = {
  chatgpt: "ChatGPT",
  gemini: "Google Gemini",
  copilot: "Microsoft Copilot",
  claude: "Claude",
};

/** Plain text of inline runs (used for TOC previews, tests and fallbacks). */
export function inlineText(inl: Inline[]): string {
  return inl
    .map((i) => (i.t === "text" ? i.text : i.t === "br" ? "\n" : i.t === "math" ? i.tex : `[Image: ${i.alt}]`))
    .join("");
}

export function blocksText(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.t) {
      case "p":
      case "h":
        out.push(inlineText(b.inl));
        break;
      case "code":
        out.push(b.text);
        break;
      case "list":
        for (const it of b.items) out.push(blocksText(it.blocks));
        break;
      case "quote":
        out.push(blocksText(b.blocks));
        break;
      case "table":
        for (const r of b.rows) out.push(r.cells.map(inlineText).join(" | "));
        break;
      case "math":
        out.push(b.tex);
        break;
      case "attach":
        out.push(b.label);
        break;
    }
  }
  return out.join("\n");
}
