import type { MediaType } from "@/lib/types";

export const PLAYABLE_CATEGORIES = ["image", "video", "audio"] as const;

export type PlayableCategory = (typeof PLAYABLE_CATEGORIES)[number];

export function isPlayableCategory(t: MediaType): t is PlayableCategory {
  return (PLAYABLE_CATEGORIES as readonly string[]).includes(t);
}

export const CATEGORY_META: Record<PlayableCategory, { label: string }> = {
  image: { label: "Image" },
  video: { label: "Video" },
  audio: { label: "Audio" },
};
