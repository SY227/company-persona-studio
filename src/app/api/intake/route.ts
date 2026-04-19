import { NextResponse } from "next/server";

import { answerFallback, synthesizeFallback } from "@/lib/fallback";
import { hasGeminiKey, generateStructuredOutput } from "@/lib/gemini";
import { extractPdfText } from "@/lib/pdf";
import { SAMPLE_COMPANY } from "@/lib/sample-company";
import { createChunks, excerpt, mergeMaterials } from "@/lib/text";
import type { PersonaProfile, SessionPayload, SourceMaterial } from "@/lib/types";

const SYNTHESIS_PROMPT = `You are synthesizing a live demo persona for a company-facing chatbot.
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
- Describe the voice from the source materials only.
- Keep the tone operator-grade, calm, and commercially useful.
- Do not use gimmicky language.
- Keep arrays tight, usually 4 to 6 items.
- Suggested prompts should be immediately demoable.
- Writing directives should read like clear instructions or prohibitions, not vague fragments.`;

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
  } catch {
    return {
      persona: synthesizeFallback(materials),
      mode: "demo" as const,
    };
  }
}

async function parseMaterials(formData: FormData) {
  const useSample = formData.get("useSample") === "true";
  const pastedText = (formData.get("pastedText")?.toString() ?? "").trim();

  if (useSample) {
    return {
      materials: [...SAMPLE_COMPANY.materials],
      sourceType: "sample" as const,
    };
  }

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  const materials: SourceMaterial[] = [];

  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase();

    if (extension !== "pdf") {
      continue;
    }

    const text = await extractPdfText(Buffer.from(await file.arrayBuffer()));

    if (!text) continue;

    materials.push({
      id: `pdf-${materials.length}-${crypto.randomUUID()}`,
      label: file.name,
      kind: "pdf",
      text,
      excerpt: excerpt(text),
    });
  }

  if (pastedText) {
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
  };
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const { materials, sourceType } = await parseMaterials(formData);

  if (!materials.length) {
    return NextResponse.json(
      { error: "Add at least one PDF, some pasted writing, or try the example case." },
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
