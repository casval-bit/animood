# Sécurité de la base Supabase — mode d'emploi

## Le problème d'origine
Toutes les règles Supabase étaient `using (true)` et l'appli utilisait la clé publique (visible en F12) : n'importe qui pouvait
lire les messages privés et modifier / supprimer le contenu des autres.

## Ce que font les fichiers
| Fichier | Rôle |
|---|---|
| `security_rls_1_private.sql` | **Étape 1** : messages, blocages, invitations, profils, abonnements, votes, posts, forum… ne sont plus accessibles qu'à leur propriétaire (ou aux deux personnes d'une conversation). Les visiteurs non connectés n'ont plus accès à ces tables. |
| `security_rls_2_reference.sql` | **Étape 2** : tables de référence (animés, humeurs, quiz, artistes, streaming) : plus d'écriture par un visiteur non connecté. |
| `security_rls_rollback.sql` | **Retour en arrière** : remet l'ancien fonctionnement (tout ouvert). Aucune donnée n'est touchée. |
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
7. Supabase → Authentication → Providers : **désactiver « Email »** si seul Google sert (sinon quelqu'un peut créer un compte avec
   l'e-mail d'un autre, non vérifié, et prendre son identité).

## Limites connues
* Le pseudo vient toujours de l'e-mail (partie avant @) et reste public.
* « Profil visible par mes amis seulement » reste appliqué par l'interface ; les profils sont lisibles par tout compte connecté.
* Parties (`game_elo`, `game_rooms`) : réservées aux comptes connectés, mais un joueur connecté peut techniquement modifier l'ELO d'un autre
  (une partie met à jour les deux joueurs côté client). Les corriger demande des fonctions serveur (étape ultérieure).
* Un compte connecté peut écrire dans les tables de référence (l'appli le fait pour le cache des animés).
