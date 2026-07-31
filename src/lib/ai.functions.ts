import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GenerateInput = z.object({
  docType: z.string().min(1),
  prompt: z.string().min(3).max(4000),
  answers: z.string().max(4000).optional(),
});

const SummarizeInput = z.object({
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(20000),
  pageCount: z.number().int().positive().optional(),
});

async function callGateway(system: string, user: string) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI is not configured yet.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (res.status === 429) throw new Error("Too many requests right now. Please try again in a moment.");
  if (res.status === 402) throw new Error("AI credits are exhausted. Please add credits to continue.");
  if (!res.ok) throw new Error(`AI request failed (${res.status}).`);

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { content: raw } as Record<string, unknown>;
  }
}

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