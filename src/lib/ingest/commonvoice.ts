import { pickGenericScene } from "@/lib/audioLabel";
import { playDateCT } from "@/lib/date";
import {
  fetchBinary,
  insertArtifact,
  loadSeenExternalIds,
  nextSortOrder,
  uploadBytes,
} from "@/lib/ingest/storage";
import type { IngestResult } from "@/lib/ingest/types";

/**
 * Mozilla Common Voice — many different real speakers reading sentences.
 */

const SOURCE = "commonvoice";

function hfHeaders() {
  const h: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "the-turing-wheel/0.1",
  };
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_HUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

type CvAudio = { src?: string; type?: string };

type CvRow = {
  row_idx: number;
  row: {
    sentence?: string;
    audio?: CvAudio | CvAudio[];
    client_id?: string;
    age?: string;
    gender?: string;
    accent?: string;
  };
};

function audioSrc(audio?: CvAudio | CvAudio[]): string | null {
  if (!audio) return null;
  if (Array.isArray(audio)) return audio[0]?.src ?? null;
  return audio.src ?? null;
}

function randomOffsets(max: number, n: number): number[] {
  const out = new Set<number>();
  while (out.size < n) out.add(Math.floor(Math.random() * max));
  return [...out];
}

export async function ingestCommonVoice(count = 12): Promise<IngestResult> {
  const playDate = playDateCT();
  let sort = await nextSortOrder(playDate);
  const ids: string[] = [];
  const errors: string[] = [];
  let skipped = 0;
  const seen = await loadSeenExternalIds(SOURCE);
  const seenClients = new Set<string>();

  // Deep random offsets into the English train split
  const offsets = randomOffsets(400_000, 8);

  for (const offset of offsets) {
    if (ids.length >= count) break;
    const url = new URL("https://datasets-server.huggingface.co/rows");
    url.searchParams.set("dataset", "fixie-ai/common_voice_17_0");
    url.searchParams.set("config", "en");
    url.searchParams.set("split", "train");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("length", "100");

    const res = await fetch(url, { headers: hfHeaders() });
    if (!res.ok) {
      errors.push(`commonvoice ${res.status}: ${(await res.text()).slice(0, 160)}`);
      continue;
    }

    const json = (await res.json()) as { rows?: CvRow[] };
    for (const { row, row_idx } of json.rows ?? []) {
      if (ids.length >= count) break;
      const externalId = `en:train:${row_idx}`;
      if (seen.has(externalId)) {
        skipped += 1;
        continue;
      }
      const src = audioSrc(row.audio);
      const client = row.client_id || `idx-${row_idx}`;
      if (!src) continue;
      if (seenClients.has(client) && seenClients.size < count * 3) continue;
      seenClients.add(client);

      try {
        const { bytes, contentType } = await fetchBinary(src, hfHeaders());
        const ext = contentType.includes("mpeg")
          ? "mp3"
          : contentType.includes("wav")
            ? "wav"
            : "mp3";
        const mediaUrl = await uploadBytes({
          path: `ingest/commonvoice/cv-${row_idx}.${ext}`,
          bytes,
          contentType: contentType.includes("audio")
            ? contentType
            : "audio/mpeg",
        });
        const id = await insertArtifact({
          mediaType: "audio",
          title: pickGenericScene(`cv-${row_idx}-${row.sentence ?? ""}`),
          mediaUrl,
          thumbUrl: null,
          isAi: false,
          source: SOURCE,
          externalId,
          proofUrl: "https://commonvoice.mozilla.org/",
          educationalNote:
            "Real human speech (Mozilla Common Voice). Different volunteer speakers — room tone and mic variety are the tells.",
          textContent: row.sentence ?? null,
          playDate,
          sortOrder: sort++,
        });
        if (!id) {
          skipped += 1;
          continue;
        }
        seen.add(externalId);
        ids.push(id);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
  }

  return {
    source: "commonvoice",
    inserted: ids.length,
    skipped,
    ids,
    errors,
    note: `Distinct speakers ≈ ${seenClients.size}, skipped_dupes=${skipped}.`,
  };
}
