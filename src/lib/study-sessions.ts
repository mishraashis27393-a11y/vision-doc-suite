import { supabase } from "@/integrations/supabase/client";
import { currentUserId } from "@/lib/documents";

export type QuizQuestion = {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

export type StudyMessage = { role: "user" | "ai"; text: string };

export type StudySession = {
  id: string;
  user_id: string;
  tool: string;
  subject: string;
  level: string | null;
  difficulty: string;
  topic: string;
  title: string;
  content: string;
  summary: string;
  messages: StudyMessage[];
  quiz: QuizQuestion[] | null;
  score: number | null;
  total: number | null;
  created_at: string;
  updated_at: string;
};

function toSession(row: Record<string, unknown>): StudySession {
  return {
    ...(row as unknown as StudySession),
    messages: Array.isArray(row.messages) ? (row.messages as StudyMessage[]) : [],
    quiz: Array.isArray(row.quiz) ? (row.quiz as QuizQuestion[]) : null,
  };
}

export async function listStudySessions(limit = 50) {
  const { data, error } = await supabase
    .from("study_sessions")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => toSession(r as Record<string, unknown>));
}

export async function getStudySession(id: string) {
  const { data, error } = await supabase.from("study_sessions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toSession(data as Record<string, unknown>) : null;
}

export async function createStudySession(input: {
  tool: string;
  subject: string;
  level?: string | null;
  difficulty: string;
  topic: string;
  title: string;
  content: string;
  summary: string;
  quiz?: QuizQuestion[] | null;
}) {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("study_sessions")
    .insert({
      user_id: userId,
      tool: input.tool,
      subject: input.subject,
      level: input.level ?? null,
      difficulty: input.difficulty,
      topic: input.topic,
      title: input.title,
      content: input.content,
      summary: input.summary,
      messages: [],
      quiz: (input.quiz ?? null) as never,
    })
    .select()
    .single();
  if (error) throw error;
  return toSession(data as Record<string, unknown>);
}

export async function updateStudySession(
  id: string,
  patch: Partial<{
    title: string;
    content: string;
    summary: string;
    messages: StudyMessage[];
    quiz: QuizQuestion[] | null;
    score: number | null;
    total: number | null;
  }>,
) {
  const { error } = await supabase
    .from("study_sessions")
    .update(patch as never)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteStudySession(id: string) {
  const { error } = await supabase.from("study_sessions").delete().eq("id", id);
  if (error) throw error;
}
