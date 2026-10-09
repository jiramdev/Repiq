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

    return { available: existing.length === 0 };
  } catch (err: any) {
    console.error("checkUsernameAvailable error:", err);
    return { available: true };
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
      SELECT u.id, 
             COALESCE(up.password_hash, u.password_hash, u.password, '') AS password_hash
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE LOWER(TRIM(u.email)) = ${cleanId} 
         OR LOWER(TRIM(COALESCE(up.username, ''))) = ${cleanId}
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

    // 1. Check existing email & username
    const existingEmail = await sql`
      SELECT id FROM users WHERE LOWER(TRIM(email)) = ${cleanEmail} LIMIT 1
    `;
    if (existingEmail.length > 0) {
      return { success: false, error: "Email is already registered." };
    }

    const existingUsername = await sql`
      SELECT user_id FROM user_profiles WHERE LOWER(TRIM(username)) = ${cleanUsername} LIMIT 1
    `;
    if (existingUsername.length > 0) {
      return { success: false, error: "Username is already taken." };
    }

    // 2. Discover columns on `users` table dynamically
    const colRows = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `;
    const userCols = new Set(colRows.map((r: any) => r.column_name.toLowerCase()));

    // 3. Insert into `users` strictly using existing columns
    const hasName = userCols.has("name");
    const hasPasswordHash = userCols.has("password_hash");
    const hasPassword = userCols.has("password");

    let newUser: any[];

    if (hasName && hasPasswordHash) {
      newUser = await sql`
        INSERT INTO users (name, email, password_hash)
        VALUES (${cleanName}, ${cleanEmail}, ${cleanPassword})
        RETURNING id
      `;
    } else if (hasName && hasPassword) {
      newUser = await sql`
        INSERT INTO users (name, email, password)
        VALUES (${cleanName}, ${cleanEmail}, ${cleanPassword})
        RETURNING id
      `;
    } else if (hasPasswordHash) {
      newUser = await sql`
        INSERT INTO users (email, password_hash)
        VALUES (${cleanEmail}, ${cleanPassword})
        RETURNING id
      `;
    } else if (hasPassword) {
      newUser = await sql`
        INSERT INTO users (email, password)
        VALUES (${cleanEmail}, ${cleanPassword})
        RETURNING id
      `;
    } else if (hasName) {
      newUser = await sql`
        INSERT INTO users (name, email)
        VALUES (${cleanName}, ${cleanEmail})
        RETURNING id
      `;
    } else {
      newUser = await sql`
        INSERT INTO users (email)
        VALUES (${cleanEmail})
        RETURNING id
      `;
    }

    const userId = newUser[0].id as number;

    // 4. Discover columns on `user_profiles` table dynamically
    const profileColRows = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'user_profiles'
    `;
    const profileCols = new Set(profileColRows.map((r: any) => r.column_name.toLowerCase()));

    // 5. Insert into `user_profiles` matching available columns
    const pHasPassword = profileCols.has("password_hash");
    const pHasUnit = profileCols.has("unit_system");
    const pHasAge = profileCols.has("age");
    const pHasReminders = profileCols.has("notify_workout_reminders");
    const pHasRestAlerts = profileCols.has("notify_rest_day_alerts");

    await sql`
      INSERT INTO user_profiles (
        user_id,
        name,
        username,
        email
        ${pHasAge ? sql`, age` : sql``}
        ${pHasPassword ? sql`, password_hash` : sql``}
        ${pHasUnit ? sql`, unit_system` : sql``}
        ${pHasReminders ? sql`, notify_workout_reminders` : sql``}
        ${pHasRestAlerts ? sql`, notify_rest_day_alerts` : sql``}
      ) VALUES (
        ${userId},
        ${cleanName},
        ${cleanUsername},
        ${cleanEmail}
        ${pHasAge ? sql`, ${data.age || 24}` : sql``}
        ${pHasPassword ? sql`, ${cleanPassword}` : sql``}
        ${pHasUnit ? sql`, 'kg'` : sql``}
        ${pHasReminders ? sql`, ${data.notify_workout_reminders ?? false}` : sql``}
        ${pHasRestAlerts ? sql`, ${data.notify_rest_day_alerts ?? false}` : sql``}
      )
    `;

    // 6. Seed weekly workouts schedule
    const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    for (const day of days) {
      await sql`
        INSERT INTO workouts (user_id, name, day_label, exercise_count, completed)
        VALUES (${userId}, 'Rest', ${day}, 0, false)
      `;
    }

    // 7. Store session cookie
    await setSessionUser(userId);
    revalidatePath("/", "page");
    return { success: true };
  } catch (err: any) {
    console.error("registerAndOnboard error:", err);
    return {
      success: false,
      error: err.detail || err.message || "Registration failed.",
    };
  }
}

export async function logoutUser() {
  await clearSessionUser();
  redirect("/auth");
}