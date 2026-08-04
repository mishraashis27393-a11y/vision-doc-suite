/**
 * AI layer — Google Gemini is the primary provider.
 *
 * GEMINI_API_KEY is read from the server environment only; it is never sent to
 * the browser. When the key is absent (or Gemini is unreachable) we degrade to
 * the built-in Lovable AI gateway so the app keeps working.
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
/** Latest stable Gemini models. */
const GEMINI_TEXT_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const GEMINI_IMAGE_MODELS = ["gemini-2.5-flash-image"];
const CHAT_MODELS = ["google/gemini-3.6-flash", "google/gemini-2.5-flash"];
const IMAGE_MODELS = ["google/gemini-3.1-flash-image", "google/gemini-2.5-flash-image"];

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 50;

export function parseJson(raw: string): Record<string, unknown> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    // Models occasionally wrap the JSON in prose — recover the outermost object.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        /* fall through */
      }
    }
    return { content: cleaned || raw };
  }
}

/* ------------------------------------------------------------------ cache */

type CacheEntry = { value: unknown; expires: number };
const cache = new Map<string, CacheEntry>();

function cacheKey(parts: unknown[]) {
  return JSON.stringify(parts);
}

function cacheGet<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function cacheSet(key: string, value: unknown) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

/* ---------------------------------------------------------------- helpers */

class ProviderError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs `fn`, retrying transient failures (429/5xx/network) with backoff. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof ProviderError ? error.retryable : true; // network/abort errors are retryable
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      await sleep(400 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

function geminiError(status: number, body: string) {
  if (status === 400 && /API key not valid/i.test(body))
    return new ProviderError("The Gemini API key is invalid. Please update GEMINI_API_KEY.", status, false);
  if (status === 401 || status === 403)
    return new ProviderError("The Gemini API key was rejected. Please check its permissions.", status, false);
  if (status === 429)
    return new ProviderError("Gemini is rate limited right now. Please try again in a moment.", status, true);
  if (status >= 500)
    return new ProviderError("Gemini is temporarily unavailable. Retrying…", status, true);
  return new ProviderError(`Gemini request failed (${status}).`, status, false);
}

function isKeyError(error: unknown) {
  return error instanceof ProviderError && (error.status === 401 || error.status === 403 || error.status === 400);
}

/* ----------------------------------------------------------- gemini: text */

type GeminiPart = { text?: string; inline_data?: { mime_type: string; data: string } };

async function geminiGenerate(
  model: string,
  body: Record<string, unknown>,
): Promise<Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }>> {
  const key = process.env.GEMINI_API_KEY!;
  const res = await fetchWithTimeout(`${GEMINI_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw geminiError(res.status, await res.text().catch(() => ""));
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> } }>;
  };
  return json.candidates?.[0]?.content?.parts ?? [];
}

/** Structured JSON generation through Gemini. Returns null when unavailable. */
async function callGemini(system: string, user: string) {
  if (!process.env.GEMINI_API_KEY) return null;

  let lastError: unknown;
  for (const model of GEMINI_TEXT_MODELS) {
    try {
      const parts = await withRetry(() =>
        geminiGenerate(model, {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
        }),
      );
      const raw = parts.map((p) => p.text ?? "").join("");
      if (raw.trim()) return parseJson(raw);
    } catch (error) {
      lastError = error;
      if (isKeyError(error)) throw error; // a bad key won't get better on another model
    }
  }
  if (lastError instanceof ProviderError && lastError.status === 429) throw lastError;
  return null; // fall back to the built-in models
}

/* ------------------------------------------------------------ public: text */

export async function callGateway(system: string, user: string) {
  const key = cacheKey(["text", system, user]);
  const cached = cacheGet<Record<string, unknown>>(key);
  if (cached) return cached;

  const viaGemini = await callGemini(system, user);
  if (viaGemini) {
    cacheSet(key, viaGemini);
    return viaGemini;
  }

  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) throw new Error("AI is not configured yet. Add a GEMINI_API_KEY to enable AI features.");

  let lastError = "AI request failed.";
  for (const model of CHAT_MODELS) {
    const res = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": lovableKey },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (res.status === 429) throw new Error("Too many requests right now. Please try again in a moment.");
    if (res.status === 402) throw new Error("AI credits are exhausted. Please add credits to continue.");
    if (!res.ok) {
      lastError = `AI request failed (${res.status}).`;
      continue; // try the next model
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "";
    if (!raw.trim()) {
      lastError = "The AI returned an empty response.";
      continue;
    }
    const parsed = parseJson(raw);
    cacheSet(key, parsed);
    return parsed;
  }
  throw new Error(`${lastError} Please try again.`);
}

/* ------------------------------------------------------------- public: OCR */

/** OCR: reads all visible text out of a page image (data URL). */
export async function ocrImageText(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const mime = dataUrl.slice(5, dataUrl.indexOf(";")) || "image/jpeg";
  const instruction =
    "Extract every readable line of text from this scanned page. Preserve reading order and line breaks. Reply with plain text only, no commentary.";

  if (process.env.GEMINI_API_KEY) {
    for (const model of GEMINI_TEXT_MODELS) {
      try {
        const parts = await withRetry(() =>
          geminiGenerate(model, {
            contents: [
              {
                role: "user",
                parts: [{ text: instruction }, { inline_data: { mime_type: mime, data: base64 } }] as GeminiPart[],
              },
            ],
          }),
        );
        const text = parts.map((p) => p.text ?? "").join("");
        if (text.trim()) return text.trim();
      } catch (error) {
        if (isKeyError(error)) throw error;
      }
    }
  }

  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("OCR is not configured yet.");
  for (const model of CHAT_MODELS) {
    const res = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instruction },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
    if (res.status === 429) throw new Error("Too many requests right now. Please try again in a moment.");
    if (res.status === 402) throw new Error("AI credits are exhausted. Please add credits to continue.");
    if (!res.ok) continue;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content ?? "";
    if (text.trim()) return text.trim();
  }
  throw new Error("Could not read text from this page.");
}

/* ----------------------------------------------------------- public: image */

export async function generateDesignImage(data: {
  designType: string;
  prompt: string;
  details?: string;
  style?: string;
  colors?: string;
  aspect: "portrait" | "landscape" | "square";
}) {
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

  // Gemini first.
  if (process.env.GEMINI_API_KEY) {
    for (const model of GEMINI_IMAGE_MODELS) {
      try {
        const parts = await withRetry(() =>
          geminiGenerate(model, { contents: [{ role: "user", parts: [{ text: prompt }] }] }),
        );
        const inline = parts.find((p) => p.inlineData?.data)?.inlineData;
        if (inline?.data) return { image: `data:${inline.mimeType ?? "image/png"};base64,${inline.data}` };
      } catch (error) {
        if (isKeyError(error)) throw error;
      }
    }
  }

  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI is not configured yet. Add a GEMINI_API_KEY to enable design generation.");

  let lastError = "Design generation failed.";
  for (const model of IMAGE_MODELS) {
    const res = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model,
        modalities: ["image", "text"],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (res.status === 429) throw new Error("Too many requests right now. Please try again in a moment.");
    if (res.status === 402) throw new Error("AI credits are exhausted. Please add credits to continue.");
    if (!res.ok) {
      lastError = `Design generation failed (${res.status}).`;
      continue;
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
    };
    const image = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (image) return { image };
    lastError = "The AI did not return a design. Try adjusting your prompt.";
  }
  throw new Error(lastError);
}
