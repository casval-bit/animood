-- ─── Quiz OP — difficulté auto-apprenante (stats communauté + par joueur) ───
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
--
-- opquiz_stats: one row per opening ever played, community-wide. difficulty_score
-- is a generated column (0 = everyone gets it right, 1 = everyone misses it) so
-- the game can re-bucket easy/medium/hard from real answers instead of trusting
-- the hand-picked tag in animeOpenings.js / opquiz_pool.difficulty forever.
-- Openings with too few attempts fall back to that hand-picked tag client-side
-- (see src/utils/opquizStats.js, OPQUIZ_MIN_ATTEMPTS_FOR_TRUST) so one early
-- lucky/unlucky guess can't flip a tag permanently.
--
-- opquiz_user_stats: per-player memory of which openings they've seen and how
-- they did on each — drives the "you've already seen this N times, Y% right"
-- reveal copy and the adaptive round picker (misses get weighted higher than
-- never-seen, never-seen higher than mastered, so players keep getting
-- challenged instead of replaying openings they already know).

create table if not exists opquiz_stats (
  mal_id            bigint primary key,
  total_attempts    integer not null default 0,
  correct_count     integer not null default 0,
  total_response_ms bigint not null default 0,
  difficulty_score  double precision generated always as (
    case when total_attempts = 0 then 0.5
         else 1.0 - (correct_count::float8 / total_attempts)
    end
  ) stored,
  updated_at        timestamptz not null default now()
);

create table if not exists opquiz_user_stats (
  username  text not null,
  mal_id    bigint not null,
  attempts  integer not null default 0,
  correct   integer not null default 0,
  last_seen timestamptz not null default now(),
  primary key (username, mal_id)
);

create index if not exists opquiz_user_stats_username_idx on opquiz_user_stats(username);

alter table opquiz_stats enable row level security;
alter table opquiz_user_stats enable row level security;

-- Same open-access model as the rest of the app (see README → Database):
-- shared anon key, no Supabase Auth session, so access control is
-- "anyone can read/insert/update" rather than per-user RLS.
drop policy if exists "opquiz_stats_select" on opquiz_stats;
drop policy if exists "opquiz_stats_insert" on opquiz_stats;
drop policy if exists "opquiz_stats_update" on opquiz_stats;
create policy "opquiz_stats_select" on opquiz_stats for select using (true);
create policy "opquiz_stats_insert" on opquiz_stats for insert with check (true);
create policy "opquiz_stats_update" on opquiz_stats for update using (true) with check (true);

drop policy if exists "opquiz_user_stats_select" on opquiz_user_stats;
drop policy if exists "opquiz_user_stats_insert" on opquiz_user_stats;
drop policy if exists "opquiz_user_stats_update" on opquiz_user_stats;
create policy "opquiz_user_stats_select" on opquiz_user_stats for select using (true);
create policy "opquiz_user_stats_insert" on opquiz_user_stats for insert with check (true);
create policy "opquiz_user_stats_update" on opquiz_user_stats for update using (true) with check (true);
