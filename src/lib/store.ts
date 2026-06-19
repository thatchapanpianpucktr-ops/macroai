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

  return { foods, add, remove };
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
    settings: read<Settings>("settings", DEFAULT_SETTINGS),
    foods: read<FoodEntry[]>("foods", []),
    weights: read<WeightEntry[]>("weights", []),
  };
}
