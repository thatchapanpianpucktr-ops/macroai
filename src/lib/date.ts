export function todayYmd(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export function ymdToLabel(ymd: string): string {
  const d = new Date(ymd + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function shortDay(ymd: string): string {
  const d = new Date(ymd + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}
