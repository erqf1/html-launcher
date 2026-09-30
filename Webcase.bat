@echo off
rem Startet Webcase (ohne Konsolenfenster).
cd /d "%~dp0"

if exist "dist\win-unpacked\Webcase.exe" (
  start "" "dist\win-unpacked\Webcase.exe" %*
) else if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" . %*
) else (
  echo Electron ist noch nicht installiert. Bitte einmal "npm install" ausfuehren.
  pause
)
