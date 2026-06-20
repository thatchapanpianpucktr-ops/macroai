"use client";

import { useWater } from "@/lib/store";

const GOAL = 8;

export function WaterTracker({ date }: { date: string }) {
  const { glasses, setGlasses } = useWater(date);

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">
          Water <span className="text-[var(--muted)] font-normal text-sm">· {glasses} / {GOAL} glasses</span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            className="w-8 h-8 rounded-full bg-[var(--surface-2)] grid place-items-center text-lg disabled:opacity-30"
            onClick={() => setGlasses(glasses - 1)}
            disabled={glasses <= 0}
            aria-label="Remove a glass"
          >
            −
          </button>
          <button
            className="w-8 h-8 rounded-full bg-[var(--accent)] text-black grid place-items-center text-lg"
            onClick={() => setGlasses(glasses + 1)}
            aria-label="Add a glass"
          >
            +
          </button>
        </div>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: Math.max(GOAL, glasses) }).map((_, i) => (
          <button
            key={i}
            onClick={() => setGlasses(i + 1 === glasses ? i : i + 1)}
            className="flex-1 h-7 rounded-md transition-colors"
            style={{
              background: i < glasses ? "var(--accent)" : "var(--surface-2)",
            }}
            aria-label={`Set ${i + 1} glasses`}
          />
        ))}
      </div>
    </section>
  );
}
