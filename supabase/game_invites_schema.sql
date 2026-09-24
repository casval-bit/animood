-- ─── Game invites — invite a follower/following straight into a private
-- LinkUp / Timeline / Cluescale room, surfaced in the header notification bell
-- with Join/Decline actions ─────────────────────────────────────────────────
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
--
-- A dedicated table (rather than a generic polymorphic "notifications" table)
-- to match this project's existing convention of one small table per feature
-- (forum_threads, direct_messages, user_blocks, game_rooms…) — see README →
-- Database. The FK to game_rooms means an invite is cleaned up for free once
-- its room is deleted (see game_rooms_delete in game_schema.sql), instead of
-- needing separate cleanup logic.

create table if not exists game_invites (
  id           bigint generated always as identity primary key,
  from_user    text not null,
  to_user      text not null,
  game_type    text not null,                -- 'chain' | 'timeline' | 'cluescale'
  room_id      uuid not null references game_rooms(id) on delete cascade, -- game_rooms.id is a uuid
  private_code text,
  status       text not null default 'pending', -- 'pending' | 'accepted' | 'declined'
  created_at   timestamptz not null default now()
);

-- Partial index: the only query pattern that matters is "my pending invites",
-- polled every 10s from the header bell (see AppProvider.jsx).
create index if not exists game_invites_to_user_pending_idx
  on game_invites(to_user, created_at desc) where status = 'pending';

alter table game_invites enable row level security;

-- Same open-access model as the rest of the app (see README → Database):
-- shared anon key, no Supabase Auth session, so access control is
-- "anyone can read/insert/update/delete" rather than per-user RLS.
-- create policy has no "if not exists" in Postgres, so drop-then-create makes
-- this block safe to re-run.
drop policy if exists "game_invites_select" on game_invites;
drop policy if exists "game_invites_insert" on game_invites;
drop policy if exists "game_invites_update" on game_invites;
drop policy if exists "game_invites_delete" on game_invites;
create policy "game_invites_select" on game_invites for select using (true);
create policy "game_invites_insert" on game_invites for insert with check (true);
create policy "game_invites_update" on game_invites for update using (true) with check (true);
create policy "game_invites_delete" on game_invites for delete using (true);
