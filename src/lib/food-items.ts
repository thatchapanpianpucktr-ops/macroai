import type { FoodEntry, FoodSubItem } from "./types";

export function sumFoodItems(items: FoodSubItem[]): {
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
} {
  const sum = items.reduce(
    (a, it) => ({
      grams: a.grams + (it.grams || 0),
      calories: a.calories + it.calories,
      protein: a.protein + it.protein,
      carbs: a.carbs + it.carbs,
      fat: a.fat + it.fat,
    }),
    { grams: 0, calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return {
    grams: Math.round(sum.grams),
    calories: Math.round(sum.calories),
    protein: Math.round(sum.protein * 10) / 10,
    carbs: Math.round(sum.carbs * 10) / 10,
    fat: Math.round(sum.fat * 10) / 10,
  };
}

export function scaleFoodItems(items: FoodSubItem[], factor: number): FoodSubItem[] {
  const f = Math.max(0, factor);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return items.map((it) => ({
    name: it.name,
    grams: Math.round((it.grams || 0) * f),
    calories: Math.round(it.calories * f),
    protein: r1(it.protein * f),
    carbs: r1(it.carbs * f),
    fat: r1(it.fat * f),
    confidence: it.confidence,
    calorieMin:
      it.calorieMin != null ? Math.round(it.calorieMin * f) : undefined,
    calorieMax:
      it.calorieMax != null ? Math.round(it.calorieMax * f) : undefined,
  }));
}

export function entryToSubItems(
  entry: {
    name: string;
    grams?: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    items?: FoodSubItem[];
  },
): FoodSubItem[] {
  if (entry.items && entry.items.length > 0) return entry.items;
  return [
    {
      name: entry.name,
      grams: entry.grams ?? 0,
      calories: entry.calories,
      protein: entry.protein,
      carbs: entry.carbs,
      fat: entry.fat,
    },
  ];
}

export function subItemsToChatItems(items: FoodSubItem[]) {
  return items.map((it) => ({
    name: it.name,
    grams: it.grams,
    calories: it.calories,
    protein: it.protein,
    carbs: it.carbs,
    fat: it.fat,
  }));
}

export function chatItemsToSubItems(
  items: {
    name: string;
    grams: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }[],
  previous?: FoodSubItem[],
): FoodSubItem[] {
  return items.map((it, i) => {
    const prev =
      previous?.find(
        (p) => p.name.trim().toLowerCase() === it.name.trim().toLowerCase(),
      ) ?? previous?.[i];
    return {
      name: it.name,
      grams: Math.round(it.grams || 0),
      calories: Math.round(it.calories),
      protein: Math.round(it.protein * 10) / 10,
      carbs: Math.round(it.carbs * 10) / 10,
      fat: Math.round(it.fat * 10) / 10,
      confidence: prev?.confidence,
      calorieMin: prev?.calorieMin,
      calorieMax: prev?.calorieMax,
    };
  });
}

/** All kept photos on a food entry (new `thumbs` array, or legacy single `thumb`). */
export function foodThumbs(
  entry: Pick<FoodEntry, "thumb" | "thumbs">,
): string[] {
  if (entry.thumbs?.length) return entry.thumbs.filter(Boolean);
  return entry.thumb ? [entry.thumb] : [];
}

export function entryHasPhoto(
  entry: Pick<FoodEntry, "thumb" | "thumbs">,
): boolean {
  return foodThumbs(entry).length > 0;
}

export function stripEntryPhotos<T extends Pick<FoodEntry, "thumb" | "thumbs">>(
  entry: T,
): T {
  return { ...entry, thumb: undefined, thumbs: undefined };
}

/** Parse a kept meal photo data URL for Gemini inline upload. */
export function thumbToInlineImage(
  thumb: string,
): { base64: string; mimeType: string } | null {
  const match = thumb.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}
