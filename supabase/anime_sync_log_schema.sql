-- ─── anime_sync_log — bookkeeping for scripts/animood_sync.mjs ───────────────
-- new-scores logs the first time an airing anime is scored; rescore-2w and
-- rescore-2m then refresh its score/status 2 weeks and 2 months later.
-- Also relies on anime_cache.trailer (jsonb {url, youtube_id}, {} = checked,
-- none found) and anime_cache.streaming (jsonb [{name, url}]).
-- Safe to re-run.

create table if not exists anime_sync_log (
  mal_id         bigint primary key,
  first_fetch_at timestamptz not null default now(),
  rescored_2w    boolean not null default false,
  rescored_2m    boolean not null default false
);

alter table anime_cache add column if not exists trailer   jsonb;
alter table anime_cache add column if not exists streaming jsonb;
