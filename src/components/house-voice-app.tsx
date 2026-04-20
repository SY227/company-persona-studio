"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  FileText,
  LoaderCircle,
  MessageSquareText,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";

import { EXAMPLE_CASE } from "@/lib/sample-company";
import { rankChunks } from "@/lib/text";
import type {
  ChatMessage,
  ChatResponsePayload,
  SessionPayload,
  SourceReference,
} from "@/lib/types";

const HERO_POINTS = [
  {
    step: "01",
    title: "Bring a source pack",
    copy: "Upload live PDFs and paste the writing that already defines how the company sounds.",
  },
  {
    step: "02",
    title: "Synthesize the voice",
    copy: "Distill tone, positioning, directives, and knowledge shape from the materials in this session.",
  },
  {
    step: "03",
    title: "Pressure-test the result",
    copy: "Run realistic prompts and inspect the source grounding that supports each answer.",
  },
];

const SYNTHESIS_STAGES = [
  "Reading source materials",
  "Distilling voice and operating posture",
  "Preparing the grounded chat session",
];

const INITIAL_PROMPTS = [
  "Summarize the value proposition in the company's voice.",
  "Draft a measured follow-up email after a product demo.",
  "What investor-facing tone comes through in the material?",
];

const REPLY_STAGES = [
  "Selecting the strongest source excerpts",
  "Drafting in the synthesized company voice",
  "Checking the answer against session context",
];

function toneNote(mode: SessionPayload["mode"] | ChatResponsePayload["mode"] | null) {
  if (mode === "live") {
    return "Live model mode. Persona synthesis and replies are generated from this session's source pack.";
  }

  if (mode === "demo") {
    return "Fallback mode. The workflow stays testable without a Gemini key, but replies are local.";
  }

  return "Session based only. No account model, no database, no claim of fine-tuning.";
}

export function HouseVoiceApp() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState("");
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [synthesisStageIndex, setSynthesisStageIndex] = useState(0);
  const [replyStageIndex, setReplyStageIndex] = useState(0);

  const hasInputs = files.length > 0 || pastedText.trim().length > 0;
  const isSampleSession = session?.sourceType === "sample";

  const suggestedPrompts = useMemo(() => {
    const latestSuggestions = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.suggestedFollowUps?.length)
      ?.suggestedFollowUps;

    if (latestSuggestions?.length) {
      return latestSuggestions;
    }

    return session?.persona.suggestedPrompts?.length
      ? session.persona.suggestedPrompts
      : INITIAL_PROMPTS;
  }, [messages, session]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isReplying]);

  useEffect(() => {
    if (!isCreatingSession) return;

    const interval = window.setInterval(() => {
      setSynthesisStageIndex((current) => (current + 1) % SYNTHESIS_STAGES.length);
    }, 1200);

    return () => window.clearInterval(interval);
  }, [isCreatingSession]);

  useEffect(() => {
    if (!isReplying) return;

    const interval = window.setInterval(() => {
      setReplyStageIndex((current) => (current + 1) % REPLY_STAGES.length);
    }, 1100);

    return () => window.clearInterval(interval);
  }, [isReplying]);

  function scrollToStudio() {
    document.getElementById("studio")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onFilesSelected(nextFiles: File[]) {
    const pdfs = nextFiles.filter(
      (file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"),
    );

    if (!pdfs.length && nextFiles.length) {
      setNotice("Only PDF files are supported in this demo.");
      return;
    }

    setFiles((current) => {
      const map = new Map(current.map((file) => [`${file.name}-${file.size}`, file]));
      for (const file of pdfs) {
        map.set(`${file.name}-${file.size}`, file);
      }
      return Array.from(map.values());
    });
    setNotice(null);
  }

  function removeFile(target: File) {
    setFiles((current) =>
      current.filter((file) => !(file.name === target.name && file.size === target.size)),
    );
  }

  function buildIntroMessage(nextSession: SessionPayload): ChatMessage {
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      content:
        nextSession.sourceType === "sample"
          ? `${nextSession.persona.companyName} is loaded as the example case. The voice profile is ready from the operating brief, founder letter, and sales sequence. Ask for positioning, investor tone, support language, or a prospect reply.`
          : `Voice profile ready. I synthesized how ${nextSession.persona.companyName} tends to sound from the current session materials. Ask for positioning, sales copy, support language, or a rewrite in this voice.`,
      suggestedFollowUps: nextSession.persona.suggestedPrompts.slice(0, 3),
    };
  }

  async function requestReply(
    activeSession: SessionPayload,
    question: string,
    history: ChatMessage[],
  ) {
    const selectedChunks = rankChunks(question, activeSession.chunks, 4);
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        persona: activeSession.persona,
        selectedChunks,
        history,
      }),
    });

    const data = (await response.json()) as ChatResponsePayload | { error?: string };

    if (!response.ok || "error" in data) {
      throw new Error((data as { error?: string }).error || "The chat request failed.");
    }

    const reply = data as ChatResponsePayload;
    return {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      content: reply.answer,
      references: reply.references,
      suggestedFollowUps: reply.suggestedFollowUps,
    };
  }

  async function createSession(options?: { useSample?: boolean; prefillPrompt?: string }) {
    setSynthesisStageIndex(0);
    setIsCreatingSession(true);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.append("useSample", options?.useSample ? "true" : "false");

      if (!options?.useSample) {
        files.forEach((file) => formData.append("files", file));
        formData.append("pastedText", pastedText);
      }

      const response = await fetch("/api/intake", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as SessionPayload | { error?: string };

      if (!response.ok || "error" in data) {
        throw new Error((data as { error?: string }).error || "Could not create the live session.");
      }

      const nextSession = data as SessionPayload;
      const introMessage = buildIntroMessage(nextSession);
      const nextMessages = [introMessage];

      setSession(nextSession);
      setMessages(nextMessages);
      setChatInput("");

      if (options?.useSample) {
        setFiles([]);
        setPastedText("");
      }

      scrollToStudio();

      if (options?.prefillPrompt?.trim()) {
        const question = options.prefillPrompt.trim();
        const userMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content: question,
        };
        const historyWithQuestion = [...nextMessages, userMessage];

        setMessages(historyWithQuestion);
        setReplyStageIndex(0);
        setIsReplying(true);

        try {
          const assistantMessage = await requestReply(nextSession, question, historyWithQuestion);
          setMessages([...historyWithQuestion, assistantMessage]);
        } finally {
          setIsReplying(false);
        }
      }
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Something went wrong while preparing the session.",
      );
    } finally {
      setIsCreatingSession(false);
    }
  }

  async function sendMessage(prefill?: string) {
    const question = (prefill ?? chatInput).trim();
    if (!question || !session || isReplying) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setChatInput("");
    setReplyStageIndex(0);
    setIsReplying(true);
    setNotice(null);

    try {
      const assistantMessage = await requestReply(session, question, nextMessages);
      setMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The chat request failed.");
    } finally {
      setIsReplying(false);
    }
  }

  function resetSession() {
    setSession(null);
    setMessages([]);
    setChatInput("");
    setFiles([]);
    setPastedText("");
    setNotice(null);
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-slate-950">
      <div className="mx-auto max-w-7xl px-6 pb-20 pt-6 sm:px-8 lg:px-10">
        <header className="mb-14 flex flex-col gap-4 rounded-[2rem] border border-[var(--border)] bg-white/88 px-5 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:rounded-full sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--blue-strong)] text-white shadow-[0_14px_32px_rgba(24,58,117,0.24)]">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-[0.2em] text-[var(--blue-strong)] uppercase">
                House Voice
              </div>
              <div className="text-sm text-slate-500">
                Company voice prototyping from real source material
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 sm:justify-end">
            {[
              "Session based",
              "Grounded replies",
              "No auth",
            ].map((item) => (
              <span
                key={item}
                className="rounded-full border border-[var(--border)] bg-slate-50 px-3 py-2"
              >
                {item}
              </span>
            ))}
            <button
              type="button"
              onClick={scrollToStudio}
              className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-[var(--blue-strong)] hover:text-[var(--blue-strong)]"
            >
              Open studio
            </button>
          </div>
        </header>

        <section className="py-4">
          <div className="max-w-5xl py-2">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-sm text-slate-600 shadow-[0_8px_20px_rgba(24,58,117,0.06)]">
              <Sparkles className="h-4 w-4 text-[var(--blue-strong)]" />
              Operator-grade company voice synthesis, grounded in the source pack.
            </div>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[1.01] tracking-[-0.05em] text-slate-950 sm:text-6xl">
              Turn company material into a grounded voice prototype that feels demo-ready.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600 sm:text-xl">
              Bring your own company materials first. This session-based prototype synthesizes a working voice profile from the source pack, then lets you test grounded replies against the same material.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={scrollToStudio}
                className="inline-flex items-center justify-center rounded-full bg-[var(--blue-strong)] px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_44px_rgba(24,58,117,0.24)] transition hover:bg-[var(--blue-deep)]"
              >
                Bring my own materials
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void createSession({ useSample: true })}
                disabled={isCreatingSession}
                className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition hover:border-[var(--blue-strong)] hover:text-[var(--blue-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreatingSession ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Try example case
              </button>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-500">
              Need a quick walkthrough first? The example case is still available, but it stays secondary to the main bring-your-own-materials flow.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {HERO_POINTS.map((point) => (
                <div
                  key={point.step}
                  className="rounded-3xl border border-[var(--border)] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.04)]"
                >
                  <div className="mb-3 text-sm font-semibold text-[var(--blue-strong)]">
                    {point.step}
                  </div>
                  <div className="text-base font-semibold text-slate-900">{point.title}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{point.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="studio" className="mt-20 grid gap-8 lg:grid-cols-[0.94fr_1.06fr]">
          <div className="space-y-6">

            <div className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold tracking-[0.18em] text-[var(--blue-strong)] uppercase">
                    Bring your own materials
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                    Upload PDFs or paste company writing
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Use decks, brand guidelines, founder notes, customer emails, internal explainers, or support macros. Everything here stays scoped to this live session.
                  </p>
                </div>
                <div className="rounded-full border border-[var(--border)] bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Session only
                </div>
              </div>

              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  onFilesSelected(Array.from(event.dataTransfer.files));
                }}
                className={`mt-6 rounded-[1.6rem] border border-dashed p-6 text-center transition ${
                  isDragging
                    ? "border-[var(--blue-strong)] bg-[rgba(239,244,251,0.95)]"
                    : "border-[var(--border)] bg-[var(--surface-muted)]"
                }`}
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[var(--blue-strong)] shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                  <Upload className="h-6 w-6" />
                </div>
                <div className="mt-4 text-lg font-semibold text-slate-900">
                  Drop PDFs here
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Multi-file upload is supported. The extractor reads text from each PDF and folds it into the current voice session.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-[var(--blue-strong)] hover:text-[var(--blue-strong)]"
                >
                  Choose PDFs
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  className="hidden"
                  onChange={(event) => onFilesSelected(Array.from(event.target.files ?? []))}
                />
              </div>

              {files.length > 0 && (
                <div className="mt-4 rounded-[1.5rem] border border-[var(--border)] bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">
                      {files.length} PDF{files.length === 1 ? "" : "s"} loaded
                    </div>
                    <button
                      type="button"
                      onClick={() => setFiles([])}
                      className="text-sm font-medium text-slate-500 transition hover:text-slate-800"
                    >
                      Clear files
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {files.map((file) => (
                      <span
                        key={`${file.name}-${file.size}`}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        <FileText className="h-4 w-4 text-[var(--blue-strong)]" />
                        {file.name}
                        <button
                          type="button"
                          onClick={() => removeFile(file)}
                          className="ml-1 text-slate-400 transition hover:text-slate-700"
                          aria-label={`Remove ${file.name}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 rounded-[1.6rem] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(239,244,251,0.78),rgba(255,255,255,0.98))] p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Optional example case
                    </div>
                    <div className="mt-2 text-lg font-semibold tracking-[-0.02em] text-slate-950">
                      {EXAMPLE_CASE.companyName}
                    </div>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      {EXAMPLE_CASE.headline} Use it if you want an immediate demo before loading your own source pack.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void createSession({ useSample: true })}
                    disabled={isCreatingSession}
                    className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-[var(--blue-strong)] hover:text-[var(--blue-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCreatingSession ? (
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    Try example case
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {EXAMPLE_CASE.sourceLabels.map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-white bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">Paste writing samples</div>
                  <div className="text-xs text-slate-500">
                    Useful for emails, founder notes, brand language, and support replies
                  </div>
                </div>
                <textarea
                  value={pastedText}
                  onChange={(event) => setPastedText(event.target.value)}
                  placeholder={`Paste company-side writing here. Good inputs include:\n\n• product or positioning copy\n• founder letters or memos\n• sales emails\n• support macros\n• investor or board language`}
                  className="min-h-56 w-full rounded-[1.5rem] border border-[var(--border)] bg-white px-5 py-4 text-sm leading-7 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[var(--blue-strong)]"
                />
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xl text-sm leading-6 text-slate-500">
                  {isCreatingSession ? SYNTHESIS_STAGES[synthesisStageIndex] : toneNote(session?.mode ?? null)}
                </p>
                <button
                  type="button"
                  disabled={!hasInputs || isCreatingSession}
                  onClick={() => void createSession()}
                  className="inline-flex items-center justify-center rounded-full bg-[var(--blue-strong)] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(24,58,117,0.2)] transition hover:bg-[var(--blue-deep)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCreatingSession ? (
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Synthesize voice and open chat
                </button>
              </div>

              {notice && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {notice}
                </div>
              )}
            </div>

            {session && (
              <div className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold tracking-[0.18em] text-[var(--blue-strong)] uppercase">
                      Synthesis summary
                    </div>
                    <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                      {session.persona.companyName}
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      {session.persona.voiceSummary}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Pill>{session.mode === "live" ? "Live model" : "Fallback mode"}</Pill>
                    <Pill>{isSampleSession ? "Example case" : "Custom source pack"}</Pill>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <SummaryStat label="Sources" value={String(session.materials.length)} />
                  <SummaryStat label="Grounded chunks" value={String(session.chunks.length)} />
                  <SummaryStat
                    label="Session type"
                    value={isSampleSession ? "Guided sample" : "Uploaded materials"}
                  />
                </div>

                <div className="mt-5 rounded-[1.6rem] border border-[var(--border)] bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">Source pack</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {session.materials.map((material) => (
                      <span
                        key={material.id}
                        className="rounded-full border border-white bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm"
                      >
                        {material.label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <MetricGroup title="Key traits" items={session.persona.keyTraits} />
                  <MetricGroup title="Knowledge domains" items={session.persona.knowledgeDomains} />
                  <MetricGroup title="Tone descriptors" items={session.persona.toneDescriptors} />
                  <MetricGroup title="Writing directives" items={session.persona.writingDirectives} />
                </div>

                <div className="mt-5 rounded-[1.6rem] bg-[var(--surface-muted)] p-4 text-sm leading-6 text-slate-700">
                  <span className="font-semibold text-slate-900">Knowledge summary. </span>
                  {session.persona.knowledgeSummary}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-semibold tracking-[0.18em] text-[var(--blue-strong)] uppercase">
                    Grounded voice session
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                    {session
                      ? `Chat with ${session.persona.companyName}`
                      : "The live voice session appears here"}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    Ask for positioning, support replies, investor language, internal explanation, or prospect-facing writing. Replies stay tied to the current session and surface source grounding underneath.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={resetSession}
                    disabled={!session && !files.length && !pastedText}
                    className="inline-flex items-center rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Reset all
                  </button>
                  <button
                    type="button"
                    disabled={!session}
                    onClick={() => {
                      setSession(null);
                      setMessages([]);
                      setChatInput("");
                      scrollToStudio();
                    }}
                    className="inline-flex items-center rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Replace materials
                  </button>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={isReplying || isCreatingSession}
                    onClick={() => {
                      if (!session) {
                        void createSession({ useSample: true, prefillPrompt: prompt });
                        return;
                      }
                      void sendMessage(prompt);
                    }}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition hover:border-[var(--blue-strong)] hover:bg-white hover:text-[var(--blue-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <div className="mt-6 space-y-4 rounded-[1.7rem] bg-[var(--surface-muted)] p-4">
                {messages.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--blue-strong)]">
                      <MessageSquareText className="h-5 w-5" />
                    </div>
                    <div className="mt-4 text-lg font-semibold text-slate-900">
                      Bring in a source pack to open the grounded chat session.
                    </div>
                    <p className="mt-2 mx-auto max-w-xl text-sm leading-6 text-slate-500">
                      Upload your own material to test the core workflow. If you only want a quick walkthrough, the example case is still available as a secondary path.
                    </p>
                    <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={scrollToStudio}
                        className="inline-flex items-center justify-center rounded-full bg-[var(--blue-strong)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--blue-deep)]"
                      >
                        Go to inputs
                      </button>
                      <button
                        type="button"
                        onClick={() => void createSession({ useSample: true })}
                        disabled={isCreatingSession}
                        className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-[var(--blue-strong)] hover:text-[var(--blue-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isCreatingSession ? (
                          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 h-4 w-4" />
                        )}
                        Try example case
                      </button>
                    </div>
                  </div>
                ) : (
                  messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      onFollowUp={(prompt) => void sendMessage(prompt)}
                      disabled={isReplying}
                    />
                  ))
                )}

                {isReplying && (
                  <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">
                    <LoaderCircle className="h-4 w-4 animate-spin text-[var(--blue-strong)]" />
                    {REPLY_STAGES[replyStageIndex]}
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="mt-5 rounded-[1.7rem] border border-[var(--border)] bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <textarea
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder={
                    session
                      ? "Ask for a rewrite, positioning answer, support reply, or investor-facing explanation."
                      : "Load a session to unlock the grounded chat composer."
                  }
                  disabled={!session || isReplying}
                  className="min-h-28 w-full resize-none border-0 bg-transparent px-2 py-2 text-sm leading-7 text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
                />
                <div className="flex flex-col gap-3 border-t border-[var(--border)] px-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="inline-flex items-center gap-2 text-xs text-slate-500">
                    <ShieldCheck className="h-4 w-4 text-[var(--blue-strong)]" />
                    {session ? toneNote(session.mode) : "Shift + Enter for a new line once chat is active."}
                  </div>
                  <button
                    type="button"
                    onClick={() => void sendMessage()}
                    disabled={!session || !chatInput.trim() || isReplying}
                    className="rounded-full bg-[var(--blue-strong)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--blue-deep)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <div className="text-sm font-semibold tracking-[0.18em] text-[var(--blue-strong)] uppercase">
                Product framing
              </div>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                Built to demonstrate company voice prototyping, not a generic chat shell
              </h3>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {[
                  [
                    "Grounded persona synthesis",
                    "The app derives tone, traits, directives, and knowledge domains from the session source pack.",
                  ],
                  [
                    "Truthful product language",
                    "It does not imply fine-tuning, persistence, accounts, or hidden product infrastructure that is not present.",
                  ],
                  [
                    "Useful operator prompts",
                    "The best prompts are practical: sales replies, support language, internal explainers, positioning, and investor tone.",
                  ],
                  [
                    "Low-friction demo path",
                    "A polished example case makes the whole flow testable in seconds without uploads or setup.",
                  ],
                ].map(([title, copy]) => (
                  <div key={title} className="rounded-2xl bg-[var(--surface-muted)] p-4">
                    <div className="text-base font-semibold text-slate-900">{title}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-slate-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{value}</div>
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--blue-strong)]">
      {children}
    </span>
  );
}

function MetricGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[1.5rem] border border-[var(--border)] bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full border border-white bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onFollowUp,
  disabled,
}: {
  message: ChatMessage;
  onFollowUp: (prompt: string) => void;
  disabled: boolean;
}) {
  const isAssistant = message.role === "assistant";

  return (
    <div
      className={`rounded-[1.5rem] px-4 py-4 shadow-sm ${
        isAssistant ? "bg-white" : "bg-[var(--blue-strong)] text-white"
      }`}
    >
      <div
        className={`mb-2 text-xs font-semibold uppercase tracking-[0.16em] ${
          isAssistant ? "text-slate-500" : "text-white/70"
        }`}
      >
        {isAssistant ? "Grounded reply" : "Prompt"}
      </div>
      <div
        className={`whitespace-pre-wrap text-sm leading-7 ${
          isAssistant ? "text-slate-800" : "text-white"
        }`}
      >
        {message.content}
      </div>
      {isAssistant && message.references && message.references.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {message.references.map((reference) => (
            <SourceChip key={reference.chunkId} reference={reference} />
          ))}
        </div>
      )}
      {isAssistant && message.suggestedFollowUps && message.suggestedFollowUps.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {message.suggestedFollowUps.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onFollowUp(prompt)}
              disabled={disabled}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-[var(--blue-strong)] hover:bg-white hover:text-[var(--blue-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceChip({ reference }: { reference: SourceReference }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
      <div className="font-semibold text-slate-900">{reference.sourceLabel}</div>
      <div className="mt-1 max-w-[18rem]">{reference.quote}</div>
    </div>
  );
}
