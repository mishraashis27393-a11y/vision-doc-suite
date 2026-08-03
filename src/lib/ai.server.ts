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

const CHAT_MODELS = ["google/gemini-3.6-flash", "google/gemini-2.5-flash"];

export async function callGateway(system: string, user: string) {
  const viaGemini = await callGemini(system, user);
  if (viaGemini) return viaGemini;

  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI is not configured yet.");

  let lastError = "AI request failed.";
  for (const model of CHAT_MODELS) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
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
    return parseJson(raw);
  }
  throw new Error(`${lastError} Please try again.`);
}


const IMAGE_MODELS = ["google/gemini-3.1-flash-image", "google/gemini-2.5-flash-image"];

/** OCR: reads all visible text out of a page image (data URL). */
export async function ocrImageText(dataUrl: string) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const base64 = dataUrl.split(",")[1] ?? "";
  const mime = dataUrl.slice(5, dataUrl.indexOf(";")) || "image/jpeg";
  const instruction =
    "Extract every readable line of text from this scanned page. Preserve reading order and line breaks. Reply with plain text only, no commentary.";

  if (geminiKey) {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: instruction }, { inline_data: { mime_type: mime, data: base64 } }] }],
        }),
      },
    );
    if (res.ok) {
      const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (text.trim()) return text.trim();
    }
  }

  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("OCR is not configured yet.");
  for (const model of CHAT_MODELS) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

export async function generateDesignImage(data: {
  designType: string;
  prompt: string;
  details?: string;
  style?: string;
  colors?: string;
  aspect: "portrait" | "landscape" | "square";
}) {
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

  let lastError = "Design generation failed.";
  for (const model of IMAGE_MODELS) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
