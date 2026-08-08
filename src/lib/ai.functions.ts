import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callGateway, generateDesignImage, ocrImageText } from "./ai.server";
import { DesignInput, GenerateInput, OcrInput, StudyInput, SummarizeInput } from "./ai.schemas";
import { STUDY_TOOL_BRIEFS } from "./study-briefs";

export const generateDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DesignInput.parse(input))
  .handler(async ({ data }) => generateDesignImage(data));

export const ocrPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OcrInput.parse(input))
  .handler(async ({ data }) => ({ text: await ocrImageText(data.image) }));

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

export const generateStudyMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StudyInput.parse(input))
  .handler(async ({ data }) => {
    const brief = STUDY_TOOL_BRIEFS[data.tool] ?? STUDY_TOOL_BRIEFS["explain"]!;

    const system = [
      "You are an expert teacher creating study material for school and college students.",
      "Teach for understanding: explain reasoning, give context and encourage the student to think.",
      "Never simply dump answers without the method — always show how the result is reached.",
      "Output clean plain text with markdown-style headings: '# ' for the title, '## ' for sections, '- ' for bullets.",
      "Never use placeholder brackets. Never add commentary outside the JSON.",
      'Reply ONLY with JSON of shape: {"title": string, "content": string, "summary": string, "keyPoints": string[]}',
    ].join(" ");

    const user = [
      `Task: ${brief}`,
      `Subject: ${data.subject}`,
      `Topic: ${data.topic}`,
      data.level ? `Student level: ${data.level}` : "",
      data.details ? `Extra details from the student:\n${data.details}` : "",
      data.language ? `Write in ${data.language}.` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const out = await callGateway(system, user);

    return {
      title: typeof out.title === "string" && out.title ? out.title : data.topic,
      content: typeof out.content === "string" ? out.content : "",
      summary: typeof out.summary === "string" ? out.summary : "",
      keyPoints: Array.isArray(out.keyPoints) ? (out.keyPoints as string[]).slice(0, 6) : [],
    };
  });
