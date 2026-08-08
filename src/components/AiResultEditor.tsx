import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileImage, Loader2, Save, Pencil, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { textToPdf, pdfToJpegs, downloadDataUrl } from "@/lib/pdf";
import { downloadBlob } from "@/lib/pdf-editor";
import { saveDocument } from "@/lib/documents";

type Busy = "" | "pdf" | "jpg" | "save";

/** Editable preview for AI generated text with PDF/JPG export and Save to Library. */
export function AiResultEditor({
  title,
  content,
  onTitleChange,
  onContentChange,
  docType,
  prompt,
  summary,
}: {
  title: string;
  content: string;
  onTitleChange: (v: string) => void;
  onContentChange: (v: string) => void;
  docType: string;
  prompt?: string;
  summary?: string;
}) {
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [busy, setBusy] = useState<Busy>("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const safeName = (title || "document").replace(/[^\w\s-]/g, "").trim().slice(0, 60) || "document";

  const run = async (kind: Busy, fn: () => Promise<void>) => {
    if (busy) return;
    if (!content.trim()) {
      toast.error("There is no content to export yet.");
      return;
    }
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy("");
    }
  };

  const downloadPdf = () =>
    run("pdf", async () => {
      const pdf = await textToPdf(title, content);
      downloadBlob(pdf.blob, `${safeName}.pdf`);
      toast.success("PDF downloaded.");
    });

  const downloadJpg = () =>
    run("jpg", async () => {
      const pdf = await textToPdf(title, content);
      const pages = await pdfToJpegs(pdf.blob);
      pages.forEach((page, i) => downloadDataUrl(page, `${safeName}${pages.length > 1 ? `-${i + 1}` : ""}.jpg`));
      toast.success(pages.length > 1 ? `${pages.length} images downloaded.` : "Image downloaded.");
    });

  const saveToLibrary = () =>
    run("save", async () => {
      const pdf = await textToPdf(title, content);
      const doc = await saveDocument({
        title: title || "Untitled document",
        docType,
        source: "ai",
        blob: pdf.blob,
        pageCount: pdf.pageCount,
        prompt: prompt ?? null,
        content,
        summary: summary ?? null,
      });
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Saved to your library.");
      navigate({ to: "/doc/$id", params: { id: doc.id } });
    });

  return (
    <div className="surface-card animate-rise space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Input
          value={title}
          maxLength={200}
          onChange={(e) => onTitleChange(e.target.value)}
          className="h-10 flex-1 font-semibold"
          aria-label="Document title"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-full"
          onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
        >
          {mode === "edit" ? <Eye className="mr-1.5 h-4 w-4" /> : <Pencil className="mr-1.5 h-4 w-4" />}
          {mode === "edit" ? "Preview" : "Edit"}
        </Button>
      </div>

      {mode === "edit" ? (
        <Textarea
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          rows={20}
          className="font-mono text-[13px] leading-relaxed"
          aria-label="Document content"
        />
      ) : (
        <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-border/70 bg-card p-4">
          <Markdownish text={content} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Button variant="outline" className="rounded-full" disabled={!!busy} onClick={downloadPdf}>
          {busy === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          PDF
        </Button>
        <Button variant="outline" className="rounded-full" disabled={!!busy} onClick={downloadJpg}>
          {busy === "jpg" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileImage className="mr-2 h-4 w-4" />}
          JPG
        </Button>
        <Button className="col-span-2 rounded-full sm:col-span-1" disabled={!!busy} onClick={saveToLibrary}>
          {busy === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save to Library
        </Button>
      </div>
    </div>
  );
}

/** Lightweight renderer for the '# / ## / -' markdown subset the AI produces. */
function Markdownish({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;
        if (trimmed.startsWith("## "))
          return (
            <h3 key={i} className="pt-2 text-sm font-bold text-brand-ink">
              {trimmed.slice(3)}
            </h3>
          );
        if (trimmed.startsWith("# "))
          return (
            <h2 key={i} className="text-base font-extrabold tracking-tight">
              {trimmed.slice(2)}
            </h2>
          );
        if (trimmed.startsWith("- ") || trimmed.startsWith("* "))
          return (
            <p key={i} className="flex gap-2 text-[13px] leading-relaxed">
              <span className="text-brand-ink">•</span>
              <span className="flex-1">{trimmed.slice(2)}</span>
            </p>
          );
        return (
          <p key={i} className="text-[13px] leading-relaxed">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}
