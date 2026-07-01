"use client";

import { useEffect, useState } from "react";
import { CHANGELOG, CURRENT_BUILD, type ChangelogEntry } from "@/lib/changelog";
import { useSettings } from "@/lib/store";
import { WHATSNEW_EVENT } from "@/lib/whatsnew";

const KEY = "macroai.lastSeenBuild.v1";

export function WhatsNew() {
  const [settings] = useSettings();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);

  // Auto-show new release notes once after an update.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(KEY);
    const lastSeen = raw ? parseInt(raw, 10) || 0 : 0;
    if (lastSeen >= CURRENT_BUILD) return;

    // Brand-new users shouldn't see historical release notes; mark as caught up.
    if (!settings.onboarded) {
      window.localStorage.setItem(KEY, String(CURRENT_BUILD));
      return;
    }

    const newer = CHANGELOG.filter((c) => c.build > lastSeen);
    if (newer.length) setEntries(newer);
  }, [settings.onboarded]);

  // Manual re-open (from Settings) — always shows the full changelog, no reload.
  useEffect(() => {
    const open = () => setEntries(CHANGELOG);
    window.addEventListener(WHATSNEW_EVENT, open);
    return () => window.removeEventListener(WHATSNEW_EVENT, open);
  }, []);

  if (entries.length === 0) return null;

  function dismiss() {
    if (typeof window !== "undefined")
      window.localStorage.setItem(KEY, String(CURRENT_BUILD));
    setEntries([]);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[88dvh] overflow-y-auto no-scrollbar card rounded-b-none sm:rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🎉</span>
          <h2 className="text-lg font-bold">What’s new</h2>
        </div>
        <p className="text-xs text-[var(--muted)] mb-4">
          You’re now on v{CHANGELOG[0].version}
        </p>

        <div className="space-y-5">
          {entries.map((e) => (
            <div key={e.build}>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="font-semibold">{e.title}</h3>
                <span className="text-[11px] text-[var(--muted)]">
                  v{e.version}
                </span>
              </div>
              <ul className="space-y-2">
                {e.items.map((it, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span style={{ color: "var(--accent)" }}>✓</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-xl px-3 py-2.5 text-xs text-[var(--muted)] flex items-start gap-2"
          style={{ background: "var(--surface-2)" }}>
          <span>🔄</span>
          <span>
            Features not showing up?{" "}
            <strong className="text-[var(--foreground)]">
              Fully close the app and reopen it
            </strong>{" "}
            to apply the latest update.
          </span>
        </div>

        <button className="btn btn-primary w-full py-3 mt-3" onClick={dismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
