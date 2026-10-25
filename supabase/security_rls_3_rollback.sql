-- ═════════════════════════════════════════════════════════════════════════════
-- RETOUR EN ARRIÈRE DE L'ÉTAPE 3 SEULEMENT — on revient à l'état « étape 1 (+ 2) »
-- ═════════════════════════════════════════════════════════════════════════════
-- À utiliser si les parties, les sondages ou les j'aime ne marchent plus après security_rls_3_integrity.sql.
-- Les messages privés restent protégés (étape 1). Les données ne sont pas touchées.

begin;

do $$
declare t text;
begin
  foreach t in array array['posts','comments','forum_threads','forum_replies'] loop
    if to_regclass('public.' || t) is not null then execute format('drop trigger if exists guard_likes on public.%I', t); end if;
  end loop;
  foreach t in array array['artist_cache','opquiz_pool','anime_streaming_regions','mood_pts_v2','mood_pts_v4','anime_sync_log'] loop
    if to_regclass('public.' || t) is not null and (select c.relkind from pg_class c where c.oid = to_regclass('public.' || t)) = 'r' then
      execute format('drop trigger if exists guard_script_only on public.%I', t);
    end if;
  end loop;
end $$;

drop trigger if exists guard_poll on public.polls;
drop trigger if exists guard_game_room on public.game_rooms;
drop trigger if exists guard_game_elo on public.game_elo;
drop trigger if exists guard_anime_cache on public.anime_cache;
drop trigger if exists guard_counter_deltas on public.mood_community_votes;
drop trigger if exists guard_counter_deltas on public.opquiz_stats;

alter table public.posts         drop constraint if exists posts_image_url_https;
alter table public.forum_threads drop constraint if exists forum_threads_image_url_https;

-- règles de l'étape 1
drop policy if exists polls_insert on public.polls;
create policy polls_insert on public.polls for insert to authenticated with check (true);

drop policy if exists direct_messages_insert on public.direct_messages;
create policy direct_messages_insert on public.direct_messages for insert to authenticated with check (public.is_me(sender));

drop policy if exists game_invites_insert on public.game_invites;
create policy game_invites_insert on public.game_invites for insert to authenticated with check (public.is_me(from_user));

drop policy if exists game_rooms_insert on public.game_rooms;
drop policy if exists game_rooms_update on public.game_rooms;
drop policy if exists game_rooms_delete on public.game_rooms;
create policy game_rooms_insert on public.game_rooms for insert to authenticated with check (true);
create policy game_rooms_update on public.game_rooms for update to authenticated using (true) with check (true);
create policy game_rooms_delete on public.game_rooms for delete to authenticated using (true);

commit;
