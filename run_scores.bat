@echo off
cd /d "%~dp0"
node --env-file=.env scripts\animood_sync.mjs --job=new-scores
node --env-file=.env scripts\animood_sync.mjs --job=rescore-2w
node --env-file=.env scripts\animood_sync.mjs --job=rescore-2m
