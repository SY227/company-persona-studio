const MODEL = "gemini-2.5-flash-lite";

function getApiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    ""
  );
}

export function hasGeminiKey() {
  return Boolean(getApiKey());
}

function safeJsonParse<T>(value: string): T {
  const trimmed = value.trim();
  const cleaned = trimmed.replace(/^```json\s*/i, "").replace(/```$/i, "");
  return JSON.parse(cleaned) as T;
}

export async function generateStructuredOutput<T>(prompt: string): Promise<T> {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error("Missing Gemini API key.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return safeJsonParse<T>(text);
}
