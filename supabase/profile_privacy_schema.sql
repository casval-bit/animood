-- ─── Profile visibility — who can view a profile's content ────────────────
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- The `profiles` table itself predates any tracked schema file in this repo
-- (created directly in the dashboard), so this migration only adds the two
-- new columns to it. Same access model as the rest of the app (see
-- messages_schema.sql/blocks_schema.sql): no Supabase-Auth-based RLS, every
-- request uses the shared anon key — "friends only"/"custom" visibility is
-- enforced client-side (in UserProfileModal), not by the database.

alter table profiles add column if not exists visibility text not null default 'everyone';
alter table profiles add column if not exists visibility_allowed jsonb not null default '[]'::jsonb;

do $$ begin
  alter table profiles add constraint profiles_visibility_check
    check (visibility in ('everyone', 'friends', 'custom'));
exception when duplicate_object then null;
end $$;
