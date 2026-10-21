@echo off
cd /d "%~dp0"
node --env-file=.env scripts\sync_alt_titles.mjs %*
