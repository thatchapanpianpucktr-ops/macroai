"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalorieRing, MacroBar } from "@/components/Progress";
import { FoodScanner } from "@/components/FoodScanner";
import { FoodSearch } from "@/components/FoodSearch";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { FoodEditSheet } from "@/components/FoodEditSheet";
import { QuickAdd } from "@/components/QuickAdd";
import { WaterTracker } from "@/components/WaterTracker";
import { useFoods, useSettings, useWeights } from "@/lib/store";
import { currentWeight, estimateTDEE, resolveTargets } from "@/lib/tdee";
import { addDaysYmd, todayYmd, ymdToLabel } from "@/lib/date";
import { MEAL_ICONS, MEAL_LABELS, MEAL_ORDER } from "@/lib/meal";
import type { FoodEntry } from "@/lib/types";

export default function TodayPage() {
  const [settings] = useSettings();
  const { foods, remove, update } = useFoods();
  const { weights } = useWeights();
  const today = todayYmd(settings.timeZone);
  const [date, setDate] = useState(today);
  const [editingId, setEditingId] = useState<string | null>(null);
  const isToday = date === today;
  const isFuture = date >= today;

  const tdee = useMemo(
    () => estimateTDEE(settings, weights, foods),
    [settings, weights, foods],
  );
  const weight = useMemo(() => currentWeight(weights), [weights]);
  const targets = useMemo(
    () => resolveTargets(settings, tdee.tdee, weight),
    [settings, tdee.tdee, weight],
  );

  const dayFoods = foods.filter((f) => f.date === date);
  const totals = dayFoods.reduce(
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
      <header className="flex items-center justify-between gap-2">
        <button
          className="w-9 h-9 rounded-full bg-[var(--surface-2)] grid place-items-center text-lg shrink-0"
          onClick={() => setDate((d) => addDaysYmd(d, -1))}
          aria-label="Previous day"
        >
          ‹
        </button>
        <div className="text-center flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">
            {isToday ? "Today" : ymdToLabel(date)}
          </h1>
          <button
            className="text-xs text-[var(--muted)]"
            onClick={() => setDate(today)}
          >
            {isToday ? `Est. ${tdee.tdee} kcal/day` : "jump to today"}
          </button>
        </div>
        <button
          className="w-9 h-9 rounded-full bg-[var(--surface-2)] grid place-items-center text-lg shrink-0 disabled:opacity-30"
          onClick={() => setDate((d) => addDaysYmd(d, 1))}
          disabled={isFuture}
          aria-label="Next day"
        >
          ›
        </button>
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

      <div className="grid grid-cols-2 gap-2">
        <FoodSearch date={date} />
        <BarcodeScanner date={date} />
      </div>

      <QuickAdd date={date} />

      <WaterTracker date={date} />

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

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-[var(--muted)]">
          {isToday ? "Logged today" : "Logged"} ({dayFoods.length})
        </h2>
        {dayFoods.length === 0 && (
          <div className="card p-6 text-center text-sm text-[var(--muted)]">
            Nothing logged yet. Take a photo, describe it, or add manually.
          </div>
        )}
        {MEAL_ORDER.map((meal) => {
          const items = dayFoods.filter((f) => (f.meal ?? "snack") === meal);
          if (items.length === 0) return null;
          const kcal = items.reduce((a, f) => a + f.calories, 0);
          return (
            <div key={meal} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {MEAL_ICONS[meal]} {MEAL_LABELS[meal]}
                </h3>
                <span className="text-xs text-[var(--muted)] tabular-nums">
                  {Math.round(kcal)} kcal
                </span>
              </div>
              {items.map((f) => (
                <FoodRow key={f.id} f={f} onClick={() => setEditingId(f.id)} />
              ))}
            </div>
          );
        })}
      </section>

      <FoodEditSheet
        entry={dayFoods.find((f) => f.id === editingId) ?? null}
        onClose={() => setEditingId(null)}
        onSave={(id, patch) => update(id, patch)}
        onDelete={(id) => remove(id)}
      />
    </div>
  );
}

function FoodRow({ f, onClick }: { f: FoodEntry; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="card p-3 flex items-center gap-3 w-full text-left active:opacity-80"
    >
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
          {f.grams ? `${f.grams} g · ` : ""}P {f.protein} · C {f.carbs} · F {f.fat}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-semibold tabular-nums">{f.calories}</div>
        <div className="text-[11px] text-[var(--muted)]">edit</div>
      </div>
    </button>
  );
}
