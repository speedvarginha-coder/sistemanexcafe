@echo off
setlocal
powershell -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "%~dp0LanHouseAgent.ps1" -Action Run
