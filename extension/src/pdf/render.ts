import { jsPDF } from "jspdf";
import { type Conversation, type Message, blocksText } from "../model";
import { siteById } from "../parsers";
import { CREATOR, FREE_WATERMARK_TEXT, FREE_WATERMARK_TITLE } from "../constants";
import { COLORS, Layout, type Geometry, type Op, PAGE_SIZES, type PageData, type RGB } from "./layout";
import { FontBook, type FontLoader, type FontSpec, isWinAnsiText, registerUnicodeFonts, sanitize } from "./fonts";
import { paintOp, paintPages } from "./paint";
import { texToText } from "./tex";

export interface RenderOptions {
  pageSize: "letter" | "a4";
  toc: boolean;
  /** Free tier: diagonal watermark + branded footer. */
  watermark: boolean;
  /** Number of messages in the original conversation if this export was truncated (free cap). */
  truncatedFrom?: number;
  /** Document title override. */
  title?: string;
  loadFont: FontLoader;
  /** Content-stream compression (default true; tests switch it off to inspect text). */
  compress?: boolean;
}

export interface RenderResult {
  bytes: Uint8Array;
  pages: number;
  warnings: string[];
}

/** Every string the PDF may print, so we know up-front whether the Unicode fallback font is needed. */
export function needsUnicodeFont(conv: Conversation): boolean {
  const scan = (s: string) => !isWinAnsiText(sanitize(s, false));
  const walk = (blocks: Message["blocks"]): boolean => {
    for (const b of blocks) {
      switch (b.t) {
        case "p":
        case "h":
          if (b.inl.some((i) => (i.t === "text" ? scan(i.text) : i.t === "math" ? !isWinAnsiText(texToText(i.tex)) || true : i.t === "img" ? scan(i.alt) : false))) return true;
          break;
        case "code":
          if (scan(b.text)) return true;
          break;
        case "math":
          return true;
        case "list":
          if (b.items.some((it) => walk(it.blocks))) return true;
          break;
        case "quote":
          if (walk(b.blocks)) return true;
          break;
        case "table":
          if (b.rows.some((r) => r.cells.some((c) => c.some((i) => (i.t === "text" ? scan(i.text) : i.t === "math"))))) return true;
          break;
        case "attach":
          if (scan(b.label)) return true;
          break;
      }
    }
    return false;
  };
  return scan(conv.title) || scan(conv.model ?? "") || conv.messages.some((m) => walk(m.blocks));
}

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export async function buildPdf(conv: Conversation, opts: RenderOptions): Promise<RenderResult> {
  const size = PAGE_SIZES[opts.pageSize];
  const doc = new jsPDF({ unit: "pt", format: [size.w, size.h], compress: opts.compress !== false });
  const uni = needsUnicodeFont(conv);
  if (uni) await registerUnicodeFonts(doc, opts.loadFont);
  const fb = new FontBook(doc, uni);
  const g: Geometry = { w: size.w, h: size.h, left: 58, right: 58, top: 66, bottom: 62 };
  const L = new Layout(fb, g);
  const site = siteById(conv.site);
  const fmt = site.format;
  const title = sanitize(opts.title || conv.title || "Conversation", uni, L.stats).replace(/\s+/g, " ").trim() || "Conversation";
  const warnings: string[] = [];

  /* ---------------- title page ---------------- */
  L.newPage();
  const tp = L.page.fg;
  const bgTitle = L.page.bg;
  bgTitle.push({ z: 0, op: { k: "rect", x: 0, y: 0, w: size.w, h: 14, fill: fmt.accent } });
  bgTitle.push({ z: 0, op: { k: "rect", x: g.left, y: 150, w: 4, h: 84, fill: fmt.accent } });
  const textOp = (s: string, x: number, y: number, spec: FontSpec, sz: number, color: RGB): Op => ({ k: "text", x, y, s, spec, size: sz, color });
  tp.push(textOp("CONVERSATION EXPORT", g.left + 16, 163, { fam: "sans", bold: true }, 8.5, fmt.accent));
  // title wrapped to 4 lines
  const titleLines = wrapPlain(fb, title, { fam: "sans", bold: true }, 27, size.w - g.left - g.right - 16, 4);
  titleLines.forEach((ln, i) => tp.push(textOp(ln, g.left + 16, 196 + i * 33, { fam: "sans", bold: true }, 27, COLORS.text)));
  let my = 196 + titleLines.length * 33 + 14;
  const userCount = conv.messages.filter((m) => m.role === "user").length;
  const asstCount = conv.messages.length - userCount;
  const meta: [string, string][] = [
    ["Source", conv.siteName],
    ...(conv.model ? ([["Model", conv.model]] as [string, string][]) : []),
    ["Exported", fmtDate(conv.exportedAt)],
    ["Messages", `${conv.messages.length} (${userCount} from you, ${asstCount} from ${fmt.assistantLabel})`],
  ];
  tp.push({ k: "line", x1: g.left + 16, y1: my, x2: size.w - g.right, y2: my, color: COLORS.rule, lw: 0.8 });
  my += 24;
  for (const [k, v] of meta) {
    tp.push(textOp(k.toUpperCase(), g.left + 16, my, { fam: "sans", bold: true }, 7.6, COLORS.muted));
    const val = sanitize(v, uni, L.stats);
    tp.push(textOp(val, g.left + 100, my, fb.resolve({ fam: "sans" }, val), 10.5, COLORS.text));
    my += 22;
  }
  tp.push(textOp("Generated locally in your browser by Chat to PDF. Your conversation was never uploaded.", g.left + 16, size.h - 78, { fam: "sans" }, 8.2, COLORS.muted));
  if (opts.watermark) tp.push(textOp("Free preview — unlock clean PDFs at goldengoosetools.com", g.left + 16, size.h - 64, { fam: "sans", italic: true }, 8.2, COLORS.muted));

  /* ---------------- TOC reservation ---------------- */
  const rowH = 17;
  const tocRowsPerPage = Math.floor((size.h - g.top - g.bottom - 44) / rowH);
  const tocPages = opts.toc ? Math.max(1, Math.ceil(conv.messages.length / tocRowsPerPage)) : 0;
  const tocStart = 1;
  for (let i = 0; i < tocPages; i++) L.newPage();

  /* ---------------- content ---------------- */
  const msgPages: number[] = [];
  L.newPage();
  conv.messages.forEach((m, i) => {
    msgPages.push(L.message(m, i, fmt));
  });
  if (opts.truncatedFrom && opts.truncatedFrom > conv.messages.length) {
    L.need(80);
    L.openBox({ x: g.left, w: L.contentW, fill: [255, 248, 230], stroke: [230, 205, 140], r: 5 }, 10);
    L.paragraph(
      [{ t: "text", text: `Free preview: this PDF contains the first ${conv.messages.length} of ${opts.truncatedFrom} messages. Unlock clean, full-length PDFs from the Chat to PDF page on goldengoosetools.com.`, bold: true }],
      { x: g.left + 12, w: L.contentW - 24 },
      { fam: "sans", size: 9.2, lh: 1.45, color: [92, 64, 0] },
      0,
    );
    L.closeBox(10);
  }

  const pages: PageData[] = L.pages;
  const total = pages.length;

  /* ---------------- TOC content ---------------- */
  if (opts.toc) {
    for (let p = 0; p < tocPages; p++) {
      const page = pages[tocStart + p];
      if (p === 0) page.fg.push(textOp("Contents", g.left, g.top + 10, { fam: "sans", bold: true }, 19, COLORS.text));
      const slice = conv.messages.slice(p * tocRowsPerPage, (p + 1) * tocRowsPerPage);
      slice.forEach((m, k) => {
        const idx = p * tocRowsPerPage + k;
        const y = g.top + 44 + k * rowH;
        const isUser = m.role === "user";
        const who = isUser ? fmt.userLabel : fmt.assistantLabel;
        const pageNo = String(msgPages[idx] + 1);
        const pw = fb.width(pageNo, { fam: "sans" }, 9);
        const label = `${idx + 1}`;
        page.fg.push(textOp(label, g.left, y, { fam: "sans" }, 8, COLORS.muted));
        page.fg.push(textOp(who, g.left + 24, y, { fam: "sans", bold: true }, 8.6, isUser ? COLORS.muted : fmt.accent));
        const whoW = fb.width(who, { fam: "sans", bold: true }, 8.6);
        const room = size.w - g.left - g.right - 24 - whoW - 10 - pw - 14;
        let pv = sanitize(Layout.preview(m, 120), uni, L.stats).replace(/\s+/g, " ");
        const spec = fb.resolve({ fam: "sans" }, pv);
        while (pv.length > 1 && fb.width(pv, spec, 9) > room) pv = pv.slice(0, -2).trimEnd() + "…";
        const pvW = fb.width(pv, spec, 9);
        const px = g.left + 24 + whoW + 8;
        page.fg.push(textOp(pv, px, y, spec, 9, COLORS.text));
        const dotsFrom = px + pvW + 5;
        const dotsTo = size.w - g.right - pw - 5;
        const dotW = fb.width(". ", { fam: "sans" }, 9);
        const n = Math.floor((dotsTo - dotsFrom) / dotW);
        if (n > 2) page.fg.push(textOp(". ".repeat(n), dotsFrom, y, { fam: "sans" }, 9, COLORS.faint));
        page.fg.push(textOp(pageNo, size.w - g.right - pw, y, { fam: "sans" }, 9, COLORS.text));
        page.fg.push({ k: "link", x: g.left, y: y - 10, w: size.w - g.left - g.right, h: rowH, page: msgPages[idx] + 1 });
      });
    }
  }

  /* ---------------- headers, footers, watermark ---------------- */
  const shortTitle = ellipsize(fb, title, fb.resolve({ fam: "sans" }, title), 8, size.w - g.left - g.right - 150);
  for (let i = 0; i < total; i++) {
    const page = pages[i];
    if (i > 0) {
      page.fg.push(textOp(shortTitle, g.left, 36, fb.resolve({ fam: "sans" }, shortTitle), 8, COLORS.muted));
      const sw = fb.width(conv.siteName, { fam: "sans", bold: true }, 8);
      page.fg.push(textOp(conv.siteName, size.w - g.right - sw, 36, { fam: "sans", bold: true }, 8, fmt.accent));
      page.fg.push({ k: "line", x1: g.left, y1: 44, x2: size.w - g.right, y2: 44, color: COLORS.rule, lw: 0.6 });
      page.fg.push({ k: "line", x1: g.left, y1: size.h - 44, x2: size.w - g.right, y2: size.h - 44, color: COLORS.rule, lw: 0.6 });
      const txt = `Page ${i + 1} of ${total}`;
      const tw = fb.width(txt, { fam: "sans" }, 8);
      page.fg.push(textOp(txt, (size.w - tw) / 2, size.h - 30, { fam: "sans" }, 8, COLORS.muted));
      if (opts.watermark) page.fg.push(textOp(FREE_WATERMARK_TEXT, g.left, size.h - 30, { fam: "sans", italic: true }, 7.4, COLORS.muted));
    }
  }

  /* ---------------- paint ---------------- */
  paintPages(doc, fb, pages);
  if (opts.watermark) {
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      const GState = (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState;
      (doc as unknown as { setGState(s: unknown): void }).setGState(new GState({ opacity: 0.1 }));
      fb.apply({ fam: "sans", bold: true }, 66);
      doc.setTextColor(90, 100, 115);
      doc.text(FREE_WATERMARK_TITLE, size.w / 2, size.h / 2 + 24, { align: "center", angle: 38 });
      fb.apply({ fam: "sans", bold: true }, 17);
      doc.text(FREE_WATERMARK_TEXT, size.w / 2 + 14, size.h / 2 + 62, { align: "center", angle: 38 });
      (doc as unknown as { setGState(s: unknown): void }).setGState(new GState({ opacity: 1 }));
    }
  }
  void paintOp;

  /* ---------------- outline + properties ---------------- */
  const outline = (doc as unknown as { outline: { add(parent: unknown, title: string, opt: { pageNumber: number }): unknown } }).outline;
  outline.add(null, "Title page", { pageNumber: 1 });
  if (opts.toc) outline.add(null, "Contents", { pageNumber: tocStart + 1 });
  conv.messages.forEach((m, i) => {
    const who = m.role === "user" ? fmt.userLabel : fmt.assistantLabel;
    outline.add(null, sanitize(`${i + 1}. ${who}: ${Layout.preview(m, 60)}`, false), { pageNumber: msgPages[i] + 1 });
  });
  doc.setProperties({
    title,
    subject: `${conv.siteName} conversation`,
    creator: CREATOR,
    keywords: `${conv.siteName}, chat, conversation`,
  });

  if (L.stats.replaced > 0) {
    warnings.push(
      `${L.stats.replaced} character${L.stats.replaced === 1 ? "" : "s"} (such as ${[...L.stats.samples].join(" ")}) can't be drawn by the PDF fonts (emoji, CJK, right-to-left scripts) and were replaced with a placeholder.`,
    );
  }
  void blocksText;
  return { bytes: new Uint8Array(doc.output("arraybuffer")), pages: total, warnings };
}

function wrapPlain(fb: FontBook, text: string, spec: FontSpec, size: number, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (fb.width(t, fb.resolve(spec, t), size) <= width || !cur) cur = t;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = ellipsize(fb, kept[maxLines - 1] + "…", fb.resolve(spec, kept[maxLines - 1]), size, width);
    return kept;
  }
  // an over-long single word: hard-trim
  return lines.map((l) => (fb.width(l, fb.resolve(spec, l), size) > width ? ellipsize(fb, l, fb.resolve(spec, l), size, width) : l));
}

function ellipsize(fb: FontBook, text: string, spec: FontSpec, size: number, width: number): string {
  if (fb.width(text, spec, size) <= width) return text;
  let t = text.replace(/…$/, "");
  while (t.length > 1 && fb.width(`${t}…`, spec, size) > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}
