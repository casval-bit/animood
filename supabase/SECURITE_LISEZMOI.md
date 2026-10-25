# Sécurité de la base Supabase — mode d'emploi

## Le problème d'origine
Toutes les règles Supabase étaient `using (true)` et l'appli utilisait la clé publique (visible en F12) : n'importe qui pouvait
lire les messages privés et modifier / supprimer le contenu des autres.

## Ce que font les fichiers
| Fichier | Rôle |
|---|---|
| `security_rls_1_private.sql` | **Étape 1** : messages, blocages, invitations, profils, abonnements, votes, posts, forum… ne sont plus accessibles qu'à leur propriétaire (ou aux deux personnes d'une conversation). Les visiteurs non connectés n'ont plus accès à ces tables. |
| `security_rls_2_reference.sql` | **Étape 2** : tables de référence (animés, humeurs, quiz, artistes, streaming) : plus d'écriture par un visiteur non connecté. |
| `security_rls_3_integrity.sql` | **Étape 3** : un compte connecté ne peut plus toucher à ce qui ne lui appartient pas : j'aime et votes de sondage (seulement les siens), ELO / points (±40 d'ELO, et seulement après une partie jouée ensemble), salles de jeu (seulement les joueurs), messages / invitations vers quelqu'un qui nous a bloqué (refusés), fiches d'animés existantes (seulement les scripts), compteurs d'humeurs / quiz (petites variations), images de posts / sujets (`https://` seulement). |
| `security_rls_3_rollback.sql` | Retour en arrière de **l'étape 3 seule** (les messages privés restent protégés). |
| `security_rls_rollback.sql` | **Retour en arrière complet** : remet l'ancien fonctionnement (tout ouvert, étapes 1 à 3). Aucune donnée n'est touchée. |
| `scripts/check_rls.mjs` | Contrôle en lecture seule de ce qu'un visiteur peut lire : `node --env-file=.env scripts/check_rls.mjs` |

## Ordre à respecter
1. **Déployer la v31** (site + appli de bureau). Elle envoie la session de l'utilisateur au lieu de la clé publique ;
   tant que le SQL n'est pas lancé, ça ne change rien au comportement. **Ne lance pas le SQL avant que le site en ligne soit en v31**,
   sinon les visiteurs qui ont encore l'ancienne version ne pourraient plus rien charger.
2. Se connecter, ouvrir F12 → Réseau → une requête `rest/v1/…` : l'en-tête `Authorization` doit être différent de la clé publique.
3. Faire une sauvegarde (Supabase → Database → Backups).
4. Lancer `security_rls_1_private.sql` dans l'éditeur SQL. Tester : connexion, envoyer un message, poster, liker, suivre quelqu'un,
   changer le profil, lancer une partie. En cas de souci : `security_rls_rollback.sql`.
5. Lancer `node --env-file=.env scripts/check_rls.mjs` : tout doit afficher « fermé ».
6. Plus tard (étape 2) : ajouter `SUPABASE_SERVICE_KEY` dans les secrets GitHub (Settings → Secrets and variables → Actions) et dans le `.env`
   (déjà fait pour `animood_sync`) ; les scripts l'utilisent automatiquement. Lancer un script pour vérifier, puis `security_rls_2_reference.sql`.
7. Étape 3 (une fois l'étape 2 en place) : lancer `security_rls_3_integrity.sql`. Tester : liker / retirer un j'aime, voter
   à un sondage, envoyer un message, une partie Chain ou Timeline jusqu'au bout (l'ELO doit bouger), un jeu solo (points),
   une partie Cluescale à 3. En cas de souci : `security_rls_3_rollback.sql`.
8. Supabase → Authentication → Providers : **désactiver « Email »** si seul Google sert (sinon quelqu'un peut créer un compte avec
   l'e-mail d'un autre, non vérifié, et prendre son identité).

## Limites connues
* Le pseudo vient toujours de l'e-mail (partie avant @) et reste public.
* « Profil visible par mes amis seulement » reste appliqué par l'interface ; les profils sont lisibles par tout compte connecté.
* Parties : le résultat est toujours calculé par l'appli du joueur. Après l'étape 3, on ne peut plus se mettre 9999 ELO ni
  toucher à l'ELO de quelqu'un avec qui on n'a pas joué, mais un tricheur peut encore « gagner » une partie qu'il joue
  (±40 par partie) ou gonfler ses points solo (+200 max par écriture). Le corriger complètement demande que le serveur
  arbitre les parties (fonctions Supabase / Edge Functions).
* Les salles de jeu en attente (y compris leur code privé) restent visibles par tout compte connecté.
* Compteurs de réponses / commentaires (`reply_count`, `comment_count`) : modifiables par tous (cosmétique).

## Côté appli (corrigé dans le code, rien à faire)
* **Appli de bureau** : n'ouvre plus que des liens `http(s)` (avant, un lien `file:` / `ms-msdt:` glissé dans une fiche d'animé
  pouvait lancer un programme sur l'ordinateur) ; adresse du site vérifiée par origine exacte (avant,
  `animood-rho.vercel.app.n-importe-quoi.com` passait) ; page isolée (`sandbox`) ; caméra / micro / position refusés ;
  les messages internes ne sont acceptés que depuis le site AniMood.
* **Connexion Google sur l'appli de bureau** : un lien `animood://auth-callback` n'est accepté que dans les 10 minutes qui suivent
  un clic sur « Se connecter » (avant, n'importe quel site pouvait connecter l'utilisateur au compte de quelqu'un d'autre).
* **Service worker** : ne garde plus en cache les réponses Supabase (messages privés, profil… restaient sur l'appareil après
  déconnexion). Le changement de version efface l'ancien cache.
* **Liens venant de la base** (image d'un post, bande-annonce) : seuls les liens `http(s)` sont ouverts.
* **Site** (`vercel.json`) : en-têtes de sécurité — HTTPS forcé, page impossible à afficher dans un cadre d'un autre site
  (clickjacking), pas de plugins, caméra / micro / position désactivés.
* **GitHub Actions** : le jeton des workflows est en lecture seule, sauf pour publier la release.

## À faire à la main (impossible depuis le code)
* Étapes SQL 1 → 3 ci-dessus, dans l'ordre.
* Supabase → Authentication → Providers : désactiver « Email » si seul Google sert (point 8).
* Supabase → Authentication → URL Configuration : ne garder dans « Redirect URLs » que le site et `animood://auth-callback`.
* Cloudinary → Settings → Upload → preset `animoodpic` (envoi sans signature, normal pour une appli web) : limiter les formats
  (jpg, png, webp, gif) et la taille (10 Mo) — sinon n'importe qui peut y déposer des fichiers avec ce nom de preset.
