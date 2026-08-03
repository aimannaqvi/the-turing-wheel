import type { MediaType } from "@/lib/types";

export const PLAYABLE_CATEGORIES = ["image", "video", "audio"] as const;

export type PlayableCategory = (typeof PLAYABLE_CATEGORIES)[number];

/** Tabs shown in the game chrome (media + terms reel). */
export const GAME_TABS = [...PLAYABLE_CATEGORIES, "terms"] as const;

export type GameTab = (typeof GAME_TABS)[number];

export function isPlayableCategory(t: MediaType): t is PlayableCategory {
  return (PLAYABLE_CATEGORIES as readonly string[]).includes(t);
}

export function isMediaTab(t: GameTab): t is PlayableCategory {
  return (PLAYABLE_CATEGORIES as readonly string[]).includes(t);
}

export function isGameTab(t: string): t is GameTab {
  return (GAME_TABS as readonly string[]).includes(t);
}

export const CATEGORY_META: Record<GameTab, { label: string }> = {
  image: { label: "image" },
  video: { label: "video" },
  audio: { label: "audio" },
  terms: { label: "terms" },
};
