@echo off
title Israeli Job Finder Launcher

cd /d "C:\Users\Avner\Desktop\Projects\israel-job-finder\israel-job-finder"

start "Israeli Job Finder Server" /min cmd /k "npm run dev"

timeout /t 3 /nobreak > nul

start http://localhost:5173

exit