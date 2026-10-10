// lib/time.ts
export const DEFAULT_TIMEZONE = "Europe/Amsterdam";

export const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
export type DayLabel = (typeof DAY_LABELS)[number];
/** Display order for the week (Monday first). */
export const WEEK_ORDER: DayLabel[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export function isDayLabel(value: unknown): value is DayLabel {
  return typeof value === "string" && (DAY_LABELS as readonly string[]).includes(value);
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(tz: unknown): string {
  return isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE;
}

/**
 * The calendar date ("YYYY-MM-DD") and weekday label for `now` as seen in
 * `timeZone`. The server runs in UTC, so this is what "today" means for the user.
 */
export function todayIn(
  timeZone: string,
  now: Date = new Date()
): { date: string; dayLabel: DayLabel; year: number; month: number; day: number } {
  const tz = resolveTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const dayLabel = get("weekday").slice(0, 3).toUpperCase() as DayLabel;

  return {
    date: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    dayLabel,
    year,
    month,
    day,
  };
}
