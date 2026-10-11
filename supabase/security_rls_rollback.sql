-- ═════════════════════════════════════════════════════════════════════════════
-- RETOUR EN ARRIÈRE — remet l'ancien fonctionnement (tout ouvert, comme avant l'étape 1 et 2)
-- ═════════════════════════════════════════════════════════════════════════════
-- À utiliser si quelque chose ne marche plus après les étapes de sécurité. Les données ne sont pas touchées.
-- (La colonne profiles.auth_uid et les fonctions restent en place, elles sont sans effet.)

begin;

drop trigger if exists guard_profile on public.profiles;
drop trigger if exists guard_cols on public.posts;
drop trigger if exists guard_cols on public.comments;
drop trigger if exists guard_cols on public.forum_threads;
drop trigger if exists guard_cols on public.forum_replies;
drop trigger if exists guard_cols on public.direct_messages;
drop trigger if exists guard_cols on public.game_invites;

do $$
declare
  t text;
  r record;
begin
  foreach t in array array['profiles','follows','user_votes','opquiz_user_stats','posts','comments','forum_threads',
                           'forum_replies','polls','direct_messages','user_blocks','game_invites','game_elo','game_rooms',
                           'anime_cache','artist_cache','opquiz_pool','opquiz_stats','mood_community_votes',
                           'anime_streaming_regions','mood_pts_v2','mood_pts_v4','anime_sync_log']
  loop
    if to_regclass('public.' || t) is null or (select c.relkind from pg_class c where c.oid = to_regclass('public.' || t)) <> 'r' then
      continue;
    end if;
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to anon, authenticated using (true) with check (true)', t || '_open', t);
  end loop;
end $$;

commit;
