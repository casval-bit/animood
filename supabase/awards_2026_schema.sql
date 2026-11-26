-- ─── AniMood 2026 : le top 3 de chaque membre ───────────────────────────────────────────────────────────────────
-- À lancer UNE FOIS dans Supabase → SQL Editor → New query. Peut être relancé sans risque (rien n'est effacé).
--
-- Chaque membre choisit 3 animés sortis en 2026 : un 1er, un 2e, un 3e. Un seul vote par membre : le modifier remplace le précédent.
-- Les points (1er = 3, 2e = 2, 3e = 1) et les classements (communauté / amis, plus de n°1, meilleur ratio de n°1) sont calculés dans
-- l'appli (src/utils/awards2026.js) à partir de ces lignes : aucune fonction SQL à maintenir.
--
-- Qui voit quoi : comme pour les votes d'humeur (user_votes), les comptes connectés peuvent lire les votes (c'est ce qui permet le
-- « top 3 des amis ») ; chacun ne peut créer / modifier / supprimer que son propre vote.
--
-- Ordre avec les étapes de sécurité : ce fichier marche AVANT comme APRÈS supabase/security_rls_1_private.sql.
--   • avant l'étape 1 : mêmes règles ouvertes que les autres tables (clé publique partagée) ;
--   • après l'étape 1 : lecture réservée aux comptes connectés, écriture réservée à son propre pseudo (fonction public.is_me).
-- Si tu lances l'étape 1 de sécurité APRÈS ce fichier, relance simplement ce fichier une fois de plus pour passer aux règles protégées.

create table if not exists public.awards_2026 (
  username   text primary key,
  pick1      bigint not null check (pick1 > 0),     -- 1er  : 3 points
  pick2      bigint not null check (pick2 > 0),     -- 2e   : 2 points
  pick3      bigint not null check (pick3 > 0),     -- 3e   : 1 point
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint awards_2026_distinct check (pick1 <> pick2 and pick1 <> pick3 and pick2 <> pick3)
);

-- Recherche par animé (utile si on veut compter les votes d'un animé précis) — les 3 colonnes de choix
create index if not exists awards_2026_pick1_idx on public.awards_2026 (pick1);
create index if not exists awards_2026_pick2_idx on public.awards_2026 (pick2);
create index if not exists awards_2026_pick3_idx on public.awards_2026 (pick3);

alter table public.awards_2026 enable row level security;

-- Règles d'accès : on repart de zéro à chaque lancement (« create policy » n'a pas de « if not exists »)
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'awards_2026' loop
    execute format('drop policy %I on public.awards_2026', r.policyname);
  end loop;

  if to_regprocedure('public.is_me(text)') is not null then
    -- Étape 1 de sécurité déjà lancée : lecture pour les comptes connectés, écriture uniquement sur son propre pseudo
    create policy awards_2026_select on public.awards_2026 for select to authenticated using (true);
    create policy awards_2026_insert on public.awards_2026 for insert to authenticated with check (public.is_me(username));
    create policy awards_2026_update on public.awards_2026 for update to authenticated
      using (public.is_me(username)) with check (public.is_me(username));
    create policy awards_2026_delete on public.awards_2026 for delete to authenticated using (public.is_me(username));
  else
    -- Pas encore d'étape de sécurité : même modèle ouvert que les autres tables (voir README → Database)
    create policy awards_2026_select on public.awards_2026 for select using (true);
    create policy awards_2026_insert on public.awards_2026 for insert with check (true);
    create policy awards_2026_update on public.awards_2026 for update using (true) with check (true);
    create policy awards_2026_delete on public.awards_2026 for delete using (true);
  end if;
end $$;

-- Demande à l'API de relire le schéma tout de suite : la nouvelle table est utilisable sans attendre (inoffensif si c'est déjà fait)
notify pgrst, 'reload schema';

-- Contrôle (facultatif) : doit afficher 4 règles et « rls_active = true »
-- select policyname, cmd, roles from pg_policies where tablename = 'awards_2026' order by cmd;
-- select relrowsecurity as rls_active from pg_class where oid = 'public.awards_2026'::regclass;
