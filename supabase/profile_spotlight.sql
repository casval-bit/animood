-- « En boucle » (animé épinglé dans le cercle du profil) — site web ET appli de bureau.
-- À exécuter UNE fois dans l'éditeur SQL de Supabase : c'est ce qui relie les deux
-- (un changement sur l'un apparaît sur l'autre). Sans ça, le choix reste local à chaque appareil.
alter table profiles add column if not exists spotlight integer;
