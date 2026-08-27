"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useApiKey,
  useGymChat,
  useGymPlan,
  useSettings,
  useSteps,
  useWeights,
  useWorkouts,
} from "@/lib/store";
import { openApiKeyPrompt } from "@/lib/apikey-prompt";
import {
  buildExerciseMemory,
  compactWorkoutHistory,
  estimateWorkoutKcalLocal,
  normalizeSplit,
} from "@/lib/gym";
import { currentWeight } from "@/lib/tdee";
import { todayYmd } from "@/lib/date";
import type { ChatMessage, SplitTag, WorkoutExercise } from "@/lib/types";
import {
  GymLogPromptSheet,
  type DraftExerciseIn,
} from "@/components/GymLogPromptSheet";

type CoachResponse = {
  reply?: string;
  intent?: string;
  markSkipped?: boolean;
  skippedSplit?: string | null;
  suggestedSplit?: string | null;
  draftExercises?: DraftExerciseIn[];
  estimatedKcal?: number;
  openLogPrompt?: boolean;
  error?: string;
};

const CHIPS = [
  { label: "What today?", text: "What should I do in the gym today based on my plan and history?" },
  {
    label: "I skipped a day",
    text: "I skipped my last planned gym day. What should I do today to get back on track?",
  },
  {
    label: "Log finished workout",
    text: "Done with my workout. I did: ",
  },
  { label: "Progress check", text: "How am I progressing lately? What should I improve?" },
  {
    label: "Add cardio advice",
    text: "Should I add cardio today, and what kind fits my plan?",
  },
];

export function GymCoachChat({
  onSessionSaved,
}: {
  onSessionSaved?: () => void;
}) {
  const [apiKey] = useApiKey();
  const [settings] = useSettings();
  const [plan] = useGymPlan();
  const { workouts, add } = useWorkouts();
  const { weights } = useWeights();
  const tz = settings.timeZone;
  const today = todayYmd(tz);
  const { steps } = useSteps(today);
  const { messages, setMessages, clear } = useGymChat();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [logOpen, setLogOpen] = useState(false);
  const [logSplit, setLogSplit] = useState<SplitTag>("other");
  const [logDrafts, setLogDrafts] = useState<DraftExerciseIn[]>([]);

  const memory = useMemo(() => buildExerciseMemory(workouts), [workouts]);
  const bodyweightKg = currentWeight(weights) ?? 75;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function callCoach(
    nextMessages: ChatMessage[],
    action: string,
    extraContext?: Record<string, unknown>,
  ): Promise<CoachResponse> {
    const res = await fetch("/api/gym", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        model: settings.geminiModel || undefined,
        action,
        messages: nextMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        context: {
          today,
          bodyweightKg,
          plan,
          history: compactWorkoutHistory(workouts, 30),
          exerciseMemory: memory,
          stepsToday: steps,
          ...extraContext,
        },
      }),
    });
    const data = (await res.json()) as CoachResponse;
    if (!res.ok) throw new Error(data.error || "Coach request failed");
    return data;
  }

  async function send(text: string, action = "chat") {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    if (!apiKey) {
      openApiKeyPrompt();
      return;
    }

    const userMsg: ChatMessage = {
      role: "user",
      content: trimmed,
      at: new Date().toISOString(),
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const data = await callCoach(next, action);
      const assistant: ChatMessage = {
        role: "assistant",
        content: data.reply || "Okay.",
        at: new Date().toISOString(),
      };
      setMessages([...next, assistant]);

      if (data.markSkipped) {
        const split = normalizeSplit(data.skippedSplit ?? "other");
        const already = workouts.some(
          (w) => w.date === today && w.status === "skipped" && w.split === split,
        );
        if (!already) {
          add({
            date: today,
            split,
            status: "skipped",
            exercises: [],
            source: "chat",
          });
        }
      }

      if (data.openLogPrompt && (data.draftExercises?.length ?? 0) > 0) {
        setLogSplit(normalizeSplit(data.suggestedSplit ?? "other"));
        setLogDrafts(data.draftExercises ?? []);
        setLogOpen(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function onLogConfirm(payload: {
    split: SplitTag;
    exercises: WorkoutExercise[];
    cardio?: import("@/lib/types").CardioBlock;
  }) {
    setLogOpen(false);
    const draftSession = {
      date: today,
      split: payload.split,
      status: "completed" as const,
      exercises: payload.exercises,
      cardio: payload.cardio,
      source: "chat" as const,
    };

    let estimatedKcal = estimateWorkoutKcalLocal(draftSession, bodyweightKg);

    if (apiKey) {
      try {
        const data = await callCoach(
          [
            ...messages,
            {
              role: "user",
              content:
                "Estimate calories burned for the workout I just logged and give a short insight.",
              at: new Date().toISOString(),
            },
          ],
          "estimate",
          { sessionDraft: draftSession },
        );
        if (data.estimatedKcal && data.estimatedKcal > 0) {
          estimatedKcal = data.estimatedKcal;
        }
        if (data.reply) {
          setMessages([
            ...messages,
            {
              role: "assistant",
              content: data.reply,
              at: new Date().toISOString(),
            },
          ]);
        }
      } catch {
        /* local estimate is enough */
      }
    }

    add({ ...draftSession, estimatedKcal });
    onSessionSaved?.();
  }

  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Coach</h2>
          <p className="text-xs text-[var(--muted)]">
            Personalized from your workout history
          </p>
        </div>
        {messages.length > 0 && (
          <button
            className="text-xs text-[var(--muted)]"
            onClick={() => clear()}
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CHIPS.map((c) => (
          <button
            key={c.label}
            type="button"
            className="text-[11px] px-2.5 py-1.5 rounded-full bg-[var(--surface-2)]"
            onClick={() => {
              if (c.label === "Log finished workout") {
                setInput(c.text);
              } else {
                void send(c.text, c.label === "What today?" ? "plan_today" : c.label === "Progress check" ? "insight" : "chat");
              }
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="max-h-72 overflow-y-auto space-y-2 rounded-xl bg-[var(--surface-2)] p-3">
        {messages.length === 0 && (
          <p className="text-xs text-[var(--muted)]">
            Try: “Today I’m hitting push” or “Done — incline DB, pec deck, dips…”
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={`${m.at}-${i}`}
            className={`text-sm whitespace-pre-wrap ${
              m.role === "user" ? "text-[var(--foreground)]" : ""
            }`}
            style={
              m.role === "assistant"
                ? { color: "var(--accent-2)" }
                : undefined
            }
          >
            <span className="text-[10px] text-[var(--muted)] uppercase tracking-wide">
              {m.role === "user" ? "You" : "Coach"} ·{" "}
            </span>
            {m.content}
          </div>
        ))}
        {loading && (
          <p className="text-xs text-[var(--muted)]">Coach is thinking…</p>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="text-xs" style={{ color: "var(--warn)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Message your coach…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          disabled={loading}
        />
        <button
          className="btn btn-primary px-4 disabled:opacity-50"
          disabled={loading || !input.trim()}
          onClick={() => void send(input)}
        >
          Send
        </button>
      </div>

      <GymLogPromptSheet
        open={logOpen}
        date={today}
        split={logSplit}
        drafts={logDrafts}
        memory={memory}
        onClose={() => setLogOpen(false)}
        onConfirm={(p) => void onLogConfirm(p)}
      />
    </section>
  );
}
