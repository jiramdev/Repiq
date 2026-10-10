// app/api/push/deliver/route.ts
//
// Called by Upstash QStash when a rest timer is due. Not behind the session
// check (QStash has no cookie); instead every request must carry a valid
// QStash signature issued for exactly this URL.
import { NextResponse } from "next/server";
import { appBaseUrl, claimRestTimer, DELIVER_PATH, getReceiver, releaseRestTimer } from "@/lib/rest-timers";
import { sendPushToUser } from "@/lib/push";
import { str } from "@/lib/strings";

export async function POST(req: Request) {
  const receiver = getReceiver();
  if (!receiver) {
    return NextResponse.json({ error: "QStash signing keys not configured" }, { status: 503 });
  }

  const signature = req.headers.get("upstash-signature");
  const rawBody = await req.text();
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 401 });

  try {
    // `url` pins the signature to this endpoint (the JWT's `sub` claim), so a
    // message signed for another URL on the same QStash account is rejected.
    const valid = await receiver.verify({
      signature,
      body: rawBody,
      url: `${appBaseUrl(req.url)}${DELIVER_PATH}`,
    });
    if (!valid) throw new Error("invalid");
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let timerId = "";
  try {
    timerId = String((JSON.parse(rawBody) as { timerId?: unknown }).timerId ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const timer = await claimRestTimer(timerId);
  if (!timer) return NextResponse.json({ skipped: true });

  const result = await sendPushToUser(timer.userId, {
    type: "rest-complete",
    title: str.workout.restNotificationTitle,
    body: str.workout.restNotificationBody,
    url: timer.workoutId ? `/workout/${timer.workoutId}` : "/",
    tag: "repiq-rest-timer",
    timerId,
  });

  if (result.sent === 0 && result.failed > 0) {
    // Nothing got through: release the claim and let QStash retry.
    await releaseRestTimer(timerId);
    return NextResponse.json({ sent: 0, retry: true }, { status: 502 });
  }
  return NextResponse.json({ sent: result.sent });
}
