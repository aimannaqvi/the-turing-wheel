import { NextResponse } from "next/server";
import { playDateCT } from "@/lib/date";
import {
  EDGE_TTS_LINES,
  EDGE_VOICES,
  isEdgeTtsConfigured,
  synthesizeEdgeSpeech,
} from "@/lib/edgetts";
import { insertArtifact } from "@/lib/ingest/storage";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isEdgeTtsConfigured()) {
    return NextResponse.json({ error: "Edge TTS unavailable" }, { status: 400 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 400 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY required" },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { count?: number };
  const lines = EDGE_TTS_LINES.slice(
    0,
    Math.min(body.count ?? 5, EDGE_TTS_LINES.length),
  );
  const playDate = playDateCT();
  const created: { id: string; title: string; mediaUrl: string; voice: string }[] =
    [];
  const errors: string[] = [];

  try {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      let done = false;
      for (let vOffset = 0; vOffset < EDGE_VOICES.length && !done; vOffset++) {
        const voice = EDGE_VOICES[(i + vOffset) % EDGE_VOICES.length]!;
        try {
          const audio = await synthesizeEdgeSpeech({ text: line.text, voice });
          const path = `speech/${playDate}/edge-${Date.now()}-${i}.mp3`;
          const { error: uploadError } = await admin.storage
            .from("artifacts")
            .upload(path, audio, { contentType: "audio/mpeg", upsert: true });
          if (uploadError) {
            errors.push(`${voice}: upload ${uploadError.message}`);
            continue;
          }
          const { data: pub } = admin.storage.from("artifacts").getPublicUrl(path);
          const title = line.label;
          const { createHash } = await import("crypto");
          const externalId = createHash("sha256")
            .update(`${voice}|${line.text}`)
            .digest("hex")
            .slice(0, 32);
          const id = await insertArtifact({
            mediaType: "audio",
            title,
            mediaUrl: pub.publicUrl,
            isAi: true,
            source: "edgetts",
            externalId,
            proofUrl: "Microsoft Edge neural TTS",
            educationalNote: "AI speech via Microsoft Edge neural TTS.",
            textContent: line.text,
          });
          if (!id) continue;
          created.push({
            id,
            title,
            mediaUrl: pub.publicUrl,
            voice,
          });
          done = true;
          await new Promise((r) => setTimeout(r, 700));
        } catch (e) {
          errors.push(
            `${voice}: ${e instanceof Error ? e.message : String(e)}`.slice(
              0,
              160,
            ),
          );
        }
      }
    }

    return NextResponse.json({
      ok: created.length > 0,
      created,
      playDate,
      voices: EDGE_VOICES,
      errors: errors.slice(0, 6),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Edge TTS failed";
    return NextResponse.json({ error: message, created }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    configured: true,
    voices: EDGE_VOICES,
    lines: EDGE_TTS_LINES.map((l) => l.label),
  });
}
