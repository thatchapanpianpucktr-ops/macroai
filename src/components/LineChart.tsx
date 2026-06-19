"use client";

export interface Series {
  points: { x: number; y: number }[];
  color: string;
  width?: number;
  dashed?: boolean;
  dots?: boolean;
}

/** Minimal dependency-free SVG line chart. x values are arbitrary numeric. */
export function LineChart({
  series,
  height = 180,
  yLabel,
  className,
}: {
  series: Series[];
  height?: number;
  yLabel?: (v: number) => string;
  className?: string;
}) {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) {
    return (
      <div
        className={"flex items-center justify-center text-sm text-[var(--muted)] " + (className ?? "")}
        style={{ height }}
      >
        Not enough data yet
      </div>
    );
  }

  const padL = 38;
  const padR = 10;
  const padT = 10;
  const padB = 22;
  const W = 340;
  const H = height;

  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  const padY = (maxY - minY) * 0.1;
  minY -= padY;
  maxY += padY;

  const sx = (x: number) =>
    padL + ((x - minX) / (maxX - minX || 1)) * (W - padL - padR);
  const sy = (y: number) =>
    padT + (1 - (y - minY) / (maxY - minY || 1)) * (H - padT - padB);

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => minY + ((maxY - minY) * i) / yTicks);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={"w-full " + (className ?? "")}
      style={{ height }}
      preserveAspectRatio="none"
    >
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={padL}
            x2={W - padR}
            y1={sy(t)}
            y2={sy(t)}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text
            x={4}
            y={sy(t) + 3}
            fontSize={9}
            fill="var(--muted)"
          >
            {yLabel ? yLabel(t) : Math.round(t)}
          </text>
        </g>
      ))}
      {series.map((s, si) => {
        if (s.points.length === 0) return null;
        const d = s.points
          .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x)} ${sy(p.y)}`)
          .join(" ");
        return (
          <g key={si}>
            <path
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width ?? 2}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.dots &&
              s.points.map((p, i) => (
                <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.5} fill={s.color} />
              ))}
          </g>
        );
      })}
    </svg>
  );
}
