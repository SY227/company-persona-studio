export type MaterialKind = "pdf" | "paste" | "sample";

export type SourceMaterial = {
  id: string;
  label: string;
  kind: MaterialKind;
  text: string;
  excerpt: string;
};

export type TextChunk = {
  id: string;
  sourceId: string;
  sourceLabel: string;
  text: string;
};

export type PersonaProfile = {
  companyName: string;
  voiceSummary: string;
  keyTraits: string[];
  knowledgeDomains: string[];
  toneDescriptors: string[];
  writingDirectives: string[];
  knowledgeSummary: string;
  suggestedPrompts: string[];
};

export type SessionPayload = {
  persona: PersonaProfile;
  materials: SourceMaterial[];
  chunks: TextChunk[];
  mode: "live" | "demo";
  sourceType: "sample" | "uploaded";
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  references?: SourceReference[];
  suggestedFollowUps?: string[];
};

export type SourceReference = {
  chunkId: string;
  sourceLabel: string;
  quote: string;
};

export type ChatResponsePayload = {
  answer: string;
  references: SourceReference[];
  suggestedFollowUps: string[];
  mode: "live" | "demo";
};
