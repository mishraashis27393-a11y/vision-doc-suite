import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  ScanLine,
  Images,
  Library,
  Brain,
  QrCode,
  Star,
  Settings,
  Clock,
  FileText,
  Palette,
  FileEdit,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { listDocuments } from "@/lib/documents";
import { docTypeEmoji, formatBytes } from "@/lib/doc-types";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Dashboard — D.Cr Library" },
      { name: "description", content: "Create AI documents, scan paper, convert images to PDF and open your recent files." },
      { property: "og:title", content: "Dashboard — D.Cr Library" },
      { property: "og:description", content: "Your AI document command centre." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

const ACTIONS = [
  { to: "/ai-create", label: "AI Create", icon: Sparkles, tint: "from-brand to-brand" },
  { to: "/pdf-editor", label: "PDF Editor", icon: FileEdit },
  { to: "/ai-design", label: "AI Design", icon: Palette },
  { to: "/scan", label: "Scan Document", icon: ScanLine },
  { to: "/image-to-pdf", label: "Image to PDF", icon: Images },
  { to: "/library", label: "My Library", icon: Library },
  { to: "/library", label: "AI Summary", icon: Brain, search: { view: "all" } },
  { to: "/library", label: "QR Documents", icon: QrCode, search: { view: "all" } },
  { to: "/library", label: "Favorites", icon: Star, search: { view: "favorites" } },
  { to: "/profile", label: "Settings", icon: Settings },
] as const;

function HomePage() {
  const { data: docs = [] } = useQuery({ queryKey: ["documents"], queryFn: listDocuments });

  const recent = [...docs]
    .sort((a, b) => new Date(b.last_opened_at ?? b.created_at).getTime() - new Date(a.last_opened_at ?? a.created_at).getTime())
    .slice(0, 4);
  const totalSize = docs.reduce((sum, d) => sum + (d.file_size ?? 0), 0);

  return (
    <AppShell title="D.Cr Library" subtitle="AI documents, scanning & storage">
      <section className="gradient-brand animate-rise rounded-3xl p-5 text-primary-foreground shadow-[var(--shadow-float)]">
        <p className="text-xs font-medium uppercase tracking-wider opacity-80">Your library</p>
        <div className="mt-2 flex items-end gap-6">
          <div>
            <p className="text-3xl font-extrabold leading-none">{docs.length}</p>
            <p className="text-xs opacity-80">documents</p>
          </div>
          <div>
            <p className="text-3xl font-extrabold leading-none">{docs.filter((d) => d.is_favorite).length}</p>
            <p className="text-xs opacity-80">favorites</p>
          </div>
          <div>
            <p className="text-3xl font-extrabold leading-none">{formatBytes(totalSize)}</p>
            <p className="text-xs opacity-80">stored</p>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-bold text-muted-foreground">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ACTIONS.map((a, i) => (
            <Link
              key={a.label}
              to={a.to}
              search={"search" in a ? (a.search as never) : undefined}
              className="surface-card animate-rise flex flex-col gap-2.5 p-4 transition-transform active:scale-[0.97]"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
                <a.icon className="h-5 w-5" />
              </span>
              <span className="text-[13px] font-semibold leading-tight">{a.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-muted-foreground">Recent documents</h2>
          <Link to="/library" className="text-xs font-semibold text-brand-ink">
            See all
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="surface-card flex flex-col items-center gap-2 p-8 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-semibold">No documents yet</p>
            <p className="text-xs text-muted-foreground">Start with AI Create or scan a paper document.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {recent.map((doc) => (
              <Link
                key={doc.id}
                to="/doc/$id"
                params={{ id: doc.id }}
                className="surface-card flex items-center gap-3 p-3.5 transition-transform active:scale-[0.99]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-lg">
                  {docTypeEmoji(doc.doc_type)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{doc.title}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(doc.created_at).toLocaleDateString()} · {doc.page_count} pages · {formatBytes(doc.file_size)}
                  </span>
                </span>
                {doc.is_favorite && <Star className="h-4 w-4 fill-warning text-warning" />}
              </Link>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}