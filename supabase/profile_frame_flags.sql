-- Cadres de profil communs site web / appli de bureau.
-- Certains déblocages (installer l'appli de bureau, ouvrir l'appli de nuit, perdre à un jeu) sont comptés sur l'appli de bureau ;
-- l'appli les recopie ici pour que le site web les voie aussi. À exécuter une seule fois dans l'éditeur SQL de Supabase.
alter table profiles add column if not exists frame_flags jsonb default '{}'::jsonb;
