"use client";

import { useMemo, useState } from "react";
import { useFoods } from "@/lib/store";
import type { FoodEntry } from "@/lib/types";

/**
 * Quick-add row of the user's most recent distinct foods. One tap re-logs the
 * same item to the current day — fast, and boosts consistency (which is what
 * makes the adaptive engine reliable).
 */
export function QuickAdd({ date }: { date: string }) {
  const { foods, add } = useFoods();
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: FoodEntry[] = [];
    // foods are stored newest-first
    for (const f of foods) {
      const key = `${f.name}|${f.calories}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(f);
      if (out.length >= 12) break;
    }
    return out;
  }, [foods]);

  if (recent.length === 0) return null;

  function quickAdd(f: FoodEntry) {
    add({
      date,
      name: f.name,
      calories: f.calories,
      protein: f.protein,
      carbs: f.carbs,
      fat: f.fat,
      grams: f.grams,
      source: f.source,
    });
    const key = f.id;
    setJustAdded(key);
    setTimeout(() => setJustAdded((k) => (k === key ? null : k)), 900);
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-[var(--muted)] mb-2">
        Quick add
      </h2>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {recent.map((f) => (
          <button
            key={f.id}
            onClick={() => quickAdd(f)}
            className="shrink-0 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-left active:opacity-70 transition-opacity"
            style={{
              outline:
                justAdded === f.id ? "2px solid var(--accent)" : undefined,
            }}
          >
            <div className="text-sm font-medium max-w-[140px] truncate">
              {justAdded === f.id ? "Added ✓" : f.name}
            </div>
            <div className="text-[11px] text-[var(--muted)]">
              {f.calories} kcal{f.grams ? ` · ${f.grams}g` : ""}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
