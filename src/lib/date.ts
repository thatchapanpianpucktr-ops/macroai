/**
 * Format a Date as YYYY-MM-DD in a given IANA timezone. When timeZone is empty
 * or invalid, the device's local timezone is used. en-CA locale yields the
 * ISO-style YYYY-MM-DD ordering.
 */
export function ymdInZone(date: Date, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    const tz = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tz).toISOString().slice(0, 10);
  }
}

/** Today's calendar date (YYYY-MM-DD) in the given timezone (or device local). */
export function todayYmd(timeZone?: string): string {
  return ymdInZone(new Date(), timeZone);
}

/**
 * Calendar arithmetic on a YYYY-MM-DD string, timezone-agnostic (anchored at
 * UTC noon so DST never shifts the date).
 */
export function addDaysYmd(ymd: string, delta: number): string {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
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

/** Curated, friendly timezone options (label shows offset + well-known cities). */
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Auto (device timezone)" },
  { value: "Pacific/Honolulu", label: "UTC−10 · Honolulu" },
  { value: "America/Los_Angeles", label: "UTC−8/−7 · Los Angeles, Vancouver" },
  { value: "America/Denver", label: "UTC−7/−6 · Denver" },
  { value: "America/Chicago", label: "UTC−6/−5 · Chicago, Mexico City" },
  { value: "America/New_York", label: "UTC−5/−4 · New York, Toronto" },
  { value: "America/Sao_Paulo", label: "UTC−3 · São Paulo" },
  { value: "Europe/London", label: "UTC+0/+1 · London, Lisbon" },
  { value: "Europe/Paris", label: "UTC+1/+2 · Paris, Berlin, Madrid" },
  { value: "Europe/Athens", label: "UTC+2/+3 · Athens, Cairo" },
  { value: "Europe/Moscow", label: "UTC+3 · Moscow, Istanbul" },
  { value: "Asia/Dubai", label: "UTC+4 · Dubai" },
  { value: "Asia/Karachi", label: "UTC+5 · Karachi" },
  { value: "Asia/Kolkata", label: "UTC+5:30 · India (Mumbai, Delhi)" },
  { value: "Asia/Dhaka", label: "UTC+6 · Dhaka" },
  { value: "Asia/Bangkok", label: "UTC+7 · Bangkok, Jakarta, Hanoi" },
  { value: "Asia/Singapore", label: "UTC+8 · Singapore, Hong Kong, Manila" },
  { value: "Asia/Tokyo", label: "UTC+9 · Tokyo, Seoul" },
  { value: "Australia/Sydney", label: "UTC+10/+11 · Sydney, Melbourne" },
  { value: "Pacific/Auckland", label: "UTC+12/+13 · Auckland" },
];
