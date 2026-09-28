@echo off
rem Startet den HTML Launcher (ohne Konsolenfenster).
cd /d "%~dp0"

if exist "dist\HTML-Launcher-win32-x64\HTML-Launcher.exe" (
  start "" "dist\HTML-Launcher-win32-x64\HTML-Launcher.exe" %*
) else if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" . %*
) else (
  echo Electron ist noch nicht installiert. Bitte einmal "npm install" ausfuehren.
  pause
)
