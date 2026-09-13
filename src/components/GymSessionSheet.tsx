"use client";

import { useEffect, useState } from "react";
import { NumberInput } from "@/components/NumberInput";
import { inferLoadMode } from "@/lib/gym";
import type {
  CardioBlock,
  SplitTag,
  WorkoutExercise,
  WorkoutSession,
  WorkoutSet,
} from "@/lib/types";
import { SPLIT_LABELS } from "@/lib/types";

type Draft = {
  date: string;
  split: SplitTag;
  status: "completed" | "skipped";
  notes: string;
  exercises: WorkoutExercise[];
  cardioOn: boolean;
  cardio: CardioBlock;
};

export function GymSessionSheet({
  entry,
  onClose,
  onSave,
  onDelete,
}: {
  entry: WorkoutSession | null;
  onClose: () => void;
  onSave: (
    id: string | null,
    data: Omit<WorkoutSession, "id" | "createdAt">,
  ) => void;
  onDelete?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (entry) {
      setOpen(true);
      setDraft({
        date: entry.date,
        split: entry.split,
        status: entry.status,
        notes: entry.notes ?? "",
        exercises:
          entry.exercises?.length > 0
            ? entry.exercises
            : [{ name: "", loadMode: "weighted", sets: [{ reps: 10, weightKg: 20 }] }],
        cardioOn: Boolean(entry.cardio),
        cardio: entry.cardio ?? {
          type: "incline walk",
          minutes: 15,
          intensity: "easy",
        },
      });
    }
  }, [entry]);

  if (!open || !draft || !entry) return null;

  function updateSet(ei: number, si: number, patch: Partial<WorkoutSet>) {
    setDraft((d) =>
      d
        ? {
            ...d,
            exercises: d.exercises.map((ex, i) =>
              i !== ei
                ? ex
                : {
                    ...ex,
                    sets: ex.sets.map((s, j) =>
                      j === si ? { ...s, ...patch } : s,
                    ),
                  },
            ),
          }
        : d,
    );
  }

  function save() {
    if (!draft || !entry) return;
    onSave(entry.id, {
      date: draft.date,
      split: draft.split,
      status: draft.status,
      notes: draft.notes.trim() || undefined,
      exercises:
        draft.status === "skipped"
          ? []
          : draft.exercises
              .filter((ex) => ex.name.trim())
              .map((ex) => ({
                ...ex,
                name: ex.name.trim(),
                loadMode: ex.loadMode || inferLoadMode(ex.name),
                sets: ex.sets.filter((s) => s.reps > 0),
              })),
      cardio:
        draft.status !== "skipped" && draft.cardioOn
          ? draft.cardio
          : undefined,
      estimatedKcal: entry.estimatedKcal,
      source: entry.source,
    });
    setOpen(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto no-scrollbar card rounded-b-none sm:rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit session</h2>
          <button
            className="text-[var(--muted)] text-sm"
            onClick={() => {
              setOpen(false);
              onClose();
            }}
          >
            Cancel
          </button>
        </div>

        <label className="block">
          <span className="text-xs text-[var(--muted)] mb-1 block">Date</span>
          <input
            type="date"
            className="input"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-[var(--muted)] mb-1 block">Split</span>
            <select
              className="input"
              value={draft.split}
              onChange={(e) =>
                setDraft({ ...draft, split: e.target.value as SplitTag })
              }
            >
              {(Object.keys(SPLIT_LABELS) as SplitTag[]).map((s) => (
                <option key={s} value={s}>
                  {SPLIT_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-[var(--muted)] mb-1 block">Status</span>
            <select
              className="input"
              value={draft.status}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  status: e.target.value as Draft["status"],
                })
              }
            >
              <option value="completed">Completed</option>
              <option value="skipped">Skipped</option>
            </select>
          </label>
        </div>

        {draft.status === "completed" && (
          <>
            {draft.exercises.map((ex, ei) => (
              <div
                key={ei}
                className="rounded-xl bg-[var(--surface-2)] p-3 space-y-2"
              >
                <input
                  className="input py-1.5 text-sm"
                  placeholder="Exercise name"
                  value={ex.name}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      exercises: draft.exercises.map((x, i) =>
                        i === ei
                          ? {
                              ...x,
                              name: e.target.value,
                              loadMode: inferLoadMode(e.target.value),
                            }
                          : x,
                      ),
                    })
                  }
                />
                {ex.sets.map((set, si) => (
                  <div key={si} className="grid grid-cols-2 gap-2">
                    {ex.loadMode === "weighted" ? (
                      <label className="block">
                        <span className="text-[10px] text-[var(--muted)]">
                          kg
                        </span>
                        <NumberInput
                          className="input py-1.5 text-sm"
                          value={set.weightKg ?? 0}
                          onChange={(v) =>
                            updateSet(ei, si, { weightKg: v })
                          }
                        />
                      </label>
                    ) : (
                      <label className="block">
                        <span className="text-[10px] text-[var(--muted)]">
                          {ex.loadMode === "assisted" ? "assist kg" : "+kg"}
                        </span>
                        <NumberInput
                          className="input py-1.5 text-sm"
                          value={
                            ex.loadMode === "assisted"
                              ? (set.assistanceKg ?? 0)
                              : (set.addedKg ?? 0)
                          }
                          onChange={(v) =>
                            updateSet(
                              ei,
                              si,
                              ex.loadMode === "assisted"
                                ? { assistanceKg: v }
                                : { addedKg: v || undefined },
                            )
                          }
                        />
                      </label>
                    )}
                    <label className="block">
                      <span className="text-[10px] text-[var(--muted)]">
                        reps
                      </span>
                      <NumberInput
                        className="input py-1.5 text-sm"
                        value={set.reps}
                        onChange={(v) => updateSet(ei, si, { reps: v })}
                      />
                    </label>
                  </div>
                ))}
              </div>
            ))}
            <button
              type="button"
              className="text-xs font-medium"
              style={{ color: "var(--accent)" }}
              onClick={() =>
                setDraft({
                  ...draft,
                  exercises: [
                    ...draft.exercises,
                    {
                      name: "",
                      loadMode: "weighted",
                      sets: [{ reps: 10, weightKg: 20 }],
                    },
                  ],
                })
              }
            >
              + exercise
            </button>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.cardioOn}
                onChange={(e) =>
                  setDraft({ ...draft, cardioOn: e.target.checked })
                }
              />
              Cardio
            </label>
            {draft.cardioOn && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block col-span-2">
                  <span className="text-[10px] text-[var(--muted)]">Type</span>
                  <input
                    className="input py-1.5 text-sm"
                    value={draft.cardio.type}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        cardio: { ...draft.cardio, type: e.target.value },
                      })
                    }
                    placeholder="incline walk"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] text-[var(--muted)]">
                    minutes
                  </span>
                  <NumberInput
                    className="input py-1.5 text-sm"
                    value={draft.cardio.minutes}
                    onChange={(v) =>
                      setDraft({
                        ...draft,
                        cardio: { ...draft.cardio, minutes: v },
                      })
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] text-[var(--muted)]">
                    intensity
                  </span>
                  <select
                    className="input py-1.5 text-sm"
                    value={draft.cardio.intensity ?? "moderate"}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        cardio: {
                          ...draft.cardio,
                          intensity: e.target.value as CardioBlock["intensity"],
                        },
                      })
                    }
                  >
                    <option value="easy">Easy</option>
                    <option value="moderate">Moderate</option>
                    <option value="hard">Hard</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] text-[var(--muted)]">
                    incline %
                  </span>
                  <NumberInput
                    className="input py-1.5 text-sm"
                    step={0.1}
                    value={draft.cardio.inclinePct ?? 0}
                    onChange={(v) =>
                      setDraft({
                        ...draft,
                        cardio: {
                          ...draft.cardio,
                          inclinePct: v || undefined,
                        },
                      })
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] text-[var(--muted)]">
                    km/h
                  </span>
                  <NumberInput
                    className="input py-1.5 text-sm"
                    step={0.1}
                    value={draft.cardio.speedKmh ?? 0}
                    onChange={(v) =>
                      setDraft({
                        ...draft,
                        cardio: {
                          ...draft.cardio,
                          speedKmh: v || undefined,
                        },
                      })
                    }
                  />
                </label>
              </div>
            )}
          </>
        )}

        <label className="block">
          <span className="text-xs text-[var(--muted)] mb-1 block">Notes</span>
          <input
            className="input"
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </label>

        <button className="btn btn-primary w-full py-3" onClick={save}>
          Save
        </button>
        {onDelete && entry && (
          <button
            className="btn btn-ghost w-full py-2 text-sm"
            style={{ color: "var(--warn)" }}
            onClick={() => {
              onDelete(entry.id);
              setOpen(false);
              onClose();
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

export function ManualLogButton({
  date,
  onSave,
}: {
  date: string;
  onSave: (data: Omit<WorkoutSession, "id" | "createdAt">) => void;
}) {
  const [open, setOpen] = useState(false);
  const [split, setSplit] = useState<SplitTag>("push");
  const [status, setStatus] = useState<"completed" | "skipped">("completed");
  const [name, setName] = useState("");
  const [reps, setReps] = useState(10);
  const [kg, setKg] = useState(20);
  const [cardioOn, setCardioOn] = useState(false);
  const [cardioMin, setCardioMin] = useState(15);
  const [cardioType, setCardioType] = useState("incline walk");

  if (!open) {
    return (
      <button className="btn btn-ghost w-full py-2.5" onClick={() => setOpen(true)}>
        Manual log
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto no-scrollbar card rounded-b-none sm:rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Manual log</h2>
          <button className="text-[var(--muted)] text-sm" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
        <select
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="completed">Completed</option>
          <option value="skipped">Skipped</option>
        </select>
        <select
          className="input"
          value={split}
          onChange={(e) => setSplit(e.target.value as SplitTag)}
        >
          {(Object.keys(SPLIT_LABELS) as SplitTag[]).map((s) => (
            <option key={s} value={s}>
              {SPLIT_LABELS[s]}
            </option>
          ))}
        </select>
        {status === "completed" && (
          <>
            <input
              className="input"
              placeholder="First exercise (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberInput className="input" value={kg} onChange={setKg} />
              <NumberInput className="input" value={reps} onChange={setReps} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cardioOn}
                onChange={(e) => setCardioOn(e.target.checked)}
              />
              Cardio
            </label>
            {cardioOn && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="input col-span-2"
                  value={cardioType}
                  onChange={(e) => setCardioType(e.target.value)}
                  placeholder="incline walk"
                />
                <NumberInput
                  className="input"
                  value={cardioMin}
                  onChange={setCardioMin}
                />
              </div>
            )}
          </>
        )}
        <button
          className="btn btn-primary w-full py-3"
          onClick={() => {
            const loadMode = inferLoadMode(name);
            onSave({
              date,
              split,
              status,
              exercises:
                status === "completed" && name.trim()
                  ? [
                      {
                        name: name.trim(),
                        loadMode,
                        sets: [
                          loadMode === "weighted"
                            ? { reps, weightKg: kg }
                            : { reps, addedKg: kg || undefined },
                        ],
                      },
                    ]
                  : [],
              cardio:
                status === "completed" && cardioOn
                  ? {
                      type: cardioType,
                      minutes: cardioMin,
                      intensity: "moderate",
                    }
                  : undefined,
              source: "manual",
            });
            setOpen(false);
            setName("");
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
