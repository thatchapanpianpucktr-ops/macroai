"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CalorieRing, MacroBar } from "@/components/Progress";
import { FoodScanner } from "@/components/FoodScanner";
import { useFoods, useSettings, useWeights } from "@/lib/store";
import { currentWeight, estimateTDEE, resolveTargets } from "@/lib/tdee";
import { todayYmd, ymdToLabel } from "@/lib/date";

export default function TodayPage() {
  const [settings] = useSettings();
  const { foods, remove } = useFoods();
  const { weights } = useWeights();
  const date = todayYmd();

  const tdee = useMemo(
    () => estimateTDEE(settings, weights, foods),
    [settings, weights, foods],
  );
  const weight = useMemo(() => currentWeight(weights), [weights]);
  const targets = useMemo(
    () => resolveTargets(settings, tdee.tdee, weight),
    [settings, tdee.tdee, weight],
  );

  const today = foods.filter((f) => f.date === date);
  const totals = today.reduce(
    (a, f) => ({
      calories: a.calories + f.calories,
      protein: a.protein + f.protein,
      carbs: a.carbs + f.carbs,
      fat: a.fat + f.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  if (!settings.onboarded) {
    return (
      <div className="flex flex-col items-center text-center gap-5 mt-16">
        <div className="text-5xl">🥗</div>
        <h1 className="text-2xl font-bold">Welcome to MacroAI</h1>
        <p className="text-[var(--muted)] max-w-xs">
          Snap a photo of your meal and AI estimates the calories &amp; macros.
          Log your weight and the app learns your real metabolism to set smart
          targets.
        </p>
        <Link href="/settings" className="btn btn-primary px-6 py-3">
          Get started
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Today</h1>
          <p className="text-sm text-[var(--muted)]">{ymdToLabel(date)}</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-[var(--muted)]">Est. expenditure</div>
          <div className="font-semibold tabular-nums">{tdee.tdee} kcal</div>
        </div>
      </header>

      <section className="card p-5 flex flex-col items-center">
        <CalorieRing consumed={totals.calories} target={targets.calories} />
        <div className="grid grid-cols-3 gap-4 w-full mt-5">
          <MacroBar
            label="Protein"
            value={totals.protein}
            target={targets.protein}
            color="var(--accent)"
          />
          <MacroBar
            label="Carbs"
            value={totals.carbs}
            target={targets.carbs}
            color="var(--accent-2)"
          />
          <MacroBar
            label="Fat"
            value={totals.fat}
            target={targets.fat}
            color="var(--warn)"
          />
        </div>
      </section>

      <FoodScanner date={date} />

      {settings.useCustomTargets ? (
        <p className="text-xs text-[var(--muted)] text-center px-4">
          Using your manual targets. Change them in Settings.
        </p>
      ) : (
        tdee.method === "formula" && (
          <p className="text-xs text-[var(--muted)] text-center px-4">
            Targets use a starting estimate. Log food &amp; weight for ~1 week and
            they’ll adapt to your real metabolism.
          </p>
        )
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--muted)]">
          Logged today ({today.length})
        </h2>
        {today.length === 0 && (
          <div className="card p-6 text-center text-sm text-[var(--muted)]">
            Nothing logged yet. Tap “Scan food” to start.
          </div>
        )}
        {today.map((f) => (
          <div key={f.id} className="card p-3 flex items-center gap-3">
            {f.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={f.thumb}
                alt=""
                className="w-12 h-12 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-[var(--surface-2)] grid place-items-center shrink-0 text-lg">
                🍽️
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{f.name}</div>
              <div className="text-xs text-[var(--muted)]">
                {f.grams ? `${f.grams} g · ` : ""}P {f.protein} · C {f.carbs} · F{" "}
                {f.fat}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-semibold tabular-nums">{f.calories}</div>
              <button
                onClick={() => remove(f.id)}
                className="text-[11px] text-[var(--danger)]"
              >
                remove
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
