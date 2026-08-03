/** AI scam / dark-pattern terms for the terms reel. */
export const SCAM_TERMS = [
  "marketplace thirst traps",
  "voice-cloned emergencies",
  "deepfake candidates",
  "stolen author names",
  "ai foraging guides",
  "ghost travel writers",
  "surveillance pricing",
  "delta's pain point",
  "instacart's algorithm",
  "ecogpt's tree math",
  "ai washing",
  "fake autonomy",
  "instant storefronts",
  "deepfake endorsements",
  "phantom rentals",
  "retouched listings",
  "forged pay stubs",
  "pig butchering",
  "rent-setting cartels",
  "retention bots",
  "personalized pricing",
] as const;

/** Temporary: every terms spin lands here. */
export const TERMS_FORCE_LAND = "personalized pricing";

export type ScamTerm = (typeof SCAM_TERMS)[number];

export function scamTermId(term: string): string {
  return `term:${term}`;
}

export function scamTermPreviews() {
  return SCAM_TERMS.map((term) => ({
    id: scamTermId(term),
    title: term,
    mediaType: "text" as const,
    thumbUrl: null,
    mediaUrl: null,
  }));
}
