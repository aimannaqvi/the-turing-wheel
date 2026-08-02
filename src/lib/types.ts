export type MediaType = "image" | "video" | "audio" | "text";

export type LibraryStatus = "intake" | "kept" | "discarded";

export type Artifact = {
  id: string;
  playDate: string;
  sortOrder: number;
  mediaType: MediaType;
  mediaUrl: string | null;
  textContent: string | null;
  title: string | null;
  thumbUrl: string | null;
  /** Only present after a guess is submitted (never in the initial pack payload). */
  isAi?: boolean;
  proofUrl?: string | null;
  educationalNote?: string;
  analysisBullets?: string[];
};

export type ArtifactReveal = Artifact & {
  isAi: boolean;
  educationalNote: string;
  proofUrl: string | null;
  analysisBullets: string[];
};

export type LibraryItem = {
  id: string;
  mediaType: MediaType;
  mediaUrl: string | null;
  thumbUrl: string | null;
  title: string | null;
  textContent: string | null;
  isAi: boolean;
  provenance: string | null;
  status: LibraryStatus;
  timesUsed: number;
  lastUsedOn: string | null;
  analysisBullets: string[];
  createdAt: string;
};

export type PackItem = {
  packItemId: string;
  libraryId: string;
  playDate: string;
  mediaType: MediaType;
  sortOrder: number;
  item: LibraryItem;
};

export type ReelPreview = {
  id: string;
  title: string;
  mediaType: MediaType;
  thumbUrl: string | null;
  mediaUrl: string | null;
};

export type GamePhase =
  | "idle"
  | "spinning"
  | "artifact"
  | "revealed"
  | "complete";

export type LocalStats = {
  currentStreak: number;
  maxStreak: number;
  totalPlayed: number;
  totalCorrect: number;
  lastPlayedDate: string | null;
};

export type DayProgress = {
  playDate: string;
  guessedIds: string[];
  correctCount: number;
  complete: boolean;
};
