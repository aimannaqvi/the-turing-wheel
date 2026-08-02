import { asyncBufferFromUrl, parquetReadObjects } from "hyparquet";
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
 * Hugging Face ingest
 * -----------------
 * OpenFake / Defactify are IMAGE datasets.
 * - Some OpenFake rows have type="video" → still a FRAME from a T2V model (not mp4).
 * - No audio tracks in these datasets.
 */

const SOURCE_DEFACTIFY = "defactify";
const SOURCE_OPENFAKE = "openfake";

const LABEL_B: Record<number, string> = {
  0: "Real (COCO)",
  1: "Stable Diffusion 2.1",
  2: "SDXL",
  3: "Stable Diffusion 3",
  4: "DALL·E 3",
  5: "Midjourney v6",
};

function hfHeaders() {
  const h: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "the-turing-wheel/0.1",
  };
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_HUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function randomOffsets(max: number, n: number): number[] {
  const out = new Set<number>();
  while (out.size < n) {
    out.add(Math.floor(Math.random() * max));
  }
  return [...out];
}

async function ingestDefactify(
  count: number,
  playDate: string,
  sortStart: number,
  seen: Set<string>,
): Promise<{
  ids: string[];
  errors: string[];
  sort: number;
  fake: number;
  real: number;
  skipped: number;
}> {
  const ids: string[] = [];
  const errors: string[] = [];
  let sort = sortStart;
  let fake = 0;
  let real = 0;
  let skipped = 0;
  const wantFake = Math.ceil(count / 2);
  const wantReal = count - wantFake;

  // Huge train set — random deep offsets each run
  const offsets = randomOffsets(80_000, 10);

  for (const offset of offsets) {
    if (fake >= wantFake && real >= wantReal) break;
    const url = new URL("https://datasets-server.huggingface.co/rows");
    url.searchParams.set(
      "dataset",
      "Rajarshi-Roy-research/Defactify_Image_Dataset",
    );
    url.searchParams.set("config", "default");
    url.searchParams.set("split", "train");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("length", "100");

    const res = await fetch(url, { headers: hfHeaders() });
    if (!res.ok) {
      errors.push(`Defactify ${res.status}: ${(await res.text()).slice(0, 160)}`);
      continue;
    }

    const json = (await res.json()) as {
      rows: Array<{
        row_idx: number;
        row: {
          Caption: string;
          Image?: { src?: string };
          Label_A: number;
          Label_B: number;
        };
      }>;
    };

    for (const { row, row_idx } of json.rows ?? []) {
      if (fake >= wantFake && real >= wantReal) break;
      const externalId = `train:${row_idx}`;
      if (seen.has(externalId)) {
        skipped += 1;
        continue;
      }

      const isAi = row.Label_A === 1;
      if (isAi && fake >= wantFake) continue;
      if (!isAi && real >= wantReal) continue;

      if (isAi && fake < Math.floor(wantFake * 0.65) && row.Label_B < 3) {
        continue;
      }

      const src = row.Image?.src;
      if (!src) continue;

      try {
        const { bytes, contentType } = await fetchBinary(src);
        const ext = contentType.includes("png")
          ? "png"
          : contentType.includes("webp")
            ? "webp"
            : "jpg";
        const model = LABEL_B[row.Label_B] ?? `label_b_${row.Label_B}`;
        const mediaUrl = await uploadBytes({
          path: `ingest/defactify/${isAi ? "ai" : "real"}-${row.Label_B}-${row_idx}.${ext}`,
          bytes,
          contentType: contentType.startsWith("image/")
            ? contentType
            : "image/jpeg",
        });

        const id = await insertArtifact({
          mediaType: "image",
          title: isAi ? `Defactify · ${model}` : `Defactify · real COCO`,
          mediaUrl,
          thumbUrl: mediaUrl,
          isAi,
          source: SOURCE_DEFACTIFY,
          externalId,
          proofUrl:
            "https://huggingface.co/datasets/Rajarshi-Roy-research/Defactify_Image_Dataset",
          educationalNote: isAi
            ? `AI image from Defactify (MS-COCOAI). Generator: ${model}. Caption: “${(row.Caption || "").slice(0, 160)}”`
            : `Real MS COCO photo from Defactify. Caption: “${(row.Caption || "").slice(0, 160)}”`,
          textContent: row.Caption,
          playDate,
          sortOrder: sort++,
        });
        if (!id) {
          skipped += 1;
          continue;
        }
        seen.add(externalId);
        ids.push(id);
        if (isAi) fake += 1;
        else real += 1;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
  }

  return { ids, errors, sort, fake, real, skipped };
}

async function ingestOpenFakeParquet(
  count: number,
  playDate: string,
  sortStart: number,
  seen: Set<string>,
): Promise<{
  ids: string[];
  errors: string[];
  sort: number;
  fake: number;
  real: number;
  skipped: number;
}> {
  const ids: string[] = [];
  const errors: string[] = [];
  let sort = sortStart;
  let fake = 0;
  let real = 0;
  let skipped = 0;
  const wantFake = Math.ceil(count / 2);
  const wantReal = count - wantFake;

  const metaRes = await fetch(
    "https://datasets-server.huggingface.co/parquet?dataset=ComplexDataLab/OpenFake",
    { headers: hfHeaders() },
  );
  if (!metaRes.ok) {
    return {
      ids,
      errors: [`OpenFake parquet index ${metaRes.status}`],
      sort,
      fake,
      real,
      skipped,
    };
  }
  const meta = (await metaRes.json()) as {
    parquet_files: Array<{ url: string; split?: string; config?: string }>;
  };

  const files = (meta.parquet_files || [])
    .filter(
      (f) => (f.config === "reddit" || f.config === "core") && f.split === "test",
    )
    .sort(() => Math.random() - 0.5)
    .slice(0, 4);

  for (const file of files) {
    if (fake >= wantFake && real >= wantReal) break;
    try {
      const fileUrl = file.url.includes("?")
        ? file.url
        : `${file.url}${process.env.HF_TOKEN ? `?token=${process.env.HF_TOKEN}` : ""}`;
      const buffer = await asyncBufferFromUrl({ url: fileUrl });
      const rows = (await parquetReadObjects({ file: buffer })) as Array<{
        label?: string;
        model?: string;
        type?: string;
        prompt?: string | null;
        image?: Uint8Array | { bytes?: Uint8Array } | string | null;
      }>;

      const basename =
        file.url.split("/").pop()?.replace(/\.parquet$/i, "") || "file";
      const start = Math.floor(Math.random() * Math.max(1, rows.length - 50));
      const order = Array.from({ length: rows.length }, (_, i) => i)
        .slice(start)
        .concat(Array.from({ length: start }, (_, i) => i));

      for (const i of order) {
        if (fake >= wantFake && real >= wantReal) break;
        const row = rows[i];
        if (!row) continue;
        const externalId = `${basename}:${i}`;
        if (seen.has(externalId)) {
          skipped += 1;
          continue;
        }

        const label = (row.label || "").toLowerCase();
        const isAi = label === "fake";
        if (isAi && fake >= wantFake) continue;
        if (!isAi && real >= wantReal) continue;

        const model = row.model || "unknown";
        let bytes: Buffer | null = null;

        const img = row.image;
        if (img instanceof Uint8Array) {
          bytes = Buffer.from(img);
        } else if (img && typeof img === "object" && "bytes" in img && img.bytes) {
          bytes = Buffer.from(img.bytes);
        } else if (typeof img === "string" && img.startsWith("http")) {
          const got = await fetchBinary(img);
          bytes = got.bytes;
        }

        if (!bytes) continue;

        try {
          const mediaUrl = await uploadBytes({
            path: `ingest/openfake/${basename}-${i}.jpg`,
            bytes,
            contentType: "image/jpeg",
          });
          const frameNote =
            (row.type || "").toLowerCase() === "video"
              ? " Frame from an AI video model (still image)."
              : "";
          const id = await insertArtifact({
            mediaType: "image",
            title: isAi ? `OpenFake · ${model}` : `OpenFake · real · ${model}`,
            mediaUrl,
            thumbUrl: mediaUrl,
            isAi,
            source: SOURCE_OPENFAKE,
            externalId,
            proofUrl: "https://huggingface.co/datasets/ComplexDataLab/OpenFake",
            educationalNote: isAi
              ? `AI image from OpenFake. Generator: ${model}.${frameNote} Prompt: ${String(row.prompt || "").slice(0, 160)}`
              : `Real image from OpenFake (${model}).`,
            textContent: row.prompt ? String(row.prompt) : null,
            playDate,
            sortOrder: sort++,
          });
          if (!id) {
            skipped += 1;
            continue;
          }
          seen.add(externalId);
          ids.push(id);
          if (isAi) fake += 1;
          else real += 1;
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
    } catch (e) {
      errors.push(
        `OpenFake parquet: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return { ids, errors, sort, fake, real, skipped };
}

export async function ingestHuggingFaceOpenFake(count = 40): Promise<IngestResult> {
  const playDate = playDateCT();
  let sort = await nextSortOrder(playDate);
  const allIds: string[] = [];
  const allErrors: string[] = [];
  let fake = 0;
  let real = 0;
  let skipped = 0;

  const seenDef = await loadSeenExternalIds(SOURCE_DEFACTIFY);
  const seenOf = await loadSeenExternalIds(SOURCE_OPENFAKE);

  const d = await ingestDefactify(count, playDate, sort, seenDef);
  allIds.push(...d.ids);
  allErrors.push(...d.errors);
  sort = d.sort;
  fake += d.fake;
  real += d.real;
  skipped += d.skipped;

  const remaining = Math.max(0, count - allIds.length);
  if (remaining > 0) {
    const o = await ingestOpenFakeParquet(remaining, playDate, sort, seenOf);
    allIds.push(...o.ids);
    allErrors.push(...o.errors);
    fake += o.fake;
    real += o.real;
    skipped += o.skipped;
  }

  return {
    source: "huggingface",
    inserted: allIds.length,
    skipped,
    ids: allIds,
    errors: allErrors.slice(0, 15),
    note: `Images only. Defactify+OpenFake → fake=${fake}, real=${real}, skipped_dupes=${skipped}.`,
  };
}
