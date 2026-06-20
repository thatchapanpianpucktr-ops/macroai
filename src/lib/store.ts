"use client";

import { useSyncExternalStore, useCallback } from "react";
import {
  DEFAULT_SETTINGS,
  type FoodEntry,
  type Settings,
  type WeightEntry,
} from "./types";

const KEYS = {
  settings: "macroai.settings.v1",
  foods: "macroai.foods.v1",
  weights: "macroai.weights.v1",
} as const;

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

function write<T>(key: Key, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEYS[key], JSON.stringify(value));
  emit();
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

export function exportAll() {
  return {
    app: "macroai",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: read<Settings>("settings", DEFAULT_SETTINGS),
    foods: read<FoodEntry[]>("foods", []),
    weights: read<WeightEntry[]>("weights", []),
  };
}

export type BackupShape = {
  settings?: Partial<Settings>;
  foods?: FoodEntry[];
  weights?: WeightEntry[];
};

/**
 * Restore data from a backup object. `mode` "replace" overwrites everything;
 * "merge" keeps existing food/weight entries and adds non-duplicate ones.
 * Returns a small summary for the UI.
 */
export function importAll(
  data: BackupShape,
  mode: "replace" | "merge" = "replace",
): { foods: number; weights: number } {
  if (typeof window === "undefined") return { foods: 0, weights: 0 };
  if (!data || typeof data !== "object") throw new Error("Invalid backup file");

  const incomingFoods = Array.isArray(data.foods) ? data.foods : [];
  const incomingWeights = Array.isArray(data.weights) ? data.weights : [];

  if (data.settings && typeof data.settings === "object") {
    const current = read<Settings>("settings", DEFAULT_SETTINGS);
    write("settings", { ...DEFAULT_SETTINGS, ...current, ...data.settings });
  }

  if (mode === "replace") {
    write("foods", incomingFoods);
    write("weights", incomingWeights);
    return { foods: incomingFoods.length, weights: incomingWeights.length };
  }

  // merge
  const curFoods = read<FoodEntry[]>("foods", []);
  const foodIds = new Set(curFoods.map((f) => f.id));
  const mergedFoods = [...curFoods];
  for (const f of incomingFoods) if (f?.id && !foodIds.has(f.id)) mergedFoods.push(f);

  const curWeights = read<WeightEntry[]>("weights", []);
  const weightDates = new Map(curWeights.map((w) => [w.date, w]));
  for (const w of incomingWeights) if (w?.date) weightDates.set(w.date, w);

  write("foods", mergedFoods);
  write("weights", Array.from(weightDates.values()));
  return { foods: mergedFoods.length, weights: weightDates.size };
}
