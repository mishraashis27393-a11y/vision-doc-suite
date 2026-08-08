import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, AlertTriangle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AiResultEditor } from "@/components/AiResultEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { STUDY_LEVELS, STUDY_SUBJECTS, STUDY_TOOLS, studyTool, subjectLabel } from "@/lib/study";
import { generateStudyMaterial } from "@/lib/ai.functions";

type Search = { subject?: string };

export const Route = createFileRoute("/_authenticated/learn/$tool")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    subject: typeof search.subject === "string" ? search.subject : undefined,
  }),
  head: ({ params }) => {
    const label = studyTool(params.tool)?.label ?? "Study tool";
    return {
      meta: [
        { title: `${label} — Student Learning | D.Cr Library` },
        { name: "description", content: `Generate ${label.toLowerCase()} with AI, edit it and export as PDF or JPG.` },
        { property: "og:title", content: `${label} — Student Learning` },
        { property: "og:description", content: `AI powered ${label.toLowerCase()} for school and college students.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: LearnToolPage,
});

function LearnToolPage() {
  const { tool } = Route.useParams();
  const { subject: initialSubject } = Route.useSearch();
  const def = studyTool(tool);
  const generate = useServerFn(generateStudyMaterial);

  const [subject, setSubject] = useState(initialSubject ?? "general");
  const [level, setLevel] = useState(STUDY_LEVELS[1]!);
  const [topic, setTopic] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [language, setLanguage] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ title: string; content: string; summary: string } | null>(null);
  const inFlight = useRef(false);

  if (!def) {
    return (
      <AppShell title="Unknown study tool">
        <div className="surface-card p-6 text-center">
          <p className="text-sm font-semibold">That study tool doesn&apos;t exist.</p>
          <Button asChild className="mt-4 rounded-full">
            <Link to="/learn">Back to Student Learning</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const submit = async () => {
    if (inFlight.current || busy) return;
    if (topic.trim().length < 3) {
      toast.error(`Please enter the ${def.topicLabel.toLowerCase()}.`);
      return;
    }

    const details = [
      ...def.fields.map((f) => (fields[f]?.trim() ? `${f}: ${fields[f]!.trim()}` : null)),
      notes.trim() ? `Extra instructions: ${notes.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const out = await generate({
        data: {
          tool: def.id,
          subject: subjectLabel(subject),
          topic: topic.trim(),
          level,
          details: details || undefined,
          language: language.trim() || undefined,
        },
      });
      if (!out.content.trim()) throw new Error("The AI returned an empty response. Please try again.");
      setResult({ title: out.title, content: out.content, summary: out.summary });
      toast.success("Study material ready.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed. Please try again.");
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  return (
    <AppShell
      title={def.label}
      subtitle={def.hint}
      action={
        <Button asChild variant="ghost" size="icon" className="rounded-full">
          <Link to="/learn" aria-label="Back to Student Learning">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
      }
    >
      <div className="surface-card animate-rise space-y-4 p-4">
        <div className="space-y-1.5">
          <Label>Subject</Label>
          <div className="flex flex-wrap gap-2">
            {STUDY_SUBJECTS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSubject(s.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  subject === s.id
                    ? "border-transparent bg-brand-soft text-brand-ink"
                    : "border-border text-muted-foreground",
                )}
              >
                {s.emoji} {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Level</Label>
          <div className="flex flex-wrap gap-2">
            {STUDY_LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLevel(l)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  level === l ? "border-transparent bg-brand-soft text-brand-ink" : "border-border text-muted-foreground",
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="topic">{def.topicLabel}</Label>
          <Input
            id="topic"
            maxLength={300}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={def.topicPlaceholder}
          />
        </div>

        {def.fields.map((f) => (
          <div key={f} className="space-y-1.5">
            <Label htmlFor={f}>{f}</Label>
            <Input
              id={f}
              maxLength={200}
              value={fields[f] ?? ""}
              onChange={(e) => setFields((prev) => ({ ...prev, [f]: e.target.value }))}
              placeholder={f}
            />
          </div>
        ))}

        <div className="space-y-1.5">
          <Label htmlFor="notes">Extra instructions (optional)</Label>
          <Textarea
            id="notes"
            rows={3}
            maxLength={1500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything specific your teacher asked for?"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="language">Language (optional)</Label>
          <Input
            id="language"
            maxLength={40}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="English"
          />
        </div>

        <Button className="w-full rounded-full" disabled={busy} onClick={submit}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {busy ? "Generating…" : result ? "Regenerate" : "Generate"}
        </Button>
      </div>

      {error && (
        <div className="surface-card mt-4 flex items-start gap-3 border border-destructive/30 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Generation failed</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{error}</p>
            <Button size="sm" variant="outline" className="mt-3 rounded-full" onClick={submit} disabled={busy}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        </div>
      )}

      {busy && !result && (
        <div className="surface-card mt-4 space-y-3 p-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-3 animate-pulse rounded-full bg-muted" style={{ width: `${90 - i * 12}%` }} />
          ))}
        </div>
      )}

      {result && (
        <div className="mt-4">
          <AiResultEditor
            title={result.title}
            content={result.content}
            summary={result.summary}
            docType={`study-${def.id}`}
            prompt={`${def.label} · ${subjectLabel(subject)} · ${topic}`}
            onTitleChange={(v) => setResult((r) => (r ? { ...r, title: v } : r))}
            onContentChange={(v) => setResult((r) => (r ? { ...r, content: v } : r))}
          />
        </div>
      )}
    </AppShell>
  );
}
