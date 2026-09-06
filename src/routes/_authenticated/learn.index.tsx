import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, GraduationCap } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { STUDY_GROUPS, STUDY_SUBJECTS, STUDY_TOOLS } from "@/lib/study";

export const Route = createFileRoute("/_authenticated/learn")({
  head: () => ({
    meta: [
      { title: "Student Learning — D.Cr Library" },
      {
        name: "description",
        content:
          "AI study assistant, quiz and flashcard generators, revision notes and student document tools for school and college.",
      },
      { property: "og:title", content: "Student Learning — D.Cr Library" },
      { property: "og:description", content: "Learn faster with AI notes, quizzes, flashcards and assignment tools." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LearnPage,
});

function LearnPage() {
  return (
    <AppShell title="Student Learning" subtitle="Understand, revise and submit — faster">
      <section className="gradient-brand animate-rise flex items-center gap-4 rounded-3xl p-5 text-primary-foreground shadow-[var(--shadow-float)]">
        <GraduationCap className="h-9 w-9 shrink-0" />
        <div className="min-w-0">
          <p className="text-base font-bold">Built for students</p>
          <p className="text-xs opacity-85">
            Pick a tool, choose your subject and level, and get study material you can edit, export and save.
          </p>
        </div>
      </section>

      <section className="mt-6">
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

      {STUDY_GROUPS.map((group) => (
        <section key={group.id} className="mt-7">
          <h2 className="text-sm font-bold">{group.label}</h2>
          <p className="mb-3 text-xs text-muted-foreground">{group.hint}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {STUDY_TOOLS.filter((t) => t.group === group.id).map((t, i) => (
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
      ))}
    </AppShell>
  );
}
