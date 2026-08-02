-- Fix PL/pgSQL ambiguity: RETURNS TABLE outs collide with bare column refs
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
  v_correct boolean;
  note text;
begin
  select * into pack_row
  from public.daily_pack_items dpi
  where dpi.library_id = p_artifact_id
    and dpi.play_date = public.ct_today();

  if not found then
    raise exception 'artifact not available';
  end if;

  select * into lib
  from public.media_library ml
  where ml.id = p_artifact_id;

  if not found or lib.status <> 'kept' then
    raise exception 'artifact not available';
  end if;

  if uid is null and (p_anonymous_id is null or length(trim(p_anonymous_id)) = 0) then
    raise exception 'anonymous_id required when signed out';
  end if;

  v_correct := (p_guessed_ai = lib.is_ai);

  insert into public.user_guesses (user_id, anonymous_id, artifact_id, guessed_ai, is_correct)
  values (
    uid,
    case when uid is null then p_anonymous_id else null end,
    p_artifact_id,
    p_guessed_ai,
    v_correct
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
    null::text,
    coalesce(nullif(note, ''), 'Look closely at texture, motion, and timing tells.'),
    lib.analysis_bullets,
    v_correct;
end;
$$;

grant execute on function public.submit_guess(uuid, boolean, text) to anon, authenticated;
