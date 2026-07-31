import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { PageBuilder } from "@/components/PageBuilder";

export const Route = createFileRoute("/_authenticated/scan")({
  head: () => ({
    meta: [
      { title: "Scan Document — D.Cr Library" },
      { name: "description", content: "Scan paper documents with your camera and get auto-cropped, shadow-free, sharp PDFs." },
      { property: "og:title", content: "Scan Document — D.Cr Library" },
      { property: "og:description", content: "Turn paper into clean, searchable-looking PDFs in seconds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell title="Scan Document" subtitle="Camera scanning with auto enhancement">
      <PageBuilder mode="scan" />
    </AppShell>
  ),
});