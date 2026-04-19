"use client";

import { useMemo, useRef, useState } from "react";
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

import { rankChunks } from "@/lib/text";
import type {
  ChatMessage,
  ChatResponsePayload,
  SessionPayload,
  SourceReference,
} from "@/lib/types";

function toneNote(mode: SessionPayload["mode"] | ChatResponsePayload["mode"] | null) {
  if (mode === "live") {
    return "Gemini is generating the persona and answers for this session.";
  }

  if (mode === "demo") {
    return "Local demo fallback is active. Add a Gemini API key for live model responses.";
  }

  return "Upload material, paste writing, or load the sample company to start.";
}

export function HouseVoiceApp() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState("");
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isReplying, setIsReplying] = useState(false);

  const hasInputs = files.length > 0 || pastedText.trim().length > 0;

  const suggestedPrompts = useMemo(() => {
    return session?.persona.suggestedPrompts ?? [
      "How would this company describe its value proposition?",
      "Write a customer support reply in this voice.",
      "Summarize our investor tone.",
      "Answer like our company talking to a prospect.",
    ];
  }, [session]);

  function scrollToStudio() {
    document.getElementById("studio")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onFilesSelected(nextFiles: File[]) {
    const pdfs = nextFiles.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));

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

  async function createSession(options?: { useSample?: boolean }) {
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
        throw new Error((data as { error?: string }).error || "Could not create the demo session.");
      }

      const nextSession = data as SessionPayload;
      setSession(nextSession);
      const possessiveName = nextSession.persona.companyName.endsWith("s")
        ? `${nextSession.persona.companyName}'`
        : `${nextSession.persona.companyName}'s`;

      setMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Ready. I synthesized ${possessiveName} voice from the current materials. Ask about positioning, support language, investor tone, or request a reply written in this style.`,
        },
      ]);
      setChatInput("");

      if (options?.useSample) {
        setFiles([]);
        setPastedText("");
      }

      scrollToStudio();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong while preparing the session.");
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
    setIsReplying(true);
    setNotice(null);

    try {
      const selectedChunks = rankChunks(question, session.chunks, 4);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          persona: session.persona,
          selectedChunks,
          history: nextMessages,
        }),
      });

      const data = (await response.json()) as ChatResponsePayload | { error?: string };

      if (!response.ok || "error" in data) {
        throw new Error((data as { error?: string }).error || "The chat request failed.");
      }

      const reply = data as ChatResponsePayload;
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: reply.answer,
          references: reply.references,
        },
      ]);
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
        <header className="mb-14 flex items-center justify-between rounded-full border border-[var(--border)] bg-white/90 px-5 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--blue-strong)] text-white shadow-[0_12px_30px_rgba(24,58,117,0.24)]">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-[0.18em] text-[var(--blue-strong)] uppercase">House Voice</div>
              <div className="text-sm text-slate-500">Company materials into a live AI persona demo</div>
            </div>
          </div>
          <button
            type="button"
            onClick={scrollToStudio}
            className="hidden rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-[var(--blue-strong)] hover:text-[var(--blue-strong)] sm:inline-flex"
          >
            Open demo studio
          </button>
        </header>

        <section className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-sm text-slate-600">
              <Sparkles className="h-4 w-4 text-[var(--blue-strong)]" />
              Grounded in your materials. Shaped by your voice.
            </div>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-[-0.04em] text-slate-950 sm:text-6xl">
              Turn company materials into a live AI persona demo.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
              Upload PDFs, paste writing, and instantly test how your company sounds as a chatbot. This is a fast, session-based prototype for voice and knowledge grounding, not a production platform.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => createSession({ useSample: true })}
                className="inline-flex items-center justify-center rounded-full bg-[var(--blue-strong)] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(24,58,117,0.24)] transition hover:bg-[var(--blue-deep)]"
              >
                {isCreatingSession ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Try sample
              </button>
              <button
                type="button"
                onClick={scrollToStudio}
                className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition hover:border-[var(--blue-strong)] hover:text-[var(--blue-strong)]"
              >
                Upload files / Start demo
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </button>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                ["1", "Bring the real inputs", "Upload decks, brand docs, letters, and operating materials."],
                ["2", "Extract the voice", "Synthesize tone, positioning, and knowledge domains."],
                ["3", "Test the chatbot", "Ask questions, generate replies, and inspect source grounding."],
              ].map(([step, title, copy]) => (
                <div key={step} className="rounded-3xl border border-[var(--border)] bg-white p-5 shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
                  <div className="mb-3 text-sm font-semibold text-[var(--blue-strong)]">0{step}</div>
                  <div className="text-base font-semibold text-slate-900">{title}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold tracking-[0.18em] text-[var(--blue-strong)] uppercase">Live demo flow</div>
                <div className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Built for a five-minute executive demo</div>
              </div>
              <MessageSquareText className="h-9 w-9 text-[var(--blue-strong)]" />
            </div>
            <div className="mt-6 space-y-4">
              {[
                "Drop in an earnings deck, founder letter, or sales email sequence.",
                "Generate a compact persona profile and a grounded knowledge base.",
                "Ask the bot to explain the value proposition, write a support reply, or answer like the company talking to a prospect.",
              ].map((item) => (
                <div key={item} className="rounded-2xl bg-[var(--surface-muted)] px-4 py-4 text-sm leading-6 text-slate-700">
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-2xl border border-[var(--border)] bg-slate-50 p-4">
              <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">Suggested prompts</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  "How would this company describe its value proposition?",
                  "Write a customer support reply in this voice",
                  "Summarize our investor tone",
                ].map((prompt) => (
                  <span key={prompt} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                    {prompt}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="studio" className="mt-20 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold tracking-[0.18em] text-[var(--blue-strong)] uppercase">Input panel</div>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Upload materials or paste writing</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Bring earnings decks, brand guidelines, sales emails, founder letters, blog posts, or leadership notes. This is a live session demo, resettable at any time.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => createSession({ useSample: true })}
                  className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-[var(--blue-strong)] hover:text-[var(--blue-strong)]"
                >
                  Try sample company
                </button>
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
                    ? "border-[var(--blue-strong)] bg-[var(--surface-muted)]"
                    : "border-[var(--border)] bg-[var(--surface-muted)]"
                }`}
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[var(--blue-strong)] shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                  <Upload className="h-6 w-6" />
                </div>
                <div className="mt-4 text-lg font-semibold text-slate-900">Drag and drop PDFs here</div>
                <p className="mt-2 text-sm text-slate-600">Multi-file upload supported. We will extract text and use it only for the current demo session.</p>
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
                <div className="mt-4 flex flex-wrap gap-2">
                  {files.map((file) => (
                    <span key={`${file.name}-${file.size}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <FileText className="h-4 w-4 text-[var(--blue-strong)]" />
                      {file.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-6">
                <div className="mb-3 text-sm font-semibold text-slate-900">Paste writing samples</div>
                <textarea
                  value={pastedText}
                  onChange={(event) => setPastedText(event.target.value)}
                  placeholder={`Paste brand copy, sales emails, investor language, founder notes, blog posts, or support macros here.\n\nHelpful inputs:\n- earnings deck summary\n- brand guidelines\n- sales email sequence\n- founder letter\n- product announcement`} 
                  className="min-h-56 w-full rounded-[1.5rem] border border-[var(--border)] bg-white px-5 py-4 text-sm leading-7 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[var(--blue-strong)]"
                />
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-6 text-slate-500">
                  {toneNote(session?.mode ?? null)}
                </p>
                <button
                  type="button"
                  disabled={!hasInputs || isCreatingSession}
                  onClick={() => createSession()}
                  className="inline-flex items-center justify-center rounded-full bg-[var(--blue-strong)] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(24,58,117,0.2)] transition hover:bg-[var(--blue-deep)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCreatingSession ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Extract voice and start demo
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
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold tracking-[0.18em] text-[var(--blue-strong)] uppercase">Persona synthesis</div>
                    <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{session.persona.companyName}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{session.persona.voiceSummary}</p>
                  </div>
                  <span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--blue-strong)]">
                    {session.mode === "live" ? "Gemini live" : "Demo fallback"}
                  </span>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <MetricGroup title="Key traits" items={session.persona.keyTraits} />
                  <MetricGroup title="Knowledge domains" items={session.persona.knowledgeDomains} />
                  <MetricGroup title="Tone descriptors" items={session.persona.toneDescriptors} />
                  <MetricGroup title="Writing directives" items={session.persona.writingDirectives} />
                </div>

                <div className="mt-5 rounded-2xl bg-[var(--surface-muted)] p-4 text-sm leading-6 text-slate-700">
                  <span className="font-semibold text-slate-900">Knowledge summary. </span>
                  {session.persona.knowledgeSummary}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] lg:sticky lg:top-6">
              <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-semibold tracking-[0.18em] text-[var(--blue-strong)] uppercase">Live chatbot</div>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                    {session ? `Chat with ${session.persona.companyName}` : "Your grounded demo bot appears here"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Use the suggested prompts or ask your own question. Answers stay close to the uploaded material and show lightweight source grounding.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={resetSession}
                    className="inline-flex items-center rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Reset session
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSession(null);
                      setMessages([]);
                      setChatInput("");
                      scrollToStudio();
                    }}
                    className="inline-flex items-center rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
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
                    disabled={!session || isReplying}
                    onClick={() => void sendMessage(prompt)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition hover:border-[var(--blue-strong)] hover:bg-white hover:text-[var(--blue-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <div className="mt-6 space-y-4 rounded-[1.7rem] bg-[var(--surface-muted)] p-4">
                {messages.length === 0 ? (
                  <div className="rounded-[1.4rem] border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm leading-6 text-slate-500">
                    Try the sample company or load your own materials, then the chat will become live immediately.
                  </div>
                ) : (
                  messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))
                )}

                {isReplying && (
                  <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">
                    <LoaderCircle className="h-4 w-4 animate-spin text-[var(--blue-strong)]" />
                    Generating reply
                  </div>
                )}
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
                  placeholder={session ? "Ask the company bot a question…" : "Start a demo session to unlock chat."}
                  disabled={!session || isReplying}
                  className="min-h-28 w-full resize-none border-0 bg-transparent px-2 py-2 text-sm leading-7 text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
                />
                <div className="flex items-center justify-between border-t border-[var(--border)] px-2 pt-3">
                  <div className="inline-flex items-center gap-2 text-xs text-slate-500">
                    <ShieldCheck className="h-4 w-4 text-[var(--blue-strong)]" />
                    {toneNote(session?.mode ?? null)}
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
              <div className="text-sm font-semibold tracking-[0.18em] text-[var(--blue-strong)] uppercase">How it works</div>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">A practical prototype, not a generic RAG toy</h3>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {[
                  ["Upload docs or paste writing", "Bring company-side material that already exists."],
                  ["Extract voice + knowledge", "Synthesize tone, traits, and likely domains from the source set."],
                  ["Create a live grounded demo", "Generate answers using the persona plus retrieved source chunks."],
                  ["Useful for real operator work", "Sales enablement, support pilots, internal assistants, brand voice exploration, and investor communications."],
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

function MetricGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-full border border-white bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isAssistant = message.role === "assistant";

  return (
    <div className={`rounded-[1.5rem] px-4 py-4 shadow-sm ${isAssistant ? "bg-white" : "bg-[var(--blue-strong)] text-white"}`}>
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {isAssistant ? "Assistant" : "You"}
      </div>
      <div className={`whitespace-pre-wrap text-sm leading-7 ${isAssistant ? "text-slate-800" : "text-white"}`}>
        {message.content}
      </div>
      {isAssistant && message.references && message.references.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {message.references.map((reference) => (
            <SourceChip key={reference.chunkId} reference={reference} />
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
