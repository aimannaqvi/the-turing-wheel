/** Short scene labels — never voice names / dataset IDs. */
export const SCENE_POOL = [
  "customer support",
  "rant to friend",
  "telling a story",
  "voicemail",
  "casual check-in",
  "podcast clip",
  "leaving a message",
  "catching up",
  "phone call",
  "reading aloud",
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

  if (/customer|support/.test(lower)) return "customer support";
  if (/rant/.test(lower)) return "rant to friend";
  if (/voicemail/.test(lower)) return "voicemail";
  if (/podcast/.test(lower)) return "podcast clip";
  if (/casual|check-?in/.test(lower)) return "casual check-in";
  if (/story|telling/.test(lower)) return "telling a story";
  if (/leaving a message|leave a message/.test(lower)) return "leaving a message";
  if (/catching up/.test(lower)) return "catching up";
  if (/phone call/.test(lower)) return "phone call";
  if (/reading aloud/.test(lower)) return "reading aloud";

  // Already a short clean scene label
  if (head.length > 0 && head.length <= 28) return head.toLowerCase();

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
