# AniMood

**Découvre des animés selon ton humeur.** Moodboard, feed, forum, mini-jeux, profils et messages.

🌐 **Site :** https://animood-rho.vercel.app
📲 **Applis :** sur le site, bouton « Télécharger l'appli » (header ou footer)

React + Vite + Tailwind · Supabase (base de données) · Jikan / AniList / AnimeThemes (catalogue)

---

## 📱 Les applis

| Plateforme | Comment l'avoir |
|---|---|
| 🌐 Web | https://animood-rho.vercel.app |
| 🤖 Android | APK à télécharger sur le site |
| 🍏 iPhone / iPad | Safari → Partager → « Sur l'écran d'accueil » |
| 🪟 Windows · 🍎 Mac · 🐧 Linux | Installateurs sur le site (releases GitHub) |

Toutes les applis affichent le site en ligne : **un déploiement du site = toutes les applis à jour**.

---

## 🚀 Lancer en local

```bash
git clone -b animood-v.14.00 https://github.com/casval-bit/animood.git
cd animood
npm install
npm run dev
```

Ouvre `http://localhost:5173`. Aucune config : la clé Supabase dans le code est la clé publique.

| Commande | Rôle |
|---|---|
| `npm run build` | Build du site |
| `npm run lint` | Vérifie le code |
| `npm run electron:dev` | Appli de bureau en mode dev (ou `run_desktop.bat`) |
| `npm run electron:build:win` | Installateur Windows dans `dist-electron/` |

---

## ✨ Fonctionnalités

**Découvrir**
- **Moodboard** — choisis une ou plusieurs humeurs (Hype, Chill, Dark…), AniMood propose 3 animés, reroll à volonté.
- **Recherche** — onglets Animé / 📅 Saison / Studio / Artiste / Membres.
- **Calendrier de la saison** — vue Jour ou Semaine, à l'heure du visiteur, filtres plateforme et « Mon calendrier ».
- **Terminés récemment**, **trailers** des prochaines sorties, **liens streaming** selon ta région.
- **Fiche animé** — infos, trailer, discussions dédiées, catalogue complet du studio.

**Communauté**
- **Feed** — posts, commentaires, likes, sondages, `@mentions`.
- **Forum** — sujets tagués avec image, likes, réponses, suppression par l'auteur.
- **Messages privés** — bulle de chat partout, accusés « Envoyé ✓ → Vu ✓✓ → Lu ».
- **Notifications** — cloche 🔔 (réponses, mentions, invitations de jeu) et badge messages.
- **Blocage** et **modération** automatique (mots interdits).

**Jeux** (Forum → Mini-jeux, ou onglet Jeux sur l'appli de bureau)
- **Solo du jour** — Wordle Animé, Poster Mystère, OP Quiz (difficulté qui s'adapte).
- **Multijoueur** — Chaîne Animé, Timeline, Cluescale, Undercover : matchmaking Elo, rooms privées, invitations, mode vs IA.
- **Tierlist** — classe les animés de S à F, export en image.
- **Classements** par jeu et général.

**Profil**
- Stats, moods, genres les plus vus, favoris, listes, journal, posts.
- **Cadres animés**, **badges** et **Pts jeux** à débloquer, anime « En Boucle ».
- **Confidentialité** — profil visible par tous, par les amis ou par une liste choisie.
- **Import AniList**, avec sous-listes et réimport.

**Réglages**
- Thème clair / sombre, français / anglais (toute l'appli), photo, nom, cadre, badge, plateformes de streaming.

---

## 📦 Publier

**Le site (Vercel)**
```bash
npx vercel deploy --prod
```

**L'appli de bureau** (Windows + Mac + Linux, compilée par GitHub Actions)
1. Mets le nouveau numéro dans `package.json` (ex. `"version": "12.1.0"`).
2. Lance :
   ```bash
   git tag v12.1.0
   git push origin v12.1.0
   ```
3. GitHub publie la release. La page de téléchargement et les mises à jour automatiques la trouvent seules.

**L'APK Android** — Rien à refaire tant que le site change. Pour un nouvel APK : PWABuilder → remplacer `public/downloads/AniMood.apk`.
> 🔒 La clé de signature Android n'est **pas** dans le dépôt. Sans elle, impossible de mettre à jour l'appli sur le Play Store : garde-la en sécurité.

---

## 🗄️ Base de données (Supabase)

Fichiers SQL dans `supabase/`, à lancer dans l'éditeur SQL de Supabase.

**Déjà appliqués** ✅
`forum_schema` · `messages_schema` · `posts_schema` · `polls_schema` · `game_schema` · `game_invites_schema` · `blocks_schema` · `profile_privacy_schema` · `badges_schema` · `anilist_sub_lists` · `anime_sync_log_schema` · `artist_cache_schema` · `opquiz_pool_schema` · `opquiz_stats_schema`

**Nouveaux (v.11.02 / v.12)** — à lancer si pas encore fait
`profile_spotlight` · `profile_frame_flags` · `streaming_regions_schema`

**Sécurité** 🔐 — à faire dans l'ordre, en suivant [`supabase/SECURITE_LISEZMOI.md`](supabase/SECURITE_LISEZMOI.md)
`security_rls_1_private` → `security_rls_2_reference` (retour en arrière : `security_rls_rollback`)

**Réglages Supabase** (Authentication → URL Configuration)
- Site URL : `https://animood-rho.vercel.app`
- Redirect URLs : `https://animood-rho.vercel.app/**` et `animood://**` (connexion depuis l'appli de bureau)

---

## 🔄 Synchronisation du catalogue

- **Automatique** — chaque semaine sur GitHub Actions (`.github/workflows/sync-anime.yml`) : nouveaux animés, moods, OP Quiz, artistes.
- **À la main** — `scripts/animood_sync.mjs` (clé `service_role` dans `.env`) :
  ```bash
  npm run sync:weekly
  ```
  Raccourcis Windows : `run_weekly.bat`, `run_new_anime.bat`, `run_moods.bat`, `run_scores.bat`, `run_broadcast.bat`, `run_streaming.bat`, `run_streaming_regions.bat`, `run_trailers.bat`.

---

## 🕓 Versions

| Version | Nouveautés |
|---|---|
| **v.14.00** | Moodboard refondu (palier de mood minimum, notes des amis, plus de doublon de saison, scène animée aussi sur grand écran web), Tierlist Studio, profil au style HUD (Journal, Listes, Posts, Stats repensées), calendrier corrigé chaque jour, fenêtre de bureau sans cadre, synchros automatiques réparées (Node 22) |
| v.13.00 | Sécurité (règles Supabase étape 3, appli de bureau durcie, cache hors ligne sans données privées, en-têtes du site), installation en un appui par QR code, barre d'onglets mobile |
| v.12.00 | Site en ligne (Vercel), applis Android / Windows / Mac / Linux, page de téléchargement, connexion Google sur l'appli de bureau |
| v.11.02 | Appli de bureau, profil enrichi (Pts jeux, En Boucle), streaming par région, sécurité RLS |
| v.11.01 | Bouton trailer, logos footer, onglets forum |
| v.11.00 | Undercover, Tierlist, filtres calendrier, terminés récemment, cadres animés, script de sync |
| v.10.02 | Accusés de réception en 3 étapes, nouveau logo, calendrier Jour/Semaine, onglet Artiste résistant aux pannes |
| v.10.00 | Invitations de jeu, classement Elo, confidentialité du profil, footer |

---

## 💡 Bon à savoir

- L'appli lit les moods dans `mood_pts_v4`, mais `scripts/sync_new_moods.mjs` (workflow hebdo) écrit encore dans `mood_pts_v2`. `animood_sync.mjs --job=moods` écrit bien dans `mood_pts_v4`.
- `profiles.custom_lists` (listes créées à la main) est une fonctionnalité de la branche `main`, sans lien avec les sous-listes AniList.
