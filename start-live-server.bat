@echo off
setlocal

cd /d "%~dp0"

set "NODE_BIN="
where node >nul 2>nul
if not errorlevel 1 set "NODE_BIN=node"

if not defined NODE_BIN (
  echo Node.js was not found.
  echo Use start-local-server.bat for cached static data, or install Node.js to refresh live data.
  echo.
  pause
  exit /b 1
)

if not defined PORT set "PORT=5173"

for /f "usebackq delims=" %%P in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$start=[int]$env:PORT; for($p=$start; $p -lt $start + 50; $p++){ $listener=$null; try { $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Parse('127.0.0.1'), $p); $listener.Start(); $listener.Stop(); Write-Output $p; exit 0 } catch { if($listener){ $listener.Stop() } } }; exit 1"`) do set "FREE_PORT=%%P"

if not defined FREE_PORT (
  echo No free port found.
  echo.
  pause
  exit /b 1
)

set "URL=http://127.0.0.1:%FREE_PORT%/index.html?api=1"

echo Yu-Gi-Oh! Seed Deck Builder live refresh server
echo Serving: %CD%
echo URL: %URL%
echo.
echo This mode can refresh live data from external sources.
echo Keep this window open while using the site.
echo Press Ctrl+C to stop the local server.
echo.

start "" "%URL%"
set "PORT=%FREE_PORT%"
%NODE_BIN% tools\serve-with-refresh.mjs
