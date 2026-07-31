import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DOC_TYPES, docTypeLabel } from "@/lib/doc-types";
import { generateDocument } from "@/lib/ai.functions";
import { textToPdf } from "@/lib/pdf";
import { saveDocument } from "@/lib/documents";

export const Route = createFileRoute("/_authenticated/create/$type")({
  head: ({ params }) => {
    const label = docTypeLabel(params.type);
    return {
      meta: [
        { title: `Create ${label} — D.Cr Library` },
        { name: "description", content: `Fill in the details and let AI write your ${label.toLowerCase()} as a polished PDF.` },
        { property: "og:title", content: `Create ${label} — D.Cr Library` },
        { property: "og:description", content: `Generate a professional ${label.toLowerCase()} in seconds.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: CreateTypePage,
});

function CreateTypePage() {
  const { type } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const generate = useServerFn(generateDocument);

  const def = DOC_TYPES.find((d) => d.id === type);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  if (!def) {
    return (
      <AppShell title="Unknown document type">
        <div className="surface-card p-6 text-center">
          <p className="text-sm font-semibold">That document type doesn&apos;t exist.</p>
          <Button asChild className="mt-4 rounded-full">
            <Link to="/ai-create">Back to document types</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const submit = async () => {
    const details = def.fields
      .map((f) => (fields[f]?.trim() ? `${f}: ${fields[f].trim()}` : null))
      .filter(Boolean)
      .join("\n");

    if (!details && prompt.trim().length < 4) {
      toast.error("Fill in some details or describe what you need.");
      return;
    }

    setBusy(true);
    try {
      const out = await generate({
        data: {
          docType: def.id,
          prompt: prompt.trim() || `Create a professional ${def.label}.`,
          answers: details || "none",
        },
      });
      const pdf = await textToPdf(out.title, out.content);
      const doc = await saveDocument({
        title: out.title,
        docType: def.id,
        source: "ai",
        blob: pdf.blob,
        pageCount: pdf.pageCount,
        prompt: [prompt.trim(), details].filter(Boolean).join("\n"),
        content: out.content,
        summary: out.summary,
      });
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Document ready.");
      navigate({ to: "/doc/$id", params: { id: doc.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the document.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell
      title={`${def.emoji} ${def.label}`}
      subtitle={def.hint}
      action={
        <Button asChild variant="ghost" size="icon" className="rounded-full">
          <Link to="/ai-create" aria-label="Back to document types">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
      }
    >
      <div className="surface-card animate-rise space-y-4 p-4">
        {def.fields.map((f) => (
          <div key={f} className="space-y-1.5">
            <Label htmlFor={f}>{f}</Label>
            <Input
              id={f}
              maxLength={300}
              value={fields[f] ?? ""}
              onChange={(e) => setFields((prev) => ({ ...prev, [f]: e.target.value }))}
              placeholder={f}
            />
          </div>
        ))}

        <div className="space-y-1.5">
          <Label htmlFor="prompt">Extra instructions (prompt)</Label>
          <Textarea
            id="prompt"
            rows={4}
            maxLength={2000}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`Anything else the AI should know about this ${def.label.toLowerCase()}?`}
          />
        </div>

        <Button className="w-full rounded-full" disabled={busy} onClick={submit}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {busy ? "Creating document…" : "Create & preview"}
        </Button>
      </div>
    </AppShell>
  );
}