import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type RGB } from "pdf-lib";

export type EditorFont = "Helvetica" | "Times" | "Courier";

export type TextItem = {
  kind: "text";
  id: string;
  page: number;
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
  font: EditorFont;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: "left" | "center" | "right";
  lineSpacing: number;
  width: number;
  link?: string;
};

export type ShapeItem = {
  kind: "rect" | "ellipse" | "line" | "highlight";
  id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  fill: boolean;
  thickness: number;
  opacity: number;
};

export type ImageItem = {
  kind: "image";
  id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  dataUrl: string;
};

export type DrawItem = {
  kind: "draw";
  id: string;
  page: number;
  points: { x: number; y: number }[];
  color: string;
  thickness: number;
  opacity: number;
};

export type EditorItem = TextItem | ShapeItem | ImageItem | DrawItem;

export type PageInfo = { width: number; height: number; rotation: number };

/** A line of real text found inside an uploaded PDF (coords are top-left origin). */
export type TextBlock = {
  id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  text: string;
};

/* ---------------------------------------------------------------- helpers */

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function toRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full || "000000", 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

async function embedFont(doc: PDFDocument, family: EditorFont, bold: boolean, italic: boolean): Promise<PDFFont> {
  const map: Record<EditorFont, Record<string, StandardFonts>> = {
    Helvetica: {
      normal: StandardFonts.Helvetica,
      bold: StandardFonts.HelveticaBold,
      italic: StandardFonts.HelveticaOblique,
      bolditalic: StandardFonts.HelveticaBoldOblique,
    },
    Times: {
      normal: StandardFonts.TimesRoman,
      bold: StandardFonts.TimesRomanBold,
      italic: StandardFonts.TimesRomanItalic,
      bolditalic: StandardFonts.TimesRomanBoldItalic,
    },
    Courier: {
      normal: StandardFonts.Courier,
      bold: StandardFonts.CourierBold,
      italic: StandardFonts.CourierOblique,
      bolditalic: StandardFonts.CourierBoldOblique,
    },
  };
  const key = `${bold ? "bold" : ""}${italic ? "italic" : ""}` || "normal";
  return doc.embedFont(map[family][key]);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}

/* ------------------------------------------------------------ pdf loading */

export async function createBlankPdf(pages = 1, size: [number, number] = [595.28, 841.89]) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage(size);
  return doc.save();
}

export async function pdfInfo(bytes: Uint8Array): Promise<PageInfo[]> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPages().map((p) => ({ width: p.getWidth(), height: p.getHeight(), rotation: p.getRotation().angle }));
}

/* --------------------------------------------------------- committing edits */

/** Bakes overlay items into the PDF at their page coordinates (origin: top-left). */
export async function commitItems(bytes: Uint8Array, items: EditorItem[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();

  for (const item of items) {
    const page = pages[item.page];
    if (!page) continue;
    const H = page.getHeight();

    if (item.kind === "text") {
      const font = await embedFont(doc, item.font, item.bold, item.italic);
      const lines = wrapText(item.text, font, item.size, item.width);
      const lh = item.size * item.lineSpacing;
      lines.forEach((line, i) => {
        const lineWidth = font.widthOfTextAtSize(line, item.size);
        const offset =
          item.align === "center" ? (item.width - lineWidth) / 2 : item.align === "right" ? item.width - lineWidth : 0;
        const x = item.x + offset;
        const y = H - item.y - item.size - i * lh;
        page.drawText(line, { x, y, size: item.size, font, color: toRgb(item.color) });
        if (item.underline) {
          page.drawLine({
            start: { x, y: y - 2 },
            end: { x: x + lineWidth, y: y - 2 },
            thickness: Math.max(0.6, item.size / 16),
            color: toRgb(item.color),
          });
        }
      });
      if (item.link) {
        // Visible link cue — a blue underline under the linked text block.
        const height = Math.max(lh * lines.length, item.size);
        page.drawLine({
          start: { x: item.x, y: H - item.y - height },
          end: { x: item.x + item.width, y: H - item.y - height },
          thickness: 0.8,
          color: rgb(0.2, 0.35, 0.85),
        });
      }
      continue;
    }

    if (item.kind === "image") {
      const isPng = item.dataUrl.startsWith("data:image/png");
      const img = isPng ? await doc.embedPng(item.dataUrl) : await doc.embedJpg(item.dataUrl);
      page.drawImage(img, { x: item.x, y: H - item.y - item.h, width: item.w, height: item.h });
      continue;
    }

    if (item.kind === "draw") {
      for (let i = 1; i < item.points.length; i++) {
        const a = item.points[i - 1];
        const b = item.points[i];
        page.drawLine({
          start: { x: a.x, y: H - a.y },
          end: { x: b.x, y: H - b.y },
          thickness: item.thickness,
          color: toRgb(item.color),
          opacity: item.opacity,
        });
      }
      continue;
    }

    const color = toRgb(item.color);
    if (item.kind === "line") {
      page.drawLine({
        start: { x: item.x, y: H - item.y },
        end: { x: item.x + item.w, y: H - item.y - item.h },
        thickness: item.thickness,
        color,
        opacity: item.opacity,
      });
    } else if (item.kind === "ellipse") {
      page.drawEllipse({
        x: item.x + item.w / 2,
        y: H - item.y - item.h / 2,
        xScale: Math.abs(item.w / 2),
        yScale: Math.abs(item.h / 2),
        borderColor: color,
        borderWidth: item.thickness,
        color: item.fill ? color : undefined,
        opacity: item.fill ? item.opacity : undefined,
        borderOpacity: item.opacity,
      });
    } else {
      page.drawRectangle({
        x: item.x,
        y: H - item.y - item.h,
        width: item.w,
        height: item.h,
        borderColor: item.kind === "highlight" ? undefined : color,
        borderWidth: item.kind === "highlight" ? 0 : item.thickness,
        color: item.fill || item.kind === "highlight" ? color : undefined,
        opacity: item.kind === "highlight" ? Math.min(item.opacity, 0.45) : item.fill ? item.opacity : undefined,
        borderOpacity: item.opacity,
      });
    }
  }

  return doc.save();
}

/* ------------------------------------------------------------- page tools */

export async function rotatePage(bytes: Uint8Array, index: number, delta: number) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const page = doc.getPage(index);
  page.setRotation(degrees((page.getRotation().angle + delta + 360) % 360));
  return doc.save();
}

export async function deletePage(bytes: Uint8Array, index: number) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  if (doc.getPageCount() <= 1) throw new Error("A PDF needs at least one page.");
  doc.removePage(index);
  return doc.save();
}

export async function duplicatePage(bytes: Uint8Array, index: number) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const [copy] = await doc.copyPages(doc, [index]);
  doc.insertPage(index + 1, copy);
  return doc.save();
}

export async function movePage(bytes: Uint8Array, index: number, target: number) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const count = doc.getPageCount();
  if (target < 0 || target >= count || target === index) return doc.save();
  const order = Array.from({ length: count }, (_, i) => i);
  order.splice(target, 0, order.splice(index, 1)[0]);
  const out = await PDFDocument.create();
  const copies = await out.copyPages(doc, order);
  copies.forEach((p) => out.addPage(p));
  return out.save();
}

export async function insertBlankPage(bytes: Uint8Array, index: number) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const ref = doc.getPage(Math.min(index, doc.getPageCount() - 1));
  doc.insertPage(index + 1, [ref.getWidth(), ref.getHeight()]);
  return doc.save();
}

export async function extractPages(bytes: Uint8Array, indices: number[]) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const copies = await out.copyPages(doc, indices);
  copies.forEach((p) => out.addPage(p));
  return out.save();
}

export async function mergePdfs(sources: (Uint8Array | ArrayBuffer)[]) {
  const out = await PDFDocument.create();
  for (const src of sources) {
    const doc = await PDFDocument.load(src, { ignoreEncryption: true });
    const copies = await out.copyPages(doc, doc.getPageIndices());
    copies.forEach((p) => out.addPage(p));
  }
  return out.save();
}

/** Parses "1-3,5" into zero-based page indices. */
export function parseRange(input: string, pageCount: number) {
  const result = new Set<number>();
  for (const part of input.split(",")) {
    const chunk = part.trim();
    if (!chunk) continue;
    const [a, b] = chunk.split("-").map((v) => parseInt(v.trim(), 10));
    const start = Number.isFinite(a) ? a : 1;
    const end = Number.isFinite(b) ? b : start;
    for (let i = start; i <= end; i++) if (i >= 1 && i <= pageCount) result.add(i - 1);
  }
  return [...result].sort((x, y) => x - y);
}

/* --------------------------------------------------------------- extras */

export async function addWatermark(bytes: Uint8Array, text: string, opacity = 0.18) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const page of doc.getPages()) {
    const size = Math.min(page.getWidth(), page.getHeight()) / Math.max(6, text.length * 0.55);
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: page.getWidth() / 2 - w / 2,
      y: page.getHeight() / 2,
      size,
      font,
      color: rgb(0.25, 0.35, 0.75),
      opacity,
      rotate: degrees(35),
    });
  }
  return doc.save();
}

export async function addImageWatermark(bytes: Uint8Array, dataUrl: string, opacity = 0.18) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const img = dataUrl.startsWith("data:image/png") ? await doc.embedPng(dataUrl) : await doc.embedJpg(dataUrl);
  for (const page of doc.getPages()) {
    const scale = Math.min(page.getWidth() / img.width, page.getHeight() / img.height) * 0.6;
    page.drawImage(img, {
      x: (page.getWidth() - img.width * scale) / 2,
      y: (page.getHeight() - img.height * scale) / 2,
      width: img.width * scale,
      height: img.height * scale,
      opacity,
    });
  }
  return doc.save();
}

export async function addPageNumbers(bytes: Uint8Array, prefix = "") {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.getPages().forEach((page, i) => {
    const label = `${prefix}${i + 1} / ${doc.getPageCount()}`;
    const w = font.widthOfTextAtSize(label, 9);
    page.drawText(label, { x: page.getWidth() / 2 - w / 2, y: 22, size: 9, font, color: rgb(0.35, 0.35, 0.4) });
  });
  return doc.save();
}

export async function addHeaderFooter(bytes: Uint8Array, header: string, footer: string) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const page of doc.getPages()) {
    if (header) page.drawText(header, { x: 48, y: page.getHeight() - 30, size: 9, font, color: rgb(0.4, 0.4, 0.45) });
    if (footer) page.drawText(footer, { x: 48, y: 38, size: 9, font, color: rgb(0.4, 0.4, 0.45) });
  }
  return doc.save();
}

/** Rebuilds the PDF from rasterized pages — big size win for scans/images. */
export async function compressPdf(bytes: Uint8Array, quality = 0.6, scale = 1.6) {
  const { pdfToJpegs } = await import("./pdf");
  const images = await pdfToJpegs(new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }), scale, quality);
  const info = await pdfInfo(bytes);
  const out = await PDFDocument.create();
  for (let i = 0; i < images.length; i++) {
    const size = info[i] ?? info[0];
    const page = out.addPage([size.width, size.height]);
    const img = await out.embedJpg(images[i]);
    page.drawImage(img, { x: 0, y: 0, width: size.width, height: size.height });
  }
  return out.save();
}

/** Extracts the text layer of every page (empty for scanned PDFs — use OCR). */
export async function renderPageImage(bytes: Uint8Array, index: number, scale = 2, quality = 0.9) {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const page = await pdf.getPage(index + 1);
  const base = page.getViewport({ scale: 1 });
  const safe = Math.min(scale, 3200 / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale: Math.max(0.2, safe) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const url = canvas.toDataURL("image/jpeg", quality);
  await pdf.cleanup();
  return url;
}

export async function extractPdfText(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    out.push(
      content.items
        .map((it) => ("str" in it ? (it as { str: string }).str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  await pdf.cleanup();
  return out;
}

/** Word-compatible export (HTML .doc, opens in Word / Google Docs). */
export function textToWordBlob(title: string, pages: string[]) {
  void 0;
  const body = pages
    .map((p, i) => `<h3>Page ${i + 1}</h3><p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;") || "&nbsp;"}</p>`)
    .join("<br style='page-break-before:always'/>");
  const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`;
  return new Blob([html], { type: "application/msword" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function bytesToBlob(bytes: Uint8Array) {
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}