-- ─── Titres alternatifs des animés (plateformes de streaming perso de l'appli de bureau) ─────────────────────
-- À exécuter UNE fois dans Supabase (SQL Editor). Sans danger si relancé. Ne touche à aucune donnée existante.
--   NULL = pas encore rempli · [] = vérifié, aucun titre trouvé · ["Titre A","Titre B",…] = variantes latines.
-- Rempli ensuite par : node --env-file=.env scripts/sync_alt_titles.mjs  (ou run_alt_titles.bat),
-- puis automatiquement pour chaque nouvel animé par sync_new_anime.mjs / animood_sync.mjs.

alter table anime_cache add column if not exists alt_titles jsonb;

-- demande à l'API de relire le schéma (sinon la nouvelle colonne peut mettre quelques minutes à apparaître)
notify pgrst, 'reload schema';
