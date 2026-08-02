import { NextResponse } from "next/server";
import {
  AnalysisError,
  generateAnalysisBullets,
  hasUsableAnalysis,
} from "@/lib/analysis";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const maxDuration = 300;

type Row = {
  id: string;
  media_type: string;
  media_url: string | null;
  thumb_url: string | null;
  title: string | null;
  text_content: string | null;
  is_ai: boolean;
  provenance: string | null;
  analysis_bullets: string[] | null;
};

async function regenerateOne(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  row: Row,
): Promise<{ id: string; bullets: string[] }> {
  const bullets = await generateAnalysisBullets({
    title: row.title,
    mediaType: row.media_type,
    isAi: row.is_ai,
    provenance: row.provenance,
    mediaUrl: row.media_url,
    thumbUrl: row.thumb_url,
    textContent: row.text_content,
  });
  const { error } = await admin
    .from("media_library")
    .update({ analysis_bullets: bullets })
    .eq("id", row.id);
  if (error) throw new Error(error.message);
  return { id: row.id, bullets };
}

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
    /** Regenerate every kept item with missing/template bullets */
    templatesOnly?: boolean;
    allKept?: boolean;
  };

  const select =
    "id, media_type, media_url, thumb_url, title, text_content, is_ai, provenance, analysis_bullets";

  try {
    if (body.id) {
      const { data: row, error } = await admin
        .from("media_library")
        .select(select)
        .eq("id", body.id)
        .maybeSingle();
      if (error || !row) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      const result = await regenerateOne(admin, row as Row);
      return NextResponse.json({ ok: true, updated: 1, items: [result] });
    }

    if (body.allKept || body.templatesOnly) {
      const { data: rows, error } = await admin
        .from("media_library")
        .select(select)
        .eq("status", "kept");
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const targets = (rows as Row[]).filter((r) =>
        body.allKept ? true : !hasUsableAnalysis(r.analysis_bullets),
      );

      const items: Array<{ id: string; bullets: string[] }> = [];
      const errors: Array<{ id: string; error: string }> = [];

      for (const row of targets) {
        try {
          items.push(await regenerateOne(admin, row));
        } catch (e) {
          errors.push({
            id: row.id,
            error: e instanceof Error ? e.message : "failed",
          });
        }
      }

      return NextResponse.json({
        ok: errors.length === 0,
        updated: items.length,
        failed: errors.length,
        items,
        errors,
      });
    }

    return NextResponse.json(
      { error: "id, templatesOnly, or allKept required" },
      { status: 400 },
    );
  } catch (e) {
    const msg =
      e instanceof AnalysisError
        ? e.message
        : e instanceof Error
          ? e.message
          : "regenerate failed";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
