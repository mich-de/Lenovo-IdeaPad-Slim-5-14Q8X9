# GEMINI.MD - Project Memory & Context

## Context
- **Target Device:** Lenovo IdeaPad Slim 5 14Q8X9 (Snapdragon X Plus, Windows 11 ARM64) - Used/Refurbished unit inspection.
- **Status:** Completed and verified.
- **Architecture:**
  - `main.go` & `go.mod`: Standalone Go application (`//go:embed frontend/*`) compiled into native zero-dependency executables **`LenovoCheckup_ARM64.exe`** (for Snapdragon X Plus) and **`LenovoCheckup_x64.exe`** (for x64 PCs).
  - `backend/diagnostics.py`: Collects WMI/CIM hardware telemetry, runs `powercfg /batteryreport /xml` for exact battery wear/cycles, queries `Get-PhysicalDisk` + `Get-StorageReliabilityCounter` for NVMe SMART health, and inspects `Get-PnpDevice` for driver errors and Snapdragon X Plus subsystems (NPU, FastConnect 7800, Camera, Audio, Biometrics, USB4).
  - `backend/server.py`: Zero-dependency multi-threaded HTTP server on port `8765` serving `/api/diagnostics`, `/api/live`, and the static frontend.
  - `frontend/`: Interactive dark-mode diagnostic bench for Display (OLED burn-in / dead pixels), Keyboard matrix, Touchpad precision/scroll, Webcam FHD, Stereo Speakers (L/R/Sweep), Dual-Array Microphone FFT, and 10-point physical inspection checklist.
  - `iso_builder/` (`BUILD_ISO_SAFE.ps1`) & `CREA_ISO_26H2_ARM64.bat`: Zscaler-safe, zero-Admin PowerShell/wimlib/offlinereg/cdimage builder for **Windows 11 26H2 ARM64** (`26300.9725`, UUID `f6722ac5-6c3c-4fb5-ab61-f3fa020c8a27`, `it-it`, Home + Pro) with zero bloatware, **346 official Qualcomm Snapdragon X & Lenovo ARM64 `.inf` drivers** injected via `$WinPEDriver$`, native ARM64 apps (`7-Zip`, `Brave`, `VLC`, `Notepad++`, `LenovoCheckup_ARM64.exe`), official BIOS `PUCN55WW` in `BIOS_Update_14Q8X9/`, and Zero-Telemetry + Local Account `autounattend_snapdragon_14Q8X9.xml`. Generated ISO: `D:\Lenovo-IdeaPad-Slim-5-14Q8X9\Win11_26H2_ARM64_IT_Lenovo_14Q8X9_Clean.iso` (6.6 GB).
  - **OEM Originality Audit (`evaluate_parts_originality`):** Verifies BIOS/Motherboard/Chassis serial consistency, 57Wh OEM Battery FRU & real-time health/wear/voltage/wattage, OEM M.2 2242 NVMe SSD vs retail replacement, and Display EDID manufacturer code.
