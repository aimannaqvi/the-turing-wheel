-- Intake library + curated daily packs (replaces date-first daily_artifacts dumps)

create type public.library_status as enum ('intake', 'kept', 'discarded');

-- Wipe play history tied to old artifact rows
truncate public.user_guesses;

alter table public.user_guesses
  drop constraint if exists user_guesses_artifact_id_fkey;

drop view if exists public.daily_artifacts_public;
drop function if exists public.submit_guess(uuid, boolean, text);

drop table if exists public.daily_artifacts;

create table public.media_library (
  id uuid primary key default gen_random_uuid(),
  media_type public.media_type not null,
  media_url text,
  thumb_url text,
  title text,
  text_content text,
  is_ai boolean not null,
  provenance text,
  status public.library_status not null default 'intake',
  times_used integer not null default 0,
  last_used_on date,
  analysis_bullets text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint media_library_payload_check check (
    media_url is not null or text_content is not null
  )
);

create index media_library_status_type_idx
  on public.media_library (status, media_type, created_at desc);

create table public.daily_pack_items (
  id uuid primary key default gen_random_uuid(),
  play_date date not null,
  media_type public.media_type not null,
  library_id uuid not null references public.media_library (id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint daily_pack_items_unique_day_library unique (play_date, library_id)
);

create index daily_pack_items_day_type_idx
  on public.daily_pack_items (play_date, media_type, sort_order);

-- Guesses reference library rows (stable across rotation)
alter table public.user_guesses
  add constraint user_guesses_artifact_id_fkey
  foreign key (artifact_id) references public.media_library (id) on delete cascade;

create or replace function public.set_guess_correctness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  truth boolean;
begin
  select is_ai into truth from public.media_library where id = new.artifact_id;
  if truth is null then
    raise exception 'artifact not found';
  end if;
  new.is_correct := (new.guessed_ai = truth);
  return new;
end;
$$;

-- Public pack: today's curated items joined to library (no ground truth)
create or replace view public.daily_artifacts_public
with (security_invoker = false)
as
select
  lib.id,
  pack.play_date,
  pack.sort_order,
  lib.media_type,
  lib.media_url,
  lib.text_content,
  lib.title,
  lib.thumb_url,
  lib.created_at
from public.daily_pack_items pack
join public.media_library lib on lib.id = pack.library_id
where pack.play_date = public.ct_today()
  and lib.status = 'kept';

grant select on public.daily_artifacts_public to anon, authenticated;

create function public.submit_guess(
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
  title text,
  thumb_url text,
  is_ai boolean,
  proof_url text,
  educational_note text,
  analysis_bullets text[],
  is_correct boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  lib public.media_library%rowtype;
  pack_row public.daily_pack_items%rowtype;
  uid uuid := auth.uid();
  correct boolean;
  note text;
begin
  select * into pack_row
  from public.daily_pack_items
  where library_id = p_artifact_id
    and play_date = public.ct_today();

  if not found then
    raise exception 'artifact not available';
  end if;

  select * into lib from public.media_library where id = p_artifact_id;
  if not found or lib.status <> 'kept' then
    raise exception 'artifact not available';
  end if;

  if uid is null and (p_anonymous_id is null or length(trim(p_anonymous_id)) = 0) then
    raise exception 'anonymous_id required when signed out';
  end if;

  correct := (p_guessed_ai = lib.is_ai);

  insert into public.user_guesses (user_id, anonymous_id, artifact_id, guessed_ai, is_correct)
  values (
    uid,
    case when uid is null then p_anonymous_id else null end,
    p_artifact_id,
    p_guessed_ai,
    correct
  )
  on conflict do nothing;

  note := array_to_string(lib.analysis_bullets, E'\n');

  return query
  select
    lib.id,
    pack_row.play_date,
    pack_row.sort_order,
    lib.media_type,
    lib.media_url,
    lib.text_content,
    lib.title,
    lib.thumb_url,
    lib.is_ai,
    null::text as proof_url,
    coalesce(nullif(note, ''), 'Look closely at texture, motion, and timing tells.') as educational_note,
    lib.analysis_bullets,
    correct;
end;
$$;

grant execute on function public.submit_guess(uuid, boolean, text) to anon, authenticated;

alter table public.media_library enable row level security;
alter table public.daily_pack_items enable row level security;

create policy "media_library_admin_all"
  on public.media_library
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "daily_pack_items_admin_all"
  on public.daily_pack_items
  for all
  using (public.is_admin())
  with check (public.is_admin());
