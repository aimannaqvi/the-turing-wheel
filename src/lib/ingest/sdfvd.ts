import { playDateCT } from "@/lib/date";
import { isMpeg4Visual, toBrowserMp4 } from "@/lib/ingest/media";
import {
  fetchBinary,
  insertArtifact,
  loadSeenExternalIds,
  nextSortOrder,
  uploadBytes,
} from "@/lib/ingest/storage";
import type { IngestResult } from "@/lib/ingest/types";

/**
 * Hemgg/SDFVD-video-dataset — 53 real + 53 face-swap deepfake clips (~4–5s, 720p).
 */

const SOURCE = "sdfvd";

type TreeEntry = { path: string; type: string };

function hfHeaders() {
  const h: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "the-turing-wheel/0.1",
  };
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_HUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function listFolder(folder: "Fake" | "Real"): Promise<string[]> {
  const res = await fetch(
    `https://huggingface.co/api/datasets/Hemgg/SDFVD-video-dataset/tree/main/${folder}`,
    { headers: hfHeaders() },
  );
  if (!res.ok) {
    throw new Error(`SDFVD list ${folder} ${res.status}`);
  }
  const tree = (await res.json()) as TreeEntry[];
  return tree
    .filter((e) => e.type === "file" && e.path.endsWith(".mp4"))
    .map((e) => e.path);
}

function resolveUrl(path: string) {
  return `https://huggingface.co/datasets/Hemgg/SDFVD-video-dataset/resolve/main/${path}`;
}

export async function ingestSdfvd(count = 12): Promise<IngestResult> {
  const playDate = playDateCT();
  let sort = await nextSortOrder(playDate);
  const ids: string[] = [];
  const errors: string[] = [];
  let skipped = 0;
  const seen = await loadSeenExternalIds(SOURCE);

  let fakePaths: string[] = [];
  let realPaths: string[] = [];
  try {
    [fakePaths, realPaths] = await Promise.all([
      listFolder("Fake"),
      listFolder("Real"),
    ]);
  } catch (e) {
    return {
      source: "sdfvd",
      inserted: 0,
      skipped: 0,
      ids: [],
      errors: [e instanceof Error ? e.message : String(e)],
    };
  }

  const freshFake = fakePaths.filter((p) => !seen.has(p));
  const freshReal = realPaths.filter((p) => !seen.has(p));
  skipped +=
    fakePaths.length -
    freshFake.length +
    (realPaths.length - freshReal.length);

  const wantFake = Math.ceil(count / 2);
  const wantReal = count - wantFake;
  const picks: Array<{ path: string; isAi: boolean }> = [
    ...freshFake
      .sort(() => Math.random() - 0.5)
      .slice(0, wantFake)
      .map((path) => ({ path, isAi: true })),
    ...freshReal
      .sort(() => Math.random() - 0.5)
      .slice(0, wantReal)
      .map((path) => ({ path, isAi: false })),
  ];

  if (!picks.length) {
    return {
      source: "sdfvd",
      inserted: 0,
      skipped,
      ids: [],
      errors: [],
      note: "All SDFVD clips already in library (finite ~106 pool).",
    };
  }

  for (const { path, isAi } of picks) {
    try {
      const src = resolveUrl(path);
      let { bytes, contentType } = await fetchBinary(src, hfHeaders());
      if (isMpeg4Visual(bytes) || !bytes.includes(Buffer.from("avc1"))) {
        bytes = await toBrowserMp4(bytes, { keepAudio: false });
        contentType = "video/mp4";
      }
      const base = path.replace(/\//g, "-").replace(/\.mp4$/i, "");
      const mediaUrl = await uploadBytes({
        path: `ingest/sdfvd/${base}-h264.mp4`,
        bytes,
        contentType: contentType.includes("video") ? contentType : "video/mp4",
      });

      const id = await insertArtifact({
        mediaType: "video",
        title: isAi ? `SDFVD deepfake · ${base}` : `SDFVD real · ${base}`,
        mediaUrl,
        thumbUrl: null,
        isAi,
        source: SOURCE,
        externalId: path,
        proofUrl: "https://huggingface.co/datasets/Hemgg/SDFVD-video-dataset",
        educationalNote: isAi
          ? "AI face-swap deepfake (SDFVD / Remaker), remuxed to H.264 for browsers. Silent clip — judge the face, not the sound."
          : "Real stock-derived clip (SDFVD / Pexels source), remuxed to H.264. Silent — same framing as the deepfake pair.",
        playDate,
        sortOrder: sort++,
      });
      if (!id) {
        skipped += 1;
        continue;
      }
      seen.add(path);
      ids.push(id);
    } catch (e) {
      errors.push(
        `${path}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200),
      );
    }
  }

  return {
    source: "sdfvd",
    inserted: ids.length,
    skipped,
    ids,
    errors,
    note: `Remuxed H.264. skipped_dupes=${skipped}. Finite pool (~106).`,
  };
}
