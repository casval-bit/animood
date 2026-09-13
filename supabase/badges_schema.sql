-- ─── Badges + Bannière de profil ──────────────────────────────────────────────
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
--
-- Ce fichier ajoute les colonnes `banner` et `active_badge` à la table `profiles`
-- (qui existe déjà sur le projet partagé). Aucune nouvelle table n'est créée —
-- les badges sont définis côté client (src/badges/badges.js) comme les frames.
-- Le SQL est idempotent grâce à `add column if not exists`.

alter table profiles add column if not exists banner      text;
alter table profiles add column if not exists active_badge text;