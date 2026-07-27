@echo off
chcp 65001 >nul
title نور - أذكاري وصلاتي
cd /d "%~dp0"

echo.
echo   ========================================
echo      نور - اضغط على الرابط او انتظر
echo      http://localhost:5177
echo   ========================================
echo.
echo   لاغلاق التطبيق: سكر هذي الشاشة السوداء
echo.

start "" http://localhost:5177
python -m http.server 5177

echo.
echo   تعذر التشغيل. تأكد ان بايثون منصب.
pause
