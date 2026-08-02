import { NextResponse } from "next/server";
import { backfillExternalIds } from "@/lib/ingest/dedupe";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * 1) Ensures source/external_id columns exist (idempotent SQL via rpc if available —
 *    otherwise run migration 20260802000006 in Supabase SQL editor).
 * 2) Stamps legacy rows so re-ingest skips them.
 */
export async function POST() {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase required" }, { status: 400 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "admin unavailable" }, { status: 400 });
  }

  // Probe columns — if missing, tell admin to run migration SQL
  const { error: probe } = await admin
    .from("media_library")
    .select("source, external_id")
    .limit(1);
  if (probe) {
    return NextResponse.json(
      {
        error:
          "Run migration first in Supabase SQL editor: supabase/migrations/20260802000006_media_library_source_external.sql",
        detail: probe.message,
      },
      { status: 503 },
    );
  }

  try {
    const result = await backfillExternalIds();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "backfill failed" },
      { status: 500 },
    );
  }
}
