-- ─── Mini-games — solo (Wordle/Poster) + 1v1 matchmaking (Chain/Timeline) ───
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
--
-- game_elo and game_rooms were created directly on the shared Supabase project
-- when the mini-games first shipped, with no tracked schema file — this file
-- fills that gap. On the shared project both tables already exist, so the
-- `create table if not exists` statements below are no-ops there; the
-- `alter table add column if not exists` ones are what actually need to run,
-- since streak_wordle/last_wordle_date/streak_poster/last_poster_date are new
-- in v.07 (ported from animood-v.05.03) and don't exist yet on the shared
-- table. On a fresh project, both CREATE TABLEs run for real and this file is
-- self-contained.

create table if not exists game_elo (
  username         text primary key,
  elo_chain        integer not null default 400,
  elo_timeline     integer not null default 400,
  points_total     integer not null default 0,
  -- New in v.07 — solo Wordle/Poster points + daily streak tracking.
  -- last_*_date is stored as a "YYYY-MM-DD" string (see src/utils/awardSoloPoints.js).
  streak_wordle    integer not null default 0,
  last_wordle_date text,
  streak_poster    integer not null default 0,
  last_poster_date text,
  updated_at       timestamptz not null default now()
);

-- Existing installs (the shared project): add the v.07 columns if missing.
alter table game_elo add column if not exists streak_wordle    integer not null default 0;
alter table game_elo add column if not exists last_wordle_date text;
alter table game_elo add column if not exists streak_poster    integer not null default 0;
alter table game_elo add column if not exists last_poster_date text;

create table if not exists game_rooms (
  id           bigint generated always as identity primary key,
  game_type    text not null,               -- 'chain' | 'timeline'
  player1      text not null,
  player2      text,
  elo1         integer not null default 400,
  elo2         integer,
  status       text not null default 'waiting', -- 'waiting' | 'active' | 'finished'
  state        jsonb not null default '{}',  -- full in-progress game state (chain/timeline)
  ranked       boolean not null default true,
  private_code text,                          -- set only for a private (unranked) room
  winner       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists game_rooms_matchmaking_idx
  on game_rooms(game_type, status) where private_code is null;
create index if not exists game_rooms_private_code_idx
  on game_rooms(private_code) where private_code is not null;

alter table game_elo enable row level security;
alter table game_rooms enable row level security;

-- Same open-access model as the rest of the app (see README → Database):
-- shared anon key, no Supabase Auth session, so access control is
-- "anyone can read/insert/update" rather than per-user RLS.
-- create policy has no "if not exists" in Postgres, so drop-then-create makes
-- this block safe to re-run — and safe against the shared project already
-- having equivalent policies under different names from before this file existed.
drop policy if exists "game_elo_select" on game_elo;
drop policy if exists "game_elo_insert" on game_elo;
drop policy if exists "game_elo_update" on game_elo;
create policy "game_elo_select" on game_elo for select using (true);
create policy "game_elo_insert" on game_elo for insert with check (true);
create policy "game_elo_update" on game_elo for update using (true) with check (true);

drop policy if exists "game_rooms_select" on game_rooms;
drop policy if exists "game_rooms_insert" on game_rooms;
drop policy if exists "game_rooms_update" on game_rooms;
drop policy if exists "game_rooms_delete" on game_rooms;
create policy "game_rooms_select" on game_rooms for select using (true);
create policy "game_rooms_insert" on game_rooms for insert with check (true);
create policy "game_rooms_update" on game_rooms for update using (true) with check (true);
create policy "game_rooms_delete" on game_rooms for delete using (true);
