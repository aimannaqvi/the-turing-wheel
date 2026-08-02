"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { playDateCT } from "@/lib/date";
import type { IngestSource, ProviderStatus } from "@/lib/ingest/types";
import type { LibraryItem, MediaType, PackItem } from "@/lib/types";

type Tab = "intake" | "library" | "pack" | "ingest";

const INGEST_ACTIONS: Array<{
  source: IngestSource;
  label: string;
  defaultCount: number;
  needsKey?: keyof ProviderStatus;
}> = [
  { source: "aivideo", label: "AI video (Seedance/Sora/Gemini)", defaultCount: 12 },
  { source: "pixabay", label: "Pixabay (video + audio)", defaultCount: 10, needsKey: "pixabay" },
  { source: "pollinations", label: "Pollinations Flux (AI)", defaultCount: 10 },
  { source: "huggingface", label: "HF OpenFake (images)", defaultCount: 40 },
  { source: "unsplash", label: "Unsplash (real photos)", defaultCount: 16, needsKey: "unsplash" },
  { source: "commonvoice", label: "Common Voice (real talk)", defaultCount: 12 },
  { source: "openspeech", label: "Open Speech (real talk)", defaultCount: 10 },
  { source: "elevenlabs", label: "ElevenLabs (AI speech)", defaultCount: 5, needsKey: "elevenlabs" },
  { source: "edgetts", label: "Edge TTS (AI speech)", defaultCount: 5, needsKey: "edgetts" },
  { source: "openai-tts", label: "OpenAI TTS", defaultCount: 3, needsKey: "openaiTts" },
  { source: "sdfvd", label: "SDFVD (legacy)", defaultCount: 8 },
];

function MediaPreview({ item }: { item: LibraryItem }) {
  if (item.mediaType === "image" && (item.thumbUrl || item.mediaUrl)) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={item.thumbUrl ?? item.mediaUrl ?? ""}
        alt=""
        className="h-full w-full object-contain"
        draggable={false}
      />
    );
  }
  if (item.mediaType === "video" && item.mediaUrl) {
    return (
      <video
        src={item.mediaUrl}
        poster={item.thumbUrl ?? undefined}
        controls
        playsInline
        className="h-full w-full object-contain"
      />
    );
  }
  if (item.mediaType === "audio" && item.mediaUrl) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <audio src={item.mediaUrl} controls className="w-full" />
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center font-sans text-sm text-[var(--muted)]">
      No preview
    </div>
  );
}

export function AdminPanel() {
  const [tab, setTab] = useState<Tab>("intake");
  const [providers, setProviders] = useState<ProviderStatus | null>(null);
  const [intake, setIntake] = useState<LibraryItem[]>([]);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [pack, setPack] = useState<PackItem[]>([]);
  const [playDate, setPlayDate] = useState(playDateCT());
  const [libFilter, setLibFilter] = useState<MediaType | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const current = intake[0] ?? null;

  const loadProviders = useCallback(async () => {
    const res = await fetch("/api/admin/ingest");
    if (res.ok) {
      const j = (await res.json()) as { providers: ProviderStatus };
      setProviders(j.providers);
    }
  }, []);

  const loadIntake = useCallback(async () => {
    const res = await fetch("/api/admin/intake");
    if (!res.ok) throw new Error("Failed to load intake");
    const j = (await res.json()) as { items: LibraryItem[] };
    setIntake(j.items);
  }, []);

  const loadLibrary = useCallback(async () => {
    const q =
      libFilter === "all" ? "" : `?mediaType=${encodeURIComponent(libFilter)}`;
    const res = await fetch(`/api/admin/library${q}`);
    if (!res.ok) throw new Error("Failed to load library");
    const j = (await res.json()) as { items: LibraryItem[] };
    setLibrary(j.items);
  }, [libFilter]);

  const loadPack = useCallback(async () => {
    const res = await fetch(
      `/api/admin/pack?playDate=${encodeURIComponent(playDate)}`,
    );
    if (!res.ok) throw new Error("Failed to load pack");
    const j = (await res.json()) as { items: PackItem[] };
    setPack(j.items);
  }, [playDate]);

  const refresh = useCallback(async () => {
    await Promise.all([loadProviders(), loadIntake(), loadLibrary(), loadPack()]);
  }, [loadProviders, loadIntake, loadLibrary, loadPack]);

  useEffect(() => {
    void refresh().catch((e) =>
      setMsg(e instanceof Error ? e.message : "Load failed"),
    );
  }, [refresh]);

  const swipe = async (action: "keep" | "discard") => {
    if (!current || busy) return;
    setBusy(action);
    setMsg(null);
    setDragX(0);
    try {
      const res = await fetch("/api/admin/intake/swipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: current.id, action }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Swipe failed");
      setMsg(
        action === "keep"
          ? "Kept — per-item analysis generated"
          : "Discarded",
      );
      await Promise.all([loadIntake(), loadLibrary()]);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Swipe failed");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tab !== "intake" || busy) return;
      if (e.key === "ArrowLeft") void swipe("discard");
      if (e.key === "ArrowRight") void swipe("keep");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // swipe closes over latest intake; rebind when tab/busy change
  }, [tab, busy]);

  const onIngest = async (source: IngestSource, count: number) => {
    setBusy(source);
    setMsg(null);
    try {
      const speechEndpoint =
        source === "elevenlabs"
          ? "/api/admin/generate-speech"
          : source === "edgetts"
            ? "/api/admin/generate-speech-edge"
            : source === "openai-tts"
              ? "/api/admin/generate-speech-openai"
              : null;

      if (speechEndpoint) {
        const res = await fetch(speechEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count }),
        });
        const json = (await res.json()) as {
          error?: string;
          created?: unknown[];
        };
        if (!res.ok) throw new Error(json.error || `${source} failed`);
        setMsg(`${source}: added ${json.created?.length ?? 0} to intake.`);
      } else {
        const res = await fetch("/api/admin/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source, count }),
        });
        const json = (await res.json()) as {
          error?: string;
          inserted?: number;
          skipped?: number;
          note?: string;
        };
        if (!res.ok) throw new Error(json.error || "Ingest failed");
        setMsg(
          `${source}: ${json.inserted ?? 0} new → intake${
            json.skipped ? ` · ${json.skipped} already had` : ""
          }. ${json.note ?? ""}`.trim(),
        );
      }
      await loadIntake();
      setTab("intake");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Ingest failed");
    } finally {
      setBusy(null);
    }
  };

  const regenerateAnalysis = async (
    body: { id: string } | { templatesOnly: true },
  ) => {
    const key = "id" in body ? `regen-${body.id}` : "regen-templates";
    setBusy(key);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/analysis/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as {
        error?: string;
        updated?: number;
        failed?: number;
      };
      if (!res.ok) throw new Error(j.error || "Regenerate failed");
      setMsg(
        `Analysis updated: ${j.updated ?? 0}${
          j.failed ? ` · ${j.failed} failed` : ""
        }`,
      );
      await loadLibrary();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Regenerate failed");
    } finally {
      setBusy(null);
    }
  };

  const addToPack = async (libraryId: string) => {
    setBusy("pack-add");
    try {
      const res = await fetch("/api/admin/pack", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playDate, op: "add", libraryId }),
      });
      const j = (await res.json()) as { error?: string; items?: PackItem[] };
      if (!res.ok) throw new Error(j.error || "Add failed");
      setPack(j.items ?? []);
      await loadLibrary();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Add failed");
    } finally {
      setBusy(null);
    }
  };

  const removeFromPack = async (libraryId: string) => {
    setBusy("pack-remove");
    try {
      const res = await fetch("/api/admin/pack", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playDate, op: "remove", libraryId }),
      });
      const j = (await res.json()) as { error?: string; items?: PackItem[] };
      if (!res.ok) throw new Error(j.error || "Remove failed");
      setPack(j.items ?? []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(null);
    }
  };

  const moveInPack = async (mediaType: MediaType, libraryId: string, dir: -1 | 1) => {
    const col = pack
      .filter((p) => p.mediaType === mediaType)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = col.findIndex((p) => p.libraryId === libraryId);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= col.length) return;
    const ids = col.map((p) => p.libraryId);
    [ids[idx], ids[swap]] = [ids[swap]!, ids[idx]!];
    const res = await fetch("/api/admin/pack", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playDate,
        op: "reorder",
        mediaType,
        libraryIds: ids,
      }),
    });
    const j = (await res.json()) as { items?: PackItem[] };
    if (res.ok) setPack(j.items ?? []);
  };

  const wipe = async () => {
    if (!confirm("Wipe ALL library, packs, and guesses? Type OK in next prompt.")) return;
    const typed = prompt('Type WIPE to confirm');
    if (typed !== "WIPE") return;
    setBusy("wipe");
    try {
      const res = await fetch("/api/admin/wipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "WIPE" }),
      });
      const j = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(j.error || "Wipe failed");
      setMsg(j.message ?? "Wiped");
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Wipe failed");
    } finally {
      setBusy(null);
    }
  };

  const packByType = useMemo(() => {
    const base = {
      image: [] as PackItem[],
      video: [] as PackItem[],
      audio: [] as PackItem[],
    };
    for (const p of pack) {
      if (p.mediaType === "image" || p.mediaType === "video" || p.mediaType === "audio") {
        base[p.mediaType].push(p);
      }
    }
    for (const k of Object.keys(base) as Array<keyof typeof base>) {
      base[k].sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return base;
  }, [pack]);

  const packIds = useMemo(() => new Set(pack.map((p) => p.libraryId)), [pack]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!current) return;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragX((x) => x + e.movementX);
  };
  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (dragX > 120) void swipe("keep");
    else if (dragX < -120) void swipe("discard");
    else setDragX(0);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "intake", label: `Intake (${intake.length})` },
    { id: "library", label: `Library (${library.length})` },
    { id: "pack", label: "Daily pack" },
    { id: "ingest", label: "Ingest" },
  ];

  return (
    <div className="mx-auto min-h-full w-full max-w-6xl px-6 py-10 sm:px-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-sans text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
            Admin
          </p>
          <h1 className="font-serif text-3xl tracking-tight">The Turing Wheel</h1>
          <p className="mt-2 max-w-xl font-sans text-sm text-[var(--muted)]">
            Flow: Ingest → Intake swipe (generates analysis) → Library → Daily
            pack (≤20/cat) → play. Ingest skips already-seen{" "}
            <code className="text-[var(--ink)]">(source, external_id)</code>.
            Analysis:{" "}
            {providers?.analysis
              ? providers.analysisLabel
              : "offline — start Ollama (qwen2.5vl:7b) or set HF_TOKEN"}
            .
          </p>
        </div>
        <div className="flex gap-4 font-sans text-sm">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[var(--muted)] underline-offset-4 transition hover:text-[var(--ink)] hover:underline"
          >
            ← Back to game
          </Link>
          <button
            type="button"
            onClick={() => void wipe()}
            disabled={!!busy}
            className="text-[var(--rose)] underline underline-offset-4 disabled:opacity-40"
          >
            Wipe DB
          </button>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "bg-[var(--ink)] px-3 py-2 font-sans text-xs text-[var(--paper)]"
                : "border border-[var(--ink)]/15 px-3 py-2 font-sans text-xs"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg ? (
        <p className="mb-4 font-sans text-sm text-[var(--ink)]/80">{msg}</p>
      ) : null}

      {tab === "intake" ? (
        <section className="mx-auto max-w-xl">
          <p className="mb-4 font-sans text-xs text-[var(--muted)]">
            Swipe right / → keep · left / ← discard. Keep runs local vision
            (Ollama) / Whisper — can take ~30–90s.
          </p>
          {current ? (
            <div
              className="relative aspect-[4/5] overflow-hidden border-2 border-[var(--ink)] bg-black select-none"
              style={{
                transform: `translateX(${dragX}px) rotate(${dragX / 40}deg)`,
                transition: dragging ? "none" : "transform 0.2s ease",
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <MediaPreview item={current} />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-white">
                <p className="font-serif text-xl">{current.title ?? "Untitled"}</p>
                <p className="mt-1 font-sans text-xs uppercase tracking-wide">
                  {current.mediaType} · {current.isAi ? "AI" : "Real"}
                </p>
                <p className="mt-1 font-sans text-[11px] text-white/70">
                  {current.provenance}
                </p>
              </div>
              <div
                className="pointer-events-none absolute left-4 top-4 rounded border-2 border-[var(--rose)] px-3 py-1 font-serif text-2xl text-[var(--rose)]"
                style={{ opacity: Math.min(1, Math.max(0, -dragX / 120)) }}
              >
                NOPE
              </div>
              <div
                className="pointer-events-none absolute right-4 top-4 rounded border-2 border-[var(--sage)] px-3 py-1 font-serif text-2xl text-[var(--sage)]"
                style={{ opacity: Math.min(1, Math.max(0, dragX / 120)) }}
              >
                KEEP
              </div>
            </div>
          ) : (
            <p className="border border-dashed border-[var(--ink)]/20 px-6 py-20 text-center font-sans text-sm text-[var(--muted)]">
              Intake empty — pull media from Ingest.
            </p>
          )}
          <div className="mt-6 flex justify-center gap-4">
            <button
              type="button"
              disabled={!current || !!busy}
              onClick={() => void swipe("discard")}
              className="bg-[var(--rose)] px-6 py-3 font-sans text-sm text-white disabled:opacity-35"
            >
              Discard
            </button>
            <button
              type="button"
              disabled={!current || !!busy}
              onClick={() => void swipe("keep")}
              className="bg-[var(--sage)] px-6 py-3 font-sans text-sm text-white disabled:opacity-35"
            >
              Keep
            </button>
          </div>
        </section>
      ) : null}

      {tab === "library" ? (
        <section>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(["all", "image", "video", "audio"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setLibFilter(f)}
                className={
                  libFilter === f
                    ? "bg-[var(--ink)] px-3 py-1.5 font-sans text-xs text-[var(--paper)]"
                    : "border border-[var(--ink)]/15 px-3 py-1.5 font-sans text-xs"
                }
              >
                {f}
              </button>
            ))}
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void regenerateAnalysis({ templatesOnly: true })}
              className="ml-auto border border-[var(--ink)]/20 px-3 py-1.5 font-sans text-xs disabled:opacity-40"
            >
              {busy === "regen-templates"
                ? "Regenerating…"
                : "Regenerate template analyses"}
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {library.map((item) => {
              const inPack = packIds.has(item.id);
              const bullets = item.analysisBullets ?? [];
              const needsAnalysis =
                !bullets.length ||
                bullets.some((b) =>
                  /plastic skin|too-perfect symmetry|chromatic aberration and soft corners|temporal morph|glassy or oddly clean/i.test(
                    b,
                  ),
                );
              return (
                <div
                  key={item.id}
                  className="border border-[var(--ink)]/10 bg-white/40 p-3"
                >
                  <div className="mb-2 aspect-video bg-black/5">
                    <MediaPreview item={item} />
                  </div>
                  <p className="font-serif text-base leading-tight">
                    {item.title ?? item.id.slice(0, 8)}
                  </p>
                  <p className="mt-1 font-sans text-[10px] uppercase tracking-wide text-[var(--muted)]">
                    {item.mediaType} · {item.isAi ? "AI" : "Real"} · used{" "}
                    {item.timesUsed}
                    {item.lastUsedOn ? ` · last ${item.lastUsedOn}` : ""}
                    {needsAnalysis ? " · needs analysis" : ""}
                  </p>
                  {bullets.length ? (
                    <ul className="mt-2 space-y-1 font-sans text-[11px] leading-snug text-[var(--muted)]">
                      {bullets.slice(0, 3).map((b) => (
                        <li key={b}>· {b}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() =>
                        void regenerateAnalysis({ id: item.id })
                      }
                      className="w-full border border-[var(--ink)]/20 py-2 font-sans text-xs disabled:opacity-35"
                    >
                      {busy === `regen-${item.id}`
                        ? "Generating…"
                        : "Regenerate analysis"}
                    </button>
                    <button
                      type="button"
                      disabled={inPack || !!busy}
                      onClick={() => void addToPack(item.id)}
                      className="w-full bg-[var(--ink)] py-2 font-sans text-xs text-[var(--paper)] disabled:opacity-35"
                    >
                      {inPack ? "In today’s pack" : "Add to pack"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {!library.length ? (
            <p className="font-sans text-sm text-[var(--muted)]">
              No kept items yet — swipe Keep in Intake.
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === "pack" ? (
        <section>
          <div className="mb-6 flex flex-wrap items-end gap-4">
            <label className="font-sans text-sm">
              Play date (CT)
              <input
                type="date"
                value={playDate}
                onChange={(e) => setPlayDate(e.target.value)}
                className="mt-1 block border border-[var(--ink)]/20 bg-white px-3 py-2"
              />
            </label>
            <p className="font-sans text-xs text-[var(--muted)]">
              Max 20 per category. Game only serves this pack.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {(["image", "video", "audio"] as const).map((type) => (
              <div key={type} className="border border-[var(--ink)]/10 p-3">
                <h2 className="font-serif text-xl capitalize">
                  {type}{" "}
                  <span className="font-sans text-sm text-[var(--muted)]">
                    {packByType[type].length}/20
                  </span>
                </h2>
                <ul className="mt-3 space-y-2">
                  {packByType[type].map((p) => (
                    <li
                      key={p.libraryId}
                      className="flex items-center gap-2 border border-[var(--ink)]/8 bg-white/50 p-2"
                    >
                      <div className="h-12 w-16 shrink-0 overflow-hidden bg-black/5">
                        <MediaPreview item={p.item} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-sans text-xs">
                          {p.item.title ?? p.libraryId.slice(0, 8)}
                        </p>
                        <p className="font-sans text-[10px] text-[var(--muted)]">
                          {p.item.isAi ? "AI" : "Real"} · used {p.item.timesUsed}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          className="px-1 font-sans text-xs"
                          onClick={() => void moveInPack(type, p.libraryId, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="px-1 font-sans text-xs"
                          onClick={() => void moveInPack(type, p.libraryId, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="px-1 font-sans text-xs text-[var(--rose)]"
                          onClick={() => void removeFromPack(p.libraryId)}
                        >
                          ×
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "ingest" ? (
        <section className="border border-[var(--ink)]/10 bg-white/40 p-4">
          <h2 className="font-serif text-xl">Pull into intake</h2>
          <p className="mt-1 font-sans text-xs text-[var(--muted)]">
            Nothing goes live until you Keep it and add it to a daily pack.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {INGEST_ACTIONS.map((a) => {
              const ready =
                !a.needsKey || (providers ? providers[a.needsKey] : false);
              return (
                <button
                  key={a.source}
                  type="button"
                  disabled={!!busy || !ready || providers?.supabase === false}
                  onClick={() => void onIngest(a.source, a.defaultCount)}
                  className="bg-[var(--ink)] px-3 py-2 font-sans text-xs text-[var(--paper)] disabled:opacity-35"
                >
                  {busy === a.source ? "Working…" : a.label}
                </button>
              );
            })}
          </div>
          {providers ? (
            <p className="mt-3 font-sans text-[11px] text-[var(--muted)]">
              Keys: unsplash {providers.unsplash ? "✓" : "✗"} · pixabay{" "}
              {providers.pixabay ? "✓" : "✗"} · elevenlabs{" "}
              {providers.elevenlabs ? "✓" : "✗"} · openai{" "}
              {providers.openaiTts ? "✓" : "✗"} · supabase{" "}
              {providers.supabase ? "✓" : "✗"}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* silence unused selected for now */}
      {selected.size ? (
        <button type="button" className="hidden" onClick={() => setSelected(new Set())} />
      ) : null}
    </div>
  );
}
