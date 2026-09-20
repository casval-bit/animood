-- ─── Quiz OP — pool d'openings élargi (Jikan pour le tiering, AnimeThemes pour l'audio) ───
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
--
-- Populated by scripts/sync_opquiz_pool.mjs (see .github/workflows/sync-anime.yml).
-- The 24 hand-picked entries in src/constants/animeOpenings.js stay as a code
-- fallback and are NOT migrated here — this table only needs to exist and get
-- filled for the game to start using it; if it's empty/unreachable the game
-- keeps working off the static list.

create table if not exists opquiz_pool (
  mal_id     bigint primary key,
  title      text not null,
  difficulty text not null,           -- 'easy' | 'medium' | 'hard'
  audio_url  text not null,           -- direct AnimeThemes audio file — plays via <audio src>
  video_url  text,                    -- optional AnimeThemes video file
  source     text not null default 'auto', -- 'auto' (resolved via AnimeThemes) | 'curated'
  updated_at timestamptz not null default now()
);

create index if not exists opquiz_pool_difficulty_idx on opquiz_pool(difficulty);

alter table opquiz_pool enable row level security;

-- Same open-access model as the rest of the app (see README → Database):
-- shared anon key, no Supabase Auth session, so access control is
-- "anyone can read/insert/update" rather than per-user RLS.
drop policy if exists "opquiz_pool_select" on opquiz_pool;
drop policy if exists "opquiz_pool_insert" on opquiz_pool;
drop policy if exists "opquiz_pool_update" on opquiz_pool;
create policy "opquiz_pool_select" on opquiz_pool for select using (true);
create policy "opquiz_pool_insert" on opquiz_pool for insert with check (true);
create policy "opquiz_pool_update" on opquiz_pool for update using (true) with check (true);
