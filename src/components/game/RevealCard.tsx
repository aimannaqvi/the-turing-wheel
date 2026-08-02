"use client";

import { motion } from "framer-motion";
import type { ArtifactReveal } from "@/lib/types";

type Props = {
  reveal: ArtifactReveal;
  isCorrect: boolean;
  onContinue: () => void;
  isLast: boolean;
};

export function RevealCard({ reveal, isCorrect, onContinue, isLast }: Props) {
  const bullets =
    reveal.analysisBullets?.length > 0
      ? reveal.analysisBullets
      : reveal.educationalNote
        ? reveal.educationalNote.split("\n").filter(Boolean)
        : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto mt-10 w-full max-w-2xl border-t border-[var(--ink)]/15 pt-8"
    >
      <p
        className="font-serif text-3xl tracking-tight"
        style={{
          color: isCorrect ? "var(--sage)" : "var(--rose)",
        }}
      >
        {isCorrect ? "Correct" : "Not quite"}
        <span className="text-[var(--ink)]">
          {" "}
          — it was {reveal.isAi ? "AI" : "Real"}
        </span>
      </p>

      <div className="mt-8">
        <p className="font-sans text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          How do we know?
        </p>
        <ul className="mt-3 space-y-2">
          {bullets.map((b, i) => (
            <li
              key={i}
              className="flex gap-3 font-sans text-[15px] leading-6 text-[var(--ink)]/85"
            >
              <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-[var(--accent)]" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mt-10 bg-[var(--accent)] px-6 py-3 font-serif text-lg tracking-wide text-[var(--ink)] transition hover:brightness-95"
      >
        {isLast ? "Done for today" : "Next spin"}
      </button>
    </motion.div>
  );
}
