import { createAdminClient } from "@/lib/supabase/server";
import type { MediaType } from "@/lib/types";

export async function uploadBytes(opts: {
  path: string;
  bytes: Buffer;
  contentType: string;
}): Promise<string> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client unavailable");

  const { error } = await admin.storage
    .from("artifacts")
    .upload(opts.path, opts.bytes, {
      contentType: opts.contentType,
      upsert: true,
    });
  if (error) throw new Error(error.message);

  const { data } = admin.storage.from("artifacts").getPublicUrl(opts.path);
  return data.publicUrl;
}

/** All external_ids already in the library for a source (intake + kept + anything). */
export async function loadSeenExternalIds(
  source: string,
): Promise<Set<string>> {
  const admin = createAdminClient();
  if (!admin) return new Set();

  const seen = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("media_library")
      .select("external_id")
      .eq("source", source)
      .not("external_id", "is", null)
      .range(from, from + pageSize - 1);
    if (error) {
      console.error("loadSeenExternalIds", error);
      break;
    }
    if (!data?.length) break;
    for (const row of data) {
      if (row.external_id) seen.add(row.external_id as string);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return seen;
}

/** Insert into intake pool — never goes live until curated into a daily pack. */
export async function insertArtifact(opts: {
  mediaType: MediaType;
  title: string;
  mediaUrl: string;
  thumbUrl?: string | null;
  isAi: boolean;
  /** Ingest provider key — required for dedupe with externalId. */
  source: string;
  /** Stable id within source. Duplicate → returns null (skipped). */
  externalId: string;
  /** Internal source label (not shown as player receipt URL). */
  proofUrl?: string | null;
  educationalNote: string;
  textContent?: string | null;
  /** @deprecated ignored — intake has no play date */
  playDate?: string;
  /** @deprecated ignored */
  sortOrder?: number;
}): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client unavailable");

  const provenance =
    opts.proofUrl ||
    opts.educationalNote.slice(0, 160) ||
    opts.title;

  const { data, error } = await admin
    .from("media_library")
    .insert({
      media_type: opts.mediaType,
      title: opts.title,
      media_url: opts.mediaUrl,
      thumb_url: opts.thumbUrl ?? null,
      text_content: opts.textContent ?? null,
      is_ai: opts.isAi,
      provenance,
      source: opts.source,
      external_id: opts.externalId,
      status: "intake",
      analysis_bullets: [],
    })
    .select("id")
    .single();

  if (error) {
    // unique (source, external_id)
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }
  if (!data) throw new Error("insert failed");
  return data.id as string;
}

/** @deprecated no-op helper kept so older ingest files compile until cleaned */
export async function nextSortOrder(_playDate: string): Promise<number> {
  return 1;
}

export async function fetchBinary(
  url: string,
  extraHeaders?: Record<string, string>,
): Promise<{
  bytes: Buffer;
  contentType: string;
}> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "the-turing-wheel/0.1",
      ...extraHeaders,
    },
  });
  if (!res.ok) throw new Error(`fetch ${res.status} ${url}`);
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const bytes = Buffer.from(await res.arrayBuffer());
  return { bytes, contentType };
}

export function storagePathFromPublicUrl(url: string): string | null {
  const marker = "/storage/v1/object/public/artifacts/";
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}
