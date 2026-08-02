import { playDateCT } from "@/lib/date";
import {
  fetchBinary,
  insertArtifact,
  loadSeenExternalIds,
  nextSortOrder,
  uploadBytes,
} from "@/lib/ingest/storage";
import type { IngestResult } from "@/lib/ingest/types";

const SOURCE = "pollinations";

/** Harder photoreal — faces, phone-cam mess, imperfect light. */
const PROMPTS = [
  "messy iphone selfie of a tired woman in bathroom mirror, harsh overhead light, visible pores, slight motion blur, jpeg artifacts",
  "candid smartphone photo of a man mid-sentence at a bar, flash bounce, uneven skin, beer bottle in foreground out of focus",
  "documentary portrait older woman on subway, fluorescent green cast, sweat, imperfect teeth, 28mm phone lens",
  "group selfie three friends outdoors windy day, one blinking, lens flare, phone camera noise",
  "linkedin-style headshot of a man in office but too perfect skin and glass eyes — photoreal AI tell",
  "night iphone photo of couple talking on sidewalk, neon spill, motion blur hands, grain",
  "zoom call screenshot style — person looking slightly off camera, ring light catchlights, compressed webcam look",
  "street photographer candid of teenager laughing, awkward angle, half-cropped face, real chaos",
  "close-up hands holding coffee while person talks off-frame, shallow DOF, cafe noise bokeh",
  "passport-style photo against white wall, flat light, micro skin texture, subtle asymmetry",
];

export async function ingestPollinations(count = 8): Promise<IngestResult> {
  const playDate = playDateCT();
  let sort = await nextSortOrder(playDate);
  const ids: string[] = [];
  const errors: string[] = [];
  let skipped = 0;
  const key = process.env.POLLINATIONS_API_KEY;
  const seen = await loadSeenExternalIds(SOURCE);

  const picks = [...PROMPTS].sort(() => Math.random() - 0.5).slice(0, count);

  for (const prompt of picks) {
    if (ids.length >= count) break;
    try {
      const seed = Math.floor(Math.random() * 1_000_000);
      const externalId = `seed:${seed}`;
      if (seen.has(externalId)) {
        skipped += 1;
        continue;
      }

      const url = new URL(
        `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`,
      );
      url.searchParams.set("model", "flux");
      url.searchParams.set("width", "1024");
      url.searchParams.set("height", "1024");
      url.searchParams.set("seed", String(seed));
      url.searchParams.set("nologo", "true");
      if (key) url.searchParams.set("key", key);

      const { bytes, contentType } = await fetchBinary(url.toString());
      const mediaUrl = await uploadBytes({
        path: `ingest/pollinations/flux-${seed}.jpg`,
        bytes,
        contentType: contentType.includes("image") ? contentType : "image/jpeg",
      });

      const id = await insertArtifact({
        mediaType: "image",
        title: `Flux · ${prompt.slice(0, 42)}…`,
        mediaUrl,
        thumbUrl: mediaUrl,
        isAi: true,
        source: SOURCE,
        externalId,
        proofUrl: `https://pollinations.ai/?prompt=${encodeURIComponent(prompt)}&seed=${seed}`,
        educationalNote: `AI image generated via Pollinations (Flux). Seed ${seed}. Prompt stored as provenance.`,
        textContent: prompt,
        playDate,
        sortOrder: sort++,
      });
      if (!id) {
        skipped += 1;
        continue;
      }
      seen.add(externalId);
      ids.push(id);

      await new Promise((r) => setTimeout(r, 1600));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return {
    source: "pollinations",
    inserted: ids.length,
    skipped,
    ids,
    errors,
    note: key ? undefined : "Anonymous Pollinations tier (rate-limited).",
  };
}
