@echo off
REM ── AniMood Desktop — Lancement en 1 commande ─────────────────────────────
REM Lance Vite (dev server) puis Electron dès que le serveur est prêt.
REM Ne nécessite PAS d'avoir electron dans node_modules — utilise le global si besoin.
REM Usage : double-cliquer OU appeler depuis PowerShell.

setlocal

REM ── 1. Trouver electron ──────────────────────────────────────────────────────
SET ELECTRON_BIN=

REM Electron local (node_modules)
IF EXIST "%~dp0node_modules\.bin\electron.cmd" (
  SET "ELECTRON_BIN=%~dp0node_modules\.bin\electron.cmd"
  GOTO found_electron
)
IF EXIST "%~dp0node_modules\.bin\electron" (
  SET "ELECTRON_BIN=%~dp0node_modules\.bin\electron"
  GOTO found_electron
)

REM Electron global
WHERE electron >nul 2>&1
IF %ERRORLEVEL%==0 (
  SET "ELECTRON_BIN=electron"
  GOTO found_electron
)

ECHO.
ECHO [ERREUR] electron introuvable.
ECHO Installe-le globalement : npm install -g electron
ECHO.
PAUSE
EXIT /B 1

:found_electron
ECHO [OK] Electron : %ELECTRON_BIN%

REM ── 2. Démarrer Vite en arrière-plan ────────────────────────────────────────
ECHO.
ECHO [1/2] Demarrage du serveur Vite...
START "AniMood-Vite" cmd /c "npm run dev"

REM ── 3. Attendre que http://localhost:5173 réponde ───────────────────────────
ECHO [2/2] Attente du serveur (max 30 s)...
SET /A COUNT=0
:wait_loop
  timeout /T 1 /nobreak >nul
  powershell -noprofile -command "try { $r=(Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop); exit 0 } catch { exit 1 }" >nul 2>&1
  IF %ERRORLEVEL%==0 GOTO vite_ready
  SET /A COUNT+=1
  IF %COUNT% GEQ 30 (
    ECHO [WARN] Vite n'a pas repondu en 30 s — on lance quand meme Electron.
    GOTO vite_ready
  )
GOTO wait_loop

:vite_ready
ECHO [OK] Serveur pret. Lancement d'Electron...
ECHO.

REM ── 4. Lancer Electron (bloquant) ───────────────────────────────────────────
SET NODE_ENV=development
"%ELECTRON_BIN%" "%~dp0."

REM ── 5. Quand Electron se ferme, tuer Vite ───────────────────────────────────
ECHO.
ECHO [INFO] Electron ferme. Arret de Vite...
taskkill /FI "WINDOWTITLE eq AniMood-Vite*" /F >nul 2>&1
REM Plus large : tuer le process node qui tourne vite
FOR /F "tokens=5" %%P IN ('netstat -ano 2^>nul ^| findstr ":5173"') DO (
  taskkill /PID %%P /F >nul 2>&1
)

ECHO [OK] Termine.
