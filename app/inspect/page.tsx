// app/inspect/page.tsx
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function InspectPage() {
  let userCols: any[] = [];
  let profileCols: any[] = [];
  let error: string | null = null;

  try {
    userCols = await sql`
      SELECT column_name, is_nullable, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `;

    profileCols = await sql`
      SELECT column_name, is_nullable, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'user_profiles'
      ORDER BY ordinal_position
    `;
  } catch (err: any) {
    error = err.message;
  }

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6 bg-[#141416] text-white min-h-screen font-mono text-xs">
      <h1 className="text-xl font-bold text-[#baa3d0]">Neon Schema Inspector</h1>

      {error && <p className="text-red-400">Error: {error}</p>}

      <div>
        <h2 className="text-sm font-semibold mb-2 text-[#baa3d0]">TABLE: users</h2>
        <pre className="bg-black/50 p-4 rounded-xl border border-white/10 overflow-x-auto">
          {JSON.stringify(userCols, null, 2)}
        </pre>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2 text-[#baa3d0]">TABLE: user_profiles</h2>
        <pre className="bg-black/50 p-4 rounded-xl border border-white/10 overflow-x-auto">
          {JSON.stringify(profileCols, null, 2)}
        </pre>
      </div>
    </div>
  );
}