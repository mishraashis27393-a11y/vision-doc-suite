import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Brain, Download, ImageDown, Loader2, QrCode, Share2, Star, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  deleteDocument,
  downloadUrl,
  getDocument,
  signedUrl,
  updateDocument,
} from "@/lib/documents";
import { docTypeLabel, formatBytes } from "@/lib/doc-types";
import { downloadDataUrl, makeQrDataUrl, pdfToJpegs } from "@/lib/pdf";
import { summarizeDocument } from "@/lib/ai.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/doc/$id")({
  head: () => ({
    meta: [
      { title: "Document — D.Cr Library" },
      { name: "description", content: "Preview, summarise with AI, download, share and manage your saved document." },
      { property: "og:title", content: "Document — D.Cr Library" },
      { property: "og:description", content: "Preview and manage your saved document." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DocPage,
});

function DocPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const summarize = useServerFn(summarizeDocument);

  const { data: doc, isLoading } = useQuery({ queryKey: ["document", id], queryFn: () => getDocument(id) });
  const [url, setUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [jpgBusy, setJpgBusy] = useState(false);

  useEffect(() => {
    if (!doc?.file_path) return;
    signedUrl(doc.file_path).then(setUrl).catch(() => toast.error("Could not load the file preview."));
    updateDocument(doc.id, { last_opened_at: new Date().toISOString() }).catch(() => {});
  }, [doc?.file_path, doc?.id]);

  const runSummary = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      const out = await summarize({
        data: {
          title: doc.title,
          pageCount: doc.page_count,
          content: doc.content ?? `A ${docTypeLabel(doc.doc_type)} with ${doc.page_count} scanned pages titled "${doc.title}".`,
        },
      });
      const text = [out.purpose, out.summary, ...(out.keyPoints ?? []).map((k) => `• ${k}`)].filter(Boolean).join("\n");
      await updateDocument(doc.id, { summary: text });
      await queryClient.invalidateQueries({ queryKey: ["document", id] });
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Summary ready.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not summarise this document.");
    } finally {
      setBusy(false);
    }
  };

  const showQr = async () => {
    if (!doc?.file_path) {
      toast.error("This document has no file to link to yet.");
      return;
    }
    if (qr) {
      setQr(null);
      return;
    }
    setQrBusy(true);
    try {
      const link = await signedUrl(doc.file_path, 60 * 60 * 24 * 7);
      setQr(await makeQrDataUrl(link));
      toast.success("QR code ready.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the QR code.");
    } finally {
      setQrBusy(false);
    }
  };

  const downloadJpg = async () => {
    if (!doc || !url) {
      toast.error("The file is still loading. Try again in a second.");
      return;
    }
    setJpgBusy(true);
    const id = toast.loading("Rendering high-quality JPG…");
    try {
      const pages = await pdfToJpegs(url);
      if (pages.length === 0) throw new Error("Nothing to export.");
      const safe = doc.title.replace(/[^\w\d\-. ]+/g, "").trim() || "document";
      pages.forEach((page, i) =>
        downloadDataUrl(page, pages.length === 1 ? `${safe}.jpg` : `${safe}-page-${i + 1}.jpg`),
      );
      toast.success(`${pages.length} JPG${pages.length === 1 ? "" : "s"} downloaded.`, { id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not export as JPG.", { id });
    } finally {
      setJpgBusy(false);
    }
  };

  const share = async () => {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: doc?.title, url });
        return;
      } catch {
        /* user cancelled */
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success("Share link copied.");
  };

  const remove = async () => {
    if (!doc || !window.confirm("Delete this document permanently?")) return;
    try {
      await deleteDocument(doc);
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Document deleted.");
      navigate({ to: "/library", search: { view: "all" } });
    } catch {
      toast.error("Could not delete the document.");
    }
  };

  const toggleFav = async () => {
    if (!doc) return;
    await updateDocument(doc.id, { is_favorite: !doc.is_favorite });
    await queryClient.invalidateQueries({ queryKey: ["document", id] });
    await queryClient.invalidateQueries({ queryKey: ["documents"] });
  };

  if (isLoading) {
    return (
      <AppShell title="Loading...">
        <p className="py-16 text-center text-sm text-muted-foreground">Opening document...</p>
      </AppShell>
    );
  }

  if (!doc) {
    return (
      <AppShell title="Not found">
        <p className="py-16 text-center text-sm text-muted-foreground">This document no longer exists.</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={doc.title}
      subtitle={`${docTypeLabel(doc.doc_type)} · ${doc.page_count} pages · ${formatBytes(doc.file_size)}`}
      action={
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Back" onClick={() => navigate({ to: "/library", search: { view: "all" } })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
      }
    >
      <div className="surface-card animate-rise overflow-hidden">
        {url ? (
          <iframe title={doc.title} src={url} className="h-[60vh] w-full bg-muted" />
        ) : (
          <div className="flex h-[40vh] items-center justify-center text-sm text-muted-foreground">Loading preview...</div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <Action icon={Download} label="Download" onClick={() => url && downloadUrl(url, `${doc.title}.pdf`)} />
        <Action icon={jpgBusy ? Loader2 : ImageDown} label="JPG" spin={jpgBusy} onClick={downloadJpg} />
        <Action icon={Share2} label="Share" onClick={share} />
        <Action icon={qrBusy ? Loader2 : QrCode} label="QR code" spin={qrBusy} onClick={showQr} />
        <Action icon={Star} label="Favorite" active={doc.is_favorite} onClick={toggleFav} />
      </div>

      {qr && (
        <div className="surface-card mt-4 flex flex-col items-center gap-2 p-5">
          <img src={qr} alt={`QR code for ${doc.title}`} className="h-40 w-40 rounded-xl" />
          <p className="text-[11px] text-muted-foreground">Scan to open this document (link valid for 7 days).</p>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => downloadDataUrl(qr, `${doc.title.replace(/[^\w\d\-. ]+/g, "").trim() || "document"}-qr.png`)}
          >
            <Download className="mr-2 h-3.5 w-3.5" /> Save QR code
          </Button>
        </div>
      )}

      <div className="surface-card mt-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">AI summary</h2>
          <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={runSummary}>
            {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Brain className="mr-2 h-3.5 w-3.5" />}
            {doc.summary ? "Regenerate" : "Summarise"}
          </Button>
        </div>
        <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
          {doc.summary || "No summary yet. Generate one to see the purpose and key points at a glance."}
        </p>
      </div>

      <Button variant="ghost" className="mt-4 w-full rounded-full text-destructive hover:text-destructive" onClick={remove}>
        <Trash2 className="mr-2 h-4 w-4" /> Delete document
      </Button>
    </AppShell>
  );
}

function Action({
  icon: Icon,
  label,
  onClick,
  active,
  spin,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  active?: boolean;
  spin?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={spin}
      className="surface-card flex flex-col items-center gap-1.5 p-3 text-[11px] font-semibold transition-transform active:scale-95"
    >
      <Icon className={cn("h-4 w-4", active ? "text-warning" : "text-brand-ink", spin && "animate-spin")} />
      {label}
    </button>
  );
}