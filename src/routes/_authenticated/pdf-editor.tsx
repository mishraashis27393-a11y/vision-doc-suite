import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Download,
  Eraser,
  FilePlus2,
  FileText,
  Highlighter,
  ImagePlus,
  Layers,
  Loader2,
  Merge,
  PenLine,
  Redo2,
  RotateCw,
  Save,
  ScanText,
  Search,
  Share2,
  Shapes,
  Split,
  Trash2,
  Type,
  Undo2,
  Upload,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getDocument, listDocuments, replaceDocumentFile, saveDocument, signedUrl, type DocumentRow } from "@/lib/documents";
import { fileToDataUrl, pdfToJpegs, downloadDataUrl } from "@/lib/pdf";
import { ocrPage } from "@/lib/ai.functions";
import {
  addHeaderFooter,
  addImageWatermark,
  addPageNumbers,
  addWatermark,
  bytesToBlob,
  commitItems,
  compressPdf,
  createBlankPdf,
  deletePage,
  downloadBlob,
  duplicatePage,
  eraseRegion,
  extractTextBlocks,
  replaceTextBlock,
  extractPages,
  extractPdfText,
  insertBlankPage,
  mergePdfs,
  movePage,
  parseRange,
  pdfInfo,
  renderPageImage,
  rotatePage,
  textToWordBlob,
  uid,
  type EditorFont,
  type EditorItem,
  type PageInfo,
  type TextBlock,
} from "@/lib/pdf-editor";

type Search = { doc?: string };

export const Route = createFileRoute("/_authenticated/pdf-editor")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    doc: typeof search.doc === "string" ? search.doc : undefined,
  }),
  head: () => ({
    meta: [
      { title: "PDF Editor — D.Cr Library" },
      {
        name: "description",
        content: "Edit PDFs on mobile: add text, images, signatures, shapes, merge, split, compress, OCR and export.",
      },
      { property: "og:title", content: "PDF Editor — D.Cr Library" },
      { property: "og:description", content: "A premium built-in PDF editing workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PdfEditorPage,
});

type Tool = "select" | "edit" | "erase" | "text" | "highlight" | "rect" | "ellipse" | "line" | "draw" | "image" | "signature";

const TOOLS: { id: Tool; label: string; icon: typeof Type }[] = [
  { id: "select", label: "View", icon: Search },
  { id: "edit", label: "Edit text", icon: PenLine },
  { id: "text", label: "Text", icon: Type },
  { id: "erase", label: "Erase", icon: Eraser },
  { id: "highlight", label: "Highlight", icon: Highlighter },
  { id: "draw", label: "Draw", icon: PenLine },
  { id: "rect", label: "Box", icon: Shapes },
  { id: "ellipse", label: "Circle", icon: Shapes },
  { id: "line", label: "Line", icon: Shapes },
  { id: "image", label: "Image", icon: ImagePlus },
  { id: "signature", label: "Sign", icon: PenLine },
];

function PdfEditorPage() {
  const { doc: docId } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [history, setHistory] = useState<Uint8Array[]>([]);
  const [cursor, setCursor] = useState(-1);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<string>("");
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState("Untitled document");
  const [linkedDoc, setLinkedDoc] = useState<DocumentRow | null>(null);
  const [dirty, setDirty] = useState(false);

  const [tool, setTool] = useState<Tool>("select");
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(14);
  const [font, setFont] = useState<EditorFont>("Helvetica");
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);
  const [align, setAlign] = useState<"left" | "center" | "right">("left");
  const [lineSpacing, setLineSpacing] = useState(1.35);
  const [color, setColor] = useState("#1c3faa");
  const [thickness, setThickness] = useState(2);
  const [autoSave, setAutoSave] = useState(true);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchHits, setSearchHits] = useState<number[] | null>(null);
  const [blocks, setBlocks] = useState<TextBlock[]>([]);
  const [activeBlock, setActiveBlock] = useState<TextBlock | null>(null);
  const [blockText, setBlockText] = useState("");
  const [blockSize, setBlockSize] = useState(12);
  const [blockBg, setBlockBg] = useState("#ffffff");

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const openInput = useRef<HTMLInputElement | null>(null);
  const mergeInput = useRef<HTMLInputElement | null>(null);
  const imageInput = useRef<HTMLInputElement | null>(null);
  const cameraInput = useRef<HTMLInputElement | null>(null);
  const drag = useRef<{ start: { x: number; y: number }; points: { x: number; y: number }[] } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [sigOpen, setSigOpen] = useState(false);

  const { data: libraryDocs = [] } = useQuery({ queryKey: ["documents"], queryFn: listDocuments });

  /* ---------------------------------------------------------- state helpers */

  const push = useCallback(
    (next: Uint8Array) => {
      setHistory((h) => [...h.slice(0, cursor + 1), next].slice(-25));
      setCursor((c) => Math.min(c + 1, 24));
      setBytes(next);
      setDirty(true);
    },
    [cursor],
  );

  const load = useCallback((next: Uint8Array, name: string, doc: DocumentRow | null) => {
    setBytes(next);
    setHistory([next]);
    setCursor(0);
    setPage(0);
    setTitle(name);
    setLinkedDoc(doc);
    setDirty(false);
  }, []);

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }, []);

  /* ----------------------------------------------------------- open sources */

  useEffect(() => {
    if (!docId || bytes) return;
    void run("Opening document…", async () => {
      const doc = await getDocument(docId);
      if (!doc?.file_path) throw new Error("That document has no PDF file.");
      const url = await signedUrl(doc.file_path);
      const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
      load(buf, doc.title, doc);
    });
  }, [docId, bytes, load, run]);

  useEffect(() => {
    if (!bytes) return;
    let cancelled = false;
    void (async () => {
      try {
        const info = await pdfInfo(bytes);
        if (cancelled) return;
        setPages(info);
        const safePage = Math.min(page, info.length - 1);
        if (safePage !== page) setPage(safePage);
        const img = await renderPageImage(bytes, safePage, 2);
        if (!cancelled) setPreview(img);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Could not render this PDF.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bytes, page]);

  const buildThumbs = () =>
    run("Building thumbnails…", async () => {
      if (!bytes) return;
      setThumbs(await pdfToJpegs(bytesToBlob(bytes), 0.5, 0.6));
    });

  /* --------------------------------------------------------------- editing */

  const pageSize = pages[page] ?? { width: 595, height: 842, rotation: 0 };

  const toPagePoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * pageSize.width,
      y: ((clientY - rect.top) / rect.height) * pageSize.height,
    };
  };

  const apply = (item: EditorItem) =>
    run("Applying…", async () => {
      if (!bytes) return;
      push(await commitItems(bytes, [item]));
    });

  /* Load the real text lines of the current page when the Edit-text tool is on. */
  useEffect(() => {
    if (tool !== "edit" || !bytes) return;
    let cancelled = false;
    void (async () => {
      try {
        const found = await extractTextBlocks(bytes, page);
        if (!cancelled) {
          setBlocks(found);
          if (!found.length) toast.info("No selectable text here — run OCR in the Text tab for scanned pages.");
        }
      } catch {
        if (!cancelled) setBlocks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tool, bytes, page]);

  const openBlock = (b: TextBlock) => {
    setActiveBlock(b);
    setBlockText(b.text);
    setBlockSize(Math.round(b.size));
  };

  const commitBlock = (nextText: string) =>
    run("Updating text…", async () => {
      if (!bytes || !activeBlock) return;
      const out = await replaceTextBlock(bytes, activeBlock, {
        text: nextText,
        size: blockSize,
        color,
        font,
        bold,
        italic,
        underline,
        align,
        background: blockBg,
      });
      push(out);
      setActiveBlock(null);
      setBlocks([]);
      toast.success(nextText.trim() ? "Text updated" : "Text removed");
    });

  const onPointerDown = (e: React.PointerEvent) => {
    if (!bytes || tool === "select" || tool === "edit") return;
    const p = toPagePoint(e.clientX, e.clientY);

    if (tool === "text") {
      if (!text.trim()) {
        toast.info("Type your text in the Text panel first.");
        return;
      }
      void apply({
        kind: "text",
        id: uid(),
        page,
        x: p.x,
        y: p.y,
        text,
        size: fontSize,
        color,
        font,
        bold,
        italic,
        underline,
        align,
        lineSpacing,
        width: Math.max(80, pageSize.width - p.x - 40),
      });
      return;
    }

    if (tool === "image" || tool === "signature") {
      if (!pendingImage) {
        toast.info(tool === "image" ? "Pick an image first." : "Draw a signature first.");
        return;
      }
      const img = new Image();
      img.onload = () => {
        const w = Math.min(200, pageSize.width - p.x - 20);
        const h = (img.naturalHeight / img.naturalWidth) * w;
        void apply({ kind: "image", id: uid(), page, x: p.x, y: p.y, w, h, dataUrl: pendingImage });
      };
      img.src = pendingImage;
      return;
    }

    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { start: p, points: [p] };
    setGhost({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const p = toPagePoint(e.clientX, e.clientY);
    drag.current.points.push(p);
    const s = drag.current.start;
    setGhost({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    if (!d || !bytes) return;
    const last = d.points[d.points.length - 1];

    if (tool === "draw") {
      if (d.points.length < 2) return;
      void apply({ kind: "draw", id: uid(), page, points: d.points, color, thickness, opacity: 1 });
      return;
    }
    const x = Math.min(d.start.x, last.x);
    const y = Math.min(d.start.y, last.y);
    if (tool === "erase") {
      const w = Math.abs(last.x - d.start.x);
      const h = Math.abs(last.y - d.start.y);
      if (w < 3 || h < 3) return;
      void run("Erasing…", async () => {
        push(await eraseRegion(bytes, page, { x, y, w, h }, blockBg));
        toast.success("Area cleared — place an image or text over it if you like.");
      });
      return;
    }
    const w = tool === "line" ? last.x - d.start.x : Math.abs(last.x - d.start.x);
    const h = tool === "line" ? last.y - d.start.y : Math.abs(last.y - d.start.y);
    if (Math.abs(w) < 3 && Math.abs(h) < 3) return;
    void apply({
      kind: tool === "highlight" ? "highlight" : (tool as "rect" | "ellipse" | "line"),
      id: uid(),
      page,
      x: tool === "line" ? d.start.x : x,
      y: tool === "line" ? d.start.y : y,
      w,
      h,
      color: tool === "highlight" ? "#ffe066" : color,
      fill: tool === "highlight",
      thickness,
      opacity: tool === "highlight" ? 0.4 : 1,
    });
  };

  /* ---------------------------------------------------------------- saving */

  const saveToLibrary = useCallback(
    async (silent = false) => {
      if (!bytes) return;
      const blob = bytesToBlob(bytes);
      if (linkedDoc) {
        const path = await replaceDocumentFile(linkedDoc, blob, pages.length || 1);
        setLinkedDoc({ ...linkedDoc, file_path: path, file_size: blob.size, page_count: pages.length || 1 });
      } else {
        const created = await saveDocument({
          title,
          docType: "pdf-editor",
          source: "scan",
          blob,
          pageCount: pages.length || 1,
          summary: "Created with the PDF Editor",
        });
        setLinkedDoc(created);
      }
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      if (!silent) toast.success("Saved to your library");
    },
    [bytes, linkedDoc, pages.length, queryClient, title],
  );

  useEffect(() => {
    if (!autoSave || !dirty || !bytes || busy) return;
    const t = setTimeout(() => {
      void saveToLibrary(true).catch(() => undefined);
    }, 4000);
    return () => clearTimeout(t);
  }, [autoSave, dirty, bytes, busy, saveToLibrary]);

  const saveCopy = () =>
    run("Saving a copy…", async () => {
      if (!bytes) return;
      const created = await saveDocument({
        title: `${title} (v${(linkedDoc ? 2 : 1) + cursor})`,
        docType: "pdf-editor",
        source: "scan",
        blob: bytesToBlob(bytes),
        pageCount: pages.length || 1,
        summary: "Version saved from the PDF Editor",
      });
      setLinkedDoc(created);
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Version saved to your library");
    });

  /* --------------------------------------------------------------- exports */

  const exportAs = (format: "pdf" | "jpg" | "png" | "word" | "txt") =>
    run("Exporting…", async () => {
      if (!bytes) return;
      const safe = title.replace(/[^\w\d-]+/g, "_").slice(0, 60) || "document";
      if (format === "pdf") return downloadBlob(bytesToBlob(bytes), `${safe}.pdf`);
      if (format === "jpg" || format === "png") {
        const images = await pdfToJpegs(bytesToBlob(bytes), 3, 0.95);
        for (let i = 0; i < images.length; i++) {
          let url = images[i];
          if (format === "png") {
            const img = await new Promise<HTMLImageElement>((res, rej) => {
              const el = new Image();
              el.onload = () => res(el);
              el.onerror = () => rej(new Error("Could not convert page"));
              el.src = images[i];
            });
            const c = document.createElement("canvas");
            c.width = img.naturalWidth;
            c.height = img.naturalHeight;
            c.getContext("2d")!.drawImage(img, 0, 0);
            url = c.toDataURL("image/png");
          }
          downloadDataUrl(url, `${safe}-p${i + 1}.${format}`);
          await new Promise((r) => setTimeout(r, 250));
        }
        return;
      }
      const text = await extractPdfText(bytes);
      if (format === "txt") return downloadBlob(new Blob([text.join("\n\n")], { type: "text/plain" }), `${safe}.txt`);
      downloadBlob(textToWordBlob(title, text), `${safe}.doc`);
    });

  const share = () =>
    run("Preparing share…", async () => {
      if (!bytes) return;
      const file = new File([bytesToBlob(bytes)], `${title || "document"}.pdf`, { type: "application/pdf" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
      } else {
        downloadBlob(bytesToBlob(bytes), `${title || "document"}.pdf`);
        toast.info("Sharing isn't supported here — the PDF was downloaded instead.");
      }
    });

  /* --------------------------------------------------------------- render */

  const ghostBox = useMemo(() => {
    if (!ghost) return null;
    return {
      left: `${(ghost.x / pageSize.width) * 100}%`,
      top: `${(ghost.y / pageSize.height) * 100}%`,
      width: `${(ghost.w / pageSize.width) * 100}%`,
      height: `${(ghost.h / pageSize.height) * 100}%`,
    };
  }, [ghost, pageSize]);

  if (!bytes) {
    return (
      <AppShell title="PDF Editor" subtitle="Open, edit and export PDFs">
        <StartScreen
          busy={busy}
          libraryDocs={libraryDocs}
          onBlank={() =>
            run("Creating…", async () => {
              load(await createBlankPdf(1), "Untitled document", null);
            })
          }
          onOpenFile={() => openInput.current?.click()}
          onOpenDoc={(d) => navigate({ to: "/pdf-editor", search: { doc: d.id } })}
          onScan={() => cameraInput.current?.click()}
        />
        <input
          ref={openInput}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            void run("Opening…", async () => {
              load(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.pdf$/i, ""), null);
            });
          }}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (!files.length) return;
            void run("Building PDF…", async () => {
              const { imagesToPdf } = await import("@/lib/pdf");
              const urls = await Promise.all(files.map(fileToDataUrl));
              const { blob } = await imagesToPdf(urls);
              load(new Uint8Array(await blob.arrayBuffer()), "Scanned document", null);
            });
          }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="PDF Editor"
      subtitle={`${pages.length} page${pages.length === 1 ? "" : "s"}${dirty ? " · unsaved" : " · saved"}`}
      action={
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            disabled={cursor <= 0}
            onClick={() => {
              const next = cursor - 1;
              setCursor(next);
              setBytes(history[next]);
              setDirty(true);
            }}
            aria-label="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={cursor >= history.length - 1}
            onClick={() => {
              const next = cursor + 1;
              setCursor(next);
              setBytes(history[next]);
              setDirty(true);
            }}
            aria-label="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => void run("Saving…", () => saveToLibrary())}>
            <Save className="mr-1 h-4 w-4" /> Save
          </Button>
        </div>
      }
    >
      {busy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="surface-card flex items-center gap-3 px-5 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-brand-ink" />
            <span className="text-sm font-semibold">{busy}</span>
          </div>
        </div>
      )}

      <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mb-3 font-semibold" aria-label="Document title" />

      {/* Toolbar */}
      <div className="mb-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
              tool === t.id ? "border-transparent bg-brand text-primary-foreground" : "border-border bg-card text-muted-foreground",
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div className="surface-card overflow-hidden p-2">
        <div
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="relative mx-auto w-full touch-none select-none"
          style={{ aspectRatio: `${pageSize.width} / ${pageSize.height}` }}
        >
          {preview ? (
            <img src={preview} alt={`Page ${page + 1} of ${title}`} className="h-full w-full rounded-lg object-contain" />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg bg-muted">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {ghostBox && <div className="pointer-events-none absolute border-2 border-brand/70 bg-brand/10" style={ghostBox} />}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs font-semibold text-muted-foreground">
          Page {page + 1} / {pages.length}
        </span>
        <Button size="sm" variant="outline" disabled={page >= pages.length - 1} onClick={() => setPage((p) => p + 1)}>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="format" className="mt-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="format">Format</TabsTrigger>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="text">Text</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------------- format */}
        <TabsContent value="format" className="surface-card mt-3 space-y-4 p-4">
          {tool === "text" && (
            <div className="space-y-2">
              <Label>Text to place</Label>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Type, then tap the page" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Font</Label>
              <select
                value={font}
                onChange={(e) => setFont(e.target.value as EditorFont)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="Helvetica">Helvetica</option>
                <option value="Times">Times</option>
                <option value="Courier">Courier</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Size</Label>
              <Input type="number" min={6} max={72} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value) || 14)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Colour</Label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Line spacing</Label>
              <Input
                type="number"
                step="0.05"
                min={1}
                max={3}
                value={lineSpacing}
                onChange={(e) => setLineSpacing(Number(e.target.value) || 1.35)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Alignment</Label>
              <select
                value={align}
                onChange={(e) => setAlign(e.target.value as "left" | "center" | "right")}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Stroke width</Label>
              <Input type="number" min={1} max={12} value={thickness} onChange={(e) => setThickness(Number(e.target.value) || 2)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Toggle active={bold} onClick={() => setBold((v) => !v)} label="Bold" />
            <Toggle active={italic} onClick={() => setItalic((v) => !v)} label="Italic" />
            <Toggle active={underline} onClick={() => setUnderline((v) => !v)} label="Underline" />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-semibold">Auto-save to library</p>
              <p className="text-xs text-muted-foreground">Saves a few seconds after each change.</p>
            </div>
            <Switch checked={autoSave} onCheckedChange={setAutoSave} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => imageInput.current?.click()}>
              <ImagePlus className="mr-1.5 h-4 w-4" /> Pick image
            </Button>
            <Button variant="outline" onClick={() => setSigOpen(true)}>
              <PenLine className="mr-1.5 h-4 w-4" /> Signature
            </Button>
          </div>
          {pendingImage && (
            <p className="text-xs text-muted-foreground">
              Image ready — choose the Image or Sign tool, then tap the page to place it.
            </p>
          )}
        </TabsContent>

        {/* ----------------------------------------------------------- pages */}
        <TabsContent value="pages" className="surface-card mt-3 space-y-3 p-4">
          <div className="grid grid-cols-3 gap-2">
            <Action icon={RotateCw} label="Rotate" onClick={() => void run("Rotating…", async () => push(await rotatePage(bytes, page, 90)))} />
            <Action icon={Copy} label="Duplicate" onClick={() => void run("Duplicating…", async () => push(await duplicatePage(bytes, page)))} />
            <Action icon={Trash2} label="Delete" onClick={() => void run("Deleting…", async () => push(await deletePage(bytes, page)))} />
            <Action icon={FilePlus2} label="Insert blank" onClick={() => void run("Inserting…", async () => push(await insertBlankPage(bytes, page)))} />
            <Action
              icon={ArrowLeft}
              label="Move left"
              onClick={() =>
                void run("Moving…", async () => {
                  push(await movePage(bytes, page, Math.max(0, page - 1)));
                  setPage(Math.max(0, page - 1));
                })
              }
            />
            <Action
              icon={ArrowRight}
              label="Move right"
              onClick={() =>
                void run("Moving…", async () => {
                  push(await movePage(bytes, page, Math.min(pages.length - 1, page + 1)));
                  setPage(Math.min(pages.length - 1, page + 1));
                })
              }
            />
          </div>
          <Button variant="outline" className="w-full" onClick={() => void buildThumbs()}>
            <Layers className="mr-1.5 h-4 w-4" /> Load page thumbnails
          </Button>
          {thumbs.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {thumbs.map((t, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={cn("overflow-hidden rounded-lg border-2", i === page ? "border-brand" : "border-border")}
                >
                  <img src={t} alt={`Page ${i + 1}`} className="w-full" />
                  <span className="block bg-card py-0.5 text-[10px] font-semibold">{i + 1}</span>
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ----------------------------------------------------------- tools */}
        <TabsContent value="tools" className="surface-card mt-3 space-y-4 p-4">
          <RangeTool
            label="Split / extract pages"
            placeholder="e.g. 1-3,5"
            action="Extract"
            icon={Split}
            onRun={(value) =>
              void run("Extracting…", async () => {
                const idx = parseRange(value, pages.length);
                if (!idx.length) throw new Error("Enter a valid page range.");
                const out = await extractPages(bytes, idx);
                downloadBlob(bytesToBlob(out), `${title || "document"}-pages.pdf`);
                toast.success("Extracted pages downloaded");
              })
            }
          />
          <Button variant="outline" className="w-full" onClick={() => mergeInput.current?.click()}>
            <Merge className="mr-1.5 h-4 w-4" /> Merge other PDFs into this one
          </Button>
          <RangeTool
            label="Text watermark"
            placeholder="CONFIDENTIAL"
            action="Add"
            icon={Type}
            onRun={(value) => void run("Adding watermark…", async () => push(await addWatermark(bytes, value)))}
          />
          <RangeTool
            label="Header / footer (header|footer)"
            placeholder="D.Cr Library|Confidential"
            action="Apply"
            icon={FileText}
            onRun={(value) =>
              void run("Applying…", async () => {
                const [h, f = ""] = value.split("|");
                push(await addHeaderFooter(bytes, h ?? "", f));
              })
            }
          />
          <div className="grid grid-cols-2 gap-2">
            <Action icon={FileText} label="Page numbers" onClick={() => void run("Numbering…", async () => push(await addPageNumbers(bytes)))} />
            <Action
              icon={Download}
              label="Compress"
              onClick={() =>
                void run("Compressing…", async () => {
                  const out = await compressPdf(bytes, 0.6, 1.6);
                  push(out);
                  toast.success(`Compressed to ${(out.byteLength / 1024).toFixed(0)} KB`);
                })
              }
            />
            <Action icon={ImagePlus} label="Image watermark" onClick={() =>
              void run("Adding watermark…", async () => {
                if (!pendingImage) throw new Error("Pick an image in the Format tab first.");
                push(await addImageWatermark(bytes, pendingImage));
              })
            } />
            <Action icon={Copy} label="Save as version" onClick={() => void saveCopy()} />
          </div>
          <p className="text-xs text-muted-foreground">
            PDF password encryption isn't available inside the browser. Use the Library privacy lock to keep saved files private.
          </p>
        </TabsContent>

        {/* ------------------------------------------------------------ text */}
        <TabsContent value="text" className="surface-card mt-3 space-y-3 p-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() =>
              void run("Reading page…", async () => {
                const image = await renderPageImage(bytes, page, 2, 0.85);
                const res = await ocrPage({ data: { image } });
                setOcrText(res.text);
                toast.success("Text extracted with OCR");
              })
            }
          >
            <ScanText className="mr-1.5 h-4 w-4" /> OCR this page
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() =>
              void run("Reading text layer…", async () => {
                const all = await extractPdfText(bytes);
                setOcrText(all[page] || "No selectable text on this page — try OCR.");
              })
            }
          >
            <FileText className="mr-1.5 h-4 w-4" /> Read page text
          </Button>
          <Textarea value={ocrText} onChange={(e) => setOcrText(e.target.value)} rows={6} placeholder="Extracted text appears here" />
          <Button
            className="w-full"
            disabled={!ocrText.trim()}
            onClick={() => {
              setText(ocrText);
              setTool("text");
              toast.info("Loaded into the Text tool — tap the page to place it.");
            }}
          >
            Use as editable text
          </Button>
          <div className="space-y-2">
            <Label className="text-xs">Search in document</Label>
            <div className="flex gap-2">
              <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Find text…" />
              <Button
                variant="outline"
                onClick={() =>
                  void run("Searching…", async () => {
                    const all = await extractPdfText(bytes);
                    const hits = all
                      .map((t, i) => (t.toLowerCase().includes(searchTerm.toLowerCase()) && searchTerm ? i : -1))
                      .filter((i) => i >= 0);
                    setSearchHits(hits);
                    if (hits.length) setPage(hits[0]);
                  })
                }
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {searchHits && (
              <p className="text-xs text-muted-foreground">
                {searchHits.length ? `Found on pages: ${searchHits.map((i) => i + 1).join(", ")}` : "No matches found."}
              </p>
            )}
          </div>
        </TabsContent>

        {/* ---------------------------------------------------------- export */}
        <TabsContent value="export" className="surface-card mt-3 grid grid-cols-2 gap-2 p-4">
          <Action icon={Download} label="PDF" onClick={() => void exportAs("pdf")} />
          <Action icon={Download} label="Word" onClick={() => void exportAs("word")} />
          <Action icon={Download} label="JPG" onClick={() => void exportAs("jpg")} />
          <Action icon={Download} label="PNG" onClick={() => void exportAs("png")} />
          <Action icon={Download} label="TXT" onClick={() => void exportAs("txt")} />
          <Action icon={Share2} label="Share" onClick={() => void share()} />
        </TabsContent>
      </Tabs>

      {sigOpen && (
        <SignaturePad
          onClose={() => setSigOpen(false)}
          onDone={(dataUrl) => {
            setPendingImage(dataUrl);
            setSigOpen(false);
            setTool("signature");
            toast.info("Tap the page to drop your signature.");
          }}
        />
      )}

      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          void run("Loading image…", async () => {
            setPendingImage(await fileToDataUrl(file));
            setTool("image");
          });
        }}
      />
      <input
        ref={mergeInput}
        type="file"
        accept="application/pdf"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (!files.length) return;
          void run("Merging…", async () => {
            const others = await Promise.all(files.map((f) => f.arrayBuffer()));
            push(await mergePdfs([bytes, ...others]));
            toast.success("PDFs merged");
          });
        }}
      />
    </AppShell>
  );
}

/* ------------------------------------------------------------- sub-components */

function Toggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold",
        active ? "border-transparent bg-brand text-primary-foreground" : "border-border text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}

function Action({ icon: Icon, label, onClick }: { icon: typeof Type; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-3 text-[11px] font-semibold transition-transform active:scale-[0.97]"
    >
      <Icon className="h-4 w-4 text-brand-ink" />
      {label}
    </button>
  );
}

function RangeTool({
  label,
  placeholder,
  action,
  icon: Icon,
  onRun,
}: {
  label: string;
  placeholder: string;
  action: string;
  icon: typeof Type;
  onRun: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />
        <Button variant="outline" disabled={!value.trim()} onClick={() => onRun(value.trim())}>
          <Icon className="mr-1.5 h-4 w-4" />
          {action}
        </Button>
      </div>
    </div>
  );
}

function StartScreen({
  busy,
  libraryDocs,
  onBlank,
  onOpenFile,
  onOpenDoc,
  onScan,
}: {
  busy: string | null;
  libraryDocs: DocumentRow[];
  onBlank: () => void;
  onOpenFile: () => void;
  onOpenDoc: (doc: DocumentRow) => void;
  onScan: () => void;
}) {
  return (
    <div className="space-y-4">
      {busy && (
        <div className="surface-card flex items-center gap-3 p-4">
          <Loader2 className="h-4 w-4 animate-spin text-brand-ink" />
          <span className="text-sm font-semibold">{busy}</span>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Action icon={Upload} label="Open PDF" onClick={onOpenFile} />
        <Action icon={FilePlus2} label="Blank PDF" onClick={onBlank} />
        <Action icon={ScanText} label="Scan pages" onClick={onScan} />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-bold text-muted-foreground">From your library</h2>
        {libraryDocs.length === 0 ? (
          <div className="surface-card p-6 text-center text-sm text-muted-foreground">No saved documents yet.</div>
        ) : (
          <div className="space-y-2">
            {libraryDocs.slice(0, 20).map((d) => (
              <button
                key={d.id}
                onClick={() => onOpenDoc(d)}
                className="surface-card flex w-full items-center gap-3 p-3.5 text-left transition-transform active:scale-[0.99]"
              >
                <FileText className="h-5 w-5 shrink-0 text-brand-ink" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{d.title}</span>
                  <span className="block text-[11px] text-muted-foreground">{d.page_count} pages</span>
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SignaturePad({ onClose, onDone }: { onClose: () => void; onDone: (dataUrl: string) => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  const pos = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * 600, y: ((e.clientY - rect.top) / rect.height) * 220 };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="surface-card w-full max-w-md space-y-3 p-4">
        <p className="text-sm font-bold">Draw your signature</p>
        <canvas
          ref={ref}
          width={600}
          height={220}
          className="w-full touch-none rounded-xl border border-border bg-card"
          onPointerDown={(e) => {
            drawing.current = true;
            const ctx = ref.current!.getContext("2d")!;
            const p = pos(e);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = ref.current!.getContext("2d")!;
            const p = pos(e);
            ctx.lineTo(p.x, p.y);
            ctx.strokeStyle = "#0f172a";
            ctx.lineWidth = 3;
            ctx.lineCap = "round";
            ctx.stroke();
          }}
          onPointerUp={() => (drawing.current = false)}
          onPointerLeave={() => (drawing.current = false)}
        />
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const c = ref.current!;
              c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            }}
          >
            Clear
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onDone(ref.current!.toDataURL("image/png"))}>Use</Button>
        </div>
      </div>
    </div>
  );
}