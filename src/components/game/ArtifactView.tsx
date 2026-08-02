"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { Artifact } from "@/lib/types";

type Props = {
  artifact: Artifact;
  /** Tiny attribution under media (reveal only) */
  sourceLabel?: string | null;
};

export function ArtifactView({ artifact, sourceLabel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = false;
    el.defaultMuted = false;
    el.volume = 1;
    const unmute = () => {
      el.muted = false;
      el.volume = 1;
    };
    el.addEventListener("play", unmute);
    return () => el.removeEventListener("play", unmute);
  }, [artifact.mediaUrl]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto w-full max-w-2xl"
    >
      {artifact.mediaType === "image" && artifact.mediaUrl ? (
        <div className="overflow-hidden border border-[var(--ink)]/10 bg-[var(--ink)]/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artifact.mediaUrl}
            alt="Daily artifact — judge without context"
            className="max-h-[52vh] w-full object-contain"
          />
        </div>
      ) : null}

      {artifact.mediaType === "video" && artifact.mediaUrl ? (
        <div className="overflow-hidden border border-[var(--ink)]/10 bg-black">
          <video
            ref={videoRef}
            key={artifact.mediaUrl}
            src={artifact.mediaUrl}
            poster={artifact.thumbUrl ?? undefined}
            controls
            playsInline
            preload="auto"
            muted={false}
            className="max-h-[52vh] w-full"
          >
            <a href={artifact.mediaUrl}>Download video</a>
          </video>
        </div>
      ) : null}

      {artifact.mediaType === "audio" && artifact.mediaUrl ? (
        <div className="border border-[var(--ink)]/10 bg-[var(--ink)]/5 px-6 py-10">
          <div className="mb-6 flex h-16 items-end justify-center gap-1">
            {Array.from({ length: 32 }).map((_, i) => (
              <div
                key={i}
                className="w-1.5 bg-[var(--accent)]"
                style={{ height: `${20 + ((i * 37) % 70)}%` }}
              />
            ))}
          </div>
          <audio
            key={artifact.mediaUrl}
            src={artifact.mediaUrl}
            controls
            preload="metadata"
            className="w-full"
          />
        </div>
      ) : null}

      {!artifact.mediaUrl ? (
        <div className="border border-dashed border-[var(--ink)]/25 px-6 py-16 text-center font-sans text-sm text-[var(--muted)]">
          Media missing for this artifact.
        </div>
      ) : null}

      {sourceLabel ? (
        <p className="mt-2 text-center font-sans text-[10px] leading-4 tracking-wide text-[var(--muted)]/80">
          {sourceLabel}
        </p>
      ) : null}
    </motion.div>
  );
}
