import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles, Wand2, Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DOC_TYPES } from "@/lib/doc-types";
import { generateDocument } from "@/lib/ai.functions";
import { textToPdf } from "@/lib/pdf";
import { saveDocument } from "@/lib/documents";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ai-create")({
  head: () => ({
    meta: [
      { title: "AI Document Creator — D.Cr Library" },
      { name: "description", content: "Describe what you need and generate resumes, invoices, letters, reports and more as polished PDFs." },
      { property: "og:title", content: "AI Document Creator — D.Cr Library" },
      { property: "og:description", content: "Generate professional documents from a single prompt." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AiCreatePage,
});

function AiCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const generate = useServerFn(generateDocument);

  const [docType, setDocType] = useState("resume");
  const [prompt, setPrompt] = useState("");
  const [answers, setAnswers] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [result, setResult] = useState<{ title: string; content: string; summary: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = DOC_TYPES.find((d) => d.id === docType);

  const run = async (withAnswers: boolean) => {
    if (prompt.trim().length < 4) {
      toast.error("Tell the AI a bit more about the document.");
      return;
    }
    setBusy(true);
    try {
      const out = await generate({
        data: { docType, prompt: prompt.trim(), answers: withAnswers ? answers.trim() || "none" : undefined },
      });
      if (out.questions.length) {
        setQuestions(out.questions);
        setResult(null);
      } else {
        setQuestions([]);
        setResult({ title: out.title, content: out.content, summary: out.summary });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const pdf = await textToPdf(result.title, result.content);
      const doc = await saveDocument({
        title: result.title,
        docType,
        source: "ai",
        blob: pdf.blob,
        pageCount: pdf.pageCount,
        prompt: prompt.trim(),
        content: result.content,
        summary: result.summary,
      });
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Saved to your library.");
      navigate({ to: "/doc/$id", params: { id: doc.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the document.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title="AI Create" subtitle="Describe it — get a finished document">
      <div className="surface-card animate-rise p-4">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Document type</Label>
        <div className="mt-3 flex flex-wrap gap-2">
          {DOC_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setDocType(t.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                docType === t.id
                  ? "border-transparent bg-brand text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              <span className="mr-1">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-2">
          <Label htmlFor="prompt">What should it contain?</Label>
          <Textarea
            id="prompt"
            rows={4}
            maxLength={2000}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={selected ? `e.g. ${selected.hint} — include ${selected.fields.join(", ")}` : "Describe the document"}
          />
          <p className="text-[11px] text-muted-foreground">
            Helpful details: {selected?.fields.join(" · ")}
          </p>
        </div>

        <Button className="mt-4 w-full rounded-full" disabled={busy} onClick={() => run(false)}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Generate document
        </Button>
      </div>

      {questions.length > 0 && (
        <div className="surface-card animate-rise mt-4 border-brand/30 p-4">
          <h2 className="text-sm font-bold">A few quick details</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <Textarea
            className="mt-3"
            rows={4}
            maxLength={2000}
            value={answers}
            onChange={(e) => setAnswers(e.target.value)}
            placeholder="Answer here, one per line"
          />
          <Button className="mt-3 w-full rounded-full" disabled={busy} onClick={() => run(true)}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            Continue
          </Button>
        </div>
      )}

      {result && (
        <div className="surface-card animate-rise mt-4 p-4">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            className="mt-1.5"
            maxLength={150}
            value={result.title}
            onChange={(e) => setResult({ ...result, title: e.target.value })}
          />

          <Label htmlFor="content" className="mt-4 block">
            Content (edit freely)
          </Label>
          <Textarea
            id="content"
            className="mt-1.5 font-mono text-xs"
            rows={16}
            value={result.content}
            onChange={(e) => setResult({ ...result, content: e.target.value })}
          />

          {result.summary && (
            <p className="mt-3 rounded-xl bg-brand-soft p-3 text-xs text-brand-ink">{result.summary}</p>
          )}

          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1 rounded-full" disabled={busy} onClick={() => run(true)}>
              <Wand2 className="mr-2 h-4 w-4" /> Regenerate
            </Button>
            <Button className="flex-1 rounded-full" disabled={saving} onClick={save}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save as PDF
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}