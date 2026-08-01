import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2, RefreshCw, Save, Share2, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { designType } from "@/lib/design-types";
import { generateDesign } from "@/lib/ai.functions";
import { imagesToPdf } from "@/lib/pdf";
import { saveDocument } from "@/lib/documents";

export const Route = createFileRoute("/_authenticated/design/$type")({
  head: ({ params }) => {
    const label = designType(params.type)?.label ?? "Design";
    return {
      meta: [
        { title: `Create ${label} — D.Cr Library` },
        { name: "description", content: `Describe your ${label.toLowerCase()} and let AI design it instantly.` },
        { property: "og:title", content: `Create ${label} — D.Cr Library` },
        { property: "og:description", content: `AI-generated ${label.toLowerCase()} in seconds.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: DesignPage,
});

function DesignPage() {
  const { type } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const generate = useServerFn(generateDesign);
  const def = designType(type);

  const [fields, setFields] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("");
  const [colors, setColors] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!def) {
    return (
      <AppShell title="Unknown design type">
        <div className="surface-card p-6 text-center">
          <p className="text-sm font-semibold">That design type doesn&apos;t exist.</p>
          <Button asChild className="mt-4 rounded-full">
            <Link to="/ai-design">Back to design types</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const details = def.fields
    .map((f) => (fields[f]?.trim() ? `${f}: ${fields[f].trim()}` : null))
    .filter(Boolean)
    .join("\n");

  const run = async () => {
    if (!details && prompt.trim().length < 4) {
      toast.error("Describe your design or fill in some details.");
      return;
    }
    setBusy(true);
    try {
      const out = await generate({
        data: {
          designType: def.id,
          prompt: prompt.trim() || `A professional ${def.label}.`,
          details: details || undefined,
          style: style || undefined,
          colors: colors || undefined,
          aspect: def.aspect,
        },
      });
      setImage(out.image);
      toast.success("Design ready.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate the design.");
    } finally {
      setBusy(false);
    }
  };

  const title = fields[def.fields[0]]?.trim() || prompt.trim().slice(0, 60) || def.label;

  const save = async () => {
    if (!image) return;
    setSaving(true);
    try {
      const pdf = await imagesToPdf([image]);
      const doc = await saveDocument({
        title,
        docType: def.id,
        source: "ai",
        blob: pdf.blob,
        pageCount: pdf.pageCount,
        prompt: [prompt.trim(), details, style, colors].filter(Boolean).join("\n"),
      });
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Saved to your library.");
      navigate({ to: "/doc/$id", params: { id: doc.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the design.");
    } finally {
      setSaving(false);
    }
  };

  const download = () => {
    if (!image) return;
    const a = document.createElement("a");
    a.href = image;
    a.download = `${title}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const share = async () => {
    if (!image) return;
    try {
      const blob = await (await fetch(image)).blob();
      const file = new File([blob], `${title}.png`, { type: blob.type || "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return;
      }
    } catch {
      /* fall through */
    }
    toast.message("Save the design first to get a shareable link.");
  };

  return (
    <AppShell
      title={`${def.emoji} ${def.label}`}
      subtitle={def.hint}
      action={
        <Button asChild variant="ghost" size="icon" className="rounded-full">
          <Link to="/ai-design" aria-label="Back to design types">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
      }
    >
      <div className="surface-card animate-rise space-y-4 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="prompt">Your prompt</Label>
          <Textarea
            id="prompt"
            rows={4}
            maxLength={1500}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`Describe the ${def.label.toLowerCase()} you want…`}
          />
        </div>

        {def.fields.map((f) => (
          <div key={f} className="space-y-1.5">
            <Label htmlFor={f}>{f}</Label>
            <Input id={f} maxLength={200} value={fields[f] ?? ""} onChange={(e) => setFields((p) => ({ ...p, [f]: e.target.value }))} placeholder={f} />
          </div>
        ))}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="style">Style (optional)</Label>
            <Input id="style" maxLength={60} value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Modern, minimal…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="colors">Colours (optional)</Label>
            <Input id="colors" maxLength={60} value={colors} onChange={(e) => setColors(e.target.value)} placeholder="Blue & white" />
          </div>
        </div>

        <Button className="w-full rounded-full" disabled={busy} onClick={run}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {busy ? "Designing…" : image ? "Generate again" : "Generate design"}
        </Button>
      </div>

      {image && (
        <div className="surface-card animate-rise mt-4 space-y-3 p-4">
          <img src={image} alt={`AI generated ${def.label}`} className="w-full rounded-xl border border-border" />
          <div className="grid grid-cols-4 gap-2">
            <Button variant="outline" className="rounded-full" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
            <Button variant="outline" className="rounded-full" onClick={download} aria-label="Download">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="rounded-full" onClick={share} aria-label="Share">
              <Share2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="rounded-full" onClick={run} disabled={busy} aria-label="Regenerate">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-center text-[11px] text-muted-foreground">Save · Download · Share · Regenerate</p>
        </div>
      )}
    </AppShell>
  );
}
