// app/account/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { getActiveUserId } from "@/lib/auth";

export async function toggleUnitSystem(currentUnit: string) {
  const userId = await getActiveUserId();
  const nextUnit = currentUnit === "kg" ? "lbs" : "kg";

  await sql`
    INSERT INTO user_profiles (user_id, unit_system)
    VALUES (${userId}, ${nextUnit})
    ON CONFLICT (user_id) DO UPDATE
    SET unit_system = ${nextUnit}, updated_at = NOW()
  `;

  revalidatePath("/account", "page");
  revalidatePath("/", "page");
  revalidatePath("/statistics", "page");
}

export async function updateAccountDetails(formData: {
  name: string;
  age: number;
  email: string;
  username: string;
  currentPassword?: string;
  newPassword?: string;
}): Promise<{ success: boolean; error?: string }> {
  const userId = await getActiveUserId();
  const cleanUsername = formData.username.replace(/^@+/, "").trim().toLowerCase();
  const cleanEmail = formData.email.trim().toLowerCase();

  if (!cleanUsername) {
    return { success: false, error: "Username cannot be empty." };
  }

  if (!cleanEmail) {
    return { success: false, error: "Email cannot be empty." };
  }

  const existingUser = await sql`
    SELECT user_id 
    FROM user_profiles 
    WHERE LOWER(username) = ${cleanUsername} AND user_id != ${userId}
    LIMIT 1
  `;
  if (existingUser.length > 0) {
    return { success: false, error: "Username is already taken." };
  }

  const existingMail = await sql`
    SELECT user_id 
    FROM user_profiles 
    WHERE LOWER(email) = ${cleanEmail} AND user_id != ${userId}
    LIMIT 1
  `;
  if (existingMail.length > 0) {
    return { success: false, error: "Email is already registered." };
  }

  if (formData.newPassword && formData.newPassword.trim().length > 0) {
    if (!formData.currentPassword || formData.currentPassword.trim().length === 0) {
      return { success: false, error: "Please enter your current password." };
    }

    const userRows = await sql`
      SELECT password_hash
      FROM user_profiles
      WHERE user_id = ${userId}
      LIMIT 1
    `;

    const storedPassword = userRows[0]?.password_hash ?? "••••••••••••";
    if (formData.currentPassword !== storedPassword) {
      return { success: false, error: "Current password does not match." };
    }

    await sql`
      INSERT INTO user_profiles (user_id, name, age, email, username, password_hash)
      VALUES (${userId}, ${formData.name.trim()}, ${formData.age}, ${cleanEmail}, ${cleanUsername}, ${formData.newPassword.trim()})
      ON CONFLICT (user_id) DO UPDATE
      SET name = ${formData.name.trim()},
          age = ${formData.age},
          email = ${cleanEmail},
          username = ${cleanUsername},
          password_hash = ${formData.newPassword.trim()},
          updated_at = NOW()
    `;
  } else {
    await sql`
      INSERT INTO user_profiles (user_id, name, age, email, username)
      VALUES (${userId}, ${formData.name.trim()}, ${formData.age}, ${cleanEmail}, ${cleanUsername})
      ON CONFLICT (user_id) DO UPDATE
      SET name = ${formData.name.trim()},
          age = ${formData.age},
          email = ${cleanEmail},
          username = ${cleanUsername},
          updated_at = NOW()
    `;
  }

  await sql`
    UPDATE users 
    SET email = ${cleanEmail} 
    WHERE id = ${userId}
  `.catch(() => {});

  revalidatePath("/account", "page");
  return { success: true };
}

export async function toggleNotification(
  key: "notify_workout_reminders" | "notify_rest_day_alerts",
  currentVal: boolean
) {
  const userId = await getActiveUserId();
  const nextVal = !currentVal;

  if (key === "notify_workout_reminders") {
    await sql`
      INSERT INTO user_profiles (user_id, notify_workout_reminders)
      VALUES (${userId}, ${nextVal})
      ON CONFLICT (user_id) DO UPDATE
      SET notify_workout_reminders = ${nextVal}, updated_at = NOW()
    `;
  } else {
    await sql`
      INSERT INTO user_profiles (user_id, notify_rest_day_alerts)
      VALUES (${userId}, ${nextVal})
      ON CONFLICT (user_id) DO UPDATE
      SET notify_rest_day_alerts = ${nextVal}, updated_at = NOW()
    `;
  }

  revalidatePath("/account", "page");
  revalidatePath("/workout/[id]", "page");
  revalidatePath("/", "page");
}

export async function resetWorkoutHistory() {
  const userId = await getActiveUserId();

  await sql`
    DELETE FROM completed_sessions
    WHERE user_id = ${userId}
  `;

  await sql`
    DELETE FROM workout_logs
    WHERE workout_id IN (
      SELECT id FROM workouts WHERE user_id = ${userId}
    )
  `;

  await sql`
    UPDATE workouts
    SET completed = false
    WHERE user_id = ${userId}
  `;

  revalidatePath("/", "page");
  revalidatePath("/statistics", "page");
  revalidatePath("/schedule", "page");
  revalidatePath("/account", "page");
}