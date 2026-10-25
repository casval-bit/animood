-- ═════════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ — ÉTAPE 3 : empêcher un compte connecté de modifier ce qui ne lui appartient pas
-- ═════════════════════════════════════════════════════════════════════════════
-- À exécuter dans Supabase → SQL Editor, APRÈS l'étape 1 (security_rls_1_private.sql) et APRÈS avoir mis
-- SUPABASE_SERVICE_KEY dans le .env et dans les secrets GitHub (comme pour l'étape 2) : les scripts de synchronisation
-- doivent passer par la clé de service, les comptes de l'appli ne peuvent plus écrire dans les tables de référence.
-- Retour en arrière de cette étape seule : supabase/security_rls_3_rollback.sql.
--
-- Ce qui restait possible après les étapes 1 et 2 (avec un compte connecté et F12) :
--   • « j'aime » : vider ou remplir la liste des j'aime de n'importe quel post / commentaire / sujet / réponse ;
--   • sondages : réécrire les votes des autres, changer les questions, créer un sondage sur le post d'un autre ;
--   • parties : mettre n'importe quel ELO / points à n'importe quelle valeur, prendre la place d'un joueur dans une
--     partie en cours, supprimer les parties des autres ;
--   • messages privés / invitations : écrire à quelqu'un qui nous a bloqué ;
--   • fiches d'animés (anime_cache) : remplacer titre, image, bande-annonce, liens de streaming de n'importe quel animé
--     (liens piégés montrés à tout le monde) ; compteurs d'humeurs et de quiz : mettre n'importe quelle valeur ;
--   • liens d'images (posts, sujets du forum) : enregistrer un lien javascript: au lieu d'une image.
-- Après : chacun ne peut ajouter / retirer que SON j'aime et SON vote, l'ELO bouge au plus de 40 points et seulement
-- après une partie jouée ensemble, les fiches d'animés existantes ne sont modifiables que par les scripts.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── 0. Outils ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Requête venant de l'appli (clé publique ou compte connecté) ? Faux pour la clé de service et le SQL Editor.
create or replace function public.is_client_request() returns boolean
language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') in ('anon', 'authenticated') $$;

-- Pseudo du compte connecté (profil lié au compte, sinon pseudo tiré de l'e-mail) ; null si non connecté.
create or replace function public.my_username() returns text
language sql stable security definer set search_path = public
as $$
  select case when auth.uid() is null then null else
    coalesce((select username from public.profiles where auth_uid = auth.uid() limit 1), nullif(public.current_username(), ''))
  end
$$;

-- « u m'a-t-il bloqué ? » — ne révèle que les blocages qui visent le compte connecté.
create or replace function public.has_blocked_me(u text) returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_blocks where blocker = u and blocked = public.my_username()) $$;

grant execute on function public.is_client_request(), public.my_username(), public.has_blocked_me(text) to anon, authenticated;

-- ── 1. J'aime : on ne peut ajouter ou retirer que son propre pseudo ─────────────────────────────────────────────────
create or replace function public.guard_likes() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  me text := public.my_username();
  n jsonb := to_jsonb(new) -> 'likes';
  o jsonb := to_jsonb(old) -> 'likes';
begin
  if not public.is_client_request() then return new; end if;
  if n is null or jsonb_typeof(n) <> 'array' then n := '[]'; end if;
  if o is null or jsonb_typeof(o) <> 'array' then o := '[]'; end if;
  if exists (
    select 1 from (
      (select jsonb_array_elements_text(n) as v except select jsonb_array_elements_text(o))
      union
      (select jsonb_array_elements_text(o) except select jsonb_array_elements_text(n))
    ) d where d.v is distinct from me
  ) or (select count(*) from jsonb_array_elements_text(n) e(v) where e.v = me) > 1 then
    raise exception 'On ne peut ajouter ou retirer que son propre « j''aime »' using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['posts','comments','forum_threads','forum_replies'] loop
    execute format('drop trigger if exists guard_likes on public.%I', t);
    execute format('create trigger guard_likes before update on public.%I for each row execute function public.guard_likes()', t);
  end loop;
end $$;

-- ── 2. Sondages : créés seulement sur son propre post / sujet ; on ne touche qu'à son propre vote ───────────────────
drop policy if exists polls_insert on public.polls;
create policy polls_insert on public.polls for insert to authenticated with check (
  (thread_id is not null and exists (select 1 from public.forum_threads t where t.id = thread_id and public.is_me(t.username)))
  or (post_id is not null and exists (select 1 from public.posts p where p.id = post_id and public.is_me(p.username)))
);

create or replace function public.guard_poll() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  me text := public.my_username();
  o jsonb := coalesce(old.options, '[]');
  n jsonb := coalesce(new.options, '[]');
  oi jsonb; ni jsonb; ov jsonb; nv jsonb;
  mine int := 0;
  i int;
begin
  if not public.is_client_request() then return new; end if;
  if new.post_id is distinct from old.post_id or new.thread_id is distinct from old.thread_id
     or new.multi is distinct from old.multi
     or jsonb_typeof(n) <> 'array' or jsonb_array_length(n) <> jsonb_array_length(o) then
    raise exception 'Seuls les votes d''un sondage peuvent être modifiés' using errcode = '42501';
  end if;
  for i in 0 .. jsonb_array_length(n) - 1 loop
    oi := o -> i; ni := n -> i;
    if jsonb_typeof(ni) <> 'object' or (ni - 'votes') is distinct from (oi - 'votes') then
      raise exception 'Les choix d''un sondage ne peuvent pas être modifiés' using errcode = '42501';
    end if;
    ov := coalesce(oi -> 'votes', '[]'); nv := coalesce(ni -> 'votes', '[]');
    if jsonb_typeof(ov) <> 'array' then ov := '[]'; end if;
    if jsonb_typeof(nv) <> 'array' then
      raise exception 'Votes invalides' using errcode = '42501';
    end if;
    if exists (
      select 1 from (
        (select jsonb_array_elements_text(nv) as v except select jsonb_array_elements_text(ov))
        union
        (select jsonb_array_elements_text(ov) except select jsonb_array_elements_text(nv))
      ) d where d.v is distinct from me
    ) then
      raise exception 'On ne peut modifier que son propre vote' using errcode = '42501';
    end if;
    if (select count(*) from jsonb_array_elements_text(nv) e(v) where e.v = me) > 1 then
      raise exception 'Un seul vote par choix' using errcode = '42501';
    end if;
    mine := mine + (select count(*) from jsonb_array_elements_text(nv) e(v) where e.v = me);
  end loop;
  if not new.multi and mine > 1 then
    raise exception 'Un seul vote pour ce sondage' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_poll on public.polls;
create trigger guard_poll before update on public.polls for each row execute function public.guard_poll();

-- ── 3. Messages privés / invitations : impossible d'écrire à quelqu'un qui nous a bloqué ────────────────────────────
drop policy if exists direct_messages_insert on public.direct_messages;
create policy direct_messages_insert on public.direct_messages for insert to authenticated
  with check (public.is_me(sender) and not public.has_blocked_me(recipient));

drop policy if exists game_invites_insert on public.game_invites;
create policy game_invites_insert on public.game_invites for insert to authenticated
  with check (public.is_me(from_user) and not public.has_blocked_me(to_user));

-- ── 4. Salles de jeu : seuls les joueurs modifient une partie lancée ; on rejoint une salle en attente ───────────────
drop policy if exists game_rooms_insert on public.game_rooms;
drop policy if exists game_rooms_update on public.game_rooms;
drop policy if exists game_rooms_delete on public.game_rooms;
create policy game_rooms_insert on public.game_rooms for insert to authenticated with check (public.is_me(player1));
create policy game_rooms_update on public.game_rooms for update to authenticated
  using (status = 'waiting' or public.is_me(player1) or public.is_me(player2) or public.is_me(player3) or public.is_me(player4))
  with check (public.is_me(player1) or public.is_me(player2) or public.is_me(player3) or public.is_me(player4));
create policy game_rooms_delete on public.game_rooms for delete to authenticated using (public.is_me(player1));

-- L'hôte (player1) ne change jamais ; une place déjà prise ne peut être changée que par l'hôte ou par ce joueur.
create or replace function public.guard_game_room() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_client_request() then return new; end if;
  if new.player1 is distinct from old.player1
     or (old.player2 is not null and new.player2 is distinct from old.player2 and not (public.is_me(old.player1) or public.is_me(old.player2)))
     or (old.player3 is not null and new.player3 is distinct from old.player3 and not (public.is_me(old.player1) or public.is_me(old.player3)))
     or (old.player4 is not null and new.player4 is distinct from old.player4 and not (public.is_me(old.player1) or public.is_me(old.player4))) then
    raise exception 'Cette place est déjà prise' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_game_room on public.game_rooms;
create trigger guard_game_room before update on public.game_rooms for each row execute function public.guard_game_room();

-- ── 5. ELO / points ───────────────────────────────────────────────────────────────────────────────────────────────
--   • ELO : ±40 au plus par modification ; une hausse (ou toute modification de l'ELO d'un autre) demande une partie
--     du même jeu jouée ensemble dans les 6 dernières heures.
--   • Points : +200 au plus par modification sur sa propre ligne ; sur la ligne d'un autre, seulement ELO + points_total
--     (+20 au plus, jamais à la baisse).
--   • Créer la ligne d'un autre joueur (première partie) : valeurs de départ uniquement.
create or replace function public.guard_game_elo() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  me text := public.my_username();
  target text;
  mine boolean;
  n jsonb := to_jsonb(new);
  o jsonb;
  k text;
  d bigint;
  dc int; dt int;
begin
  if not public.is_client_request() then return new; end if;
  if me is null then raise exception 'Connexion requise' using errcode = '42501'; end if;

  if tg_op = 'INSERT' then
    -- départ : 400 / 400, compteurs à zéro ; seul le propriétaire peut arriver avec ses premiers points (≤ 200)
    new := jsonb_populate_record(new, jsonb_build_object('elo_chain', 400, 'elo_timeline', 400));
    for k in select key from jsonb_each(n) where key = 'points_total' or key like 'pts\_%' or key like 'streak\_%' loop
      if not public.is_me(new.username) then
        new := jsonb_populate_record(new, jsonb_build_object(k, 0));
      elsif jsonb_typeof(n -> k) = 'number' and ((n ->> k)::numeric < 0 or (n ->> k)::numeric > 200) then
        raise exception 'Valeur de départ invalide pour %', k using errcode = '42501';
      end if;
    end loop;
    if not public.is_me(new.username) then
      for k in select key from jsonb_each(n) where key like 'last\_%' loop
        new := jsonb_populate_record(new, jsonb_build_object(k, null));
      end loop;
    end if;
    return new;
  end if;

  -- UPDATE
  o := to_jsonb(old);
  target := old.username;
  mine := public.is_me(target);
  if new.username is distinct from old.username then
    raise exception 'Le pseudo ne peut pas être modifié' using errcode = '42501';
  end if;

  dc := coalesce(new.elo_chain, 400) - coalesce(old.elo_chain, 400);
  dt := coalesce(new.elo_timeline, 400) - coalesce(old.elo_timeline, 400);
  if abs(dc) > 40 or abs(dt) > 40 then
    raise exception 'Variation d''ELO trop grande' using errcode = '42501';
  end if;

  if not mine then
    if (n - array['elo_chain','elo_timeline','points_total','updated_at']) is distinct from
       (o - array['elo_chain','elo_timeline','points_total','updated_at']) then
      raise exception 'Seuls l''ELO et les points d''un adversaire peuvent être modifiés' using errcode = '42501';
    end if;
    d := coalesce(new.points_total, 0) - coalesce(old.points_total, 0);
    if d < 0 or d > 20 then
      raise exception 'Points d''un adversaire : +20 au plus' using errcode = '42501';
    end if;
  else
    for k in select key from jsonb_each(n) where key = 'points_total' or key like 'pts\_%' loop
      if jsonb_typeof(n -> k) = 'number' then
        d := (n ->> k)::numeric - coalesce((o ->> k)::numeric, 0);
        if d > 200 then
          raise exception 'Trop de points d''un coup pour %', k using errcode = '42501';
        end if;
      end if;
    end loop;
  end if;

  -- une partie jouée ensemble (même jeu, moins de 6 h) pour toute hausse d'ELO ou tout changement sur l'ELO d'un autre
  if dc > 0 or (dc <> 0 and not mine) then
    if not exists (
      select 1 from public.game_rooms r
       where r.game_type = 'chain'
         and greatest(r.created_at, r.updated_at) > now() - interval '6 hours'
         and me in (r.player1, r.player2, r.player3, r.player4)
         and (case when mine then coalesce(r.player2, '') <> '' else target in (r.player1, r.player2, r.player3, r.player4) end)
    ) then
      raise exception 'ELO Chain : aucune partie récente' using errcode = '42501';
    end if;
  end if;
  if dt > 0 or (dt <> 0 and not mine) then
    if not exists (
      select 1 from public.game_rooms r
       where r.game_type = 'timeline'
         and greatest(r.created_at, r.updated_at) > now() - interval '6 hours'
         and me in (r.player1, r.player2, r.player3, r.player4)
         and (case when mine then coalesce(r.player2, '') <> '' else target in (r.player1, r.player2, r.player3, r.player4) end)
    ) then
      raise exception 'ELO Timeline : aucune partie récente' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_game_elo on public.game_elo;
create trigger guard_game_elo before insert or update on public.game_elo for each row execute function public.guard_game_elo();

-- ── 6. Fiches d'animés : l'appli peut AJOUTER un animé absent (liens https seulement), jamais modifier / supprimer ─
-- (les mises à jour passent par les scripts avec la clé de service)
create or replace function public.guard_anime_cache() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r jsonb;
  k text;
begin
  if not public.is_client_request() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op <> 'INSERT' then return null; end if;                 -- modification / suppression ignorée
  r := to_jsonb(new);
  foreach k in array array['image_url','large_image','trailer_url'] loop
    if jsonb_typeof(r -> k) = 'string' and (r ->> k) !~ '^https://' then r := jsonb_set(r, array[k], 'null'); end if;
  end loop;
  if jsonb_typeof(r -> 'streaming') = 'array' then
    r := jsonb_set(r, '{streaming}', coalesce(
      (select jsonb_agg(e) from jsonb_array_elements(r -> 'streaming') e where (e ->> 'url') ~ '^https://'), '[]'));
  end if;
  return jsonb_populate_record(new, r);
end $$;

drop trigger if exists guard_anime_cache on public.anime_cache;
create trigger guard_anime_cache before insert or update or delete on public.anime_cache
  for each row execute function public.guard_anime_cache();

-- ── 7. Compteurs partagés (humeurs de la communauté, stats du quiz) : petites variations seulement ─────────────────
--   argument 0 : colonne clé (pour retrouver la ligne existante lors d'un « upsert »)
--   argument 1 : variation maximale par écriture pour chaque colonne numérique
--   argument 2 : colonnes ignorées (séparées par des virgules)
create or replace function public.guard_counter_deltas() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  key_col  text := tg_argv[0];
  max_d    numeric := tg_argv[1]::numeric;
  ignored  text[] := string_to_array(coalesce(tg_argv[2], ''), ',');
  n jsonb := to_jsonb(new);
  o jsonb;
  k text;
begin
  if not public.is_client_request() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then return null; end if;
  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
  else -- INSERT … ON CONFLICT : on compare avec la ligne qui existe déjà
    execute format('select to_jsonb(t) from public.%I t where t.%I = (jsonb_populate_record(null::public.%I, $1)).%I',
                   tg_table_name, key_col, tg_table_name, key_col)
      into o using n;
  end if;
  o := coalesce(o, '{}');
  for k in select key from jsonb_each(n) where jsonb_typeof(value) = 'number' and key <> key_col and not key = any(ignored) loop
    if abs((n ->> k)::numeric - coalesce((o ->> k)::numeric, 0)) > max_d then
      raise exception 'Variation trop grande pour %', k using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists guard_counter_deltas on public.mood_community_votes;
create trigger guard_counter_deltas before insert or update or delete on public.mood_community_votes
  for each row execute function public.guard_counter_deltas('mal_id', '8', '');
drop trigger if exists guard_counter_deltas on public.opquiz_stats;
create trigger guard_counter_deltas before insert or update or delete on public.opquiz_stats
  for each row execute function public.guard_counter_deltas('mal_id', '1', 'total_response_ms,difficulty_score');

-- ── 8. Tables remplies uniquement par les scripts : lecture seule pour l'appli ──────────────────────────────────────
create or replace function public.guard_script_only() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if public.is_client_request() then
    raise exception 'Table en lecture seule' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['artist_cache','opquiz_pool','anime_streaming_regions','mood_pts_v2','mood_pts_v4','anime_sync_log'] loop
    if to_regclass('public.' || t) is null or (select c.relkind from pg_class c where c.oid = to_regclass('public.' || t)) <> 'r' then
      raise notice 'Table % absente (ou vue) : ignorée', t;
      continue;
    end if;
    execute format('drop trigger if exists guard_script_only on public.%I', t);
    execute format('create trigger guard_script_only before insert or update or delete on public.%I
                    for each row execute function public.guard_script_only()', t);
  end loop;
end $$;

-- ── 9. Liens d'images : https uniquement (nouveaux contenus) + nettoyage des liens existants non https ─────────────
update public.posts         set image_url   = null where image_url   is not null and image_url   !~ '^https://';
update public.forum_threads set image_url   = null where image_url   is not null and image_url   !~ '^https://';
update public.anime_cache   set trailer_url = null where trailer_url is not null and trailer_url !~ '^https://';

alter table public.posts         drop constraint if exists posts_image_url_https;
alter table public.posts         add  constraint posts_image_url_https check (image_url is null or image_url ~ '^https://') not valid;
alter table public.forum_threads drop constraint if exists forum_threads_image_url_https;
alter table public.forum_threads add  constraint forum_threads_image_url_https check (image_url is null or image_url ~ '^https://') not valid;

commit;
