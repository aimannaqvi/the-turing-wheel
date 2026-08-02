import { resolveAnalysisEndpoint } from "@/lib/analysis";
import { isEdgeTtsConfigured } from "@/lib/edgetts";
import { isElevenLabsConfigured } from "@/lib/elevenlabs";
import { isOpenAiTtsConfigured } from "@/lib/openai-tts";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type { ProviderStatus } from "@/lib/ingest/types";

export async function getProviderStatus(): Promise<ProviderStatus> {
  const analysis = await resolveAnalysisEndpoint();
  return {
    unsplash: Boolean(process.env.UNSPLASH_ACCESS_KEY),
    pixabay: Boolean(process.env.PIXABAY_API_KEY),
    pollinations: true,
    huggingface: true,
    sdfvd: true,
    aivideo: true,
    openspeech: true,
    commonvoice: true,
    elevenlabs: isElevenLabsConfigured(),
    edgetts: isEdgeTtsConfigured(),
    openaiTts: isOpenAiTtsConfigured(),
    supabase:
      isSupabaseConfigured() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    analysis: analysis != null,
    analysisLabel: analysis
      ? `${analysis.provider} · ${analysis.model}`
      : undefined,
  };
}
