import { NextResponse } from "next/server";
import { ingestAiVideo } from "@/lib/ingest/aivideo";
import { ingestCommonVoice } from "@/lib/ingest/commonvoice";
import { backfillExternalIds } from "@/lib/ingest/dedupe";
import { ingestHuggingFaceOpenFake } from "@/lib/ingest/huggingface";
import { ingestOpenSpeech } from "@/lib/ingest/openspeech";
import { ingestPixabay } from "@/lib/ingest/pixabay";
import { ingestPollinations } from "@/lib/ingest/pollinations";
import { ingestSdfvd } from "@/lib/ingest/sdfvd";
import { getProviderStatus } from "@/lib/ingest/status";
import { ingestUnsplash } from "@/lib/ingest/unsplash";
import type { IngestSource } from "@/lib/ingest/types";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/server";

async function assertDedupeSchema() {
  const admin = createAdminClient();
  if (!admin) throw new Error("admin unavailable");
  const { error } = await admin
    .from("media_library")
    .select("source, external_id")
    .limit(1);
  if (error?.message?.includes("external_id") || error?.code === "42703") {
    throw new Error(
      "Dedupe schema missing — run SQL in Supabase: supabase/migrations/20260802000006_media_library_source_external.sql then retry ingest",
    );
  }
  // Best-effort stamp legacy rows so we don't re-download them
  try {
    await backfillExternalIds();
  } catch {
    /* ignore */
  }
}

export async function GET() {
  return NextResponse.json({ providers: await getProviderStatus() });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Supabase service role required for ingest" },
      { status: 400 },
    );
  }

  const body = (await request.json()) as {
    source?: IngestSource;
    count?: number;
  };

  const source = body.source;
  const count = Math.min(Math.max(body.count ?? 12, 1), 60);

  if (!source) {
    return NextResponse.json({ error: "source required" }, { status: 400 });
  }

  try {
    await assertDedupeSchema();
    switch (source) {
      case "unsplash":
        return NextResponse.json(await ingestUnsplash(count));
      case "pixabay":
        return NextResponse.json(await ingestPixabay(count));
      case "pollinations":
        return NextResponse.json(await ingestPollinations(count));
      case "huggingface":
        return NextResponse.json(await ingestHuggingFaceOpenFake(count));
      case "sdfvd":
        return NextResponse.json(await ingestSdfvd(count));
      case "aivideo":
        return NextResponse.json(await ingestAiVideo(count));
      case "openspeech":
        return NextResponse.json(await ingestOpenSpeech(count));
      case "commonvoice":
        return NextResponse.json(await ingestCommonVoice(count));
      case "elevenlabs":
        return NextResponse.json(
          { error: "Use POST /api/admin/generate-speech for ElevenLabs" },
          { status: 400 },
        );
      case "edgetts":
        return NextResponse.json(
          { error: "Use POST /api/admin/generate-speech-edge for Edge TTS" },
          { status: 400 },
        );
      case "openai-tts":
        return NextResponse.json(
          { error: "Use POST /api/admin/generate-speech-openai for OpenAI TTS" },
          { status: 400 },
        );
      default:
        return NextResponse.json({ error: "unknown source" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ingest failed" },
      { status: 500 },
    );
  }
}
