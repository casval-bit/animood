@echo off
rem AniMood - remet a jour le statut (en cours / termine / a venir) de tous les anime du calendrier.
rem Corrige : series terminees encore affichees, series recentes absentes (ex. JoJo Steel Ball Run). Dure ~1-2 min.
cd /d "%~dp0"
node --env-file=.env scripts\animood_sync.mjs --job=refresh-airing
node --env-file=.env scripts\animood_sync.mjs --job=broadcast
pause
