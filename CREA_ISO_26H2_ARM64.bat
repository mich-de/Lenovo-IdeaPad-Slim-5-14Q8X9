@echo off
cd /d "%~dp0"
title Creazione ISO Windows 11 26H2 ARM64 Clean - Lenovo IdeaPad Slim 5 14Q8X9 (Zscaler-Safe)
color 0B

echo ============================================================================
echo   LENOVO IDEAPAD SLIM 5 14Q8X9 (Snapdragon X Plus ARM64)
echo   BUILDER ISO WINDOWS 11 26H2 (Build 26300.9725 - Italiano) ZSCALER-SAFE
echo ============================================================================
echo.
echo   Caratteristiche della ISO generata:
echo   - Nessun uso di reg.exe, cscript.exe o IFEO (100%% compatibile Zscaler/EDR)
echo   - Nessun privilegio di Amministratore richiesto (wimlib + offlinereg + cdimage)
echo   - Zero Bloatware (Rimossi Clipchamp, News, Meteo, Solitaire, Teams, Xbox, Edge, WinZip)
echo   - 346 Driver ufficiali Lenovo/Qualcomm Snapdragon X Plus integrati ($WinPEDriver$)
echo   - App ARM64 preinstallate: 7-Zip, Brave Browser, VLC, Notepad++, LenovoCheckup_ARM64
echo   - Account Locale obbligatorio + Zero Telemetria (autounattend.xml integrato)
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0iso_builder\BUILD_ISO_SAFE.ps1"

echo.
pause
