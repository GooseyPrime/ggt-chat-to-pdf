import type { jsPDF } from "jspdf";

export type Fam = "sans" | "serif" | "mono" | "uni" | "unimono";
export interface FontSpec {
  fam: Fam;
  bold?: boolean;
  italic?: boolean;
}

/** Code points the PDF base-14 fonts can show through WinAnsi (cp1252). */
const CP1252_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

export function isWinAnsi(cp: number): boolean {
  if (cp === 10) return true;
  if (cp >= 0x20 && cp <= 0x7e) return true;
  if (cp >= 0xa0 && cp <= 0xff) return true;
  return CP1252_EXTRA.has(cp);
}

export function isWinAnsiText(text: string): boolean {
  for (const ch of text) if (!isWinAnsi(ch.codePointAt(0) as number)) return false;
  return true;
}

/**
 * Code points DejaVu Sans actually has glyphs for (generated from its cmap; scripts that need shaping
 * or right-to-left layout — Arabic, Hebrew, Indic, Thai — are deliberately excluded because jsPDF
 * would draw them wrongly). Regenerate with scripts/gen-coverage.py if the font file changes.
 */
const UNI_COVERAGE = "20-7e,a0-2e9,2ec-2ee,2f3,2f7,300-34f,351-353,357-358,35a,35c-362,370-377,37a-37f,384-38a,38c,38e-3a1,3a3-525,531-556,559-55f,561-587,589-58a,1e00-1efb,1f00-1f15,1f18-1f1d,1f20-1f45,1f48-1f4d,1f50-1f57,1f59,1f5b,1f5d,1f5f-1f7d,1f80-1fb4,1fb6-1fc4,1fc6-1fd3,1fd6-1fdb,1fdd-1fef,1ff2-1ff4,1ff6-1ffe,2000-2064,206a-2071,2074-208e,2090-209c,20a0-20b5,20b8-20ba,20bd,20d0-20d1,20d6-20d7,20db-20dc,20e1,2100-2109,210b-2149,214b,214e,2150-2185,2189,2190-2311,2318-2319,231c-2321,2324-2328,232b-232c,2373-2375,237a,237d,2387,2394,239b-23ae,23ce-23cf,23e3,23e5,23e8,2422-2423,2460-2469,2500-269c,269e-26b8,26c0-26c3,26e2,2701-2704,2706-2709,270c-2727,2729-274b,274d,274f-2752,2756,2758-275e,2761-2794,2798-27af,27b1-27be,27c5-27c6,27e0,27e6-27eb,27f0-28ff,2906-2907,290a-290b,2940-2941,2983-2984,29ce-29d5,29eb,29fa-29fb,2a00-2a02,2a0c-2a1c,2a2f,2a6a-2a6b,2a7d-2aa0,2aae-2aba,2af9-2afa,2b00-2b1a,2b1f-2b24,2b53-2b54,2c60-2c77,2c79-2c7f,fb00-fb06,fffd,1d538-1d539,1d53b-1d53e,1d540-1d544,1d546,1d54a-1d550,1d552-1d56b,1d5a0-1d5d3,1d7d8-1d7eb";
let uniRanges: [number, number][] | null = null;
export function isUniCovered(cp: number): boolean {
  if (!uniRanges) {
    uniRanges = UNI_COVERAGE.split(",").map((r) => {
      const [a, b] = r.split("-");
      return [parseInt(a, 16), parseInt(b ?? a, 16)] as [number, number];
    });
  }
  let lo = 0;
  let hi = uniRanges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [a, b] = uniRanges[mid];
    if (cp < a) hi = mid - 1;
    else if (cp > b) lo = mid + 1;
    else return true;
  }
  return false;
}

const EMOJI_TEXT: Record<number, string> = {
  0x2705: "✓", 0x2714: "✓", 0x274c: "✗", 0x2716: "✗", 0x2b50: "★", 0x2728: "*", 0x1f44d: "(+1)", 0x1f44e: "(-1)",
  0x1f642: ":)", 0x1f600: ":)", 0x1f60a: ":)", 0x1f609: ";)", 0x1f622: ":(", 0x1f680: "", 0x1f525: "", 0x1f4a1: "",
  0x26a0: "⚠", 0x2753: "?", 0x2757: "!", 0x1f389: "",
};

export interface SanitizeStats {
  replaced: number;
  samples: Set<string>;
}

export function sanitize(text: string, uniAvailable: boolean, stats?: SanitizeStats): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (cp === 10) { out += "\n"; continue; }
    if (cp === 9) { out += "    "; continue; }
    if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) continue;
    if ((cp >= 0x200b && cp <= 0x200f) || cp === 0x2060 || cp === 0xfeff || cp === 0xad || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x202a && cp <= 0x202e)) continue;
    if (cp === 0xa0 || (cp >= 0x2002 && cp <= 0x200a) || cp === 0x202f || cp === 0x205f || cp === 0x3000) { out += " "; continue; }
    if (cp === 0x2011) { out += "-"; continue; }
    if (cp === 0x2212 && !uniAvailable) { out += "-"; continue; }
    if (isWinAnsi(cp)) { out += ch; continue; }
    const emoji = EMOJI_TEXT[cp];
    if (emoji !== undefined) { out += emoji; continue; }
    if (uniAvailable && isUniCovered(cp)) { out += ch; continue; }
    if (stats) {
      stats.replaced++;
      if (stats.samples.size < 8) stats.samples.add(ch);
    }
    out += uniAvailable ? "□" : "?";
  }
  return out;
}

export type FontLoader = (file: string) => Promise<Uint8Array>;

function toBinaryString(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return s;
}

/** Registers the bundled Unicode fallback fonts (DejaVu) with a jsPDF document. */
export async function registerUnicodeFonts(doc: jsPDF, load: FontLoader): Promise<void> {
  const files: [string, string, string][] = [
    ["DejaVuSans.ttf", "DejaVuSans", "normal"],
    ["DejaVuSans-Bold.ttf", "DejaVuSans", "bold"],
    ["DejaVuSansMono.ttf", "DejaVuMono", "normal"],
  ];
  for (const [file, family, style] of files) {
    const data = await load(file);
    doc.addFileToVFS(file, toBinaryString(data));
    doc.addFont(file, family, style);
  }
}

export class FontBook {
  private cache = new Map<string, number>();
  constructor(public doc: jsPDF, public uni: boolean) {}

  /** Resolve a spec for a piece of text: swap to the Unicode families when WinAnsi cannot show it. */
  resolve(spec: FontSpec, text: string): FontSpec {
    if (spec.fam === "uni" || spec.fam === "unimono") return spec;
    if (this.uni && !isWinAnsiText(text)) {
      return { fam: spec.fam === "mono" ? "unimono" : "uni", bold: spec.bold, italic: spec.italic };
    }
    return spec;
  }

  apply(spec: FontSpec, size: number): void {
    const d = this.doc;
    const b = !!spec.bold;
    const i = !!spec.italic;
    switch (spec.fam) {
      case "sans": d.setFont("helvetica", b && i ? "bolditalic" : b ? "bold" : i ? "italic" : "normal"); break;
      case "serif": d.setFont("times", b && i ? "bolditalic" : b ? "bold" : i ? "italic" : "normal"); break;
      case "mono": d.setFont("courier", b && i ? "bolditalic" : b ? "bold" : i ? "italic" : "normal"); break;
      case "uni": d.setFont("DejaVuSans", b ? "bold" : "normal"); break;
      case "unimono": d.setFont("DejaVuMono", "normal"); break;
    }
    d.setFontSize(size);
  }

  width(text: string, spec: FontSpec, size: number): number {
    const key = `${spec.fam}|${spec.bold ? 1 : 0}${spec.italic ? 1 : 0}|${size}|${text}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    this.apply(spec, size);
    const w = this.doc.getTextWidth(text);
    if (this.cache.size > 50000) this.cache.clear();
    this.cache.set(key, w);
    return w;
  }
}
