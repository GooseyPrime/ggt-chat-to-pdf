import type { jsPDF } from "jspdf";
import type { FontBook } from "./fonts";
import type { Op, PageData } from "./layout";

type RGB = [number, number, number];

export function paintPages(doc: jsPDF, fb: FontBook, pages: PageData[]): void {
  pages.forEach((page, idx) => {
    if (idx > 0) doc.addPage();
    const bg = page.bg.slice().sort((a, b) => a.z - b.z);
    for (const { op } of bg) paintOp(doc, fb, op);
    for (const op of page.fg) paintOp(doc, fb, op);
  });
}

function setFill(doc: jsPDF, c: RGB) {
  doc.setFillColor(c[0], c[1], c[2]);
}
function setStroke(doc: jsPDF, c: RGB) {
  doc.setDrawColor(c[0], c[1], c[2]);
}

export function paintOp(doc: jsPDF, fb: FontBook, op: Op): void {
  switch (op.k) {
    case "text":
      fb.apply(op.spec, op.size);
      doc.setTextColor(op.color[0], op.color[1], op.color[2]);
      doc.text(op.s, op.x, op.y, { baseline: "alphabetic" });
      break;
    case "rect": {
      const style = op.fill && op.stroke ? "FD" : op.fill ? "F" : "S";
      if (op.fill) setFill(doc, op.fill);
      if (op.stroke) {
        setStroke(doc, op.stroke);
        doc.setLineWidth(op.lw ?? 0.5);
      }
      if (op.r) doc.roundedRect(op.x, op.y, op.w, op.h, op.r, op.r, style);
      else doc.rect(op.x, op.y, op.w, op.h, style);
      break;
    }
    case "line":
      setStroke(doc, op.color);
      doc.setLineWidth(op.lw);
      doc.line(op.x1, op.y1, op.x2, op.y2);
      break;
    case "link":
      if (op.url) doc.link(op.x, op.y, op.w, op.h, { url: op.url });
      else if (op.page) doc.link(op.x, op.y, op.w, op.h, { pageNumber: op.page });
      break;
  }
}
