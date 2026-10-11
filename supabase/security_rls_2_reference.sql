-- ═════════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ — ÉTAPE 2 : tables de référence (animés, humeurs, quiz, artistes, streaming)
-- ═════════════════════════════════════════════════════════════════════════════
-- À exécuter SEULEMENT quand :
--   1. l'étape 1 (security_rls_1_private.sql) fonctionne bien ;
--   2. les scripts de synchronisation tournent avec la clé de service (SUPABASE_SERVICE_KEY dans .env et dans les
--      secrets GitHub) — sinon ils seraient bloqués ici ;
-- Effet : un visiteur non connecté ne peut plus RIEN écrire dans ces tables. La lecture reste publique.
-- Les écritures faites par l'appli (compte connecté) restent possibles ; celles des scripts passent par la clé de service,
-- qui ignore ces règles. Retour en arrière : security_rls_rollback.sql.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  t text;
  r record;
  -- tables que l'appli écrit aussi (compte connecté) : insertion + mise à jour autorisées aux comptes connectés
  client_written text[] := array['anime_cache','artist_cache','opquiz_pool','opquiz_stats','mood_community_votes'];
  -- tables écrites uniquement par les scripts (clé de service) : lecture seule pour l'appli
  script_only    text[] := array['anime_streaming_regions','mood_pts_v2','mood_pts_v4','anime_sync_log'];
begin
  foreach t in array client_written || script_only loop
    if to_regclass('public.' || t) is null or (select c.relkind from pg_class c where c.oid = to_regclass('public.' || t)) <> 'r' then
      raise notice 'Table % absente (ou vue) : ignorée', t;
      continue;
    end if;
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_select', t);
    if t = any(client_written) then
      execute format('create policy %I on public.%I for insert to authenticated with check (true)', t || '_insert', t);
      execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', t || '_update', t);
    end if;
  end loop;
end $$;

commit;
