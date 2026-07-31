import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FolderPlus, Search, Star } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listDocuments, listFolders, createFolder, updateDocument } from "@/lib/documents";
import { docTypeEmoji, formatBytes } from "@/lib/doc-types";
import { cn } from "@/lib/utils";

type Search = { view?: "all" | "favorites"; folder?: string };

export const Route = createFileRoute("/_authenticated/library")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    view: search.view === "favorites" ? "favorites" : "all",
    folder: typeof search.folder === "string" ? search.folder : undefined,
  }),
  head: () => ({
    meta: [
      { title: "My Library — D.Cr Library" },
      { name: "description", content: "Browse, search, favorite and organise every document you created or scanned." },
      { property: "og:title", content: "My Library — D.Cr Library" },
      { property: "og:description", content: "All your documents in one private, organised place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const { view, folder } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");

  const { data: docs = [], isLoading } = useQuery({ queryKey: ["documents"], queryFn: listDocuments });
  const { data: folders = [] } = useQuery({ queryKey: ["folders"], queryFn: listFolders });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return docs.filter((d) => {
      if (view === "favorites" && !d.is_favorite) return false;
      if (folder && d.folder_id !== folder) return false;
      if (!needle) return true;
      return (
        d.title.toLowerCase().includes(needle) ||
        (d.summary ?? "").toLowerCase().includes(needle) ||
        (d.content ?? "").toLowerCase().includes(needle)
      );
    });
  }, [docs, q, view, folder]);

  const addFolder = async () => {
    const name = window.prompt("Folder name");
    if (!name?.trim()) return;
    try {
      await createFolder(name.trim().slice(0, 60));
      await queryClient.invalidateQueries({ queryKey: ["folders"] });
    } catch {
      toast.error("Could not create the folder.");
    }
  };

  const toggleFav = async (id: string, next: boolean) => {
    try {
      await updateDocument(id, { is_favorite: next });
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
    } catch {
      toast.error("Could not update the document.");
    }
  };

  return (
    <AppShell
      title="My Library"
      subtitle={`${filtered.length} document${filtered.length === 1 ? "" : "s"}`}
      action={
        <Button variant="outline" size="icon" className="rounded-full" aria-label="New folder" onClick={addFolder}>
          <FolderPlus className="h-4 w-4" />
        </Button>
      }
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="rounded-full pl-9"
          placeholder="Search documents..."
          value={q}
          maxLength={100}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Chip active={view === "all" && !folder} onClick={() => navigate({ search: { view: "all" } })}>
          All
        </Chip>
        <Chip active={view === "favorites"} onClick={() => navigate({ search: { view: "favorites" } })}>
          ★ Favorites
        </Chip>
        {folders.map((f) => (
          <Chip key={f.id} active={folder === f.id} onClick={() => navigate({ search: { view: "all", folder: f.id } })}>
            {f.name}
          </Chip>
        ))}
      </div>

      <div className="mt-4 space-y-2.5">
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading your library...</p>}
        {!isLoading && filtered.length === 0 && (
          <div className="surface-card p-10 text-center">
            <p className="text-sm font-semibold">Nothing here yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Create or scan a document to fill your library.</p>
          </div>
        )}
        {filtered.map((doc) => (
          <div key={doc.id} className="surface-card flex items-center gap-3 p-3.5">
            <Link to="/doc/$id" params={{ id: doc.id }} className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-lg">
                {docTypeEmoji(doc.doc_type)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{doc.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {new Date(doc.created_at).toLocaleDateString()} · {doc.page_count} pages · {formatBytes(doc.file_size)}
                </span>
              </span>
            </Link>
            <button
              aria-label={doc.is_favorite ? "Remove from favorites" : "Add to favorites"}
              onClick={() => toggleFav(doc.id, !doc.is_favorite)}
              className="rounded-full p-2 transition-colors hover:bg-accent"
            >
              <Star className={cn("h-4 w-4", doc.is_favorite ? "fill-warning text-warning" : "text-muted-foreground")} />
            </button>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
        active ? "border-transparent bg-brand text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}