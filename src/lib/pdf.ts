export type PdfResult = { blob: Blob; pageCount: number };

const MARGIN = 48;

export async function textToPdf(title: string, content: string): Promise<PdfResult> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - MARGIN * 2;
  let y = MARGIN;

  const newPageIfNeeded = (needed: number) => {
    if (y + needed > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(doc.splitTextToSize(title, maxWidth), MARGIN, y);
  y += 28 * doc.splitTextToSize(title, maxWidth).length;
  doc.setDrawColor(60, 110, 220);
  doc.setLineWidth(2);
  doc.line(MARGIN, y - 8, MARGIN + 90, y - 8);
  y += 14;

  const lines = content.replace(/\r/g, "").split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      y += 10;
      continue;
    }
    let text = line;
    let size = 11;
    let style: "normal" | "bold" = "normal";
    let indent = 0;

    if (line.startsWith("### ")) {
      text = line.slice(4);
      size = 12;
      style = "bold";
    } else if (line.startsWith("## ")) {
      text = line.slice(3);
      size = 14;
      style = "bold";
    } else if (line.startsWith("# ")) {
      text = line.slice(2);
      size = 16;
      style = "bold";
    } else if (/^[-*]\s+/.test(line)) {
      text = `•  ${line.replace(/^[-*]\s+/, "")}`;
      indent = 12;
    }

    text = text.replace(/\*\*(.+?)\*\*/g, "$1");
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(text, maxWidth - indent) as string[];
    const lineHeight = size * 1.45;
    for (const w of wrapped) {
      newPageIfNeeded(lineHeight);
      doc.text(w, MARGIN + indent, y);
      y += lineHeight;
    }
    if (style === "bold") y += 6;
  }

  return { blob: doc.output("blob"), pageCount: doc.getNumberOfPages() };
}

export async function imagesToPdf(images: string[]): Promise<PdfResult> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 0; i < images.length; i++) {
    if (i > 0) doc.addPage();
    const size = await imageSize(images[i]);
    const scale = Math.min((pageWidth - 32) / size.width, (pageHeight - 32) / size.height);
    const w = size.width * scale;
    const h = size.height * scale;
    doc.addImage(images[i], "JPEG", (pageWidth - w) / 2, (pageHeight - h) / 2, w, h, undefined, "FAST");
  }

  return { blob: doc.output("blob"), pageCount: images.length || 1 };
}

function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = src;
  });
}

export type EnhanceOptions = {
  brightness: number;
  contrast: number;
  sharpness: number;
  removeShadows: boolean;
  rotate: number;
  autoCrop: boolean;
};

export const defaultEnhance: EnhanceOptions = {
  brightness: 8,
  contrast: 18,
  sharpness: 30,
  removeShadows: true,
  rotate: 0,
  autoCrop: true,
};

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/** Canvas based document clean-up: rotate, auto crop borders, shadow removal, brightness/contrast/sharpen. */
export async function enhanceImage(src: string, opts: EnhanceOptions): Promise<string> {
  const img = await loadImage(src);
  const maxSide = 2000;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const baseW = Math.round(img.naturalWidth * scale);
  const baseH = Math.round(img.naturalHeight * scale);

  const rotated = ((opts.rotate % 360) + 360) % 360;
  const swap = rotated === 90 || rotated === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? baseH : baseW;
  canvas.height = swap ? baseW : baseH;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotated * Math.PI) / 180);
  ctx.drawImage(img, -baseW / 2, -baseH / 2, baseW, baseH);

  let data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  data = applyTone(data, opts);
  ctx.putImageData(data, 0, 0);

  if (opts.sharpness > 0) sharpen(ctx, canvas.width, canvas.height, opts.sharpness / 100);

  const output = opts.autoCrop ? autoCrop(canvas) : canvas;
  return output.toDataURL("image/jpeg", 0.92);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

function applyTone(imageData: ImageData, opts: EnhanceOptions) {
  const d = imageData.data;
  const brightness = opts.brightness * 2.55;
  const c = opts.contrast;
  const factor = (259 * (c + 255)) / (255 * (259 - c));

  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
  const mean = sum / (d.length / 4);
  const shadowLift = opts.removeShadows ? Math.max(0, 190 - mean) * 0.35 : 0;

  for (let i = 0; i < d.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      let v = d[i + k] + brightness + shadowLift;
      v = factor * (v - 128) + 128;
      d[i + k] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return imageData;
}

function sharpen(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const a = amount;
  const kernel = [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0];
  const s = src.data;
  const o = out.data;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        let acc = 0;
        let ki = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            acc += s[((y + dy) * w + (x + dx)) * 4 + k] * kernel[ki++];
          }
        }
        o[idx + k] = acc < 0 ? 0 : acc > 255 ? 255 : acc;
      }
      o[idx + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}

/** Trims near-white borders so the page fills the frame. */
function autoCrop(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  const threshold = 238;
  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;

  const rowIsBlank = (y: number) => {
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * 4;
      if ((data[i] + data[i + 1] + data[i + 2]) / 3 < threshold) return false;
    }
    return true;
  };
  const colIsBlank = (x: number) => {
    for (let y = 0; y < height; y += 4) {
      const i = (y * width + x) * 4;
      if ((data[i] + data[i + 1] + data[i + 2]) / 3 < threshold) return false;
    }
    return true;
  };

  while (top < bottom && rowIsBlank(top)) top++;
  while (bottom > top && rowIsBlank(bottom)) bottom--;
  while (left < right && colIsBlank(left)) left++;
  while (right > left && colIsBlank(right)) right--;

  const pad = 12;
  top = Math.max(0, top - pad);
  left = Math.max(0, left - pad);
  bottom = Math.min(height - 1, bottom + pad);
  right = Math.min(width - 1, right + pad);

  const cw = right - left;
  const ch = bottom - top;
  if (cw < width * 0.3 || ch < height * 0.3) return canvas;

  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  out.getContext("2d")!.drawImage(canvas, left, top, cw, ch, 0, 0, cw, ch);
  return out;
}

export async function makeQrDataUrl(text: string) {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(text, { width: 512, margin: 1, color: { dark: "#1c3faa", light: "#ffffff" } });
}