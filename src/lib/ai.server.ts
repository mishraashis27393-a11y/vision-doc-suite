/**
 * AI layer — Google Gemini is the only provider.
 *
 * GEMINI_API_KEY is read from the server environment only; it is never sent to
 * the browser. Every AI feature calls Gemini directly from the server.
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
/** Latest stable Gemini models. */
const GEMINI_TEXT_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest"];
const GEMINI_IMAGE_MODELS = ["gemini-3.1-flash-image", "gemini-2.5-flash-image"];

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
      await sleep((error instanceof ProviderError && error.status === 429 ? 1500 : 400) * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

function geminiError(status: number, body: string) {
  if (status === 400 && /API key not valid/i.test(body))
    return new ProviderError("The Gemini API key is invalid. Please update GEMINI_API_KEY.", status, false);
  if (status === 401 || status === 403)
    return new ProviderError("The Gemini API key was rejected. Please check its permissions.", status, false);
  if (status === 429) {
    // "limit: 0" means the free tier grants this model no quota at all — retrying never helps.
    if (/limit:\s*0\b/.test(body))
      return new ProviderError(
        "This Gemini model isn't available on your API key's free tier (quota limit 0). Enable billing on your Google AI Studio project to use it.",
        status,
        false,
      );
    return new ProviderError("Gemini is rate limited right now. Please try again in a moment.", status, true);
  }
  if (status >= 500)
    return new ProviderError("Gemini is temporarily unavailable. Retrying…", status, true);
  let detail = "";
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    detail = parsed.error?.message?.trim() ?? "";
  } catch {
    detail = body.trim().slice(0, 300);
  }
  return new ProviderError(
    detail ? `Gemini request failed (${status}): ${detail}` : `Gemini request failed (${status}).`,
    status,
    false,
  );
}

function isKeyError(error: unknown) {
  return error instanceof ProviderError && (error.status === 401 || error.status === 403 || error.status === 400);
}

function isRateLimit(error: unknown) {
  return error instanceof ProviderError && error.status === 429;
}

const RATE_LIMIT_MESSAGE =
  "Gemini is over its quota right now. Wait a minute and try again, or check the quota/billing on your Gemini API key.";

/* ----------------------------------------------------------- gemini: text */

type GeminiPart = { text?: string; inline_data?: { mime_type: string; data: string } };

async function geminiGenerate(
  model: string,
  body: Record<string, unknown>,
): Promise<Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ProviderError("Gemini is not configured. Add GEMINI_API_KEY to the server environment.", 503, false);
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

/** Structured JSON generation through Gemini. */
async function callGemini(system: string, user: string) {
  if (!process.env.GEMINI_API_KEY)
    throw new ProviderError("Gemini is not configured. Add GEMINI_API_KEY to the server environment.", 503, false);

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
  if (isRateLimit(lastError)) throw new ProviderError(RATE_LIMIT_MESSAGE, 429, true);
  if (lastError instanceof Error) throw lastError;
  throw new ProviderError("Gemini returned no usable response.", 502, false);
}

/* ------------------------------------------------------------ public: text */

export async function callGateway(system: string, user: string) {
  const key = cacheKey(["text", system, user]);
  const cached = cacheGet<Record<string, unknown>>(key);
  if (cached) return cached;

  const result = await callGemini(system, user);
  cacheSet(key, result);
  return result;
}

/* ------------------------------------------------------------- public: OCR */

/** OCR: reads all visible text out of a page image (data URL). */
export async function ocrImageText(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const mime = dataUrl.slice(5, dataUrl.indexOf(";")) || "image/jpeg";
  const instruction =
    "Extract every readable line of text from this scanned page. Preserve reading order and line breaks. Reply with plain text only, no commentary.";

  if (!process.env.GEMINI_API_KEY)
    throw new ProviderError("Gemini OCR is not configured. Add GEMINI_API_KEY to the server environment.", 503, false);
  let lastError: unknown;
  for (const model of GEMINI_TEXT_MODELS) {
    try {
      const parts = await withRetry(() =>
        geminiGenerate(model, {
          contents: [{ role: "user", parts: [{ text: instruction }, { inline_data: { mime_type: mime, data: base64 } }] as GeminiPart[] }],
        }),
      );
      const text = parts.map((p) => p.text ?? "").join("");
      if (text.trim()) return text.trim();
    } catch (error) {
      lastError = error;
      if (isKeyError(error)) throw error;
    }
  }
  if (isRateLimit(lastError)) throw new ProviderError(RATE_LIMIT_MESSAGE, 429, true);
  if (lastError instanceof Error) throw lastError;
  throw new ProviderError("Gemini could not read text from this page.", 502, false);
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

  if (!process.env.GEMINI_API_KEY)
    throw new ProviderError("Gemini design generation is not configured. Add GEMINI_API_KEY to the server environment.", 503, false);
  let lastError: unknown;
  for (const model of GEMINI_IMAGE_MODELS) {
    try {
      const parts = await withRetry(() =>
        geminiGenerate(model, { contents: [{ role: "user", parts: [{ text: prompt }] }] }),
      );
      const inline = parts.find((p) => p.inlineData?.data)?.inlineData;
      if (inline?.data) return { image: `data:${inline.mimeType ?? "image/png"};base64,${inline.data}` };
    } catch (error) {
      lastError = error;
      if (isKeyError(error)) throw error;
    }
  }
  if (isRateLimit(lastError)) throw new ProviderError(RATE_LIMIT_MESSAGE, 429, true);
  if (lastError instanceof Error) throw lastError;
  throw new ProviderError("Gemini did not return a design. Try adjusting your prompt.", 502, false);
}
