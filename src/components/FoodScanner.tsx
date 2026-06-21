"use client";

import { useRef, useState } from "react";
import { downscale } from "@/lib/image";
import { useApiKey, useFoods } from "@/lib/store";
import { openApiKeyPrompt } from "@/lib/apikey-prompt";
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
  /** when set, items sharing this name are logged together as ONE entry */
  groupName?: string;
}

export function FoodScanner({ date }: { date: string }) {
  const { add } = useFoods();
  const [apiKey] = useApiKey();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [note, setNote] = useState<string | null>(null);
  // Captured/uploaded photos, held so the user can add more + a description
  // before analyzing. Multiple photos (front, back, label) are analyzed together.
  const [pending, setPending] = useState<
    { base64: string; mimeType: string; thumb: string }[]
  >([]);
  const [hint, setHint] = useState("");
  const [analyzed, setAnalyzed] = useState(false);
  // Manual mode = opened via "Add manually" (text description / hand entry, no photo).
  const [manual, setManual] = useState(false);

  const cover = pending[0]?.thumb ?? null;

  function reset() {
    setItems([]);
    setError(null);
    setNote(null);
    setLoading(false);
    setPending([]);
    setHint("");
    setAnalyzed(false);
    setManual(false);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    // Starting fresh from the home screen vs. adding more inside the modal.
    if (!open) {
      reset();
      setOpen(true);
    }
    setManual(false);
    setAnalyzed(false);
    for (const file of files) {
      try {
        const big = await downscale(file, 1024);
        const small = await downscale(file, 120, 0.7);
        setPending((prev) =>
          prev.length >= 6
            ? prev
            : [
                ...prev,
                {
                  base64: big.base64,
                  mimeType: big.mimeType,
                  thumb: small.dataUrl,
                },
              ],
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Couldn't read that photo.",
        );
      }
    }
  }

  function removePhoto(idx: number) {
    setPending((prev) => prev.filter((_, i) => i !== idx));
    setAnalyzed(false);
  }

  async function analyze() {
    // AI scanning needs the user's own key (no shared fallback).
    if (!apiKey) {
      openApiKeyPrompt();
      return;
    }
    // Image mode requires a photo; text mode requires a description.
    if (pending.length === 0 && !hint.trim()) {
      setError("Type what you ate first, e.g. “50g banana, 2 eggs”.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload =
        pending.length > 0
          ? {
              images: pending.map((p) => ({
                base64: p.base64,
                mimeType: p.mimeType,
              })),
              hint: hint.trim() || undefined,
              apiKey: apiKey || undefined,
            }
          : { description: hint.trim(), apiKey: apiKey || undefined };
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  function setGroup(idx: number, name: string | undefined) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, groupName: name } : it)),
    );
  }

  function handleGroupChange(idx: number, value: string) {
    if (value === "__none__") return setGroup(idx, undefined);
    if (value === "__new__") {
      const name = window.prompt("Group name (e.g. Bento box)")?.trim();
      if (name) setGroup(idx, name);
      return;
    }
    setGroup(idx, value);
  }

  function groupAllAsOne() {
    const name = window.prompt("Combine all items into one named item", "Meal")?.trim();
    if (!name) return;
    setItems((prev) =>
      prev.map((it) => (it.include ? { ...it, groupName: name } : it)),
    );
  }

  function ungroupAll() {
    setItems((prev) => prev.map((it) => ({ ...it, groupName: undefined })));
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
    const included = items.filter((it) => it.include);
    const groups = new Map<string, DraftItem[]>();

    for (const it of included) {
      if (it.groupName) {
        const arr = groups.get(it.groupName) ?? [];
        arr.push(it);
        groups.set(it.groupName, arr);
      } else {
        add({
          date,
          name: it.name,
          calories: it.calories,
          protein: it.protein,
          carbs: it.carbs,
          fat: it.fat,
          grams: it.grams,
          source: "ai",
          thumb: cover ?? undefined,
        });
      }
    }

    for (const [name, list] of groups) {
      const sum = list.reduce(
        (a, it) => ({
          cal: a.cal + it.calories,
          p: a.p + it.protein,
          c: a.c + it.carbs,
          f: a.f + it.fat,
          g: a.g + (it.grams || 0),
        }),
        { cal: 0, p: 0, c: 0, f: 0, g: 0 },
      );
      add({
        date,
        name,
        calories: Math.round(sum.cal),
        protein: Math.round(sum.p * 10) / 10,
        carbs: Math.round(sum.c * 10) / 10,
        fat: Math.round(sum.f * 10) / 10,
        grams: sum.g ? Math.round(sum.g) : undefined,
        source: "ai",
        thumb: cover ?? undefined,
      });
    }

    setOpen(false);
    reset();
  }

  const included = items.filter((it) => it.include);
  const totalCals = included.reduce((a, it) => a + it.calories, 0);
  const groupNames = Array.from(
    new Set(
      items
        .map((it) => it.groupName)
        .filter((g): g is string => Boolean(g)),
    ),
  );
  // What will actually be logged (after merging groups), for a preview.
  const logPlan: { name: string; kcal: number; grouped: boolean }[] = (() => {
    const groups = new Map<string, number>();
    const out: { name: string; kcal: number; grouped: boolean }[] = [];
    for (const it of included) {
      if (it.groupName) {
        groups.set(it.groupName, (groups.get(it.groupName) ?? 0) + it.calories);
      } else {
        out.push({ name: it.name, kcal: it.calories, grouped: false });
      }
    }
    for (const [name, kcal] of groups) {
      out.push({ name, kcal: Math.round(kcal), grouped: true });
    }
    return out;
  })();

  return (
    <>
      {/* Camera (rear) on phones; ignored on desktop. One shot at a time. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFile}
      />
      {/* Pick one or more existing photos from the gallery / file system. */}
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
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
          reset();
          setManual(true);
          setOpen(true);
        }}
      >
        + Add manually / describe
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

            {!apiKey && (
              <button
                onClick={openApiKeyPrompt}
                className="w-full text-left rounded-xl p-3 mb-3 text-sm"
                style={{
                  background: "rgba(56,189,248,0.12)",
                  color: "var(--accent-2)",
                }}
              >
                AI scanning needs your own free Gemini key. Tap to add it →
              </button>
            )}

            {pending.length > 0 && (
              <div className="mb-3">
                <div className="grid grid-cols-4 gap-2">
                  {pending.map((p, i) => (
                    <div key={i} className="relative aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.thumb}
                        alt={`photo ${i + 1}`}
                        className="w-full h-full object-cover rounded-lg"
                      />
                      <button
                        onClick={() => removePhoto(i)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/80 text-white text-xs grid place-items-center"
                        aria-label="Remove photo"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {pending.length < 6 && (
                    <div className="grid grid-rows-2 gap-1 aspect-square">
                      <button
                        onClick={() => cameraRef.current?.click()}
                        className="rounded-lg bg-[var(--surface-2)] grid place-items-center text-[10px] text-[var(--muted)]"
                      >
                        + Camera
                      </button>
                      <button
                        onClick={() => libraryRef.current?.click()}
                        className="rounded-lg bg-[var(--surface-2)] grid place-items-center text-[10px] text-[var(--muted)]"
                      >
                        + Upload
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-[var(--muted)] mt-1.5">
                  Add front, back &amp; the nutrition label for a more accurate
                  estimate — they’re analyzed together as one item.
                </p>
              </div>
            )}

            {/* Describe the food to the AI before (or after) analyzing. */}
            {pending.length > 0 && (
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

            {/* Text-only mode: describe the food and let the AI estimate it. */}
            {manual && (
              <div className="mb-3">
                <label className="text-xs text-[var(--muted)] mb-1 block">
                  Describe what you ate
                </label>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="e.g. 50g banana, 2 boiled eggs"
                    value={hint}
                    autoFocus
                    onChange={(e) => setHint(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !loading) analyze();
                    }}
                  />
                  <button
                    className="btn btn-primary px-4 disabled:opacity-50"
                    onClick={analyze}
                    disabled={loading || !hint.trim()}
                  >
                    {analyzed ? "Redo" : "Estimate"}
                  </button>
                </div>
                <p className="text-[11px] text-[var(--muted)] mt-1">
                  No photo needed — tell the AI what and how much, and it
                  estimates the macros. Or{" "}
                  <button
                    className="text-[var(--accent-2)] underline"
                    onClick={addManualRow}
                  >
                    enter the numbers yourself
                  </button>
                  .
                </p>
              </div>
            )}

            {loading && (
              <div className="py-10 text-center text-[var(--muted)]">
                <div className="animate-pulse">
                  {manual ? "Estimating…" : "Analyzing photo…"}
                </div>
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

            {!loading && items.length > 1 && (
              <div className="flex items-center justify-between mb-2 text-xs">
                <span className="text-[var(--muted)]">
                  Group sub-items into one entry?
                </span>
                <div className="flex gap-2">
                  <button
                    className="underline"
                    style={{ color: "var(--accent-2)" }}
                    onClick={groupAllAsOne}
                  >
                    Combine all
                  </button>
                  {groupNames.length > 0 && (
                    <button
                      className="underline text-[var(--muted)]"
                      onClick={ungroupAll}
                    >
                      Ungroup
                    </button>
                  )}
                </div>
              </div>
            )}

            {!loading && items.length > 0 && (
              <div className="space-y-3">
                {items.map((it, i) => (
                  <div
                    key={i}
                    className="rounded-xl bg-[var(--surface-2)] p-3"
                    style={{
                      opacity: it.include ? 1 : 0.45,
                      borderLeft: it.groupName
                        ? "3px solid var(--accent)"
                        : "3px solid transparent",
                    }}
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
                    {items.length > 1 && it.include && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] text-[var(--muted)] shrink-0">
                          Part of:
                        </span>
                        <select
                          className="input py-1 text-xs flex-1"
                          value={it.groupName ?? "__none__"}
                          onChange={(e) => handleGroupChange(i, e.target.value)}
                        >
                          <option value="__none__">Its own item</option>
                          {groupNames.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                          <option value="__new__">+ New group…</option>
                        </select>
                      </div>
                    )}
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

            {!loading && groupNames.length > 0 && (
              <div className="mt-3 rounded-xl bg-[var(--surface-2)] p-3 text-xs">
                <div className="text-[var(--muted)] mb-1">Will be logged as:</div>
                <ul className="space-y-1">
                  {logPlan.map((p, i) => (
                    <li key={i} className="flex justify-between">
                      <span>
                        {p.grouped ? "🍱 " : ""}
                        {p.name}
                      </span>
                      <span className="tabular-nums text-[var(--muted)]">
                        {p.kcal} kcal
                      </span>
                    </li>
                  ))}
                </ul>
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
