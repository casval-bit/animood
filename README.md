# 🌀 AniMood

**Discover anime that match your mood.**

AniMood is a community-driven anime platform built around emotions. Instead of browsing by genre or popularity, you pick your current mood — and AniMood finds the perfect anime for it.

> React + Vite + Tailwind · Supabase (Postgres + REST) · Jikan / AniList

---

## Features

- **Moodboard** — select up to 3 moods from 8 (Emotional, Happy, Hype, Dark, Chill, Twisted, In Love, Thrills) and get 3 personalized anime recommendations. Reroll as many times as you want.
- **Feed** — community posts with likes, comments, polls, and @mentions.
- **Search** — seasonal calendar (weekly schedule by broadcast day), studio browser, artist browser, member search.
- **Forum** — community discussions per anime, weekly thread, and 6 mini-games.
- **Mini-games**
  - Solo daily: **Anidle** (Wordle-style), **Poster** (guess the anime from its poster), **Opening Quiz** (guess the anime from its OP)
  - Multiplayer: **LinkUp** (chain anime by studio/genre, 1v1 Elo), **Timeline** (chronological ordering, 1v1 Elo), **Cluescale** (judge & jury, 2–4 players)
  - Game invitations via notification bell, private lobbies with friend invite list
  - Leaderboard per game (top 20 + your position) and global total score
- **Profile** — watch stats, mood average, pinned list, favorites, unlockable avatar frames, game scores
- **Messages** — 1:1 DMs with floating chat bubble
- **Notifications** — activity bell (replies, mentions) + game invitations (purple badge)
- **Settings** — light/dark theme, FR/EN language, display name, notification toggle

---

## Run locally

No API key needed — the `anon` Supabase key is already in the code (safe to ship client-side; access control lives in RLS policies).

```bash
git clone -b animood-v.08.04 https://github.com/casval-bit/animood.git
cd animood
npm install
npm run dev
```

Open the URL Vite prints (`http://localhost:5173`).

```bash
npm run build     # production build
npm run preview   # preview the build
npm run lint      # eslint
```

---

## Sync Scripts

Weekly and monthly scripts to keep the anime database up to date:

```bash
node --env-file=.env animood_sync.mjs --job=new-anime     # add new anime from Jikan
node --env-file=.env animood_sync.mjs --job=broadcast     # patch missing broadcast days
node --env-file=.env animood_sync.mjs --job=streaming     # fetch streaming platforms
node --env-file=.env animood_sync.mjs --job=trailers      # fetch missing trailers
node --env-file=.env animood_sync.mjs --job=new-scores    # score newly airing anime
node --env-file=.env animood_sync.mjs --job=rescore-2w    # refresh scores at 2 weeks
node --env-file=.env animood_sync.mjs --job=rescore-2m    # refresh scores at 2 months
```

Required `.env`:
```
SUPABASE_URL=https://pjkvhhxwjzpmxmhdhwcp.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
OPENROUTER_KEY=your_openrouter_key
OPENROUTER_MODEL=google/gemma-3-27b-it
```

---

## Database (Supabase)

All schemas are in `supabase/`. Run them once in the SQL Editor on a fresh project. On the shared project, most are already applied.

| File | Table(s) | Status |
|---|---|---|
| `forum_schema.sql` | `forum_threads`, `forum_replies` | ✅ Applied |
| `game_schema.sql` | `game_elo`, `game_rooms` | ✅ Applied |
| `posts_schema.sql` | `posts`, `comments` | ✅ Applied |
| `polls_schema.sql` | `polls` | ✅ Applied |
| `messages_schema.sql` | `direct_messages` | ✅ Applied |
| `blocks_schema.sql` | `user_blocks` | ✅ Applied |
| `opquiz_pool_schema.sql` | `opquiz_pool` | ✅ Applied |
| `opquiz_stats_schema.sql` | `opquiz_stats` | ✅ Applied |

Additional columns added via SQL (already applied on shared project):

```sql
-- Anime cache
alter table anime_cache add column if not exists broadcast jsonb;
alter table anime_cache add column if not exists title_en text;
alter table anime_cache add column if not exists large_image text;
alter table anime_cache add column if not exists scored_by integer;
alter table anime_cache add column if not exists streaming_platforms jsonb;
alter table anime_cache add column if not exists trailer jsonb;

-- Game Elo
alter table game_elo add column if not exists pts_wordle integer not null default 0;
alter table game_elo add column if not exists pts_poster integer not null default 0;
alter table game_elo add column if not exists pts_opquiz integer not null default 0;
alter table game_elo add column if not exists pts_cluescale integer not null default 0;
alter table game_elo add column if not exists streak_days_wordle integer not null default 0;
alter table game_elo add column if not exists streak_days_poster integer not null default 0;
alter table game_elo add column if not exists streak_days_opquiz integer not null default 0;

-- Notifications
alter table notifications add column if not exists payload jsonb;

-- Game rooms
alter table game_rooms add column if not exists player3 text;
alter table game_rooms add column if not exists player4 text;

-- Sync log (for score refresh tracking)
create table if not exists anime_sync_log (
  mal_id bigint primary key,
  first_fetch_at timestamptz not null default now(),
  rescored_2w boolean not null default false,
  rescored_2m boolean not null default false
);
```

Access model: shared `anon` key with open RLS policies (read/insert/update/delete) — consistent with the rest of the app.

---

## Avatar Frames

Unlockable decorative borders across 5 tracks:

| Track | Unlock condition |
|---|---|
| Followers | 10 / 50 / 250 followers |
| Watched | 50 / 500 / 1000 anime watched |
| Games | 100 / 500 / 2000 / 5000 total game points |
| Genre | 100 anime watched in a specific genre |
| Contribution | 10 / 100 / 1000 mood points assigned |
| Special | Founding member |

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | Supabase (Postgres, REST, Realtime) |
| Anime data | AniList GraphQL (primary), Jikan REST (broadcast/trailers) |
| AI moods | OpenRouter (google/gemma-3-27b-it) |
| Auth | Supabase Auth (Google OAuth) |

---

## Branch History

| Branch | Description |
|---|---|
| `animood-v.08.04` | Current — invitations, leaderboard, seasonal calendar, studio modal, game panel, sync scripts |
| `animood-v.08.02` | Friend's parallel branch — calcChainElo, calcTimelineElo, AnimeThemes openings |
| `animood-v.07.02` | OP Quiz, merged from v.05.03 features |
| `animood-v.07` | Forum likes, polls, profile sync, Elo matchmaking improvements |
| `animood-v.06` | Mini-games, profile frames, settings redesign |
| `animood-v.05` | Initial public version |

---

© 2026 AniMood — Made with 💜 for anime fans
