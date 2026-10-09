// lib/push.ts (server only)
import webPush from "web-push";
import { sql } from "@/lib/db";

let configured: boolean | null = null;

/** Configures web-push on first use. Returns false when VAPID keys aren't set. */
function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@repiq.app",
    publicKey,
    privateKey
  );
  configured = true;
  return true;
}

export function isPushConfigured(): boolean {
  return ensureConfigured();
}

export interface PushPayload {
  type: string;
  title: string;
  body: string;
  url: string;
  tag?: string;
  timerId?: string;
}

/** Send to every device of a user; prunes subscriptions the push service has dropped. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;

  const subscriptions = await sql`
    SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ${userId}
  `;

  let sent = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 60 }
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await sql`DELETE FROM push_subscriptions WHERE endpoint = ${sub.endpoint}`;
        } else {
          console.error("Push send error:", status ?? err);
        }
      }
    })
  );
  return sent;
}
