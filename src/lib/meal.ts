import type { Meal } from "./types";

export const MEAL_ORDER: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

export const MEAL_ICONS: Record<Meal, string> = {
  breakfast: "🌅",
  lunch: "🍽️",
  dinner: "🌙",
  snack: "🍎",
};

/** Guess a meal from the time of day (local). */
export function defaultMeal(d: Date = new Date()): Meal {
  const h = d.getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}
