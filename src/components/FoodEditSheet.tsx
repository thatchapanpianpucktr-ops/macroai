"use client";

import { useEffect, useState } from "react";
import { NumberInput } from "@/components/NumberInput";
import type { FoodEntry } from "@/lib/types";

type Draft = {
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export function FoodEditSheet({
  entry,
  onClose,
  onSave,
  onDelete,
}: {
  entry: FoodEntry | null;
  onClose: () => void;
  onSave: (id: string, patch: Partial<FoodEntry>) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (entry) {
      setDraft({
        name: entry.name,
        grams: entry.grams ?? 0,
        calories: entry.calories,
        protein: entry.protein,
        carbs: entry.carbs,
        fat: entry.fat,
      });
    } else {
      setDraft(null);
    }
  }, [entry]);

  if (!entry || !draft) return null;

  const macroKcal = Math.round(
    draft.protein * 4 + draft.carbs * 4 + draft.fat * 9,
  );

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  function save() {
    if (!entry || !draft) return;
    onSave(entry.id, {
      name: draft.name.trim() || "Food",
      grams: draft.grams || undefined,
      calories: Math.max(0, Math.round(draft.calories)),
      protein: Math.max(0, draft.protein),
      carbs: Math.max(0, draft.carbs),
      fat: Math.max(0, draft.fat),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="w-full sm:max-w-md max-h-[88dvh] overflow-y-auto no-scrollbar card rounded-b-none sm:rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Edit item</h2>
          <button className="text-[var(--muted)] text-sm" onClick={onClose}>
            Cancel
          </button>
        </div>

        <label className="block mb-3">
          <span className="text-xs text-[var(--muted)] mb-1 block">Name</span>
          <input
            className="input"
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </label>

        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          <EditField
            label="grams"
            value={draft.grams}
            onChange={(v) => set("grams", v)}
          />
          <EditField
            label="kcal"
            value={draft.calories}
            onChange={(v) => set("calories", v)}
          />
          <EditField
            label="P"
            value={draft.protein}
            onChange={(v) => set("protein", v)}
          />
          <EditField
            label="C"
            value={draft.carbs}
            onChange={(v) => set("carbs", v)}
          />
          <EditField
            label="F"
            value={draft.fat}
            onChange={(v) => set("fat", v)}
          />
        </div>

        {macroKcal > 0 && Math.abs(macroKcal - draft.calories) > 15 && (
          <button
            className="text-xs text-[var(--accent-2)] mt-2"
            onClick={() => set("calories", macroKcal)}
          >
            Macros add up to {macroKcal} kcal — tap to use
          </button>
        )}

        <div className="flex gap-2 mt-5">
          <button
            className="btn btn-ghost flex-1 py-3"
            style={{ color: "var(--danger)" }}
            onClick={() => {
              onDelete(entry.id);
              onClose();
            }}
          >
            Delete
          </button>
          <button className="btn btn-primary flex-[2] py-3" onClick={save}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <NumberInput
        className="input py-1.5 text-center text-sm"
        value={value}
        onChange={onChange}
        selectOnFocus
        aria-label={label}
      />
      <span className="text-[10px] text-[var(--muted)]">{label}</span>
    </label>
  );
}
