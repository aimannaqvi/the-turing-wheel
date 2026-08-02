import { playDateCT } from "@/lib/date";
import {
  getFixtureReveal,
  getPublicFixturePack,
  getFixturePack,
} from "@/lib/fixtures";
import {
  createAdminClient,
  createClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import type {
  Artifact,
  ArtifactReveal,
  LibraryItem,
  LibraryStatus,
  MediaType,
  PackItem,
} from "@/lib/types";

type PublicRow = {
  id: string;
  play_date: string;
  sort_order: number;
  media_type: MediaType;
  media_url: string | null;
  text_content: string | null;
  title: string | null;
  thumb_url: string | null;
};

type RevealRow = PublicRow & {
  is_ai: boolean;
  proof_url: string | null;
  educational_note: string;
  analysis_bullets?: string[] | null;
  is_correct: boolean;
};

type LibraryRow = {
  id: string;
  media_type: MediaType;
  media_url: string | null;
  thumb_url: string | null;
  title: string | null;
  text_content: string | null;
  is_ai: boolean;
  provenance: string | null;
  status: LibraryStatus;
  times_used: number;
  last_used_on: string | null;
  analysis_bullets: string[] | null;
  created_at: string;
};

function toPublic(row: PublicRow): Artifact {
  return {
    id: row.id,
    playDate: row.play_date,
    sortOrder: row.sort_order,
    mediaType: row.media_type,
    mediaUrl: row.media_url,
    textContent: row.text_content,
    title: row.title,
    thumbUrl: row.thumb_url,
  };
}

function toReveal(row: RevealRow): ArtifactReveal {
  const bullets =
    row.analysis_bullets && row.analysis_bullets.length > 0
      ? row.analysis_bullets
      : row.educational_note
        ? row.educational_note.split("\n").filter(Boolean)
        : [];
  return {
    ...toPublic(row),
    isAi: row.is_ai,
    proofUrl: row.proof_url,
    educationalNote: row.educational_note,
    analysisBullets: bullets,
  };
}

export function toLibraryItem(row: LibraryRow): LibraryItem {
  return {
    id: row.id,
    mediaType: row.media_type,
    mediaUrl: row.media_url,
    thumbUrl: row.thumb_url,
    title: row.title,
    textContent: row.text_content,
    isAi: row.is_ai,
    provenance: row.provenance,
    status: row.status,
    timesUsed: row.times_used,
    lastUsedOn: row.last_used_on,
    analysisBullets: row.analysis_bullets ?? [],
    createdAt: row.created_at,
  };
}

export async function getTodaysPack(): Promise<{
  playDate: string;
  artifacts: Artifact[];
  source: "supabase" | "fixtures";
}> {
  const playDate = playDateCT();

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("daily_artifacts_public")
        .select(
          "id, play_date, sort_order, media_type, media_url, text_content, title, thumb_url",
        )
        .order("sort_order", { ascending: true });

      if (!error && data && data.length > 0) {
        return {
          playDate,
          artifacts: (data as PublicRow[]).map(toPublic),
          source: "supabase",
        };
      }

      // Empty curated pack is valid — don't fall back to fixtures if Supabase is up
      if (!error) {
        return { playDate, artifacts: [], source: "supabase" };
      }
    }
  }

  return {
    playDate,
    artifacts: getPublicFixturePack(playDate),
    source: "fixtures",
  };
}

export async function revealArtifact(
  artifactId: string,
  guessedAi: boolean,
  anonymousId?: string | null,
): Promise<{
  reveal: ArtifactReveal;
  isCorrect: boolean;
  source: "supabase" | "fixtures";
} | null> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    if (supabase) {
      const { data, error } = await supabase.rpc("submit_guess", {
        p_artifact_id: artifactId,
        p_guessed_ai: guessedAi,
        p_anonymous_id: anonymousId ?? null,
      });

      if (!error && data && Array.isArray(data) && data.length > 0) {
        const row = data[0] as RevealRow;
        return {
          reveal: toReveal(row),
          isCorrect: row.is_correct,
          source: "supabase",
        };
      }

      if (error && !artifactId.startsWith("fix-")) {
        console.error("submit_guess failed", error);
      }
    }
  }

  const reveal = getFixtureReveal(artifactId);
  if (!reveal) return null;
  return {
    reveal: {
      ...reveal,
      analysisBullets: reveal.educationalNote
        ? reveal.educationalNote.split("\n").filter(Boolean)
        : [],
    },
    isCorrect: guessedAi === reveal.isAi,
    source: "fixtures",
  };
}

export async function listLibrary(opts?: {
  status?: LibraryStatus;
  mediaType?: MediaType;
}): Promise<LibraryItem[]> {
  const admin = createAdminClient();
  if (!admin) return [];

  let q = admin
    .from("media_library")
    .select(
      "id, media_type, media_url, thumb_url, title, text_content, is_ai, provenance, status, times_used, last_used_on, analysis_bullets, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.mediaType) q = q.eq("media_type", opts.mediaType);

  const { data, error } = await q;
  if (error || !data) {
    console.error("listLibrary", error);
    return [];
  }
  return (data as LibraryRow[]).map(toLibraryItem);
}

export async function getDailyPack(playDate: string): Promise<PackItem[]> {
  const admin = createAdminClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("daily_pack_items")
    .select(
      "id, play_date, media_type, library_id, sort_order, media_library(id, media_type, media_url, thumb_url, title, text_content, is_ai, provenance, status, times_used, last_used_on, analysis_bullets, created_at)",
    )
    .eq("play_date", playDate)
    .order("media_type")
    .order("sort_order", { ascending: true });

  if (error || !data) {
    console.error("getDailyPack", error);
    return [];
  }

  return data
    .map((row) => {
      const lib = row.media_library as unknown as LibraryRow | LibraryRow[] | null;
      const libRow = Array.isArray(lib) ? lib[0] : lib;
      if (!libRow) return null;
      return {
        packItemId: row.id as string,
        libraryId: row.library_id as string,
        playDate: row.play_date as string,
        mediaType: row.media_type as MediaType,
        sortOrder: row.sort_order as number,
        item: toLibraryItem(libRow),
      } satisfies PackItem;
    })
    .filter(Boolean) as PackItem[];
}

/** @deprecated — old admin inventory; use listLibrary */
export async function getAdminInventory(): Promise<{
  source: "supabase" | "fixtures";
  artifacts: ArtifactReveal[];
  staging: [];
  dates: string[];
}> {
  const kept = await listLibrary({ status: "kept" });
  const playDate = playDateCT();
  return {
    source: isSupabaseConfigured() ? "supabase" : "fixtures",
    artifacts: kept.map((k) => ({
      id: k.id,
      playDate,
      sortOrder: 0,
      mediaType: k.mediaType,
      mediaUrl: k.mediaUrl,
      textContent: k.textContent,
      title: k.title,
      thumbUrl: k.thumbUrl,
      isAi: k.isAi,
      proofUrl: null,
      educationalNote: k.analysisBullets.join("\n") || k.provenance || "",
      analysisBullets: k.analysisBullets,
    })),
    staging: [],
    dates: [playDate],
  };
}

// keep fixtures import used for fallback typing
void getFixturePack;
