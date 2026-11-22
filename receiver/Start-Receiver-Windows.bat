@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or later is required.
  echo Install Node.js LTS, then run this file again.
  pause
  exit /b 1
)

for /f "tokens=1" %%v in ('node -p "Number(process.versions.node.split('.')[0])"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 20 (
  echo Node.js 20 or later is required. Current major version: %NODE_MAJOR%
  pause
  exit /b 1
)

if not exist "node_modules\ws" (
  echo Installing DSK Audio Receiver dependencies...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo Starting DSK Audio Receiver on port 8765...
call npm start
pause
