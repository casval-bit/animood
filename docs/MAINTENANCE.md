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

**Nouveau (v.14.05 · AniMood 2026)** — à lancer pour que le vote du Top 3 de la communauté fonctionne
`awards_2026_schema` (table `awards_2026` : un top 3 par membre ; **à relancer après** les étapes Sécurité si elles sont faites plus tard, pour que les règles passent en mode protégé ; relançable sans risque)

**Sécurité** 🔐 — à faire dans l'ordre, en suivant [`supabase/SECURITE_LISEZMOI.md`](../supabase/SECURITE_LISEZMOI.md)
`security_rls_1_private` → `security_rls_2_reference` (retour en arrière : `security_rls_rollback`)

**Réglages Supabase** (Authentication → URL Configuration)
- Site URL : `https://animood.me`
- Redirect URLs : `https://animood.me/**`, `https://www.animood.me/**`, `https://animood-rho.vercel.app/**` (encore chargée par l'appli de bureau et l'APK) et `animood://**` (connexion depuis l'appli de bureau)

---

## 🎆 AniMood 2026 (fin d'année)

- **Où** : bloc sous l'en-tête (`src/components/YearEndBanner.jsx`, monté dans `src/App.jsx` : Forum du site, Forum et Jeux du bureau), podium de la communauté dans le bloc (`src/components/awards/Podium.jsx` + `useCommunityPodium.js`), fenêtre `src/components/awards/AwardsHub.jsx` (en-tête festif, gros onglets Top 3, Tierlist, Grille), entrées « 2026 » dans Jeux (bureau) et dans le panneau des mini-jeux du Forum du site (`Awards2026Entry`).
- **Fin du bloc** : `BANNER_LAST_DAY` dans `src/utils/awards2026.js` (15 janvier 2027 inclus, heure locale). Après cette date le bloc ne s'affiche plus ; l'espace reste accessible par les Jeux. Pour retirer toute la fonctionnalité, il suffit de supprimer `YearEndBanner` de `App.jsx` et les deux `Awards2026Entry`.
- **Fermeture du bloc** : mémorisée dans `sessionStorage` par pseudo (clé `animood_yearend2026_closed:<pseudo>`) → pas de retour après un rechargement ; effacée à la déconnexion (`AppProvider`) et à la fermeture de l'appli ou de l'onglet.
- **Podium du bloc** : les 3 animés en tête **au total des points** (même calcul que l'onglet Top 3 : `buildPodium` dans `src/utils/awards2026.js`, lecture `fetchCommunityPodium` dans `src/api/awards2026.js`), avec leurs affiches ; un clic sur une affiche ouvre la fenêtre. Il est relu à l'affichage du bloc, toutes les 90 s tant que la page est visible (`PODIUM_POLL_MS`), au retour sur l'onglet ou la fenêtre (si la dernière lecture a plus de 20 s) et environ 0,3 s après un vote ou un retrait de vote (`src/utils/awardsSync.js` : `Top3Panel` appelle `notifyAwardsChanged()`). Rien n'est lu quand le bloc est fermé ou hors saison. Sans la table `awards_2026`, ou en cas de panne au tout premier chargement, le bloc s'affiche sans podium (pas de message d'erreur) ; en cas de panne ensuite, le dernier podium reste affiché. Coût à surveiller : une lecture de tous les votes (pages de 1 000, 10 pages au plus) par membre et par 90 s tant que le Forum ou les Jeux sont ouverts ; si la communauté dépasse quelques milliers de votants, remplacer cette lecture par une vue SQL ou une fonction RPC qui ne renvoie que le top 3.
- **Fenêtre festive** : `GameModal` (`src/components/Modal.jsx`) accepte `festive` (cadre doré, fond teinté) et `hero` (bandeau fourni par l'appelant : `HubHero` et `HubTabs` dans `AwardsHub.jsx`) ; sans `festive`, rien ne change pour les autres jeux. `Modal.jsx` doit rester à **2** calques fixes de z ≥ 300 (compté par `tests/desktopWindow.test.mjs`). Le bloc, l'en-tête de la fenêtre et sa croix sont des îlots sombres (`data-keep-bright`) : sans cela le thème clair assombrit leurs textes clairs (`scripts/palettes/lighttext.mjs`).
- **Quels animés comptent** : `year` = 2026 dans `anime_cache` (à défaut la date de début de diffusion, puis la saison), tous formats et toutes origines ; `CM`, `PV`, `Music` et le contenu adulte sont exclus (`isEligible2026`).
- **Votes** : table `awards_2026` (`supabase/awards_2026_schema.sql`), un top 3 par pseudo (1ᵉʳ = 3 points, 2ᵉ = 2, 3ᵉ = 1) ; lecture ouverte aux membres connectés (comme les votes de mood), écriture limitée à son propre pseudo une fois les étapes Sécurité faites. Classements : points, plus de n°1, ratio de n°1 (au moins 10 % des votants, entre 2 et 5 votes reçus, pour ne pas classer un animé cité une seule fois) ; « amis » = les membres que l'on suit, soi-même exclu. Calculs dans `src/utils/awards2026.js` (testés par `tests/awards2026.test.mjs`).
- **Tierlist et grille** : gardées sur l'appareil, par pseudo (`localStorage`) ; seul le vote du Top 3 est envoyé à Supabase. Export image (PNG, copie, partage) via `src/utils/posterExport.js` : l'image est dessinée en thème sombre (html2canvas ne lit pas les `oklch()` du thème clair) et `fixTextBaseline()` remet en `inline` le GIF 1×1 que html2canvas utilise pour mesurer la ligne de base des polices (le CSS de base de Tailwind le passe en `block` : tout le texte sortait ~5 px trop bas). Le test `tests/awards2026.test.mjs` vérifie que la règle reconnaît encore ce GIF si tu changes de version de html2canvas.

---

## 🔄 Synchronisation du catalogue

- **Automatique** — GitHub Actions (`.github/workflows/`) : `sync-anime.yml` chaque semaine (nouveaux animés, moods, OP Quiz, artistes), plus `sync-daily.yml` et `sync-monthly.yml`. Ils utilisent le secret GitHub `SUPABASE_SERVICE_KEY`.
- **À la main** — `scripts/animood_sync.mjs` (clé `service_role` dans `.env`, jamais dans git) :
  ```bash
  npm run sync:weekly
  ```
  Raccourcis Windows : `run_weekly.bat`, `run_new_anime.bat`, `run_moods.bat`, `run_scores.bat`, `run_broadcast.bat`, `run_streaming.bat`, `run_streaming_regions.bat`, `run_trailers.bat`.

### Sources de données des scripts : Tenrai + AniList (plus de Jikan)

- **Tenrai** (`https://api.tenrai.org/v1`, successeur de Jikan — le service Jikan est arrêté —, mêmes chemins et même format) : scores MyAnimeList, fiches complètes des nouveaux animés, trailers, jours de diffusion. Client commun : `scripts/lib/malApi.mjs` (délai de 20 s par requête, 3 essais, et « disjoncteur » : après 6 échecs d'affilée l'API est déclarée en panne et le script passe à la suite au lieu d'attendre des minutes).
- **AniList** (GraphQL) : statuts, horaires, humeurs et **plateformes de streaming** (50 animés par requête : ~5 minutes pour toute la base, contre plus d'1 h 45 avec une requête par animé). Les animés sans plateforme chez AniList (ou si AniList est en panne) sont complétés via Tenrai (`/anime/{id}/streaming`), dans la limite de `MAL_STREAMING_MAX` par passage (250 par défaut ; `0` = pas de complément) et du budget de temps.
- **Server Key Tenrai (facultative)** : relève les limites de requêtes. Si tu en as une, ajoute-la comme secret GitHub `TENRAI_SERVER_KEY` (et `TENRAI_SERVER_KEY=…` dans `.env` pour les lancements à la main). Sans clé, tout fonctionne, un peu plus lentement (pause de 0,7 s entre requêtes ; réglable avec `TENRAI_GAP_MS`). Si la clé est **refusée** (expirée, révoquée), les scripts continuent sans clé au lieu d'échouer, et le rapport de fin le dit (« Server Key refusée ») : pense alors à la renouveler.
- **Vérifier que tout répond** : `node --env-file=.env scripts/check_tenrai.mjs` (lecture seule) teste les requêtes utilisées par les scripts sur Tenrai et sur AniList. `scripts/check_anime.mjs "titre"` compare la base avec ce que disent AniList et Tenrai en direct.
- **Temps imparti** : chaque étape des workflows a sa limite (`timeout-minutes`) et un budget interne (`SYNC_BUDGET_MIN`) : un script s'arrête proprement un peu avant d'être coupé, et le « Write summary » s'exécute toujours.
- Les colonnes `jikan_weight` / `jikan_score` de la base gardent leur nom historique (elles contiennent des valeurs MyAnimeList via Tenrai).

### Limites des API (vérifiées en novembre 2026) et ce que font les scripts

| API | Limite | Ce que font les scripts |
|---|---|---|
| **AniList** (GraphQL) | 90 requêtes/min ; la doc annonce un mode « dégradé » à **30/min**. Dépasser = 429 + **pause d'1 minute** imposée | `scripts/lib/anilistApi.mjs` : 1 requête toutes les 1,2 s, puis toutes les 2,1 s dès le premier 429 ; **50 animés par requête** quand c'est possible (plateformes, saisons, titres, statuts) |
| **Tenrai** (MyAnimeList) | avec Server Key : **300/min** et 5/s, sans limite par jour ; sans clé : 60 à 120/min et 3 à 4/s selon les sources (40 000/jour), les réponses en cache ne comptent pas | `scripts/lib/malApi.mjs` : 0,25 s avec clé, 0,7 s sans ; ralentit tout seul après un 429 |
| **AnimeThemes** | **90/min** par IP (429 + `Retry-After`) | `scripts/lib/animeThemesApi.mjs` : 0,7 s entre deux requêtes, 429 → on attend puis on recommence |
| **TMDB** (JustWatch) | ≈ 40/s (« peut changer ») | `sync_streaming_regions.mjs` : ≈ 7/s, 429 → on attend ; mention « JustWatch » obligatoire |
| **LiveChart** (RSS) | pas de limite publiée | 1 requête par jour (flux des épisodes diffusés) |

Le plus rapide pour de gros volumes : **AniList par paquets de 50** (toute la base en 4 à 7 minutes), puis Tenrai (25 animés par page dans les listes) ; une requête par animé ne sert que de secours, en petite quantité.
**Attention** : les tâches planifiées (cron) tournent avec les fichiers de la branche `main`. Tant que les workflows corrigés ne sont pas fusionnés dans `main`, il faut lancer la synchro à la main depuis la bonne branche : Actions → *Sync Anime Database* → *Run workflow* → choisir la branche.

### Images de la Tierlist (`/api/img`)

L'export PNG de la Tierlist relit les affiches : les serveurs d'images (MyAnimeList, AniList) n'autorisant pas toujours cette lecture depuis un navigateur, elles sont relayées par la fonction Vercel `api/img.js` (code partagé : `server/imageProxy.js`, aussi branché sur le serveur de développement dans `vite.config.js`). Elle n'accepte que des affiches en https venant de MyAnimeList / AniList / Kitsu (3 Mo maximum). **Après avoir mis à jour le site, redéploie sur Vercel** (`npx vercel deploy --prod`) pour que cette fonction existe ; sans elle l'export retombe sur un autre relais, puis sur le titre écrit sur la carte (plus de carrés noirs).

---

## 🎮 Mini-jeux : où est quoi

- **Règles pures** (testées par `npm test`) : `src/utils/gameRules.js` (ELO, points, fin de manche, Timeline v2, coups de l'IA), `gameSettle.js` + `roomTx.js` (qui reçoit quoi, une seule fois par partie), `undercoverOnline.js`, `cluescaleState.js`.
- **Écrans** : `src/components/DuelGames.jsx` (Chaîne, Timeline), `PartyGames.jsx` (Cluescale, Imposteur), `GameLobby.jsx` (modes, salons, invitations — le même salon pour tous les jeux), `gameUi.jsx` (briques d'interface et écran de fin). `GameSystem.jsx` ne fait que ré-exporter les composants.
- **Ce que rapporte une partie** : classée = ELO + points (victoire 20 / défaite 5 / égalité 10) ; entre amis = points seulement (10 / 3 / 5) ; contre l'IA = rien d'enregistré (le bilan reste sur l'appareil) ; abandon = l'autre gagne, celui qui part perd 10 ELO de plus (classé) et ne marque aucun point.
- Les deux joueurs d'une partie doivent avoir la **même version** : le format de l'état de Timeline a changé (`state.v`).

---

## 🖥️ Appli de bureau : carte de survol, compatibilité, tickets, stats en plus

Tout ce bloc est **réservé à l'appli de bureau** (`isDesktopApp()` de `src/utils/streamingLinks.js`) : le site web et l'APK ne montrent rien de tout cela et n'envoient aucune requête en plus. **Aucun SQL à lancer** : tout lit des tables et colonnes qui existent déjà (`anime_cache`, `user_votes.voted_at`, `profiles`).

- **Carte de survol des affiches** — `components/QuickCardHost.jsx` (une seule instance, montée dans `App.jsx`). Une affiche s'y signale avec `{...quickProps(anime.mal_id)}` (attribut `data-quick-anime`, `utils/quickActions.js`) : **toute nouvelle affiche doit le porter** pour avoir la carte. Minutage (arrêt d'environ 0,4 s, passage d'une affiche à l'autre, délai de grâce) : `utils/hoverIntent.js` ; changements du profil (vu, note, statut, liste…) : `utils/quickActions.js` ; note enregistrée dans `user_votes` comme par la fiche animé : `utils/userVoteRequest.js` + `api/userVotes.js`. La carte est un îlot sombre (`data-keep-bright`), lisible dans les deux thèmes, et ne recouvre jamais l'en-tête : `tests/desktopWindow.test.mjs` la range dans `OTHERS` (ce n'est pas une fenêtre plein écran). Tests : `tests/quickcard.test.mjs`.
- **Compatibilité entre deux membres** — bouton « 🤝 Compatibilité » du profil d'un membre (`views/UserProfileModal.jsx`) → `components/CompatibilityPanel.jsx`. Le calcul est **pur** (`utils/compatibility.js`, `tests/compatibility.test.mjs`) : moyenne pondérée de 4 ingrédients (notes 40 %, bibliothèque 20 %, genres 25 %, favoris 15 %), tirée vers 50 quand la plus petite bibliothèque a moins de 25 animés, symétrique (A↔B). Fiches des animés (genres, studios, affiches) : `api/animeMeta.js`, par lots de 100, gardées en mémoire pour la session. Textes : `constants/compatI18n.js`.
- **Tickets à partager** — bouton « 🎟️ Ticket » de la fiche animé et du profil → `components/ShareTicketModal.jsx` (chargé à la demande). Carte de **700 px de large** à couleurs fixes (`data-keep-bright` : identique en thème clair), dessinée en PNG par `utils/posterExport.js` (échelle 2, soit 1 400 px) : télécharger, copier, partager (quand le système sait partager un fichier). Mise en forme : `utils/shareTicket.js` (pur, `tests/shareTicket.test.mjs`) ; textes : `constants/shareTicketI18n.js`. La fenêtre est un `Modal` ordinaire : pas de `position: fixed` à elle.
- **Cartes en plus de Profil → Stats** — `views/ProfileStatsExtras.jsx`, branchées dans `views/ProfileStatsDesktop.jsx` (après « Formats regardés », seulement dans l'appli de bureau) :
  - *calendrier d'activité* : les dates viennent de `user_votes.voted_at`, qui garde **la date de la dernière note de chaque animé** (pas l'historique complet). Lecture par pages de 1 000, 3 pages au plus donc les 3 000 notes les plus récentes (`api/voteActivity.js` + `utils/pagedRead.js`) ; jours comptés à l'heure de l'ordinateur ; une série en cours reste en vie jusqu'à la fin de la journée (`utils/statsExtras.js`) ;
  - *grand public ou de niche* : rang de popularité MyAnimeList (`anime_cache.popularity`) lu avec les autres fiches de l'onglet par `views/ProfileView.jsx` (`popRows`) ; échelle logarithmique du rang 30 (0 sur 100) au rang 15 000 (100 sur 100), appliquée au **rang médian** ;
  - *santé de la watchlist* : fiches des animés « à voir » (`api/animeMeta.js`) ; durée = épisodes × durée d'un épisode ; une série encore en cours de diffusion (épisodes inconnus) n'est pas comptée ; « coup rapide » = 5 h ou moins, « marathon » = 25 h ou plus.
  Textes : `constants/statsExtrasI18n.js`. Tests : `tests/statsExtras.test.mjs`.

---

## 💡 Bon à savoir

- L'appli lit les moods dans `mood_pts_v4`, mais `scripts/sync_new_moods.mjs` (workflow hebdo) écrit encore dans `mood_pts_v2`. `animood_sync.mjs --job=moods` écrit bien dans `mood_pts_v4`.
- `profiles.custom_lists` (listes créées à la main) est une fonctionnalité de la branche `main`, sans lien avec les sous-listes AniList.
- Fonctionnement du reroll du Moodboard : [`reroll-method.txt`](reroll-method.txt).
- **Appli de bureau (fenêtre sans cadre) — fenêtres et pages plein écran** : l'en-tête est une zone « déplacer la fenêtre » (`-webkit-app-region: drag`) que Chromium garde active sous une fenêtre ouverte (l'empilement ne compte pas). Tout calque posé au-dessus de l'en-tête (`position: fixed`, z-index ≥ 300) porte donc `{...overlayProps()}` sur sa racine, et `{...titleBarProps()}` sur la barre de titre d'une page plein écran (`src/utils/desktopWindow.js`) ; sans cela, un bouton placé dans les 84 px du haut ne reçoit jamais le clic. `tests/desktopWindow.test.mjs` signale tout nouveau calque non marqué. Les clics simulés de Playwright ne voient pas ce défaut (ils ignorent ces zones) : il faut un vrai clic de souris dans Electron.
