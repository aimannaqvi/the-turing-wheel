"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BackButton } from "@/components/game/BackButton";
import { CategoryTabs } from "@/components/game/CategoryTabs";
import { SpinReel } from "@/components/game/SpinReel";
import { ArtifactView } from "@/components/game/ArtifactView";
import { GuessButtons } from "@/components/game/GuessButtons";
import { RevealCard } from "@/components/game/RevealCard";
import {
  CATEGORY_META,
  PLAYABLE_CATEGORIES,
  isPlayableCategory,
  type PlayableCategory,
} from "@/lib/categories";
import { formatPlayDateLabel } from "@/lib/date";
import { playCorrect, playIncorrect } from "@/lib/sounds";
import { formatSourceLabel } from "@/lib/sourceLabel";
import {
  getAnonymousId,
  getDayProgress,
  recordGuessLocal,
} from "@/lib/storage";
import type {
  Artifact,
  ArtifactReveal,
  DayProgress,
  GamePhase,
  ReelPreview,
} from "@/lib/types";

type PackResponse = {
  playDate: string;
  artifacts: Artifact[];
  source: "supabase" | "fixtures";
};

export function GameShell() {
  const router = useRouter();
  const [pack, setPack] = useState<PackResponse | null>(null);
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [category, setCategory] = useState<PlayableCategory>("image");
  const [current, setCurrent] = useState<Artifact | null>(null);
  const [reveal, setReveal] = useState<ArtifactReveal | null>(null);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<DayProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guessError, setGuessError] = useState<string | null>(null);
  /** Random pick for the current spin (not pack order) */
  const [spinTarget, setSpinTarget] = useState<Artifact | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/daily");
        if (!res.ok) throw new Error("Failed to load today’s pack");
        const data = (await res.json()) as PackResponse;
        if (cancelled) return;
        setPack(data);
        const day = getDayProgress(data.playDate);
        const playableIds = new Set(
          data.artifacts
            .filter((a) => isPlayableCategory(a.mediaType))
            .map((a) => a.id),
        );
        const synced: DayProgress = {
          ...day,
          guessedIds: day.guessedIds.filter((id) => playableIds.has(id)),
          complete:
            playableIds.size > 0 &&
            [...playableIds].every((id) => day.guessedIds.includes(id)),
        };
        setProgress(synced);
        if (synced.complete) setPhase("complete");
        else {
          const firstWithLeft =
            PLAYABLE_CATEGORIES.find((c) =>
              data.artifacts.some(
                (a) =>
                  a.mediaType === c && !synced.guessedIds.includes(a.id),
              ),
            ) ?? "image";
          setCategory(firstWithLeft);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const playable = useMemo(() => {
    if (!pack) return [];
    return pack.artifacts.filter((a) => isPlayableCategory(a.mediaType));
  }, [pack]);

  const remainingByCategory = useMemo(() => {
    const base = { image: 0, video: 0, audio: 0 } as Record<
      PlayableCategory,
      number
    >;
    if (!progress) return base;
    for (const a of playable) {
      if (!progress.guessedIds.includes(a.id) && isPlayableCategory(a.mediaType)) {
        base[a.mediaType] += 1;
      }
    }
    return base;
  }, [playable, progress]);

  const remainingInCategory = useMemo(() => {
    if (!progress) return [];
    return playable.filter(
      (a) => a.mediaType === category && !progress.guessedIds.includes(a.id),
    );
  }, [playable, progress, category]);

  const nextArtifact = spinTarget ?? remainingInCategory[0] ?? null;
  const canSpin = remainingInCategory.length > 0 && phase === "idle";

  const reelPreviews: ReelPreview[] = useMemo(() => {
    return playable
      .filter((a) => a.mediaType === category)
      .map((a) => ({
        id: a.id,
        title: a.title ?? `${a.mediaType} file`,
        mediaType: a.mediaType,
        thumbUrl: a.thumbUrl,
        mediaUrl: a.mediaUrl,
      }));
  }, [playable, category]);

  const onSpinRequest = useCallback(() => {
    if (phase !== "idle" || remainingInCategory.length === 0) return;
    const pick =
      remainingInCategory[
        Math.floor(Math.random() * remainingInCategory.length)
      ]!;
    setSpinTarget(pick);
    setReveal(null);
    setCurrent(null);
    setPhase("spinning");
  }, [phase, remainingInCategory]);

  const onSpinEnd = useCallback(() => {
    if (!spinTarget) return;
    setCurrent(spinTarget);
    setPhase("artifact");
  }, [spinTarget]);

  const onGuess = useCallback(
    async (guessedAi: boolean) => {
      if (!current || !pack || submitting) return;
      setSubmitting(true);
      setGuessError(null);
      try {
        const res = await fetch("/api/guess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            artifactId: current.id,
            guessedAi,
            anonymousId: getAnonymousId(),
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error || "Guess failed");
        }
        const data = (await res.json()) as {
          reveal: ArtifactReveal;
          isCorrect: boolean;
        };

        if (data.isCorrect) void playCorrect();
        else void playIncorrect();

        setReveal(data.reveal);
        setWasCorrect(data.isCorrect);
        setPhase("revealed");

        const local = recordGuessLocal({
          playDate: pack.playDate,
          artifactId: current.id,
          correct: data.isCorrect,
          packSize: playable.length,
        });
        setProgress(local.progress);
      } catch (e) {
        setGuessError(e instanceof Error ? e.message : "Guess failed");
      } finally {
        setSubmitting(false);
      }
    },
    [current, pack, submitting, playable.length],
  );

  const onContinue = useCallback(() => {
    if (!progress || !pack) return;
    const done = playable.every((a) => progress.guessedIds.includes(a.id));
    if (done) {
      setPhase("complete");
      setCurrent(null);
      setReveal(null);
      setSpinTarget(null);
      setGuessError(null);
      return;
    }
    if (remainingByCategory[category] <= 0) {
      const next =
        PLAYABLE_CATEGORIES.find((c) => remainingByCategory[c] > 0) ?? category;
      setCategory(next);
    }
    setReveal(null);
    setCurrent(null);
    setSpinTarget(null);
    setGuessError(null);
    setPhase("idle");
  }, [pack, progress, playable, remainingByCategory, category]);

  const onBack = useCallback(() => {
    if (phase === "spinning") {
      setPhase("idle");
      setCurrent(null);
      setReveal(null);
      setSpinTarget(null);
      setGuessError(null);
      return;
    }
    if (phase === "artifact") {
      // Abandon unguessed artifact — still available to spin again
      setCurrent(null);
      setReveal(null);
      setSpinTarget(null);
      setGuessError(null);
      setPhase("idle");
      return;
    }
    if (phase === "revealed") {
      onContinue();
      return;
    }
    if (phase === "complete") {
      router.push("/");
      return;
    }
  }, [phase, onContinue, router]);

  const onTabChange = useCallback(
    (c: PlayableCategory) => {
      if (phase === "spinning") return;
      // Allow leaving artifact/reveal via tab switch (= implicit back)
      if (phase === "artifact" || phase === "revealed") {
        if (phase === "revealed") {
          // Guess already counted — treat as continue into chosen tab
          setReveal(null);
          setCurrent(null);
          setSpinTarget(null);
          setGuessError(null);
          setCategory(c);
          setPhase("idle");
          return;
        }
        setCurrent(null);
        setSpinTarget(null);
        setGuessError(null);
        setCategory(c);
        setPhase("idle");
        return;
      }
      setSpinTarget(null);
      setCategory(c);
      setPhase("idle");
    },
    [phase],
  );

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24">
        <BackButton onClick={() => router.push("/")} label="home" />
        <p className="mt-8 text-center font-serif text-2xl lowercase">
          something snagged
        </p>
        <p className="mt-3 text-center font-sans text-sm lowercase text-[var(--muted)]">
          {error}
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <button
            type="button"
            onClick={() => {
              setError(null);
              window.location.reload();
            }}
            className="bg-[var(--accent)] px-5 py-2.5 font-serif text-lg lowercase text-[var(--on-accent)]"
          >
            retry
          </button>
        </div>
      </div>
    );
  }

  if (!pack || !progress) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center font-sans text-sm text-[var(--muted)]">
        loading today’s wheel…
      </div>
    );
  }

  const dayDone = playable.length > 0 && playable.every((a) =>
    progress.guessedIds.includes(a.id),
  );
  const categoryDoneAfterReveal =
    remainingByCategory[category] <= 1 && phase === "revealed";
  const tabsLocked = phase === "spinning";
  const showHeaderBack =
    phase === "spinning" ||
    phase === "artifact" ||
    phase === "revealed" ||
    phase === "complete";
  const backLabel =
    phase === "complete"
      ? "home"
      : phase === "revealed"
        ? "back to wheel"
        : "back";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-16 pt-10 sm:px-10">
      {showHeaderBack ? (
        <div className="mb-4">
          <BackButton onClick={onBack} label={backLabel} />
        </div>
      ) : null}
      <header className="mb-6 flex items-end justify-between gap-4 pr-12">
        <div>
          <Link
            href="/"
            className="inline-block bg-[var(--accent)] px-2 py-0.5 font-sans text-[11px] lowercase tracking-[0.14em] text-[var(--on-accent)] transition hover:brightness-95"
          >
            the turing wheel
          </Link>
          <h1 className="mt-3 font-serif text-3xl lowercase tracking-tight sm:text-4xl">
            {formatPlayDateLabel(pack.playDate)}
          </h1>
        </div>
        <div className="text-right font-sans text-xs lowercase leading-5 text-[var(--muted)]">
          {pack.source === "fixtures" ? (
            <div className="opacity-60">local fixtures</div>
          ) : null}
          {pack.artifacts.length === 0 ? (
            <div>no pack for today yet — check back soon</div>
          ) : null}
          <div className="mt-2 flex flex-col items-end gap-1">
            <Link
              href="/about"
              className="underline underline-offset-2 opacity-70 hover:opacity-100"
            >
              about
            </Link>
            {process.env.NODE_ENV !== "production" ? (
              <Link
                href="/admin"
                className="underline underline-offset-2 opacity-70 hover:opacity-100"
              >
                admin
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {phase !== "complete" ? (
        <CategoryTabs
          active={category}
          onChange={onTabChange}
          locked={tabsLocked}
        />
      ) : null}

      <AnimatePresence mode="wait">
        {phase === "complete" || (dayDone && phase === "idle") ? (
          <motion.section
            key="complete"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-1 flex-col items-start justify-center py-16"
          >
            <p className="font-serif text-4xl lowercase tracking-tight sm:text-5xl">
              day complete
            </p>
            <p className="mt-4 max-w-md font-sans text-base lowercase leading-7 text-[var(--ink)]/80">
              come back after midnight ct for a new pack.
            </p>
          </motion.section>
        ) : (
          <motion.section
            key="play"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-1 flex-col pt-8"
          >
            {(phase === "idle" || phase === "spinning") &&
            (canSpin || phase === "spinning") &&
            (spinTarget || remainingInCategory[0]) ? (
              <div className="flex flex-1 flex-col items-center py-4">
                <SpinReel
                  key={category}
                  category={category}
                  previews={reelPreviews}
                  targetId={
                    (spinTarget ?? remainingInCategory[0])!.id
                  }
                  spinning={phase === "spinning"}
                  onSpinEnd={onSpinEnd}
                  onSpinRequest={onSpinRequest}
                  disabled={!canSpin && phase !== "spinning"}
                />
              </div>
            ) : null}

            {(phase === "idle" || phase === "spinning") && !nextArtifact ? (
              <div className="py-20 text-center">
                <p className="font-serif text-2xl lowercase">
                  {CATEGORY_META[category].label} clear
                </p>
                <p className="mt-3 font-sans text-sm lowercase text-[var(--muted)]">
                  switch tabs for more, or come back tomorrow.
                </p>
                <div className="mt-6 flex justify-center">
                  <BackButton
                    onClick={() => {
                      const next =
                        PLAYABLE_CATEGORIES.find(
                          (c) => c !== category && remainingByCategory[c] > 0,
                        ) ?? null;
                      if (next) setCategory(next);
                      else router.push("/");
                    }}
                    label={
                      PLAYABLE_CATEGORIES.some(
                        (c) => c !== category && remainingByCategory[c] > 0,
                      )
                        ? "back to another category"
                        : "home"
                    }
                  />
                </div>
              </div>
            ) : null}

            {(phase === "artifact" || phase === "revealed") && current ? (
              <div className="py-2">
                <div className="mb-4">
                  <BackButton onClick={onBack} label="back to wheel" />
                </div>
                <ArtifactView
                  artifact={current}
                  sourceLabel={
                    phase === "revealed" && reveal
                      ? formatSourceLabel(reveal.proofUrl, reveal.isAi)
                      : null
                  }
                />
                {phase === "artifact" ? (
                  <>
                    <GuessButtons onGuess={onGuess} disabled={submitting} />
                    {guessError ? (
                      <p className="mt-4 text-center font-sans text-sm text-[var(--rose)]">
                        {guessError}
                      </p>
                    ) : null}
                  </>
                ) : null}
                {phase === "revealed" && reveal ? (
                  <RevealCard
                    reveal={reveal}
                    isCorrect={wasCorrect}
                    onContinue={onContinue}
                    isLast={
                      dayDone ||
                      (categoryDoneAfterReveal &&
                        PLAYABLE_CATEGORIES.every(
                          (c) => c === category || remainingByCategory[c] === 0,
                        ))
                    }
                  />
                ) : null}
              </div>
            ) : null}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
