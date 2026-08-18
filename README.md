# AniMood

A mood-driven anime app — moodboard, feed, search, forum, profiles, and messaging. React + Vite + Tailwind on the client, Supabase (Postgres + REST) for data, Jikan/AniList for the anime catalog.

## Run locally

No setup needed — the Supabase key already in the code is the `anon`/publishable key (safe to ship client-side by design; access control lives in RLS policies, not in keeping it secret), and the DB schema is already migrated on the shared Supabase project.

```bash
git clone -b animood-v.04 https://github.com/casval-bit/animood.git
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
- **Notifications** — unread-message badge (with count) on the ✉️ icon; a 🔔 bell for activity on posts you wrote or commented on (new comment from someone else). Both update automatically in the background — no page refresh needed.
- **Theme** — selectable light/dark appearance (Settings → 🎨 Apparence). Dark (glass/gradient) stays the default; the light theme is a softer, violet-tinted "social feed" look, not a flat white dashboard.
- **AniList import** — also pulls a public AniList account's custom (sub-)lists, filterable from Profile → Journal.

## À faire / à corriger (v0.2)

- **Moodboard — bug de reroll** : `src/api/moodboard.js` sérialise le curseur en objet (`Object.fromEntries(pool)`) au retour de `fetchMoodboardCandidates`, mais le relit avec `new Map(cursor.pool)` à l'appel suivant — `new Map(objetPlain)` lève une exception (objet non itérable). Résultat : dès le premier "🎲 Autres suggestions", l'appel échoue silencieusement (catché), les résultats sont vidés et l'écran reste bloqué sur "Aucun animé trouvé". Corrigé sur `new-features` (voir ce fichier sur cette branche), pas encore porté ici.
- **Octogone (thrills)** : le calcul a été aligné sur `new-features` (mood "thrills" traité comme les 7 autres, plus d'exclusion spéciale du calcul de dominante). Logique vérifiée unitairement, mais pas encore revue visuellement avec de vraies données de vote — à re-checker à l'œil une fois que Jikan/AniList répond.

## Database (Supabase)

Schema is already applied on the shared project. For a fresh Supabase project (or after a reset), run these in order in the SQL Editor:

| File | Adds |
|---|---|
| `supabase/forum_schema.sql` | `forum_threads`, `forum_replies` (+ `tags` column) |
| `supabase/messages_schema.sql` | `direct_messages` |
| `supabase/anilist_sub_lists.sql` | `anilist_sub_lists` column on `profiles` |

Access model: like the rest of the app, these tables use the shared `anon` key with open RLS policies ("anyone can read/insert") — not per-user privacy, consistent with `profiles`/`follows`/`user_votes`.

> `profiles.custom_lists` (manually-created lists, `{id, name, animeIds}[]`) is a separate feature living on the `main` branch — unrelated to `anilist_sub_lists` above.
