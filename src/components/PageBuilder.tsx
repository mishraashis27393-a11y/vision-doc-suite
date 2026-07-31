import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Images, Loader2, RotateCw, Save, Trash2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { defaultEnhance, enhanceImage, fileToDataUrl, imagesToPdf, type EnhanceOptions } from "@/lib/pdf";
import { saveDocument } from "@/lib/documents";

type Page = { id: string; original: string; preview: string };

export function PageBuilder({ mode }: { mode: "scan" | "image" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [pages, setPages] = useState<Page[]>([]);
  const [opts, setOpts] = useState<EnhanceOptions>(
    mode === "scan" ? defaultEnhance : { ...defaultEnhance, removeShadows: false, autoCrop: false, contrast: 6, brightness: 2, sharpness: 10 },
  );
  const [title, setTitle] = useState(mode === "scan" ? "Scanned document" : "Image document");
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pages.length === 0) return;
    let cancelled = false;
    setProcessing(true);
    (async () => {
      try {
        const next = await Promise.all(
          pages.map(async (p) => ({ ...p, preview: await enhanceImage(p.original, opts) })),
        );
        if (!cancelled) setPages(next);
      } catch {
        if (!cancelled) toast.error("Could not process the images.");
      } finally {
        if (!cancelled) setProcessing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts, pages.length]);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, 30);
    try {
      const added = await Promise.all(
        list.map(async (file) => {
          const original = await fileToDataUrl(file);
          return { id: crypto.randomUUID(), original, preview: original } as Page;
        }),
      );
      setPages((prev) => [...prev, ...added]);
    } catch {
      toast.error("Some images could not be read.");
    }
  };

  const save = async () => {
    if (!pages.length) return;
    setSaving(true);
    try {
      const pdf = await imagesToPdf(pages.map((p) => p.preview));
      const doc = await saveDocument({
        title: title.trim() || "Untitled document",
        docType: "pdf",
        source: mode === "scan" ? "scan" : "image",
        blob: pdf.blob,
        pageCount: pdf.pageCount,
      });
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Saved to your library.");
      navigate({ to: "/doc/$id", params: { id: doc.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the PDF.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        {...(mode === "scan" ? { capture: "environment" as const } : {})}
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="surface-card animate-rise flex flex-col items-center gap-3 p-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-ink">
          {mode === "scan" ? <Camera className="h-6 w-6" /> : <Images className="h-6 w-6" />}
        </span>
        <p className="text-sm font-semibold">
          {mode === "scan" ? "Capture pages with your camera" : "Pick images to convert"}
        </p>
        <p className="text-xs text-muted-foreground">
          {mode === "scan"
            ? "Auto crop, shadow removal and sharpening are applied to every page."
            : "JPG, PNG and WEBP images become a single multi-page PDF."}
        </p>
        <Button className="rounded-full px-6" onClick={() => fileRef.current?.click()}>
          {mode === "scan" ? "Open camera" : "Choose images"}
        </Button>
      </div>

      {pages.length > 0 && (
        <>
          <div className="surface-card animate-rise mt-4 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Enhancement</h2>
              {processing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            <div className="mt-4 space-y-4">
              <Control label={`Brightness ${opts.brightness}`} value={opts.brightness} min={-50} max={50} onChange={(v) => setOpts({ ...opts, brightness: v })} />
              <Control label={`Contrast ${opts.contrast}`} value={opts.contrast} min={-50} max={80} onChange={(v) => setOpts({ ...opts, contrast: v })} />
              <Control label={`Sharpness ${opts.sharpness}`} value={opts.sharpness} min={0} max={100} onChange={(v) => setOpts({ ...opts, sharpness: v })} />

              <div className="flex items-center justify-between">
                <Label htmlFor="shadows" className="text-xs">Remove shadows</Label>
                <Switch id="shadows" checked={opts.removeShadows} onCheckedChange={(v) => setOpts({ ...opts, removeShadows: v })} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="crop" className="text-xs">Auto crop edges</Label>
                <Switch id="crop" checked={opts.autoCrop} onCheckedChange={(v) => setOpts({ ...opts, autoCrop: v })} />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full rounded-full"
                onClick={() => setOpts({ ...opts, rotate: (opts.rotate + 90) % 360 })}
              >
                <RotateCw className="mr-2 h-4 w-4" /> Rotate all ({opts.rotate}°)
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {pages.map((p, i) => (
              <div key={p.id} className="group relative overflow-hidden rounded-xl border border-border bg-muted">
                <img src={p.preview} alt={`Page ${i + 1}`} className="aspect-[3/4] w-full object-cover" />
                <span className="absolute bottom-1 left-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[10px] font-semibold">
                  {i + 1}
                </span>
                <button
                  aria-label={`Remove page ${i + 1}`}
                  onClick={() => setPages((prev) => prev.filter((x) => x.id !== p.id))}
                  className="absolute right-1 top-1 rounded-full bg-background/85 p-1 text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="surface-card mt-4 p-4">
            <Label htmlFor="doc-title">Document name</Label>
            <Input id="doc-title" className="mt-1.5" maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="rounded-full" onClick={() => setPages([])}>
                <Trash2 className="mr-2 h-4 w-4" /> Clear
              </Button>
              <Button className="flex-1 rounded-full" disabled={saving || processing} onClick={save}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save PDF ({pages.length} {pages.length === 1 ? "page" : "pages"})
              </Button>
            </div>
          </div>
        </>
      )}

      {pages.length === 0 && (
        <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
          <Wand2 className="h-3.5 w-3.5" /> Everything is processed on your device before upload.
        </p>
      )}
    </>
  );
}

function Control({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Slider className="mt-2" value={[value]} min={min} max={max} step={1} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}