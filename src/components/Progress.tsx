"use client";

export function CalorieRing({
  consumed,
  target,
  size = 184,
}: {
  consumed: number;
  target: number;
  size?: number;
}) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(consumed / target, 1) : 0;
  const remaining = Math.round(target - consumed);
  const over = remaining < 0;
  const color = over ? "var(--danger)" : "var(--accent)";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.3s" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-4xl font-bold tabular-nums"
          style={{ color: over ? "var(--danger)" : "var(--foreground)" }}
        >
          {Math.abs(remaining)}
        </span>
        <span className="text-xs text-[var(--muted)] mt-1">
          {over ? "over" : "kcal left"}
        </span>
        <span className="text-[11px] text-[var(--muted)] mt-2">
          {Math.round(consumed)} / {target}
        </span>
      </div>
    </div>
  );
}

export function MacroBar({
  label,
  value,
  target,
  color,
  unit = "g",
}: {
  label: string;
  value: number;
  target: number;
  color: string;
  unit?: string;
}) {
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-medium text-[var(--muted)]">{label}</span>
        <span className="text-xs tabular-nums">
          {Math.round(value)}
          <span className="text-[var(--muted)]">
            /{target}
            {unit}
          </span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct * 100}%`,
            background: color,
            transition: "width 0.5s ease",
          }}
        />
      </div>
    </div>
  );
}
