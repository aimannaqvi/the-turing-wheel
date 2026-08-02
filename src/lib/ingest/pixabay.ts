import { playDateCT } from "@/lib/date";
import {
  hasAudioTrack,
  isFragmentedMp4,
  isMpeg4Visual,
  toBrowserMp4,
} from "@/lib/ingest/media";
import {
  fetchBinary,
  insertArtifact,
  loadSeenExternalIds,
  nextSortOrder,
  uploadBytes,
} from "@/lib/ingest/storage";
import type { IngestResult } from "@/lib/ingest/types";

/**
 * Pixabay videos — often include audio.
 * Always remux fragmented CDN mp4s → progressive H.264/AAC so browser audio works.
 * Thumbnails are uploaded to Supabase (CDN thumbs 403 when hotlinked).
 */

const SOURCE = "pixabay";

const QUERIES = [
  "people talking",
  "interview",
  "woman speaking",
  "man talking camera",
  "conversation",
  "podcast",
  "street interview",
  "news reporter",
  "vlog talking",
  "meeting discussion",
];

type PixabayVideoHit = {
  id: number;
  pageURL: string;
  tags: string;
  duration: number;
  videos: Record<
    string,
    { url: string; width: number; height: number; size: number; thumbnail: string }
  >;
  user: string;
};

function bestFile(hit: PixabayVideoHit) {
  const order = ["large", "medium", "small", "tiny"] as const;
  for (const k of order) {
    const f = hit.videos[k];
    if (f?.url && f.size > 0) return f;
  }
  return null;
}

export async function ingestPixabay(count = 10): Promise<IngestResult> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) {
    return {
      source: "pixabay",
      inserted: 0,
      skipped: 0,
      ids: [],
      errors: [
        "PIXABAY_API_KEY missing — get a free key at https://pixabay.com/api/docs/",
      ],
    };
  }

  const playDate = playDateCT();
  let sort = await nextSortOrder(playDate);
  const ids: string[] = [];
  const errors: string[] = [];
  let skipped = 0;
  let skippedSilent = 0;
  const seen = await loadSeenExternalIds(SOURCE);
  const shuffled = [...QUERIES].sort(() => Math.random() - 0.5);

  for (const q of shuffled) {
    if (ids.length >= count) break;
    const page = 1 + Math.floor(Math.random() * 8);
    const url = new URL("https://pixabay.com/api/videos/");
    url.searchParams.set("key", key);
    url.searchParams.set("q", q);
    url.searchParams.set("video_type", "film");
    url.searchParams.set("safesearch", "true");
    url.searchParams.set("per_page", "20");
    url.searchParams.set("page", String(page));

    const res = await fetch(url.toString());
    if (!res.ok) {
      errors.push(`pixabay ${res.status}: ${(await res.text()).slice(0, 120)}`);
      continue;
    }
    const json = (await res.json()) as { hits?: PixabayVideoHit[] };

    for (const hit of json.hits ?? []) {
      if (ids.length >= count) break;
      const extId = String(hit.id);
      if (seen.has(extId)) {
        skipped += 1;
        continue;
      }

      const file = bestFile(hit);
      if (!file) continue;

      try {
        let { bytes } = await fetchBinary(file.url);
        if (!hasAudioTrack(bytes)) {
          skippedSilent += 1;
          continue;
        }
        if (
          isFragmentedMp4(bytes) ||
          isMpeg4Visual(bytes) ||
          !bytes.includes(Buffer.from("avc1"))
        ) {
          bytes = await toBrowserMp4(bytes, { keepAudio: true });
        }

        const mediaUrl = await uploadBytes({
          path: `ingest/pixabay/vid-${hit.id}.mp4`,
          bytes,
          contentType: "video/mp4",
        });

        let thumbUrl: string | null = null;
        if (file.thumbnail) {
          try {
            const thumb = await fetchBinary(file.thumbnail);
            thumbUrl = await uploadBytes({
              path: `ingest/pixabay/thumb-${hit.id}.jpg`,
              bytes: thumb.bytes,
              contentType: thumb.contentType.includes("image")
                ? thumb.contentType
                : "image/jpeg",
            });
          } catch {
            thumbUrl = null;
          }
        }

        const id = await insertArtifact({
          mediaType: "video",
          title: `Pixabay · ${hit.tags.split(",")[0]?.trim() || hit.id}`,
          mediaUrl,
          thumbUrl,
          isAi: false,
          source: SOURCE,
          externalId: extId,
          proofUrl: hit.pageURL,
          educationalNote: `Real video with audio via Pixabay (© ${hit.user}). Query “${q}”.`,
          playDate,
          sortOrder: sort++,
        });
        if (!id) {
          skipped += 1;
          continue;
        }
        seen.add(extId);
        ids.push(id);
      } catch (e) {
        errors.push(
          `${hit.id}: ${e instanceof Error ? e.message : String(e)}`.slice(
            0,
            180,
          ),
        );
      }
    }
  }

  return {
    source: "pixabay",
    inserted: ids.length,
    skipped,
    ids,
    errors,
    note: `videos_with_audio=${ids.length}, skipped_dupes=${skipped}, skipped_silent=${skippedSilent}`,
  };
}
