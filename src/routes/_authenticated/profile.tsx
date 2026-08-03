import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BadgeDollarSign, FileEdit, LogOut, Moon, ShieldCheck, Sun } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { listDocuments } from "@/lib/documents";
import { formatBytes } from "@/lib/doc-types";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile & Settings — D.Cr Library" },
      { name: "description", content: "Manage your D.Cr Library account, appearance and storage usage." },
      { property: "og:title", content: "Profile & Settings — D.Cr Library" },
      { property: "og:description", content: "Account, appearance and storage settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string>("");
  const [dark, setDark] = useState(false);

  const { data: docs = [] } = useQuery({ queryKey: ["documents"], queryFn: listDocuments });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? data.user?.phone ?? ""));
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleTheme = (next: boolean) => {
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const used = docs.reduce((s, d) => s + (d.file_size ?? 0), 0);

  return (
    <AppShell title="Profile" subtitle="Account & settings">
      <div className="surface-card animate-rise flex items-center gap-4 p-5">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-xl font-bold text-primary-foreground">
          {(email || "?").charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{email || "Signed in"}</p>
          <p className="text-xs text-muted-foreground">
            {docs.length} documents · {formatBytes(used)} stored
          </p>
        </div>
      </div>

      <div className="surface-card mt-4 p-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="theme" className="flex items-center gap-2 text-sm">
            {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />} Dark appearance
          </Label>
          <Switch id="theme" checked={dark} onCheckedChange={toggleTheme} />
        </div>
      </div>

      <div className="surface-card mt-4 flex items-start gap-3 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Every document is stored in a private area only your account can open. Share links are time-limited and can be
          revoked by deleting the document.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link to="/pdf-editor" className="surface-card flex flex-col gap-1.5 p-4 active:scale-[0.98]">
          <FileEdit className="h-5 w-5 text-brand-ink" />
          <span className="text-sm font-semibold">PDF Editor</span>
        </Link>
        <Link to="/ad-settings" className="surface-card flex flex-col gap-1.5 p-4 active:scale-[0.98]">
          <BadgeDollarSign className="h-5 w-5 text-brand-ink" />
          <span className="text-sm font-semibold">Ads & monetization</span>
        </Link>
      </div>

      <Button variant="outline" className="mt-4 w-full rounded-full text-destructive" onClick={signOut}>
        <LogOut className="mr-2 h-4 w-4" /> Sign out
      </Button>
    </AppShell>
  );
}