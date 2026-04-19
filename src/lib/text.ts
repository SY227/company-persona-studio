import type { SourceMaterial, TextChunk } from "@/lib/types";

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
