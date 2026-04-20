import type { PersonaProfile, SourceMaterial, TextChunk } from "@/lib/types";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "their",
  "this",
  "to",
  "we",
  "with",
  "you",
  "your",
]);

const CONVERSATIONAL_PATTERNS = [
  /^(hi|hello|hey|yo|hiya)\b/i,
  /\bhow are you\b/i,
  /\bwhat'?s up\b/i,
  /\bgood (morning|afternoon|evening)\b/i,
  /^(thanks|thank you)\b/i,
];

const BROAD_PATTERNS = [
  /\btell me about\b/i,
  /\bwhat kind of compan(?:y|ies)\b/i,
  /\bwho (?:is|are)\b/i,
  /\bwhat do (?:you|they) do\b/i,
  /\boverview\b/i,
  /\bsummar(?:ize|y)\b/i,
  /\bhow does\b/i,
  /\bwhat does\b/i,
  /\bwhy\b/i,
  /\bpositioning\b/i,
  /\bvalue proposition\b/i,
  /\bstyle\b/i,
  /\bvoice\b/i,
  /\bpersona\b/i,
  /\btone\b/i,
];

const WRITING_PATTERNS = [
  /\bdraft\b/i,
  /\bwrite\b/i,
  /\brewrite\b/i,
  /\bemail\b/i,
  /\bfollow-?up\b/i,
  /\breply\b/i,
  /\brespond\b/i,
  /\bmessage\b/i,
  /\bin this style\b/i,
];

export function cleanText(text: string) {
  return text.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

export function excerpt(text: string, maxLength = 160) {
  const normalized = cleanText(text);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}

export function createChunks(materials: SourceMaterial[], size = 700) {
  const chunks: TextChunk[] = [];

  for (const material of materials) {
    const blocks = material.text
      .split(/\n{2,}/)
      .map((block) => cleanText(block))
      .filter(Boolean);

    let buffer = "";
    let index = 0;

    for (const block of blocks) {
      const candidate = buffer ? `${buffer} ${block}` : block;

      if (candidate.length <= size) {
        buffer = candidate;
        continue;
      }

      if (buffer) {
        chunks.push({
          id: `${material.id}-chunk-${index}`,
          sourceId: material.id,
          sourceLabel: material.label,
          text: buffer,
        });
        index += 1;
      }

      if (block.length <= size) {
        buffer = block;
        continue;
      }

      for (let cursor = 0; cursor < block.length; cursor += size) {
        const slice = block.slice(cursor, cursor + size).trim();
        if (!slice) continue;
        chunks.push({
          id: `${material.id}-chunk-${index}`,
          sourceId: material.id,
          sourceLabel: material.label,
          text: slice,
        });
        index += 1;
      }

      buffer = "";
    }

    if (buffer) {
      chunks.push({
        id: `${material.id}-chunk-${index}`,
        sourceId: material.id,
        sourceLabel: material.label,
        text: buffer,
      });
    }
  }

  return chunks;
}

export function tokenize(text: string) {
  return cleanText(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !STOP_WORDS.has(token));
}

function includesAnyPattern(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function analyzeQuestion(question: string) {
  const normalized = cleanText(question);
  const tokens = tokenize(normalized);
  const lower = normalized.toLowerCase();
  const conversational = includesAnyPattern(normalized, CONVERSATIONAL_PATTERNS);
  const writing = includesAnyPattern(normalized, WRITING_PATTERNS);
  const broad =
    conversational ||
    writing ||
    tokens.length <= 3 ||
    includesAnyPattern(normalized, BROAD_PATTERNS);

  return {
    normalized,
    lower,
    tokens,
    conversational,
    writing,
    broad,
  };
}

function sourceChunkIndex(chunk: TextChunk) {
  const match = chunk.id.match(/-chunk-(\d+)$/);
  return Number(match?.[1] ?? Number.MAX_SAFE_INTEGER);
}

export function rankChunks(query: string, chunks: TextChunk[], limit = 4) {
  const queryTokens = tokenize(query);
  const querySet = new Set(queryTokens);

  return [...chunks]
    .map((chunk) => {
      const chunkTokens = tokenize(chunk.text);
      const chunkSet = new Set(chunkTokens);
      let score = 0;

      for (const token of querySet) {
        if (chunkSet.has(token)) score += 4;
      }

      for (const token of queryTokens) {
        if (chunk.text.toLowerCase().includes(token)) score += 1;
      }

      return { chunk, score };
    })
    .sort((a, b) => b.score - a.score)
    .filter((entry, index) => entry.score > 0 || index < limit)
    .slice(0, limit)
    .map((entry) => entry.chunk);
}

export function buildChatContextPack(question: string, chunks: TextChunk[], limit = 8) {
  if (!chunks.length) return [];

  const questionProfile = analyzeQuestion(question);
  const sourceOrder = new Map<string, number>();
  const sourceAnchors = new Map<string, TextChunk>();
  const sourceBestScore = new Map<string, number>();

  chunks.forEach((chunk, index) => {
    if (!sourceOrder.has(chunk.sourceId)) {
      sourceOrder.set(chunk.sourceId, index);
      sourceAnchors.set(chunk.sourceId, chunk);
    }
  });

  const scored = chunks
    .map((chunk, index) => {
      const chunkText = chunk.text.toLowerCase();
      const chunkTokens = tokenize(chunk.text);
      const chunkSet = new Set(chunkTokens);
      const sourceIndex = sourceChunkIndex(chunk);
      const overlap = questionProfile.tokens.reduce(
        (total, token) => total + (chunkSet.has(token) ? 1 : 0),
        0,
      );
      const mentions = questionProfile.tokens.reduce(
        (total, token) => total + (chunkText.includes(token) ? 1 : 0),
        0,
      );
      const sourceLabelBonus = questionProfile.tokens.some((token) =>
        chunk.sourceLabel.toLowerCase().includes(token),
      )
        ? 2
        : 0;
      const anchorBonus = Math.max(0, 3 - sourceIndex);
      const overviewBonus =
        /(value proposition|we help|position|tone|preferred messaging|what we avoid|built|customers want)/i.test(
          chunk.text,
        )
          ? 2
          : 0;

      let score = overlap * 6 + mentions * 2 + sourceLabelBonus;

      if (questionProfile.broad) {
        score += anchorBonus + overviewBonus;
      }

      if (questionProfile.conversational) {
        score += anchorBonus + 2;
      }

      if (questionProfile.writing) {
        score += overviewBonus + 1;
      }

      sourceBestScore.set(
        chunk.sourceId,
        Math.max(sourceBestScore.get(chunk.sourceId) ?? 0, score),
      );

      return { chunk, score, index, sourceIndex };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.sourceIndex !== b.sourceIndex) return a.sourceIndex - b.sourceIndex;
      return a.index - b.index;
    });

  const contextLimit = Math.min(
    limit,
    questionProfile.broad || questionProfile.conversational || questionProfile.writing ? 8 : 6,
  );
  const chosen = new Map<string, TextChunk>();

  const addChunk = (chunk?: TextChunk) => {
    if (!chunk || chosen.has(chunk.id) || chosen.size >= contextLimit) return;
    chosen.set(chunk.id, chunk);
  };

  const relevantTarget = questionProfile.conversational
    ? 2
    : questionProfile.broad || questionProfile.writing
      ? 4
      : 5;

  for (const entry of scored) {
    if (chosen.size >= relevantTarget) break;
    if (entry.score > 0 || chosen.size < 2) {
      addChunk(entry.chunk);
    }
  }

  const sourcesByPriority = [...sourceAnchors.keys()].sort((left, right) => {
    const scoreDelta = (sourceBestScore.get(right) ?? 0) - (sourceBestScore.get(left) ?? 0);
    if (scoreDelta !== 0) return scoreDelta;
    return (sourceOrder.get(left) ?? 0) - (sourceOrder.get(right) ?? 0);
  });

  const shouldAddAnchors =
    questionProfile.broad ||
    questionProfile.conversational ||
    questionProfile.writing ||
    sourceAnchors.size > 1;

  if (shouldAddAnchors) {
    const anchorSourceLimit = Math.min(
      sourcesByPriority.length,
      questionProfile.conversational ? 3 : contextLimit,
    );

    for (const sourceId of sourcesByPriority.slice(0, anchorSourceLimit)) {
      addChunk(sourceAnchors.get(sourceId));
    }
  }

  for (const entry of scored) {
    addChunk(entry.chunk);
  }

  if (!chosen.size) {
    chunks.slice(0, contextLimit).forEach((chunk) => addChunk(chunk));
  }

  return [...chosen.values()];
}

export function formatPersonaContext(persona: PersonaProfile) {
  return [
    `Company name: ${persona.companyName}`,
    `Persona summary: ${persona.voiceSummary}`,
    `Key traits: ${persona.keyTraits.join(", ") || "None provided"}`,
    `Tone descriptors: ${persona.toneDescriptors.join(", ") || "None provided"}`,
    `Writing directives: ${persona.writingDirectives.join(" | ") || "None provided"}`,
    `Knowledge domains: ${persona.knowledgeDomains.join(", ") || "None provided"}`,
    `Knowledge summary: ${persona.knowledgeSummary}`,
  ].join("\n");
}

export function mergeMaterials(materials: SourceMaterial[], maxChars = 18000) {
  const joined = materials
    .map((material) => `# ${material.label}\n${cleanText(material.text)}`)
    .join("\n\n");

  return joined.length <= maxChars ? joined : `${joined.slice(0, maxChars)}…`;
}

export function guessCompanyName(materials: SourceMaterial[]) {
  const first = materials[0]?.text ?? "Uploaded company materials";
  const sentence = first.split(/[.!?\n]/)[0]?.trim();
  if (!sentence) return "Uploaded company";

  const beforeIs = sentence.split(/\sis\s/i)[0]?.trim();
  if (beforeIs && beforeIs.length <= 40) {
    return beforeIs;
  }

  const match = sentence.match(/^[A-Z][A-Za-z0-9&\- ]{2,40}/);
  return match?.[0]?.trim() || "Uploaded company";
}
