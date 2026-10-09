-- Appli de bureau : « En boucle » (animé épinglé dans le cercle du profil).
-- À exécuter une fois dans l'éditeur SQL Supabase pour synchroniser entre appareils.
-- Sans ça, le choix reste mémorisé localement sur l'ordinateur.
alter table profiles add column if not exists spotlight integer;
