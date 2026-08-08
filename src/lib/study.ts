import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Brain,
  ClipboardList,
  FileSpreadsheet,
  FlaskConical,
  GraduationCap,
  Layers,
  ListChecks,
  Mail,
  NotebookPen,
  Presentation,
  Sigma,
  Timer,
  UserRound,
} from "lucide-react";

export type StudySubject = { id: string; label: string; emoji: string };

export const STUDY_SUBJECTS: StudySubject[] = [
  { id: "physics", label: "Physics", emoji: "🧲" },
  { id: "chemistry", label: "Chemistry", emoji: "⚗️" },
  { id: "mathematics", label: "Mathematics", emoji: "➗" },
  { id: "biology", label: "Biology", emoji: "🧬" },
  { id: "computer-science", label: "Computer Science", emoji: "💻" },
  { id: "english", label: "English", emoji: "📖" },
  { id: "general", label: "General", emoji: "🎓" },
];

export const STUDY_LEVELS = ["Class 6–8", "Class 9–10", "Class 11–12", "Undergraduate", "Postgraduate"];

export type StudyToolDef = {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  group: "assistant" | "tools" | "documents";
  /** Extra labelled inputs shown on the form. */
  fields: string[];
  /** Placeholder for the main topic field. */
  topicLabel: string;
  topicPlaceholder: string;
};

export const STUDY_TOOLS: StudyToolDef[] = [
  // AI Study Assistant
  { id: "explain", label: "Explain a Topic", hint: "Simple, step-by-step explanation", icon: Brain, group: "assistant", fields: [], topicLabel: "Topic", topicPlaceholder: "Newton's laws of motion" },
  { id: "notes", label: "Generate Notes", hint: "Structured classroom notes", icon: NotebookPen, group: "assistant", fields: [], topicLabel: "Topic", topicPlaceholder: "Photosynthesis" },
  { id: "chapter-summary", label: "Chapter Summary", hint: "Summarise a chapter", icon: BookOpen, group: "assistant", fields: ["Chapter / book"], topicLabel: "Chapter topic", topicPlaceholder: "Chemical reactions and equations" },
  { id: "examples", label: "Worked Examples", hint: "Solved examples with reasoning", icon: Sigma, group: "assistant", fields: [], topicLabel: "Topic", topicPlaceholder: "Quadratic equations" },
  { id: "practice", label: "Practice Questions", hint: "Questions with hints & answers", icon: ListChecks, group: "assistant", fields: ["Difficulty"], topicLabel: "Topic", topicPlaceholder: "Trigonometric identities" },

  // Study Tools
  { id: "quiz", label: "Quiz Generator", hint: "MCQ quiz with answer key", icon: ClipboardList, group: "tools", fields: ["Number of questions", "Difficulty"], topicLabel: "Quiz topic", topicPlaceholder: "Periodic table" },
  { id: "flashcards", label: "Flashcards", hint: "Question / answer cards", icon: Layers, group: "tools", fields: ["Number of cards"], topicLabel: "Topic", topicPlaceholder: "Human digestive system" },
  { id: "important-questions", label: "Important Questions", hint: "Most-likely exam questions", icon: GraduationCap, group: "tools", fields: ["Exam / board"], topicLabel: "Chapter or subject", topicPlaceholder: "Electricity" },
  { id: "revision", label: "Revision Notes", hint: "Last-minute revision sheet", icon: Timer, group: "tools", fields: ["Time available"], topicLabel: "Topic", topicPlaceholder: "Motion in a straight line" },
  { id: "formulas", label: "Formula / Definition Sheet", hint: "Key formulas & definitions", icon: FileSpreadsheet, group: "tools", fields: [], topicLabel: "Chapter", topicPlaceholder: "Thermodynamics" },
  { id: "planner", label: "Study Planner", hint: "Day-wise study schedule", icon: Timer, group: "tools", fields: ["Days available", "Hours per day"], topicLabel: "Syllabus / goal", topicPlaceholder: "Class 10 board exam revision" },

  // Student Documents
  { id: "assignment", label: "Assignment Maker", hint: "Ready-to-submit assignment", icon: NotebookPen, group: "documents", fields: ["Student name", "Class / roll no."], topicLabel: "Assignment topic", topicPlaceholder: "Water conservation" },
  { id: "project-report", label: "Project Report", hint: "Full academic project report", icon: BookOpen, group: "documents", fields: ["Student name", "Institution", "Guide"], topicLabel: "Project title", topicPlaceholder: "Smart irrigation system" },
  { id: "lab-report", label: "Lab Report", hint: "Aim, apparatus, procedure, result", icon: FlaskConical, group: "documents", fields: ["Experiment number", "Student name"], topicLabel: "Experiment", topicPlaceholder: "Verification of Ohm's law" },
  { id: "letter", label: "Application / Leave Letter", hint: "Formal school or college letter", icon: Mail, group: "documents", fields: ["Addressed to", "Your name", "Reason"], topicLabel: "Letter purpose", topicPlaceholder: "Leave for 3 days due to fever" },
  { id: "resume", label: "Student Resume / CV", hint: "Fresher-friendly CV", icon: UserRound, group: "documents", fields: ["Full name", "Course", "Skills", "Contact"], topicLabel: "Target role", topicPlaceholder: "Software developer intern" },
  { id: "ppt", label: "Presentation Content", hint: "Slide-by-slide PPT content", icon: Presentation, group: "documents", fields: ["Number of slides"], topicLabel: "Presentation topic", topicPlaceholder: "Renewable energy sources" },
];

export const STUDY_GROUPS = [
  { id: "assistant", label: "AI Study Assistant", hint: "Understand any topic faster" },
  { id: "documents", label: "Student Documents", hint: "Assignments, reports and letters" },
  { id: "tools", label: "Study Tools", hint: "Quiz, flashcards and revision" },
] as const;

export function studyTool(id: string) {
  return STUDY_TOOLS.find((t) => t.id === id);
}

export function subjectLabel(id: string) {
  return STUDY_SUBJECTS.find((s) => s.id === id)?.label ?? "General";
}
