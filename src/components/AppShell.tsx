"use client";

import { useSettings } from "@/lib/store";
import { BottomNav } from "@/components/BottomNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [settings] = useSettings();
  const onboarded = settings.onboarded;

  return (
    <>
      <main
        className={`mx-auto max-w-md px-4 pt-[calc(env(safe-area-inset-top)+1rem)] ${
          onboarded ? "pb-28" : "pb-24"
        }`}
      >
        {children}
      </main>
      {onboarded ? <BottomNav /> : null}
    </>
  );
}
