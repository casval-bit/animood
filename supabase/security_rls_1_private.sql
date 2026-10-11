-- ═════════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ — ÉTAPE 1 : protéger les données privées / liées à un compte
-- ═════════════════════════════════════════════════════════════════════════════
-- À exécuter UNE FOIS dans Supabase → SQL Editor, APRÈS avoir déployé la version de l'appli qui envoie la session de
-- l'utilisateur (v31 ou plus). Retour en arrière possible : supabase/security_rls_rollback.sql.
--
-- Avant : toutes les règles étaient « using (true) » et l'appli utilisait la clé publique → n'importe qui pouvait lire
-- les messages privés ou modifier le contenu des autres.
-- Après (cette étape) :
--   • direct_messages   : lisibles / envoyables uniquement par l'expéditeur et le destinataire.
--   • user_blocks       : visibles uniquement par la personne qui bloque.
--   • game_invites      : visibles uniquement par l'expéditeur et le destinataire.
--   • profiles, follows, user_votes, opquiz_user_stats, posts, comments, forum_threads, forum_replies :
--                         on ne peut créer / modifier / supprimer que ce qui est à soi
--                         (les « j'aime » et compteurs restent modifiables par tous, rien d'autre).
--   • game_elo, game_rooms, polls : réservés aux comptes connectés (les parties doivent pouvoir modifier l'adversaire).
--   • Plus aucun accès pour un visiteur non connecté à ces tables.
-- Les tables de référence (anime_cache, humeurs, quiz, artistes, streaming) ne changent pas ici : voir l'étape 2.
--
-- Identité : le pseudo vient de l'e-mail Google (partie avant @). Pour éviter qu'un autre compte avec le même début
-- d'e-mail (autre domaine) prenne la place de quelqu'un, chaque profil est lié à l'identifiant du compte (auth_uid).
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Pseudo calculé depuis l'e-mail (identique au code : usernameFromEmail dans AppProvider.jsx) ────────────────
create or replace function public.username_from_email(e text) returns text
language sql immutable
as $$ select left(regexp_replace(lower(split_part(coalesce(e, ''), '@', 1)), '[^a-z0-9]', '', 'g'), 20) $$;

create or replace function public.current_username() returns text
language sql stable
as $$ select public.username_from_email(auth.jwt() ->> 'email') $$;

-- ── 2. Propriétaire d'un profil : colonne auth_uid + rattachement des profils existants ───────────────────────────
alter table public.profiles add column if not exists auth_uid uuid;

update public.profiles p
   set auth_uid = u.id
  from (
    select distinct on (public.username_from_email(email)) id, public.username_from_email(email) as uname
      from auth.users
     where email is not null
     order by public.username_from_email(email), created_at
  ) u
 where p.auth_uid is null and p.username = u.uname;

create unique index if not exists profiles_auth_uid_key on public.profiles(auth_uid) where auth_uid is not null;

-- « Ce pseudo m'appartient-il ? » — profil lié à mon compte ; à défaut (profil orphelin / pas encore créé) pseudo = mon e-mail.
create or replace function public.is_me(u text) returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and u is not null and (
    case
      when exists (select 1 from public.profiles where username = u) then
        exists (select 1 from public.profiles p
                 where p.username = u
                   and (p.auth_uid = auth.uid() or (p.auth_uid is null and u = public.current_username())))
      else u = public.current_username() and u <> ''
    end)
$$;

grant execute on function public.username_from_email(text), public.current_username(), public.is_me(text) to anon, authenticated;

-- ── 3. Triggers de garde ──────────────────────────────────────────────────────────────────────────────────────────
-- Profil : le pseudo ne change jamais ; auth_uid est posé à la création / à la première écriture.
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;                 -- service_role / SQL Editor : pas de restriction
  if tg_op = 'INSERT' then
    new.auth_uid := auth.uid();
  else
    new.username := old.username;
    new.auth_uid := coalesce(old.auth_uid, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before insert or update on public.profiles
  for each row execute function public.guard_profile();

-- Contenus modifiables par tous uniquement sur certaines colonnes (j'aime, compteurs).
--   argument 0 : colonne propriétaire ('' = personne n'est propriétaire)
--   argument 1 : colonnes que n'importe quel compte connecté peut modifier (séparées par des virgules)
create or replace function public.guard_update_columns() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  owner_col text := coalesce(tg_argv[0], '');
  free_cols text[] := string_to_array(coalesce(tg_argv[1], ''), ',');
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  if auth.uid() is null then return new; end if;                 -- service_role / SQL Editor : pas de restriction
  if owner_col <> '' then
    if (n ->> owner_col) is distinct from (o ->> owner_col) then
      raise exception 'La colonne % ne peut pas être modifiée', owner_col using errcode = '42501';
    end if;
    if public.is_me(o ->> owner_col) then return new; end if;    -- le propriétaire peut tout modifier
  end if;
  if (n - free_cols) is distinct from (o - free_cols) then
    raise exception 'Seules les colonnes % sont modifiables par un autre compte', free_cols using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_cols on public.posts;
create trigger guard_cols before update on public.posts
  for each row execute function public.guard_update_columns('username', 'likes,comment_count');
drop trigger if exists guard_cols on public.comments;
create trigger guard_cols before update on public.comments
  for each row execute function public.guard_update_columns('username', 'likes');
drop trigger if exists guard_cols on public.forum_threads;
create trigger guard_cols before update on public.forum_threads
  for each row execute function public.guard_update_columns('username', 'likes,reply_count,last_reply_at');
drop trigger if exists guard_cols on public.forum_replies;
create trigger guard_cols before update on public.forum_replies
  for each row execute function public.guard_update_columns('username', 'likes');
drop trigger if exists guard_cols on public.direct_messages;
create trigger guard_cols before update on public.direct_messages
  for each row execute function public.guard_update_columns('', 'delivered_at,read_at');
drop trigger if exists guard_cols on public.game_invites;
create trigger guard_cols before update on public.game_invites
  for each row execute function public.guard_update_columns('', 'status');

-- ── 4. Règles d'accès (on supprime d'abord toutes les anciennes règles de ces tables) ─────────────────────────────
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
     where schemaname = 'public'
       and tablename in ('profiles','follows','user_votes','opquiz_user_stats','posts','comments','forum_threads',
                         'forum_replies','polls','direct_messages','user_blocks','game_invites','game_elo','game_rooms')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.profiles          enable row level security;
alter table public.follows           enable row level security;
alter table public.user_votes        enable row level security;
alter table public.opquiz_user_stats enable row level security;
alter table public.posts             enable row level security;
alter table public.comments          enable row level security;
alter table public.forum_threads     enable row level security;
alter table public.forum_replies     enable row level security;
alter table public.polls             enable row level security;
alter table public.direct_messages   enable row level security;
alter table public.user_blocks       enable row level security;
alter table public.game_invites      enable row level security;
alter table public.game_elo          enable row level security;
alter table public.game_rooms        enable row level security;

-- profiles : lisibles par les comptes connectés ; chacun écrit uniquement son propre profil
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated
  with check (username = public.current_username() and username <> '');
create policy profiles_update on public.profiles for update to authenticated
  using      (auth_uid = auth.uid() or (auth_uid is null and username = public.current_username()))
  with check (auth_uid = auth.uid() or (auth_uid is null and username = public.current_username()));

-- follows
create policy follows_select on public.follows for select to authenticated using (true);
create policy follows_insert on public.follows for insert to authenticated with check (public.is_me(follower));
create policy follows_delete on public.follows for delete to authenticated using (public.is_me(follower));

-- votes d'humeur et stats de quiz personnelles
create policy user_votes_select on public.user_votes for select to authenticated using (true);
create policy user_votes_insert on public.user_votes for insert to authenticated with check (public.is_me(username));
create policy user_votes_update on public.user_votes for update to authenticated
  using (public.is_me(username)) with check (public.is_me(username));

create policy opquiz_user_stats_select on public.opquiz_user_stats for select to authenticated using (public.is_me(username));
create policy opquiz_user_stats_insert on public.opquiz_user_stats for insert to authenticated with check (public.is_me(username));
create policy opquiz_user_stats_update on public.opquiz_user_stats for update to authenticated
  using (public.is_me(username)) with check (public.is_me(username));

-- feed + forum : lecture pour les comptes connectés ; créer / supprimer uniquement ses propres contenus ;
-- modifier (j'aime, compteurs) possible par tous, le reste étant bloqué par le trigger guard_cols
create policy posts_select on public.posts for select to authenticated using (true);
create policy posts_insert on public.posts for insert to authenticated with check (public.is_me(username));
create policy posts_update on public.posts for update to authenticated using (true) with check (true);
create policy posts_delete on public.posts for delete to authenticated using (public.is_me(username));

create policy comments_select on public.comments for select to authenticated using (true);
create policy comments_insert on public.comments for insert to authenticated with check (public.is_me(username));
create policy comments_update on public.comments for update to authenticated using (true) with check (true);
create policy comments_delete on public.comments for delete to authenticated using (public.is_me(username));

create policy forum_threads_select on public.forum_threads for select to authenticated using (true);
create policy forum_threads_insert on public.forum_threads for insert to authenticated with check (public.is_me(username));
create policy forum_threads_update on public.forum_threads for update to authenticated using (true) with check (true);
create policy forum_threads_delete on public.forum_threads for delete to authenticated using (public.is_me(username));

create policy forum_replies_select on public.forum_replies for select to authenticated using (true);
create policy forum_replies_insert on public.forum_replies for insert to authenticated with check (public.is_me(username));
create policy forum_replies_update on public.forum_replies for update to authenticated using (true) with check (true);
create policy forum_replies_delete on public.forum_replies for delete to authenticated using (public.is_me(username));

create policy polls_select on public.polls for select to authenticated using (true);
create policy polls_insert on public.polls for insert to authenticated with check (true);
create policy polls_update on public.polls for update to authenticated using (true) with check (true);

-- messages privés : uniquement l'expéditeur et le destinataire ; le destinataire seul peut poser « Vu » / « Lu »
create policy direct_messages_select on public.direct_messages for select to authenticated
  using (public.is_me(sender) or public.is_me(recipient));
create policy direct_messages_insert on public.direct_messages for insert to authenticated
  with check (public.is_me(sender));
create policy direct_messages_update on public.direct_messages for update to authenticated
  using (public.is_me(recipient)) with check (public.is_me(recipient));

-- blocages : visibles uniquement par la personne qui bloque
create policy user_blocks_select on public.user_blocks for select to authenticated using (public.is_me(blocker));
create policy user_blocks_insert on public.user_blocks for insert to authenticated with check (public.is_me(blocker));
create policy user_blocks_delete on public.user_blocks for delete to authenticated using (public.is_me(blocker));

-- invitations de jeu : uniquement les deux personnes concernées
create policy game_invites_select on public.game_invites for select to authenticated
  using (public.is_me(from_user) or public.is_me(to_user));
create policy game_invites_insert on public.game_invites for insert to authenticated with check (public.is_me(from_user));
create policy game_invites_update on public.game_invites for update to authenticated
  using (public.is_me(to_user)) with check (public.is_me(to_user));
create policy game_invites_delete on public.game_invites for delete to authenticated
  using (public.is_me(from_user) or public.is_me(to_user));

-- jeux : réservés aux comptes connectés (une partie met à jour l'ELO et la salle de l'adversaire)
create policy game_elo_select on public.game_elo for select to authenticated using (true);
create policy game_elo_insert on public.game_elo for insert to authenticated with check (true);
create policy game_elo_update on public.game_elo for update to authenticated using (true) with check (true);

create policy game_rooms_select on public.game_rooms for select to authenticated using (true);
create policy game_rooms_insert on public.game_rooms for insert to authenticated with check (true);
create policy game_rooms_update on public.game_rooms for update to authenticated using (true) with check (true);
create policy game_rooms_delete on public.game_rooms for delete to authenticated using (true);

commit;
