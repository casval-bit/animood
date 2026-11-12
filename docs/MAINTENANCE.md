# AniMood — guide de maintenance

Notes pour la personne qui publie le site et les applis. Pour découvrir le projet, voir le [README](../README.md).

---

## 📦 Publier

**Le site (Vercel)**
```bash
npx vercel deploy --prod
```

**L'appli de bureau** (Windows + Mac + Linux, compilée par GitHub Actions)
1. Mets le nouveau numéro dans `package.json` (ex. `"version": "14.1.0"`).
2. Lance :
   ```bash
   git tag v14.1.0
   git push origin v14.1.0
   ```
3. GitHub publie la release. La page de téléchargement et les mises à jour automatiques la trouvent seules.

> Le dépôt doit rester **public** : la page de téléchargement du site et les mises à jour automatiques de l'appli de bureau lisent les releases GitHub sans connexion.

**L'APK Android** — Rien à refaire tant que le site change. Pour un nouvel APK : PWABuilder → remplacer `public/downloads/AniMood.apk`.
> 🔒 La clé de signature Android n'est **pas** dans le dépôt. Sans elle, impossible de mettre à jour l'appli sur le Play Store : garde-la en sécurité.

**Microsoft Store** — voir [`STORE_LISEZMOI.md`](STORE_LISEZMOI.md).

---

## 🗄️ Base de données (Supabase)

Fichiers SQL dans `supabase/`, à lancer dans l'éditeur SQL de Supabase.

**Déjà appliqués** ✅
`forum_schema` · `messages_schema` · `posts_schema` · `polls_schema` · `game_schema` · `game_invites_schema` · `blocks_schema` · `profile_privacy_schema` · `badges_schema` · `anilist_sub_lists` · `anime_sync_log_schema` · `artist_cache_schema` · `opquiz_pool_schema` · `opquiz_stats_schema`

**Nouveaux (v.11.02 / v.12)** — à lancer si pas encore fait
`profile_spotlight` · `profile_frame_flags` · `streaming_regions_schema`

**Sécurité** 🔐 — à faire dans l'ordre, en suivant [`supabase/SECURITE_LISEZMOI.md`](../supabase/SECURITE_LISEZMOI.md)
`security_rls_1_private` → `security_rls_2_reference` (retour en arrière : `security_rls_rollback`)

**Réglages Supabase** (Authentication → URL Configuration)
- Site URL : `https://animood.me`
- Redirect URLs : `https://animood.me/**`, `https://www.animood.me/**`, `https://animood-rho.vercel.app/**` (encore chargée par l'appli de bureau et l'APK) et `animood://**` (connexion depuis l'appli de bureau)

---

## 🔄 Synchronisation du catalogue

- **Automatique** — GitHub Actions (`.github/workflows/`) : `sync-anime.yml` chaque semaine (nouveaux animés, moods, OP Quiz, artistes), plus `sync-daily.yml` et `sync-monthly.yml`. Ils utilisent le secret GitHub `SUPABASE_SERVICE_KEY`.
- **À la main** — `scripts/animood_sync.mjs` (clé `service_role` dans `.env`, jamais dans git) :
  ```bash
  npm run sync:weekly
  ```
  Raccourcis Windows : `run_weekly.bat`, `run_new_anime.bat`, `run_moods.bat`, `run_scores.bat`, `run_broadcast.bat`, `run_streaming.bat`, `run_streaming_regions.bat`, `run_trailers.bat`.

### Sources de données des scripts : Tenrai, Jikan en secours, AniList

- **Tenrai** (`https://api.tenrai.org/v1`, successeur de Jikan, mêmes chemins et même format) : source principale pour MyAnimeList — scores, fiches complètes des nouveaux animés, trailers, jours de diffusion. Client commun : `scripts/lib/malApi.mjs`.
- **Jikan** (`https://api.jikan.moe/v4`) : **secours automatique**. Si Tenrai ne répond pas (panne, clé refusée) ou ne connaît pas encore un anime (404), la même requête est refaite sur Jikan au lieu d'échouer. Chaque source a son rythme (pause de 1,1 s pour Jikan, réglable avec `JIKAN_GAP_MS`), ses 3 essais (20 s maximum par requête) et son « disjoncteur » : après 6 échecs d'affilée, la source est déclarée en panne pour la suite du script et on passe à la suivante (ou à l'étape suivante si toutes sont en panne) au lieu d'attendre des minutes.
  Le rapport de fin dit qui a répondu, par exemple `MyAnimeList : Tenrai 120/121 · Jikan 3/3 (secours)`. Réglage : `MAL_SOURCES=tenrai` désactive le secours, `MAL_SOURCES=jikan,tenrai` remet Jikan en premier.
- **AniList** (GraphQL) : statuts, horaires, humeurs et **plateformes de streaming** (50 animés par requête : ~5 minutes pour toute la base, contre plus d'1 h 45 avec une requête par animé). Les animés sans plateforme chez AniList (ou si AniList est en panne) sont complétés via MyAnimeList (`/anime/{id}/streaming`), dans la limite de `MAL_STREAMING_MAX` par passage (250 par défaut) et du budget de temps.
- **Server Key Tenrai (facultative)** : relève les limites de requêtes. Si tu en as une, ajoute-la comme secret GitHub `TENRAI_SERVER_KEY` (et `TENRAI_SERVER_KEY=…` dans `.env` pour les lancements à la main). Sans clé, tout fonctionne, un peu plus lentement (pause de 0,7 s entre requêtes ; réglable avec `TENRAI_GAP_MS`).
- **Vérifier que tout répond** : `node --env-file=.env scripts/check_tenrai.mjs` (lecture seule) teste Tenrai, Jikan et AniList **séparément** et dit si le secours est nécessaire. `scripts/check_anime.mjs "titre"` compare la base avec ce que disent AniList et MyAnimeList en direct.
- **Temps imparti** : chaque étape des workflows a sa limite (`timeout-minutes`) et un budget interne (`SYNC_BUDGET_MIN`) : un script s'arrête proprement un peu avant d'être coupé, et le « Write summary » s'exécute toujours.
- Les colonnes `jikan_weight` / `jikan_score` de la base gardent leur nom historique (elles contiennent des valeurs MyAnimeList, que la source soit Tenrai ou Jikan).

### Images de la Tierlist (`/api/img`)

L'export PNG de la Tierlist relit les affiches : les serveurs d'images (MyAnimeList, AniList) n'autorisant pas toujours cette lecture depuis un navigateur, elles sont relayées par la fonction Vercel `api/img.js` (code partagé : `server/imageProxy.js`, aussi branché sur le serveur de développement dans `vite.config.js`). Elle n'accepte que des affiches en https venant de MyAnimeList / AniList / Kitsu (3 Mo maximum). **Après avoir mis à jour le site, redéploie sur Vercel** (`npx vercel deploy --prod`) pour que cette fonction existe ; sans elle l'export retombe sur un autre relais, puis sur le titre écrit sur la carte (plus de carrés noirs).

---

## 🎮 Mini-jeux : où est quoi

- **Règles pures** (testées par `npm test`) : `src/utils/gameRules.js` (ELO, points, fin de manche, Timeline v2, coups de l'IA), `gameSettle.js` + `roomTx.js` (qui reçoit quoi, une seule fois par partie), `undercoverOnline.js`, `cluescaleState.js`.
- **Écrans** : `src/components/DuelGames.jsx` (Chaîne, Timeline), `PartyGames.jsx` (Cluescale, Imposteur), `GameLobby.jsx` (modes, salons, invitations — le même salon pour tous les jeux), `gameUi.jsx` (briques d'interface et écran de fin). `GameSystem.jsx` ne fait que ré-exporter les composants.
- **Ce que rapporte une partie** : classée = ELO + points (victoire 20 / défaite 5 / égalité 10) ; entre amis = points seulement (10 / 3 / 5) ; contre l'IA = rien d'enregistré (le bilan reste sur l'appareil) ; abandon = l'autre gagne, celui qui part perd 10 ELO de plus (classé) et ne marque aucun point.
- Les deux joueurs d'une partie doivent avoir la **même version** : le format de l'état de Timeline a changé (`state.v`).

---

## 💡 Bon à savoir

- L'appli lit les moods dans `mood_pts_v4`, mais `scripts/sync_new_moods.mjs` (workflow hebdo) écrit encore dans `mood_pts_v2`. `animood_sync.mjs --job=moods` écrit bien dans `mood_pts_v4`.
- `profiles.custom_lists` (listes créées à la main) est une fonctionnalité de la branche `main`, sans lien avec les sous-listes AniList.
- Fonctionnement du reroll du Moodboard : [`reroll-method.txt`](reroll-method.txt).
