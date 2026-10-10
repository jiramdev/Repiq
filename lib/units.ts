// lib/units.ts
import { LIMITS } from "@/lib/validation";

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

/** Allowed body weight range in a unit (25–400 kg, about 55–882 lbs). */
export function bodyWeightRange(unit: WeightUnit): { min: number; max: number } {
  const KG = LIMITS.bodyWeight;
  if (unit === "kg") return { min: KG.min, max: KG.max };
  return { min: Math.ceil(KG.min / KG_PER_LB), max: Math.floor(KG.max / KG_PER_LB) };
}

/**
 * A body weight entered in `unit`, rounded to 0.1, or null when it isn't a
 * number in the allowed range. Accepts numbers and numeric strings ("78,5").
 */
export function parseBodyWeight(value: unknown, unit: WeightUnit): number | null {
  const n =
    typeof value === "string" && value.trim() !== ""
      ? Number(value.replace(",", ".").trim())
      : typeof value === "number"
        ? value
        : NaN;
  if (!Number.isFinite(n)) return null;
  const { min, max } = bodyWeightRange(unit);
  if (n < min || n > max) return null;
  return Math.round(n * 10) / 10;
}
