import { NextResponse } from "next/server";
import { playDateCT } from "@/lib/date";
import {
  DEFAULT_AI_LINES,
  isElevenLabsConfigured,
  listUsableVoices,
  resolveVoiceIdForIndex,
  synthesizeSpeech,
} from "@/lib/elevenlabs";
import { insertArtifact } from "@/lib/ingest/storage";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isElevenLabsConfigured()) {
    return NextResponse.json(
      {
        error:
          "Set ELEVENLABS_API_KEY in .env.local (optional ELEVENLABS_VOICE_ID).",
      },
      { status: 400 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY required to upload speech" },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    label?: string;
    voiceId?: string;
    count?: number;
  };

  const lines =
    body.text && body.label
      ? [{ text: body.text, label: body.label, voiceId: body.voiceId }]
      : DEFAULT_AI_LINES.slice(0, Math.min(body.count ?? 3, 5));

  const playDate = playDateCT();
  const created: { id: string; title: string; mediaUrl: string; voice?: string }[] =
    [];

  try {
    const usable = await listUsableVoices();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const voice = line.voiceId
        ? { voiceId: line.voiceId, name: "custom" }
        : await resolveVoiceIdForIndex(i);
      const audio = await synthesizeSpeech({
        text: line.text,
        voiceId: voice.voiceId,
      });

      const path = `speech/${playDate}/eleven-${Date.now()}-${i}.mp3`;
      const { error: uploadError } = await admin.storage
        .from("artifacts")
        .upload(path, audio, {
          contentType: "audio/mpeg",
          upsert: true,
        });

      if (uploadError) {
        return NextResponse.json(
          { error: `Upload failed: ${uploadError.message}`, created },
          { status: 500 },
        );
      }

      const { data: pub } = admin.storage.from("artifacts").getPublicUrl(path);
      // Keep player-facing titles generic — never bake voice names into title
      const title = line.label;

      const { createHash } = await import("crypto");
      const externalId = createHash("sha256")
        .update(`${voice.voiceId}|${line.text}`)
        .digest("hex")
        .slice(0, 32);
      const id = await insertArtifact({
        mediaType: "audio",
        title,
        mediaUrl: pub.publicUrl,
        thumbUrl: null,
        isAi: true,
        source: "elevenlabs",
        externalId,
        proofUrl: "ElevenLabs TTS",
        educationalNote: "AI speech via ElevenLabs TTS.",
        textContent: line.text,
      });
      if (!id) continue;

      created.push({
        id,
        title,
        mediaUrl: pub.publicUrl,
        voice: voice.name,
      });
    }

    return NextResponse.json({
      ok: true,
      created,
      playDate,
      voicesAvailable: usable.map((v) => ({
        id: v.voice_id,
        name: v.name,
        category: v.category,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Speech generate failed";
    return NextResponse.json({ error: message, created }, { status: 500 });
  }
}

export async function GET() {
  if (!isElevenLabsConfigured()) {
    return NextResponse.json({ configured: false, voices: [], defaultLines: [] });
  }
  try {
    const voices = await listUsableVoices();
    return NextResponse.json({
      configured: true,
      voices: voices.map((v) => ({
        id: v.voice_id,
        name: v.name,
        category: v.category,
      })),
      defaultLines: DEFAULT_AI_LINES.map((l) => l.label),
    });
  } catch (e) {
    return NextResponse.json({
      configured: true,
      voices: [],
      error: e instanceof Error ? e.message : "voices failed",
      defaultLines: DEFAULT_AI_LINES.map((l) => l.label),
    });
  }
}
