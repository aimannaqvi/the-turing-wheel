import { createAdminClient } from "@/lib/supabase/server";

/**
 * Infer (source, external_id) for rows ingested before dedupe columns existed.
 * Best-effort from storage path / provenance so re-ingest skips them.
 */
export function inferIdentity(row: {
  media_url: string | null;
  provenance: string | null;
  title: string | null;
}): { source: string; externalId: string } | null {
  const url = row.media_url || "";
  const prov = row.provenance || "";

  // Unsplash: …/ingest/unsplash/…/{id}.jpg  or page URL
  {
    const m = url.match(/\/ingest\/unsplash\/(?:[^/]+\/)?([A-Za-z0-9_-]+)\.(?:jpe?g|png|webp)/i);
    if (m?.[1]) return { source: "unsplash", externalId: m[1] };
    const u = prov.match(/unsplash\.com\/photos\/(?:.*-)?([A-Za-z0-9_-]+)/i);
    if (u?.[1]) return { source: "unsplash", externalId: u[1] };
  }

  // Pixabay
  {
    const m = url.match(/\/ingest\/pixabay\/(?:[^/]+\/)?vid-(\d+)\.mp4/i);
    if (m?.[1]) return { source: "pixabay", externalId: m[1] };
    const p = prov.match(/pixabay\.com\/(?:videos|gifs)\/[^/]*-(\d+)/i);
    if (p?.[1]) return { source: "pixabay", externalId: p[1] };
  }

  // Defactify
  {
    const m = url.match(
      /\/ingest\/defactify\/(?:[^/]+\/)?(?:ai|real)-\d+-(\d+)\./i,
    );
    if (m?.[1]) return { source: "defactify", externalId: `train:${m[1]}` };
  }

  // OpenFake
  {
    const m = url.match(/\/ingest\/openfake\/(?:[^/]+\/)?(.+)-(\d+)\.jpe?g/i);
    if (m?.[1] && m[2]) {
      return { source: "openfake", externalId: `${m[1]}:${m[2]}` };
    }
  }

  // SDFVD — path Fake/… or Real/…
  if (/SDFVD|Hemgg\/SDFVD/i.test(prov) || /\/ingest\/sdfvd\//i.test(url)) {
    const m = url.match(/\/ingest\/sdfvd\/(?:[^/]+\/)?(Fake|Real)-(.+)-h264\.mp4/i);
    if (m?.[1] && m[2]) {
      return { source: "sdfvd", externalId: `${m[1]}/${m[2]}.mp4` };
    }
  }

  // AI video — higgsfield keys or legacy hc-* hashes
  {
    const m = url.match(
      /\/ingest\/aivideo\/(?:[^/]+\/)?(sd\d|hf\d|hf-e\d)\.mp4/i,
    );
    if (m?.[1]) return { source: "aivideo", externalId: `higgsfield:${m[1]}` };
    const hc = url.match(/\/ingest\/aivideo\/(?:[^/]+\/)?(hc-[a-f0-9]+)\.mp4/i);
    if (hc?.[1]) return { source: "aivideo", externalId: `legacy:${hc[1]}` };
  }

  // Open Speech hotlinks
  {
    const m = url.match(/OSR_us_000_(\d+)_8k\.wav/i);
    if (m?.[1]) return { source: "openspeech", externalId: m[1] };
  }

  // Common Voice
  {
    const m = url.match(/\/ingest\/commonvoice\/(?:[^/]+\/)?cv-(\d+)\./i);
    if (m?.[1]) return { source: "commonvoice", externalId: `en:train:${m[1]}` };
  }

  // Pollinations — seed in path or provenance
  {
    const m = url.match(
      /\/ingest\/pollinations\/(?:[^/]+\/)?flux-([a-zA-Z0-9]+)\.jpe?g/i,
    );
    if (m?.[1]) return { source: "pollinations", externalId: `seed:${m[1]}` };
    const seed = prov.match(/[?&]seed=(\d+)/i);
    if (seed?.[1]) return { source: "pollinations", externalId: `seed:${seed[1]}` };
  }

  // TTS speech uploads — stable on storage path
  {
    const m = url.match(/\/(speech\/[^?]+)$/i);
    if (m?.[1] && /ElevenLabs|Edge neural|OpenAI TTS/i.test(prov)) {
      const src = /ElevenLabs/i.test(prov)
        ? "elevenlabs"
        : /Edge/i.test(prov)
          ? "edgetts"
          : "openai-tts";
      return { source: src, externalId: m[1] };
    }
  }

  return null;
}

/** Stamp source/external_id onto legacy rows so future ingest skips them. */
export async function backfillExternalIds(): Promise<{
  updated: number;
  skipped: number;
  conflicts: number;
}> {
  const admin = createAdminClient();
  if (!admin) throw new Error("admin unavailable");

  let updated = 0;
  let skipped = 0;
  let conflicts = 0;
  const pageSize = 200;
  let from = 0;

  for (;;) {
    const { data, error } = await admin
      .from("media_library")
      .select("id, media_url, provenance, title, source, external_id")
      .is("external_id", null)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const row of data) {
      const inferred = inferIdentity(row);
      if (!inferred) {
        skipped += 1;
        continue;
      }
      const { error: upErr } = await admin
        .from("media_library")
        .update({
          source: inferred.source,
          external_id: inferred.externalId,
        })
        .eq("id", row.id);
      if (upErr) {
        if (upErr.code === "23505") conflicts += 1;
        else skipped += 1;
      } else {
        updated += 1;
      }
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return { updated, skipped, conflicts };
}
