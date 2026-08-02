-- Optional local seed. Production flow is Admin wipe → ingest → swipe → pack.
-- Keep empty so `db push` / seed does not dump live fixtures into the pack.
select 1;
