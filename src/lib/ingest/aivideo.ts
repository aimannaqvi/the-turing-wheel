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
 * High-quality AI video (actual T2V / gen video — not face-swap SDFVD).
 */

const SOURCE = "aivideo";

type Clip = {
  key: string;
  title: string;
  url: string;
  thumbUrl?: string | null;
  proofUrl: string;
  note: string;
  generator: string;
};

const HIGGSFIELD: Clip[] = [
  {
    key: "sd1",
    title: "Seedance 1",
    url: "https://static.higgsfield.ai/seedance-2.0-v2/examples/1-mini.mp4",
    thumbUrl:
      "https://static.higgsfield.ai/seedance-2.0-v2/examples/1-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/seedance/2.0",
    note: "AI — Seedance 2.0 (Higgsfield). Watch identity drift and background morph.",
    generator: "Seedance",
  },
  {
    key: "sd2",
    title: "Seedance 2",
    url: "https://static.higgsfield.ai/seedance-2.0-v2/examples/2-mini.mp4",
    thumbUrl:
      "https://static.higgsfield.ai/seedance-2.0-v2/examples/2-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/seedance/2.0",
    note: "AI — Seedance 2.0. Cloth/hair physics and micro facial instability.",
    generator: "Seedance",
  },
  {
    key: "sd3",
    title: "Seedance 3",
    url: "https://static.higgsfield.ai/seedance-2.0-v2/examples/3-mini.mp4",
    thumbUrl:
      "https://static.higgsfield.ai/seedance-2.0-v2/examples/3-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/seedance/2.0",
    note: "AI — Seedance 2.0. Extremely photoreal; provenance is the hard tell.",
    generator: "Seedance",
  },
  {
    key: "sd4",
    title: "Seedance 4",
    url: "https://static.higgsfield.ai/seedance-2.0-v2/examples/4-mini.mp4",
    thumbUrl:
      "https://static.higgsfield.ai/seedance-2.0-v2/examples/4-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/seedance/2.0",
    note: "AI — Seedance 2.0. Temporal edge flicker on hands/props.",
    generator: "Seedance",
  },
  {
    key: "sd5",
    title: "Seedance 5",
    url: "https://static.higgsfield.ai/seedance-2.0-v2/examples/5-mini.mp4",
    thumbUrl:
      "https://static.higgsfield.ai/seedance-2.0-v2/examples/5-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/seedance/2.0",
    note: "AI — Seedance 2.0. Over-stable exposure vs optical capture.",
    generator: "Seedance",
  },
  {
    key: "hf1",
    title: "Higgsfield cinema",
    url: "https://static.higgsfield.ai/ai-video-v2/01-mini.mp4",
    thumbUrl: "https://static.higgsfield.ai/ai-video-v2/01-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/ai-video",
    note: "AI — Higgsfield Cinema Studio demo.",
    generator: "Higgsfield",
  },
  {
    key: "hf2",
    title: "Higgsfield 02",
    url: "https://static.higgsfield.ai/ai-video-v2/02-mini.mp4",
    thumbUrl: "https://static.higgsfield.ai/ai-video-v2/02-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/ai-video",
    note: "AI — Higgsfield sample. Micro-flicker on edges.",
    generator: "Higgsfield",
  },
  {
    key: "hf3",
    title: "Higgsfield 03",
    url: "https://static.higgsfield.ai/ai-video-v2/03-mini.mp4",
    thumbUrl: "https://static.higgsfield.ai/ai-video-v2/03-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/ai-video",
    note: "AI — Higgsfield sample.",
    generator: "Higgsfield",
  },
  {
    key: "hf-e1",
    title: "Higgsfield gen 1",
    url: "https://static.higgsfield.ai/ai-video-v2/example-1-mini.mp4",
    thumbUrl:
      "https://static.higgsfield.ai/ai-video-v2/example-1-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/ai-video",
    note: "AI — Higgsfield example reel.",
    generator: "Higgsfield",
  },
  {
    key: "hf-e2",
    title: "Higgsfield gen 2",
    url: "https://static.higgsfield.ai/ai-video-v2/example-2-mini.mp4",
    thumbUrl:
      "https://static.higgsfield.ai/ai-video-v2/example-2-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/ai-video",
    note: "AI — Higgsfield example reel.",
    generator: "Higgsfield",
  },
  {
    key: "hf-e3",
    title: "Higgsfield gen 3",
    url: "https://static.higgsfield.ai/ai-video-v2/example-3-mini.mp4",
    thumbUrl:
      "https://static.higgsfield.ai/ai-video-v2/example-3-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/ai-video",
    note: "AI — Higgsfield example reel.",
    generator: "Higgsfield",
  },
];

function hfHeaders() {
  const h: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "the-turing-wheel/0.1",
  };
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_HUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function listHfMp4s(dataset: string, folder: string): Promise<string[]> {
  const res = await fetch(
    `https://huggingface.co/api/datasets/${dataset}/tree/main/${folder}`,
    { headers: hfHeaders() },
  );
  if (!res.ok) throw new Error(`HF list ${folder} ${res.status}`);
  const tree = (await res.json()) as Array<{ path: string; type: string }>;
  return tree
    .filter((e) => e.type === "file" && e.path.endsWith(".mp4"))
    .map((e) => e.path);
}

function resolveHf(dataset: string, path: string) {
  return `https://huggingface.co/datasets/${dataset}/resolve/main/${path}`;
}

async function storeClip(
  clip: Clip,
  playDate: string,
  sort: number,
  externalId: string,
): Promise<string | null> {
  let { bytes, contentType } = await fetchBinary(clip.url, hfHeaders());
  if (isMpeg4Visual(bytes) || !bytes.includes(Buffer.from("avc1"))) {
    bytes = await toBrowserMp4(bytes, { keepAudio: true });
    contentType = "video/mp4";
  }

  const mediaUrl = await uploadBytes({
    path: `ingest/aivideo/${externalId.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80)}.mp4`,
    bytes,
    contentType: contentType.includes("video") ? contentType : "video/mp4",
  });

  let thumbUrl = clip.thumbUrl ?? null;
  if (clip.thumbUrl) {
    try {
      const t = await fetchBinary(clip.thumbUrl);
      thumbUrl = await uploadBytes({
        path: `ingest/aivideo/${externalId.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80)}-thumb.webp`,
        bytes: t.bytes,
        contentType: t.contentType.includes("image")
          ? t.contentType
          : "image/webp",
      });
    } catch {
      thumbUrl = null;
    }
  }

  return insertArtifact({
    mediaType: "video",
    title: `${clip.generator} · ${clip.title}`,
    mediaUrl,
    thumbUrl,
    isAi: true,
    source: SOURCE,
    externalId,
    proofUrl: clip.proofUrl,
    educationalNote: clip.note,
    playDate,
    sortOrder: sort,
  });
}

export async function ingestAiVideo(count = 12): Promise<IngestResult> {
  const playDate = playDateCT();
  let sort = await nextSortOrder(playDate);
  const ids: string[] = [];
  const errors: string[] = [];
  let skipped = 0;
  const seen = await loadSeenExternalIds(SOURCE);

  const higgs = [...HIGGSFIELD]
    .filter((c) => {
      const ext = `higgsfield:${c.key}`;
      if (seen.has(ext)) {
        skipped += 1;
        return false;
      }
      return true;
    })
    .sort(() => Math.random() - 0.5);
  const wantHiggs = Math.min(Math.ceil(count * 0.45), higgs.length);
  for (const clip of higgs.slice(0, wantHiggs)) {
    const externalId = `higgsfield:${clip.key}`;
    try {
      const id = await storeClip(clip, playDate, sort++, externalId);
      if (!id) {
        skipped += 1;
        continue;
      }
      seen.add(externalId);
      ids.push(id);
    } catch (e) {
      errors.push(
        `${clip.key}: ${e instanceof Error ? e.message : String(e)}`.slice(
          0,
          160,
        ),
      );
    }
  }

  try {
    const dataset = "Nima0Kamali/humancentric-scenes-ai";
    const [sora, gemini] = await Promise.all([
      listHfMp4s(dataset, "data/set6_video/ai_sora"),
      listHfMp4s(dataset, "data/set6_video/ai_gemini"),
    ]);
    const picks = [
      ...sora
        .map((path) => ({ path, generator: "Sora" as const }))
        .filter(({ path }) => !seen.has(`${dataset}:${path}`)),
      ...gemini
        .map((path) => ({ path, generator: "Gemini" as const }))
        .filter(({ path }) => !seen.has(`${dataset}:${path}`)),
    ].sort(() => Math.random() - 0.5);

    skipped += sora.length + gemini.length - picks.length;

    for (const { path, generator } of picks) {
      if (ids.length >= count) break;
      const externalId = `${dataset}:${path}`;
      try {
        const clip: Clip = {
          key: `hc-${path.split("/").pop()?.slice(0, 16) || ids.length}`,
          title: `${generator} scene`,
          url: resolveHf(dataset, path),
          proofUrl: `https://huggingface.co/datasets/${dataset}`,
          note: `AI video (${generator}) from humancentric-scenes-ai. Modern gen — look for temporal morph and over-smooth skin.`,
          generator,
        };
        const id = await storeClip(clip, playDate, sort++, externalId);
        if (!id) {
          skipped += 1;
          continue;
        }
        seen.add(externalId);
        ids.push(id);
      } catch (e) {
        errors.push(
          `${path}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160),
        );
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  if (ids.length < count) {
    try {
      const dataset = "aadityaubhat/synthetic-emotions";
      const paths = (await listHfMp4s(dataset, "train")).filter(
        (path) => !seen.has(`${dataset}:${path}`),
      );
      const picks = paths
        .sort(() => Math.random() - 0.5)
        .slice(0, count - ids.length);
      for (const path of picks) {
        const externalId = `${dataset}:${path}`;
        try {
          const name =
            path.split("/").pop()?.replace(/\.mp4$/i, "").slice(0, 42) ||
            "emotion";
          const clip: Clip = {
            key: `emo-${name.slice(0, 20)}`,
            title: name.replace(/_/g, " "),
            url: resolveHf(dataset, path),
            proofUrl: `https://huggingface.co/datasets/${dataset}`,
            note: "AI — OpenAI Sora (Synthetic Emotions). Portrait gen; watch micro expression + hair physics.",
            generator: "Sora",
          };
          const id = await storeClip(clip, playDate, sort++, externalId);
          if (!id) {
            skipped += 1;
            continue;
          }
          seen.add(externalId);
          ids.push(id);
        } catch (e) {
          errors.push(
            `${path}: ${e instanceof Error ? e.message : String(e)}`.slice(
              0,
              160,
            ),
          );
        }
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return {
    source: "aivideo",
    inserted: ids.length,
    skipped,
    ids,
    errors,
    note: `Higgsfield/Seedance + HF Sora/Gemini. skipped_dupes=${skipped}.`,
  };
}
