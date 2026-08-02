import { pickGenericScene } from "@/lib/audioLabel";
import { playDateCT } from "@/lib/date";
import {
  insertArtifact,
  loadSeenExternalIds,
  nextSortOrder,
} from "@/lib/ingest/storage";
import type { IngestResult } from "@/lib/ingest/types";

/**
 * Open Speech Repository — real people reading English sentences (8 kHz WAV).
 * Finite pool — once all ids are in the library, ingest returns 0 new.
 */
const SOURCE = "openspeech";

const CLIPS: Array<{ id: string }> = [
  { id: "0010" },
  { id: "0011" },
  { id: "0012" },
  { id: "0013" },
  { id: "0014" },
  { id: "0015" },
  { id: "0016" },
  { id: "0017" },
  { id: "0018" },
  { id: "0019" },
  { id: "0030" },
  { id: "0040" },
];

function mediaUrl(id: string) {
  return `https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_${id}_8k.wav`;
}

export async function ingestOpenSpeech(count = 8): Promise<IngestResult> {
  const playDate = playDateCT();
  let sort = await nextSortOrder(playDate);
  const ids: string[] = [];
  const errors: string[] = [];
  let skipped = 0;
  const seen = await loadSeenExternalIds(SOURCE);
  const fresh = CLIPS.filter((c) => !seen.has(c.id));
  skipped += CLIPS.length - fresh.length;
  const picks = [...fresh].sort(() => Math.random() - 0.5).slice(0, count);

  if (!picks.length) {
    return {
      source: "openspeech",
      inserted: 0,
      skipped,
      ids: [],
      errors: [],
      note: "All Open Speech clips already in library (finite 12).",
    };
  }

  for (const clip of picks) {
    try {
      const url = mediaUrl(clip.id);
      const head = await fetch(url, { method: "HEAD" });
      if (!head.ok) {
        errors.push(`openspeech ${clip.id} ${head.status}`);
        continue;
      }
      const id = await insertArtifact({
        mediaType: "audio",
        title: pickGenericScene(`osr-${clip.id}`),
        mediaUrl: url,
        thumbUrl: null,
        isAi: false,
        source: SOURCE,
        externalId: clip.id,
        proofUrl: "https://www.voiptroubleshooter.com/open_speech/",
        educationalNote:
          "Real human speech (Open Speech Repository). Breath, room tone, uneven pacing — the messy stuff TTS sandpapers away.",
        playDate,
        sortOrder: sort++,
      });
      if (!id) {
        skipped += 1;
        continue;
      }
      seen.add(clip.id);
      ids.push(id);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return {
    source: "openspeech",
    inserted: ids.length,
    skipped,
    ids,
    errors,
    note: `Real read speech. skipped_dupes=${skipped}. Pair with ElevenLabs for AI.`,
  };
}
