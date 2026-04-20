"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
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
} from "@/lib/types";

const HERO_POINTS = [
  {
    step: "01",
    title: "Bring a source pack",
    copy: "Upload PDFs and paste the writing that already defines how the company presents itself.",
  },
  {
    step: "02",
    title: "Distill the company persona",
    copy: "Pull out tone, positioning, directives, and knowledge shape from the materials in this session.",
  },
  {
    step: "03",
    title: "Run the chat demo",
    copy: "Test realistic prompts and inspect the source grounding that supports each answer.",
  },
];

const MATERIAL_FLOW_STEPS = [
  {
    step: "01",
    title: "Ingest materials",
    copy: "PDFs and pasted writing enter one live session.",
    Icon: Upload,
  },
  {
    step: "02",
    title: "Distill company persona",
    copy: "Tone, posture, and directives are synthesized from the source pack.",
    Icon: Sparkles,
  },
  {
    step: "03",
    title: "Launch grounded chat",
    copy: "The session opens a source-backed company chat you can pressure test immediately.",
    Icon: MessageSquareText,
  },
];

const SYNTHESIS_STAGES = [
  "Reading source materials",
  "Distilling company persona and operating posture",
  "Preparing the grounded chat demo",
];

const INITIAL_PROMPTS = [
  "Summarize the value proposition in the company's style.",
  "Draft a measured follow-up email after a product demo.",
  "What investor-facing tone comes through in the material?",
];

const REPLY_STAGES = [
  "Selecting the strongest source excerpts",
  "Drafting in the grounded company persona",
  "Checking the answer against session context",
];

function toneNote(mode: SessionPayload["mode"] | ChatResponsePayload["mode"] | null) {
  if (mode === "live") {
    return "Live model, grounded to the current session.";
  }

  if (mode === "demo") {
    return "Fallback mode, still grounded to the current session.";
  }

  return "Session based only.";
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
      return latestSuggestions.slice(0, 2);
    }

    return (session?.persona.suggestedPrompts?.length
      ? session.persona.suggestedPrompts
      : INITIAL_PROMPTS
    ).slice(0, 2);
  }, [messages, session]);

  const personaHighlights = useMemo(() => {
    if (!session) return [];

    return Array.from(
      new Set([
        ...session.persona.keyTraits,
        ...session.persona.toneDescriptors,
        ...session.persona.writingDirectives,
      ]),
    ).slice(0, 8);
  }, [session]);

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

  function scrollToChatDemo() {
    window.requestAnimationFrame(() => {
      document.getElementById("chat-demo")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
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
      const nextMessages: ChatMessage[] = [];

      setSession(nextSession);
      setMessages(nextMessages);
      setChatInput("");

      if (options?.useSample) {
        setFiles([]);
        setPastedText("");
      }

      scrollToChatDemo();

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
        <section className="pb-1 pt-4">
          <div className="grid max-w-6xl gap-8 py-1 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-10">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-sm text-slate-600 shadow-[0_8px_20px_rgba(24,58,117,0.06)]">
                <Sparkles className="h-4 w-4 text-[var(--blue-strong)]" />
                Operator-grade company persona demo, grounded in the source pack.
              </div>
              <h1 className="max-w-4xl text-5xl font-semibold leading-[1.01] tracking-[-0.05em] text-slate-950 sm:text-6xl">
                Turn company material into a grounded company chat demo that feels immediately real.
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600 sm:text-xl">
                Bring your own company materials first. This session-based prototype distills a grounded company persona from the source pack, then lets you test it live in chat.
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
            </div>

            <div className="space-y-3 lg:pt-1">
              {HERO_POINTS.map((point) => (
                <div
                  key={point.step}
                  className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_14px_36px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="text-[var(--blue-strong)]">{point.step}.</span>
                    <span>{point.title}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{point.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="studio" className="-mt-1 max-w-6xl space-y-6">
          <div className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-semibold tracking-[0.18em] text-[var(--blue-strong)] uppercase">
                  Bring your own materials
                </div>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                  Upload PDFs or add company material
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  Use decks, brand guidelines, founder notes, customer emails, internal explainers, support macros, or compact pasted writing. Everything here stays scoped to this session.
                </p>
              </div>
              <div className="rounded-full border border-[var(--border)] bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Session only
              </div>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-[1.14fr_0.86fr] lg:items-stretch">
              <div className="space-y-5">
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
                  className={`rounded-[1.6rem] border border-dashed p-5 text-center transition ${
                    isDragging
                      ? "border-[var(--blue-strong)] bg-[rgba(239,244,251,0.95)]"
                      : "border-[var(--border)] bg-[var(--surface-muted)]"
                  }`}
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[var(--blue-strong)] shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div className="mt-3 text-base font-semibold text-slate-900">Drop PDFs here</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Multi-file upload is supported. The extractor reads text from each PDF and folds it into the current session.
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-[var(--blue-strong)] hover:text-[var(--blue-strong)]"
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
                  <div className="rounded-[1.5rem] border border-[var(--border)] bg-slate-50 p-4">
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

                <div className="rounded-[1.6rem] border border-[var(--border)] bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">Optional pasted material</div>
                    <div className="text-xs text-slate-500">For short writing samples</div>
                  </div>
                  <textarea
                    value={pastedText}
                    onChange={(event) => setPastedText(event.target.value)}
                    placeholder="Paste a short company excerpt, email, memo, or brand note."
                    className="mt-3 min-h-32 w-full rounded-[1.2rem] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm leading-7 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[var(--blue-strong)]"
                  />
                </div>

                <div className="rounded-[1.6rem] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(239,244,251,0.78),rgba(255,255,255,0.98))] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Optional example case
                      </div>
                      <div className="mt-1.5 text-base font-semibold tracking-[-0.02em] text-slate-950">
                        {EXAMPLE_CASE.companyName}
                      </div>
                      <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">
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
                </div>
              </div>

              <div className="h-full">
                <div className="flex h-full flex-col space-y-3 rounded-[1.6rem] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(239,244,251,0.78),rgba(255,255,255,0.96))] p-5">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Agentic flow
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {isCreatingSession
                        ? SYNTHESIS_STAGES[synthesisStageIndex]
                        : session
                          ? "Chat live"
                          : "Session scoped"}
                    </div>
                  </div>

                  {MATERIAL_FLOW_STEPS.map(({ step, title, copy, Icon }) => {
                    const isActive =
                      (step === "01" && !session && hasInputs && !isCreatingSession) ||
                      (step === "02" && isCreatingSession) ||
                      (step === "03" && !!session);

                    return (
                      <div
                        key={step}
                        className={`flex-1 rounded-[1.35rem] border p-3.5 transition ${
                          isActive
                            ? "border-[rgba(24,58,117,0.18)] bg-white shadow-[0_14px_34px_rgba(24,58,117,0.08)]"
                            : "border-[var(--border)] bg-white/78"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-muted)] text-[var(--blue-strong)]">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                              {step}
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-900">
                              {title}
                            </div>
                            <p className="mt-1 text-xs leading-5 text-slate-500">{copy}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {notice && (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {notice}
              </div>
            )}
          </div>

          <div
            id="chat-demo"
            className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-[0_22px_56px_rgba(15,23,42,0.08)]"
          >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-sm font-semibold tracking-[0.18em] text-[var(--blue-strong)] uppercase">
                    Grounded company chat
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                    {session
                      ? `Chat with ${session.persona.companyName}`
                      : "The chat opens here"}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    {session
                      ? "Ask directly. The conversation stays grounded in the current session materials."
                      : "Load a source pack, then start the conversation here."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!session && hasInputs && (
                    <button
                      type="button"
                      disabled={isCreatingSession}
                      onClick={() => void createSession()}
                      className="inline-flex items-center rounded-full bg-[var(--blue-strong)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--blue-deep)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isCreatingSession ? (
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      Launch grounded chat
                    </button>
                  )}
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

              <div className="mt-6 overflow-hidden rounded-[1.8rem] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(239,244,251,0.74),rgba(252,253,255,0.98))]">
                <div className="flex flex-col gap-4 border-b border-[var(--border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[var(--blue-strong)] shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                      <MessageSquareText className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-base font-semibold text-slate-950">
                        {session ? `${session.persona.companyName} chat` : "Grounded chat"}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {session
                          ? `${session.materials.length} source${session.materials.length === 1 ? "" : "s"} in scope, with visible grounding on every answer.`
                          : "Session-based answers grounded in PDFs and pasted material."}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <CompactTag>{session ? (session.mode === "live" ? "Live model" : "Local fallback") : "Session based"}</CompactTag>
                    <CompactTag>{session ? `${session.chunks.length} excerpts` : "No persistence"}</CompactTag>
                    {session && <CompactTag>No fine-tuning</CompactTag>}
                  </div>
                </div>

                {session && (
                  <div className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-6">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Suggested prompts
                    </div>
                    <div className="flex flex-wrap gap-2">
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
                          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-[var(--blue-strong)] hover:text-[var(--blue-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {(messages.length > 0 || isReplying || !session) && (
                  <div
                    className={`space-y-4 bg-[rgba(252,253,255,0.82)] px-4 py-4 sm:px-6 sm:py-4 ${
                      messages.length > 0 || isReplying ? "min-h-[14rem]" : "min-h-[4.5rem]"
                    }`}
                  >
                    {messages.length > 0 && (
                      messages.map((message) => <MessageBubble key={message.id} message={message} />)
                    )}

                    {isReplying && (
                      <div className="flex justify-start">
                        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">
                          <LoaderCircle className="h-4 w-4 animate-spin text-[var(--blue-strong)]" />
                          {REPLY_STAGES[replyStageIndex]}
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}

                <div className={`${session && messages.length === 0 && !isReplying ? "" : "border-t border-[var(--border)]"} bg-white/88 px-4 py-4 sm:px-6`}>
                  <div className="rounded-[1.5rem] border border-[var(--border)] bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
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
                          ? "Ask about positioning, sales replies, support language, or internal narratives."
                          : "Load a session to unlock the grounded composer."
                      }
                      disabled={!session || isReplying}
                      className="min-h-28 w-full resize-none border-0 bg-transparent px-2 py-2 text-sm leading-7 text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
                    />
                    <div className="flex flex-col gap-3 border-t border-[var(--border)] px-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="inline-flex items-center gap-2 text-xs text-slate-500">
                        <ShieldCheck className="h-4 w-4 text-[var(--blue-strong)]" />
                        {session
                          ? `${toneNote(session.mode)} ${session.materials.length} source${session.materials.length === 1 ? "" : "s"} currently in scope.`
                          : "Shift + Enter adds a new line once chat is active."}
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
              </div>
          </div>

          {session && (
            <div className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <div className="grid gap-6 lg:grid-cols-[1.12fr_0.88fr] lg:items-start">
                <div>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold tracking-[0.18em] text-[var(--blue-strong)] uppercase">
                        Company persona
                      </div>
                      <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                        {session.persona.companyName}
                      </h3>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                        {session.persona.voiceSummary}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Pill>{session.mode === "live" ? "Live model" : "Fallback mode"}</Pill>
                      <Pill>{isSampleSession ? "Example case" : "Custom source pack"}</Pill>
                    </div>
                  </div>

                  <div className="mt-5 rounded-[1.6rem] border border-[var(--border)] bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                    <span className="font-semibold text-slate-900">Session snapshot. </span>
                    Grounded to {session.materials.length} source{session.materials.length === 1 ? "" : "s"} and {session.chunks.length} retrieved excerpt{session.chunks.length === 1 ? "" : "s"} in this session. No fine-tuning or saved company profile.
                  </div>

                  <div className="mt-5 rounded-[1.6rem] border border-[var(--border)] bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-900">What carries through</div>
                      <div className="text-xs text-slate-500">Compact summary</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {personaHighlights.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.6rem] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">Source pack</div>
                    <div className="text-xs text-slate-500">{session.materials.length} items</div>
                  </div>
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
              </div>
            </div>
          )}
        </section>
      </div>
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

function CompactTag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
      {children}
    </span>
  );
}

function MessageBubble({
  message,
}: {
  message: ChatMessage;
}) {
  const isAssistant = message.role === "assistant";
  const groundingLabels =
    isAssistant && message.references?.length
      ? Array.from(new Set(message.references.map((reference) => reference.sourceLabel)))
      : [];

  return (
    <div className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[88%] rounded-[1.5rem] border px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)] ${
          isAssistant
            ? "border-white/80 bg-white text-slate-900"
            : "border-[var(--blue-strong)] bg-[var(--blue-strong)] text-white"
        }`}
      >
        <div
          className={`whitespace-pre-wrap text-[15px] leading-7 ${
            isAssistant ? "text-slate-800" : "text-white"
          }`}
        >
          {message.content}
        </div>
        {isAssistant && groundingLabels.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span>Grounded in</span>
            {groundingLabels.slice(0, 2).map((label) => (
              <SourceChip key={label} label={label} />
            ))}
            {groundingLabels.length > 2 && (
              <span className="rounded-full border border-slate-200/80 bg-slate-50/80 px-2.5 py-1 text-[11px] text-slate-400">
                +{groundingLabels.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-slate-200/80 bg-slate-50/80 px-2.5 py-1 text-[11px] text-slate-500">
      {label}
    </span>
  );
}
