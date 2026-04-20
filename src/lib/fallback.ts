import { guessCompanyName } from "@/lib/text";
import type {
  ChatResponsePayload,
  PersonaProfile,
  SourceMaterial,
  TextChunk,
} from "@/lib/types";

function inferTraits(corpus: string) {
  const lower = corpus.toLowerCase();
  const traits = ["clear", "grounded", "operator-grade"];

  if (lower.includes("finance") || lower.includes("cfo")) traits.push("executive-ready");
  if (lower.includes("calm") || lower.includes("confidence")) traits.push("calm");
  if (lower.includes("practical") || lower.includes("pragmatic")) traits.push("practical");
  if (lower.includes("trust") || lower.includes("institutional")) traits.push("high-trust");

  return [...new Set(traits)].slice(0, 5);
}

function inferDomains(corpus: string) {
  const lower = corpus.toLowerCase();
  const domains = ["company messaging", "customer communication"];

  if (lower.includes("finance")) domains.push("finance operations");
  if (lower.includes("sales")) domains.push("sales enablement");
  if (lower.includes("support")) domains.push("support workflows");
  if (lower.includes("investor") || lower.includes("board")) domains.push("investor communications");

  return [...new Set(domains)].slice(0, 5);
}

export function synthesizeFallback(materials: SourceMaterial[]): PersonaProfile {
  const corpus = materials.map((item) => item.text).join("\n\n");
  const companyName = guessCompanyName(materials);
  const traits = inferTraits(corpus);
  const domains = inferDomains(corpus);

  return {
    companyName,
    voiceSummary: `${companyName} comes across as measured, specific, and commercially practical. The company persona avoids hype, stays close to real operating work, and prefers clean business language over novelty claims.`,
    keyTraits: traits,
    knowledgeDomains: domains,
    toneDescriptors: ["calm", "precise", "credible", "useful"],
    writingDirectives: [
      "Lead with practical business value.",
      "Stay grounded in the provided materials.",
      "Use restrained, executive-friendly language.",
      "Do not overclaim product capabilities.",
    ],
    knowledgeSummary: `${companyName} is best described through the uploaded materials rather than generic marketing copy. The strongest themes are ${domains.slice(0, 3).join(", ")} and a consistent preference for clarity over hype.`,
    suggestedPrompts: [
      "How would this company describe its value proposition?",
      "Write a customer support reply in this style.",
      "Summarize our investor tone.",
      "Answer like our company talking to a prospect.",
    ],
  };
}

function candidateSentences(chunks: TextChunk[]) {
  return chunks
    .flatMap((chunk) =>
      chunk.text
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length > 40),
    )
    .slice(0, 16);
}

function selectRelevantSentences(question: string, chunks: TextChunk[]) {
  const lowerQuestion = question.toLowerCase();
  const keywords = lowerQuestion.split(/[^a-z0-9]+/).filter((token) => token.length > 3);
  const scored = candidateSentences(chunks).map((sentence) => {
    const lowerSentence = sentence.toLowerCase();
    const score = keywords.reduce(
      (total, keyword) => total + (lowerSentence.includes(keyword) ? 1 : 0),
      0,
    );
    return { sentence, score };
  });

  const ranked = scored.sort((a, b) => b.score - a.score).map((entry) => entry.sentence);
  return [...new Set(ranked)].slice(0, 3);
}

function isConversationalQuestion(question: string) {
  return /\bhow are you\b|^(hi|hello|hey)\b|\bwhat'?s up\b/i.test(question.trim());
}

function isWritingRequest(question: string) {
  return /\bdraft\b|\bwrite\b|\brewrite\b|\bemail\b|\bfollow-?up\b|\breply\b|\brespond\b/i.test(question);
}

export function answerFallback(
  question: string,
  persona: PersonaProfile,
  selectedChunks: TextChunk[],
  options?: { debugReason?: string },
): ChatResponsePayload {
  const references = selectedChunks.slice(0, 3).map((chunk) => ({
    chunkId: chunk.id,
    sourceLabel: chunk.sourceLabel,
    quote: chunk.text.slice(0, 180).trim(),
  }));

  const lowerQuestion = question.toLowerCase();
  const supportingLines = selectRelevantSentences(question, selectedChunks);
  const evidence = supportingLines.join(" ");
  const personaStyle = persona.toneDescriptors.slice(0, 3).join(", ");

  let answer = `${persona.companyName} would answer in a ${personaStyle} style.`;

  if (isConversationalQuestion(question)) {
    answer = `We're doing well, and we try to show up the same way we operate: ${personaStyle}. ${
      evidence || persona.knowledgeSummary
    }`;
  } else if (isWritingRequest(question)) {
    answer = `Here is a draft in ${persona.companyName}'s style:\n\n${
      evidence || persona.knowledgeSummary
    }\n\nIf you want, I can tighten it for a CFO, prospect, or customer audience.`;
  } else if (/(value proposition|describe|positioning|summarize)/.test(lowerQuestion)) {
    answer = `${persona.companyName} would frame it this way: ${evidence || persona.knowledgeSummary}`;
  } else if (/(investor|board)/.test(lowerQuestion)) {
    answer = `${persona.companyName}'s investor tone is measured and operationally focused. ${
      evidence || persona.knowledgeSummary
    }`;
  } else if (/(prospect|sales)/.test(lowerQuestion)) {
    answer = `${persona.companyName} would likely say: ${evidence || persona.voiceSummary}`;
  } else if (evidence) {
    answer = `${persona.companyName} would likely answer it this way: ${evidence}`;
  } else {
    answer = `${persona.companyName} would likely answer in a ${personaStyle} style. ${persona.knowledgeSummary}`;
  }

  return {
    answer,
    references,
    suggestedFollowUps: persona.suggestedPrompts.slice(0, 3),
    mode: "demo",
    debugReason: options?.debugReason,
  };
}
