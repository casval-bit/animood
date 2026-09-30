@echo off
rem AniMood sync - moods job. Needs SUPABASE_SERVICE_KEY in .env (see scripts/animood_sync.mjs)
cd /d "%~dp0"
node --env-file=.env scripts\animood_sync.mjs --job=moods
pause
