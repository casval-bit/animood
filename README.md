# AniMood

A mood-driven anime app — moodboard, feed, search, forum, profiles, and messaging. React + Vite + Tailwind on the client, Supabase (Postgres + REST) for data, Jikan/AniList for the anime catalog.

## Run locally

No setup needed — the Supabase key already in the code is the `anon`/publishable key (safe to ship client-side by design; access control lives in RLS policies, not in keeping it secret), and the DB schema is already migrated on the shared Supabase project.

```bash
git clone -b animood-v.04.01 https://github.com/casval-bit/animood.git
cd animood
npm install
npm run dev
```

Open the URL Vite prints (`http://localhost:5173`).

Other commands:

```bash
npm run build     # production build
npm run preview   # preview the build
npm run lint      # eslint across the project
```

## What's on this branch

- **Forum** — "Community mood" card is now an octagon radar (instead of bars), moved into a sticky right sidebar instead of sitting full-width at the top; threads can be tagged (Discussion / Question / Theory / Recommendation / Spoiler / Rant) and can include an image. Unread-reply badge per thread.
- **Messages** — 1:1 chat between members ("Messages" tab + "💬 Message" button on any profile), plus a floating chat bubble available from any page, and a "✏️ Nouveau" button to start a conversation without going through a profile first.
- **Mentions** — `@username` in Feed posts/comments and Forum threads/replies: autocompletes while typing, renders as a clickable link to that member's profile.
- **Notifications** — unread-message badge (with count) on the ✉️ icon; a 🔔 bell for activity (new comments on Feed posts *and* new replies on Forum threads you wrote or took part in). The bell and Forum's per-thread unread badge read from the same feed, so they never disagree. Both update automatically in the background — no page refresh needed.
- **Theme** — selectable light/dark appearance (Settings → 🎨 Apparence). Dark (glass/gradient) stays the default; the light theme is a softer, violet-tinted "social feed" look, not a flat white dashboard.
- **AniList import** — also pulls a public AniList account's custom (sub-)lists, filterable from Profile → Journal. Re-run the same import anytime (same username, now with a clearly labeled field and a "🔄 Réimporter" button) to resync after updating your list on AniList.

## À faire / à corriger (v0.2)

- **Importation de base de données anilist ()** .

## Database (Supabase)

Schema is already applied on the shared project. For a fresh Supabase project (or after a reset), run these in order in the SQL Editor:

| File | Adds |
|---|---|
| `supabase/forum_schema.sql` | `forum_threads`, `forum_replies` (+ `tags` column) |
| `supabase/messages_schema.sql` | `direct_messages` |
| `supabase/anilist_sub_lists.sql` | `anilist_sub_lists` column on `profiles` |

Access model: like the rest of the app, these tables use the shared `anon` key with open RLS policies ("anyone can read/insert") — not per-user privacy, consistent with `profiles`/`follows`/`user_votes`.

> `profiles.custom_lists` (manually-created lists, `{id, name, animeIds}[]`) is a separate feature living on the `main` branch — unrelated to `anilist_sub_lists` above.
