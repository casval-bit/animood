-- ─── Feed — posts + comments ────────────────────────────────────────────────
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
--
-- posts and comments already exist on the shared project (created directly,
-- no tracked schema file until now — same situation game_elo/game_rooms were
-- in before game_schema.sql). The `create table if not exists` blocks below
-- are no-ops there and only matter for a fresh project.
--
-- What actually needs to run on the shared project: the policies at the
-- bottom. Likes on posts/comments (❤️/🤍 + count, toggled via a PATCH to the
-- `likes` column) silently fail to persist — the button flips locally but
-- reverts on reload — because these tables were only ever given SELECT/INSERT
-- (and, for delete, DELETE) policies, never an UPDATE one.

create table if not exists posts (
  id                 bigint generated always as identity primary key,
  username           text not null,
  content            text not null,
  spoiler            boolean not null default false,
  anime_id           integer,
  anime_title        text,
  anime_image        text,
  anime_season       text,
  anime_season_label text,
  anime_genres       jsonb not null default '[]',
  image_url          text,
  comment_count      integer not null default 0,
  likes              text[] not null default '{}',
  created_at         timestamptz not null default now()
);

create table if not exists comments (
  id         bigint generated always as identity primary key,
  post_id    bigint not null references posts(id) on delete cascade,
  username   text not null,
  content    text not null,
  likes      text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists comments_post_id_idx on comments(post_id);

alter table posts enable row level security;
alter table comments enable row level security;

-- Same open-access model as the rest of the app (see README → Database):
-- shared anon key, no Supabase Auth session, so access control is
-- "anyone can read/insert/update/delete" rather than per-user RLS.
-- create policy has no "if not exists" in Postgres, so drop-then-create makes
-- this block safe to re-run, and safe even if the shared project already had
-- equivalent policies under different names.
drop policy if exists "posts_select" on posts;
drop policy if exists "posts_insert" on posts;
drop policy if exists "posts_update" on posts;
drop policy if exists "posts_delete" on posts;
create policy "posts_select" on posts for select using (true);
create policy "posts_insert" on posts for insert with check (true);
create policy "posts_update" on posts for update using (true) with check (true);
create policy "posts_delete" on posts for delete using (true);

drop policy if exists "comments_select" on comments;
drop policy if exists "comments_insert" on comments;
drop policy if exists "comments_update" on comments;
drop policy if exists "comments_delete" on comments;
create policy "comments_select" on comments for select using (true);
create policy "comments_insert" on comments for insert with check (true);
create policy "comments_update" on comments for update using (true) with check (true);
create policy "comments_delete" on comments for delete using (true);
