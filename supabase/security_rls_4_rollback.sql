-- ═════════════════════════════════════════════════════════════════════════════
-- RETOUR EN ARRIÈRE DE L'ÉTAPE 4 SEULEMENT — plus de lecture du fil / forum sans compte
-- ═════════════════════════════════════════════════════════════════════════════
-- Annule security_rls_4_guest_read.sql : on revient à l'état « étapes 1 à 3 ». Les données ne sont pas touchées.
-- Le mode invité continue de marcher pour le Moodboard et la recherche ; le fil et le forum s'afficheront vides.

begin;

drop policy if exists posts_select_anon         on public.posts;
drop policy if exists comments_select_anon      on public.comments;
drop policy if exists polls_select_anon         on public.polls;
drop policy if exists forum_threads_select_anon on public.forum_threads;
drop policy if exists forum_replies_select_anon on public.forum_replies;
drop policy if exists profiles_select_anon      on public.profiles;

-- Droits de table remis comme avant (sans règle pour anon, la sécurité par ligne bloque de toute façon la lecture)
revoke select (username, name, avatar, avatar_base64) on public.profiles from anon;
grant select on public.profiles to anon;

commit;
