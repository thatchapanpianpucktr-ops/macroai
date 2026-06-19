"use client";

import { useRef, useState } from "react";
import { downscale } from "@/lib/image";
import { useFoods } from "@/lib/store";
import type { AnalyzedItem, AnalyzeResponse } from "@/lib/types";

interface DraftItem extends AnalyzedItem {
  /** original grams from the model, used to scale when the user edits grams */
  baseGrams: number;
  basePer: { calories: number; protein: number; carbs: number; fat: number };
  include: boolean;
}

export function FoodScanner({ date }: { date: string }) {
  const { add } = useFoods();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [note, setNote] = useState<string | null>(null);

  function reset() {
    setItems([]);
    setThumb(null);
    setError(null);
    setNote(null);
    setLoading(false);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setOpen(true);
    reset();
    setLoading(true);
    try {
      const big = await downscale(file, 1024);
      const small = await downscale(file, 120, 0.7);
      setThumb(small.dataUrl);
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: big.base64, mimeType: big.mimeType }),
      });
      const data = (await res.json()) as AnalyzeResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setNote(data.note ?? null);
      setItems(
        (data.items ?? []).map((it) => ({
          ...it,
          baseGrams: it.grams || 1,
          basePer: {
            calories: it.calories,
            protein: it.protein,
            carbs: it.carbs,
            fat: it.fat,
          },
          include: true,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function updateGrams(idx: number, grams: number) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const ratio = grams / (it.baseGrams || 1);
        return {
          ...it,
          grams,
          calories: Math.round(it.basePer.calories * ratio),
          protein: Math.round(it.basePer.protein * ratio * 10) / 10,
          carbs: Math.round(it.basePer.carbs * ratio * 10) / 10,
          fat: Math.round(it.basePer.fat * ratio * 10) / 10,
        };
      }),
    );
  }

  function toggle(idx: number) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, include: !it.include } : it)),
    );
  }

  function addManualRow() {
    setItems((prev) => [
      ...prev,
      {
        name: "Manual item",
        grams: 100,
        baseGrams: 100,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        basePer: { calories: 0, protein: 0, carbs: 0, fat: 0 },
        include: true,
      },
    ]);
  }

  function commit() {
    items
      .filter((it) => it.include)
      .forEach((it) => {
        add({
          date,
          name: it.name,
          calories: it.calories,
          protein: it.protein,
          carbs: it.carbs,
          fat: it.fat,
          grams: it.grams,
          source: "ai",
          thumb: thumb ?? undefined,
        });
      });
    setOpen(false);
    reset();
  }

  const totalCals = items
    .filter((it) => it.include)
    .reduce((a, it) => a + it.calories, 0);

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFile}
      />

      <div className="grid grid-cols-2 gap-3">
        <button
          className="btn btn-primary py-3"
          onClick={() => fileRef.current?.click()}
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <path
              d="M4 8h3l2-3h6l2 3h3v11H4V8z"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinejoin="round"
            />
            <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth={1.8} />
          </svg>
          Scan food
        </button>
        <button
          className="btn btn-ghost py-3"
          onClick={() => {
            setOpen(true);
            reset();
            addManualRow();
          }}
        >
          + Add manually
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
          <div className="w-full sm:max-w-md max-h-[88dvh] overflow-y-auto no-scrollbar card rounded-b-none sm:rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Review &amp; log</h2>
              <button
                className="text-[var(--muted)] text-sm"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Cancel
              </button>
            </div>

            {thumb && (
              <img
                src={thumb}
                alt="food"
                className="w-full h-36 object-cover rounded-xl mb-3"
              />
            )}

            {loading && (
              <div className="py-10 text-center text-[var(--muted)]">
                <div className="animate-pulse">Analyzing photo…</div>
                <div className="text-xs mt-1">Estimating items &amp; portions</div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-[var(--danger)] text-[var(--danger)] text-sm p-3 mb-3">
                {error}
              </div>
            )}

            {note && !loading && (
              <div className="text-xs text-[var(--muted)] mb-2">{note}</div>
            )}

            {!loading && items.length > 0 && (
              <div className="space-y-3">
                {items.map((it, i) => (
                  <div
                    key={i}
                    className="rounded-xl bg-[var(--surface-2)] p-3"
                    style={{ opacity: it.include ? 1 : 0.45 }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        className="input flex-1 py-1.5 font-medium"
                        value={it.name}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, name: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <button
                        onClick={() => toggle(i)}
                        className="text-xs px-2 py-1 rounded-lg"
                        style={{
                          background: it.include
                            ? "var(--accent)"
                            : "var(--surface)",
                          color: it.include ? "#04231a" : "var(--muted)",
                        }}
                      >
                        {it.include ? "✓" : "+"}
                      </button>
                    </div>
                    <div className="grid grid-cols-5 gap-2 text-center text-xs">
                      <Field
                        label="grams"
                        value={it.grams}
                        onChange={(v) => updateGrams(i, v)}
                      />
                      <Field
                        label="kcal"
                        value={it.calories}
                        onChange={(v) =>
                          setItems((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, calories: v } : x,
                            ),
                          )
                        }
                      />
                      <Field
                        label="P"
                        value={it.protein}
                        onChange={(v) =>
                          setItems((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, protein: v } : x)),
                          )
                        }
                      />
                      <Field
                        label="C"
                        value={it.carbs}
                        onChange={(v) =>
                          setItems((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, carbs: v } : x)),
                          )
                        }
                      />
                      <Field
                        label="F"
                        value={it.fat}
                        onChange={(v) =>
                          setItems((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, fat: v } : x)),
                          )
                        }
                      />
                    </div>
                  </div>
                ))}

                <button
                  onClick={addManualRow}
                  className="text-sm text-[var(--accent-2)]"
                >
                  + add another item
                </button>
              </div>
            )}

            {!loading && (items.length > 0 || error) && (
              <button
                className="btn btn-primary w-full py-3 mt-4 disabled:opacity-50"
                disabled={items.filter((i) => i.include).length === 0}
                onClick={commit}
              >
                Add {totalCals} kcal to log
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Field({
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
      <input
        type="number"
        inputMode="decimal"
        className="input py-1.5 text-center text-sm"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
      <span className="text-[10px] text-[var(--muted)]">{label}</span>
    </label>
  );
}
