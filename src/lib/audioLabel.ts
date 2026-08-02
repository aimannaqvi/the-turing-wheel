/** Short scene labels — never voice names / dataset IDs. */
export const SCENE_POOL = [
  "Customer support",
  "Rant to friend",
  "Telling a story",
  "Voicemail",
  "Casual check-in",
  "Podcast clip",
  "Leaving a message",
  "Catching up",
  "Phone call",
  "Reading aloud",
] as const;

export function pickGenericScene(seed: string): string {
  return SCENE_POOL[hash(seed) % SCENE_POOL.length]!;
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Collapse any audio title down to an extremely generic scene label.
 * Strips voice names ("Customer support · George…") and dataset junk.
 */
export function genericAudioLabel(
  title: string | null | undefined,
  id?: string,
): string {
  const raw = (title ?? "").trim();
  const head = raw.split(/\s*[·•—|]\s*/)[0]?.trim() || raw;

  const lower = head.toLowerCase();

  // Dataset / numbered dumps → pick a stable generic scene from id
  if (
    /common voice|open speech|openspeech|mozilla/i.test(lower) ||
    /^(cv|osr)\b/i.test(head) ||
    /\b\d{2,}\b/.test(head)
  ) {
    return SCENE_POOL[hash(id || head) % SCENE_POOL.length]!;
  }

  if (/customer|support/.test(lower)) return "Customer support";
  if (/rant/.test(lower)) return "Rant to friend";
  if (/voicemail/.test(lower)) return "Voicemail";
  if (/podcast/.test(lower)) return "Podcast clip";
  if (/casual|check-?in/.test(lower)) return "Casual check-in";
  if (/story|telling/.test(lower)) return "Telling a story";
  if (/leaving a message|leave a message/.test(lower)) return "Leaving a message";
  if (/catching up/.test(lower)) return "Catching up";
  if (/phone call/.test(lower)) return "Phone call";
  if (/reading aloud/.test(lower)) return "Reading aloud";

  // Already a short clean scene label
  if (head.length > 0 && head.length <= 28) return head;

  return SCENE_POOL[hash(id || head || "audio") % SCENE_POOL.length]!;
}

export type AudioSceneKind =
  | "support"
  | "rant"
  | "voicemail"
  | "podcast"
  | "checkin"
  | "story"
  | "message"
  | "call"
  | "reading"
  | "other";

export function audioSceneKind(label: string): AudioSceneKind {
  const l = label.toLowerCase();
  if (l.includes("support")) return "support";
  if (l.includes("rant")) return "rant";
  if (l.includes("voicemail")) return "voicemail";
  if (l.includes("podcast")) return "podcast";
  if (l.includes("check-in") || l.includes("catching")) return "checkin";
  if (l.includes("story")) return "story";
  if (l.includes("message")) return "message";
  if (l.includes("phone") || l.includes("call")) return "call";
  if (l.includes("reading") || l.includes("aloud")) return "reading";
  return "other";
}
