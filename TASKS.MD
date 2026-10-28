# Tasks - Lenovo IdeaPad Slim 5 14Q8X9 Checkup Suite

- [x] `[ENTERPRISE-ARCHITECT]` Define architecture and diagnostic checklist for used Lenovo IdeaPad Slim 5 14Q8X9.
- [x] `[DEVOPS-AGENT]` Setup `.venv`, `requirements.txt`, and portable launcher (`AVVIA_CHECKUP.bat`).
- [x] `[BACKEND-AGENT]` Implement `backend/diagnostics.py` (WMI/CIM hardware scanner, Battery Report XML parser, SMART disk health, PnP faulty device detector, port/driver verifier).
- [x] `[BACKEND-AGENT]` Implement `backend/server.py` (HTTP JSON API + static file server + automatic browser launch).
- [x] `[FRONTEND-AGENT]` Build `frontend/index.html`, `frontend/style.css`, and `frontend/app.js` (Telemetry dashboard + interactive tests: Display Dead-Pixel, Keyboard, Touchpad, Webcam, Mic, Stereo Speakers, Physical Checklist).
- [x] `[RELIABILITY-DEVOPS]` Verify backend telemetry execution and update `README.MD` and `GEMINI.MD`.
- [x] `[DEVOPS-AGENT]` Fetch latest Windows 11 26H2 ARM64 (`26300.9725`, `it-it`) package from UUP Dump API and configure zero-bloat + Snapdragon X Plus optimization (`ConvertConfig.ini`, `CustomAppsList.txt`, `autounattend_snapdragon_14Q8X9.xml`, `CREA_ISO_26H2_ARM64.bat`).
- [x] `[DEVOPS-AGENT]` Download and extract official updated Qualcomm Snapdragon X / Lenovo ARM64 `.inf` drivers + BIOS `PUCN55WW` from Lenovo servers into `iso_builder/uup_pkg/Drivers/` and `BIOS_Update_14Q8X9/`.
- [x] `[SECURITY-GOVERNANCE]` Strip all Windows 11 telemetry services (`DiagTrack`, `dmwappushservice`, `WerSvc`), scheduled tasks (CEIP/Compatibility Appraiser), Recall/Copilot AI analysis, and Advertising ID in `autounattend_snapdragon_14Q8X9.xml`.
- [x] `[BACKEND-AGENT]` & `[FRONTEND-AGENT]` Add OEM Originality & Replaced-Parts Audit (Motherboard/Chassis Serial match, 57Wh Battery FRU & Wear/Voltage/Wattage, OEM vs Retail NVMe SSD, Display EDID Panel code) to `backend/diagnostics.py` and `frontend/`.
- [x] `[DEVOPS-AGENT]` Download native ARM64 offline installers (`7-Zip`, `Brave Browser`, `VLC`, `Notepad++`), configure Edge/WinZip removal, inject `$OEM$` payload into `convert-UUP.cmd`, and launch UUP download & ISO build.
- [x] `[BACKEND-AGENT]` & `[DEVOPS-AGENT]` Implement and compile standalone Go native binaries (`main.go`, `go.mod`, `LenovoCheckup_ARM64.exe`, `LenovoCheckup_x64.exe`) with `//go:embed frontend/*` and push to GitHub.
- [x] `[RELIABILITY-DEVOPS]` Replace `reg.exe`/`cscript.exe` WSF dependencies with Zscaler-safe user-mode builder (`iso_builder/BUILD_ISO_SAFE.ps1`), free disk space on `D:` via NTFS Junction to `C:\UUP_Staging_14Q8X9`, build `Win11_26H2_ARM64_IT_Lenovo_14Q8X9_Clean.iso` (6.6 GB), and push builder updates to GitHub.
