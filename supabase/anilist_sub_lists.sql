-- ─── Sub-lists imported from AniList ────────────────────────────────────────
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Stores { [malId]: string[] } — which of the user's AniList custom (sub-)lists
-- (e.g. "Favoris", "Rewatch 2025") each anime belongs to.
--
-- NOTE: deliberately named differently from `custom_lists` — that column
-- already exists (added on the `main` branch, not yet merged here) for a
-- separate, unrelated feature: user-created named lists with real anime IDs
-- ({id, name, animeIds}[]). Reusing that name would have collided/overwritten
-- real data for at least one account.

alter table profiles add column if not exists anilist_sub_lists jsonb not null default '{}';
