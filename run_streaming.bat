@echo off
cd /d "%~dp0"
node --env-file=.env scripts\animood_sync.mjs --job=streaming
