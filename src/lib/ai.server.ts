export function parseJson(raw: string): Record<string, unknown> {
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

export async function callGateway(system: string, user: string) {
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
}
