-- ═════════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ — ÉTAPE 4 : mode invité, lecture seule du fil et du forum sans compte
-- ═════════════════════════════════════════════════════════════════════════════
-- À exécuter UNE FOIS dans Supabase → SQL Editor, après les étapes 1 à 3. Peut être lancé avant ou après le déploiement
-- du site : ce script ne fait qu'AJOUTER des droits de lecture. Retour en arrière : supabase/security_rls_4_rollback.sql.
--
-- Ce que peut alors lire un visiteur non connecté (rôle anon) :
--   • posts, comments, polls            : le fil d'actu, ses commentaires et ses sondages
--   • forum_threads, forum_replies      : les sujets et réponses du forum (y compris les discussions d'animés)
--   • profiles                          : SEULEMENT pseudo, nom affiché et avatar (pour afficher l'auteur d'un post).
--                                         Listes, notes, favoris, bio, réglages de confidentialité… restent réservés
--                                         aux comptes connectés.
-- Toujours rien pour un visiteur : messages privés, blocages, invitations, abonnements, votes, parties, classements.
-- Aucune écriture possible sans compte (pas de règle insert / update / delete pour anon).
--
-- Conséquence à connaître : ces contenus deviennent publics (lisibles par n'importe qui avec la clé publique),
-- plus seulement par les membres connectés.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

drop policy if exists posts_select_anon         on public.posts;
drop policy if exists comments_select_anon      on public.comments;
drop policy if exists polls_select_anon         on public.polls;
drop policy if exists forum_threads_select_anon on public.forum_threads;
drop policy if exists forum_replies_select_anon on public.forum_replies;
drop policy if exists profiles_select_anon      on public.profiles;

create policy posts_select_anon         on public.posts         for select to anon using (true);
create policy comments_select_anon      on public.comments      for select to anon using (true);
create policy polls_select_anon         on public.polls         for select to anon using (true);
create policy forum_threads_select_anon on public.forum_threads for select to anon using (true);
create policy forum_replies_select_anon on public.forum_replies for select to anon using (true);

-- Profils : la ligne est lisible, mais seules 4 colonnes le sont (droits par colonne).
-- Une requête « select=* » d'un visiteur est donc refusée ; « select=username,name,avatar,avatar_base64 » passe.
revoke select on public.profiles from anon;
grant select (username, name, avatar, avatar_base64) on public.profiles to anon;
create policy profiles_select_anon on public.profiles for select to anon using (true);

commit;
