import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BookOpenCheck,
  Brain,
  ChevronRight,
  ClipboardList,
  FileText,
  GraduationCap,
  Layers,
  Loader2,
  PlayCircle,
  Search,
  Timer,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STUDY_GROUPS, STUDY_SUBJECTS, STUDY_TOOLS, studyTool, subjectLabel } from "@/lib/study";
import { deleteStudySession, listStudySessions, type StudySession } from "@/lib/study-sessions";
import { listDocuments } from "@/lib/documents";

export const Route = createFileRoute("/_authenticated/learn/")({
  head: () => ({
    meta: [
      { title: "Student Learning — Vision Doc Suite" },
      {
        name: "description",
        content:
          "AI study assistant, quizzes, flashcards, revision notes and student document tools with saved study sessions.",
      },
      { property: "og:title", content: "Student Learning — Vision Doc Suite" },
      { property: "og:description", content: "Learn faster with AI notes, quizzes, flashcards and assignment tools." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LearnPage,
});

const MODES = [
  { tool: "explain", difficulty: "easy", label: "Beginner mode", hint: "Explained super simply", icon: Brain },
  { tool: "revision", difficulty: "medium", label: "Quick revision", hint: "Last-minute sheet", icon: Timer },
  { tool: "important-questions", difficulty: "hard", label: "Exam preparation", hint: "Most-likely questions", icon: BookOpenCheck },
  { tool: "quiz", difficulty: "medium", label: "Practice quiz", hint: "Attempt & get scored", icon: ClipboardList },
  { tool: "flashcards", difficulty: "medium", label: "Flashcards", hint: "Flip & memorise", icon: Layers },
  { tool: "planner", difficulty: "medium", label: "Study plan", hint: "Day-wise schedule", icon: GraduationCap },
] as const;

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

function LearnPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");

  const sessions = useQuery({ queryKey: ["study-sessions"], queryFn: () => listStudySessions() });
  const docs = useQuery({ queryKey: ["documents"], queryFn: listDocuments });

  const q = query.trim().toLowerCase();

  const tools = useMemo(
    () => (q ? STUDY_TOOLS.filter((t) => `${t.label} ${t.hint}`.toLowerCase().includes(q)) : STUDY_TOOLS),
    [q],
  );

  const allSessions = sessions.data ?? [];
  const matched = useMemo(
    () => (q ? allSessions.filter((s) => `${s.title} ${s.topic} ${s.subject}`.toLowerCase().includes(q)) : allSessions),
    [allSessions, q],
  );

  const recent = matched.slice(0, 5);
  const quizzes = allSessions.filter((s) => s.score !== null && s.total !== null).slice(0, 5);
  const continueWith = allSessions[0];
  const savedNotes = (docs.data ?? []).filter((d) => d.doc_type.startsWith("study-")).slice(0, 5);

  const openSession = (s: StudySession) =>
    navigate({ to: "/learn/$tool", params: { tool: s.tool }, search: { subject: s.subject, session: s.id } });

  const remove = async (id: string) => {
    try {
      await deleteStudySession(id);
      await qc.invalidateQueries({ queryKey: ["study-sessions"] });
      toast.success("Session deleted.");
    } catch {
      toast.error("Could not delete that session.");
    }
  };

  return (
    <AppShell title="Student Learning" subtitle="Understand, revise and score higher">
      <section className="gradient-brand animate-rise flex items-center gap-4 rounded-3xl p-5 text-primary-foreground shadow-[var(--shadow-float)]">
        <BrandLogo size={44} className="rounded-xl bg-background/90 p-1.5" />
        <div className="min-w-0">
          <p className="text-base font-bold">Your AI study room</p>
          <p className="text-xs opacity-85">
            Ask anything, get notes, questions and quizzes — then save what helps to your library.
          </p>
        </div>
      </section>

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search study topics, tools or saved sessions"
          className="pl-9"
          aria-label="Search study topics"
        />
      </div>

      {continueWith && !q && (
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-bold">Continue learning</h2>
          <button
            type="button"
            onClick={() => openSession(continueWith)}
            className="surface-card flex w-full items-center gap-3 p-4 text-left transition-transform active:scale-[0.98]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
              <PlayCircle className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{continueWith.title}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {studyTool(continueWith.tool)?.label ?? continueWith.tool} · {subjectLabel(continueWith.subject)} ·{" "}
                {timeAgo(continueWith.updated_at)}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </section>
      )}

      {!q && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-bold">Study modes</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {MODES.map((m) => (
              <Link
                key={m.label}
                to="/learn/$tool"
                params={{ tool: m.tool }}
                search={{ difficulty: m.difficulty }}
                className="surface-card flex flex-col gap-2 p-3.5 transition-transform active:scale-[0.97]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-ink">
                  <m.icon className="h-4.5 w-4.5" />
                </span>
                <span className="text-xs font-semibold leading-tight">{m.label}</span>
                <span className="text-[10px] text-muted-foreground">{m.hint}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-7">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold">Recent study sessions</h2>
          {sessions.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {recent.length === 0 ? (
          <p className="surface-card p-4 text-xs text-muted-foreground">
            {q ? "No sessions match your search." : "No sessions yet — pick a tool below to start your first one."}
          </p>
        ) : (
          <div className="space-y-2">
            {recent.map((s) => (
              <div key={s.id} className="surface-card flex items-center gap-3 p-3.5">
                <button type="button" onClick={() => openSession(s)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-semibold">{s.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {studyTool(s.tool)?.label ?? s.tool} · {subjectLabel(s.subject)} · {timeAgo(s.updated_at)}
                  </span>
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full text-muted-foreground"
                  aria-label={`Delete ${s.title}`}
                  onClick={() => remove(s.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {quizzes.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-2 text-sm font-bold">Quiz history</h2>
          <div className="space-y-2">
            {quizzes.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => openSession(s)}
                className="surface-card flex w-full items-center gap-3 p-3.5 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-xs font-bold text-brand-ink">
                  {s.score}/{s.total}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{s.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {subjectLabel(s.subject)} · {timeAgo(s.updated_at)}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      )}

      {savedNotes.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-2 text-sm font-bold">Saved notes in your library</h2>
          <div className="space-y-2">
            {savedNotes.map((d) => (
              <Link
                key={d.id}
                to="/doc/$id"
                params={{ id: d.id }}
                className="surface-card flex items-center gap-3 p-3.5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
                  <FileText className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{d.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{timeAgo(d.created_at)}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {!q && (
        <section className="mt-7">
          <h2 className="mb-3 text-sm font-bold text-muted-foreground">Subjects</h2>
          <div className="flex flex-wrap gap-2">
            {STUDY_SUBJECTS.map((s) => (
              <Link
                key={s.id}
                to="/learn/$tool"
                params={{ tool: "explain" }}
                search={{ subject: s.id }}
                className="surface-card flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-transform active:scale-95"
              >
                <span>{s.emoji}</span>
                {s.label}
              </Link>
            ))}
          </div>
        </section>
      )}

      {STUDY_GROUPS.map((group) => {
        const groupTools = tools.filter((t) => t.group === group.id);
        if (!groupTools.length) return null;
        return (
          <section key={group.id} className="mt-7">
            <h2 className="text-sm font-bold">{group.label}</h2>
            <p className="mb-3 text-xs text-muted-foreground">{group.hint}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {groupTools.map((t, i) => (
                <Link
                  key={t.id}
                  to="/learn/$tool"
                  params={{ tool: t.id }}
                  className="surface-card animate-rise flex items-center gap-3 p-4 transition-transform active:scale-[0.98]"
                  style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
                    <t.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{t.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{t.hint}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </AppShell>
  );
}
