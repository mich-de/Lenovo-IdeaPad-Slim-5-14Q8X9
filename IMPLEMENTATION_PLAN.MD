# Implementation Plan - Lenovo IdeaPad Slim 5 14Q8X9 Hardware Checkup Suite

## 1. Overview & Architecture
- **[ENTERPRISE-ARCHITECT]** Dual-Runtime Modular Monolith Web Dashboard:
  1. **Standalone Go Native Executables (`main.go` -> `LenovoCheckup_ARM64.exe` & `LenovoCheckup_x64.exe`):** Single-file portable binaries (`//go:embed frontend/*`) requiring zero Python/Node installation.
  2. **Python `.venv` Reference Backend (`backend/server.py`, `backend/diagnostics.py`):** Identical REST API (`/api/diagnostics`, `/api/live`).
- **Zero-External-Bloat Strategy:** Uses native Windows CIM/WMI, `powercfg`, `Get-PhysicalDisk`, `Get-PnpDevice`, and HTML5 Web APIs (`navigator.mediaDevices`, `AudioContext`, Fullscreen Canvas, Keyboard/Gamepad/Touch events) so it runs offline or out-of-the-box on a freshly arrived used laptop.

## 2. Diagnostic Modules
### `[BACKEND]` System & Hardware Telemetry (`backend/diagnostics.py`)
1. **System & BIOS Identity:** Manufacturer, Model (`83GH` / `14Q8X9`), Serial Number, BIOS Version, Windows OS Build, Activation Status, Boot Time.
2. **CPU & NPU (Snapdragon X Plus X1P-42-100 / X1P-64-100):** Cores, Logical Processors, Architecture (ARM64/x64), Clock Speed, NPU/Hexagon PnpDevice status.
3. **Battery Health Audit (Crucial for Used Laptops):**
   - Queries WMI (`BatteryStaticData`, `BatteryFullChargedCapacity`, `BatteryCycleCount`, `Win32_Battery`) + parses `powercfg /batteryreport /output XML`.
   - Computes **Wear Level %**, Design Capacity vs Full Charge Capacity (mWh), Cycle Count, Chemistry.
4. **Storage & SMART Audit:**
   - Queries `Get-PhysicalDisk`, `Get-StorageReliabilityCounter`, and `Win32_DiskDrive`.
   - Reports HealthStatus, OperationalStatus, MediaType (NVMe SSD), Temperature, Wear, Read/Write Errors, Power-On Hours (if exposed by controller), Free/Total Space.
5. **RAM & Display Adapter:** Total Capacity (LPDDR5x), Speed, GPU/Adreno Driver Version, Native Resolution & Refresh Rate.
6. **PnP Device Manager Audit:**
   - Scans `Get-PnpDevice` for any hardware with `ConfigManagerErrorCode -ne 0` (missing drivers, faulty sensors, broken USB controllers).
   - Explicitly checks key subsystems: Wi-Fi (FastConnect 7800 / Qualcomm), Bluetooth, Camera, Audio (Realtek/Senary/Qualcomm Aqstic), Biometrics (Windows Hello IR / Fingerprint), HID / Touchpad, USB4 / Type-C controllers.

### `[FRONTEND]` Interactive Peripheral Bench (`frontend/index.html`, `frontend/app.js`, `frontend/style.css`)
1. **Executive Refurbished Score & Hardware Summary:** Instant PASS / WARN / FAIL badges for Battery Wear, Disk Health, Driver Errors, and Specs match.
2. **Dead Pixel & OLED/IPS Uniformity Tester:** Fullscreen interactive color cycler (Pure Black, Pure White, Red, Green, Blue, Gray 50%, Grid) to spot dead/stuck pixels, backlight bleed, or OLED burn-in.
3. **Keyboard Matrix & Ghosting Tester:** Full visual layout (ISO/ANSI + Fn keys) highlighting pressed keys and locking "tested" keys in green to verify 100% of switches work.
4. **Touchpad & Multi-Touch / Precision Tester:** Interactive canvas measuring pointer smoothness, left/right/middle click, two-finger scroll, and pinch gestures.
5. **Webcam & IR Camera Live Inspector:** WebRTC stream with resolution/FPS readout + snapshot test.
6. **Microphone & Speakers Stereo Test:**
   - Left Channel, Right Channel, and Frequency Sweep synthesizer via Web Audio API.
   - Real-time FFT / Volume Meter for built-in dual array microphones.
7. **Connectivity & Ports Checklist + Export Report:** Interactive verification for USB-C (PD Charging + DisplayPort), USB-A, HDMI, MicroSD, Headphone Jack, Hinge/Chassis inspection, and 1-click JSON/Print Report export.

### `[DEVOPS-AGENT]` Clean Windows 11 26H2 ARM64 ISO Builder (`iso_builder/`)
1. **UUP Dump Integration & Zscaler-Safe Builder (`iso_builder/BUILD_ISO_SAFE.ps1`):** Queries `https://api.uupdump.net` for latest Windows 11 **26H2 ARM64** (`26300.9725`, UUID `f6722ac5-6c3c-4fb5-ab61-f3fa020c8a27`, Italian `it-it`, Home + Pro) and builds the bootable UEFI ISO in pure user-mode via `wimlib-imagex.exe`, `offlinereg.exe`, and `cdimage.exe` (zero `reg.exe`, `cscript.exe`, or IFEO hooks).
2. **De-Bloat & Compression (`ConvertConfig.ini` + `CustomAppsList.txt`):**
   - `CustomList=1`, `SkipEdge=1`, `Cleanup=1`, `ResetBase=1`, `AddDrivers=1`.
   - Retains only Windows Store, Defender (`SecHealthUI`), Winget (`DesktopAppInstaller`), Terminal, Notepad, Calculator, Camera, Snipping Tool, **Microsoft Prism ARM64 compatibility (`ApplicationCompatibilityEnhancements`)**, and hardware media codecs (AV1/HEVC/VP9/Dolby) for the Qualcomm Adreno X1 GPU.
3. **Official Internet-Fetched ARM64 Drivers (`iso_builder/uup_pkg/Drivers/` + `BIOS_Update_14Q8X9/`):**
   - Downloaded directly from `download.lenovo.com` and extracted into raw `.inf`/`.sys`/`.cat` form using `innoextract`:
     - Qualcomm Integrated System Software & Firmware (`n42qq22w.exe`)
     - Lenovo Snapdragon X ARM64 SCCM Driver Pack (`tp_t14s_gen6_21n1-21n2_w11_25_202609.exe`, Settembre 2026: BSP8700 Core, FastConnect 7800 Wi-Fi 7 & BT 5.4, Adreno GPU `31.0.160.0`, Aqstic Audio, Spectra 695 Camera, Hexagon NPU)
     - Lenovo WinPE 11 ARM64 Core Drivers (`tp_8cxg4_pe11_202507.exe`)
     - Synaptics & Goodix Fingerprint Reader, WMI ACPI Bridge, Lenovo Power & Battery Management (`n42gf12w`, `n42ab08w`, `n1fupa3w`, `r19vu23w`)
     - Official BIOS Update `PUCN55WW` (Settembre 2026) for IdeaPad Slim 5 14Q8X9 (`83HL`).
4. **Zero-Telemetry & Post-Install Optimization (`autounattend_snapdragon_14Q8X9.xml`):**
   - Bypasses Microsoft Account (`BypassNRO=1`, `HideOnlineAccountScreens=1`, `AllowMSA=0`), disables `AllowTelemetry=0`, disables `DiagTrack`, `dmwappushservice`, `WerSvc`, disables Compatibility Appraiser & CEIP scheduled tasks, disables Advertising ID, Bing Cloud Search, Consumer Features, Widgets, Copilot, and Windows Recall (`DisableAIDataAnalysis=1`).
   - Pre-packages native **ARM64** offline installers in `iso_builder/oem_apps/` (`7-Zip 26.05 ARM64`, `Brave Browser Standalone Silent ARM64`, `VLC Media Player 3.0.24 ARM64`, `Notepad++ 8.9.8.1 ARM64`) and injects them into `ISOFOLDER\sources\$OEM$\$$\Temp\OEM_Apps\` along with `INSTALLA_APP_DEFAULT.cmd` to silently install them at first logon while purging any WinZip or Edge remnants.
5. **Originality & Replaced-Parts Verification (`evaluate_parts_originality` in `backend/diagnostics.py`):**
   - Cross-checks BIOS/Product/Chassis Serial Numbers, verifies soldered Snapdragon X Plus + LPDDR5x-8448, checks battery FRU manufacturer (Sunwoda/Simplo/Celxpert/BYD/LG) and 57,000 mWh nominal capacity, distinguishes OEM M.2 2242 NVMe SSDs from aftermarket retail replacements, and inspects WMI EDID display panel codes (`SDC`/`BOE`/`AUO`/`CSO`/`LEN`).
