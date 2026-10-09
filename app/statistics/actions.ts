// app/statistics/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { getActiveUserId } from "@/lib/auth";

export async function logWeight(weightValue: number) {
  if (isNaN(weightValue) || weightValue <= 0) return;

  const userId = await getActiveUserId();

  await sql`
    INSERT INTO metrics (user_id, type, value, unit, recorded_at)
    VALUES (${userId}, 'weight', ${weightValue}, 'kg', NOW())
  `;

  revalidatePath("/", "page");
  revalidatePath("/statistics", "page");
  revalidatePath("/account", "page");
}