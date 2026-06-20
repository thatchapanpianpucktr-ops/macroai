"use client";

import { useState } from "react";
import { useFoods } from "@/lib/store";
import { NumberInput } from "@/components/NumberInput";
import type { FoodHit } from "@/lib/foodsearch-types";

export function FoodSearch({ date }: { date: string }) {
  const { add } = useFoods();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<FoodHit[]>([]);
  const [grams, setGrams] = useState<Record<number, number>>({});
  const [added, setAdded] = useState<number | null>(null);

  async function search() {
    const term = q.trim();
    if (!term) return;
    setLoading(true);
    setError(null);
    setHits([]);
    try {
      const res = await fetch(`/api/foodsearch?q=${encodeURIComponent(term)}`);
      const data = (await res.json()) as { items?: FoodHit[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Search failed");
      setHits(data.items ?? []);
      const g: Record<number, number> = {};
      (data.items ?? []).forEach((h, i) => (g[i] = h.servingG || 100));
      setGrams(g);
      if ((data.items ?? []).length === 0) setError("No matches found.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function scaled(h: FoodHit, g: number) {
    const r = g / 100;
    return {
      calories: Math.round(h.per100.calories * r),
      protein: Math.round(h.per100.protein * r * 10) / 10,
      carbs: Math.round(h.per100.carbs * r * 10) / 10,
      fat: Math.round(h.per100.fat * r * 10) / 10,
    };
  }

  function addHit(h: FoodHit, i: number) {
    const g = grams[i] || 100;
    const s = scaled(h, g);
    add({
      date,
      name: h.brand ? `${h.name} (${h.brand})` : h.name,
      grams: g,
      ...s,
      source: "db",
    });
    setAdded(i);
    setTimeout(() => setAdded((v) => (v === i ? null : v)), 900);
  }

  function close() {
    setOpen(false);
    setQ("");
    setHits([]);
    setError(null);
    setGrams({});
  }

  return (
    <>
      <button
        className="btn btn-ghost w-full py-3"
        onClick={() => setOpen(true)}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={1.8} />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
        </svg>
        Search food database
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
          <div className="w-full sm:max-w-md max-h-[88dvh] overflow-y-auto no-scrollbar card rounded-b-none sm:rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Search foods</h2>
              <button className="text-[var(--muted)] text-sm" onClick={close}>
                Close
              </button>
            </div>

            <div className="flex gap-2 mb-3">
              <input
                className="input flex-1"
                placeholder="e.g. greek yogurt, oats, coca cola"
                value={q}
                autoFocus
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading) search();
                }}
              />
              <button
                className="btn btn-primary px-4 disabled:opacity-50"
                onClick={search}
                disabled={loading || !q.trim()}
              >
                {loading ? "…" : "Search"}
              </button>
            </div>

            <p className="text-[11px] text-[var(--muted)] mb-3">
              Real nutrition data from Open Food Facts. Per-100g values are
              accurate; set the grams you ate.
            </p>

            {error && (
              <div className="text-sm text-[var(--muted)] py-2">{error}</div>
            )}

            <div className="space-y-2">
              {hits.map((h, i) => {
                const g = grams[i] || 100;
                const s = scaled(h, g);
                return (
                  <div key={i} className="rounded-xl bg-[var(--surface-2)] p-3">
                    <div className="font-medium text-sm">{h.name}</div>
                    {h.brand && (
                      <div className="text-[11px] text-[var(--muted)] mb-2">
                        {h.brand}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <NumberInput
                          className="input py-1.5 w-20 text-center text-sm"
                          value={g}
                          onChange={(v) =>
                            setGrams((prev) => ({ ...prev, [i]: v }))
                          }
                          selectOnFocus
                          aria-label="grams"
                        />
                        <span className="text-xs text-[var(--muted)]">g</span>
                      </div>
                      <div className="flex-1 text-xs text-[var(--muted)]">
                        {s.calories} kcal · P {s.protein} · C {s.carbs} · F {s.fat}
                      </div>
                      <button
                        className="btn btn-primary px-3 py-1.5 text-sm"
                        onClick={() => addHit(h, i)}
                      >
                        {added === i ? "✓" : "Add"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
