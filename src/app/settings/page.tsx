"use client";

import { useRouter } from "next/navigation";
import { useSettings, useWeights } from "@/lib/store";
import { computeTargets, currentWeight, estimateTDEE } from "@/lib/tdee";
import { todayYmd } from "@/lib/date";
import { useFoods } from "@/lib/store";
import { useMemo, useState } from "react";
import type { ActivityLevel, Goal, Sex } from "@/lib/types";

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary (little/no exercise)",
  light: "Light (1–3 days/week)",
  moderate: "Moderate (3–5 days/week)",
  active: "Active (6–7 days/week)",
  very_active: "Very active (physical job/2x day)",
};

export default function SettingsPage() {
  const router = useRouter();
  const [settings, update] = useSettings();
  const { weights, setWeight } = useWeights();
  const { foods } = useFoods();

  const [startWeight, setStartWeight] = useState<string>(
    currentWeight(weights)?.toString() ?? "",
  );

  const weight = useMemo(() => currentWeight(weights), [weights]);
  const tdee = useMemo(
    () => estimateTDEE(settings, weights, foods),
    [settings, weights, foods],
  );
  const targets = useMemo(
    () => computeTargets(settings, tdee.tdee, weight ?? (parseFloat(startWeight) || null)),
    [settings, tdee.tdee, weight, startWeight],
  );

  function finishOnboarding() {
    const w = parseFloat(startWeight);
    if (w && !weight) setWeight(todayYmd(), w);
    update({ onboarded: true });
    router.push("/");
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">
          {settings.onboarded ? "Settings" : "Set up your profile"}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Used for your starting estimate. Targets adapt to real data over time.
        </p>
      </header>

      <section className="card p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Sex">
            <select
              className="input"
              value={settings.sex}
              onChange={(e) => update({ sex: e.target.value as Sex })}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </Labeled>
          <Labeled label="Age">
            <input
              type="number"
              className="input"
              value={settings.age}
              onChange={(e) => update({ age: parseInt(e.target.value) || 0 })}
            />
          </Labeled>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Height (cm)">
            <input
              type="number"
              className="input"
              value={settings.heightCm}
              onChange={(e) =>
                update({ heightCm: parseInt(e.target.value) || 0 })
              }
            />
          </Labeled>
          <Labeled label={weight ? "Current weight (kg)" : "Start weight (kg)"}>
            <input
              type="number"
              inputMode="decimal"
              className="input"
              value={weight ?? startWeight}
              onChange={(e) => {
                setStartWeight(e.target.value);
                if (weight) {
                  const v = parseFloat(e.target.value);
                  if (v) setWeight(todayYmd(), v);
                }
              }}
            />
          </Labeled>
        </div>

        <Labeled label="Activity level">
          <select
            className="input"
            value={settings.activity}
            onChange={(e) =>
              update({ activity: e.target.value as ActivityLevel })
            }
          >
            {Object.entries(ACTIVITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Labeled>
      </section>

      <section className="card p-4 space-y-4">
        <h2 className="font-semibold">Goal</h2>
        <div className="grid grid-cols-3 gap-2">
          {(["lose", "maintain", "gain"] as Goal[]).map((g) => (
            <button
              key={g}
              onClick={() => update({ goal: g })}
              className="py-2 rounded-xl text-sm font-medium capitalize"
              style={{
                background:
                  settings.goal === g ? "var(--accent)" : "var(--surface-2)",
                color: settings.goal === g ? "#04231a" : "var(--foreground)",
              }}
            >
              {g}
            </button>
          ))}
        </div>

        {settings.goal !== "maintain" && (
          <Labeled
            label={`Rate: ${settings.rateKgPerWeek} kg/week (${
              settings.goal === "lose" ? "loss" : "gain"
            })`}
          >
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={settings.rateKgPerWeek}
              onChange={(e) =>
                update({ rateKgPerWeek: parseFloat(e.target.value) })
              }
              className="w-full accent-[var(--accent)]"
            />
          </Labeled>
        )}
      </section>

      <section className="card p-4 space-y-4">
        <h2 className="font-semibold">Macro preferences</h2>
        <Labeled label={`Protein: ${settings.proteinPerKg} g per kg bodyweight`}>
          <input
            type="range"
            min={1.2}
            max={2.6}
            step={0.1}
            value={settings.proteinPerKg}
            onChange={(e) =>
              update({ proteinPerKg: parseFloat(e.target.value) })
            }
            className="w-full accent-[var(--accent)]"
          />
        </Labeled>
        <Labeled
          label={`Fat: ${Math.round(settings.fatPctOfCalories * 100)}% of calories`}
        >
          <input
            type="range"
            min={0.15}
            max={0.45}
            step={0.01}
            value={settings.fatPctOfCalories}
            onChange={(e) =>
              update({ fatPctOfCalories: parseFloat(e.target.value) })
            }
            className="w-full accent-[var(--accent)]"
          />
        </Labeled>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-3">Your daily targets</h2>
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat label="kcal" value={targets.calories} />
          <Stat label="protein" value={`${targets.protein}g`} />
          <Stat label="carbs" value={`${targets.carbs}g`} />
          <Stat label="fat" value={`${targets.fat}g`} />
        </div>
        <p className="text-xs text-[var(--muted)] mt-3">
          Estimated expenditure {tdee.tdee} kcal ·{" "}
          {tdee.method === "adaptive"
            ? `adaptive (${tdee.daysUsed} days of data)`
            : "starting estimate"}
        </p>
      </section>

      {!settings.onboarded ? (
        <button
          className="btn btn-primary w-full py-3 disabled:opacity-50"
          disabled={!startWeight && !weight}
          onClick={finishOnboarding}
        >
          Start tracking
        </button>
      ) : (
        <p className="text-center text-xs text-[var(--muted)]">
          Changes save automatically.
        </p>
      )}
    </div>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs text-[var(--muted)] mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-[var(--surface-2)] py-3">
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-[var(--muted)]">{label}</div>
    </div>
  );
}
