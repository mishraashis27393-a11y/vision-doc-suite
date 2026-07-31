import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { FileText, ScanLine, Images, Sparkles, ShieldCheck, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "D.Cr Library — AI Document Creator, Scanner & Library" },
      {
        name: "description",
        content:
          "Create documents with AI, scan paper, convert images to PDF, and keep everything in your private, secure document library.",
      },
      { property: "og:title", content: "D.Cr Library — AI Document Creator, Scanner & Library" },
      {
        property: "og:description",
        content: "Create documents with AI, scan paper, convert images to PDF, and keep everything in your private, secure document library.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Sparkles, title: "AI Document Creator", text: "Resumes, invoices, letters, reports and 20+ more types." },
  { icon: ScanLine, title: "Smart Scanner", text: "Auto crop, de-shadow and sharpen paper into crisp PDFs." },
  { icon: Images, title: "Image to PDF", text: "Turn JPG, PNG and HEIC photos into professional documents." },
  { icon: FileText, title: "AI Summary", text: "See the purpose and key points before you open a file." },
  { icon: QrCode, title: "QR for every file", text: "Each document gets a scannable code that opens it instantly." },
  { icon: ShieldCheck, title: "Private by default", text: "Your library is yours alone — nobody else can read it." },
];

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/home", replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <div className="gradient-brand px-6 pb-16 pt-14 text-primary-foreground">
        <div className="mx-auto max-w-3xl animate-rise">
          <span className="inline-flex items-center gap-2 rounded-full bg-background/15 px-3 py-1 text-xs font-semibold backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" /> AI Document Platform
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            D.Cr Library
          </h1>
          <p className="mt-3 max-w-md text-base text-primary-foreground/85">
            Create with AI. Scan with your camera. Store everything in one private, beautifully organised library.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="secondary" className="rounded-full px-7 font-semibold">
              <Link to="/auth">Get started free</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full border-primary-foreground/40 bg-transparent px-7 font-semibold text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <Link to="/auth">I already have an account</Link>
            </Button>
          </div>
        </div>
      </div>

      <section className="mx-auto -mt-8 max-w-3xl px-5 pb-16">
        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="surface-card animate-rise p-4"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
                <f.icon className="h-5 w-5" />
              </div>
              <h2 className="mt-3 text-sm font-bold">{f.title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
