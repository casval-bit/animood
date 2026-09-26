-- ─── Artistes OP/ED — copie locale des données AnimeThemes ───────────────────
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
--
-- Populated by scripts/sync_artists.mjs (see .github/workflows/sync-anime.yml).
-- AnimeThemes.moe goes down for hours at a time (Cloudflare 522 / datacenter
-- outages); with this table filled the Artist tab keeps showing the popular
-- artists and can still search them while the live API is unreachable. If
-- it's empty/unreachable the tab simply falls back to the live API.

create table if not exists artist_cache (
  slug         text primary key,        -- AnimeThemes artist slug
  name         text not null,
  themes       jsonb not null default '[]', -- [{animeId, animeSlug, animeTitle, malId, year, type, slug, songTitle}]
  popular_rank int,                     -- position in the Artist tab's default list, null = search-only
  updated_at   timestamptz not null default now()
);

create index if not exists artist_cache_popular_idx on artist_cache(popular_rank);

alter table artist_cache enable row level security;

-- Same open-access model as the rest of the app (see README → Database):
-- shared anon key, no Supabase Auth session, so access control is
-- "anyone can read/insert/update" rather than per-user RLS.
drop policy if exists "artist_cache_select" on artist_cache;
drop policy if exists "artist_cache_insert" on artist_cache;
drop policy if exists "artist_cache_update" on artist_cache;
create policy "artist_cache_select" on artist_cache for select using (true);
create policy "artist_cache_insert" on artist_cache for insert with check (true);
create policy "artist_cache_update" on artist_cache for update using (true) with check (true);
