@echo off
title Installazione App Default ARM64 (7-Zip, Brave, VLC, Notepad++), Driver & Debloat
set "APPDIR=%SystemDrive%\Windows\Temp\OEM_Apps"

echo [*] Installazione eventuali driver Qualcomm / Lenovo ARM64 residui...
if exist "%SystemDrive%\Windows\Temp\OEM_Drivers" (
    pnputil.exe /add-driver "%SystemDrive%\Windows\Temp\OEM_Drivers\*.inf" /subdirs /install >nul 2>&1
    rmdir /s /q "%SystemDrive%\Windows\Temp\OEM_Drivers" >nul 2>&1
)

echo [*] Rimozione Bloatware Inbox Windows 11, Microsoft Edge e WinZip...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$bloat = @('*Clipchamp*','*BingNews*','*BingWeather*','*MicrosoftSolitaireCollection*','*MicrosoftTeams*','*MicrosoftOfficeHub*','*PowerAutomateDesktop*','*QuickAssist*','*Todos*','*WindowsFeedbackHub*','*WindowsMaps*','*ZuneMusic*','*GetHelp*','*Getstarted*','*People*','*DevHome*','*OutlookForWindows*','*GamingApp*','*XboxGamingOverlay*','*XboxIdentityProvider*','*XboxSpeechToTextOverlay*','*XboxTCUI*','*CrossDevice*','*YourPhone*','*Copilot*','*WinZip*'); foreach ($p in $bloat) { Get-AppxPackage -AllUsers $p -ErrorAction SilentlyContinue | Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue; Get-AppxProvisionedPackage -Online | Where-Object { $_.DisplayName -like $p } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue }" >nul 2>&1

winget uninstall --id Corel.WinZip --silent --accept-source-agreements >nul 2>&1
winget uninstall --name "WinZip" --silent --accept-source-agreements >nul 2>&1

:: Blocca reinstallazione automatica di Microsoft Edge via Windows Update
reg.exe add "HKLM\SOFTWARE\Microsoft\EdgeUpdate" /v DoNotUpdateToEdgeWithChromium /t REG_DWORD /d 1 /f >nul 2>&1
reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\EdgeUpdate" /v InstallDefault /t REG_DWORD /d 0 /f >nul 2>&1

if exist "C:\Program Files (x86)\Microsoft\Edge\Application" (
    for /d %%D in ("C:\Program Files (x86)\Microsoft\Edge\Application\*") do (
        if exist "%%D\Installer\setup.exe" (
            "%%D\Installer\setup.exe" --uninstall --system-level --verbose-logging --force-uninstall >nul 2>&1
        )
    )
)

echo [*] Installazione 7-Zip 26.05 (Nativo ARM64)...
if exist "%APPDIR%\7zip_arm64.exe" (
    start /wait "" "%APPDIR%\7zip_arm64.exe" /S
)

echo [*] Installazione VLC Media Player 3.0.24 (Nativo ARM64)...
if exist "%APPDIR%\vlc_arm64.exe" (
    start /wait "" "%APPDIR%\vlc_arm64.exe" /L=1040 /S
)

echo [*] Installazione Notepad++ 8.9.8.1 (Nativo ARM64)...
if exist "%APPDIR%\notepadpp_arm64.exe" (
    start /wait "" "%APPDIR%\notepadpp_arm64.exe" /S
)

echo [*] Installazione Brave Browser Standalone (Nativo ARM64)...
if exist "%APPDIR%\BraveStandaloneSilentArm64.exe" (
    start /wait "" "%APPDIR%\BraveStandaloneSilentArm64.exe"
)

echo [*] Copia LenovoCheckup_ARM64.exe (Go Standalone) sul Desktop...
if exist "%APPDIR%\LenovoCheckup_ARM64.exe" (
    copy /y "%APPDIR%\LenovoCheckup_ARM64.exe" "%PUBLIC%\Desktop\LenovoCheckup_ARM64.exe" >nul 2>&1
)

echo [*] Pulizia installer temporanei...
rmdir /s /q "%APPDIR%" >nul 2>&1
exit /b 0
