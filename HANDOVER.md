# HANDOVER.md — Lenovo IdeaPad Slim 5 14Q8X9 (Snapdragon X Plus ARM64)

**Data Handover:** 28/10/2026  
**Target Hardware:** Lenovo IdeaPad Slim 5 14Q8X9 — Machine Type `83HL` (Qualcomm Snapdragon X Plus `X1P-42-100` / `X1P-64-100`, Windows 11 ARM64)  
**Repository GitHub:**
- Principale (`mich-de`): `https://github.com/mich-de/Lenovo-IdeaPad-Slim-5-14Q8X9`
- Mirror (`micdeangelis2-lang`): `https://github.com/micdeangelis2-lang/Lenovo-IdeaPad-Slim-5-14Q8X9`

---

## 1. Riepilogo Esecutivo (Deliverables)

Il progetto fornisce due strumenti completi e pronti all'uso per ispezionare, verificare e formattare a regola d'arte un **Lenovo IdeaPad Slim 5 14Q8X9** acquistato usato/ricondizionato:

1. **Suite di Checkup Hardware, Originalita' Componenti & Periferiche (Go Standalone + Python `.venv`):**
   - Eseguibili nativi zero-dipendenze compilati in Go (`//go:embed frontend/*`):
     - [`LenovoCheckup_ARM64.exe`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/LenovoCheckup_ARM64.exe) (`6.58 MB`) — Nativo per Snapdragon X Plus ARM64.
     - [`LenovoCheckup_x64.exe`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/LenovoCheckup_x64.exe) (`7.27 MB`) — Nativo per PC Windows x64.
   - Launcher automatico: [`AVVIA_CHECKUP.bat`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/AVVIA_CHECKUP.bat).
2. **Immagine ISO Pulita Windows 11 26H2 ARM64 (Zero-Bloat, Zero-Telemetria, Account Locale, Driver & App Nativi):**
   - File ISO generato: **`D:\Lenovo-IdeaPad-Slim-5-14Q8X9\Win11_26H2_ARM64_IT_Lenovo_14Q8X9_Clean.iso`** (`6.60 GB`, Build `26300.9725`, Italiano, edizioni **Home + Pro**).
   - Builder Zscaler-safe / Zero-Admin: [`CREA_ISO_26H2_ARM64.bat`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/CREA_ISO_26H2_ARM64.bat) -> [`iso_builder/BUILD_ISO_SAFE.ps1`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/iso_builder/BUILD_ISO_SAFE.ps1).

---

## 2. Architettura del Progetto

| File / Cartella | Ruolo |
|---|---|
| [`main.go`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/main.go) / [`go.mod`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/go.mod) | Backend HTTP (`127.0.0.1:8765`) + Scanner WMI/SMART/Batteria/EDID/PnP in Go con frontend incorporato (`//go:embed frontend/*`). |
| [`LenovoCheckup_ARM64.exe`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/LenovoCheckup_ARM64.exe) | Binario Go standalone per Windows 11 ARM64 (pre-iniettato anche sul Desktop della ISO). |
| [`LenovoCheckup_x64.exe`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/LenovoCheckup_x64.exe) | Binario Go standalone per Windows 10/11 x64. |
| [`backend/diagnostics.py`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/backend/diagnostics.py) | Implementazione Python di riferimento per telemetria WMI, `powercfg /batteryreport`, SMART NVMe e audit originalita' OEM (`evaluate_parts_originality`). |
| [`backend/server.py`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/backend/server.py) | Server HTTP multi-thread Python sulla porta `8765` (`/api/diagnostics`, `/api/live`). |
| [`frontend/index.html`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/frontend/index.html) / [`frontend/app.js`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/frontend/app.js) / [`frontend/style.css`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/frontend/style.css) | Interfaccia diagnostica 5-Tab: Stato/Originalita'/Batteria, Driver PnP, Test Schermo OLED + Tastiera (con blocco shortcut `F1-F12`/`F5`) + Touchpad, Test Webcam (Live + Foto + Clip Video/Audio 5s) + Microfono (FFT + Registrazione/Riascolto 4s) + Casse Stereo, Checklist Porte & Export JSON. |
| [`iso_builder/BUILD_ISO_SAFE.ps1`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/iso_builder/BUILD_ISO_SAFE.ps1) | Builder ISO PowerShell in puro user-mode (`wimlib-imagex.exe` + `offlinereg.exe` + `cdimage.exe`), senza `reg.exe`, `cscript.exe` o hook IFEO (100% compatibile Zscaler/EDR). |
| [`iso_builder/autounattend_snapdragon_14Q8X9.xml`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/iso_builder/autounattend_snapdragon_14Q8X9.xml) | Risposta automatica OOBE: forza Account Locale (`BypassNRO=1`, `HideOnlineAccountScreens=1`, `AllowMSA=0`), disattiva telemetria (`AllowTelemetry=0`, `DiagTrack`, `dmwappushservice`, `WerSvc`), disattiva Recall/Copilot/BitLocker automatico e lancia `INSTALLA_APP_DEFAULT.cmd`. |
| [`iso_builder/oem_apps/`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/iso_builder/oem_apps/INSTALLA_APP_DEFAULT.cmd) | Installer offline nativi ARM64 (`7zip_arm64.exe`, `BraveStandaloneSilentArm64.exe`, `vlc_arm64.exe`, `notepadpp_arm64.exe`, `LenovoCheckup_ARM64.exe`) + script di debloat/rimozione Edge e WinZip. |
| `iso_builder/uup_pkg/Drivers/` | **346 driver `.inf` ufficiali Lenovo / Qualcomm Snapdragon X Plus ARM64** (`WinPE`: 69 `.inf`, `ALL`: 277 `.inf`). |
| `BIOS_Update_14Q8X9/` | Aggiornamento BIOS ufficiale Lenovo `PUCN55WW` (`pucn55ww.exe`) per IdeaPad Slim 5 14Q8X9 (`83HL`). |

---

## 3. Decisioni Tecniche & Problemi Risolti

1. **Blocco Zscaler / EDR e Policy `reg.exe` durante la creazione ISO:**
   - *Problema:* Lo script standard `convert-UUP.cmd` usa VBScript (`cscript //job:ELAV`), `reg.exe` e `regedit /S bin\dismAdd.reg` (`HKLM\...\Image File Execution Options\DismHost.exe`), che vengono bloccati da Zscaler/EDR e dalla policy di blocco `reg.exe`.
   - *Soluzione:* Creato [`iso_builder/BUILD_ISO_SAFE.ps1`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/iso_builder/BUILD_ISO_SAFE.ps1) che costruisce `install.wim` (Home + Pro), `winre.wim`, `boot.wim`, inietta i 346 driver in `\$WinPEDriver$\`, integra `autounattend.xml` + `$OEM$` e masterizza la ISO UEFI ARM64 usando esclusivamente binari portabili user-mode (`wimlib-imagex.exe`, `offlinereg.exe`, `cdimage.exe`).
2. **Esaurimento spazio su disco `D:` durante l'export WIM:**
   - *Problema:* Il disco `D:` aveva solo `0.19 GB` liberi a causa dei `9.8 GB` della cartella `UUPs`.
   - *Soluzione:* Spostata la cache `UUPs` in `C:\UUP_Staging_14Q8X9\UUPs` collegandola a `D:\Lenovo-IdeaPad-Slim-5-14Q8X9\iso_builder\uup_pkg\UUPs` tramite **NTFS Junction** trasparente, liberando oltre `10.5 GB` su `D:`.
3. **Fix `items.map is not a function` nella Dashboard:**
   - *Problema:* PowerShell `ConvertTo-Json` serializza le collezioni con 1 solo elemento (es. 1 lettore biometrico o 1 NPU) come oggetto `{...}` anziche' array `[{...}]`.
   - *Soluzione:* Aggiunto helper `asArray(v)` in [`frontend/app.js`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/frontend/app.js#L44-L48) e forzato `@(...)` / `_as_list()` in [`main.go`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/main.go#L125-L132) e [`backend/diagnostics.py`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/backend/diagnostics.py#L143-L148).
4. **Blocco tasti funzione (`F1`–`F12`, `F5` refresh) e Registrazione Audio/Video:**
   - Intercettazione `keydown`/`keyup` in fase di `capture: true` con `e.preventDefault()` + `e.stopPropagation()` + `navigator.keyboard.lock()` quando il tab Tastiera e' attivo.
   - Aggiunta registrazione vocale automatica di **4 secondi con riascolto immediato** per il test Microfono e registrazione **clip video+audio di 5 secondi + scatto foto** per la Webcam.

---

## 4. Procedura Operativa Consigliata (Quando arriva il Lenovo 14Q8X9)

### Fase 1: Verifica Hardware Preliminare (Prima di formattare)
1. Copia [`LenovoCheckup_ARM64.exe`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/LenovoCheckup_ARM64.exe) su una chiavetta USB e avvialo sul Lenovo IdeaPad Slim 5 14Q8X9.
2. Verifica nel **Tab 1 (Stato PC, Batteria, SSD & Originalita')**:
   - Punteggio globale e corrispondenza del Seriale tra BIOS, SMBIOS Product e Scocca.
   - Tabella **Verifica Originalita' Componenti**: Batteria 57Wh OEM (`Sunwoda`/`Simplo`/`Celxpert`/`LG`/`BYD`), SSD NVMe M.2 2242 OEM vs Retail, Codice EDID pannello OLED/IPS (`SDC`/`BOE`/`AUO`/`CSO`/`LEN`).
   - **Salute Batteria**: % usura, cicli di carica, tensione (`V`) e potenza istantanea (`W`).
   - **Salute SMART SSD**: ore di vita (`Power-On Hours`), temperatura (`°C`) ed errori.
3. Esegui i test interattivi nei **Tab 3, 4 e 5** (Schermo OLED burn-in/dead-pixel, Tastiera completa, Touchpad, Webcam 5s + Foto, Microfono 4s + Riascolto, Casse L/R/Sweep, porte USB-C PD) e clicca **Esporta Report JSON** in alto a destra.

### Fase 2: Installazione Pulita Windows 11 26H2 ARM64
1. Usa **Rufus** per scrivere `D:\Lenovo-IdeaPad-Slim-5-14Q8X9\Win11_26H2_ARM64_IT_Lenovo_14Q8X9_Clean.iso` su una chiavetta USB da almeno 8/16 GB:
   - **Schema partizione:** `GPT`
   - **Sistema destinazione:** `UEFI (non CSM)`
2. Avvia il Lenovo dalla chiavetta USB (`F12` o tasto Novo all'accensione).
3. Durante il setup:
   - I **346 driver Qualcomm/Lenovo ARM64** (inclusi Wi-Fi 7 FastConnect 7800, Touchpad, Tastiera, NVMe, USB4, Adreno GPU, NPU) vengono caricati automaticamente da `$WinPEDriver$`.
   - L'OOBE saltera' l'obbligo di Account Microsoft chiedendoti direttamente il **nome dell'Account Locale**.
   - Al primo login verranno rimossi eventuali bloatware/Edge/WinZip, installati **7-Zip, Brave Browser, VLC, Notepad++** (tutti nativi ARM64) e copiato **`LenovoCheckup_ARM64.exe` sul Desktop**.

---

## 5. Comandi Rapidi di Manutenzione / Ricompilazione

```powershell
# 1. Ricompilare gli eseguibili Go (ARM64 + x64) dopo modifiche al frontend o a main.go
$env:GOOS="windows"; $env:GOARCH="arm64"; go build -ldflags="-s -w" -o LenovoCheckup_ARM64.exe main.go
$env:GOOS="windows"; $env:GOARCH="amd64"; go build -ldflags="-s -w" -o LenovoCheckup_x64.exe main.go

# 2. Avviare il backend Python di sviluppo (porta 8765)
.\.venv\Scripts\python.exe backend\server.py

# 3. Rigenerare la ISO Windows 11 26H2 ARM64 (Zero-Admin / Zscaler-Safe)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\iso_builder\BUILD_ISO_SAFE.ps1
```
