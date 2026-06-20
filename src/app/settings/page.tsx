"use client";

import { useRouter } from "next/navigation";
import {
  useSettings,
  useWeights,
  useApiKey,
  exportAll,
  importAll,
} from "@/lib/store";
import { currentWeight, estimateTDEE, resolveTargets } from "@/lib/tdee";
import { todayYmd, TIMEZONE_OPTIONS } from "@/lib/date";
import { useFoods } from "@/lib/store";
import { NumberInput } from "@/components/NumberInput";
import { CHANGELOG } from "@/lib/changelog";
import { openWhatsNew } from "@/lib/whatsnew";
import { useMemo, useRef, useState } from "react";
import type { ActivityLevel, Goal, Sex } from "@/lib/types";

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary (little/no exercise)",
  light: "Light (1–3 days/week)",
  moderate: "Moderate (3–5 days/week)",
  active: "Active (6–7 days/week)",
  very_active: "Very active (physical job/2x day)",
};

export default function SettingsPage() {
  const router = useRouter();
  const [settings, update] = useSettings();
  const { weights, setWeight } = useWeights();
  const { foods } = useFoods();

  const [startWeight, setStartWeight] = useState<string>(
    currentWeight(weights)?.toString() ?? "",
  );

  const weight = useMemo(() => currentWeight(weights), [weights]);
  const tdee = useMemo(
    () => estimateTDEE(settings, weights, foods),
    [settings, weights, foods],
  );
  const targets = useMemo(
    () => resolveTargets(settings, tdee.tdee, weight ?? (parseFloat(startWeight) || null)),
    [settings, tdee.tdee, weight, startWeight],
  );

  const fileRef = useRef<HTMLInputElement>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [apiKey, setApiKey] = useApiKey();
  const [showKey, setShowKey] = useState(false);

  function finishOnboarding() {
    const w = parseFloat(startWeight);
    if (w && !weight) setWeight(todayYmd(settings.timeZone), w);
    update({ onboarded: true });
    router.push("/");
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(exportAll(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `macroai-backup-${todayYmd(settings.timeZone)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setBackupMsg("Backup downloaded.");
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const replace = window.confirm(
        "Replace all current data with this backup?\n\nOK = replace everything.\nCancel = merge (keep current + add from file).",
      );
      const res = importAll(data, replace ? "replace" : "merge");
      setBackupMsg(
        `Restored — ${res.foods} food entries, ${res.weights} weigh-ins.`,
      );
    } catch {
      setBackupMsg("Couldn't read that file — is it a MacroAI backup?");
    }
  }

  function reopenWhatsNew() {
    openWhatsNew();
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">
          {settings.onboarded ? "Settings" : "Set up your profile"}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Used for your starting estimate. Targets adapt to real data over time.
        </p>
      </header>

      <section className="card p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Sex">
            <select
              className="input"
              value={settings.sex}
              onChange={(e) => update({ sex: e.target.value as Sex })}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </Labeled>
          <Labeled label="Age">
            <NumberInput
              className="input"
              value={settings.age}
              onChange={(v) => update({ age: Math.round(v) })}
              selectOnFocus
            />
          </Labeled>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Height (cm)">
            <NumberInput
              className="input"
              value={settings.heightCm}
              onChange={(v) => update({ heightCm: Math.round(v) })}
              selectOnFocus
            />
          </Labeled>
          <Labeled label={weight ? "Current weight (kg)" : "Start weight (kg)"}>
            <input
              type="number"
              inputMode="decimal"
              className="input"
              value={weight ?? startWeight}
              onChange={(e) => {
                setStartWeight(e.target.value);
                if (weight) {
                  const v = parseFloat(e.target.value);
                  if (v) setWeight(todayYmd(), v);
                }
              }}
            />
          </Labeled>
        </div>

        <Labeled label="Activity level">
          <select
            className="input"
            value={settings.activity}
            onChange={(e) =>
              update({ activity: e.target.value as ActivityLevel })
            }
          >
            {Object.entries(ACTIVITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Labeled>

        <Labeled label="Timezone (defines your “day”)">
          <select
            className="input"
            value={settings.timeZone}
            onChange={(e) => update({ timeZone: e.target.value })}
          >
            {TIMEZONE_OPTIONS.map((t) => (
              <option key={t.value || "auto"} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Labeled>
      </section>

      <section className="card p-4 space-y-4">
        <h2 className="font-semibold">Goal</h2>
        <div className="grid grid-cols-3 gap-2">
          {(["lose", "maintain", "gain"] as Goal[]).map((g) => (
            <button
              key={g}
              onClick={() => update({ goal: g })}
              className="py-2 rounded-xl text-sm font-medium capitalize"
              style={{
                background:
                  settings.goal === g ? "var(--accent)" : "var(--surface-2)",
                color: settings.goal === g ? "#04231a" : "var(--foreground)",
              }}
            >
              {g}
            </button>
          ))}
        </div>

        {settings.goal !== "maintain" && (
          <Labeled
            label={`Rate: ${settings.rateKgPerWeek} kg/week (${
              settings.goal === "lose" ? "loss" : "gain"
            })`}
          >
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={settings.rateKgPerWeek}
              onChange={(e) =>
                update({ rateKgPerWeek: parseFloat(e.target.value) })
              }
              className="w-full accent-[var(--accent)]"
            />
          </Labeled>
        )}
      </section>

      <section className="card p-4 space-y-4">
        <h2 className="font-semibold">Macro preferences</h2>
        <Labeled label={`Protein: ${settings.proteinPerKg} g per kg bodyweight`}>
          <input
            type="range"
            min={1.2}
            max={2.6}
            step={0.1}
            value={settings.proteinPerKg}
            onChange={(e) =>
              update({ proteinPerKg: parseFloat(e.target.value) })
            }
            className="w-full accent-[var(--accent)]"
          />
        </Labeled>
        <Labeled
          label={`Fat: ${Math.round(settings.fatPctOfCalories * 100)}% of calories`}
        >
          <input
            type="range"
            min={0.15}
            max={0.45}
            step={0.01}
            value={settings.fatPctOfCalories}
            onChange={(e) =>
              update({ fatPctOfCalories: parseFloat(e.target.value) })
            }
            className="w-full accent-[var(--accent)]"
          />
        </Labeled>
      </section>

      <section className="card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Set targets manually</h2>
            <p className="text-xs text-[var(--muted)]">
              Use your own numbers instead of the adaptive calculation.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={settings.useCustomTargets}
            onClick={() => update({ useCustomTargets: !settings.useCustomTargets })}
            className="relative w-12 h-7 rounded-full transition-colors shrink-0"
            style={{
              background: settings.useCustomTargets
                ? "var(--accent)"
                : "var(--surface-2)",
            }}
          >
            <span
              className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform"
              style={{
                transform: settings.useCustomTargets
                  ? "translateX(20px)"
                  : "translateX(0)",
              }}
            />
          </button>
        </div>

        {settings.useCustomTargets && (
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Calories (kcal)">
              <NumberInput
                className="input"
                value={settings.customCalories}
                onChange={(v) => update({ customCalories: v })}
                selectOnFocus
              />
            </Labeled>
            <Labeled label="Protein (g)">
              <NumberInput
                className="input"
                value={settings.customProtein}
                onChange={(v) => update({ customProtein: v })}
                selectOnFocus
              />
            </Labeled>
            <Labeled label="Carbs (g)">
              <NumberInput
                className="input"
                value={settings.customCarbs}
                onChange={(v) => update({ customCarbs: v })}
                selectOnFocus
              />
            </Labeled>
            <Labeled label="Fat (g)">
              <NumberInput
                className="input"
                value={settings.customFat}
                onChange={(v) => update({ customFat: v })}
                selectOnFocus
              />
            </Labeled>
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-3">
          {settings.useCustomTargets ? "Your manual targets" : "Your daily targets"}
        </h2>
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat label="kcal" value={targets.calories} />
          <Stat label="protein" value={`${targets.protein}g`} />
          <Stat label="carbs" value={`${targets.carbs}g`} />
          <Stat label="fat" value={`${targets.fat}g`} />
        </div>
        <p className="text-xs text-[var(--muted)] mt-3">
          Estimated expenditure {tdee.tdee} kcal ·{" "}
          {tdee.method === "adaptive"
            ? `adaptive (${tdee.daysUsed} days of data)`
            : "starting estimate"}
        </p>
      </section>

      {settings.onboarded && (
        <section className="card p-4 space-y-3">
          <div>
            <h2 className="font-semibold">AI scanning key</h2>
            <p className="text-xs text-[var(--muted)]">
              Photo &amp; describe scanning requires your own free Google Gemini
              key — there is no shared key. Stored only on this device and never
              included in backups. (Search &amp; barcode work without it.)
            </p>
          </div>
          <div className="flex gap-2">
            <input
              className="input flex-1 font-mono text-sm"
              type={showKey ? "text" : "password"}
              placeholder="AIza…"
              value={apiKey}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button
              className="btn btn-ghost px-3"
              onClick={() => setShowKey((s) => !s)}
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <a
              className="text-xs underline"
              style={{ color: "var(--accent-2)" }}
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
            >
              Get a free key →
            </a>
            <span className="text-xs text-[var(--muted)]">
              {apiKey ? "Using your key ✓" : "No key — scanning disabled"}
            </span>
          </div>
        </section>
      )}

      {settings.onboarded && (
        <section className="card p-4 space-y-3">
          <div>
            <h2 className="font-semibold">Backup &amp; restore</h2>
            <p className="text-xs text-[var(--muted)]">
              Your data lives only on this device. Export a backup so you don’t
              lose it, or import it onto another phone.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button className="btn btn-ghost py-3" onClick={exportData}>
              Export backup
            </button>
            <button
              className="btn btn-ghost py-3"
              onClick={() => fileRef.current?.click()}
            >
              Import backup
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onImportFile}
          />
          {backupMsg && (
            <p className="text-xs" style={{ color: "var(--accent)" }}>
              {backupMsg}
            </p>
          )}
        </section>
      )}

      {settings.onboarded && (
        <section className="card p-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">About</h2>
            <p className="text-xs text-[var(--muted)]">
              MacroAI v{CHANGELOG[0].version}
            </p>
          </div>
          <button className="btn btn-ghost px-4 py-2 text-sm" onClick={reopenWhatsNew}>
            What’s new
          </button>
        </section>
      )}

      {!settings.onboarded ? (
        <button
          className="btn btn-primary w-full py-3 disabled:opacity-50"
          disabled={!startWeight && !weight}
          onClick={finishOnboarding}
        >
          Start tracking
        </button>
      ) : (
        <p className="text-center text-xs text-[var(--muted)]">
          Changes save automatically.
        </p>
      )}
    </div>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs text-[var(--muted)] mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-[var(--surface-2)] py-3">
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-[var(--muted)]">{label}</div>
    </div>
  );
}
