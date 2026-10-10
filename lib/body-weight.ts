// lib/body-weight.ts (server only)
import { sql } from "@/lib/db";
import type { WeightUnit } from "@/lib/units";

/**
 * Queries that record a new body weight: the latest value on the profile and
 * an entry in the weight log (metrics) that Statistics reads. Run them in one
 * sql.transaction so both or neither happen.
 */
export function bodyWeightQueries(userId: string, weight: number, unit: WeightUnit) {
  return [
    sql`
      UPDATE user_profiles
      SET body_weight = ${weight}, body_weight_unit = ${unit}, updated_at = now()
      WHERE user_id = ${userId}
    `,
    sql`
      INSERT INTO metrics (user_id, type, value, unit, recorded_at)
      VALUES (${userId}, 'weight', ${weight}, ${unit}, now())
    `,
  ];
}
