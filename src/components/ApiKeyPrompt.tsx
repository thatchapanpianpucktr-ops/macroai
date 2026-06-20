"use client";

import { useEffect, useState } from "react";
import { useApiKey, useSettings } from "@/lib/store";
import { APIKEY_PROMPT_EVENT } from "@/lib/apikey-prompt";

/**
 * Required key setup: AI scanning needs each person's OWN free Gemini key
 * (there is no shared fallback). Re-appears after onboarding until a key is
 * set, and can be opened on demand from the scanner / Settings.
 */
export function ApiKeyPrompt() {
  const [settings] = useSettings();
  const [apiKey, setApiKey] = useApiKey();
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState("");

  // Auto-show after onboarding while no key is set.
  useEffect(() => {
    if (!settings.onboarded) return; // don't interrupt onboarding
    if (apiKey) return; // already has their own key
    setShow(true);
  }, [settings.onboarded, apiKey]);

  // Open on demand (e.g. from the scanner's "Add key" button).
  useEffect(() => {
    const open = () => setShow(true);
    window.addEventListener(APIKEY_PROMPT_EVENT, open);
    return () => window.removeEventListener(APIKEY_PROMPT_EVENT, open);
  }, []);

  if (!show) return null;

  function saveKey() {
    const k = draft.trim();
    if (!k) return;
    setApiKey(k);
    setShow(false);
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
          Photo &amp; describe scanning needs your own{" "}
          <span style={{ color: "var(--foreground)" }}>free</span> Google Gemini
          key — it gives you your own daily quota and is stored only on your
          device. (Search &amp; barcode logging work without a key.)
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
          onClick={() => setShow(false)}
        >
          Not now (Search &amp; barcode still work)
        </button>
      </div>
    </div>
  );
}
