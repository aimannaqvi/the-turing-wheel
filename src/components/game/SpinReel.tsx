"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "framer-motion";
import {
  audioSceneKind,
  genericAudioLabel,
  type AudioSceneKind,
} from "@/lib/audioLabel";
import { playWheelSpin, SPIN_LAND_AT, stopWheelSpin } from "@/lib/sounds";
import type { PlayableCategory } from "@/lib/categories";
import type { ReelPreview } from "@/lib/types";

/** Visual card height — denser than step so cards overlap hard */
const CARD_H = 168;
/** Distance between card anchors — smaller than CARD_H = overlap */
const STEP = 72;
const WINDOW_H = 320;
/** Extra loops = longer coast past the same cards */
const LOOPS = 6;
/** Visual land = ding onset in synthetic wheel bed. */
const SPIN_DURATION = SPIN_LAND_AT;

type Props = {
  category: PlayableCategory;
  previews: ReelPreview[];
  spinning: boolean;
  targetId: string;
  onSpinEnd: () => void;
  onSpinRequest: () => void;
  disabled?: boolean;
};

function centerY(index: number) {
  return -(index * STEP) + (WINDOW_H / 2 - CARD_H / 2);
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let s = seed || 1;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function isRasterUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (/^data:image\//i.test(url)) return true;
  // Reject video containers even if used as "thumb"
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url)) return false;
  if (/\.(png|jpe?g|gif|webp|avif|bmp)(\?|#|$)/i.test(url)) return true;
  // Storage paths without extension — allow if not clearly video
  return !/video/i.test(url);
}

function AudioGlyph({ kind, seed }: { kind: AudioSceneKind; seed: number }) {
  const accent = "var(--accent)";
  switch (kind) {
    case "support":
      return (
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="absolute h-14 w-14 rounded-full border-2 border-white/25" />
          <div className="absolute h-9 w-9 rounded-full border border-[var(--accent)]/70" />
          <div className="h-3 w-3 rounded-full bg-[var(--accent)]" />
        </div>
      );
    case "rant":
      return (
        <div className="flex h-14 items-end gap-1">
          {[0.4, 0.9, 0.55, 1, 0.7, 0.95, 0.5, 0.85].map((h, i) => (
            <div
              key={i}
              className="w-2 origin-bottom rounded-sm bg-[var(--accent)]"
              style={{
                height: `${h * 100}%`,
                transform: `skewX(${(seed % 7) - 3}deg)`,
                opacity: 0.55 + (i % 3) * 0.15,
              }}
            />
          ))}
        </div>
      );
    case "voicemail":
      return (
        <div className="relative h-14 w-10 rounded-sm border-2 border-white/30 bg-black/40">
          <div className="absolute inset-x-2 top-2 h-2 rounded-full bg-[var(--accent)]/80" />
          <div className="absolute inset-x-2 top-6 space-y-1.5">
            <div className="h-1 rounded-full bg-white/25" />
            <div className="h-1 w-2/3 rounded-full bg-white/15" />
          </div>
        </div>
      );
    case "podcast":
      return (
        <div className="relative flex h-16 w-12 flex-col items-center justify-end">
          <div className="h-8 w-6 rounded-t-full border-2 border-[var(--accent)]/80 bg-black/30" />
          <div className="h-3 w-1 bg-white/40" />
          <div className="h-1.5 w-5 rounded-full bg-white/35" />
        </div>
      );
    case "checkin":
      return (
        <div className="relative h-14 w-20">
          <div className="absolute left-0 top-1 h-8 w-12 rounded-2xl bg-white/15" />
          <div
            className="absolute bottom-1 right-0 h-8 w-12 rounded-2xl"
            style={{ background: accent, opacity: 0.75 }}
          />
        </div>
      );
    case "story":
      return (
        <div className="relative h-14 w-16">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="absolute inset-x-0 mx-auto h-12 w-10 rounded-sm border border-white/20 bg-[#1c1c1c]"
              style={{
                transform: `rotate(${(i - 1) * 8}deg) translateY(${i}px)`,
                opacity: 0.5 + i * 0.2,
              }}
            />
          ))}
          <div className="absolute inset-x-3 top-5 h-1 rounded-full bg-[var(--accent)]/70" />
        </div>
      );
    case "message":
      return (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/25 bg-black/35">
          <div className="h-2 w-2 rounded-full bg-[var(--accent)] shadow-[8px_0_0_0_var(--accent),16px_0_0_0_var(--accent)]" />
        </div>
      );
    case "call":
      return (
        <div className="relative h-14 w-14">
          <div className="absolute inset-0 rounded-full border border-white/20" />
          <div className="absolute inset-2 rounded-full border border-[var(--accent)]/50" />
          <div className="absolute inset-5 rounded-full bg-[var(--accent)]" />
        </div>
      );
    case "reading":
      return (
        <div className="flex h-14 items-end gap-[3px]">
          {Array.from({ length: 16 }, (_, i) => {
            const n = ((seed >>> (i % 8)) ^ (i * 13)) & 0xff;
            return (
              <div
                key={i}
                className="w-1 rounded-full bg-white/50"
                style={{
                  height: `${20 + (n % 70)}%`,
                  background:
                    i % 3 === 0 ? "var(--accent)" : "rgba(255,255,255,0.35)",
                }}
              />
            );
          })}
        </div>
      );
    default:
      return (
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="absolute h-14 w-14 rounded-full border border-white/20" />
          <div className="absolute h-8 w-8 rounded-full border border-[var(--accent)]/60" />
          <div className="h-2 w-2 rounded-full bg-[var(--accent)]" />
        </div>
      );
  }
}

function AudioCard({ item }: { item: ReelPreview }) {
  const seed = hashSeed(item.id);
  const label = genericAudioLabel(item.title, item.id);
  const kind = audioSceneKind(label);
  const hue = 28 + (seed % 50);

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden px-6"
      style={{
        background: `radial-gradient(ellipse at 30% 20%, hsl(${hue} 28% 22%), #101010 70%)`,
      }}
    >
      {/* Decorative grain rings — unique per id */}
      <div
        className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full border border-white/5"
        style={{ transform: `rotate(${seed % 40}deg)` }}
      />
      <div className="pointer-events-none absolute -bottom-10 -left-8 h-32 w-32 rounded-full border border-white/5" />

      <AudioGlyph kind={kind} seed={seed} />
      <p className="relative z-[1] text-center font-sans text-[11px] uppercase tracking-[0.18em] text-white/75">
        {label}
      </p>
    </div>
  );
}

/** One still per media URL — avoids mounting N <video> tags in the reel. */
const videoStillCache = new Map<string, string>();
const videoStillInflight = new Map<string, Promise<string | null>>();

function captureVideoStill(url: string): Promise<string | null> {
  const hit = videoStillCache.get(url);
  if (hit) return Promise.resolve(hit);
  const inflight = videoStillInflight.get(url);
  if (inflight) return inflight;

  const job = new Promise<string | null>((resolve) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.crossOrigin = "anonymous";
    v.src = url;

    const fail = () => {
      videoStillInflight.delete(url);
      resolve(null);
    };

    const done = () => {
      try {
        const w = Math.min(v.videoWidth || 480, 640);
        const h = Math.min(v.videoHeight || 270, 360);
        if (!w || !h) return fail();
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        if (!ctx) return fail();
        ctx.drawImage(v, 0, 0, w, h);
        const data = c.toDataURL("image/jpeg", 0.72);
        videoStillCache.set(url, data);
        videoStillInflight.delete(url);
        resolve(data);
      } catch {
        fail();
      } finally {
        v.removeAttribute("src");
        v.load();
      }
    };

    v.addEventListener(
      "seeked",
      () => {
        done();
      },
      { once: true },
    );
    v.addEventListener(
      "loadeddata",
      () => {
        try {
          v.currentTime = Math.min(0.12, (v.duration || 1) * 0.05);
        } catch {
          done();
        }
      },
      { once: true },
    );
    v.addEventListener("error", fail, { once: true });
  });

  videoStillInflight.set(url, job);
  return job;
}

/** Static video tile — image still only, never labels, never live <video> in reel. */
function VideoCard({ item }: { item: ReelPreview }) {
  const poster = isRasterUrl(item.thumbUrl) ? item.thumbUrl! : null;
  const [still, setStill] = useState<string | null>(
    () => poster ?? (item.mediaUrl ? videoStillCache.get(item.mediaUrl) ?? null : null),
  );

  useEffect(() => {
    if (poster) {
      setStill(poster);
      return;
    }
    if (!item.mediaUrl) return;
    const cached = videoStillCache.get(item.mediaUrl);
    if (cached) {
      setStill(cached);
      return;
    }
    let cancelled = false;
    void captureVideoStill(item.mediaUrl).then((data) => {
      if (!cancelled && data) setStill(data);
    });
    return () => {
      cancelled = true;
    };
  }, [item.mediaUrl, poster]);

  if (still) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={still}
        alt=""
        draggable={false}
        className="h-full w-full object-cover"
      />
    );
  }

  // Brief placeholder while the still extracts — no text
  return <div className="h-full w-full bg-[#121212]" />;
}

function MediaFill({ item }: { item: ReelPreview }) {
  if (item.mediaType === "audio") return <AudioCard item={item} />;
  if (item.mediaType === "video") return <VideoCard item={item} />;

  if (item.mediaType === "image" && item.mediaUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.mediaUrl}
        alt=""
        draggable={false}
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#1a1a1a] font-sans text-xs text-white/40">
      No preview
    </div>
  );
}

function OverlappingCard({
  item,
  index,
  scrollY,
}: {
  item: ReelPreview;
  index: number;
  scrollY: ReturnType<typeof useMotionValue<number>>;
}) {
  const dist = useTransform(scrollY, (y) => {
    const cardCenter = index * STEP + CARD_H / 2 + y;
    return cardCenter - WINDOW_H / 2;
  });

  const scale = useTransform(dist, [-220, 0, 220], [0.86, 1, 0.86]);
  const opacity = useTransform(dist, [-240, -40, 0, 40, 240], [0.35, 0.75, 1, 0.75, 0.35]);
  const z = useTransform(dist, (d) => Math.round(1000 - Math.abs(d)));

  return (
    <motion.div
      className="absolute left-3 right-3 overflow-hidden rounded-sm"
      style={{
        top: index * STEP,
        height: CARD_H,
        scale,
        opacity,
        zIndex: z,
        boxShadow:
          "0 10px 28px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.06) inset",
      }}
    >
      <MediaFill item={item} />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
    </motion.div>
  );
}

function buildStrip(
  base: ReelPreview[],
  targetId: string,
  seed: number,
): { strip: ReelPreview[]; landIndex: number } {
  const ordered =
    base.length <= 1 ? base : shuffleWithSeed(base, seed ^ hashSeed(targetId));
  const reps = LOOPS + 2;
  const out: ReelPreview[] = [];
  for (let r = 0; r < reps; r++) {
    const loop = shuffleWithSeed(ordered, seed + r * 9973);
    for (const p of loop) out.push(p);
  }
  const landSlot = Math.max(0, Math.min(out.length - 1, ordered.length * LOOPS));
  const target =
    ordered.find((p) => p.id === targetId) ??
    base.find((p) => p.id === targetId);
  if (target) {
    const already = out.findIndex(
      (p, i) => i >= landSlot && p.id === targetId,
    );
    if (already >= 0 && already !== landSlot) {
      const tmp = out[landSlot]!;
      out[landSlot] = out[already]!;
      out[already] = tmp;
    } else {
      out[landSlot] = target;
    }
  }
  return { strip: out, landIndex: landSlot };
}

export function SpinReel({
  category,
  previews,
  spinning,
  targetId,
  onSpinEnd,
  onSpinRequest,
  disabled,
}: Props) {
  const y = useMotionValue(0);
  const gen = useRef(0);
  const [landing, setLanding] = useState(false);
  const [landedId, setLandedId] = useState<string | null>(null);
  /** Built once when a spin starts — keeps strip + land index in lockstep */
  const [spinRun, setSpinRun] = useState<{
    seed: number;
    strip: ReelPreview[];
    landIndex: number;
  } | null>(null);

  const base = useMemo(() => {
    if (previews.length > 0) return previews;
    return [
      {
        id: "empty",
        title: "Empty",
        mediaType: category,
        thumbUrl: null,
        mediaUrl: null,
      } satisfies ReelPreview,
    ];
  }, [previews, category]);

  const strip = spinRun?.strip ?? base;
  const stripHeight = Math.max(CARD_H, (strip.length - 1) * STEP + CARD_H);

  const landedPreview = useMemo(
    () => base.find((p) => p.id === (landedId ?? targetId)) ?? null,
    [base, landedId, targetId],
  );

  useEffect(() => {
    if (spinning || landing) return;
    const idle = Math.min(1, Math.max(0, base.length - 1));
    y.set(centerY(idle));
    setLandedId(null);
    setSpinRun(null);
  }, [category, base.length, spinning, landing, y]);

  // 1) When spin starts, build the shuffled strip
  useEffect(() => {
    if (!spinning) return;
    if (spinRun) return;
    const seed = Math.floor(Math.random() * 1e9) + 1;
    const built = buildStrip(base, targetId, seed);
    setLanding(false);
    setLandedId(null);
    setSpinRun({ seed, ...built });
  }, [spinning, spinRun, base, targetId]);

  // 2) Animate only after strip is committed
  useEffect(() => {
    if (!spinning || !spinRun) return;

    const g = ++gen.current;
    const startIndex = Math.min(1, Math.max(0, base.length - 1));
    const start = centerY(startIndex);
    const end = centerY(spinRun.landIndex);
    y.set(start);
    void playWheelSpin(SPIN_DURATION);

    const controls = animate(y, end, {
      duration: SPIN_DURATION,
      // Keep motion alive into the crawl so pegs still cross while slowing
      ease: [0.08, 0.6, 0.2, 1],
      onComplete: () => {
        if (gen.current !== g) return;
        setLandedId(targetId);
        setLanding(true);
        window.setTimeout(() => {
          if (gen.current === g) onSpinEnd();
        }, 850);
      },
    });

    return () => {
      stopWheelSpin();
      controls.stop();
    };
  }, [spinning, spinRun, base.length, y, onSpinEnd, targetId]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-8">
      <div className="relative w-full">
        <div
          className="relative w-full overflow-hidden border-2 border-[var(--ink)] bg-[#0c0c0c]"
          style={{ height: WINDOW_H }}
        >
          <div
            className="pointer-events-none absolute inset-x-0 z-30 border-y-2 border-[var(--accent)]"
            style={{
              top: WINDOW_H / 2 - CARD_H / 2 + 8,
              height: CARD_H - 16,
              boxShadow: landing
                ? "0 0 48px rgba(245,226,122,0.28)"
                : "0 0 40px rgba(245,226,122,0.12)",
            }}
          />

          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-20 h-16"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.75), transparent)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-16"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.75), transparent)",
            }}
          />

          <motion.div
            style={{ y, height: stripHeight }}
            className="relative w-full will-change-transform"
          >
            {strip.map((item, i) => (
              <OverlappingCard
                key={`${spinRun?.seed ?? "idle"}-${item.id}-${i}`}
                item={item}
                index={i}
                scrollY={y}
              />
            ))}
          </motion.div>

          {landing && landedPreview ? (
            <div
              className="pointer-events-none absolute inset-x-3 z-40 overflow-hidden rounded-sm ring-2 ring-[var(--accent)]"
              style={{
                top: WINDOW_H / 2 - CARD_H / 2,
                height: CARD_H,
                boxShadow: "0 10px 28px rgba(0,0,0,0.55)",
              }}
            >
              <MediaFill item={landedPreview} />
            </div>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={onSpinRequest}
        disabled={disabled || spinning || landing}
        className="bg-[var(--accent)] px-8 py-3 font-serif text-xl tracking-wide text-[var(--ink)] transition enabled:hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-35"
      >
        {spinning || landing ? "…" : "Spin"}
      </button>
    </div>
  );
}
