"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";

const BLURBS = [
  "no matter how hard we try it feels like we're in a losing battle against ai.",
  "ai literacy is at an all-time low, but generative capabilities keep skyrocketing.",
  "the reality is, more and more content online will be generated using ai. yet, none of us have received any real training on how to spot it.",
  "come back to the turing wheel every day to get some daily practice on getting familiar with spotting real artifacts from fake ones.",
  "together we'll build an ai literate community, spotting one fake image, video or audio sample at a time.",
];

const ease = [0.22, 1, 0.36, 1] as const;

const fade: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 + i * 0.1, duration: 0.55, ease },
  }),
};

function CreatorLink() {
  return (
    <a
      href="https://instagram.com/nuancedaiman"
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-3 align-middle transition"
    >
      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-1 ring-[var(--ink)]/10 transition group-hover:ring-[var(--ink)]/25">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/nuancedaiman.png"
          alt=""
          className="h-full w-full scale-[1.08] object-cover"
        />
      </span>
      <span className="font-serif text-[1.35rem] leading-none tracking-tight underline decoration-[var(--ink)]/20 underline-offset-4 transition group-hover:decoration-[var(--ink)]/60 sm:text-[1.5rem]">
        @nuancedaiman
      </span>
    </a>
  );
}

export function AboutPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pb-20 pt-10 sm:px-10">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="pr-12"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-sans text-sm lowercase text-[var(--muted)] transition hover:text-[var(--ink)]"
        >
          <span aria-hidden>←</span> back to the game
        </Link>
      </motion.div>

      <article className="mt-12">
        <header>
          <motion.p
            custom={0}
            variants={fade}
            initial="hidden"
            animate="show"
            className="inline-block bg-[var(--accent)] px-2 py-0.5 font-sans text-[11px] lowercase tracking-[0.14em] text-[var(--on-accent)]"
          >
            the turing wheel
          </motion.p>
          <motion.h1
            custom={1}
            variants={fade}
            initial="hidden"
            animate="show"
            className="mt-5 font-serif text-4xl lowercase tracking-tight sm:text-5xl"
          >
            about
          </motion.h1>
        </header>

        <div className="mt-12 space-y-8">
          {BLURBS.map((line, i) => (
            <motion.p
              key={line}
              custom={i + 2}
              variants={fade}
              initial="hidden"
              animate="show"
              className="font-serif text-2xl lowercase leading-snug tracking-tight text-[var(--ink)] sm:text-[1.65rem] sm:leading-[1.4]"
            >
              {line}
            </motion.p>
          ))}

          <motion.p
            custom={BLURBS.length + 2}
            variants={fade}
            initial="hidden"
            animate="show"
            className="font-serif text-2xl lowercase leading-snug tracking-tight text-[var(--ink)] sm:text-[1.65rem] sm:leading-[1.4]"
          >
            built with ❤️ by{" "}
            <CreatorLink />
          </motion.p>
        </div>
      </article>
    </main>
  );
}
