-- The Turing Wheel — initial schema

create extension if not exists "pgcrypto";

create type public.staging_status as enum ('pending', 'approved', 'rejected');
create type public.media_type as enum ('image', 'video', 'audio', 'text');

-- A. Triage inbox (admin only)
create table public.admin_staging (
  id uuid primary key default gen_random_uuid(),
  scraped_url text not null,
  media_url text,
  platform text,
  llm_summary text,
  status public.staging_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- B. Curated daily puzzles
create table public.daily_artifacts (
  id uuid primary key default gen_random_uuid(),
  play_date date not null,
  sort_order integer not null default 0,
  media_type public.media_type not null,
  media_url text,
  text_content text,
  is_ai boolean not null,
  proof_url text,
  educational_note text not null,
  created_at timestamptz not null default now(),
  constraint daily_artifacts_payload_check check (
    media_url is not null or text_content is not null
  )
);

create index daily_artifacts_play_date_idx
  on public.daily_artifacts (play_date, sort_order);

-- C. Player profiles
create table public.user_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  current_streak integer not null default 0,
  max_streak integer not null default 0,
  total_played integer not null default 0,
  total_correct integer not null default 0,
  last_played_at timestamptz,
  updated_at timestamptz not null default now()
);

-- D. Per-guess analytics
create table public.user_guesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  anonymous_id text,
  artifact_id uuid not null references public.daily_artifacts (id) on delete cascade,
  guessed_ai boolean not null,
  is_correct boolean not null,
  created_at timestamptz not null default now(),
  constraint user_guesses_identity_check check (
    user_id is not null or anonymous_id is not null
  ),
  constraint user_guesses_unique_user unique (user_id, artifact_id),
  constraint user_guesses_unique_anon unique (anonymous_id, artifact_id)
);

create index user_guesses_artifact_idx on public.user_guesses (artifact_id);

create or replace function public.set_guess_correctness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  truth boolean;
begin
  select is_ai into truth from public.daily_artifacts where id = new.artifact_id;
  if truth is null then
    raise exception 'artifact not found';
  end if;
  new.is_correct := (new.guessed_ai = truth);
  return new;
end;
$$;

create trigger user_guesses_set_correctness
  before insert on public.user_guesses
  for each row
  execute function public.set_guess_correctness();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

create or replace function public.ct_today()
returns date
language sql
stable
as $$
  select (timezone('America/Chicago', now()))::date;
$$;

-- Public pack view — no ground truth.
-- security_invoker=false so anon can read via owner privileges; base table RLS still hides ground truth.
create or replace view public.daily_artifacts_public
with (security_invoker = false)
as
select
  id,
  play_date,
  sort_order,
  media_type,
  media_url,
  text_content,
  created_at
from public.daily_artifacts
where play_date = public.ct_today();

-- Submit guess + return reveal (only way anon learns ground truth)
create or replace function public.submit_guess(
  p_artifact_id uuid,
  p_guessed_ai boolean,
  p_anonymous_id text default null
)
returns table (
  id uuid,
  play_date date,
  sort_order integer,
  media_type public.media_type,
  media_url text,
  text_content text,
  is_ai boolean,
  proof_url text,
  educational_note text,
  is_correct boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  art public.daily_artifacts%rowtype;
  uid uuid := auth.uid();
  correct boolean;
begin
  select * into art
  from public.daily_artifacts
  where daily_artifacts.id = p_artifact_id
    and daily_artifacts.play_date = public.ct_today();

  if not found then
    raise exception 'artifact not available';
  end if;

  if uid is null and (p_anonymous_id is null or length(trim(p_anonymous_id)) = 0) then
    raise exception 'anonymous_id required when signed out';
  end if;

  correct := (p_guessed_ai = art.is_ai);

  insert into public.user_guesses (user_id, anonymous_id, artifact_id, guessed_ai, is_correct)
  values (
    uid,
    case when uid is null then p_anonymous_id else null end,
    p_artifact_id,
    p_guessed_ai,
    correct
  )
  on conflict do nothing;

  return query
  select
    art.id,
    art.play_date,
    art.sort_order,
    art.media_type,
    art.media_url,
    art.text_content,
    art.is_ai,
    art.proof_url,
    art.educational_note,
    correct;
end;
$$;

grant execute on function public.submit_guess(uuid, boolean, text) to anon, authenticated;

-- RLS
alter table public.admin_staging enable row level security;
alter table public.daily_artifacts enable row level security;
alter table public.user_stats enable row level security;
alter table public.user_guesses enable row level security;

create policy "admin_staging_admin_all"
  on public.admin_staging
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Base table: admin full access only (players use the view + RPC)
create policy "daily_artifacts_admin_all"
  on public.daily_artifacts
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.daily_artifacts_public to anon, authenticated;

create policy "user_stats_select_own"
  on public.user_stats
  for select
  using (auth.uid() = user_id);

create policy "user_stats_upsert_own"
  on public.user_stats
  for insert
  with check (auth.uid() = user_id);

create policy "user_stats_update_own"
  on public.user_stats
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_guesses_insert_own"
  on public.user_guesses
  for insert
  with check (
    (auth.uid() is not null and auth.uid() = user_id)
    or (auth.uid() is null and anonymous_id is not null)
  );

create policy "user_guesses_select_own"
  on public.user_guesses
  for select
  using (
    public.is_admin()
    or (auth.uid() is not null and auth.uid() = user_id)
  );

insert into storage.buckets (id, name, public)
values ('artifacts', 'artifacts', true)
on conflict (id) do nothing;

create policy "artifacts_public_read"
  on storage.objects
  for select
  using (bucket_id = 'artifacts');

create policy "artifacts_admin_write"
  on storage.objects
  for all
  using (bucket_id = 'artifacts' and public.is_admin())
  with check (bucket_id = 'artifacts' and public.is_admin());
