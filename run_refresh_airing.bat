@echo off
rem AniMood - mise a jour QUOTIDIENNE complete (meme chose que GitHub Actions chaque jour) :
rem   nouveaux anime, statuts via LiveChart + AniList (a venir -> en cours -> termine), jour de diffusion,
rem   score / humeurs / plateformes / trailer des anime qui demarrent, note finale de ceux qui finissent.
rem Corrige : series terminees encore au calendrier, series recentes absentes (ex. JoJo Steel Ball Run). Quelques minutes.
cd /d "%~dp0"
node --env-file=.env scripts\animood_sync.mjs --job=daily
pause
