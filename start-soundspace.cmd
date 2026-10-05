@echo off
setlocal
cd /d "%~dp0"
title SOUND//SPACE - Development Server

if exist ".tools\node-v24.21.0-win-x64\node.exe" (
  set "SOUNDSPACE_NODE=%~dp0.tools\node-v24.21.0-win-x64\node.exe"
) else (
  where node >nul 2>&1
  if errorlevel 1 (
    echo Node.js is missing. Install Node.js LTS, then try again.
    pause
    exit /b 1
  )
  set "SOUNDSPACE_NODE=node"
)

if not exist "node_modules\vite\bin\vite.js" (
  echo Dependencies are missing. Run npm install in this folder first.
  pause
  exit /b 1
)

echo Starting SOUND//SPACE at http://127.0.0.1:5174/
echo Keep this window open while using the site. Press Ctrl+C to stop.
echo.
"%SOUNDSPACE_NODE%" "node_modules\vite\bin\vite.js"
if errorlevel 1 (
  echo.
  echo The server could not start. See the message above.
  echo If port 5174 is already in use, an existing server may already be running.
  pause
  exit /b 1
)
