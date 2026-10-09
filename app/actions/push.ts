// app/actions/push.ts
"use server";

import webPush from "web-push";
import { sql } from "@/lib/db";
import { getActiveUserId } from "@/lib/auth";

webPush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:support@repiq.app",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function saveSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  const userId = await getActiveUserId();

  await sql`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (${userId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth})
    ON CONFLICT (endpoint) DO UPDATE 
    SET user_id = ${userId}, p256dh = ${sub.keys.p256dh}, auth = ${sub.keys.auth}
  `;

  return { success: true };
}