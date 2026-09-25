# AniMood

A mood-driven anime app — moodboard, feed, search, forum, profiles, and messaging. React + Vite + Tailwind on the client, Supabase (Postgres + REST) for data, Jikan/AniList for the anime catalog.

## Run locally

No setup needed — the Supabase key already in the code is the `anon`/publishable key (safe to ship client-side by design; access control lives in RLS policies, not in keeping it secret), and the DB schema is already migrated on the shared Supabase project.

```bash
git clone -b animood-v.10.02 https://github.com/casval-bit/animood.git
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

- **Forum** — "Community mood" card is now an octagon radar (instead of bars), moved into a sticky right sidebar instead of sitting full-width at the top; threads can be tagged (Discussion / Question / Theory / Recommendation / Spoiler / Rant) and can include an image. Unread-reply badge per thread. Thread rows, thread detail, and replies now show the poster's real profile photo and display name next to `@username`. Threads and replies can be liked (❤️/🤍 + count), same as Feed posts.
- **Sondages** — attach a poll (2 to 6 options, single or multiple choice) to a Feed post or a Forum thread when creating it; live vote with percentage bars once you've voted.
- **Messages** — 1:1 chat between members ("Messages" tab + "💬 Message" button on any profile), plus a floating chat bubble available from any page, and a "✏️ Nouveau" button to start a conversation without going through a profile first. Conversation list, chat header, and the new-message search all show the other person's real profile photo and display name, not just their `@handle`. Read receipts in three stages under your last sent bubble (and in the conversation list): "Envoyé ✓" → "Vu ✓✓" once the message reaches the recipient's app (background poll, thread not opened yet) → "Lu à 14:32 ✓✓" (blue) once they open the thread — backed by server-side `delivered_at`/`read_at` columns on `direct_messages` instead of a per-device `localStorage` timestamp — so the unread badge and the seen tick agree across devices.
- **Mini-jeux** (Forum → 🎮 Mini-jeux du jour) — three solo daily games (Wordle Animé, Poster Mystère, OP Quiz — pick a difficulty, then guess the anime from its opening theme, all three awarding points on a win, once per day per game) plus three 1v1/multijoueur games (Chaîne Animé, Timeline, Cluescale — devine un score 1-20 à partir d'un indice donné par le juge, 2 à 4 joueurs) with matchmaking (Elo range widens the longer you wait) or a private room code. Each game button shows your own score for that game, and an inline top-20 leaderboard (medals, followed friends highlighted, your rank shown separately if you're outside the top 20) ranked on `game_elo.points_total`, which also feeds the profile frames below. Chaîne et Timeline se jouent aussi **vs IA** (facile/moyen/difficile) sans passer par le matchmaking. Le matchmaking nettoie désormais les rooms "waiting" abandonnées (parties fantômes) avant d'en recréer une, et rafraîchit la sienne en arrière-plan tant qu'elle attend un adversaire. OP Quiz's daily picks are now adaptive: openings you tend to miss come back weighted higher, ones you've mastered fade toward a small floor instead of disappearing, and the difficulty tag itself re-buckets from real community answers once an opening has enough attempts.
- **Discussions par animé** — chaque fiche animé a sa propre section "💬 Discussions" (sujets de forum liés à cet animé, créés et consultés sans quitter la fiche) ; les animés de la saison en cours dans le Forum pointent vers la même liste de discussions.
- **Recherche** — barre de recherche pleine largeur en tête de page, onglets Animé / Saison / Studio / Artiste / Membres en dessous ; la requête est conservée quand on change d'onglet ou de filtre.
- **Calendrier de la saison** (Recherche → onglet 📅 Saison) — vue **Jour** (sélecteur de jour + grandes cartes triées par heure, pensée pour mobile) ou **Semaine** (tableau Lundi → Dimanche), choix mémorisé. Jours et heures convertis de l'heure japonaise (JST) vers le fuseau du visiteur ; filtre "Mon calendrier" (tes animés en cours/à voir + les suites des séries que tu as vues).
- **Invitations de jeu** — depuis une room privée LinkUp / Timeline / Cluescale, invite directement un abonné/abonnement ; l'invitation arrive dans la cloche 🔔 avec Rejoindre / Refuser.
- **Cadres de profil** — unlockable decorative avatar borders across 5 tracks (abonnés, contribution aux moods, animés vus, genre préféré, jeux). Settings → Profil shows every frame, locked ones greyed out with a 🔒 and the unlock condition, and lets you pick your active one.
- **Badges de profil** — same idea as profile frames (unlock tracks: anime watched, followers, mood contributions, etc.), shown as a pill in the profile's stats row with a picker for the active one.
- **PWA** — installable (manifest + service worker + icons); the browser/device back button closes modals and returns to the previous tab instead of leaving the app.
- **Profils enrichis** — your own profile and any member's profile modal now share the same depth: watch/rating stats, mood average, pinned list, favorites and highlights, with Journal / Listes tabs on both. "Mes Posts" is fully interactive (like, comment, delete inline — not just a read-only recap) and stays live-synced with the Feed: liking or deleting a post in one place updates it instantly in the other. Any member's profile modal also shows your **abonnés en commun** ("👥 N abonnés en commun") when you have any — click one to jump straight to their profile.
- **Modération de contenu** — Feed posts, comments, and poll options are checked against a banned-word list (`src/constants/bannedWords.js`) before posting; a match blocks the post with an inline error instead of publishing it.
- **Confidentialité du profil** — Settings → Profil lets you set who can view your profile: everyone, friends only (mutual follow), or a hand-picked list of members (search-and-add picker). A profile you can't view shows a locked "🔒" placeholder instead of its banner/stats/lists. Follower/following counts on any profile (yours or someone else's) are now clickable and open a scrollable list of usernames.
- **Footer** — every page now ends with a footer (AniMood name/tagline, copyright) plus "Mentions légales" / "Confidentialité" links opening placeholder legal pages — content to fill in before a real public launch.
- **Réglages** — reorganized into tabs (Préférences / Profil / Données / Compte); light/dark theme toggle, FR/EN language switch, an editable display name, and a delete-account placeholder.
- **Traduction FR/EN complète** — the language switch (Settings → Préférences) now actually translates the whole app: every view, modal, and component (Feed, Forum, Moodboard, Search, Profile, Messages, chat bubble, mini-games, anime/person/studio modals, statuses, filters, forum tags, profile frame names, notifications) — not just the setting itself.
- **Bloquer un utilisateur** — block/unblock from any profile; hides a blocked member's posts, threads and replies, blocks DMs both ways, and excludes them from mentions and search. Tucked into a discreet "⋯" menu on the profile (not a big red button next to Follow/Message) since it's rarely the first thing you want to do there. Manage the full list from Settings → Compte.
- **Mentions** — `@username` in Feed posts/comments and Forum threads/replies: autocompletes while typing, renders as a clickable link to that member's profile, and notifies the mentioned member (see Notifications below) even on a post/thread they haven't posted or commented on themselves.
- **Notifications** — unread-message badge (with count) on the ✉️ icon; a 🔔 bell for activity (new comments on Feed posts and new replies on Forum threads you wrote or took part in, *plus* any post/comment/thread/reply where someone `@mentions` you). The bell and Forum's per-thread unread badge read from the same feed, so they never disagree. Both update automatically in the background — no page refresh needed.
- **Theme** — selectable light/dark appearance (Settings → 🎨 Apparence). Dark (glass/gradient) stays the default; the light theme is a softer, violet-tinted "social feed" look, not a flat white dashboard.
- **AniList import** — also pulls a public AniList account's custom (sub-)lists, filterable from Profile → Journal. Re-run the same import anytime (same username, now with a clearly labeled field and a "🔄 Réimporter" button) to resync after updating your list on AniList.

## v.10.02 — en comparaison avec v.10.00

- **Accusés de réception en 3 étapes** (v.10.01) — "Envoyé ✓" → "Vu ✓✓" (le message est arrivé dans l'app du destinataire, colonne `delivered_at`) → "Lu à 14:32 ✓✓" (fil ouvert, `read_at`). Nécessite de relancer `supabase/messages_schema.sql`.
- **Nouveau logo** (v.10.01) — logo PNG dans le header, le footer et l'écran de chargement ; favicon et icônes PWA en PNG (cache du service worker passé en `animood-v3`). Retrait des stats non fondées du Moodboard ("12 000 animes", "98 % de satisfaction").
- **Page Recherche réorganisée** — barre de recherche pleine largeur en tête, onglets dessous ; le calendrier quitte l'onglet Animé pour un onglet 📅 Saison dédié (taper une recherche depuis Saison bascule sur les résultats Animé). La requête survit au changement d'onglet/de filtre, et une réponse lente ne peut plus écraser une recherche plus récente. Onglet Membres : compteurs d'abonnés en une requête au lieu de 2 par membre.
- **Calendrier Jour / Semaine en heure locale** — vue Jour par défaut, vue Semaine au choix (mémorisé). Jikan donne les horaires en heure japonaise : jour **et** heure sont convertis dans le fuseau du visiteur (un épisode du lundi 1h00 au Japon apparaît le dimanche 18h00 en France), heure japonaise d'origine au survol. Nouvelle entrée dans la FAQ. Calendrier entièrement traduit FR/EN.
- **Onglet Artiste résistant aux pannes d'AnimeThemes** — AnimeThemes.moe tombe parfois pendant des heures (panne de datacenter, Cloudflare 522). Les artistes populaires, leurs openings/endings et l'ID MAL de chaque animé sont maintenant copiés dans une table Supabase `artist_cache` (`supabase/artist_cache_schema.sql`, remplie par `scripts/sync_artists.mjs` dans le sync hebdomadaire). L'onglet lit d'abord cette copie, et la recherche s'y replie quand l'API est hors ligne. Pendant une panne, une seule requête de test au lieu de 16 qui expirent, et un message qui dit clairement que la panne vient d'AnimeThemes.
- **Fix sync AnimeThemes** — Cloudflare renvoie 403 aux requêtes Node sans User-Agent : `sync_opquiz_pool.mjs` (et le nouveau `sync_artists.mjs`) s'identifient désormais explicitement.

## v.10.00 — en comparaison avec v.09.01

- **Invitations de jeu** — dans une room privée LinkUp / Timeline / Cluescale, une liste de tes abonnés/abonnements (mutuels en premier) permet de les inviter en un clic. L'invitation apparaît en tête de la cloche 🔔 (vérifiée toutes les 10 s) avec "Rejoindre" (bascule sur le Forum et entre dans la room comme joueur) ou "Refuser". Table `game_invites` (`supabase/game_invites_schema.sql`, déjà appliqué).
- **Classement Elo par jeu** — la modale de matchmaking LinkUp/Timeline affiche un mini-classement Elo propre au jeu (médailles, amis suivis en vert, ton rang à part si tu es hors du top).
- **Parties 1v1 abandonnées** — si l'adversaire ne donne plus signe de vie pendant son tour (crash, réseau coupé, veille) depuis 45 s, la victoire t'est attribuée au lieu de rester bloqué indéfiniment.
- **Forum — suppression** — l'auteur d'un sujet ou d'une réponse peut le supprimer (🗑, avec confirmation). Policies DELETE ajoutées à `supabase/forum_schema.sql` (déjà appliqué).
- **Modale Studio** — catalogue complet du studio (jusqu'à 200 animés), tri Récents / Mieux notés / Populaires, option pour masquer les animés déjà vus, et tes statuts affichés sur les affiches.
- **Profil** — retour de la section "🎌 Genres les plus vus".
- **Footer** — liens À propos / Catégories / Contact / FAQ / Modération, ouvrant des pages d'info (`InfoModal`), en plus de Mentions légales / Confidentialité.
- **Calendrier de la saison restauré** (Recherche → Animé) — il était retombé en simple grille, parce que la requête ne demandait plus la colonne `broadcast` à `anime_cache`. Le tableau Lundi → Dimanche est revenu, avec le filtre "Mon calendrier", jusqu'à 200 animés, défilement horizontal sur mobile, et une ligne "Jour non précisé".
- **Fix onglet Artiste** — quand l'API AnimeThemes.moe est indisponible (erreur Cloudflare 522 côté serveur), l'onglet restait vide sans explication. Les requêtes ont maintenant un délai max de 12 s, et l'onglet affiche un message d'erreur avec un bouton "Réessayer".
- **Fix écran blanc en dev** — un service worker laissé par un build de prod pouvait servir des modules Vite périmés en `npm run dev`. Le service worker n'est plus enregistré qu'en prod, tout reliquat est désinscrit en dev, et le cache passe en `animood-v2` en ne gardant en cache-first que les fichiers hashés de `/assets/` et les images.

## v.10.00 — en comparaison avec v.08.06

v.10.00 reprend les fonctionnalités de v.08.06 (calendrier saisonnier, invitations de jeu, classement Elo par jeu, tri de la modale Studio, suppression dans le forum, genres les plus vus, pages À propos / Contact / FAQ), et ajoute :

- **Invitations de jeu dans leur propre table** — v.08.06 les stockait comme des lignes `type = "game_invite"` dans une table `notifications` générique, jamais déclarée dans les schémas SQL suivis. v.10.00 utilise une table dédiée `game_invites` (`supabase/game_invites_schema.sql`), liée à `game_rooms` : une invitation disparaît automatiquement quand sa room est supprimée.
- **Confidentialité du profil** — Settings → Profil : tout le monde, amis seulement (abonnement mutuel) ou une liste de personnes choisies. Un profil non autorisé affiche un état verrouillé "🔒". Nécessite `supabase/profile_privacy_schema.sql`.
- **Listes abonnés/abonnements cliquables** — sur ton profil comme sur celui des autres, avec avatar + nom + `@username`.
- **Accusés de lecture des messages** — "vu"/"envoyé" sous ta dernière bulle, basés sur une colonne `read_at` côté serveur (cohérent entre appareils). Nécessite de relancer `supabase/messages_schema.sql`.
- **Footer légal** — liens Mentions légales / Confidentialité (contenu placeholder à compléter avant une mise en ligne publique).
- **Fix onglet Artiste** et **fix écran blanc en dev** — voir la section ci-dessus.

## Database (Supabase)

Schema is already applied on the shared project **except for the files/columns flagged ⚠️ below** (`game_schema.sql`, `badges_schema.sql`, `opquiz_pool_schema.sql`, `opquiz_stats_schema.sql`, the `v.09.01` `read_at` / `v.10.01` `delivered_at` columns on `messages_schema.sql`, `profile_privacy_schema.sql`, `artist_cache_schema.sql`) — every other addition (`polls_schema.sql`, `posts_schema.sql`, the original `forum_schema.sql` columns) has already been run. For a fresh Supabase project (or after a reset), run everything in this table in order in the SQL Editor:

| File | Adds |
|---|---|
| ✅ `supabase/forum_schema.sql` | `forum_threads`, `forum_replies` (+ `tags`, `image_url`, `likes`), the v.08 columns on `forum_threads` (`anime_id`/`anime_title`/`anime_image`/`reply_count`/`last_reply_at`, for the per-anime "💬 Discussions" section and the reply-count/last-activity on each thread) and the v.10.00 `DELETE` policies on both tables (author-only 🗑 in the UI) — all applied and verified. Safe to re-run: every statement is `add column if not exists` / `drop policy if exists` then `create policy`. |
| ⚠️ `supabase/messages_schema.sql` | `direct_messages` (already applied). **New in v.09.01, not yet confirmed run:** `read_at` column + an `UPDATE` RLS policy, needed so the recipient can stamp a message as read. **New in v.10.01:** `delivered_at` column (the "Vu" stage). Together they power the "Envoyé"/"Vu"/"Lu" receipts. The select/insert policies are now also drop-then-create, so the file really is re-runnable (before, re-running it errored on `direct_messages_select` already existing). Safe to re-run: `add column if not exists` / `drop policy if exists` then `create policy`. Until this runs, marking a message delivered/read fails silently and every message shows as "Envoyé". |
| ✅ `supabase/game_invites_schema.sql` | **New file in v.10.00, applied and verified.** Creates `game_invites` (`from_user`, `to_user`, `game_type`, `room_id` → `game_rooms` with `on delete cascade`, `private_code`, `status` pending/accepted/declined) plus a partial index on pending invites. |
| `supabase/anilist_sub_lists.sql` | `anilist_sub_lists` column on `profiles` |
| `supabase/blocks_schema.sql` | `user_blocks` (one-directional user blocking) |
| ⚠️ `supabase/profile_privacy_schema.sql` | **New file in v.09.01 — not yet confirmed run.** Adds `visibility` (`everyone`/`friends`/`custom`, default `everyone`) and `visibility_allowed` (jsonb array of usernames) to `profiles`. Enforced client-side only (`src/utils/profilePrivacy.js`), same access model as the rest of the app. Until this runs, the privacy setting in Settings → Profil won't persist. |
| ✅ `supabase/polls_schema.sql` | **New file in v.07, already applied.** `polls` (belongs to either a Feed post or a Forum thread — `options` jsonb `{id, text, votes[]}[]`, `multi` boolean). Neither branch ever tracked this table before. |
| ✅ `supabase/posts_schema.sql` | **New file in v.07, already applied — this was the actual bug.** `posts`, `comments` existed already but had no tracked schema and, it turns out, no `UPDATE` RLS policy at all: liking a Feed post or comment PATCHes the `likes` column, which was silently rejected the whole time. The optimistic client-side update made it *look* like it worked until the next page reload reverted it. This file added the missing `UPDATE`/`DELETE` policies — confirmed fixed. |
| ⚠️ `supabase/game_schema.sql` | **New file in v.07 — not yet run.** `game_elo`, `game_rooms` — existed already but had no tracked schema until now; adds the columns used to award/track solo game points (`streak_wordle`, `last_wordle_date`, `streak_poster`, `last_poster_date`, `streak_opquiz`/`last_opquiz_date` since v.07.02), and — **new in v.08** — `player3`/`player4` on `game_rooms` for Cluescale's 2-4 player rooms. **New in v.08.05:** `pts_wordle`/`pts_poster`/`pts_opquiz`/`pts_cluescale`, the per-game breakdown shown in the leaderboard (`points_total` stays the aggregate used for profile-frame unlocks). Only the `alter table` lines actually do anything on the shared project. Until this runs, winning Wordle/Poster/OP Quiz silently awards no points, Cluescale can't seat a 3rd/4th player, and the leaderboard's per-game columns read as 0. |
| ⚠️ `supabase/badges_schema.sql` | **New file in v.08.02 — not yet confirmed run.** Adds `banner`/`active_badge` columns to `profiles`. Badge unlock conditions are computed client-side (`src/badges/badges.jsx`), same as profile frames — no new table. Until this runs, picking an active badge won't persist. |
| ⚠️ `supabase/artist_cache_schema.sql` | **New file in v.10.02 — not yet run.** Creates `artist_cache` (`slug`, `name`, `themes` jsonb with each theme's resolved `malId`, `popular_rank`), filled by `scripts/sync_artists.mjs` (`npm run sync:artists`, also part of the `sync-anime.yml` weekly job). The script leaves the table untouched when AnimeThemes is unreachable, so an outage never wipes the last good copy. Purely additive: while it's missing or empty, the Artist tab just uses the live AnimeThemes API as before. |
| ⚠️ `supabase/opquiz_pool_schema.sql` | **New file in v.08.05 — not yet confirmed run.** Creates `opquiz_pool` (`mal_id`, `difficulty`, `audio_url`, `video_url`), filled by `scripts/sync_opquiz_pool.mjs` via the `sync-anime.yml` GitHub Actions job (AnimeThemes.moe resolves the audio). Purely additive: until this runs (or if it's ever empty/unreachable), OP Quiz just falls back to the ~24 hand-picked entries in `src/constants/animeOpenings.js` — nothing breaks. |
| ⚠️ `supabase/opquiz_stats_schema.sql` | **New file in v.09.00 — not yet confirmed run.** Creates `opquiz_stats` (community-wide per-opening attempts/correct/response-time, with a generated `difficulty_score`) and `opquiz_user_stats` (per-player attempts/correct per opening) — see `src/utils/opquizStats.js`. Purely additive: until this runs, OP Quiz falls back to the hand-picked difficulty tags and the adaptive picker treats every opening as never-seen. |

Access model: like the rest of the app, these tables use the shared `anon` key with open RLS policies ("anyone can read/insert/update/delete") — not per-user privacy, consistent with `profiles`/`follows`/`user_votes`.

> `profiles.custom_lists` (manually-created lists, `{id, name, animeIds}[]`) is a separate feature living on the `main` branch — unrelated to `anilist_sub_lists` above.
