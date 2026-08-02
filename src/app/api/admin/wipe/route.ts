import { NextResponse } from "next/server";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/server";

/** Nuclear option: clear packs, library, guesses. Storage objects left for manual GC. */
export async function POST(request: Request) {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase required" }, { status: 400 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "admin unavailable" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    confirm?: string;
  };
  if (body.confirm !== "WIPE") {
    return NextResponse.json(
      { error: 'Pass { "confirm": "WIPE" } to proceed' },
      { status: 400 },
    );
  }

  await admin.from("user_guesses").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("daily_pack_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("media_library").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  return NextResponse.json({
    ok: true,
    message: "Library, packs, and guesses wiped. Re-ingest → swipe → build pack.",
  });
}
