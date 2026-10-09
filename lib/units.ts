// lib/units.ts
export type WeightUnit = "kg" | "lbs";

export const KG_PER_LB = 0.45359237;

export function normalizeUnit(value: unknown): WeightUnit {
  return value === "lbs" ? "lbs" : "kg";
}

/** Convert a weight between units, rounded to one decimal. */
export function convertWeight(
  value: number | null | undefined,
  from: WeightUnit | string | null | undefined,
  to: WeightUnit
): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const source = normalizeUnit(from);
  const n = Number(value);
  let result: number;
  if (source === to) result = n;
  else if (to === "kg") result = n * KG_PER_LB;
  else result = n / KG_PER_LB;
  return Math.round(result * 10) / 10;
}

export function formatWeight(value: number | null | undefined, unit: WeightUnit): string {
  if (value == null) return "—";
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`;
}
