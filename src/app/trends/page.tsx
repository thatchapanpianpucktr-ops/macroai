"use client";

import { useMemo } from "react";
import { LineChart } from "@/components/LineChart";
import { useFoods, useSettings, useWeights } from "@/lib/store";
import {
  KCAL_PER_KG,
  computeTargets,
  currentWeight,
  estimateTDEE,
} from "@/lib/tdee";

const DAY = 86400000;

export default function TrendsPage() {
  const [settings] = useSettings();
  const { foods } = useFoods();
  const { weights } = useWeights();

  const tdee = useMemo(
    () => estimateTDEE(settings, weights, foods),
    [settings, weights, foods],
  );
  const weight = useMemo(() => currentWeight(weights), [weights]);
  const targets = useMemo(
    () => computeTargets(settings, tdee.tdee, weight),
    [settings, tdee.tdee, weight],
  );

  // Daily calories over the last 21 days.
  const days = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of foods) map.set(f.date, (map.get(f.date) ?? 0) + f.calories);
    const out: { date: string; kcal: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 20; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY);
      const ymd = d.toISOString().slice(0, 10);
      out.push({ date: ymd, kcal: Math.round(map.get(ymd) ?? 0) });
    }
    return out;
  }, [foods]);

  const logged = days.filter((d) => d.kcal > 0);
  const avgIntake =
    logged.length > 0
      ? Math.round(logged.reduce((a, d) => a + d.kcal, 0) / logged.length)
      : 0;

  const dailyBalance = avgIntake > 0 ? avgIntake - tdee.tdee : 0;
  const projectedWeekly = (dailyBalance * 7) / KCAL_PER_KG;

  const t0 = days.length ? new Date(days[0].date).getTime() : 0;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">Trends</h1>
        <p className="text-sm text-[var(--muted)]">
          {tdee.method === "adaptive"
            ? `Adaptive estimate from ${tdee.daysUsed} days of data`
            : "Starting estimate — keep logging to unlock adaptive insights"}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <Metric
          label="Est. expenditure"
          value={`${tdee.tdee}`}
          unit="kcal/day"
        />
        <Metric
          label="Avg intake (logged)"
          value={avgIntake ? `${avgIntake}` : "—"}
          unit="kcal/day"
        />
        <Metric
          label="Daily balance"
          value={avgIntake ? `${dailyBalance > 0 ? "+" : ""}${dailyBalance}` : "—"}
          unit="kcal/day"
          color={dailyBalance > 0 ? "var(--warn)" : "var(--accent)"}
        />
        <Metric
          label="Projected change"
          value={
            avgIntake
              ? `${projectedWeekly > 0 ? "+" : ""}${projectedWeekly.toFixed(2)}`
              : "—"
          }
          unit="kg/week"
          color={projectedWeekly > 0 ? "var(--warn)" : "var(--accent)"}
        />
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Calories — last 21 days</h2>
          <span className="text-xs text-[var(--muted)]">
            target {targets.calories}
          </span>
        </div>
        <LineChart
          height={190}
          yLabel={(v) => `${Math.round(v / 100) / 10}k`}
          series={[
            {
              points: [
                { x: 0, y: targets.calories },
                { x: 20, y: targets.calories },
              ],
              color: "var(--accent-2)",
              width: 1.5,
              dashed: true,
            },
            {
              points: days
                .map((d, i) => ({ d, i }))
                .filter(({ d }) => d.kcal > 0)
                .map(({ d, i }) => ({
                  x: i,
                  y: d.kcal,
                })),
              color: "var(--accent)",
              width: 2.5,
              dots: true,
            },
          ]}
        />
        <p className="text-xs text-[var(--muted)] mt-2">
          Dashed line is your current calorie target.
        </p>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-1">How adaptive targets work</h2>
        <p className="text-sm text-[var(--muted)]">
          Each day your logged intake and weight trend are reconciled: the
          difference between what you eat and how your weight moves reveals your
          true energy expenditure. Even when individual photo estimates are off,
          the math self-corrects over a couple of weeks — so your targets track
          <em> your </em> metabolism, not a generic formula.
        </p>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  color?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div
        className="text-2xl font-bold tabular-nums mt-1"
        style={{ color: color ?? "var(--foreground)" }}
      >
        {value}
      </div>
      <div className="text-[11px] text-[var(--muted)]">{unit}</div>
    </div>
  );
}
