"use client";

import { useMemo, useState } from "react";
import { LineChart } from "@/components/LineChart";
import { useWeights } from "@/lib/store";
import { weightTrend } from "@/lib/tdee";
import { todayYmd, ymdToLabel } from "@/lib/date";

export default function WeightPage() {
  const { weights, setWeight, remove } = useWeights();
  const [date, setDate] = useState(todayYmd());
  const [kg, setKg] = useState("");

  const sorted = useMemo(
    () =>
      [...weights].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    [weights],
  );

  const trend = useMemo(() => weightTrend(weights), [weights]);
  const raw = useMemo(
    () =>
      [...weights].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      ),
    [weights],
  );

  const t0 = trend.length ? new Date(trend[0].date).getTime() : 0;
  const day = 86400000;

  const change =
    trend.length >= 2
      ? trend[trend.length - 1].kg - trend[0].kg
      : null;

  function save() {
    const v = parseFloat(kg);
    if (!v) return;
    setWeight(date, v);
    setKg("");
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">Weight</h1>
        <p className="text-sm text-[var(--muted)]">
          The smoothed trend line is what drives your adaptive targets.
        </p>
      </header>

      <section className="card p-4">
        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="text-xs text-[var(--muted)]">Trend weight</div>
            <div className="text-2xl font-bold tabular-nums">
              {trend.length ? `${trend[trend.length - 1].kg} kg` : "—"}
            </div>
          </div>
          {change !== null && (
            <div
              className="text-sm font-medium tabular-nums"
              style={{ color: change <= 0 ? "var(--accent)" : "var(--warn)" }}
            >
              {change > 0 ? "+" : ""}
              {change.toFixed(1)} kg total
            </div>
          )}
        </div>
        <LineChart
          height={180}
          yLabel={(v) => v.toFixed(0)}
          series={[
            {
              points: raw.map((w) => ({
                x: (new Date(w.date).getTime() - t0) / day,
                y: w.kg,
              })),
              color: "var(--muted)",
              width: 0,
              dots: true,
            },
            {
              points: trend.map((w) => ({
                x: (new Date(w.date).getTime() - t0) / day,
                y: w.kg,
              })),
              color: "var(--accent)",
              width: 2.5,
            },
          ]}
        />
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Log weight</h2>
        <div className="flex gap-2">
          <input
            type="date"
            className="input flex-1"
            value={date}
            max={todayYmd()}
            onChange={(e) => setDate(e.target.value)}
          />
          <input
            type="number"
            inputMode="decimal"
            placeholder="kg"
            className="input w-24 text-center"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
          />
          <button className="btn btn-primary px-5" onClick={save}>
            Save
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--muted)]">History</h2>
        {sorted.length === 0 && (
          <div className="card p-6 text-center text-sm text-[var(--muted)]">
            No weigh-ins yet.
          </div>
        )}
        {sorted.map((w) => (
          <div key={w.date} className="card p-3 flex items-center justify-between">
            <span className="text-sm">{ymdToLabel(w.date)}</span>
            <div className="flex items-center gap-3">
              <span className="font-semibold tabular-nums">{w.kg} kg</span>
              <button
                onClick={() => remove(w.date)}
                className="text-[11px] text-[var(--danger)]"
              >
                remove
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
