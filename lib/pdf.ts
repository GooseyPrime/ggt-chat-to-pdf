import { jsPDF } from "jspdf";
import { FREE_WATERMARK, TOOL_NAME } from "./config";
import type { ChatMessage } from "./types";

export type PdfOptions = {
  messages: ChatMessage[];
  /** When false, draw free-preview watermark on every page. */
  unlocked: boolean;
  /** Optional note under title (e.g. capped message warning). */
  note?: string;
};

/** Build a chat transcript PDF entirely in the browser. */
export function buildChatPdf(opts: PdfOptions): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
      if (!opts.unlocked) drawWatermark(doc, pageWidth, pageHeight);
    }
  };

  if (!opts.unlocked) drawWatermark(doc, pageWidth, pageHeight);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(TOOL_NAME, margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(
    opts.unlocked
      ? "Clean export · generated in your browser"
      : "Free preview · watermarked · generated in your browser",
    margin,
    y,
  );
  y += 16;

  if (opts.note) {
    const noteLines = doc.splitTextToSize(opts.note, maxWidth) as string[];
    ensureSpace(noteLines.length * 12 + 8);
    doc.setTextColor(120, 80, 40);
    for (const line of noteLines) {
      doc.text(line, margin, y);
      y += 12;
    }
    y += 6;
    doc.setTextColor(0);
  }

  doc.setDrawColor(180);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  for (const msg of opts.messages) {
    const roleLabel = msg.meta ? `${msg.role}  ·  ${msg.meta}` : msg.role;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(40, 60, 90);
    ensureSpace(28);
    doc.text(roleLabel, margin, y);
    y += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(20);
    const content = msg.content || "(empty)";
    const lines = doc.splitTextToSize(content, maxWidth) as string[];
    for (const line of lines) {
      ensureSpace(14);
      doc.text(line, margin, y);
      y += 13;
    }
    y += 12;
  }

  if (!opts.unlocked) {
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(FREE_WATERMARK, margin, pageHeight - 24);
  }

  return doc;
}

export function downloadChatPdf(opts: PdfOptions, filename = "chat-to-pdf.pdf"): void {
  const doc = buildChatPdf(opts);
  doc.save(filename);
}

function drawWatermark(doc: jsPDF, pageWidth: number, pageHeight: number): void {
  doc.saveGraphicsState();
  doc.setTextColor(200, 205, 215);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(22);
  const text = FREE_WATERMARK;
  doc.text(text, pageWidth / 2, pageHeight / 2, {
    align: "center",
    angle: 35,
  });
  doc.restoreGraphicsState();
}
