import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { DOC_TYPES } from "@/lib/doc-types";

export const Route = createFileRoute("/_authenticated/ai-create")({
  head: () => ({
    meta: [
      { title: "AI Document Creator — D.Cr Library" },
      { name: "description", content: "Pick a document type and generate resumes, invoices, letters, reports and more as polished PDFs." },
      { property: "og:title", content: "AI Document Creator — D.Cr Library" },
      { property: "og:description", content: "Generate professional documents from a single prompt." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AiCreatePage,
});

function AiCreatePage() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const types = q ? DOC_TYPES.filter((t) => `${t.label} ${t.hint}`.toLowerCase().includes(q)) : DOC_TYPES;

  return (
    <AppShell title="AI Create" subtitle="Pick a type — fill a short form — get a document">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search document types"
          aria-label="Search document types"
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {types.map((t, i) => (
          <Link
            key={t.id}
            to="/create/$type"
            params={{ type: t.id }}
            className="surface-card animate-rise flex items-center gap-3 p-4 transition-transform active:scale-[0.98]"
            style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-lg">
              {t.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{t.label}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{t.hint}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>

      {types.length === 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">No document type matches “{query}”.</p>
      )}
    </AppShell>
  );
}
