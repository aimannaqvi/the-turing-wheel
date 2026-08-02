"use client";

import { motion } from "framer-motion";

type Props = {
  onGuess: (guessedAi: boolean) => void;
  disabled?: boolean;
};

export function GuessButtons({ onGuess, disabled }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4 }}
      className="mx-auto mt-10 flex w-full max-w-md gap-4"
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onGuess(false)}
        className="flex-1 border border-[var(--ink)] bg-transparent px-4 py-5 font-serif text-2xl tracking-wide transition hover:bg-[var(--accent)] disabled:opacity-40"
      >
        Real
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onGuess(true)}
        className="flex-1 border border-[var(--ink)] bg-[var(--ink)] px-4 py-5 font-serif text-2xl tracking-wide text-[var(--paper)] transition hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-40"
      >
        AI
      </button>
    </motion.div>
  );
}
