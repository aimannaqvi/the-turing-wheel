import type { DayProgress, LocalStats } from "@/lib/types";
import { playDateCT } from "@/lib/date";

const STATS_KEY = "ttw:stats";
const PROGRESS_KEY = "ttw:progress";
const ANON_KEY = "ttw:anon";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function getAnonymousId(): string {
  if (typeof window === "undefined") return "ssr";
  const existing = localStorage.getItem(ANON_KEY);
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `anon-${Date.now()}`;
  localStorage.setItem(ANON_KEY, id);
  return id;
}

export function getLocalStats(): LocalStats {
  return read<LocalStats>(STATS_KEY, {
    currentStreak: 0,
    maxStreak: 0,
    totalPlayed: 0,
    totalCorrect: 0,
    lastPlayedDate: null,
  });
}

export function getDayProgress(playDate = playDateCT()): DayProgress {
  const stored = read<DayProgress | null>(PROGRESS_KEY, null);
  if (!stored || stored.playDate !== playDate) {
    return {
      playDate,
      guessedIds: [],
      correctCount: 0,
      complete: false,
    };
  }
  return stored;
}

export function recordGuessLocal(opts: {
  playDate: string;
  artifactId: string;
  correct: boolean;
  packSize: number;
}): { progress: DayProgress; stats: LocalStats } {
  const progress = getDayProgress(opts.playDate);
  if (progress.guessedIds.includes(opts.artifactId)) {
    return { progress, stats: getLocalStats() };
  }

  progress.guessedIds.push(opts.artifactId);
  if (opts.correct) progress.correctCount += 1;
  progress.complete = progress.guessedIds.length >= opts.packSize;
  write(PROGRESS_KEY, progress);

  const stats = getLocalStats();
  stats.totalPlayed += 1;
  if (opts.correct) stats.totalCorrect += 1;

  if (progress.complete) {
    const yesterday = shiftDate(opts.playDate, -1);
    if (stats.lastPlayedDate === opts.playDate) {
      // already counted streak today
    } else if (stats.lastPlayedDate === yesterday) {
      stats.currentStreak += 1;
    } else {
      stats.currentStreak = 1;
    }
    stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
    stats.lastPlayedDate = opts.playDate;
  }

  write(STATS_KEY, stats);
  return { progress, stats };
}

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
