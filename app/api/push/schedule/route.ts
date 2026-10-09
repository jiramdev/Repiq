import { NextResponse } from "next/server";
import webPush from "web-push";
import { sql } from "@/lib/db";
import { getActiveUserId } from "@/lib/auth";

export const maxDuration = 120;

webPush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:support@repiq.app",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(req: Request) {
  try {
    const { restSeconds, workoutId } = await req.json();
    const userId = await getActiveUserId();

    const subscriptions = await sql`
      SELECT endpoint, p256dh, auth 
      FROM push_subscriptions 
      WHERE user_id = ${userId}
    `;

    if (subscriptions.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    await new Promise((resolve) => setTimeout(resolve, (restSeconds || 30) * 1000));

    const payload = JSON.stringify({
      title: "Rest Complete!",
      body: `Your ${restSeconds}s rest is complete. Ready for the next set?`,
      url: `/workout/${workoutId}`,
    });

    for (const sub of subscriptions) {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await sql`DELETE FROM push_subscriptions WHERE endpoint = ${sub.endpoint}`;
        }
      }
    }

    return NextResponse.json({ ok: true, sent: subscriptions.length });
  } catch (err) {
    console.error("Push schedule error:", err);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}