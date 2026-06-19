import type {
  ActivityLevel,
  FoodEntry,
  MacroTargets,
  Settings,
  WeightEntry,
} from "./types";

/** kcal stored per kg of body mass change (~7700 kcal per kg). */
export const KCAL_PER_KG = 7700;

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Mifflin-St Jeor basal metabolic rate. */
export function bmr(settings: Settings, weightKg: number): number {
  const base = 10 * weightKg + 6.25 * settings.heightCm - 5 * settings.age;
  return settings.sex === "male" ? base + 5 : base - 161;
}

/** Cold-start expenditure estimate from formula (used before we have data). */
export function formulaTDEE(settings: Settings, weightKg: number): number {
  return bmr(settings, weightKg) * ACTIVITY_FACTOR[settings.activity];
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseYmd(s: string): number {
  return new Date(s + "T00:00:00Z").getTime();
}

/**
 * Build a daily, gap-filled weight series and smooth it with an
 * exponentially-weighted moving average. Returns one point per calendar day
 * between the first and last entry. This is the "trend weight" that smooths
 * out day-to-day water-weight noise (the core of the adaptive approach).
 */
export function weightTrend(
  weights: WeightEntry[],
  alpha = 0.12,
): { date: string; kg: number }[] {
  if (weights.length === 0) return [];
  const sorted = [...weights].sort((a, b) => parseYmd(a.date) - parseYmd(b.date));
  const byDate = new Map(sorted.map((w) => [w.date, w.kg]));

  const start = parseYmd(sorted[0].date);
  const end = parseYmd(sorted[sorted.length - 1].date);

  const out: { date: string; kg: number }[] = [];
  let ema = sorted[0].kg;
  let lastRaw = sorted[0].kg;
  for (let t = start; t <= end; t += 86400000) {
    const date = ymd(new Date(t));
    const raw = byDate.get(date);
    if (raw != null) {
      lastRaw = raw;
      ema = alpha * raw + (1 - alpha) * ema;
    } else {
      // carry trend forward gently toward last known raw value
      ema = alpha * lastRaw + (1 - alpha) * ema;
    }
    out.push({ date, kg: Math.round(ema * 100) / 100 });
  }
  return out;
}

/** Latest smoothed (trend) weight, or latest raw weight as a fallback. */
export function currentWeight(weights: WeightEntry[]): number | null {
  const trend = weightTrend(weights);
  if (trend.length) return trend[trend.length - 1].kg;
  return null;
}

function sumDayCalories(foods: FoodEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of foods) m.set(f.date, (m.get(f.date) ?? 0) + f.calories);
  return m;
}

export interface TDEEResult {
  tdee: number;
  /** 0-1 — how much real data backs the estimate vs the cold-start formula */
  confidence: number;
  method: "formula" | "adaptive";
  daysUsed: number;
}

/**
 * Adaptive TDEE: reconcile average logged intake against the body-weight
 * trend over a trailing window. Energy balance = intake - expenditure, and
 * balance shows up as weight change (slope * KCAL_PER_KG). So:
 *     expenditure = intake - slope_kcal
 * We blend this with the formula estimate, weighted by how much data we have.
 */
export function estimateTDEE(
  settings: Settings,
  weights: WeightEntry[],
  foods: FoodEntry[],
  windowDays = 21,
): TDEEResult {
  const weight = currentWeight(weights);
  const formula = weight ? formulaTDEE(settings, weight) : 2000;

  const trend = weightTrend(weights);
  const calByDay = sumDayCalories(foods);

  // Window = last `windowDays` of the trend that also have intake logged.
  const window = trend.slice(-windowDays);
  const daysWithIntake = window.filter((p) => calByDay.has(p.date));

  if (window.length < 8 || daysWithIntake.length < 7) {
    return {
      tdee: Math.round(formula),
      confidence: 0,
      method: "formula",
      daysUsed: daysWithIntake.length,
    };
  }

  // Linear regression of trend weight over day index -> kg/day slope.
  const n = window.length;
  const xs = window.map((_, i) => i);
  const ys = window.map((p) => p.kg);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slopeKgPerDay = den === 0 ? 0 : num / den;

  const meanIntake =
    daysWithIntake.reduce((a, p) => a + (calByDay.get(p.date) ?? 0), 0) /
    daysWithIntake.length;

  const adaptive = meanIntake - slopeKgPerDay * KCAL_PER_KG;

  // Confidence grows with the number of intake days, capped at the window.
  const confidence = Math.min(daysWithIntake.length / windowDays, 1);
  const blended = confidence * adaptive + (1 - confidence) * formula;

  // Guard against absurd values from sparse/odd data.
  const clamped = Math.max(1000, Math.min(blended, 6000));

  return {
    tdee: Math.round(clamped),
    confidence: Math.round(confidence * 100) / 100,
    method: "adaptive",
    daysUsed: daysWithIntake.length,
  };
}

/** Daily calorie + macro targets given the current TDEE estimate. */
export function computeTargets(
  settings: Settings,
  tdee: number,
  weightKg: number | null,
): MacroTargets {
  const dailyDelta =
    settings.goal === "maintain"
      ? 0
      : (settings.goal === "gain" ? 1 : -1) *
        (settings.rateKgPerWeek * KCAL_PER_KG) / 7;

  let calories = Math.round(tdee + dailyDelta);

  // Never push below a safe floor (~BMR) for deficits.
  if (weightKg) {
    const floor = Math.round(bmr(settings, weightKg) * 1.0);
    calories = Math.max(calories, Math.min(floor, tdee));
  }
  calories = Math.max(calories, 1200);

  const weightForProtein = weightKg ?? 70;
  const protein = Math.round(settings.proteinPerKg * weightForProtein);
  const fat = Math.round((calories * settings.fatPctOfCalories) / 9);
  const proteinCals = protein * 4;
  const fatCals = fat * 9;
  const carbs = Math.max(0, Math.round((calories - proteinCals - fatCals) / 4));

  return { calories, protein, carbs, fat };
}
