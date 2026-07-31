import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { PageBuilder } from "@/components/PageBuilder";

export const Route = createFileRoute("/_authenticated/image-to-pdf")({
  head: () => ({
    meta: [
      { title: "Image to PDF — D.Cr Library" },
      { name: "description", content: "Convert photos and images into a single professional multi-page PDF document." },
      { property: "og:title", content: "Image to PDF — D.Cr Library" },
      { property: "og:description", content: "Combine images into one clean PDF, ready to share." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell title="Image to PDF" subtitle="Combine photos into one document">
      <PageBuilder mode="image" />
    </AppShell>
  ),
});