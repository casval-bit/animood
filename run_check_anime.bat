@echo off
rem AniMood - diagnostic d'un anime : que contient la base, que disent AniList et MAL ?
cd /d "%~dp0"
set /p TITRE=Titre a verifier (ex: steel ball run) : 
node --env-file=.env scripts\check_anime.mjs "%TITRE%"
pause
