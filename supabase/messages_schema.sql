-- ─── Direct messages — 1:1 chat between two usernames ─────────────────────
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Same access model as the rest of the app (profiles, forum_threads, follows):
-- no Supabase-Auth-based RLS, every request uses the shared anon key, so
-- access control is "anyone can read/post" rather than per-user privacy.

create table if not exists direct_messages (
  id         bigint generated always as identity primary key,
  sender     text not null,
  recipient  text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,             -- recipient's app fetched it ("Vu")
  read_at    timestamptz                -- recipient opened the thread ("Lu")
);

-- Already-deployed databases: add the column if it's missing (safe to re-run).
alter table direct_messages add column if not exists read_at timestamptz;
alter table direct_messages add column if not exists delivered_at timestamptz;

create index if not exists direct_messages_sender_idx on direct_messages(sender);
create index if not exists direct_messages_recipient_idx on direct_messages(recipient);

alter table direct_messages enable row level security;

-- drop-then-create so the whole file is safe to re-run (create policy has no
-- "if not exists" in Postgres).
drop policy if exists "direct_messages_select" on direct_messages;
drop policy if exists "direct_messages_insert" on direct_messages;
create policy "direct_messages_select" on direct_messages for select using (true);
create policy "direct_messages_insert" on direct_messages for insert with check (true);
-- Needed so the recipient can stamp delivered_at / read_at on incoming messages.
drop policy if exists "direct_messages_update" on direct_messages;
create policy "direct_messages_update" on direct_messages for update using (true) with check (true);
