import type { Confidence } from "./types";

export const CONF_BG: Record<Confidence, string> = {
  high: "rgba(52,211,153,0.18)",
  medium: "rgba(251,191,36,0.18)",
  low: "rgba(248,113,113,0.18)",
};

export const CONF_FG: Record<Confidence, string> = {
  high: "var(--accent)",
  medium: "var(--warn)",
  low: "var(--danger)",
};
