import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGateway, generateDesignImage } from "./ai.server";

const GenerateInput = z.object({
  docType: z.string().min(1),
  prompt: z.string().min(3).max(4000),
  answers: z.string().max(4000).optional(),
  language: z.string().max(60).optional(),
  tone: z.string().max(60).optional(),
  style: z.string().max(60).optional(),
});

const DesignInput = z.object({
  designType: z.string().min(1),
  prompt: z.string().min(3).max(2000),
  details: z.string().max(2000).optional(),
  style: z.string().max(60).optional(),
  colors: z.string().max(80).optional(),
  aspect: z.enum(["portrait", "landscape", "square"]).default("portrait"),
});

const SummarizeInput = z.object({
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(20000),
  pageCount: z.number().int().positive().optional(),
});

export const generateDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DesignInput.parse(input))
  .handler(async ({ data }) => generateDesignImage(data));

export const generateDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GenerateInput.parse(input))
  .handler(async ({ data }) => {
    const system = [
      "You are a professional document writer for the D.Cr Library app.",
      "You produce ready-to-print, professional documents in clean plain text with markdown-style headings.",
      "If critical information is missing to make the document professional, ask for it instead of inventing sensitive facts.",
      "Reply ONLY with JSON of shape:",
      '{"questions": string[] | null, "title": string, "content": string, "summary": string, "purpose": string, "keyPoints": string[]}',
      "Use '# ' for the document title line, '## ' for sections and '- ' for bullets inside content.",
      "Never leave placeholder brackets like [Name] unless the user explicitly wants a blank template.",
      "Ask at most 4 short questions and only when truly required.",
    ].join(" ");

    const user = [
      `Document type: ${data.docType}`,
      `User request: ${data.prompt}`,
      data.answers ? `Additional details provided by the user: ${data.answers}` : "",
      data.language ? `Write the document in ${data.language}.` : "",
      data.tone ? `Tone: ${data.tone}.` : "",
      data.style ? `Formatting style: ${data.style}.` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const out = await callGateway(system, user);
    const questions = Array.isArray(out.questions) ? (out.questions as string[]).filter(Boolean) : [];

    return {
      questions: data.answers ? [] : questions,
      title: typeof out.title === "string" && out.title ? out.title : "Untitled document",
      content: typeof out.content === "string" ? out.content : "",
      summary: typeof out.summary === "string" ? out.summary : "",
      purpose: typeof out.purpose === "string" ? out.purpose : "",
      keyPoints: Array.isArray(out.keyPoints) ? (out.keyPoints as string[]).slice(0, 6) : [],
    };
  });

export const summarizeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SummarizeInput.parse(input))
  .handler(async ({ data }) => {
    const out = await callGateway(
      'You summarise documents. Reply ONLY with JSON: {"title": string, "purpose": string, "summary": string, "keyPoints": string[]}. Keep the summary under 90 words and keyPoints to 5 short items.',
      `Title: ${data.title}\nPages: ${data.pageCount ?? "unknown"}\n\nDocument:\n${data.content.slice(0, 15000)}`,
    );

    return {
      title: typeof out.title === "string" ? out.title : data.title,
      purpose: typeof out.purpose === "string" ? out.purpose : "",
      summary: typeof out.summary === "string" ? out.summary : "",
      keyPoints: Array.isArray(out.keyPoints) ? (out.keyPoints as string[]).slice(0, 5) : [],
    };
  });