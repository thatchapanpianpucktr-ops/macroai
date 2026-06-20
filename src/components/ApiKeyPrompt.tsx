"use client";

import { useEffect, useState } from "react";
import { useApiKey, useSettings } from "@/lib/store";

const KEY = "macroai.keyPromptDismissed.v1";

/**
 * One-time nudge (after onboarding) asking each person to add their OWN free
 * Gemini key, so AI scanning uses their quota instead of the shared key.
 */
export function ApiKeyPrompt() {
  const [settings] = useSettings();
  const [apiKey, setApiKey] = useApiKey();
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!settings.onboarded) return; // don't interrupt onboarding
    if (apiKey) return; // already using their own key
    if (window.localStorage.getItem(KEY) === "1") return; // already decided
    setShow(true);
  }, [settings.onboarded, apiKey]);

  if (!show) return null;

  function decided() {
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, "1");
    setShow(false);
  }

  function saveKey() {
    const k = draft.trim();
    if (!k) return;
    setApiKey(k);
    decided();
  }

  const looksOff = draft.trim().length > 0 && !draft.trim().startsWith("AIza");

  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-black/60">
      <div className="w-full sm:max-w-md max-h-[88dvh] overflow-y-auto no-scrollbar card rounded-b-none sm:rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🔑</span>
          <h2 className="text-lg font-bold">Use your own AI key</h2>
        </div>
        <p className="text-sm text-[var(--muted)] mb-4">
          Photo &amp; describe scanning uses Google Gemini. Add your own{" "}
          <span style={{ color: "var(--foreground)" }}>free</span> key so you get your
          own daily quota — otherwise scanning shares a key that runs out fast.
          It’s stored only on your device. (Search &amp; barcode never need a
          key.)
        </p>

        <ol className="text-xs text-[var(--muted)] space-y-1 mb-3 list-decimal pl-4">
          <li>
            Open{" "}
            <a
              className="underline"
              style={{ color: "var(--accent-2)" }}
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
            >
              aistudio.google.com/apikey
            </a>{" "}
            and tap “Create API key”.
          </li>
          <li>Copy the key (starts with “AIza”).</li>
          <li>Paste it below.</li>
        </ol>

        <input
          className="input w-full font-mono text-sm"
          placeholder="AIza…"
          value={draft}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveKey();
          }}
        />
        {looksOff && (
          <p className="text-[11px] text-[var(--warn)] mt-1">
            Gemini keys usually start with “AIza” — double-check you copied the
            whole thing.
          </p>
        )}

        <button
          className="btn btn-primary w-full py-3 mt-4 disabled:opacity-50"
          disabled={!draft.trim()}
          onClick={saveKey}
        >
          Save &amp; use my key
        </button>
        <button
          className="w-full py-3 mt-1 text-sm text-[var(--muted)]"
          onClick={decided}
        >
          Use the shared key for now
        </button>
      </div>
    </div>
  );
}
