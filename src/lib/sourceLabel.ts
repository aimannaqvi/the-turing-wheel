/** Tiny human-readable attribution for reveal footers. */
export function formatSourceLabel(
  proofOrProvenance: string | null | undefined,
  isAi: boolean,
): string | null {
  if (!proofOrProvenance?.trim()) return null;
  const raw = proofOrProvenance.trim();

  const labeled = (name: string) =>
    (isAi ? `generated via ${name}` : `source: ${name}`).toLowerCase();

  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      if (host.includes("unsplash")) return labeled("Unsplash");
      if (host.includes("pixabay")) return labeled("Pixabay");
      if (host.includes("pollinations")) return labeled("Pollinations (Flux)");
      if (host.includes("higgsfield") || raw.includes("seedance"))
        return labeled("Higgsfield / Seedance");
      if (host.includes("huggingface") || host.includes("hf.co")) {
        const ds = u.pathname.split("/datasets/")[1];
        return labeled(ds ? `Hugging Face · ${ds}` : "Hugging Face");
      }
      if (host.includes("commonvoice") || host.includes("mozilla"))
        return labeled("Mozilla Common Voice");
      if (host.includes("voiptroubleshooter") || raw.includes("open_speech"))
        return labeled("Open Speech Repository");
      if (host.includes("elevenlabs")) return labeled("ElevenLabs");
      if (host.includes("openai")) return labeled("OpenAI");
      return labeled(host);
    }
  } catch {
    /* fall through */
  }

  const lower = raw.toLowerCase();
  if (lower.includes("elevenlabs")) return labeled("ElevenLabs");
  if (lower.includes("edge") && lower.includes("tts"))
    return labeled("Microsoft Edge TTS");
  if (lower.includes("openai")) return labeled("OpenAI TTS");
  if (lower.includes("pollinations") || lower.includes("flux"))
    return labeled("Pollinations (Flux)");
  if (lower.includes("unsplash")) return labeled("Unsplash");
  if (lower.includes("common voice")) return labeled("Mozilla Common Voice");
  if (lower.includes("openfake") || lower.includes("defactify"))
    return labeled("Hugging Face OpenFake / Defactify");

  // Plain provenance string — keep short
  const clipped = raw.length > 72 ? `${raw.slice(0, 69)}…` : raw;
  return isAi ? clipped : `Source: ${clipped}`;
}
