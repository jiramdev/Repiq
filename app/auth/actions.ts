// app/auth/actions.ts
"use server";

import { sql } from "@/lib/db";
import { setSessionUser, clearSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function loginUser(formData: {
  identifier: string;
  password: string;
}): Promise<{ success: boolean; error?: string }> {
  const cleanId = formData.identifier.trim().toLowerCase();
  const password = formData.password.trim();

  if (!cleanId || !password) {
    return { success: false, error: "Please fill in all fields." };
  }

  const userRows = await sql`
    SELECT u.id, up.password_hash
    FROM users u
    LEFT JOIN user_profiles up ON up.user_id = u.id
    WHERE LOWER(u.email) = ${cleanId} OR LOWER(up.username) = ${cleanId}
    LIMIT 1
  `;

  if (userRows.length === 0) {
    return { success: false, error: "Invalid username or password." };
  }

  const user = userRows[0];
  if (user.password_hash && user.password_hash !== password) {
    return { success: false, error: "Invalid username or password." };
  }

  await setSessionUser(user.id);
  revalidatePath("/", "page");
  revalidatePath("/account", "page");
  return { success: true };
}

export async function registerAndOnboard(data: {
  name: string;
  username: string;
  email: string;
  password: string;
  age: number;
  notify_workout_reminders: boolean;
  notify_rest_day_alerts: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const cleanName = data.name.trim();
  const cleanUsername = data.username.replace(/^@+/, "").trim().toLowerCase();
  const cleanEmail = data.email.trim().toLowerCase();
  const cleanPassword = data.password.trim();

  if (!cleanName || !cleanUsername || !cleanEmail || !cleanPassword) {
    return { success: false, error: "Please fill in all required fields." };
  }

  const existingUsername = await sql`
    SELECT user_id FROM user_profiles WHERE LOWER(username) = ${cleanUsername} LIMIT 1
  `;
  if (existingUsername.length > 0) {
    return { success: false, error: "Username is already taken." };
  }

  const existingEmail = await sql`
    SELECT id FROM users WHERE LOWER(email) = ${cleanEmail} LIMIT 1
  `;
  if (existingEmail.length > 0) {
    return { success: false, error: "Email is already registered." };
  }

  // 1. Create User
  const newUser = await sql`
    INSERT INTO users (email)
    VALUES (${cleanEmail})
    RETURNING id
  `;
  const userId = newUser[0].id as number;

  // 2. Create User Profile
  await sql`
    INSERT INTO user_profiles (
      user_id, name, username, email, age, password_hash, unit_system, 
      notify_workout_reminders, notify_rest_day_alerts
    ) VALUES (
      ${userId}, ${cleanName}, ${cleanUsername}, ${cleanEmail}, ${data.age || 24},
      ${cleanPassword}, 'kg', ${data.notify_workout_reminders}, ${data.notify_rest_day_alerts}
    )
  `;

  // 3. Seed Day Schedule (SUN - SAT)
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  for (const day of days) {
    await sql`
      INSERT INTO workouts (user_id, name, day_label, exercise_count, completed)
      VALUES (${userId}, 'Rest', ${day}, 0, false)
    `;
  }

  await setSessionUser(userId);
  revalidatePath("/", "page");
  return { success: true };
}

export async function logoutUser() {
  await clearSessionUser();
  redirect("/auth");
}