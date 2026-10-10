// app/actions/push.ts
"use server";

import { sql } from "@/lib/db";
import { requireUserId } from "@/lib/auth";

export async function saveSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<{ success: boolean }> {
  const userId = await requireUserId();

  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";

  let validUrl = false;
  try {
    validUrl = new URL(endpoint).protocol === "https:";
  } catch {
    validUrl = false;
  }
  if (!validUrl || endpoint.length > 1024 || !p256dh || p256dh.length > 256 || !auth || auth.length > 128) {
    return { success: false };
  }

  await sql`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (${userId}, ${endpoint}, ${p256dh}, ${auth})
    ON CONFLICT (endpoint) DO UPDATE
    SET user_id = ${userId}, p256dh = ${p256dh}, auth = ${auth}
  `;

  return { success: true };
}
