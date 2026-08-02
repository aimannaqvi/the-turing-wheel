import { NextResponse } from "next/server";
import { storagePathFromPublicUrl } from "@/lib/ingest/storage";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase required" }, { status: 400 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "admin unavailable" }, { status: 400 });
  }

  const body = (await request.json()) as { ids?: string[] };
  const ids = body.ids ?? [];
  if (!ids.length) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  const { data: rows } = await admin
    .from("media_library")
    .select("id, media_url, thumb_url")
    .in("id", ids);

  for (const row of rows ?? []) {
    for (const url of [row.media_url, row.thumb_url]) {
      if (!url) continue;
      const path = storagePathFromPublicUrl(url);
      if (path) await admin.storage.from("artifacts").remove([path]);
    }
  }

  await admin.from("user_guesses").delete().in("artifact_id", ids);
  const { error } = await admin.from("media_library").delete().in("id", ids);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: ids.length, ids });
}
