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
  /** preferred Gemini model; "" = use the app default (gemini-2.5-flash) */
  geminiModel: string;
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

/** One turn in a conversation with the AI about a meal/item. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** ISO timestamp */
  at: string;
}

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
  /** first kept meal photo (JPEG data URL, ~800px); dropped when storage fills */
  thumb?: string;
  /** all kept meal photos from the scan; `thumb` stays the first for older builds */
  thumbs?: string[];
  /** saved AI discussion about this item, if any */
  chat?: ChatMessage[];
  /** per-item breakdown when logged as one combined entry */
  items?: FoodSubItem[];
}

/** One line in a combined meal (e.g. rice, chicken, veg). */
export interface FoodSubItem {
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence?: Confidence;
  calorieMin?: number;
  calorieMax?: number;
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
  /** a short natural name for the whole meal, suggested by the model */
  mealName?: string;
  /** a brief natural-language explanation of how the AI identified and estimated the meal */
  explanation?: string;
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
  geminiModel: "",
  useCustomTargets: false,
  customCalories: 2000,
  customProtein: 150,
  customCarbs: 200,
  customFat: 60,
};

// ---- Gym ---------------------------------------------------------------

export type SplitTag =
  | "push"
  | "pull"
  | "legs"
  | "upper"
  | "lower"
  | "full"
  | "cardio"
  | "other";

export type LoadMode = "weighted" | "bodyweight" | "assisted";

export interface WorkoutSet {
  reps: number;
  /** working load when weighted */
  weightKg?: number;
  /** band/machine assist */
  assistanceKg?: number;
  /** extra load on bodyweight moves (weighted dips/pull-ups) */
  addedKg?: number;
  rpe?: number;
}

export interface WorkoutExercise {
  name: string;
  loadMode: LoadMode;
  sets: WorkoutSet[];
}

export interface CardioBlock {
  type: string;
  minutes: number;
  distanceKm?: number;
  intensity?: "easy" | "moderate" | "hard";
  /** treadmill grade, e.g. 12.5 */
  inclinePct?: number;
  /** walking/running speed */
  speedKmh?: number;
  estimatedKcal?: number;
}

export interface WorkoutSession {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  createdAt: string;
  split: SplitTag;
  status: "completed" | "skipped";
  exercises: WorkoutExercise[];
  cardio?: CardioBlock;
  notes?: string;
  estimatedKcal?: number;
  source: "manual" | "chat";
  chat?: ChatMessage[];
}

export interface GymPlan {
  daysPerWeek: number;
  template: SplitTag[];
  notes?: string;
}

export const DEFAULT_GYM_PLAN: GymPlan = {
  daysPerWeek: 5,
  template: ["push", "pull", "legs", "upper", "lower"],
  notes: "",
};

export const SPLIT_LABELS: Record<SplitTag, string> = {
  push: "Push",
  pull: "Pull",
  legs: "Legs",
  upper: "Upper",
  lower: "Lower",
  full: "Full body",
  cardio: "Cardio",
  other: "Other",
};
