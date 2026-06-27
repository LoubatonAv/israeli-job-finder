@echo off
title Israeli Job Finder Launcher

set ROOT=C:\Users\Avner\Desktop\Projects\israel-job-finder

if not exist "%ROOT%\server\package.json" (
  echo Cannot find server folder:
  echo %ROOT%\server
  pause
  exit /b 1
)

if not exist "%ROOT%\client\package.json" (
  echo Cannot find client folder:
  echo %ROOT%\client
  pause
  exit /b 1
)

start "Israeli Job Finder Server" /min cmd /k "cd /d "%ROOT%\server" && npm.cmd run dev"

timeout /t 3 /nobreak > nul

start "Israeli Job Finder Client" /min cmd /k "cd /d "%ROOT%\client" && npm.cmd run dev"

timeout /t 5 /nobreak > nul

start http://localhost:5173

exit
