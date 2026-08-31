-- ─── Forum skeleton — threads + replies ────────────────────────────────────
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- No edit/delete, no pagination — matches the "squelette" scope. Likes are the
-- one interaction on top, kept in sync with how posts/comments likes work.

create table if not exists forum_threads (
  id         bigint generated always as identity primary key,
  username   text not null,
  title      text not null,
  body       text not null,
  tags       text[] not null default '{}',
  image_url  text,
  likes      text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Existing installs: add the column if the table predates tag/image/like support.
alter table forum_threads add column if not exists tags text[] not null default '{}';
alter table forum_threads add column if not exists image_url text;
alter table forum_threads add column if not exists likes text[] not null default '{}';

create table if not exists forum_replies (
  id         bigint generated always as identity primary key,
  thread_id  bigint not null references forum_threads(id) on delete cascade,
  username   text not null,
  body       text not null,
  likes      text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Existing installs: add the column if the table predates like support.
alter table forum_replies add column if not exists likes text[] not null default '{}';

create index if not exists forum_replies_thread_id_idx on forum_replies(thread_id);

alter table forum_threads enable row level security;
alter table forum_replies enable row level security;

-- Matches the rest of the app: no Supabase Auth session, every request uses the
-- shared anon key, so access control is "anyone can read/post/like" (same model
-- as profiles, user_votes, mood_community_votes).
create policy "forum_threads_select" on forum_threads for select using (true);
create policy "forum_threads_insert" on forum_threads for insert with check (true);
create policy "forum_threads_update" on forum_threads for update using (true) with check (true);

create policy "forum_replies_select" on forum_replies for select using (true);
create policy "forum_replies_insert" on forum_replies for insert with check (true);
create policy "forum_replies_update" on forum_replies for update using (true) with check (true);
