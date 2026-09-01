-- ─── Polls — attached to a Feed post OR a Forum thread ─────────────────────
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- New in v.07 (ported from animood-v.05.03) — this table never had a tracked
-- schema, on either branch, until now.
--
-- A poll row belongs to exactly one of post_id / thread_id (never both, never
-- neither) — enforced with a check constraint rather than two separate tables,
-- since a poll is otherwise identical in both places (options + votes).
--
-- `options` shape: [{ id: "1", text: "...", votes: ["alice","bob"] }, ...]
-- Votes are usernames appended/removed client-side, then the whole array is
-- PATCHed back — same "read, mutate in JS, write back" pattern as posts.likes.

create table if not exists polls (
  id         bigint generated always as identity primary key,
  -- No FK on post_id: the `posts` table isn't tracked by any schema file in
  -- this repo (created directly on the shared project, like game_elo/game_rooms
  -- — see README → Database), so its exact id type isn't guaranteed here.
  post_id    bigint,
  thread_id  bigint references forum_threads(id) on delete cascade,
  options    jsonb not null default '[]',
  multi      boolean not null default false,
  created_at timestamptz not null default now(),
  constraint polls_exactly_one_parent check (
    (post_id is not null and thread_id is null) or
    (post_id is null and thread_id is not null)
  )
);

create index if not exists polls_post_id_idx on polls(post_id);
create index if not exists polls_thread_id_idx on polls(thread_id);

alter table polls enable row level security;

-- Same open-access model as the rest of the app (see README → Database):
-- shared anon key, no Supabase Auth session, so access control is
-- "anyone can read/insert/update" rather than per-user RLS.
-- create policy has no "if not exists" in Postgres, so drop-then-create makes
-- this block safe to re-run.
drop policy if exists "polls_select" on polls;
drop policy if exists "polls_insert" on polls;
drop policy if exists "polls_update" on polls;
create policy "polls_select" on polls for select using (true);
create policy "polls_insert" on polls for insert with check (true);
create policy "polls_update" on polls for update using (true) with check (true);
