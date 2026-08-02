import { NextResponse } from "next/server";
import { hasAudioTrack, toBrowserMp4 } from "@/lib/ingest/media";
import { fetchBinary, uploadBytes } from "@/lib/ingest/storage";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/server";

/** Remux library videos so browser audio plays reliably. */
export async function POST(request: Request) {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase required" }, { status: 400 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "admin client unavailable" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    limit?: number;
    prefix?: string;
  };
  const limit = Math.min(Math.max(body.limit ?? 20, 1), 40);
  const prefix = body.prefix ?? "Pixabay";

  const { data, error } = await admin
    .from("media_library")
    .select("id, title, media_url")
    .eq("media_type", "video")
    .ilike("title", `${prefix}%`)
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const fixed: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const row of data ?? []) {
    if (!row.media_url) continue;
    try {
      const { bytes } = await fetchBinary(row.media_url);
      if (!hasAudioTrack(bytes)) {
        skipped.push(`${row.id}: no audio track in file`);
        continue;
      }
      const out = await toBrowserMp4(bytes, { keepAudio: true });
      const marker = "/storage/v1/object/public/artifacts/";
      const idx = row.media_url.indexOf(marker);
      const path =
        idx >= 0
          ? row.media_url.slice(idx + marker.length)
          : `ingest/repair/${row.id}.mp4`;
      const mediaUrl = await uploadBytes({
        path,
        bytes: out,
        contentType: "video/mp4",
      });
      if (mediaUrl !== row.media_url) {
        await admin
          .from("media_library")
          .update({ media_url: mediaUrl })
          .eq("id", row.id);
      }
      fixed.push(row.id);
    } catch (e) {
      errors.push(
        `${row.id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160),
      );
    }
  }

  return NextResponse.json({
    ok: true,
    fixed: fixed.length,
    skipped: skipped.length,
    errors,
    ids: fixed,
  });
}
