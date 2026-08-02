import { playDateCT } from "@/lib/date";
import {
  fetchBinary,
  insertArtifact,
  loadSeenExternalIds,
  nextSortOrder,
  uploadBytes,
} from "@/lib/ingest/storage";
import type { IngestResult } from "@/lib/ingest/types";

const SOURCE = "unsplash";

const QUERIES = [
  "portrait studio lighting",
  "night city neon",
  "product photography",
  "drone cityscape",
  "food macro",
  "fashion editorial",
  "street photography candid",
  "architecture interior",
  "people walking city",
  "landscape golden hour",
];

export async function ingestUnsplash(count = 12): Promise<IngestResult> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    return {
      source: "unsplash",
      inserted: 0,
      skipped: 0,
      ids: [],
      errors: ["UNSPLASH_ACCESS_KEY missing"],
    };
  }

  const playDate = playDateCT();
  let sort = await nextSortOrder(playDate);
  const ids: string[] = [];
  const errors: string[] = [];
  let skipped = 0;
  const seen = await loadSeenExternalIds(SOURCE);
  const perQuery = Math.max(1, Math.ceil(count / QUERIES.length));
  const shuffled = [...QUERIES].sort(() => Math.random() - 0.5);

  for (const q of shuffled) {
    if (ids.length >= count) break;
    // Dive deeper into search results each run
    const page = 1 + Math.floor(Math.random() * 12);
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", q);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(Math.min(Math.max(perQuery, 8), 30)));
    url.searchParams.set("orientation", "landscape");

    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${key}` },
    });
    if (!res.ok) {
      errors.push(`unsplash ${res.status}: ${await res.text()}`);
      continue;
    }
    const json = (await res.json()) as {
      results: Array<{
        id: string;
        description: string | null;
        alt_description: string | null;
        urls: { regular: string; small: string };
        links: { html: string };
        user: { name: string };
      }>;
    };

    for (const photo of json.results) {
      if (ids.length >= count) break;
      if (seen.has(photo.id)) {
        skipped += 1;
        continue;
      }
      try {
        const { bytes, contentType } = await fetchBinary(photo.urls.regular);
        const ext = contentType.includes("png") ? "png" : "jpg";
        const mediaUrl = await uploadBytes({
          path: `ingest/unsplash/${photo.id}.${ext}`,
          bytes,
          contentType,
        });
        const id = await insertArtifact({
          mediaType: "image",
          title: photo.alt_description || photo.description || `Unsplash ${photo.id}`,
          mediaUrl,
          thumbUrl: mediaUrl,
          isAi: false,
          source: SOURCE,
          externalId: photo.id,
          proofUrl: photo.links.html,
          educationalNote: `Real photograph via Unsplash API (© ${photo.user.name}). Query: “${q}”.`,
          playDate,
          sortOrder: sort++,
        });
        if (!id) {
          skipped += 1;
          continue;
        }
        seen.add(photo.id);
        ids.push(id);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
  }

  return {
    source: "unsplash",
    inserted: ids.length,
    skipped,
    ids,
    errors,
    note: skipped ? `skipped ${skipped} already in library` : undefined,
  };
}
