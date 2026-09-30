@echo off
cd /d "C:\Users\brice maillard\animoodv08"
node --env-file=.env animood_sync.mjs --job=new-scores
node --env-file=.env animood_sync.mjs --job=rescore-2w
node --env-file=.env animood_sync.mjs --job=rescore-2m
