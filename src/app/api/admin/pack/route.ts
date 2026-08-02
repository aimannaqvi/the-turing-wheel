import { NextResponse } from "next/server";
import {
  AnalysisError,
  generateAnalysisBullets,
  hasUsableAnalysis,
} from "@/lib/analysis";
import { getDailyPack } from "@/lib/artifacts";
import { playDateCT } from "@/lib/date";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { MediaType } from "@/lib/types";

export const maxDuration = 300;

async function ensureAnalysisBullets(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  libraryId: string,
) {
  const { data: row } = await admin
    .from("media_library")
    .select(
      "id, media_type, media_url, thumb_url, title, text_content, is_ai, provenance, analysis_bullets",
    )
    .eq("id", libraryId)
    .maybeSingle();
  if (!row) return;
  if (hasUsableAnalysis(row.analysis_bullets)) return;
  const bullets = await generateAnalysisBullets({
    title: row.title,
    mediaType: row.media_type,
    isAi: row.is_ai,
    provenance: row.provenance,
    mediaUrl: row.media_url,
    thumbUrl: row.thumb_url,
    textContent: row.text_content,
  });
  await admin
    .from("media_library")
    .update({ analysis_bullets: bullets })
    .eq("id", libraryId);
}

const MAX_PER_CATEGORY = 20;

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }
  const { searchParams } = new URL(request.url);
  const playDate = searchParams.get("playDate") || playDateCT();
  const items = await getDailyPack(playDate);
  const counts = { image: 0, video: 0, audio: 0, text: 0 } as Record<
    MediaType,
    number
  >;
  for (const i of items) counts[i.mediaType] += 1;
  return NextResponse.json({ playDate, items, counts, maxPerCategory: MAX_PER_CATEGORY });
}

export async function PUT(request: Request) {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase required" }, { status: 400 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "admin unavailable" }, { status: 400 });
  }

  const body = (await request.json()) as {
    playDate?: string;
    /** Full replacement list for the day (all categories). */
    libraryIds?: string[];
  };

  const playDate = body.playDate || playDateCT();
  const libraryIds = body.libraryIds ?? [];

  if (libraryIds.length === 0) {
    // clear day
    await admin.from("daily_pack_items").delete().eq("play_date", playDate);
    return NextResponse.json({ ok: true, playDate, items: [], counts: {} });
  }

  const { data: libs, error: libErr } = await admin
    .from("media_library")
    .select("id, media_type, status")
    .in("id", libraryIds);

  if (libErr || !libs) {
    return NextResponse.json(
      { error: libErr?.message ?? "library fetch failed" },
      { status: 500 },
    );
  }

  const byId = new Map(libs.map((l) => [l.id as string, l]));
  const ordered = libraryIds
    .map((id) => byId.get(id))
    .filter(
      (l): l is (typeof libs)[number] =>
        l != null && (l.status as string) === "kept",
    );

  const counts: Record<string, number> = {};
  for (const l of ordered) {
    const t = l.media_type as string;
    counts[t] = (counts[t] ?? 0) + 1;
    if (counts[t] > MAX_PER_CATEGORY) {
      return NextResponse.json(
        { error: `Max ${MAX_PER_CATEGORY} items for ${t}` },
        { status: 400 },
      );
    }
  }

  // Analysis before pack replace so a failure leaves the old pack intact
  for (const l of ordered) {
    try {
      await ensureAnalysisBullets(admin, l.id as string);
    } catch (e) {
      const msg =
        e instanceof AnalysisError
          ? e.message
          : e instanceof Error
            ? e.message
            : "analysis failed";
      return NextResponse.json({ error: msg }, { status: 503 });
    }
  }

  const { error: delErr } = await admin
    .from("daily_pack_items")
    .delete()
    .eq("play_date", playDate);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  const typeOrder: Record<string, number> = {};
  const rows = ordered.map((l) => {
    const t = l.media_type as string;
    typeOrder[t] = (typeOrder[t] ?? 0) + 1;
    return {
      play_date: playDate,
      media_type: l.media_type,
      library_id: l.id,
      sort_order: typeOrder[t],
    };
  });

  if (rows.length) {
    const { error: insErr } = await admin.from("daily_pack_items").insert(rows);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  for (const l of ordered) {
    const { data: cur } = await admin
      .from("media_library")
      .select("times_used")
      .eq("id", l.id)
      .maybeSingle();
    await admin
      .from("media_library")
      .update({
        times_used: (cur?.times_used ?? 0) + 1,
        last_used_on: playDate,
      })
      .eq("id", l.id);
  }

  const items = await getDailyPack(playDate);
  return NextResponse.json({ ok: true, playDate, items, counts });
}

/** Partial ops: add / remove / reorder within a category */
export async function PATCH(request: Request) {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase required" }, { status: 400 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "admin unavailable" }, { status: 400 });
  }

  const body = (await request.json()) as {
    playDate?: string;
    op?: "add" | "remove" | "reorder";
    libraryId?: string;
    libraryIds?: string[];
    mediaType?: MediaType;
  };

  const playDate = body.playDate || playDateCT();

  if (body.op === "add" && body.libraryId) {
    const { data: lib } = await admin
      .from("media_library")
      .select("id, media_type, status")
      .eq("id", body.libraryId)
      .maybeSingle();
    if (!lib || lib.status !== "kept") {
      return NextResponse.json({ error: "item not in kept library" }, { status: 400 });
    }

    const { count } = await admin
      .from("daily_pack_items")
      .select("*", { count: "exact", head: true })
      .eq("play_date", playDate)
      .eq("media_type", lib.media_type);

    if ((count ?? 0) >= MAX_PER_CATEGORY) {
      return NextResponse.json(
        { error: `Max ${MAX_PER_CATEGORY} for ${lib.media_type}` },
        { status: 400 },
      );
    }

    const { data: maxRow } = await admin
      .from("daily_pack_items")
      .select("sort_order")
      .eq("play_date", playDate)
      .eq("media_type", lib.media_type)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    try {
      await ensureAnalysisBullets(admin, lib.id as string);
    } catch (e) {
      const msg =
        e instanceof AnalysisError
          ? e.message
          : e instanceof Error
            ? e.message
            : "analysis failed";
      return NextResponse.json({ error: msg }, { status: 503 });
    }

    const { error } = await admin.from("daily_pack_items").insert({
      play_date: playDate,
      media_type: lib.media_type,
      library_id: lib.id,
      sort_order: (maxRow?.sort_order ?? 0) + 1,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const { data: cur } = await admin
      .from("media_library")
      .select("times_used")
      .eq("id", lib.id)
      .maybeSingle();
    await admin
      .from("media_library")
      .update({
        times_used: (cur?.times_used ?? 0) + 1,
        last_used_on: playDate,
      })
      .eq("id", lib.id);

    return NextResponse.json({
      ok: true,
      items: await getDailyPack(playDate),
    });
  }

  if (body.op === "remove" && body.libraryId) {
    const { error } = await admin
      .from("daily_pack_items")
      .delete()
      .eq("play_date", playDate)
      .eq("library_id", body.libraryId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      items: await getDailyPack(playDate),
    });
  }

  if (body.op === "reorder" && body.mediaType && body.libraryIds) {
    for (let i = 0; i < body.libraryIds.length; i++) {
      await admin
        .from("daily_pack_items")
        .update({ sort_order: i + 1 })
        .eq("play_date", playDate)
        .eq("media_type", body.mediaType)
        .eq("library_id", body.libraryIds[i]!);
    }
    return NextResponse.json({
      ok: true,
      items: await getDailyPack(playDate),
    });
  }

  return NextResponse.json({ error: "invalid op" }, { status: 400 });
}
