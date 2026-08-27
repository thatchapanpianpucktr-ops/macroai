"use client";

import { useEffect, useMemo, useState } from "react";
import { NumberInput } from "@/components/NumberInput";
import {
  inferLoadMode,
  prefillSetsFromMemory,
  type ExerciseMemoryEntry,
} from "@/lib/gym";
import type {
  CardioBlock,
  LoadMode,
  SplitTag,
  WorkoutExercise,
  WorkoutSet,
} from "@/lib/types";
import { SPLIT_LABELS } from "@/lib/types";

export type DraftExerciseIn = {
  name: string;
  loadMode?: LoadMode;
  suggestedSets?: number;
};

export function GymLogPromptSheet({
  open,
  date,
  split,
  drafts,
  memory,
  onClose,
  onConfirm,
}: {
  open: boolean;
  date: string;
  split: SplitTag;
  drafts: DraftExerciseIn[];
  memory: ExerciseMemoryEntry[];
  onClose: () => void;
  onConfirm: (payload: {
    split: SplitTag;
    exercises: WorkoutExercise[];
    cardio?: CardioBlock;
  }) => void;
}) {
  const [splitTag, setSplitTag] = useState<SplitTag>(split);
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [cardioOn, setCardioOn] = useState(false);
  const [cardio, setCardio] = useState<CardioBlock>({
    type: "incline walk",
    minutes: 15,
    intensity: "easy",
  });

  const draftKey = useMemo(
    () => drafts.map((d) => `${d.name}:${d.loadMode}:${d.suggestedSets}`).join("|"),
    [drafts],
  );

  useEffect(() => {
    if (!open) return;
    setSplitTag(split);
    setExercises(
      drafts.map((d) => {
        const loadMode = d.loadMode ?? inferLoadMode(d.name);
        const sets = prefillSetsFromMemory(
          d.name,
          loadMode,
          memory,
          d.suggestedSets ?? 3,
        );
        return { name: d.name, loadMode, sets };
      }),
    );
    setCardioOn(false);
  }, [open, split, draftKey, drafts, memory]);

  if (!open) return null;

  function updateSet(
    ei: number,
    si: number,
    patch: Partial<WorkoutSet>,
  ) {
    setExercises((prev) =>
      prev.map((ex, i) =>
        i !== ei
          ? ex
          : {
              ...ex,
              sets: ex.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)),
            },
      ),
    );
  }

  function setLoadMode(ei: number, loadMode: LoadMode) {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== ei) return ex;
        const sets = prefillSetsFromMemory(ex.name, loadMode, memory, ex.sets.length);
        return { ...ex, loadMode, sets };
      }),
    );
  }

  function addSet(ei: number) {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== ei) return ex;
        const last = ex.sets[ex.sets.length - 1] ?? { reps: 10 };
        return { ...ex, sets: [...ex.sets, { ...last }] };
      }),
    );
  }

  function removeSet(ei: number, si: number) {
    setExercises((prev) =>
      prev.map((ex, i) =>
        i !== ei
          ? ex
          : { ...ex, sets: ex.sets.filter((_, j) => j !== si) },
      ),
    );
  }

  function submit() {
    onConfirm({
      split: splitTag,
      exercises: exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.filter((s) => s.reps > 0),
      })),
      cardio: cardioOn ? cardio : undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto no-scrollbar card rounded-b-none sm:rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Log sets</h2>
            <p className="text-xs text-[var(--muted)]">{date}</p>
          </div>
          <button className="text-[var(--muted)] text-sm" onClick={onClose}>
            Cancel
          </button>
        </div>

        <label className="block">
          <span className="text-xs text-[var(--muted)] mb-1 block">Split</span>
          <select
            className="input"
            value={splitTag}
            onChange={(e) => setSplitTag(e.target.value as SplitTag)}
          >
            {(Object.keys(SPLIT_LABELS) as SplitTag[]).map((s) => (
              <option key={s} value={s}>
                {SPLIT_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        {exercises.map((ex, ei) => (
          <div key={`${ex.name}-${ei}`} className="rounded-xl bg-[var(--surface-2)] p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-sm">{ex.name}</div>
              <select
                className="input py-1 text-xs w-auto"
                value={ex.loadMode}
                onChange={(e) => setLoadMode(ei, e.target.value as LoadMode)}
              >
                <option value="weighted">Weighted</option>
                <option value="bodyweight">Bodyweight</option>
                <option value="assisted">Assisted</option>
              </select>
            </div>

            {ex.sets.map((set, si) => (
              <div key={si} className="grid grid-cols-12 gap-1.5 items-end">
                <div className="col-span-1 text-[10px] text-[var(--muted)] pb-2">
                  {si + 1}
                </div>
                {ex.loadMode === "weighted" && (
                  <div className="col-span-4">
                    <span className="text-[10px] text-[var(--muted)]">kg</span>
                    <NumberInput
                      className="input py-1.5 text-sm"
                      value={set.weightKg ?? 0}
                      onChange={(v) => updateSet(ei, si, { weightKg: v })}
                    />
                  </div>
                )}
                {ex.loadMode === "assisted" && (
                  <div className="col-span-4">
                    <span className="text-[10px] text-[var(--muted)]">assist kg</span>
                    <NumberInput
                      className="input py-1.5 text-sm"
                      value={set.assistanceKg ?? 0}
                      onChange={(v) => updateSet(ei, si, { assistanceKg: v })}
                    />
                  </div>
                )}
                {(ex.loadMode === "bodyweight" || ex.loadMode === "assisted") && (
                  <div className="col-span-3">
                    <span className="text-[10px] text-[var(--muted)]">+kg</span>
                    <NumberInput
                      className="input py-1.5 text-sm"
                      value={set.addedKg ?? 0}
                      onChange={(v) => updateSet(ei, si, { addedKg: v || undefined })}
                    />
                  </div>
                )}
                <div
                  className={
                    ex.loadMode === "weighted"
                      ? "col-span-5"
                      : ex.loadMode === "bodyweight"
                        ? "col-span-6"
                        : "col-span-3"
                  }
                >
                  <span className="text-[10px] text-[var(--muted)]">reps</span>
                  <NumberInput
                    className="input py-1.5 text-sm"
                    value={set.reps}
                    onChange={(v) => updateSet(ei, si, { reps: v })}
                  />
                </div>
                <button
                  type="button"
                  className="col-span-2 text-[11px] text-[var(--muted)] pb-2"
                  onClick={() => removeSet(ei, si)}
                  disabled={ex.sets.length <= 1}
                >
                  del
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-xs font-medium"
              style={{ color: "var(--accent)" }}
              onClick={() => addSet(ei)}
            >
              + set
            </button>
          </div>
        ))}

        <div className="rounded-xl bg-[var(--surface-2)] p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cardioOn}
              onChange={(e) => setCardioOn(e.target.checked)}
            />
            Add cardio
          </label>
          {cardioOn && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block col-span-2">
                <span className="text-[10px] text-[var(--muted)]">Type</span>
                <input
                  className="input py-1.5 text-sm"
                  value={cardio.type}
                  onChange={(e) =>
                    setCardio((c) => ({ ...c, type: e.target.value }))
                  }
                />
              </label>
              <label className="block">
                <span className="text-[10px] text-[var(--muted)]">Minutes</span>
                <NumberInput
                  className="input py-1.5 text-sm"
                  value={cardio.minutes}
                  onChange={(v) => setCardio((c) => ({ ...c, minutes: v }))}
                />
              </label>
              <label className="block">
                <span className="text-[10px] text-[var(--muted)]">Intensity</span>
                <select
                  className="input py-1.5 text-sm"
                  value={cardio.intensity ?? "moderate"}
                  onChange={(e) =>
                    setCardio((c) => ({
                      ...c,
                      intensity: e.target.value as CardioBlock["intensity"],
                    }))
                  }
                >
                  <option value="easy">Easy</option>
                  <option value="moderate">Moderate</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
            </div>
          )}
        </div>

        <button className="btn btn-primary w-full py-3" onClick={submit}>
          Save workout
        </button>
      </div>
    </div>
  );
}
