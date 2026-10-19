@echo off
title Stop Harajat Server
echo 3000-portdagi server jarayonlari to'xtatilmoqda...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    taskkill /f /pid %%a
)
echo Server muvaffaqiyatli to'xtatildi.
pause
