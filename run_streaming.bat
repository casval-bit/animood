@echo off
cd /d "C:\Users\brice maillard\animoodv08"
node --env-file=.env animood_sync.mjs --job=streaming
