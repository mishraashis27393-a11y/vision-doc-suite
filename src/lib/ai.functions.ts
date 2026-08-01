import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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

function parseJson(raw: string): Record<string, unknown> {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return { content: raw };
  }
}

// Uses the user's own Google Gemini key when GEMINI_API_KEY is configured,
// otherwise falls back to the built-in Gemini models. The key never leaves the server.
async function callGemini(system: string, user: string) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );

  if (res.status === 429) throw new Error("Gemini is rate limited right now. Please try again in a moment.");
  if (!res.ok) return null; // fall back to the built-in models
  const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const raw = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!raw) return null;
  return parseJson(raw);
}

async function callGateway(system: string, user: string) {
  const viaGemini = await callGemini(system, user);
  if (viaGemini) return viaGemini;

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
  return parseJson(raw);
}

export const generateDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DesignInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured yet.");

    const ratio = data.aspect === "landscape" ? "16:9 landscape" : data.aspect === "square" ? "1:1 square" : "4:5 portrait";
    const prompt = [
      `Design a professional, print-ready ${data.designType.replace("design-", "").replace(/-/g, " ")} in ${ratio} format.`,
      `Brief: ${data.prompt}`,
      data.details ? `Details to include as legible text: ${data.details}` : "",
      data.style ? `Visual style: ${data.style}.` : "",
      data.colors ? `Colour palette: ${data.colors}.` : "",
      "Use crisp, correctly spelled typography, balanced layout and high visual polish. No watermarks.",
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image",
        modalities: ["image", "text"],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (res.status === 429) throw new Error("Too many requests right now. Please try again in a moment.");
    if (res.status === 402) throw new Error("AI credits are exhausted. Please add credits to continue.");
    if (!res.ok) throw new Error(`Design generation failed (${res.status}).`);

    const json = (await res.json()) as {
      choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
    };
    const image = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!image) throw new Error("The AI did not return a design. Try adjusting your prompt.");
    return { image };
  });

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