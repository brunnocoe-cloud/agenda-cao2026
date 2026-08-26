@echo off
cd /d "%~dp0"
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 800; Start-Process 'http://localhost:5173'"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
