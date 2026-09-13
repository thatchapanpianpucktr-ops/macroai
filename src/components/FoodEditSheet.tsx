"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NumberInput } from "@/components/NumberInput";
import { MEAL_LABELS, MEAL_ORDER } from "@/lib/meal";
import { downscale } from "@/lib/image";
import { useApiKey, useSettings } from "@/lib/store";
import { openApiKeyPrompt } from "@/lib/apikey-prompt";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { ChatPanel, type ChatItem } from "@/components/ChatPanel";
import {
  chatItemsToSubItems,
  entryToSubItems,
  scaleFoodItems,
  subItemsToChatItems,
  foodThumbs,
  sumFoodItems,
  thumbToInlineImage,
} from "@/lib/food-items";
import type { ChatMessage, FoodEntry, FoodSubItem, Meal } from "@/lib/types";

type Draft = {
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  meal: Meal;
};

type Base = {
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const FRACTIONS: { f: number; label: string }[] = [
  { f: 0.25, label: "¼" },
  { f: 1 / 3, label: "⅓" },
  { f: 0.5, label: "½" },
  { f: 2 / 3, label: "⅔" },
  { f: 0.75, label: "¾" },
  { f: 1, label: "All" },
];

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
  // The "full" serving we scale fractions from (the values as first opened).
  const [base, setBase] = useState<Base | null>(null);
  const [fraction, setFraction] = useState(1);
  const [apiKey] = useApiKey();
  const [settings] = useSettings();
  const leftoverRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [portionLoading, setPortionLoading] = useState(false);
  const [portionMsg, setPortionMsg] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [subItems, setSubItems] = useState<FoodSubItem[]>([]);
  const [showBreakdown, setShowBreakdown] = useState(true);

  useEffect(() => {
    if (entry) {
      const items = entryToSubItems(entry);
      const totals =
        entry.items && entry.items.length > 1
          ? sumFoodItems(items)
          : {
              grams: entry.grams ?? 0,
              calories: entry.calories,
              protein: entry.protein,
              carbs: entry.carbs,
              fat: entry.fat,
            };
      setSubItems(items);
      setShowBreakdown((entry.items?.length ?? 0) > 1);
      setDraft({
        name: entry.name,
        grams: totals.grams,
        calories: totals.calories,
        protein: totals.protein,
        carbs: totals.carbs,
        fat: totals.fat,
        meal: entry.meal ?? "snack",
      });
      setBase({
        grams: totals.grams,
        calories: totals.calories,
        protein: totals.protein,
        carbs: totals.carbs,
        fat: totals.fat,
      });
      setFraction(1);
      setNote("");
      setPortionMsg(null);
      setPortionLoading(false);
      setChatOpen(false);
      setChatMessages(entry.chat ?? []);
    } else {
      setDraft(null);
      setBase(null);
      setSubItems([]);
    }
  }, [entry]);

  const photos = entry ? foodThumbs(entry) : [];
  const editImages = useMemo(() => {
    return photos
      .map((t) => thumbToInlineImage(t))
      .filter((img): img is { base64: string; mimeType: string } => Boolean(img));
  }, [entry?.thumb, entry?.thumbs]);

  if (!entry || !draft || !base) return null;

  const hasBreakdown = subItems.length > 1;
  const chatKind = hasBreakdown ? "scan" : "item";

  const r1 = (n: number) => Math.round(n * 10) / 10;

  function applyTotalsFromSubItems(items: FoodSubItem[]) {
    const totals = sumFoodItems(items);
    setSubItems(items);
    setDraft((d) =>
      d
        ? {
            ...d,
            grams: totals.grams,
            calories: totals.calories,
            protein: totals.protein,
            carbs: totals.carbs,
            fat: totals.fat,
          }
        : d,
    );
  }

  function applyFraction(f: number) {
    if (!base) return;
    setFraction(f);
    if (hasBreakdown) {
      const scaled = scaleFoodItems(subItems, f);
      applyTotalsFromSubItems(scaled);
      return;
    }
    setDraft((d) =>
      d
        ? {
            ...d,
            grams: Math.round(base.grams * f),
            calories: Math.round(base.calories * f),
            protein: r1(base.protein * f),
            carbs: r1(base.carbs * f),
            fat: r1(base.fat * f),
          }
        : d,
    );
  }

  async function runPortion(
    images: { base64: string; mimeType: string }[],
  ) {
    if (!entry || !base) return;
    if (!apiKey) {
      openApiKeyPrompt();
      return;
    }
    if (images.length === 0 && !note.trim()) return;
    setPortionLoading(true);
    setPortionMsg(null);
    try {
      const res = await fetch("/api/portion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          model: settings.geminiModel?.trim() || undefined,
          original: {
            name: entry.name,
            grams: base.grams,
            calories: base.calories,
          },
          images,
          note: note.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        fractionEaten?: number;
        note?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Couldn't estimate portion");
      const f = Math.min(1, Math.max(0, Number(data.fractionEaten) || 0));
      applyFraction(f);
      setPortionMsg(
        `AI estimate: you ate ~${Math.round(f * 100)}%${
          data.note ? ` — ${data.note}` : ""
        }`,
      );
    } catch (err) {
      setPortionMsg(
        err instanceof Error ? err.message : "Couldn't estimate portion",
      );
    } finally {
      setPortionLoading(false);
    }
  }

  async function onLeftoverPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!apiKey) {
      openApiKeyPrompt();
      return;
    }
    try {
      const img = await downscale(file, 1536, 0.85);
      await runPortion([{ base64: img.base64, mimeType: img.mimeType }]);
    } catch {
      setPortionMsg("Couldn't read that photo.");
    }
  }

  const macroKcal = Math.round(
    draft.protein * 4 + draft.carbs * 4 + draft.fat * 9,
  );

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  /** Live-apply the AI's revised numbers (from chat) to sub-items or single item. */
  function applyChatItems(next: ChatItem[]) {
    if (next.length === 0) return;
    if (hasBreakdown || next.length > 1) {
      applyTotalsFromSubItems(chatItemsToSubItems(next, subItems));
      setShowBreakdown(true);
      return;
    }
    const it = next[0];
    setSubItems([
      {
        name: it.name,
        grams: Math.round(it.grams),
        calories: Math.round(it.calories),
        protein: r1(it.protein),
        carbs: r1(it.carbs),
        fat: r1(it.fat),
      },
    ]);
    setDraft((d) =>
      d
        ? {
            ...d,
            name: it.name || d.name,
            grams: Math.round(it.grams),
            calories: Math.round(it.calories),
            protein: r1(it.protein),
            carbs: r1(it.carbs),
            fat: r1(it.fat),
          }
        : d,
    );
  }

  function updateSubItem(
    index: number,
    patch: Partial<FoodSubItem>,
  ) {
    const next = subItems.map((it, i) =>
      i === index ? { ...it, ...patch } : it,
    );
    applyTotalsFromSubItems(next);
  }

  function save() {
    if (!entry || !draft) return;
    const storedItems =
      subItems.length > 1
        ? subItems.map((it) => ({
            ...it,
            name: it.name.trim() || "Item",
            calories: Math.max(0, Math.round(it.calories)),
            protein: Math.max(0, it.protein),
            carbs: Math.max(0, it.carbs),
            fat: Math.max(0, it.fat),
          }))
        : undefined;
    onSave(entry.id, {
      name: draft.name.trim() || "Food",
      grams: draft.grams || undefined,
      calories: Math.max(0, Math.round(draft.calories)),
      protein: Math.max(0, draft.protein),
      carbs: Math.max(0, draft.carbs),
      fat: Math.max(0, draft.fat),
      meal: draft.meal,
      chat: chatMessages.length ? chatMessages : undefined,
      items: storedItems,
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

        {photos.length === 1 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photos[0]}
            alt=""
            className="w-full max-h-64 object-cover rounded-xl mb-4"
          />
        ) : photos.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4 -mx-1 px-1">
            {photos.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${i}-${src.slice(0, 24)}`}
                src={src}
                alt={`Meal photo ${i + 1}`}
                className="h-40 w-40 object-cover rounded-xl shrink-0"
              />
            ))}
          </div>
        ) : null}

        <label className="block mb-3">
          <span className="text-xs text-[var(--muted)] mb-1 block">Name</span>
          <input
            className="input"
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </label>

        <label className="block mb-3">
          <span className="text-xs text-[var(--muted)] mb-1 block">Meal</span>
          <select
            className="input"
            value={draft.meal}
            onChange={(e) => set("meal", e.target.value as Meal)}
          >
            {MEAL_ORDER.map((m) => (
              <option key={m} value={m}>
                {MEAL_LABELS[m]}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          <EditField
            label="grams"
            value={draft.grams}
            onChange={(v) => {
              if (hasBreakdown && base.grams > 0) {
                applyTotalsFromSubItems(scaleFoodItems(subItems, v / base.grams));
              } else {
                set("grams", v);
              }
            }}
          />
          <EditField
            label="kcal"
            value={draft.calories}
            onChange={(v) => {
              if (hasBreakdown && base.calories > 0) {
                applyTotalsFromSubItems(
                  scaleFoodItems(subItems, v / base.calories),
                );
              } else {
                set("calories", v);
              }
            }}
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

        {hasBreakdown && (
          <div className="mt-4 rounded-xl bg-[var(--surface-2)] p-3 space-y-2">
            <button
              type="button"
              className="flex items-center justify-between w-full text-xs font-semibold"
              onClick={() => setShowBreakdown((v) => !v)}
            >
              <span>
                {subItems.length} parts · {draft.calories} kcal total
              </span>
              <span className="text-[var(--muted)]">
                {showBreakdown ? "Hide" : "Show"}
              </span>
            </button>
            {showBreakdown && (
              <div className="space-y-2 pt-1">
                {subItems.map((it, i) => (
                  <div
                    key={i}
                    className="rounded-lg bg-[var(--surface)] p-2.5 space-y-1.5"
                  >
                    <input
                      className="input py-1.5 text-sm font-medium"
                      value={it.name}
                      onChange={(e) =>
                        updateSubItem(i, { name: e.target.value })
                      }
                    />
                    <ConfidenceBadge
                      confidence={it.confidence}
                      calorieMin={it.calorieMin}
                      calorieMax={it.calorieMax}
                    />
                    <div className="grid grid-cols-5 gap-1 text-center">
                      <label className="block">
                        <span className="text-[9px] text-[var(--muted)]">g</span>
                        <NumberInput
                          className="input py-1 text-xs text-center"
                          value={it.grams}
                          onChange={(v) => updateSubItem(i, { grams: v })}
                        />
                      </label>
                      <label className="block">
                        <span className="text-[9px] text-[var(--muted)]">
                          kcal
                        </span>
                        <NumberInput
                          className="input py-1 text-xs text-center"
                          value={it.calories}
                          onChange={(v) => updateSubItem(i, { calories: v })}
                        />
                      </label>
                      <label className="block">
                        <span className="text-[9px] text-[var(--muted)]">P</span>
                        <NumberInput
                          className="input py-1 text-xs text-center"
                          value={it.protein}
                          onChange={(v) => updateSubItem(i, { protein: v })}
                        />
                      </label>
                      <label className="block">
                        <span className="text-[9px] text-[var(--muted)]">C</span>
                        <NumberInput
                          className="input py-1 text-xs text-center"
                          value={it.carbs}
                          onChange={(v) => updateSubItem(i, { carbs: v })}
                        />
                      </label>
                      <label className="block">
                        <span className="text-[9px] text-[var(--muted)]">F</span>
                        <NumberInput
                          className="input py-1 text-xs text-center"
                          value={it.fat}
                          onChange={(v) => updateSubItem(i, { fat: v })}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 rounded-xl bg-[var(--surface-2)] p-3">
          <div className="text-xs font-semibold mb-2">
            Didn’t finish it? How much did you eat?
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {FRACTIONS.map(({ f, label }) => {
              const active = Math.abs(fraction - f) < 0.02;
              return (
                <button
                  key={label}
                  onClick={() => applyFraction(f)}
                  className="py-2 rounded-lg text-sm font-medium"
                  style={{
                    background: active ? "var(--accent)" : "var(--surface)",
                    color: active ? "#04231a" : "var(--foreground)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2 mt-2">
            <input
              className="input flex-1 py-1.5 text-sm"
              placeholder="or say e.g. “left half”, “few bites”"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && note.trim() && !portionLoading) {
                  runPortion([]);
                }
              }}
            />
            <button
              className="btn btn-ghost px-3 text-sm disabled:opacity-50"
              onClick={() => leftoverRef.current?.click()}
              disabled={portionLoading}
            >
              {portionLoading ? "…" : "📷 Leftovers"}
            </button>
          </div>
          <input
            ref={leftoverRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onLeftoverPhoto}
          />
          <p className="text-[11px] text-[var(--muted)] mt-1.5">
            Tap a fraction for an instant adjustment, or add a leftovers photo
            (with an optional note) and the AI estimates how much you ate.
          </p>
          {portionMsg && (
            <p
              className="text-[11px] mt-1"
              style={{ color: "var(--accent-2)" }}
            >
              {portionMsg}
            </p>
          )}
        </div>

        <button
          onClick={() => {
            if (!apiKey) return openApiKeyPrompt();
            setChatOpen(true);
          }}
          className="w-full mt-3 rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-2"
          style={{
            background: "rgba(56,189,248,0.12)",
            color: "var(--accent-2)",
          }}
        >
          💬 Chat with AI to adjust
          {chatMessages.length > 0 ? ` (${chatMessages.length})` : ""}
        </button>

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

      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        title={`Discuss: ${draft.name}`}
        kind={chatKind}
        allowPhoto
        items={subItemsToChatItems(subItems)}
        images={editImages}
        messages={chatMessages}
        onMessagesChange={setChatMessages}
        onApplyItems={applyChatItems}
      />
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
