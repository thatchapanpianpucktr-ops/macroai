"use client";

import { useEffect, useRef, useState } from "react";
import { downscale } from "@/lib/image";
import { useApiKey, useSettings } from "@/lib/store";
import { openApiKeyPrompt } from "@/lib/apikey-prompt";
import type { ChatMessage } from "@/lib/types";

export type ChatItem = {
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export function ChatPanel({
  open,
  onClose,
  title = "Discuss with AI",
  kind,
  items,
  images = [],
  allowPhoto = false,
  reasoning,
  messages,
  onMessagesChange,
  onApplyItems,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  kind: "scan" | "item";
  /** current draft items, sent as context each turn */
  items: ChatItem[];
  /** meal photos for context (full-res base64) */
  images?: { base64: string; mimeType: string }[];
  /** allow attaching photos in-chat (e.g. leftovers) */
  allowPhoto?: boolean;
  /** the model's original reasoning, so it can explain its logic on request */
  reasoning?: string;
  messages: ChatMessage[];
  onMessagesChange: (msgs: ChatMessage[]) => void;
  /** live-apply the AI's revised numbers to the parent draft */
  onApplyItems: (items: ChatItem[]) => void;
}) {
  const [apiKey] = useApiKey();
  const [settings] = useSettings();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attached, setAttached] = useState<
    { base64: string; mimeType: string; thumb: string }[]
  >([]);
  const photoRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      // jump to the latest message whenever the thread grows
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages, loading, open]);

  if (!open) return null;

  const suggestions: { label: string; prompt: string }[] = [
    {
      label: "🧠 Explain your logic",
      prompt:
        "Explain your logic for logging this — how you identified each item, how you judged the portion sizes, and how you got the calories and macros.",
    },
    {
      label: "🤔 Why these calories?",
      prompt: "Why these calories? Walk me through the numbers.",
    },
    kind === "scan"
      ? { label: "❓ Anything missing?", prompt: "Is anything missing from this meal?" }
      : { label: "🍽️ I ate less", prompt: "I didn't finish all of it — I ate less than this." },
  ];

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const file of files) {
      try {
        const big = await downscale(file, 1536, 0.85);
        const small = await downscale(file, 120, 0.7);
        setAttached((prev) =>
          prev.length >= 4
            ? prev
            : [
                ...prev,
                { base64: big.base64, mimeType: big.mimeType, thumb: small.dataUrl },
              ],
        );
      } catch {
        setError("Couldn't read that photo.");
      }
    }
  }

  async function send(textArg?: string) {
    const fromInput = textArg === undefined;
    const text = (fromInput ? input : textArg).trim();
    if (!text || loading) return;
    if (!apiKey) {
      openApiKeyPrompt();
      return;
    }
    const now = new Date().toISOString();
    const userMsg: ChatMessage = { role: "user", content: text, at: now };
    const next = [...messages, userMsg];
    onMessagesChange(next);
    if (fromInput) setInput("");
    setError(null);
    setLoading(true);

    const sentImages = [
      ...images,
      ...attached.map((a) => ({ base64: a.base64, mimeType: a.mimeType })),
    ];

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          model: settings.geminiModel?.trim() || undefined,
          kind,
          items,
          images: sentImages,
          reasoning,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = (await res.json()) as {
        reply?: string;
        updated?: boolean;
        items?: ChatItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Chat failed");
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.reply || "Okay.",
        at: new Date().toISOString(),
      };
      onMessagesChange([...next, assistantMsg]);
      if (data.updated && Array.isArray(data.items) && data.items.length > 0) {
        onApplyItems(data.items);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      // drop the optimistic user message back into the input so they can retry
      onMessagesChange(messages);
      setInput(text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60">
      <div className="w-full sm:max-w-md h-[80dvh] sm:h-[70vh] flex flex-col card rounded-b-none sm:rounded-2xl p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--surface-2)]">
          <div className="flex items-center gap-2">
            <span className="text-lg">💬</span>
            <h2 className="text-base font-semibold">{title}</h2>
          </div>
          <button className="text-[var(--muted)] text-sm" onClick={onClose}>
            Done
          </button>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto no-scrollbar px-4 py-3 space-y-3"
        >
          {messages.length === 0 && (
            <div className="text-center text-sm text-[var(--muted)] mt-6 px-4">
              Tell the AI what you think — e.g.{" "}
              <span className="text-[var(--foreground)]">
                “the rice looks like too much”
              </span>
              ,{" "}
              <span className="text-[var(--foreground)]">“I only ate half”</span>, or
              ask{" "}
              <span className="text-[var(--foreground)]">“why so many calories?”</span>
              {allowPhoto ? " You can attach a leftovers photo too." : ""}
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className="max-w-[82%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap"
                style={
                  m.role === "user"
                    ? { background: "var(--accent)", color: "#04231a" }
                    : { background: "var(--surface-2)", color: "var(--foreground)" }
                }
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-3 py-2 text-sm bg-[var(--surface-2)] text-[var(--muted)] animate-pulse">
                Thinking…
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 pb-2 text-xs text-[var(--danger)]">{error}</div>
        )}

        {attached.length > 0 && (
          <div className="px-4 pb-2 flex gap-2">
            {attached.map((a, i) => (
              <div key={i} className="relative w-12 h-12">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.thumb}
                  alt={`attachment ${i + 1}`}
                  className="w-full h-full object-cover rounded-lg"
                />
                <button
                  onClick={() =>
                    setAttached((prev) => prev.filter((_, j) => j !== i))
                  }
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/80 text-white text-xs grid place-items-center"
                  aria-label="Remove attachment"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 pt-2 pb-1">
            {suggestions.map((s) => (
              <button
                key={s.label}
                onClick={() => send(s.prompt)}
                className="shrink-0 rounded-full border border-[var(--surface-2)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--foreground)] active:opacity-70"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 px-3 py-3 border-t border-[var(--surface-2)]">
          {allowPhoto && (
            <>
              <input
                ref={photoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPhoto}
              />
              <button
                className="btn btn-ghost px-3 py-2 shrink-0"
                onClick={() => photoRef.current?.click()}
                aria-label="Attach photo"
              >
                📷
              </button>
            </>
          )}
          <input
            className="input flex-1"
            placeholder="Message the AI…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            className="btn btn-primary px-4 py-2 shrink-0 disabled:opacity-50"
            onClick={() => send()}
            disabled={loading || !input.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
