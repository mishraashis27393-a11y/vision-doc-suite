import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DESIGN_TYPES } from "@/lib/design-types";

export const Route = createFileRoute("/_authenticated/ai-design")({
  head: () => ({
    meta: [
      { title: "AI Design Generator — D.Cr Library" },
      { name: "description", content: "Generate posters, banners, logos, visiting cards, thumbnails and social posts with AI." },
      { property: "og:title", content: "AI Design Generator — D.Cr Library" },
      { property: "og:description", content: "Create stunning designs from a single prompt." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AiDesignPage,
});

function AiDesignPage() {
  return (
    <AppShell title="AI Design" subtitle="Pick a design type — describe it — get a design">
      <div className="grid gap-3 sm:grid-cols-2">
        {DESIGN_TYPES.map((t, i) => (
          <Link
            key={t.id}
            to="/design/$type"
            params={{ type: t.id }}
            className="surface-card animate-rise flex items-center gap-3 p-4 transition-transform active:scale-[0.98]"
            style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-lg">{t.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{t.label}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{t.hint}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
