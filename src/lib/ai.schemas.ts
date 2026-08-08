import { z } from "zod";

export const GenerateInput = z.object({
  docType: z.string().min(1),
  prompt: z.string().min(3).max(4000),
  answers: z.string().max(4000).optional(),
  language: z.string().max(60).optional(),
  tone: z.string().max(60).optional(),
  style: z.string().max(60).optional(),
});

export const DesignInput = z.object({
  designType: z.string().min(1),
  prompt: z.string().min(3).max(2000),
  details: z.string().max(2000).optional(),
  style: z.string().max(60).optional(),
  colors: z.string().max(80).optional(),
  aspect: z.enum(["portrait", "landscape", "square"]).default("portrait"),
});

export const SummarizeInput = z.object({
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(20000),
  pageCount: z.number().int().positive().optional(),
});

export const OcrInput = z.object({ image: z.string().min(32).max(12_000_000) });

export const StudyInput = z.object({
  tool: z.string().min(1).max(60),
  subject: z.string().min(1).max(60),
  topic: z.string().min(3).max(500),
  level: z.string().max(60).optional(),
  details: z.string().max(3000).optional(),
  language: z.string().max(60).optional(),
});