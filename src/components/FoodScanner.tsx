"use client";

import { useRef, useState } from "react";
import { downscale } from "@/lib/image";
import { useFoods } from "@/lib/store";
import { NumberInput } from "@/components/NumberInput";
import type { AnalyzedItem, AnalyzeResponse } from "@/lib/types";

const CONF_BG: Record<string, string> = {
  high: "rgba(52,211,153,0.18)",
  medium: "rgba(251,191,36,0.18)",
  low: "rgba(248,113,113,0.18)",
};
const CONF_FG: Record<string, string> = {
  high: "var(--accent)",
  medium: "var(--warn)",
  low: "var(--danger)",
};

interface DraftItem extends AnalyzedItem {
  /** original grams from the model, used to scale when the user edits grams */
  baseGrams: number;
  basePer: { calories: number; protein: number; carbs: number; fat: number };
  include: boolean;
}

export function FoodScanner({ date }: { date: string }) {
  const { add } = useFoods();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [note, setNote] = useState<string | null>(null);
  // The captured photo, held so the user can add a description before analyzing.
  const [pending, setPending] = useState<{ base64: string; mimeType: string } | null>(
    null,
  );
  const [hint, setHint] = useState("");
  const [analyzed, setAnalyzed] = useState(false);

  function reset() {
    setItems([]);
    setThumb(null);
    setError(null);
    setNote(null);
    setLoading(false);
    setPending(null);
    setHint("");
    setAnalyzed(false);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    reset();
    setOpen(true);
    try {
      const big = await downscale(file, 1024);
      const small = await downscale(file, 120, 0.7);
      setThumb(small.dataUrl);
      setPending({ base64: big.base64, mimeType: big.mimeType });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that photo.");
    }
  }

  async function analyze() {
    if (!pending) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: pending.base64,
          mimeType: pending.mimeType,
          hint: hint.trim() || undefined,
        }),
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
      setAnalyzed(true);
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
          calorieMin:
            it.calorieMin != null
              ? Math.round(it.calorieMin * ratio)
              : undefined,
          calorieMax:
            it.calorieMax != null
              ? Math.round(it.calorieMax * ratio)
              : undefined,
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
      {/* Camera (rear) on phones; ignored on desktop. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFile}
      />
      {/* Pick an existing photo from the gallery / file system. */}
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
      />

      <div className="grid grid-cols-2 gap-3">
        <button
          className="btn btn-primary py-3"
          onClick={() => cameraRef.current?.click()}
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
          Take photo
        </button>
        <button
          className="btn btn-ghost py-3"
          onClick={() => libraryRef.current?.click()}
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth={1.8} />
            <path d="M3 16l5-4 4 3 3-2 6 5" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
            <circle cx="9" cy="9.5" r="1.4" fill="currentColor" />
          </svg>
          Upload photo
        </button>
      </div>
      <button
        className="btn btn-ghost w-full py-3 mt-3"
        onClick={() => {
          setOpen(true);
          reset();
          addManualRow();
        }}
      >
        + Add manually
      </button>

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
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb}
                alt="food"
                className="w-full h-36 object-cover rounded-xl mb-3"
              />
            )}

            {/* Describe the food to the AI before (or after) analyzing. */}
            {pending && (
              <div className="mb-3">
                <label className="text-xs text-[var(--muted)] mb-1 block">
                  Tell the AI what this is (optional)
                </label>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="e.g. chicken pad thai, large plate"
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !loading) analyze();
                    }}
                  />
                  <button
                    className="btn btn-primary px-4 disabled:opacity-50"
                    onClick={analyze}
                    disabled={loading}
                  >
                    {analyzed ? "Redo" : "Analyze"}
                  </button>
                </div>
                <p className="text-[11px] text-[var(--muted)] mt-1">
                  Adding the dish name and rough size makes the estimate more
                  accurate. Tap {analyzed ? "Redo" : "Analyze"} to (re)scan.
                </p>
              </div>
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
                    {(it.confidence ||
                      (it.calorieMin != null && it.calorieMax != null)) && (
                      <div className="flex items-center gap-2 mb-2 text-[11px]">
                        {it.confidence && (
                          <span
                            className="px-2 py-0.5 rounded-full font-medium"
                            style={{
                              background: CONF_BG[it.confidence],
                              color: CONF_FG[it.confidence],
                            }}
                          >
                            {it.confidence} confidence
                          </span>
                        )}
                        {it.calorieMin != null && it.calorieMax != null && (
                          <span className="text-[var(--muted)]">
                            likely {it.calorieMin}–{it.calorieMax} kcal
                          </span>
                        )}
                      </div>
                    )}
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
