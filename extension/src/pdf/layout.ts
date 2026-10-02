/**
 * Layout engine: turns Block[] into a per-page display list (text / rect / line / link ops).
 * Nothing here draws; `paint.ts` replays the ops into jsPDF. Keeping layout separate lets backgrounds
 * (message cards, code blocks) be emitted *behind* content even when they span page breaks.
 */
import type { Block, Inline, Message } from "../model";
import { blocksText } from "../model";
import type { SiteFormat } from "../parsers/site";
import { type CodeTok, TOKEN_COLORS, tokenize } from "./highlight";
import { type FontBook, type FontSpec, isWinAnsiText, sanitize, type SanitizeStats } from "./fonts";
import { texToText } from "./tex";

export type RGB = [number, number, number];

export type Op =
  | { k: "text"; x: number; y: number; s: string; spec: FontSpec; size: number; color: RGB }
  | { k: "rect"; x: number; y: number; w: number; h: number; fill?: RGB; stroke?: RGB; lw?: number; r?: number }
  | { k: "line"; x1: number; y1: number; x2: number; y2: number; color: RGB; lw: number }
  | { k: "link"; x: number; y: number; w: number; h: number; url?: string; page?: number };

export interface PageData {
  bg: { z: number; op: Op }[];
  fg: Op[];
}

export interface Geometry {
  w: number;
  h: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const PAGE_SIZES = { letter: { w: 612, h: 792 }, a4: { w: 595.28, h: 841.89 } };

export const COLORS = {
  text: [31, 35, 40] as RGB,
  muted: [101, 109, 118] as RGB,
  faint: [175, 184, 193] as RGB,
  rule: [216, 222, 228] as RGB,
  link: [3, 94, 190] as RGB,
  codeBg: [246, 248, 250] as RGB,
  inlineCodeBg: [235, 238, 242] as RGB,
  inlineCode: [157, 33, 69] as RGB,
};

interface TextStyle {
  fam: "sans" | "serif" | "mono";
  size: number;
  lh: number;
  color: RGB;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center";
}

const BODY: TextStyle = { fam: "sans", size: 10, lh: 1.5, color: COLORS.text };

interface Tok {
  text: string;
  spec: FontSpec;
  size: number;
  color: RGB;
  width: number;
  space: boolean;
  br?: boolean;
  link?: string;
  code?: boolean;
  strike?: boolean;
}
interface Line {
  toks: Tok[];
  width: number;
}
interface Geo {
  x: number;
  w: number;
}
interface OpenBox {
  x: number;
  w: number;
  fill?: RGB;
  stroke?: RGB;
  bar?: RGB;
  r: number;
  z: number;
  startY: number;
}

export interface LayoutResult {
  pages: PageData[];
  messagePages: number[];
  headings: { title: string; page: number }[];
}

export class Layout {
  pages: PageData[] = [];
  y = 0;
  private boxes: OpenBox[] = [];
  readonly stats: SanitizeStats = { replaced: 0, samples: new Set() };

  constructor(public fb: FontBook, public g: Geometry) {}

  get contentW(): number {
    return this.g.w - this.g.left - this.g.right;
  }
  get page(): PageData {
    return this.pages[this.pages.length - 1];
  }
  get pageIndex(): number {
    return this.pages.length - 1;
  }

  /* ------------------------------------------------------------- pages */

  newPage(): void {
    for (const b of this.boxes) this.emitBox(b, this.g.h - this.g.bottom);
    this.pages.push({ bg: [], fg: [] });
    this.y = this.g.top;
    for (const b of this.boxes) b.startY = this.y;
  }

  need(h: number): void {
    if (this.y + h > this.g.h - this.g.bottom) this.newPage();
  }

  private emitBox(b: OpenBox, endY: number): void {
    const h = endY - b.startY;
    if (h <= 0.5) return;
    if (b.fill || b.stroke) {
      this.page.bg.push({ z: b.z, op: { k: "rect", x: b.x, y: b.startY, w: b.w, h, fill: b.fill, stroke: b.stroke, lw: 0.6, r: b.r } });
    }
    if (b.bar) this.page.bg.push({ z: b.z + 0.5, op: { k: "rect", x: b.x, y: b.startY, w: 3, h, fill: b.bar } });
  }

  openBox(box: Omit<OpenBox, "startY" | "z">, padTop = 0): void {
    this.boxes.push({ ...box, z: this.boxes.length, startY: this.y });
    this.y += padTop;
  }
  closeBox(padBottom = 0): void {
    const b = this.boxes.pop() as OpenBox;
    this.y += padBottom;
    this.emitBox(b, this.y);
  }

  /* -------------------------------------------------------- tokenizing */

  private clean(text: string): string {
    return sanitize(text, this.fb.uni, this.stats);
  }

  private tok(text: string, spec: FontSpec, size: number, color: RGB, extra: Partial<Tok> = {}): Tok {
    const resolved = this.fb.resolve(spec, text);
    return { text, spec: resolved, size, color, width: this.fb.width(text, resolved, size), space: /^\s+$/.test(text), ...extra };
  }

  private tokens(inl: Inline[], st: TextStyle): Tok[] {
    const out: Tok[] = [];
    const base: FontSpec = { fam: st.fam, bold: st.bold, italic: st.italic };
    const addWords = (raw: string, spec: FontSpec, size: number, color: RGB, extra: Partial<Tok> = {}) => {
      const text = this.clean(raw);
      for (const part of text.split(/( +)/)) {
        if (!part) continue;
        if (part[0] === " ") out.push(this.tok(" ", spec, size, color, extra));
        else out.push(this.tok(part, spec, size, color, extra));
      }
    };
    for (const i of inl) {
      if (i.t === "br") {
        out.push({ text: "", spec: base, size: st.size, color: st.color, width: 0, space: false, br: true });
      } else if (i.t === "math") {
        const text = texToText(i.tex);
        const spec: FontSpec = isWinAnsiText(text) ? { fam: "serif", italic: true } : { fam: "uni" };
        addWords(text, spec, st.size * (spec.fam === "serif" ? 1.06 : 1), st.color);
      } else if (i.t === "img") {
        addWords(i.alt ? `[Image: ${i.alt}]` : "[Image]", { ...base, italic: true }, st.size, COLORS.muted);
      } else {
        const spec: FontSpec = i.code
          ? { fam: "mono", bold: i.bold || st.bold }
          : { fam: st.fam, bold: i.bold || st.bold, italic: i.italic || st.italic };
        const size = i.code ? st.size * 0.9 : st.size;
        const color = i.link ? COLORS.link : i.code ? COLORS.inlineCode : st.color;
        addWords(i.text, spec, size, color, { link: i.link, code: i.code, strike: i.strike });
      }
    }
    return out;
  }

  private wrap(inl: Inline[], width: number, st: TextStyle): Line[] {
    const toks = this.tokens(inl, st);
    const lines: Line[] = [];
    let cur: Tok[] = [];
    let w = 0;
    const end = () => {
      while (cur.length && cur[cur.length - 1].space) {
        w -= cur[cur.length - 1].width;
        cur.pop();
      }
      lines.push({ toks: cur, width: Math.max(0, w) });
      cur = [];
      w = 0;
    };
    for (const t of toks) {
      if (t.br) { end(); continue; }
      if (t.space) {
        if (cur.length) { cur.push(t); w += t.width; }
        continue;
      }
      if (w + t.width > width + 0.01 && cur.length) end();
      if (t.width > width) {
        // break an over-long word (URLs, hashes) by characters
        let piece = "";
        for (const ch of Array.from(t.text)) {
          const cw = this.fb.width(piece + ch, t.spec, t.size);
          if (cw > width - w && piece) {
            const pt = { ...t, text: piece, width: this.fb.width(piece, t.spec, t.size) };
            cur.push(pt);
            w += pt.width;
            end();
            piece = ch;
          } else piece += ch;
        }
        if (piece) {
          const pt = { ...t, text: piece, width: this.fb.width(piece, t.spec, t.size) };
          cur.push(pt);
          w += pt.width;
        }
        continue;
      }
      cur.push(t);
      w += t.width;
    }
    if (cur.length || !lines.length) end();
    return lines;
  }

  /* ---------------------------------------------------- drawing lines */

  private baseline(top: number, size: number, lineH: number): number {
    return top + (lineH - size) / 2 + size * 0.8;
  }

  private drawLine(line: Line, x: number, top: number, lineH: number, st: TextStyle, boxW?: number): void {
    const size = st.size;
    const base = this.baseline(top, size, lineH);
    let cx = x;
    if (st.align === "center" && boxW) cx = x + Math.max(0, (boxW - line.width) / 2);
    // merge neighbours that share style so the PDF text layer reads naturally
    let i = 0;
    while (i < line.toks.length) {
      let j = i;
      let text = "";
      let w = 0;
      const t0 = line.toks[i];
      while (
        j < line.toks.length &&
        line.toks[j].spec.fam === t0.spec.fam &&
        !!line.toks[j].spec.bold === !!t0.spec.bold &&
        !!line.toks[j].spec.italic === !!t0.spec.italic &&
        line.toks[j].size === t0.size &&
        line.toks[j].color === t0.color &&
        line.toks[j].link === t0.link &&
        !!line.toks[j].code === !!t0.code &&
        !!line.toks[j].strike === !!t0.strike
      ) {
        text += line.toks[j].text;
        w += line.toks[j].width;
        j++;
      }
      if (t0.code) {
        this.page.bg.push({ z: 50, op: { k: "rect", x: cx - 1.5, y: base - t0.size * 0.88, w: w + 3, h: t0.size * 1.2, fill: COLORS.inlineCodeBg, r: 2 } });
      }
      if (text.trim()) this.page.fg.push({ k: "text", x: cx, y: base, s: text, spec: t0.spec, size: t0.size, color: t0.color });
      if (t0.link) {
        this.page.fg.push({ k: "line", x1: cx, y1: base + 1.2, x2: cx + w, y2: base + 1.2, color: t0.color, lw: 0.5 });
        this.page.fg.push({ k: "link", x: cx, y: base - t0.size, w, h: t0.size * 1.25, url: t0.link });
      }
      if (t0.strike) this.page.fg.push({ k: "line", x1: cx, y1: base - t0.size * 0.3, x2: cx + w, y2: base - t0.size * 0.3, color: t0.color, lw: 0.6 });
      cx += w;
      i = j;
    }
    void boxW;
  }

  /** Flow a paragraph of inlines at (g.x, this.y), breaking across pages. */
  paragraph(inl: Inline[], g: Geo, st: TextStyle = BODY, after = 6): void {
    const lines = this.wrap(inl, g.w, st);
    const lineH = st.size * st.lh;
    lines.forEach((line, idx) => {
      // keep at least two lines together at a page end (orphan/widow control)
      this.need(idx === 0 && lines.length > 1 ? lineH * 2 : lineH);
      this.drawLine(line, g.x, this.y, lineH, st, g.w);
      this.y += lineH;
    });
    this.y += after;
  }

  /* ----------------------------------------------------------- blocks */

  blocks(blocks: Block[], g: Geo, st: TextStyle = BODY, level = 0): void {
    blocks.forEach((b, idx) => {
      const last = idx === blocks.length - 1;
      this.block(b, g, st, level, last);
    });
  }

  private block(b: Block, g: Geo, st: TextStyle, level: number, last: boolean): void {
    const after = last ? 2 : 7;
    switch (b.t) {
      case "p":
        this.paragraph(b.inl, g, st, after);
        break;
      case "h": {
        const sizes = [0, 15, 13.2, 11.8, 10.8, 10.2, 10];
        const size = sizes[b.level];
        const hs: TextStyle = { ...st, size, bold: true, lh: 1.3, color: COLORS.text };
        this.need(size * 1.3 * 2 + 14);
        this.y += b.level <= 2 ? 6 : 3;
        this.paragraph(b.inl, g, hs, 3);
        break;
      }
      case "code":
        this.codeBlock(b.text, b.lang, g);
        this.y += after - 2;
        break;
      case "list":
        this.list(b, g, st, level);
        this.y += last ? 0 : 3;
        break;
      case "quote": {
        this.openBox({ x: g.x, w: g.w, bar: COLORS.faint, r: 0 }, 2);
        this.blocks(b.blocks, { x: g.x + 12, w: g.w - 12 }, { ...st, color: COLORS.muted }, level);
        this.closeBox(2);
        this.y += 4;
        break;
      }
      case "table":
        this.table(b, g, st);
        this.y += after;
        break;
      case "math": {
        const text = texToText(b.tex);
        const fam: TextStyle["fam"] = "serif";
        const ms: TextStyle = { ...st, fam, italic: true, size: st.size * 1.12, align: "center", lh: 1.6 };
        this.y += 2;
        this.paragraph([{ t: "text", text }], g, ms, after);
        break;
      }
      case "attach": {
        const label = b.label || (b.kind === "image" ? "Image" : "Attachment");
        const text = /^(image|attachment|artifact|file)\b/i.test(label) ? label : `${b.kind === "image" ? "Image" : b.kind === "artifact" ? "Artifact" : "Attachment"}: ${label}`;
        const s: TextStyle = { ...st, size: st.size * 0.9, italic: true, color: COLORS.muted };
        const lines = this.wrap([{ t: "text", text }], g.w - 16, s);
        const h = lines.length * s.size * s.lh + 10;
        this.need(h);
        this.openBox({ x: g.x, w: g.w, fill: [250, 251, 252], stroke: COLORS.rule, r: 4 }, 5);
        lines.forEach((ln) => {
          this.drawLine(ln, g.x + 8, this.y, s.size * s.lh, s);
          this.y += s.size * s.lh;
        });
        this.closeBox(5);
        this.y += after - 2;
        break;
      }
      case "hr":
        this.need(14);
        this.y += 6;
        this.page.fg.push({ k: "line", x1: g.x, y1: this.y, x2: g.x + g.w, y2: this.y, color: COLORS.rule, lw: 0.8 });
        this.y += 8;
        break;
    }
  }

  private list(b: Extract<Block, { t: "list" }>, g: Geo, st: TextStyle, level: number): void {
    const markers = b.items.map((it, i) => (it.checked !== undefined ? (it.checked ? "[x]" : "[ ]") : b.ordered ? `${b.start + i}.` : level === 0 ? "•" : level === 1 ? "–" : "·"));
    const mw = Math.max(...markers.map((m) => this.fb.width(m, { fam: "sans" }, st.size)));
    const indent = Math.max(14, mw + 7);
    const lineH = st.size * st.lh;
    b.items.forEach((it, idx) => {
      this.need(lineH * 2);
      const base = this.baseline(this.y, st.size, lineH);
      const taskSpec: FontSpec = it.checked !== undefined ? { fam: "mono" } : { fam: "sans", bold: b.ordered ? false : undefined };
      this.page.fg.push({ k: "text", x: g.x + indent - 5 - this.fb.width(markers[idx], taskSpec, st.size), y: base, s: markers[idx], spec: taskSpec, size: st.size, color: COLORS.muted });
      const inner = { x: g.x + indent, w: g.w - indent };
      this.blocks(it.blocks, inner, st, level + 1);
      this.y += 1;
    });
  }

  /* -------------------------------------------------------------- code */

  private codeBlock(text: string, lang: string, g: Geo): void {
    const size = 8.4;
    const lineH = size * 1.42;
    const pad = 8;
    const mono: FontSpec = { fam: "mono" };
    const charW = this.fb.width("MMMMMMMMMM", mono, size) / 10;
    const maxChars = Math.max(10, Math.floor((g.w - pad * 2) / charW));
    const clean = this.clean(text);
    const rows: CodeTok[][] = [];
    for (const line of tokenize(clean, lang)) {
      let rowTokens: CodeTok[] = [];
      let n = 0;
      if (!line.length) rows.push([]);
      for (const t of line) {
        let rest = t.text;
        while (rest.length) {
          const room = maxChars - n;
          if (rest.length <= room) {
            rowTokens.push({ text: rest, kind: t.kind });
            n += rest.length;
            rest = "";
          } else {
            if (room > 0) rowTokens.push({ text: rest.slice(0, room), kind: t.kind });
            rows.push(rowTokens);
            rowTokens = [];
            n = 0;
            rest = rest.slice(Math.max(room, 0));
          }
        }
      }
      if (line.length) rows.push(rowTokens);
    }
    const headerH = lang ? 17 : 0;
    this.need(headerH + lineH * Math.min(rows.length, 3) + pad * 2);
    this.openBox({ x: g.x, w: g.w, fill: COLORS.codeBg, stroke: COLORS.rule, r: 4 }, 0);
    if (lang) {
      this.page.fg.push({ k: "text", x: g.x + pad, y: this.y + 11.5, s: lang.toUpperCase(), spec: { fam: "sans", bold: true }, size: 6.8, color: COLORS.muted });
      this.page.fg.push({ k: "line", x1: g.x, y1: this.y + headerH, x2: g.x + g.w, y2: this.y + headerH, color: COLORS.rule, lw: 0.6 });
      this.y += headerH;
    }
    this.y += pad - 2;
    for (const row of rows) {
      this.need(lineH + 2);
      const base = this.baseline(this.y, size, lineH);
      let cx = g.x + pad;
      for (const t of row) {
        const spec = this.fb.resolve(mono, t.text);
        const w = this.fb.width(t.text, spec, size);
        if (t.text.trim()) this.page.fg.push({ k: "text", x: cx, y: base, s: t.text, spec, size, color: TOKEN_COLORS[t.kind] });
        cx += w;
      }
      this.y += lineH;
    }
    this.closeBox(pad - 2);
  }

  /* ------------------------------------------------------------- table */

  private table(b: Extract<Block, { t: "table" }>, g: Geo, st: TextStyle): void {
    const cols = b.align.length;
    const size = st.size * 0.92;
    const pad = 4.5;
    const cst: TextStyle = { ...st, size, lh: 1.35 };
    const natural: number[] = new Array(cols).fill(0);
    const minW: number[] = new Array(cols).fill(0);
    for (const r of b.rows) {
      r.cells.forEach((cell, c) => {
        const s: TextStyle = r.header ? { ...cst, bold: true } : cst;
        const toks = this.tokens(cell, s);
        let line = 0;
        let longest = 0;
        for (const t of toks) {
          if (t.br) { natural[c] = Math.max(natural[c], line); line = 0; continue; }
          line += t.width;
          if (!t.space) longest = Math.max(longest, t.width);
        }
        natural[c] = Math.max(natural[c], line);
        minW[c] = Math.max(minW[c], Math.min(longest, g.w * 0.45));
      });
    }
    const avail = g.w - cols * pad * 2;
    let widths = natural.map((n, i) => Math.max(n, minW[i], 18));
    const total = widths.reduce((a, c) => a + c, 0);
    if (total > avail) {
      const mins = minW.map((m) => Math.max(m, 18));
      const minTotal = mins.reduce((a, c) => a + c, 0);
      if (minTotal >= avail) widths = mins.map((m) => (m / minTotal) * avail);
      else {
        const extra = avail - minTotal;
        const want = widths.map((wd, i) => Math.max(0, wd - mins[i]));
        const wantTotal = want.reduce((a, c) => a + c, 0) || 1;
        widths = mins.map((m, i) => m + (want[i] / wantTotal) * extra);
      }
    } else {
      const grow = (avail - total) / cols;
      widths = widths.map((wd) => wd + grow);
    }
    const colW = widths.map((wd) => wd + pad * 2);
    const x0 = g.x;

    const rowLayout = (r: (typeof b.rows)[number]) => {
      const s: TextStyle = r.header ? { ...cst, bold: true } : cst;
      const cells = r.cells.map((cell, c) => ({ lines: this.wrap(cell, widths[c], s), s }));
      const h = Math.max(...cells.map((c) => c.lines.length)) * size * 1.35 + pad * 1.6;
      return { cells, h };
    };
    const drawRow = (r: (typeof b.rows)[number], layout: ReturnType<typeof rowLayout>) => {
      const top = this.y;
      let cx = x0;
      layout.cells.forEach((cell, c) => {
        if (r.header) this.page.bg.push({ z: 40, op: { k: "rect", x: cx, y: top, w: colW[c], h: layout.h, fill: [238, 241, 245] } });
        cell.lines.forEach((ln, li) => {
          const a = b.align[c];
          const lx = a === "right" ? cx + colW[c] - pad - ln.width : a === "center" ? cx + (colW[c] - ln.width) / 2 : cx + pad;
          this.drawLine(ln, lx, top + pad * 0.8 + li * size * 1.35, size * 1.35, { ...cell.s, align: "left" });
        });
        cx += colW[c];
      });
      // grid
      this.page.fg.push({ k: "line", x1: x0, y1: top + layout.h, x2: x0 + colW.reduce((a, c) => a + c, 0), y2: top + layout.h, color: COLORS.rule, lw: 0.6 });
      this.y += layout.h;
    };

    const headerRows = b.rows.filter((r) => r.header).slice(0, 1);
    const firstLayout = rowLayout(b.rows[0]);
    this.need(firstLayout.h + 20);
    const tableTop = this.y;
    let segTop = tableTop;
    const frame = () => {
      const totalW = colW.reduce((a, c) => a + c, 0);
      this.page.fg.push({ k: "line", x1: x0, y1: segTop, x2: x0 + totalW, y2: segTop, color: COLORS.faint, lw: 0.8 });
      let cx = x0;
      for (let c = 0; c <= cols; c++) {
        this.page.fg.push({ k: "line", x1: cx, y1: segTop, x2: cx, y2: this.y, color: COLORS.rule, lw: 0.5 });
        cx += colW[c] ?? 0;
      }
    };
    b.rows.forEach((r, idx) => {
      const lay = idx === 0 ? firstLayout : rowLayout(r);
      if (this.y + lay.h > this.g.h - this.g.bottom && idx > 0) {
        frame();
        this.newPage();
        segTop = this.y;
        for (const hr of headerRows) if (hr !== r) drawRow(hr, rowLayout(hr));
      }
      drawRow(r, lay);
    });
    frame();
  }

  /* ---------------------------------------------------------- messages */

  /** Short single-line label for TOC / bookmarks. */
  static preview(m: Message, max = 90): string {
    const head = m.blocks.find((b) => b.t === "h");
    const text = (head ? blocksText([head]) : blocksText(m.blocks)).replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text || "(no text)";
  }

  message(m: Message, index: number, fmt: SiteFormat): number {
    const isUser = m.role === "user";
    const label = isUser ? fmt.userLabel : fmt.assistantLabel;
    const accent: RGB = isUser ? [87, 96, 106] : fmt.accent;
    this.need(70);
    const startPage = this.pageIndex;
    const pad = 11;
    const inner: Geo = { x: this.g.left + pad + 4, w: this.contentW - pad * 2 - 4 };
    this.openBox(
      {
        x: this.g.left,
        w: this.contentW,
        fill: isUser ? fmt.userTint : undefined,
        bar: accent,
        r: isUser ? 5 : 0,
      },
      isUser ? 9 : 2,
    );
    // role label
    const base = this.baseline(this.y, 7.8, 12);
    this.page.fg.push({ k: "text", x: inner.x, y: base, s: label.toUpperCase(), spec: { fam: "sans", bold: true }, size: 7.8, color: accent });
    const lw = this.fb.width(label.toUpperCase(), { fam: "sans", bold: true }, 7.8);
    this.page.fg.push({ k: "text", x: inner.x + lw + 6, y: base, s: `message ${index + 1}`, spec: { fam: "sans" }, size: 7.2, color: COLORS.muted });
    this.y += 16;
    if (m.blocks.length) this.blocks(m.blocks, inner, BODY);
    else this.paragraph([{ t: "text", text: "(empty message)" }], inner, { ...BODY, italic: true, color: COLORS.muted });
    this.closeBox(isUser ? 7 : 3);
    this.y += 13;
    return startPage;
  }
}
