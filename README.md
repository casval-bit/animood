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

- **Forum** — "Community mood" card is now an octagon radar (instead of bars), moved into a sticky right sidebar instead of sitting full-width at the top; threads can be tagged (Discussion / Question / Theory / Recommendation / Spoiler / Rant) and can include an image. Unread-reply badge per thread. Thread rows, thread detail, and replies now show the poster's real profile photo and display name next to `@username`. Threads and replies can be liked (❤️/🤍 + count), same as Feed posts.
- **Sondages** — attach a poll (2 to 6 options, single or multiple choice) to a Feed post or a Forum thread when creating it; live vote with percentage bars once you've voted.
- **Messages** — 1:1 chat between members ("Messages" tab + "💬 Message" button on any profile), plus a floating chat bubble available from any page, and a "✏️ Nouveau" button to start a conversation without going through a profile first. Conversation list, chat header, and the new-message search all show the other person's real profile photo and display name, not just their `@handle`.
- **Mini-jeux** (Forum → 🎮 Mini-jeux du jour) — three solo daily games (Wordle Animé, Poster Mystère, OP Quiz — guess the anime from its opening theme, all three awarding points on a win) plus two 1v1 multiplayer games (Chaîne Animé, Timeline) with matchmaking (Elo range widens the longer you wait) or a private room code, and a per-player ELO/points ranking (`game_elo`) that also feeds the profile frames below.
- **Cadres de profil** — unlockable decorative avatar borders across 5 tracks (abonnés, contribution aux moods, animés vus, genre préféré, jeux). Settings → Profil shows every frame, locked ones greyed out with a 🔒 and the unlock condition, and lets you pick your active one.
- **Profils enrichis** — your own profile and any member's profile modal now share the same depth: watch/rating stats, mood average, pinned list, favorites and highlights, with Journal / Listes tabs on both. "Mes Posts" is fully interactive (like, comment, delete inline — not just a read-only recap) and stays live-synced with the Feed: liking or deleting a post in one place updates it instantly in the other.
- **Réglages** — reorganized into tabs (Préférences / Profil / Données / Compte); light/dark theme toggle, FR/EN language switch, an editable display name, and a delete-account placeholder.
- **Traduction FR/EN complète** — the language switch (Settings → Préférences) now actually translates the whole app: every view, modal, and component (Feed, Forum, Moodboard, Search, Profile, Messages, chat bubble, mini-games, anime/person/studio modals, statuses, filters, forum tags, profile frame names, notifications) — not just the setting itself.
- **Bloquer un utilisateur** — block/unblock from any profile; hides a blocked member's posts, threads and replies, blocks DMs both ways, and excludes them from mentions and search. Tucked into a discreet "⋯" menu on the profile (not a big red button next to Follow/Message) since it's rarely the first thing you want to do there. Manage the full list from Settings → Compte.
- **Mentions** — `@username` in Feed posts/comments and Forum threads/replies: autocompletes while typing, renders as a clickable link to that member's profile, and notifies the mentioned member (see Notifications below) even on a post/thread they haven't posted or commented on themselves.
- **Notifications** — unread-message badge (with count) on the ✉️ icon; a 🔔 bell for activity (new comments on Feed posts and new replies on Forum threads you wrote or took part in, *plus* any post/comment/thread/reply where someone `@mentions` you). The bell and Forum's per-thread unread badge read from the same feed, so they never disagree. Both update automatically in the background — no page refresh needed.
- **Theme** — selectable light/dark appearance (Settings → 🎨 Apparence). Dark (glass/gradient) stays the default; the light theme is a softer, violet-tinted "social feed" look, not a flat white dashboard.
- **AniList import** — also pulls a public AniList account's custom (sub-)lists, filterable from Profile → Journal. Re-run the same import anytime (same username, now with a clearly labeled field and a "🔄 Réimporter" button) to resync after updating your list on AniList.

## v.07.02 — en comparaison avec v.07.01

- **OP Quiz** — troisième mini-jeu solo (Forum → 🎮 Mini-jeux du jour) : deviner l'animé à partir de son opening. Suit sa propre streak/points (`streak_opquiz`, `last_opquiz_date` dans `game_elo`), en attente d'exécution avec le reste de `game_schema.sql` — voir Database plus bas.
- **Mini-jeux 1v1 (Chaîne, Timeline)** — implémentation remplacée par celle développée en parallèle sur `animood-v.07` (branche divergente, jamais fusionnée) : l'abandon en pleine partie demande maintenant une confirmation et fait passer la room à `"finished"` (au lieu de la remettre silencieusement à `"waiting"`), et la fenêtre de jeu expose sa fonction de forfait au parent (`onReady`) plutôt que de la dupliquer dans `ForumView`.

## v.07.01 — en comparaison avec v.07

`v.07` a été publié avec un système de like qui *semblait* fonctionner (le cœur devenait rouge, le compteur montait) mais qui, dans les faits, avait deux problèmes trouvés et corrigés après coup — voir la section `v.07` ci-dessous pour l'histoire complète, résumée ici :

- Les commentaires affichés dans Profil → "Mes Posts" n'avaient aucun bouton like (lecture seule), et les likes de commentaires n'étaient synchronisés entre aucune vue.
- **Le vrai bug** : les tables `posts` et `comments` n'avaient jamais eu de policy `UPDATE` en base (Row Level Security), donc liker un post ou un commentaire du Feed semblait marcher à l'écran (mise à jour optimiste) mais ne survivait jamais à un rechargement de page. Corrigé par `supabase/posts_schema.sql` (nouveau), **exécuté et confirmé** sur le projet partagé.

Avec `v.07.01`, le système de like (posts et commentaires, Feed / Profil / Forum) fonctionne et persiste réellement. Il reste un seul point en attente côté Supabase : `supabase/game_schema.sql` (points des mini-jeux solo Wordle/Poster) — voir Database plus bas.

## v.07 — en comparaison avec v.06.01

Deux chantiers sur cette version : récupérer des fonctionnalités qui existaient sur une branche parallèle (`animood-v.05.03`) mais n'avaient jamais rejoint la ligne `v.06`, puis harmoniser le système de like partout où il existe.

**Fonctionnalités récupérées depuis `animood-v.05.03`** (développées là-bas en parallèle de la traduction FR/EN et du blocage d'utilisateur, jamais fusionnées depuis) :

- **Sondages** — voir plus haut. Stockés dans une nouvelle table `polls` (schéma dans `supabase/polls_schema.sql`, voir Database ci-dessous).
- **Sync Feed ↔ Profil** — voir "Profils enrichis" plus haut ; réalisé via un petit bus d'événements (`src/utils/postEvents.js`) plutôt qu'un rechargement.
- **Points pour les mini-jeux solo** — voir "Mini-jeux" plus haut (`src/utils/awardSoloPoints.js`).
- **Matchmaking plus robuste** — élargissement progressif de la fourchette d'Elo si personne n'est trouvé rapidement, un mécanisme de secours par polling en plus du temps réel Supabase (au cas où une mise à jour "adversaire trouvé" serait manquée), et un abandon en pleine partie fiable : la fenêtre de jeu attend maintenant la fin du PATCH de fin de partie avant de se fermer, au lieu de fermer immédiatement et de risquer de perdre l'enregistrement du forfait.
- Tous les nouveaux textes ont été intégrés au système de traduction FR/EN existant (la branche d'origine ne l'avait pas) ; quelques variables et une fonction mortes déjà inutilisées dans la source d'origine (`getEloBracket`, `maxScore`, `avgScore`, `solopts`, un composant `GameButton` devenu orphelin après fusion) ont été nettoyées au passage.

**Système de like harmonisé — Feed / Profil / Forum**

Avant cette version, trois endroits différents géraient les likes de trois façons différentes, et un bug plus profond touchait les deux qui semblaient fonctionner :

- **Feed** (posts et commentaires) — un helper partagé `posts.toggleLike` / `comments.toggleLike` dans `src/api/supabase.js`, appelé côté client, avec mise à jour optimiste immédiate à l'écran. Ça avait l'air de marcher (le cœur devient rouge, le compteur monte) — voir plus bas pourquoi ce n'était qu'une apparence.
- **Profil → "Mes Posts"** — sa **propre** logique copiée-collée pour les posts (un `PATCH` direct vers Supabase, recalculé côté client) au lieu de réutiliser le helper du Feed, et carrément aucun bouton like sur les commentaires (juste du texte en lecture seule).
- **Forum** (sujets et réponses) — **ne fonctionnait pas du tout**, ni le bouton ni la colonne en base. Le code contenait littéralement ce commentaire : `// ─── Thread detail — body + replies + reply box, no reactions/pagination ──────`. Documenté comme volontairement hors scope au moment du "squelette" initial du forum.

Ce qui a été fait, en plusieurs passes :

1. **Forum** — ajout d'un bouton ❤️/🤍 + compteur sur le sujet et sur chaque réponse dans `ThreadModal`, même style que Feed/Profil. Deux nouvelles méthodes API, `sb.toggleThreadLike` / `sb.toggleReplyLike`, calquées sur `posts.toggleLike`. Le like remonte à `ForumView` (prop `onLikeUpdate`) pour que la liste des sujets reste à jour à la réouverture.
2. **Profil → posts** — `ProfilePostCard` bascule sur le même helper partagé `posts.toggleLike` que le Feed au lieu de son `PATCH` maison.
3. **Profil → commentaires** — ajout du bouton like sur chaque commentaire affiché dans "Mes Posts" (`comments.toggleLike`), qui n'existait pas du tout (lecture seule jusque-là).
4. **Synchro entre vues** — App.jsx garde Feed et Profil montés en permanence (juste cachés en CSS), donc un like fait dans l'un doit apparaître instantanément dans l'autre sans recharger. Deux bugs trouvés et corrigés ici :
   - Les cartes de post (`PostCard`, `ProfilePostCard`) initialisaient leur `liked`/`likeCount` une seule fois avec `useState(post.likes...)` : le bus d'événements (`src/utils/postEvents.js`) mettait bien à jour le tableau `likes` du post dans la vue d'à côté, mais la carte déjà montée ne relisait jamais ce nouveau prop. Ajouté un `useEffect` qui resynchronise à chaque changement de `post.likes`.
   - Les likes de **commentaires** n'étaient dans aucun bus du tout — ni le Feed ni le Profil ne prévenaient l'autre. Ajouté un type d'événement `"commentLike"` (même mécanique que les likes de post) diffusé et écouté des deux côtés.
5. **La vraie racine du problème** — malgré tout ce qui précède, les likes sur les posts et les commentaires du Feed **ne survivaient pas à un rechargement de page** : le cœur redevenait blanc et le compteur retombait à zéro. En cause : les tables `posts`/`comments` (jamais suivies par un fichier SQL dans ce dépôt, créées à la main sur le projet partagé comme `game_elo`/`game_rooms` avant `game_schema.sql`) n'avaient qu'un `SELECT`/`INSERT` en Row Level Security, jamais d'`UPDATE` — confirmé en demandant à l'utilisateur de tester un F5 après un like (le like disparaissait). Exactement le même trou que celui trouvé et corrigé sur le Forum au point 1. Le `PATCH` du like échouait donc silencieusement (`.catch(()=>{})`) à chaque fois ; la mise à jour optimiste donnait l'illusion que ça marchait jusqu'au rechargement suivant. `supabase/posts_schema.sql` (nouveau fichier) documente les deux tables et ajoute les policies `UPDATE`/`DELETE` qui manquaient.

**État des migrations Supabase** (SQL Editor → coller → Run) :

1. ✅ `supabase/forum_schema.sql` — exécuté. Les likes Forum (sujets + réponses) sont fonctionnels.
2. ✅ `supabase/polls_schema.sql` — exécuté. La table `polls` existe, les sondages Feed/Forum sont fonctionnels.
3. ✅ `supabase/posts_schema.sql` — exécuté. Les likes sur les posts et les commentaires du Feed/Profil persistent maintenant après un rechargement.
4. ⚠️ `supabase/game_schema.sql` — **pas encore exécuté** (laissé à quelqu'un d'autre de l'équipe). Documente `game_elo`/`game_rooms` et ajoute les colonnes `streak_wordle` / `last_wordle_date` / `streak_poster` / `last_poster_date` et, depuis `v.07.02`, `streak_opquiz` / `last_opquiz_date`. Tant que ce n'est pas fait, gagner à Wordle/Poster/OP Quiz ne persiste aucun point (le reste des mini-jeux — Elo, matchmaking — fonctionne déjà).

**Fichiers touchés**

| Zone | Fichiers |
|---|---|
| Sondages, sync posts, points solo, matchmaking | `src/App.jsx`, `src/components/ForumThreadModal.jsx`, `src/components/GameSystem.jsx`, `src/components/MiniGames.jsx`, `src/components/Modal.jsx`, `src/views/FeedView.jsx`, `src/views/ForumView.jsx`, `src/views/ProfileView.jsx`, `src/utils/awardSoloPoints.js` *(nouveau)*, `src/utils/postEvents.js` *(nouveau)*, i18n : `src/constants/forumI18n.js`, `forumThreadI18n.js`, `gameSystemI18n.js`, `profileI18n.js` |
| Likes Forum + Profil (posts et commentaires) + synchro Feed↔Profil | `src/api/supabase.js`, `src/components/ForumThreadModal.jsx`, `src/views/ForumView.jsx`, `src/views/ProfileView.jsx`, `src/views/FeedView.jsx`, `src/utils/postEvents.js`, `supabase/forum_schema.sql` |
| Schémas SQL en attente d'exécution | `supabase/polls_schema.sql` *(nouveau, exécuté)*, `supabase/game_schema.sql` *(nouveau, en attente)*, `supabase/posts_schema.sql` *(nouveau, en attente)* |

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

Schema is already applied on the shared project **except for `game_schema.sql`, flagged ⚠️ below** — every other `v.07` addition (`forum_schema.sql`'s `likes` columns, `polls_schema.sql`, `posts_schema.sql`) has already been run. For a fresh Supabase project (or after a reset), run everything in this table in order in the SQL Editor:

| File | Adds |
|---|---|
| ✅ `supabase/forum_schema.sql` | `forum_threads`, `forum_replies` (+ `tags`, `image_url`, and — new in v.07, already applied — `likes` columns and `UPDATE` policies). Safe to re-run even if you already ran an older version: every statement is `add column if not exists` / `drop policy if exists` then `create policy`. |
| `supabase/messages_schema.sql` | `direct_messages` |
| `supabase/anilist_sub_lists.sql` | `anilist_sub_lists` column on `profiles` |
| `supabase/blocks_schema.sql` | `user_blocks` (one-directional user blocking) |
| ✅ `supabase/polls_schema.sql` | **New file in v.07, already applied.** `polls` (belongs to either a Feed post or a Forum thread — `options` jsonb `{id, text, votes[]}[]`, `multi` boolean). Neither branch ever tracked this table before. |
| ✅ `supabase/posts_schema.sql` | **New file in v.07, already applied — this was the actual bug.** `posts`, `comments` existed already but had no tracked schema and, it turns out, no `UPDATE` RLS policy at all: liking a Feed post or comment PATCHes the `likes` column, which was silently rejected the whole time. The optimistic client-side update made it *look* like it worked until the next page reload reverted it. This file added the missing `UPDATE`/`DELETE` policies — confirmed fixed. |
| ⚠️ `supabase/game_schema.sql` | **New file in v.07 — not yet run.** `game_elo`, `game_rooms` — existed already but had no tracked schema until now; adds the columns used to award/track solo game points (`streak_wordle`, `last_wordle_date`, `streak_poster`, `last_poster_date`, and — new in v.07.02 — `streak_opquiz`, `last_opquiz_date`). Only those `alter table` lines actually do anything on the shared project. Until this runs, winning Wordle/Poster/OP Quiz silently awards no points. |

Access model: like the rest of the app, these tables use the shared `anon` key with open RLS policies ("anyone can read/insert/update/delete") — not per-user privacy, consistent with `profiles`/`follows`/`user_votes`.

> `profiles.custom_lists` (manually-created lists, `{id, name, animeIds}[]`) is a separate feature living on the `main` branch — unrelated to `anilist_sub_lists` above.
