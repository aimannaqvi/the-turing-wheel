alter table public.daily_artifacts
  add column if not exists title text,
  add column if not exists thumb_url text;

-- Must drop: CREATE OR REPLACE cannot reorder/rename view columns
drop view if exists public.daily_artifacts_public;

create view public.daily_artifacts_public
with (security_invoker = false)
as
select
  id,
  play_date,
  sort_order,
  media_type,
  media_url,
  text_content,
  title,
  thumb_url,
  created_at
from public.daily_artifacts
where play_date = public.ct_today();

grant select on public.daily_artifacts_public to anon, authenticated;

drop function if exists public.submit_guess(uuid, boolean, text);

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
    art.title,
    art.thumb_url,
    art.is_ai,
    art.proof_url,
    art.educational_note,
    correct;
end;
$$;

grant execute on function public.submit_guess(uuid, boolean, text) to anon, authenticated;
