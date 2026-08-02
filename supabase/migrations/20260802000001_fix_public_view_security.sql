-- Public pack view must run as owner; invoker mode + RLS hid all rows from anon.
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

grant select on public.daily_artifacts_public to anon, authenticated;
