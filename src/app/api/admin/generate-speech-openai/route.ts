import { NextResponse } from "next/server";
import { playDateCT } from "@/lib/date";
import { insertArtifact } from "@/lib/ingest/storage";
import {
  OPENAI_TTS_LINES,
  OPENAI_VOICES,
  isOpenAiTtsConfigured,
  synthesizeOpenAiSpeech,
  type OpenAiVoice,
} from "@/lib/openai-tts";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isOpenAiTtsConfigured()) {
    return NextResponse.json(
      { error: "Set OPENAI_API_KEY in .env.local for OpenAI TTS" },
      { status: 400 },
    );
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
  const lines = OPENAI_TTS_LINES.slice(
    0,
    Math.min(body.count ?? 3, OPENAI_TTS_LINES.length),
  );
  const playDate = playDateCT();
  const created: { id: string; title: string; mediaUrl: string; voice: string }[] =
    [];

  try {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const voice = OPENAI_VOICES[i % OPENAI_VOICES.length] as OpenAiVoice;
      const audio = await synthesizeOpenAiSpeech({ text: line.text, voice });
      const path = `speech/${playDate}/openai-${Date.now()}-${i}.mp3`;
      const { error: uploadError } = await admin.storage
        .from("artifacts")
        .upload(path, audio, { contentType: "audio/mpeg", upsert: true });
      if (uploadError) {
        return NextResponse.json(
          { error: `Upload failed: ${uploadError.message}`, created },
          { status: 500 },
        );
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
        source: "openai-tts",
        externalId,
        proofUrl: "OpenAI TTS",
        educationalNote: "AI speech via OpenAI TTS.",
        textContent: line.text,
      });
      if (!id) continue;
      created.push({
        id,
        title,
        mediaUrl: pub.publicUrl,
        voice,
      });
    }

    return NextResponse.json({ ok: true, created, playDate });
  } catch (err) {
    const message = err instanceof Error ? err.message : "OpenAI TTS failed";
    return NextResponse.json({ error: message, created }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    configured: isOpenAiTtsConfigured(),
    voices: OPENAI_VOICES,
    lines: OPENAI_TTS_LINES.map((l) => l.label),
  });
}
