import { NextResponse } from "next/server";
import { AnalysisError, generateAnalysisBullets } from "@/lib/analysis";
import { storagePathFromPublicUrl } from "@/lib/ingest/storage";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase required" }, { status: 400 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "admin unavailable" }, { status: 400 });
  }

  const body = (await request.json()) as {
    id?: string;
    action?: "keep" | "discard";
  };
  if (!body.id || (body.action !== "keep" && body.action !== "discard")) {
    return NextResponse.json(
      { error: "id and action (keep|discard) required" },
      { status: 400 },
    );
  }

  const { data: row, error } = await admin
    .from("media_library")
    .select(
      "id, media_type, media_url, thumb_url, title, text_content, is_ai, provenance, status",
    )
    .eq("id", body.id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (body.action === "discard") {
    // Best-effort storage cleanup
    for (const url of [row.media_url, row.thumb_url]) {
      if (!url) continue;
      const path = storagePathFromPublicUrl(url);
      if (path) {
        await admin.storage.from("artifacts").remove([path]);
      }
    }
    const { error: delErr } = await admin
      .from("media_library")
      .delete()
      .eq("id", body.id);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, action: "discard", id: body.id });
  }

  // keep — analysis is generated here (vision/LLM), not templates
  let bullets: string[];
  try {
    bullets = await generateAnalysisBullets({
      title: row.title,
      mediaType: row.media_type,
      isAi: row.is_ai,
      provenance: row.provenance,
      mediaUrl: row.media_url,
      thumbUrl: row.thumb_url,
      textContent: row.text_content,
    });
  } catch (e) {
    const msg =
      e instanceof AnalysisError
        ? e.message
        : e instanceof Error
          ? e.message
          : "analysis failed";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const { error: upErr } = await admin
    .from("media_library")
    .update({
      status: "kept",
      analysis_bullets: bullets,
    })
    .eq("id", body.id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    action: "keep",
    id: body.id,
    analysisBullets: bullets,
  });
}
