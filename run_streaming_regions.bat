@echo off
rem AniMood - disponibilite streaming par pays (JustWatch via TMDB). Besoin de TMDB_KEY, SUPABASE_URL, SUPABASE_ANON dans .env
rem Pour ajouter un pays : run_streaming_regions.bat --regions=FR,US,GB,IT,JP,DE,ES,CA
cd /d "%~dp0"
node --env-file=.env scripts\sync_streaming_regions.mjs %*
pause
