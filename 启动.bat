@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Please install Node.js 22 or later.
  pause
  exit /b 1
)
if not exist "node_modules\vite\package.json" (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node start.mjs --open
if errorlevel 1 pause
