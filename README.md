# The Turing Wheel

Daily Real-vs-AI media puzzle. Next.js + Supabase. Desktop-first, NYT-games energy.

## Stack

- Next.js (App Router) + Tailwind + Framer Motion
- Supabase (Postgres, Auth, Storage) — fixtures fallback when unset
- Ollama `qwen2.5vl:7b` for “How do we know?” bullets (HF Inference fallback; video frames + Whisper for audio)

## Develop

```bash
export PATH="$HOME/.local/node/bin:$PATH"
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without Supabase env vars it serves local fixtures.

## Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Copy keys into `.env.local` from `.env.example`. For free local “How do we know?” analysis: install [Ollama](https://ollama.com), `ollama pull qwen2.5vl:7b`, set `OLLAMA_BASE_URL` / `OLLAMA_MODEL`. `HF_TOKEN` is the fallback when Ollama is down.
3. Push schema:

```bash
npx supabase link --project-ref YOUR_REF
npx supabase db push
```

Schema highlights:

- `media_library` — intake / kept / discarded pool (`analysis_bullets`, usage stats)
- `daily_pack_items` — curated ≤20 per category per CT date
- `daily_artifacts_public` — safe view of today’s pack (no ground truth)
- `submit_guess()` — RPC that logs the guess and returns reveal + analysis bullets
- Storage bucket `artifacts`

Mark yourself admin (for writes) via Auth → user → `app_metadata.role = "admin"`.

## Bootstrap (empty → playable day)

1. **Admin → Wipe** (confirm `WIPE`) — clears library, packs, guesses.
2. **Admin → Ingest** — pull Pixabay talkers, AI video, Common Voice / Edge TTS, Pollinations / HF images, etc. Everything lands in **intake** (not live).
3. **Admin → Intake** — Tinder swipe: left discard (deletes storage), right keep (queues LLM bullets).
4. **Admin → Library / Daily pack** — pick ≤20 image / video / audio for today’s CT date; reorder with ↑↓.
5. Play at `/` — brand mark returns home; no remaining counts / streak chrome.

## Game rules (v1)

- Curated daily pack only (max 20 per Image / Video / Audio), reset midnight America/Chicago
- Wheel is theater over the next artifact in the active category
- Anonymous play; local progress in `localStorage`
- Reveal shows “How do we know?” bullets (no external receipt URLs)
