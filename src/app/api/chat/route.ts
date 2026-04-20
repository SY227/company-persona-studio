import { NextResponse } from "next/server";

import { answerFallback } from "@/lib/fallback";
import { generateStructuredOutput, hasGeminiKey } from "@/lib/gemini";
import { excerpt } from "@/lib/text";
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

const CHAT_PROMPT = `You are writing responses for a live grounded company chat demo.
Return valid JSON with this shape:
{
  "answer": string,
  "citationIds": string[],
  "suggestedFollowUps": string[]
}

Rules:
- Sound like the company described in the persona profile.
- Stay grounded in the provided source snippets.
- Do not claim facts that are not present in the snippets or persona summary.
- Keep the answer concise but useful.
- If the user asks for writing, write in the company's style.
- citationIds must reference only snippet ids that support the answer.
- suggestedFollowUps should be short, practical, and optional.`;

function mapReferences(selectedChunks: TextChunk[], citationIds: string[]) {
  const picked = new Set(citationIds);
  const chosen = selectedChunks.filter((chunk) => picked.has(chunk.id));
  const references: SourceReference[] = (chosen.length ? chosen : selectedChunks.slice(0, 3)).map((chunk) => ({
    chunkId: chunk.id,
    sourceLabel: chunk.sourceLabel,
    quote: excerpt(chunk.text, 180),
  }));

  return references;
}

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequest;

  if (!body.question?.trim()) {
    return NextResponse.json({ error: "Question is required." }, { status: 400 });
  }

  const selectedChunks = body.selectedChunks ?? [];

  if (!hasGeminiKey()) {
    return NextResponse.json(
      answerFallback(body.question, body.persona, selectedChunks),
    );
  }

  const snippetBlock = selectedChunks
    .map((chunk) => `[${chunk.id}] ${chunk.sourceLabel}\n${chunk.text}`)
    .join("\n\n");

  const historyBlock = body.history
    .slice(-6)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");

  try {
    const reply = await generateStructuredOutput<StructuredChatReply>(
      `${CHAT_PROMPT}\n\nPersona profile:\n${JSON.stringify(body.persona, null, 2)}\n\nConversation so far:\n${historyBlock || "None yet."}\n\nSource snippets:\n${snippetBlock || "No snippets were selected."}\n\nUser question:\n${body.question}`,
    );

    const payload: ChatResponsePayload = {
      answer: reply.answer,
      references: mapReferences(selectedChunks, reply.citationIds ?? []),
      suggestedFollowUps: reply.suggestedFollowUps ?? [],
      mode: "live",
    };

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(answerFallback(body.question, body.persona, selectedChunks));
  }
}
