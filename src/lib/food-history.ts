import { ymdToLabel } from "./date";
import type { FoodEntry } from "./types";

/** Auto-name a combined entry from the highest-calorie parts. */
export function deriveMealName(
  list: { name: string; calories: number }[],
): string {
  const top = [...list]
    .sort((a, b) => b.calories - a.calories)
    .slice(0, 3)
    .map((it) => it.name.trim())
    .filter(Boolean);
  if (top.length === 0) return "Meal";
  if (top.length === 1) return top[0];
  if (top.length === 2) return `${top[0]} with ${top[1]}`;
  return `${top[0]} with ${top[1]} & ${top[2]}`;
}

/** Find a past log that looks like the same meal (name or overlapping items). */
export function findSimilarMeal(
  foods: FoodEntry[],
  itemNames: string[],
  mealLabel: string,
  currentDate: string,
): FoodEntry | null {
  const names = itemNames.map((n) => n.toLowerCase().trim()).filter(Boolean);
  const label = mealLabel.toLowerCase().trim();

  let best: FoodEntry | null = null;
  let bestScore = 0;

  for (const f of foods) {
    if (f.date >= currentDate) continue;
    const pastNames = (
      f.items && f.items.length > 0 ? f.items.map((i) => i.name) : [f.name]
    )
      .map((n) => n.toLowerCase().trim())
      .filter(Boolean);

    let score = 0;
    const pastLabel = f.name.toLowerCase().trim();
    if (label && pastLabel === label) score += 6;
    else if (
      label &&
      pastLabel &&
      (pastLabel.includes(label) || label.includes(pastLabel))
    ) {
      score += 3;
    }

    for (const n of names) {
      for (const p of pastNames) {
        if (p === n) score += 3;
        else if (p.includes(n) || n.includes(p)) score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }

  return bestScore >= 4 ? best : null;
}

export function formatMealHistoryHint(entry: FoodEntry): string {
  const parts =
    entry.items && entry.items.length > 1
      ? entry.items.map((i) => i.name).join(", ")
      : entry.name;
  return `${entry.calories} kcal — ${parts}`;
}

export function mealHistoryLine(entry: FoodEntry): string {
  return `Last logged ${ymdToLabel(entry.date)}: ${formatMealHistoryHint(entry)}`;
}
