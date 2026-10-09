// app/auth/actions.ts
"use server";

import { sql } from "@/lib/db";
import { setSessionUser, clearSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function checkUsernameAvailable(
  rawUsername: string
): Promise<{ available: boolean; error?: string }> {
  try {
    const username = rawUsername.replace(/^@+/, "").trim().toLowerCase();
    if (!username) {
      return { available: false, error: "Please enter a username." };
    }
    if (username.length < 3) {
      return { available: false, error: "Username must be at least 3 characters." };
    }

    const existing = await sql`
      SELECT user_id FROM user_profiles 
      WHERE LOWER(TRIM(username)) = ${username} 
      LIMIT 1
    `;

    if (existing.length > 0) {
      return { available: false, error: "Username is already taken." };
    }

    return { available: true };
  } catch (err: any) {
    console.error("checkUsernameAvailable error:", err);
    return { available: true }; // Don't block user if check fails
  }
}

export async function loginUser(formData: {
  identifier: string;
  password: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanId = formData.identifier.trim().toLowerCase();
    const password = formData.password.trim();

    if (!cleanId || !password) {
      return { success: false, error: "Please fill in all fields." };
    }

    const userRows = await sql`
      SELECT u.id, up.password_hash
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE LOWER(TRIM(u.email)) = ${cleanId} OR LOWER(TRIM(up.username)) = ${cleanId}
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
  } catch (err: any) {
    console.error("loginUser error:", err);
    return { success: false, error: err.message || "Failed to log in." };
  }
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
  try {
    const cleanName = data.name.trim();
    const cleanUsername = data.username.replace(/^@+/, "").trim().toLowerCase();
    const cleanEmail = data.email.trim().toLowerCase();
    const cleanPassword = data.password.trim();

    if (!cleanName || !cleanUsername || !cleanEmail || !cleanPassword) {
      return { success: false, error: "Please fill in all required fields." };
    }

    // 1. Check if email already exists
    const existingEmail = await sql`
      SELECT id FROM users WHERE LOWER(TRIM(email)) = ${cleanEmail} LIMIT 1
    `;
    if (existingEmail.length > 0) {
      return { success: false, error: "Email is already registered." };
    }

    // 2. Check if username exists
    const existingUsername = await sql`
      SELECT user_id FROM user_profiles WHERE LOWER(TRIM(username)) = ${cleanUsername} LIMIT 1
    `;
    if (existingUsername.length > 0) {
      return { success: false, error: "Username is already taken." };
    }

    // 3. Create entry in users table
    const newUser = await sql`
      INSERT INTO users (email)
      VALUES (${cleanEmail})
      RETURNING id
    `;

    if (!newUser || newUser.length === 0) {
      return { success: false, error: "Failed to create user record." };
    }

    const userId = newUser[0].id as number;

    // 4. Create user profile
    await sql`
      INSERT INTO user_profiles (
        user_id,
        name,
        username,
        email,
        age,
        password_hash,
        unit_system,
        notify_workout_reminders,
        notify_rest_day_alerts
      ) VALUES (
        ${userId},
        ${cleanName},
        ${cleanUsername},
        ${cleanEmail},
        ${data.age || 24},
        ${cleanPassword},
        'kg',
        ${data.notify_workout_reminders ?? false},
        ${data.notify_rest_day_alerts ?? false}
      )
    `;

    // 5. Seed default 7-day schedule for the new user
    const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    for (const day of days) {
      await sql`
        INSERT INTO workouts (user_id, name, day_label, exercise_count, completed)
        VALUES (${userId}, 'Rest', ${day}, 0, false)
      `;
    }

    // 6. Set HTTP session cookie
    await setSessionUser(userId);
    revalidatePath("/", "page");
    return { success: true };
  } catch (err: any) {
    console.error("registerAndOnboard failed with database error:", err);
    return {
      success: false,
      error: err.detail || err.message || "Database registration failed.",
    };
  }
}

export async function logoutUser() {
  await clearSessionUser();
  redirect("/auth");
}