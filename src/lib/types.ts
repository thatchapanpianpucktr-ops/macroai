export type Sex = "male" | "female";
export type Goal = "lose" | "maintain" | "gain";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

export interface Settings {
  onboarded: boolean;
  sex: Sex;
  age: number;
  heightCm: number;
  activity: ActivityLevel;
  goal: Goal;
  /** desired rate of weight change in kg per week (absolute value) */
  rateKgPerWeek: number;
  /** protein target in grams per kg of bodyweight */
  proteinPerKg: number;
  /** fraction of calories from fat (0-1) */
  fatPctOfCalories: number;
  unit: "metric" | "imperial";
  /** IANA timezone for deciding the calendar "day"; "" = use device timezone */
  timeZone: string;
  /** when true, use the user-entered targets below instead of the adaptive calculation */
  useCustomTargets: boolean;
  customCalories: number;
  customProtein: number;
  customCarbs: number;
  customFat: number;
}

export interface WeightEntry {
  /** YYYY-MM-DD */
  date: string;
  kg: number;
}

export type Meal = "breakfast" | "lunch" | "dinner" | "snack";

export interface FoodEntry {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** ISO timestamp of creation */
  createdAt: string;
  name: string;
  description?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  grams?: number;
  meal?: Meal;
  source: "ai" | "manual" | "db" | "barcode";
  /** small base64 thumbnail for the log list */
  thumb?: string;
}

export interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DayTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type Confidence = "high" | "medium" | "low";

/** A single food item returned by the vision model. */
export interface AnalyzedItem {
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** the model's self-reported confidence, driven by portion clarity */
  confidence?: Confidence;
  /** realistic calorie range given portion uncertainty */
  calorieMin?: number;
  calorieMax?: number;
}

export interface AnalyzeResponse {
  items: AnalyzedItem[];
  note?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  sex: "male",
  age: 30,
  heightCm: 175,
  activity: "light",
  goal: "lose",
  rateKgPerWeek: 0.5,
  proteinPerKg: 1.8,
  fatPctOfCalories: 0.27,
  unit: "metric",
  timeZone: "",
  useCustomTargets: false,
  customCalories: 2000,
  customProtein: 150,
  customCarbs: 200,
  customFat: 60,
};
