import { NextResponse } from "next/server";

import { answerFallback } from "@/lib/fallback";
import {
  generateStructuredOutput,
  getGeminiDebugReason,
  hasGeminiKey,
} from "@/lib/gemini";
import { excerpt, formatPersonaContext } from "@/lib/text";
import type {
  ChatMessage,
  ChatResponsePayload,
  PersonaProfile,
  SourceReference,
  TextChunk,
} from "@/lib/types";

type ChatRequest = {
  question: string;
  persona: PersonaProfile;
  selectedChunks: TextChunk[];
  history: ChatMessage[];
};

type StructuredChatReply = {
  answer: string;
  citationIds: string[];
  suggestedFollowUps: string[];
};

const CHAT_PROMPT = `You are the live company-specific chatbot for this session.
You are not a generic assistant. You speak as the synthesized company persona and representative voice described below.

Return valid JSON with this shape:
{
  "answer": string,
  "citationIds": string[],
  "suggestedFollowUps": string[]
}

How to answer:
- Treat the persona profile as first-class instruction, especially the company name, persona summary, key traits, tone descriptors, writing directives, and knowledge summary.
- Stay grounded in the active source pack. Use the source snippets to support factual claims, examples, and product details.
- Answer in-character as the company or a company representative. For conversational prompts like "how are you", respond briefly and naturally in-company rather than as a neutral AI assistant.
- If the user asks for drafting, rewriting, or messaging help, write the deliverable directly in the company's style with minimal framing, unless a short setup line is clearly useful.
- If the user asks a broad question, synthesize across the persona profile and source pack instead of parroting one snippet.
- If the source pack is thin or does not support a factual claim, do not invent details. Stay useful by pivoting to what the materials do support, preserving the company's style.
- Do not overuse phrases like "according to the materials" or "based on the snippets".
- Do not sound robotic, defensive, or like a retrieval demo.
- Keep answers commercially useful, natural, and concise unless the user clearly wants more depth.
- For short conversational prompts, avoid sounding like a company boilerplate paragraph. One or two well-shaped sentences is usually enough.
- citationIds must include only snippet ids that genuinely support the answer.
- suggestedFollowUps should be short, practical, and optional.`;

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function logChatFallback(reason: string, details?: unknown) {
  if (!isDevelopment()) return;

  console.error(`[chat] ${reason}`);

  if (details !== undefined) {
    console.error(details);
  }
}

function mapReferences(selectedChunks: TextChunk[], citationIds: string[]) {
  const picked = new Set(citationIds);
  const chosen = selectedChunks.filter((chunk) => picked.has(chunk.id));
  const references: SourceReference[] = (chosen.length ? chosen : selectedChunks.slice(0, 3)).map(
    (chunk) => ({
      chunkId: chunk.id,
      sourceLabel: chunk.sourceLabel,
      quote: excerpt(chunk.text, 180),
    }),
  );

  return references;
}

function buildSnippetBlock(selectedChunks: TextChunk[]) {
  if (!selectedChunks.length) {
    return "No snippets were selected.";
  }

  return selectedChunks
    .map(
      (chunk) =>
        `[${chunk.id}] ${chunk.sourceLabel}\n${chunk.text}`,
    )
    .join("\n\n");
}

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequest;

  if (!body.question?.trim()) {
    return NextResponse.json({ error: "Question is required." }, { status: 400 });
  }

  const selectedChunks = body.selectedChunks ?? [];
  const debugFallback = (debugReason: string) =>
    answerFallback(body.question, body.persona, selectedChunks, { debugReason });

  if (!hasGeminiKey()) {
    const debugReason = "missing_gemini_api_key";
    logChatFallback("Gemini key missing. Chat is using fallback mode.");
    return NextResponse.json(debugFallback(debugReason));
  }

  const historyBlock = body.history
    .slice(-8)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");

  try {
    const reply = await generateStructuredOutput<StructuredChatReply>(
      `${CHAT_PROMPT}\n\nPersona profile:\n${formatPersonaContext(body.persona)}\n\nConversation so far:\n${historyBlock || "None yet."}\n\nActive source pack:\n${buildSnippetBlock(selectedChunks)}\n\nUser question:\n${body.question}`,
    );

    const payload: ChatResponsePayload = {
      answer: reply.answer,
      references: mapReferences(selectedChunks, reply.citationIds ?? []),
      suggestedFollowUps: reply.suggestedFollowUps ?? [],
      mode: "live",
    };

    return NextResponse.json(payload);
  } catch (error) {
    const debugReason = getGeminiDebugReason(error);
    logChatFallback(`Gemini chat failed, falling back: ${debugReason}`, error);
    return NextResponse.json(debugFallback(debugReason));
  }
}
