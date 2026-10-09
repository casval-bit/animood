-- ─── Disponibilité streaming PAR PAYS (appli de bureau) ──────────────────────
-- À exécuter une fois dans l'éditeur SQL de Supabase (Project → SQL Editor → New query).
--
-- Remplie par scripts/sync_streaming_regions.mjs (données JustWatch via l'API TMDB).
-- Une ligne par (animé, pays). providers = [{"name":"Netflix","kind":"flatrate"}, …]
--   kind : flatrate (abonnement) | free | ads (gratuit avec pub)
-- Une ligne avec providers = [] veut dire « vérifié : aucune plateforme dans ce pays ».
-- Pas de ligne = pas encore vérifié (l'appli retombe alors sur l'ancien comportement).

create table if not exists anime_streaming_regions (
  mal_id      int  not null,
  region      text not null,            -- code pays ISO 3166-1 (FR, US, GB, IT, JP…)
  providers   jsonb not null default '[]',
  tmdb_id     int,
  tmdb_type   text,                      -- tv | movie
  updated_at  timestamptz not null default now(),
  primary key (mal_id, region)
);

create index if not exists anime_streaming_regions_region_idx on anime_streaming_regions(region);

alter table anime_streaming_regions enable row level security;

drop policy if exists "asr_select" on anime_streaming_regions;
drop policy if exists "asr_insert" on anime_streaming_regions;
drop policy if exists "asr_update" on anime_streaming_regions;
create policy "asr_select" on anime_streaming_regions for select using (true);
create policy "asr_insert" on anime_streaming_regions for insert with check (true);
create policy "asr_update" on anime_streaming_regions for update using (true) with check (true);
