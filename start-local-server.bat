@echo off
setlocal

cd /d "%~dp0"

set "PYTHON_BIN="
where py >nul 2>nul
if not errorlevel 1 set "PYTHON_BIN=py -3"

if not defined PYTHON_BIN (
  where python >nul 2>nul
  if not errorlevel 1 set "PYTHON_BIN=python"
)

if not defined PYTHON_BIN (
  echo Python 3 was not found.
  echo Install Python 3, then run this file again.
  echo.
  echo Manual fallback:
  echo   cd /d "%CD%"
  echo   python -m http.server 5173 --bind 127.0.0.1
  echo.
  pause
  exit /b 1
)

if not defined PORT set "PORT=5173"

for /f "usebackq delims=" %%P in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$start=[int]$env:PORT; for($p=$start; $p -lt $start + 50; $p++){ $listener=$null; try { $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Parse('127.0.0.1'), $p); $listener.Start(); $listener.Stop(); Write-Output $p; exit 0 } catch { if($listener){ $listener.Stop() } } }; exit 1"`) do set "FREE_PORT=%%P"

:found_port
if not defined FREE_PORT (
  echo No free port found.
  echo.
  pause
  exit /b 1
)

set "URL=http://127.0.0.1:%FREE_PORT%/index.html"

echo Yu-Gi-Oh! Seed Deck Builder
echo Serving: %CD%
echo URL: %URL%
echo.
echo Keep this window open while using the site.
echo Press Ctrl+C to stop the local server.
echo.

start "" "%URL%"
%PYTHON_BIN% -m http.server %FREE_PORT% --bind 127.0.0.1
