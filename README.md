# AniMood

A mood-driven anime app — moodboard, feed, search, forum, profiles, and messaging. React + Vite + Tailwind on the client, Supabase (Postgres + REST) for data, Jikan/AniList for the anime catalog.

## Run locally

No setup needed — the Supabase key already in the code is the `anon`/publishable key (safe to ship client-side by design; access control lives in RLS policies, not in keeping it secret), and the DB schema is already migrated on the shared Supabase project.

```bash
git clone -b animood-v.07 https://github.com/casval-bit/animood.git
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

- **Forum** — "Community mood" card is now an octagon radar (instead of bars), moved into a sticky right sidebar instead of sitting full-width at the top; threads can be tagged (Discussion / Question / Theory / Recommendation / Spoiler / Rant) and can include an image. Unread-reply badge per thread. Thread rows, thread detail, and replies now show the poster's real profile photo and display name next to `@username`.
- **Messages** — 1:1 chat between members ("Messages" tab + "💬 Message" button on any profile), plus a floating chat bubble available from any page, and a "✏️ Nouveau" button to start a conversation without going through a profile first. Conversation list, chat header, and the new-message search all show the other person's real profile photo and display name, not just their `@handle`.
- **Mini-jeux** (Forum → 🎮 Mini-jeux du jour) — two solo daily games (Wordle Animé, Poster Mystère) plus two 1v1 multiplayer games (Chaîne Animé, Timeline) with matchmaking or a private room code, and a per-player ELO/points ranking (`game_elo`) that also feeds the profile frames below.
- **Cadres de profil** — unlockable decorative avatar borders across 5 tracks (abonnés, contribution aux moods, animés vus, genre préféré, jeux). Settings → Profil shows every frame, locked ones greyed out with a 🔒 and the unlock condition, and lets you pick your active one.
- **Profils enrichis** — your own profile and any member's profile modal now share the same depth: watch/rating stats, mood average, pinned list, favorites and highlights, with Journal / Listes tabs on both.
- **Réglages** — reorganized into tabs (Préférences / Profil / Données / Compte); light/dark theme toggle, FR/EN language switch, an editable display name, and a delete-account placeholder.
- **Traduction FR/EN complète** — the language switch (Settings → Préférences) now actually translates the whole app: every view, modal, and component (Feed, Forum, Moodboard, Search, Profile, Messages, chat bubble, mini-games, anime/person/studio modals, statuses, filters, forum tags, profile frame names, notifications) — not just the setting itself.
- **Bloquer un utilisateur** — block/unblock from any profile; hides a blocked member's posts, threads and replies, blocks DMs both ways, and excludes them from mentions and search. Tucked into a discreet "⋯" menu on the profile (not a big red button next to Follow/Message) since it's rarely the first thing you want to do there. Manage the full list from Settings → Compte.
- **Mentions** — `@username` in Feed posts/comments and Forum threads/replies: autocompletes while typing, renders as a clickable link to that member's profile, and notifies the mentioned member (see Notifications below) even on a post/thread they haven't posted or commented on themselves.
- **Notifications** — unread-message badge (with count) on the ✉️ icon; a 🔔 bell for activity (new comments on Feed posts and new replies on Forum threads you wrote or took part in, *plus* any post/comment/thread/reply where someone `@mentions` you). The bell and Forum's per-thread unread badge read from the same feed, so they never disagree. Both update automatically in the background — no page refresh needed.
- **Theme** — selectable light/dark appearance (Settings → 🎨 Apparence). Dark (glass/gradient) stays the default; the light theme is a softer, violet-tinted "social feed" look, not a flat white dashboard.
- **AniList import** — also pulls a public AniList account's custom (sub-)lists, filterable from Profile → Journal. Re-run the same import anytime (same username, now with a clearly labeled field and a "🔄 Réimporter" button) to resync after updating your list on AniList.

## v.06.01 — en comparaison avec v.06

- **Traduction FR/EN complète** — la bascule de langue existait déjà en Réglages depuis `animood-v.06` mais ne traduisait que ce réglage lui-même ; le reste de l'app restait en français quel que soit le choix. Le switch FR/EN traduit maintenant réellement toute l'interface : Feed, Forum (tags, badge non-lu), Moodboard, Recherche (filtres durée/type/pays), Profils, Messages/bulle de chat, Mini-jeux, modales Anime/Personne/Studio (y compris les blurbs de studio), statuts de visionnage, et le nom/la description des cadres de profil.
- **Fix** — un message, commentaire ou mention d'un utilisateur bloqué pouvait quand même faire apparaître un badge "non lu" sur les Messages ou une entrée dans la cloche 🔔 d'activité, alors que le blocage le masque déjà des listes (Feed/Forum/Recherche/DMs). Les deux flux excluent désormais aussi les utilisateurs bloqués.

## v.06 — en comparaison avec v.05

Tout ce qui suit est nouveau depuis la dernière version documentée (`animood-v.05`) :

- **Mini-jeux + classement ELO**, **cadres de profil déblocables**, **profils (soi et amis) enrichis** (stats, mood moyen, listes) et une refonte des **Réglages** (thème, langue, nom modifiable) — développés sur `animood-v.05.01`, jamais documentés ici jusqu'à présent.
- **Blocage d'utilisateur** — nouvelle fonctionnalité complète (profil, DMs, mentions, recherche, gestion en Réglages), avec le bouton volontairement discret plutôt qu'au même niveau que Suivre/Message.
- **Photo de profil + nom modifiable partout** — le fil, le forum et les messages affichent désormais la vraie photo et le nom d'affichage (pas juste `@handle`) à côté de l'auteur, avec les mêmes données en direct depuis `profiles` : renommer son compte dans Réglages met donc à jour l'affichage partout, sans rien recharger. Le nom d'un post dans le fil est aussi cliquable → ouvre le profil (avant, seules les mentions dans le texte l'étaient).
- **Fix** — la page de profil affichait `@{nom modifiable en minuscules}` comme handle au lieu du vrai `@username` ; un changement de nom pouvait donc casser ton propre lien de profil. Corrigé pour utiliser le vrai username.

## Database (Supabase)

Schema is already applied on the shared project. For a fresh Supabase project (or after a reset), run these in order in the SQL Editor:

| File | Adds |
|---|---|
| `supabase/forum_schema.sql` | `forum_threads`, `forum_replies` (+ `tags` column) |
| `supabase/messages_schema.sql` | `direct_messages` |
| `supabase/anilist_sub_lists.sql` | `anilist_sub_lists` column on `profiles` |
| `supabase/blocks_schema.sql` | `user_blocks` (one-directional user blocking) |

Access model: like the rest of the app, these tables use the shared `anon` key with open RLS policies ("anyone can read/insert") — not per-user privacy, consistent with `profiles`/`follows`/`user_votes`.

> `profiles.custom_lists` (manually-created lists, `{id, name, animeIds}[]`) is a separate feature living on the `main` branch — unrelated to `anilist_sub_lists` above.
>
> The mini-games (`game_elo`, `game_rooms`) were created directly on the shared Supabase project and don't have a tracked schema file yet — on a fresh project, the games will fail silently (caught errors) until those two tables are added by hand.
