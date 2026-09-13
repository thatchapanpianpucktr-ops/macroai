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
  estimateCardioKcalLocal,
  estimateWorkoutKcalLocal,
  extractSplit,
  normalizeSplit,
} from "@/lib/gym";
import {
  collapseDuplicateExercises,
  formatCardio,
  formatParsedSet,
  isNameOnlyWorkoutList,
  mergeCardio,
  mergeSetsIntoExercises,
  lastSetContext,
  parseCardio,
  parseWorkoutLog,
  resolveCoachSets,
  summarizeSessionExercises,
  type ParsedSetLine,
} from "@/lib/parse-set";
import { currentWeight } from "@/lib/tdee";
import { todayYmd } from "@/lib/date";
import type {
  CardioBlock,
  ChatMessage,
  SplitTag,
  WorkoutExercise,
} from "@/lib/types";
import { SPLIT_LABELS } from "@/lib/types";
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
  loggedSets?: {
    name: string;
    loadMode?: string;
    reps: number;
    weightKg?: number;
    setIndex?: number;
  }[];
  loggedCardio?: CardioBlock | null;
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
    label: "Log a set",
    text: "deadlift 100kg 5 reps set 1",
  },
  {
    label: "Log cardio",
    text: "incline walk 12.5% 3.5km/h 30min",
  },
  {
    label: "Log finished workout",
    text: "Done with my workout. I did: ",
  },
  { label: "Progress check", text: "How am I progressing lately? What should I improve?" },
];

export function GymCoachChat({
  onSessionSaved,
}: {
  onSessionSaved?: () => void;
}) {
  const [apiKey] = useApiKey();
  const [settings] = useSettings();
  const [plan] = useGymPlan();
  const { workouts, add, update } = useWorkouts();
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
  const plannedSplitRef = useRef<SplitTag | null>(null);

  const memory = useMemo(() => buildExerciseMemory(workouts), [workouts]);
  const bodyweightKg = currentWeight(weights) ?? 75;
  const todaySession = useMemo(
    () =>
      workouts.find((w) => w.date === today && w.status === "completed") ??
      null,
    [workouts, today],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function splitFromChat(chat: ChatMessage[]): SplitTag | null {
    for (let i = chat.length - 1; i >= 0; i--) {
      if (chat[i].role !== "user") continue;
      const found = extractSplit(chat[i].content);
      if (found) return found;
    }
    return plannedSplitRef.current;
  }

  function resolveSplit(
    hint?: string | null,
    chat: ChatMessage[] = messages,
  ): SplitTag {
    const fromHint = hint ? extractSplit(String(hint)) : null;
    return (
      plannedSplitRef.current ??
      splitFromChat(chat) ??
      fromHint ??
      todaySession?.split ??
      plan.template[0] ??
      "other"
    );
  }

  function persistWorkout(opts: {
    lines?: ParsedSetLine[];
    cardio?: CardioBlock | null;
    splitHint?: string | null;
    chat?: ChatMessage[];
  }): { exercises: WorkoutExercise[]; cardio?: CardioBlock } {
    const exercises = opts.lines?.length
      ? mergeSetsIntoExercises(todaySession?.exercises ?? [], opts.lines)
      : collapseDuplicateExercises(todaySession?.exercises ?? []);
    const cardioMerged = mergeCardio(
      todaySession?.cardio,
      opts.cardio ?? undefined,
    );
    const cardio = cardioMerged
      ? {
          ...cardioMerged,
          estimatedKcal: estimateCardioKcalLocal(cardioMerged, bodyweightKg),
        }
      : undefined;
    const split = resolveSplit(opts.splitHint, opts.chat);
    const estimatedKcal = estimateWorkoutKcalLocal(
      { exercises, cardio, status: "completed" },
      bodyweightKg,
    );
    const patch = {
      exercises,
      cardio,
      split,
      estimatedKcal,
      status: "completed" as const,
    };
    if (todaySession) {
      update(todaySession.id, patch);
    } else if (
      exercises.length > 0 ||
      cardio ||
      plannedSplitRef.current ||
      opts.splitHint
    ) {
      add({
        date: today,
        ...patch,
        source: "chat",
      });
    }
    onSessionSaved?.();
    return { exercises, cardio };
  }

  useEffect(() => {
    if (!todaySession) return;
    const fromChat = splitFromChat(messages);
    if (fromChat) plannedSplitRef.current = fromChat;
    const exercises = collapseDuplicateExercises(todaySession.exercises ?? []);
    const namesDirty =
      exercises.length !== (todaySession.exercises?.length ?? 0) ||
      exercises.some(
        (ex, i) =>
          ex.name !== todaySession.exercises[i]?.name ||
          ex.sets.length !== todaySession.exercises[i]?.sets.length,
      );
    const splitDirty = Boolean(fromChat && fromChat !== todaySession.split);
    if (!namesDirty && !splitDirty) return;
    const estimatedKcal = estimateWorkoutKcalLocal(
      {
        exercises,
        cardio: todaySession.cardio,
        status: todaySession.status,
      },
      bodyweightKg,
    );
    update(todaySession.id, {
      exercises,
      ...(fromChat ? { split: fromChat } : {}),
      estimatedKcal,
    });
  }, [todaySession, messages, bodyweightKg, update]);

  function linesFromCoach(
    sets: NonNullable<CoachResponse["loggedSets"]>,
  ): ParsedSetLine[] {
    return resolveCoachSets(
      sets,
      todaySession?.exercises ?? [],
      lastSetContext(todaySession?.exercises ?? []),
    );
  }

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
          sessionDraft: todaySession,
          lastSet: lastSetContext(todaySession?.exercises ?? []),
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

    const namedSplit = extractSplit(trimmed);
    if (namedSplit) plannedSplitRef.current = namedSplit;
    const cardio = parseCardio(trimmed);
    const lastLift = lastSetContext(todaySession?.exercises ?? []);
    const localSets = parseWorkoutLog(trimmed, memory, lastLift);
    const looksLikeLog =
      localSets.length > 0 ||
      Boolean(cardio) ||
      /\d/.test(trimmed) ||
      /\b(set|reps?|kg|same|next set|another set)\b/i.test(trimmed) ||
      /done|logged|i did|finished/i.test(trimmed);

    function confirmLocal(lines: ParsedSetLine[]) {
      const saved = persistWorkout({
        lines,
        cardio,
        splitHint: namedSplit,
        chat: next,
      });
      const cardioLine = saved.cardio
        ? `\nCardio — ${formatCardio(saved.cardio)}`
        : "";
      setMessages([
        ...next,
        {
          role: "assistant",
          content: `Logged:\n${(lines.length
            ? lines
            : []
          )
            .map(formatParsedSet)
            .join("\n")}${
            lines.length === 0 && saved.cardio
              ? formatCardio(saved.cardio)
              : ""
          }\n\nToday so far · ${SPLIT_LABELS[resolveSplit(namedSplit, next)]}:\n${summarizeSessionExercises(saved.exercises)}${cardioLine}`,
          at: new Date().toISOString(),
        },
      ]);
    }

    if (!apiKey) {
      if (localSets.length > 0 || cardio || namedSplit) {
        confirmLocal(localSets);
        setLoading(false);
        return;
      }
      setLoading(false);
      if (looksLikeLog) {
        setError(
          "Add a Gemini API key in Settings so the coach can read what you logged.",
        );
        return;
      }
      openApiKeyPrompt();
      return;
    }

    try {
      const data = await callCoach(
        next,
        action === "chat" && looksLikeLog ? "log_set" : action,
      );
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

      const coachSets = linesFromCoach(data.loggedSets ?? []);
      const fallbackSets =
        coachSets.length > 0 ? coachSets : looksLikeLog ? localSets : [];
      const coachCardio =
        data.loggedCardio && data.loggedCardio.minutes > 0
          ? data.loggedCardio
          : undefined;
      let todayNote = "";
      if (fallbackSets.length > 0 || coachCardio || cardio || namedSplit) {
        const saved = persistWorkout({
          lines: fallbackSets,
          cardio: mergeCardio(cardio ?? undefined, coachCardio),
          splitHint: data.suggestedSplit ?? namedSplit,
          chat: next,
        });
        const cardioLine = saved.cardio
          ? `\nCardio — ${formatCardio(saved.cardio)}`
          : "";
        todayNote = `\n\nToday so far · ${SPLIT_LABELS[resolveSplit(data.suggestedSplit ?? namedSplit, next)]}:\n${summarizeSessionExercises(saved.exercises)}${cardioLine}`;
      }
      setMessages([
        ...next,
        {
          role: "assistant",
          content: `${data.reply || "Okay."}${todayNote}`,
          at: new Date().toISOString(),
        },
      ]);
      if (
        fallbackSets.length === 0 &&
        isNameOnlyWorkoutList(trimmed) &&
        data.openLogPrompt &&
        (data.draftExercises?.length ?? 0) > 0
      ) {
        setLogSplit(resolveSplit(data.suggestedSplit, next));
        setLogDrafts(data.draftExercises ?? []);
        setLogOpen(true);
      }
    } catch (err) {
      if (localSets.length > 0 || cardio || namedSplit) {
        confirmLocal(localSets);
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  }

  async function onLogConfirm(payload: {
    split: SplitTag;
    exercises: WorkoutExercise[];
    cardio?: CardioBlock;
  }) {
    setLogOpen(false);
    const merged = mergeSetsIntoExercises(
      todaySession?.exercises ?? [],
      payload.exercises.flatMap((ex) =>
        ex.sets
          .filter((s) => s.reps > 0)
          .map((s, i) => ({
            name: ex.name,
            loadMode: ex.loadMode,
            reps: s.reps,
            weightKg: s.weightKg,
            addedKg: s.addedKg,
            assistanceKg: s.assistanceKg,
            setIndex: i + 1,
          })),
      ),
    );
    const draftSession = {
      date: today,
      split: payload.split,
      status: "completed" as const,
      exercises: merged,
      cardio: payload.cardio ?? todaySession?.cardio,
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

    if (todaySession) {
      update(todaySession.id, { ...draftSession, estimatedKcal });
    } else {
      add({ ...draftSession, estimatedKcal });
    }
    onSessionSaved?.();
  }

  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Coach</h2>
          <p className="text-xs text-[var(--muted)]">
            Type how the set went — the coach reads it and logs it
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

      {todaySession &&
        (todaySession.exercises.length > 0 || todaySession.cardio) && (
        <div className="rounded-xl bg-[var(--surface-2)] p-3 text-xs space-y-1">
          <div className="font-semibold text-[var(--muted)]">
            Today · {SPLIT_LABELS[todaySession.split]}
          </div>
          <pre className="whitespace-pre-wrap font-sans text-[var(--foreground)]">
            {summarizeSessionExercises(todaySession.exercises)}
            {todaySession.cardio
              ? `\nCardio — ${formatCardio(todaySession.cardio)}`
              : ""}
          </pre>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {CHIPS.map((c) => (
          <button
            key={c.label}
            type="button"
            className="text-[11px] px-2.5 py-1.5 rounded-full bg-[var(--surface-2)]"
            onClick={() => {
              if (
                c.label === "Log finished workout" ||
                c.label === "Log a set" ||
                c.label === "Log cardio"
              ) {
                setInput(c.text);
              } else {
                void send(
                  c.text,
                  c.label === "What today?"
                    ? "plan_today"
                    : c.label === "Progress check"
                      ? "insight"
                      : "chat",
                );
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
            Say it however you want — “leg press 140kg 8”, “2nd set same
            weight 10”, “incline walk 12.5% 3.5km/h 30min”. The coach logs it.
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
          placeholder="2nd set same weight 10 reps"
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
          Log
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
