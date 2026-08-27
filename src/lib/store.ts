"use client";

import { useSyncExternalStore, useCallback } from "react";
import {
  DEFAULT_GYM_PLAN,
  DEFAULT_SETTINGS,
  type ChatMessage,
  type FoodEntry,
  type GymPlan,
  type Settings,
  type WeightEntry,
  type WorkoutSession,
} from "./types";
import { defaultMeal } from "./meal";

const KEYS = {
  settings: "macroai.settings.v1",
  foods: "macroai.foods.v1",
  weights: "macroai.weights.v1",
  water: "macroai.water.v1",
  workouts: "macroai.workouts.v1",
  gymPlan: "macroai.gymPlan.v1",
  gymChat: "macroai.gymChat.v1",
  steps: "macroai.steps.v1",
  // Intentionally NOT included in export/import backups (a secret).
  geminiKey: "macroai.geminiKey.v1",
} as const;

/** map of YYYY-MM-DD -> number of glasses */
type WaterMap = Record<string, number>;
/** map of YYYY-MM-DD -> step count */
type StepsMap = Record<string, number>;

type Key = keyof typeof KEYS;

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  // keep multiple tabs in sync
  const onStorage = (e: StorageEvent) => {
    if (e.key && (Object.values(KEYS) as string[]).includes(e.key)) cb();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined")
      window.removeEventListener("storage", onStorage);
  };
}

function read<T>(key: Key, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(KEYS[key]);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === "QuotaExceededError" ||
      e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      // Some browsers use code 22 / 1014 without the modern name.
      e.code === 22 ||
      e.code === 1014)
  );
}

/** Drop photos from the oldest food entries first (list is newest-first). */
function stripOldestThumbs(foods: FoodEntry[], count: number): FoodEntry[] {
  if (count <= 0) return foods;
  const indices: number[] = [];
  for (let i = foods.length - 1; i >= 0; i--) {
    if (foods[i]?.thumb) indices.push(i);
  }
  const drop = new Set(indices.slice(0, count));
  if (drop.size === 0) return foods;
  return foods.map((f, i) => (drop.has(i) ? { ...f, thumb: undefined } : f));
}

function trySetItem(key: string, raw: string): boolean {
  try {
    window.localStorage.setItem(key, raw);
    return true;
  } catch (e) {
    if (isQuotaError(e)) return false;
    throw e;
  }
}

/** Free space by dropping oldest food photos. Returns how many were removed. */
function freeSpaceByStrippingThumbs(): number {
  const list = read<FoodEntry[]>("foods", []);
  const withThumbs = list.filter((f) => f.thumb).length;
  if (withThumbs === 0) return 0;

  const batch = Math.max(3, Math.ceil(withThumbs * 0.1));
  let foods = stripOldestThumbs(list, batch);
  const removed = Math.min(batch, withThumbs);
  const raw = JSON.stringify(foods);
  if (trySetItem(KEYS.foods, raw)) return removed;

  // Still over quota — strip everything photo-related.
  foods = foods.map((f) => (f.thumb ? { ...f, thumb: undefined } : f));
  trySetItem(KEYS.foods, JSON.stringify(foods));
  return withThumbs;
}

function write<T>(key: Key, value: T) {
  if (typeof window === "undefined") return;
  const storageKey = KEYS[key];
  let payload: unknown = value;
  let raw = JSON.stringify(payload);

  if (trySetItem(storageKey, raw)) {
    emit();
    return;
  }

  // Full-res scan drafts are the biggest reclaimable chunk.
  try {
    window.localStorage.removeItem("macroai.photoDraft.v1");
  } catch {
    /* ignore */
  }

  if (trySetItem(storageKey, raw)) {
    emit();
    return;
  }

  // Drop oldest kept meal photos until the write fits (macros stay).
  if (key === "foods" && Array.isArray(value)) {
    let foods = value as FoodEntry[];
    const batch = Math.max(
      3,
      Math.ceil(foods.filter((f) => f.thumb).length * 0.1) || 3,
    );
    for (let attempt = 0; attempt < 50; attempt++) {
      const before = foods.filter((f) => f.thumb).length;
      if (before === 0) break;
      foods = stripOldestThumbs(foods, batch);
      payload = foods;
      raw = JSON.stringify(payload);
      if (trySetItem(storageKey, raw)) {
        emit();
        return;
      }
    }
    foods = foods.map((f) => (f.thumb ? { ...f, thumb: undefined } : f));
    raw = JSON.stringify(foods);
    if (trySetItem(storageKey, raw)) {
      emit();
      return;
    }
  } else {
    for (let attempt = 0; attempt < 20; attempt++) {
      const freed = freeSpaceByStrippingThumbs();
      if (freed === 0) break;
      if (trySetItem(storageKey, raw)) {
        emit();
        return;
      }
    }
  }

  // Still full — surface the real browser error.
  window.localStorage.setItem(storageKey, raw);
  emit();
}

/**
 * Remove kept meal photos to free localStorage space.
 * Meal macros stay; only the images go.
 * Pass `olderThanDays` to keep recent photos (e.g. 14), or omit to clear all.
 * Returns how many photos were removed.
 */
export function clearFoodThumbs(olderThanDays?: number): number {
  if (typeof window === "undefined") return 0;
  const list = read<FoodEntry[]>("foods", []);
  const cutoff =
    olderThanDays != null
      ? Date.now() - olderThanDays * 24 * 60 * 60 * 1000
      : null;
  let removed = 0;
  const next = list.map((f) => {
    if (!f.thumb) return f;
    if (cutoff != null) {
      const t = Date.parse(f.createdAt || f.date);
      if (!Number.isFinite(t) || t >= cutoff) return f;
    }
    removed += 1;
    return { ...f, thumb: undefined };
  });
  if (removed > 0) write("foods", next);
  return removed;
}

// ---- Settings ----------------------------------------------------------

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const settings = useSyncExternalStore(
    subscribe,
    () => {
      const s = read<Settings>("settings", DEFAULT_SETTINGS);
      return JSON.stringify({ ...DEFAULT_SETTINGS, ...s });
    },
    () => JSON.stringify(DEFAULT_SETTINGS),
  );
  const parsed = JSON.parse(settings) as Settings;
  const update = useCallback((patch: Partial<Settings>) => {
    const current = read<Settings>("settings", DEFAULT_SETTINGS);
    write("settings", { ...DEFAULT_SETTINGS, ...current, ...patch });
  }, []);
  return [parsed, update];
}

// ---- Foods -------------------------------------------------------------

export function useFoods(): {
  foods: FoodEntry[];
  add: (f: Omit<FoodEntry, "id" | "createdAt">) => void;
  remove: (id: string) => void;
  update: (
    id: string,
    patch: Partial<Omit<FoodEntry, "id" | "createdAt">>,
  ) => void;
} {
  const json = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(read<FoodEntry[]>("foods", [])),
    () => "[]",
  );
  const foods = JSON.parse(json) as FoodEntry[];

  const add = useCallback((f: Omit<FoodEntry, "id" | "createdAt">) => {
    const list = read<FoodEntry[]>("foods", []);
    const entry: FoodEntry = {
      ...f,
      meal: f.meal ?? defaultMeal(),
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2),
      createdAt: new Date().toISOString(),
    };
    write("foods", [entry, ...list]);
  }, []);

  const remove = useCallback((id: string) => {
    const list = read<FoodEntry[]>("foods", []);
    write(
      "foods",
      list.filter((f) => f.id !== id),
    );
  }, []);

  const update = useCallback(
    (id: string, patch: Partial<Omit<FoodEntry, "id" | "createdAt">>) => {
      const list = read<FoodEntry[]>("foods", []);
      write(
        "foods",
        list.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      );
    },
    [],
  );

  return { foods, add, remove, update };
}

// ---- Weights -----------------------------------------------------------

export function useWeights(): {
  weights: WeightEntry[];
  setWeight: (date: string, kg: number) => void;
  remove: (date: string) => void;
} {
  const json = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(read<WeightEntry[]>("weights", [])),
    () => "[]",
  );
  const weights = JSON.parse(json) as WeightEntry[];

  const setWeight = useCallback((date: string, kg: number) => {
    const list = read<WeightEntry[]>("weights", []);
    const without = list.filter((w) => w.date !== date);
    write("weights", [...without, { date, kg }]);
  }, []);

  const remove = useCallback((date: string) => {
    const list = read<WeightEntry[]>("weights", []);
    write(
      "weights",
      list.filter((w) => w.date !== date),
    );
  }, []);

  return { weights, setWeight, remove };
}

// ---- Water -------------------------------------------------------------

export function useWater(date: string): {
  glasses: number;
  setGlasses: (n: number) => void;
} {
  const json = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(read<WaterMap>("water", {})),
    () => "{}",
  );
  const map = JSON.parse(json) as WaterMap;
  const glasses = map[date] ?? 0;

  const setGlasses = useCallback(
    (n: number) => {
      const current = read<WaterMap>("water", {});
      const next = Math.max(0, Math.round(n));
      if (next === 0) delete current[date];
      else current[date] = next;
      write("water", current);
    },
    [date],
  );

  return { glasses, setGlasses };
}

// ---- Workouts ----------------------------------------------------------

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function useWorkouts(): {
  workouts: WorkoutSession[];
  add: (w: Omit<WorkoutSession, "id" | "createdAt">) => WorkoutSession;
  remove: (id: string) => void;
  update: (
    id: string,
    patch: Partial<Omit<WorkoutSession, "id" | "createdAt">>,
  ) => void;
} {
  const json = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(read<WorkoutSession[]>("workouts", [])),
    () => "[]",
  );
  const workouts = JSON.parse(json) as WorkoutSession[];

  const add = useCallback((w: Omit<WorkoutSession, "id" | "createdAt">) => {
    const list = read<WorkoutSession[]>("workouts", []);
    const entry: WorkoutSession = {
      ...w,
      id: newId(),
      createdAt: new Date().toISOString(),
    };
    write("workouts", [entry, ...list]);
    return entry;
  }, []);

  const remove = useCallback((id: string) => {
    const list = read<WorkoutSession[]>("workouts", []);
    write(
      "workouts",
      list.filter((w) => w.id !== id),
    );
  }, []);

  const update = useCallback(
    (
      id: string,
      patch: Partial<Omit<WorkoutSession, "id" | "createdAt">>,
    ) => {
      const list = read<WorkoutSession[]>("workouts", []);
      write(
        "workouts",
        list.map((w) => (w.id === id ? { ...w, ...patch } : w)),
      );
    },
    [],
  );

  return { workouts, add, remove, update };
}

export function useGymPlan(): [GymPlan, (patch: Partial<GymPlan>) => void] {
  const json = useSyncExternalStore(
    subscribe,
    () => {
      const p = read<GymPlan>("gymPlan", DEFAULT_GYM_PLAN);
      return JSON.stringify({ ...DEFAULT_GYM_PLAN, ...p });
    },
    () => JSON.stringify(DEFAULT_GYM_PLAN),
  );
  const plan = JSON.parse(json) as GymPlan;
  const update = useCallback((patch: Partial<GymPlan>) => {
    const current = read<GymPlan>("gymPlan", DEFAULT_GYM_PLAN);
    write("gymPlan", { ...DEFAULT_GYM_PLAN, ...current, ...patch });
  }, []);
  return [plan, update];
}

export function useGymChat(): {
  messages: ChatMessage[];
  setMessages: (msgs: ChatMessage[]) => void;
  clear: () => void;
} {
  const json = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(read<ChatMessage[]>("gymChat", [])),
    () => "[]",
  );
  const messages = JSON.parse(json) as ChatMessage[];
  const setMessages = useCallback((msgs: ChatMessage[]) => {
    write("gymChat", msgs.slice(-80));
  }, []);
  const clear = useCallback(() => write("gymChat", []), []);
  return { messages, setMessages, clear };
}

export function useSteps(date: string): {
  steps: number;
  setSteps: (n: number) => void;
} {
  const json = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(read<StepsMap>("steps", {})),
    () => "{}",
  );
  const map = JSON.parse(json) as StepsMap;
  const steps = map[date] ?? 0;

  const setSteps = useCallback(
    (n: number) => {
      const current = read<StepsMap>("steps", {});
      const next = Math.max(0, Math.round(n));
      if (next === 0) delete current[date];
      else current[date] = next;
      write("steps", current);
    },
    [date],
  );

  return { steps, setSteps };
}

// ---- Gemini API key (per-device, never exported) -----------------------

export function useApiKey(): [string, (k: string) => void] {
  const key = useSyncExternalStore(
    subscribe,
    () => read<string>("geminiKey", ""),
    () => "",
  );
  const setKey = useCallback((k: string) => write("geminiKey", k.trim()), []);
  return [key, setKey];
}

export function exportAll() {
  return {
    app: "macroai",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: read<Settings>("settings", DEFAULT_SETTINGS),
    foods: read<FoodEntry[]>("foods", []),
    weights: read<WeightEntry[]>("weights", []),
    water: read<WaterMap>("water", {}),
    workouts: read<WorkoutSession[]>("workouts", []),
    gymPlan: read<GymPlan>("gymPlan", DEFAULT_GYM_PLAN),
    steps: read<StepsMap>("steps", {}),
  };
}

export type BackupShape = {
  settings?: Partial<Settings>;
  foods?: FoodEntry[];
  weights?: WeightEntry[];
  water?: WaterMap;
  workouts?: WorkoutSession[];
  gymPlan?: Partial<GymPlan>;
  steps?: StepsMap;
};

/**
 * Restore data from a backup object. `mode` "replace" overwrites everything;
 * "merge" keeps existing food/weight/workout entries and adds non-duplicate ones.
 * Returns a small summary for the UI.
 */
export function importAll(
  data: BackupShape,
  mode: "replace" | "merge" = "replace",
): { foods: number; weights: number; workouts: number } {
  if (typeof window === "undefined")
    return { foods: 0, weights: 0, workouts: 0 };
  if (!data || typeof data !== "object") throw new Error("Invalid backup file");

  const incomingFoods = Array.isArray(data.foods) ? data.foods : [];
  const incomingWeights = Array.isArray(data.weights) ? data.weights : [];
  const incomingWorkouts = Array.isArray(data.workouts) ? data.workouts : [];

  if (data.settings && typeof data.settings === "object") {
    const current = read<Settings>("settings", DEFAULT_SETTINGS);
    write("settings", { ...DEFAULT_SETTINGS, ...current, ...data.settings });
  }

  if (data.gymPlan && typeof data.gymPlan === "object") {
    const current = read<GymPlan>("gymPlan", DEFAULT_GYM_PLAN);
    write("gymPlan", { ...DEFAULT_GYM_PLAN, ...current, ...data.gymPlan });
  }

  if (data.water && typeof data.water === "object") {
    if (mode === "replace") {
      write("water", data.water);
    } else {
      write("water", { ...read<WaterMap>("water", {}), ...data.water });
    }
  }

  if (data.steps && typeof data.steps === "object") {
    if (mode === "replace") {
      write("steps", data.steps);
    } else {
      write("steps", { ...read<StepsMap>("steps", {}), ...data.steps });
    }
  }

  if (mode === "replace") {
    write("foods", incomingFoods);
    write("weights", incomingWeights);
    write("workouts", incomingWorkouts);
    return {
      foods: incomingFoods.length,
      weights: incomingWeights.length,
      workouts: incomingWorkouts.length,
    };
  }

  // merge
  const curFoods = read<FoodEntry[]>("foods", []);
  const foodIds = new Set(curFoods.map((f) => f.id));
  const mergedFoods = [...curFoods];
  for (const f of incomingFoods) if (f?.id && !foodIds.has(f.id)) mergedFoods.push(f);

  const curWeights = read<WeightEntry[]>("weights", []);
  const weightDates = new Map(curWeights.map((w) => [w.date, w]));
  for (const w of incomingWeights) if (w?.date) weightDates.set(w.date, w);

  const curWorkouts = read<WorkoutSession[]>("workouts", []);
  const workoutIds = new Set(curWorkouts.map((w) => w.id));
  const mergedWorkouts = [...curWorkouts];
  for (const w of incomingWorkouts)
    if (w?.id && !workoutIds.has(w.id)) mergedWorkouts.push(w);

  write("foods", mergedFoods);
  write("weights", Array.from(weightDates.values()));
  write("workouts", mergedWorkouts);
  return {
    foods: mergedFoods.length,
    weights: weightDates.size,
    workouts: mergedWorkouts.length,
  };
}
