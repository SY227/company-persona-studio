import { NextResponse } from "next/server";

import { answerFallback, synthesizeFallback } from "@/lib/fallback";
import {
  generateStructuredOutput,
  getGeminiDebugReason,
  hasGeminiKey,
} from "@/lib/gemini";
import { extractPdfText } from "@/lib/pdf";
import { SAMPLE_COMPANY } from "@/lib/sample-company";
import { createChunks, excerpt, mergeMaterials } from "@/lib/text";
import type { PersonaProfile, SessionPayload, SourceMaterial } from "@/lib/types";

export const runtime = "nodejs";

const SYNTHESIS_PROMPT = `You are synthesizing a grounded company persona for a live company-facing chatbot demo.
Return valid JSON with this shape:
{
  "companyName": string,
  "voiceSummary": string,
  "keyTraits": string[],
  "knowledgeDomains": string[],
  "toneDescriptors": string[],
  "writingDirectives": string[],
  "knowledgeSummary": string,
  "suggestedPrompts": string[]
}

Rules:
- Be truthful. This is not a fine-tuned model.
- Describe the company persona and style from the source materials only.
- Keep the tone operator-grade, calm, and commercially useful.
- Do not use gimmicky language.
- Avoid leaning on the word "voice" when "persona," "style," or plain business language is clearer.
- Keep arrays tight, usually 4 to 6 items.
- Suggested prompts should be immediately demoable.
- Writing directives should read like clear instructions or prohibitions, not vague fragments.`;

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

class PdfExtractionError extends Error {
  constructor(
    public readonly filename: string,
    public readonly cause?: unknown,
  ) {
    super(`PDF extraction failed for ${filename}. Check server logs.`);
    this.name = "PdfExtractionError";
  }
}

async function synthesizePersona(materials: SourceMaterial[]) {
  if (!hasGeminiKey()) {
    return {
      persona: synthesizeFallback(materials),
      mode: "demo" as const,
    };
  }

  const merged = mergeMaterials(materials);

  try {
    const persona = await generateStructuredOutput<PersonaProfile>(
      `${SYNTHESIS_PROMPT}\n\nSource materials:\n${merged}`,
    );

    return { persona, mode: "live" as const };
  } catch (error) {
    if (isDevelopment()) {
      console.error(`[intake] Gemini persona synthesis failed: ${getGeminiDebugReason(error)}`);
      console.error(error);
    }

    return {
      persona: synthesizeFallback(materials),
      mode: "demo" as const,
    };
  }
}

async function parseMaterials(formData: FormData) {
  const useSample = formData.get("useSample") === "true";
  const sourceMode = formData.get("sourceMode") === "paste" ? "paste" : "files";
  const pastedText = (formData.get("pastedText")?.toString() ?? "").trim();

  if (useSample) {
    return {
      materials: [...SAMPLE_COMPANY.materials],
      sourceType: "sample" as const,
      sourceMode,
    };
  }

  const files =
    sourceMode === "files"
      ? formData
          .getAll("files")
          .filter((entry): entry is File => entry instanceof File && entry.size > 0)
      : [];

  const materials: SourceMaterial[] = [];

  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase();

    if (extension !== "pdf") {
      continue;
    }

    let text = "";

    try {
      text = await extractPdfText(await file.arrayBuffer());
    } catch (error) {
      console.error(`[intake] PDF extraction failed for ${file.name}`);
      console.error(error);
      throw new PdfExtractionError(file.name, error);
    }

    if (!text) continue;

    materials.push({
      id: `pdf-${materials.length}-${crypto.randomUUID()}`,
      label: file.name,
      kind: "pdf",
      text,
      excerpt: excerpt(text),
    });
  }

  if (sourceMode === "paste" && pastedText) {
    materials.push({
      id: `paste-${crypto.randomUUID()}`,
      label: "Pasted writing sample",
      kind: "paste",
      text: pastedText,
      excerpt: excerpt(pastedText),
    });
  }

  return {
    materials,
    sourceType: "uploaded" as const,
    sourceMode,
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const { materials, sourceType, sourceMode } = await parseMaterials(formData);

    if (!materials.length) {
      return NextResponse.json(
        {
          error:
            sourceMode === "paste"
              ? "Paste some company material or try the example case."
              : "Add at least one PDF or try the example case.",
        },
        { status: 400 },
      );
    }

    const chunks = createChunks(materials);
    const { persona, mode } = await synthesizePersona(materials);

    const payload: SessionPayload = {
      persona,
      materials,
      chunks,
      mode,
      sourceType,
    };

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof PdfExtractionError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.error("[intake] Unhandled intake route failure");
    console.error(error);

    return NextResponse.json(
      { error: "Could not create the live session. Check server logs." },
      { status: 500 },
    );
  }
}

export function GET() {
  const preview = answerFallback(
    "How would this company describe its value proposition?",
    synthesizeFallback(SAMPLE_COMPANY.materials),
    createChunks(SAMPLE_COMPANY.materials).slice(0, 3),
  );

  return NextResponse.json({
    ok: true,
    sampleCompany: SAMPLE_COMPANY.name,
    preview,
  });
}
