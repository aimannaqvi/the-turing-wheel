-- Stable identity for cross-run ingest dedupe
alter table public.media_library
  add column if not exists source text,
  add column if not exists external_id text;

create unique index if not exists media_library_source_external_uidx
  on public.media_library (source, external_id)
  where external_id is not null;

comment on column public.media_library.source is
  'Ingest provider key (unsplash, pixabay, defactify, …)';
comment on column public.media_library.external_id is
  'Stable id within source — skip on re-ingest';
