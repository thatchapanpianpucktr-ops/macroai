"use client";

import { useMemo, useState } from "react";
import { GymCoachChat } from "@/components/GymCoachChat";
import {
  GymSessionSheet,
  ManualLogButton,
} from "@/components/GymSessionSheet";
import { NumberInput } from "@/components/NumberInput";
import {
  useGymPlan,
  useSettings,
  useSteps,
  useWeights,
  useWorkouts,
} from "@/lib/store";
import {
  estimateStepsKcal,
  estimateWorkoutKcalLocal,
} from "@/lib/gym";
import { currentWeight } from "@/lib/tdee";
import { todayYmd, ymdToLabel } from "@/lib/date";
import {
  SPLIT_LABELS,
  type SplitTag,
  type WorkoutSession,
} from "@/lib/types";

export default function GymPage() {
  const [settings] = useSettings();
  const [plan, updatePlan] = useGymPlan();
  const { workouts, add, remove, update } = useWorkouts();
  const { weights } = useWeights();
  const tz = settings.timeZone;
  const today = todayYmd(tz);
  const { steps, setSteps } = useSteps(today);
  const [editing, setEditing] = useState<WorkoutSession | null>(null);
  const [planOpen, setPlanOpen] = useState(false);

  const bodyweightKg = currentWeight(weights) ?? 75;

  const todaySessions = useMemo(
    () => workouts.filter((w) => w.date === today),
    [workouts, today],
  );

  const burnedToday = useMemo(() => {
    const fromWorkouts = todaySessions.reduce((sum, s) => {
      if (s.status === "skipped") return sum;
      return (
        sum +
        (s.estimatedKcal ??
          estimateWorkoutKcalLocal(s, bodyweightKg))
      );
    }, 0);
    return fromWorkouts + estimateStepsKcal(steps, bodyweightKg);
  }, [todaySessions, steps, bodyweightKg]);

  const recent = useMemo(
    () =>
      [...workouts].sort(
        (a, b) =>
          new Date(b.createdAt || b.date).getTime() -
          new Date(a.createdAt || a.date).getTime(),
      ),
    [workouts],
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">Gym</h1>
        <p className="text-sm text-[var(--muted)]">
          Type each set as you finish it. The coach still plans and reviews.
        </p>
      </header>

      <section className="card p-4 space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs text-[var(--muted)]">Estimated burn today</div>
            <div className="text-2xl font-bold tabular-nums">
              {burnedToday}
              <span className="text-sm font-medium text-[var(--muted)]">
                {" "}
                kcal
              </span>
            </div>
          </div>
          <div className="text-right text-xs text-[var(--muted)]">
            {todaySessions.some((s) => s.status === "completed")
              ? "Trained"
              : todaySessions.some((s) => s.status === "skipped")
                ? "Skipped logged"
                : "No session yet"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex-1">
            <span className="text-[10px] text-[var(--muted)]">Steps (manual)</span>
            <NumberInput
              className="input py-2"
              value={steps}
              onChange={setSteps}
            />
          </label>
          <button
            className="btn btn-ghost text-xs py-2 px-3 mt-4"
            onClick={() => setPlanOpen((v) => !v)}
          >
            Plan
          </button>
        </div>
        {planOpen && (
          <div className="space-y-2 border-t border-[var(--border)] pt-3">
            <label className="block">
              <span className="text-xs text-[var(--muted)]">Days / week</span>
              <NumberInput
                className="input py-2"
                value={plan.daysPerWeek}
                onChange={(v) =>
                  updatePlan({ daysPerWeek: Math.max(1, Math.min(7, v)) })
                }
              />
            </label>
            <label className="block">
              <span className="text-xs text-[var(--muted)]">
                Split template (comma-separated)
              </span>
              <input
                className="input py-2"
                value={plan.template.join(", ")}
                onChange={(e) => {
                  const parts = e.target.value
                    .split(",")
                    .map((p) => p.trim().toLowerCase())
                    .filter(Boolean) as SplitTag[];
                  const allowed = new Set(Object.keys(SPLIT_LABELS));
                  updatePlan({
                    template: parts.filter((p) => allowed.has(p)),
                  });
                }}
              />
            </label>
            <label className="block">
              <span className="text-xs text-[var(--muted)]">Notes for coach</span>
              <input
                className="input py-2"
                placeholder="e.g. no machines on weekends"
                value={plan.notes ?? ""}
                onChange={(e) => updatePlan({ notes: e.target.value })}
              />
            </label>
            <p className="text-[11px] text-[var(--muted)]">
              Default: push, pull, legs, upper, lower. Calendar reminders are
              planned for a later update.
            </p>
          </div>
        )}
      </section>

      <GymCoachChat />

      <ManualLogButton
        date={today}
        onSave={(data) => {
          const estimatedKcal =
            data.status === "completed"
              ? estimateWorkoutKcalLocal(data, bodyweightKg)
              : 0;
          add({ ...data, estimatedKcal });
        }}
      />

      <section className="space-y-2">
        <h2 className="font-semibold text-sm">Recent sessions</h2>
        {recent.length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            No workouts yet — ask the coach what to do today, then log when
            you&apos;re done.
          </p>
        )}
        {recent.slice(0, 40).map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => setEditing(w)}
            className="card p-3 w-full text-left active:opacity-80"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-medium">
                  {SPLIT_LABELS[w.split]}{" "}
                  <span className="text-xs text-[var(--muted)] font-normal">
                    · {ymdToLabel(w.date)}
                  </span>
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {w.status === "skipped"
                    ? "Skipped"
                    : `${w.exercises?.length ?? 0} exercises${
                        w.cardio ? ` · ${w.cardio.minutes}m cardio` : ""
                      }`}
                </div>
              </div>
              <div className="text-right shrink-0">
                {w.status === "completed" && (
                  <div className="font-semibold tabular-nums text-sm">
                    {w.estimatedKcal ?? "—"}
                    <span className="text-[10px] text-[var(--muted)] font-normal">
                      {" "}
                      kcal
                    </span>
                  </div>
                )}
                <div className="text-[11px] text-[var(--muted)]">edit</div>
              </div>
            </div>
          </button>
        ))}
      </section>

      <GymSessionSheet
        entry={editing}
        onClose={() => setEditing(null)}
        onSave={(id, data) => {
          if (id) {
            const estimatedKcal =
              data.status === "completed"
                ? estimateWorkoutKcalLocal(data, bodyweightKg)
                : 0;
            update(id, { ...data, estimatedKcal });
          }
          setEditing(null);
        }}
        onDelete={(id) => {
          remove(id);
          setEditing(null);
        }}
      />
    </div>
  );
}
