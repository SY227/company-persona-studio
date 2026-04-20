const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const MAX_PARSE_RETRIES = 1;

type GeminiCandidateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
};

type GeminiStructuredOutputError = Error & {
  rawText?: string;
  code?: string;
  attempt?: number;
};

function getApiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    ""
  );
}

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function previewText(value: string, maxLength = 500) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…`;
}

function createStructuredOutputError(
  message: string,
  extras?: Partial<GeminiStructuredOutputError>,
) {
  const error = new Error(message) as GeminiStructuredOutputError;
  Object.assign(error, extras);
  return error;
}

function logGeminiIssue(message: string, details?: unknown) {
  if (!isDevelopment()) return;

  console.error(`[gemini] ${message}`);

  if (details !== undefined) {
    console.error(details);
  }
}

function extractJsonCandidate(value: string) {
  const trimmed = value.trim();
  const withoutFenceStart = trimmed.replace(/^```(?:json)?\s*/i, "");
  const cleaned = withoutFenceStart.replace(/```$/i, "").trim();
  const candidates = [cleaned];

  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(cleaned.slice(objectStart, objectEnd + 1));
  }

  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    candidates.push(cleaned.slice(arrayStart, arrayEnd + 1));
  }

  return [...new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean))];
}

function safeJsonParse<T>(value: string): T {
  const parseErrors: string[] = [];

  for (const candidate of extractJsonCandidate(value)) {
    try {
      return JSON.parse(candidate) as T;
    } catch (error) {
      parseErrors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw createStructuredOutputError("Unable to parse Gemini JSON response.", {
    code: "malformed_json",
    rawText: value,
  });
}

function buildPrompt(prompt: string, attempt: number) {
  if (attempt === 0) return prompt;

  return `${prompt}\n\nYour last response was malformed for the parser. Return only valid JSON that matches the requested shape. Do not wrap it in markdown fences. Do not add commentary before or after the JSON.`;
}

async function requestGemini(prompt: string) {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw createStructuredOutputError("Missing Gemini API key.", { code: "missing_api_key" });
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
    throw createStructuredOutputError(
      `Gemini request failed: ${response.status} ${previewText(body, 800)}`,
      {
        code: `http_${response.status}`,
      },
    );
  }

  return (await response.json()) as GeminiCandidateResponse;
}

function extractCandidateText(data: GeminiCandidateResponse) {
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
}

export function hasGeminiKey() {
  return Boolean(getApiKey());
}

export function getGeminiDebugReason(error: unknown) {
  if (!(error instanceof Error)) {
    return "gemini_error";
  }

  const typed = error as GeminiStructuredOutputError;

  if (typed.code === "missing_api_key") {
    return "missing_gemini_api_key";
  }

  if (typed.code === "malformed_json") {
    return "gemini_malformed_json";
  }

  return error.message.replace(/\s+/g, " ").trim().slice(0, 180) || "gemini_error";
}

export async function generateStructuredOutput<T>(prompt: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_PARSE_RETRIES; attempt += 1) {
    try {
      const data = await requestGemini(buildPrompt(prompt, attempt));
      const text = extractCandidateText(data).trim();

      if (!text) {
        throw createStructuredOutputError("Gemini returned an empty response.", {
          code: "empty_response",
          attempt: attempt + 1,
        });
      }

      try {
        return safeJsonParse<T>(text);
      } catch (error) {
        const parseError =
          error instanceof Error
            ? (error as GeminiStructuredOutputError)
            : createStructuredOutputError(String(error));

        logGeminiIssue(
          `Structured output parse failed on attempt ${attempt + 1}. Raw candidate preview:`,
          previewText(text, 1200),
        );

        throw createStructuredOutputError(
          `Gemini returned malformed JSON on attempt ${attempt + 1}.`,
          {
            code: parseError.code ?? "malformed_json",
            rawText: text,
            attempt: attempt + 1,
          },
        );
      }
    } catch (error) {
      lastError = error;

      if (attempt < MAX_PARSE_RETRIES) {
        const debugReason = getGeminiDebugReason(error);
        logGeminiIssue(`Retrying structured output after attempt ${attempt + 1}: ${debugReason}`);
        continue;
      }
    }
  }

  if (lastError instanceof Error) {
    if (isDevelopment()) {
      const typed = lastError as GeminiStructuredOutputError;
      logGeminiIssue(`Structured output failed after retries: ${lastError.message}`);
      if (typed.rawText) {
        logGeminiIssue("Last raw Gemini candidate preview:", previewText(typed.rawText, 1200));
      }
    }

    throw lastError;
  }

  throw new Error("Gemini structured output failed.");
}
