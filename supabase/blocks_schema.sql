-- ─── User blocks — one-directional "I don't want to see this person" ──────
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Same access model as the rest of the app (profiles, follows, direct_messages):
-- no Supabase-Auth-based RLS, every request uses the shared anon key.

create table if not exists user_blocks (
  id         bigint generated always as identity primary key,
  blocker    text not null,
  blocked    text not null,
  created_at timestamptz not null default now(),
  unique (blocker, blocked)
);

create index if not exists user_blocks_blocker_idx on user_blocks(blocker);
create index if not exists user_blocks_blocked_idx on user_blocks(blocked);

alter table user_blocks enable row level security;

create policy "user_blocks_select" on user_blocks for select using (true);
create policy "user_blocks_insert" on user_blocks for insert with check (true);
create policy "user_blocks_delete" on user_blocks for delete using (true);
