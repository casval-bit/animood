-- ─── ANIMOOD — SUPABASE SETUP ────────────────────────────────────────────────
-- Colle ce fichier entier dans Supabase → SQL Editor → New query → Run

-- ── 1. TABLE PROFILES ────────────────────────────────────────────────────────
create table if not exists profiles (
  username        text primary key,
  name            text,
  avatar          text,
  watched         jsonb default '[]',
  statuses        jsonb default '{}',
  ratings         jsonb default '{}',
  favorites       jsonb default '[null,null,null,null,null]',
  hidden_completed jsonb default '[]',
  posts           jsonb default '[]',
  updated_at      timestamptz default now()
);

-- ── 2. TABLE MOOD_PTS ────────────────────────────────────────────────────────
create table if not exists mood_pts (
  mal_id      integer primary key,
  feelgood    integer default 0,
  emotional   integer default 0,
  hype        integer default 0,
  dark        integer default 0,
  chill       integer default 0,
  twisted     integer default 0,
  comedy      integer default 0,
  wholesome   integer default 0,
  epic        integer default 0,
  total_votes integer default 0,
  updated_at  timestamptz default now()
);

-- ── 3. TABLE USER_VOTES ───────────────────────────────────────────────────────
create table if not exists user_votes (
  id          bigserial primary key,
  username    text references profiles(username) on delete cascade,
  mal_id      integer,
  moods       jsonb default '[]',
  pts_added   jsonb default '{}',
  voted_at    timestamptz default now(),
  unique(username, mal_id)
);

-- ── 4. ROW LEVEL SECURITY ─────────────────────────────────────────────────────
-- Profiles: chaque user lit/écrit uniquement le sien
alter table profiles enable row level security;
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (true);
create policy "profiles_update" on profiles for update using (true);

-- Mood pts: tout le monde peut lire, écrire via anon key
alter table mood_pts enable row level security;
create policy "moodpts_select" on mood_pts for select using (true);
create policy "moodpts_insert" on mood_pts for insert with check (true);
create policy "moodpts_update" on mood_pts for update using (true);

-- User votes: lecture publique, écriture libre
alter table user_votes enable row level security;
create policy "votes_select" on user_votes for select using (true);
create policy "votes_insert" on user_votes for insert with check (true);
create policy "votes_update" on user_votes for update using (true);

-- ── 5. INDEX POUR PERFORMANCES ───────────────────────────────────────────────
create index if not exists idx_user_votes_username on user_votes(username);
create index if not exists idx_user_votes_mal_id   on user_votes(mal_id);
create index if not exists idx_mood_pts_mal_id     on mood_pts(mal_id);

-- ── 6. FONCTION updated_at AUTO ──────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger trg_profiles_updated
  before update on profiles
  for each row execute function update_updated_at();

create trigger trg_moodpts_updated
  before update on mood_pts
  for each row execute function update_updated_at();
