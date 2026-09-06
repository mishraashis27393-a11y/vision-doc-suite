import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callGateway, generateDesignImage, ocrImageText } from "./ai.server";
import {
  DesignInput,
  GenerateInput,
  OcrInput,
  QuizInput,
  StudyFollowUpInput,
  StudyInput,
  SummarizeInput,
} from "./ai.schemas";
import { STUDY_TOOL_BRIEFS } from "./study-briefs";

const DIFFICULTY_BRIEF: Record<string, string> = {
  easy: "Difficulty: EASY. Assume the student is a complete beginner. Use very simple words, short sentences, everyday analogies and lots of encouragement.",
  medium: "Difficulty: MEDIUM. Standard classroom depth with clear reasoning and some exam-level rigour.",
  hard: "Difficulty: HARD. Advanced, exam-topper depth: tricky cases, deeper reasoning, higher-order questions and common traps.",
};

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
      DIFFICULTY_BRIEF[data.difficulty] ?? DIFFICULTY_BRIEF["medium"]!,
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

/** Follow-up question inside a study session — keeps the session context. */
export const askStudyFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StudyFollowUpInput.parse(input))
  .handler(async ({ data }) => {
    const system = [
      "You are a patient personal tutor continuing an ongoing study session with one student.",
      "Answer the student's follow-up question using the study material and conversation so far as context.",
      "Explain the reasoning, not just the answer. Keep it focused and under 350 words unless the question needs more.",
      "Use plain text with '- ' bullets and '## ' subheadings when helpful. No placeholders.",
      'Reply ONLY with JSON of shape: {"answer": string}',
    ].join(" ");

    const history = data.history
      .slice(-8)
      .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.text}`)
      .join("\n");

    const user = [
      `Subject: ${data.subject ?? "General"}`,
      `Topic: ${data.topic}`,
      data.level ? `Student level: ${data.level}` : "",
      DIFFICULTY_BRIEF[data.difficulty] ?? DIFFICULTY_BRIEF["medium"]!,
      data.material ? `Study material so far:\n${data.material.slice(0, 8000)}` : "",
      history ? `Conversation so far:\n${history}` : "",
      `Student's new question: ${data.question}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const out = await callGateway(system, user);
    const answer =
      typeof out.answer === "string" && out.answer.trim()
        ? out.answer
        : typeof out.content === "string"
          ? out.content
          : "";
    return { answer };
  });

/** Interactive MCQ quiz with options, correct answers and explanations. */
export const generateQuizQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => QuizInput.parse(input))
  .handler(async ({ data }) => {
    const system = [
      "You write multiple-choice quizzes for students.",
      "Every question has exactly 4 options, exactly one correct option, and a one or two sentence explanation of why it is correct.",
      "answerIndex is the 0-based index of the correct option. Never mention the answer inside the question text.",
      'Reply ONLY with JSON of shape: {"title": string, "questions": [{"question": string, "options": string[], "answerIndex": number, "explanation": string}]}',
    ].join(" ");

    const user = [
      `Subject: ${data.subject}`,
      `Topic: ${data.topic}`,
      data.level ? `Student level: ${data.level}` : "",
      DIFFICULTY_BRIEF[data.difficulty] ?? DIFFICULTY_BRIEF["medium"]!,
      `Write exactly ${data.count} questions.`,
      data.language ? `Write in ${data.language}.` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const out = await callGateway(system, user);
    const raw = Array.isArray(out.questions) ? (out.questions as Record<string, unknown>[]) : [];

    const questions = raw
      .map((q) => {
        const options = Array.isArray(q.options) ? (q.options as unknown[]).map(String).slice(0, 4) : [];
        const answerIndex = Number(q.answerIndex);
        return {
          question: typeof q.question === "string" ? q.question : "",
          options,
          answerIndex: Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < options.length ? answerIndex : 0,
          explanation: typeof q.explanation === "string" ? q.explanation : "",
        };
      })
      .filter((q) => q.question && q.options.length === 4)
      .slice(0, data.count);

    if (!questions.length) throw new Error("The quiz could not be generated. Please try again.");

    return {
      title: typeof out.title === "string" && out.title ? out.title : `${data.topic} quiz`,
      questions,
    };
  });
