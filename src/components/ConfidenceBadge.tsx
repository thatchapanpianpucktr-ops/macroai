import { CONF_BG, CONF_FG } from "@/lib/confidence";
import type { Confidence } from "@/lib/types";

export function ConfidenceBadge({
  confidence,
  calorieMin,
  calorieMax,
  className = "",
}: {
  confidence?: Confidence;
  calorieMin?: number;
  calorieMax?: number;
  className?: string;
}) {
  if (!confidence && calorieMin == null && calorieMax == null) return null;
  return (
    <div className={`flex items-center gap-2 text-[11px] ${className}`}>
      {confidence && (
        <span
          className="px-2 py-0.5 rounded-full font-medium"
          style={{
            background: CONF_BG[confidence],
            color: CONF_FG[confidence],
          }}
        >
          {confidence} confidence
        </span>
      )}
      {calorieMin != null && calorieMax != null && (
        <span className="text-[var(--muted)]">
          ~{calorieMin}–{calorieMax} kcal
        </span>
      )}
    </div>
  );
}
