# AniMood

Une app anime pilotée par l'humeur — moodboard, feed, recherche, forum, profils et messagerie. React + Vite + Tailwind côté client, Supabase (Postgres + REST) côté données, Jikan/AniList pour le catalogue anime.

## Lancer le projet en local

Aucune configuration nécessaire — la clé Supabase (anon, publique) est déjà dans le code, et le schéma de base est déjà migré sur le projet Supabase partagé.

```bash
git clone -b forum-mood-messages-sublists https://github.com/casval-bit/animood.git
cd animood
npm install
npm run dev
```

Ouvre l'URL affichée par Vite (`http://localhost:5173`).

Autres commandes utiles :

```bash
npm run build     # build de prod
npm run preview   # preview du build
npm run lint      # eslint sur tout le projet
```

## Fonctionnalités de cette branche

- **Forum** — carte "Humeur de la communauté" en octogone (au lieu de barres), en sidebar à droite plutôt qu'en haut de page ; sujets de discussion avec tags (Discussion / Question / Théorie / Recommandation / Spoiler / Rant).
- **Messages** — chat 1:1 entre membres (onglet "Messages" + bouton "💬 Message" sur un profil).
- **Import AniList** — récupère aussi les sous-listes perso (custom lists) d'un compte AniList public, filtrables dans Profil → Journal.

## Base de données (Supabase)

Le schéma est déjà appliqué sur le projet partagé. Pour un nouveau projet Supabase (ou après un reset), exécuter dans l'ordre, dans le SQL Editor :

| Fichier | Ajoute |
|---|---|
| `supabase/forum_schema.sql` | `forum_threads`, `forum_replies` (+ colonne `tags`) |
| `supabase/messages_schema.sql` | `direct_messages` |
| `supabase/anilist_sub_lists.sql` | colonne `anilist_sub_lists` sur `profiles` |

Modèle d'accès : comme le reste de l'app, ces tables utilisent la clé `anon` partagée avec des policies RLS ouvertes ("anyone can read/insert") — pas de confidentialité par utilisateur au sens strict, cohérent avec `profiles`/`follows`/`user_votes` déjà en place.

> Note : `profiles.custom_lists` (listes perso créées manuellement, `{id, name, animeIds}[]`) est une fonctionnalité distincte qui vit sur la branche `main` — sans rapport avec `anilist_sub_lists` ci-dessus.
