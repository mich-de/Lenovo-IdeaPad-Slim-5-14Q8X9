# Lenovo IdeaPad Slim 5 14Q8X9 (Snapdragon X Plus) — Hardware & Used Laptop Checkup Suite

Suite diagnostica completa progettata per ispezionare un **Lenovo IdeaPad Slim 5 14Q8X9 (Snapdragon X Plus)** appena acquistato **usato o ricondizionato**, verificando lo stato di usura reale dei componenti interni e testando interattivamente tutte le periferiche.

## Cosa controlla il programma

1. **Stato PC, Batteria, SSD e Verifica Originalità Componenti (Controllo Usato Automatico)**
   - **Verifica Originalità / Parti Sostituite (`evaluate_parts_originality`):** Confronta i dati hardware con le specifiche di fabbrica PSREF del **Lenovo IdeaPad Slim 5 14Q8X9 (Type 83HL)**:
     - **Scheda Madre & Scocca:** Verifica che il numero di serie coincida esattamente tra BIOS, SMBIOS Product e Chassis (scova cambi scheda madre o scocca inferiore).
     - **Batteria Originale 57Wh (FRU):** Controlla che il produttore sia un fornitore OEM Lenovo (Sunwoda, Simplo, Celxpert, BYD, LG - serie `L23*`) e che la capacità di fabbrica corrisponda a **57.000 mWh (57Wh)**, segnalando batterie compatibili non originali.
     - **SSD NVMe OEM vs Retail Sostituito:** Riconosce se l'SSD M.2 2242 PCIe 4.0 è quello di primo equipaggiamento Lenovo (Samsung PM9B1/BM9C1, SK Hynix BC901, WD SN740/SN560, Micron, Kioxia, UMIS) oppure se il precedente proprietario lo ha sostituito con un SSD retail aftermarket (Crucial, Kingston, Lexar, Sabrent, ecc.).
     - **Pannello Display (EDID):** Legge il codice produttore EDID dal chip del monitor (`SDC` Samsung OLED, `BOE`, `AUO`, `CSO`, `LEN`) per verificare se lo schermo è originale o è stato sostituito dopo una rottura.
   - **Salute Batteria Approfondita (`powercfg /batteryreport` + `root\WMI`):** Calcola la percentuale di salute reale confrontando la *Design Capacity* (57.000 mWh) con la *Full Charge Capacity* attuale, il livello di usura (`%`), i **cicli di carica**, la **tensione in tempo reale (`V`/`mV`)** e la **potenza di carica/scarica (`W`)**.
   - **Stato SMART SSD NVMe:** Interroga `Get-PhysicalDisk` e `Get-StorageReliabilityCounter` per leggere stato di salute (`Healthy`), temperatura, ore di accensione totali (*Power-On Hours*) ed eventuali errori di lettura/scrittura.
   - **Identità Hardware & Licenza:** Verifica modello esatto (`14Q8X9` / `83GH`), numero seriale BIOS, processore **Qualcomm Snapdragon X Plus**, memoria RAM LPDDR5x saldata, TPM 2.0 e stato di attivazione della licenza originale Windows 11.
2. **Gestione Dispositivi & Driver PnP**
   - Rileva automaticamente qualsiasi periferica con codice errore in Gestione Dispositivi (`ConfigManagerErrorCode != 0`).
   - Elenca in modo mirato: **Qualcomm Hexagon NPU**, **FastConnect 7800 Wi-Fi 7 / Bluetooth**, **Fotocamere FHD/IR**, **Audio Qualcomm Aqstic / Realtek / Senary**, **Lettore Impronte Digitali**, e **Controller USB4 / Type-C**.
3. **Test Schermo OLED/IPS, Tastiera e Touchpad**
   - **Dead Pixel & OLED Burn-In Tester:** Ciclo a tutto schermo con colori puri (Rosso, Verde, Blu, Bianco, Nero) + Grigio 20% per scovare pixel bruciati o aloni di burn-in sulla barra delle applicazioni.
   - **Matrice Tastiera Interattiva:** Premi ogni tasto per verificare che nessun contatto sia ossidato, duro o bloccato.
   - **Touchpad Precision Tester:** Area canvas per testare fluidità del puntatore, Click Sinistro, Click Destro e Scroll a 2 dita.
4. **Test Webcam, Microfoni e Casse Stereo**
   - **Live Webcam:** Verifica il sensore video e ricorda di controllare la levetta fisica *Privacy Shutter*.
   - **Altoparlanti Stereo:** Riproduce toni separati sul canale **Sinistro (L)**, **Destro (R)** e uno **Sweep in frequenza** per sentire se le membrane gracchiano.
   - **Spettrometro Microfono Dual-Array:** Grafico in tempo reale del volume e del picco vocale.
5. **Checklist Fisica Porte & Esportazione Report JSON**
   - Elenco interattivo per verificare entrambe le porte **USB-C 3.2 Gen 2 (Power Delivery + DisplayPort)**, le 2 porte **USB-A**, **HDMI**, **MicroSD**, cerniere, retroilluminazione (`Fn + Spazio`) e assenza di password BIOS.

---

## Come installare (`How to install`)

### Opzione A: Zero installazione (Eseguibili compilati in Go)
Il progetto include già gli eseguibili **standalone compilati in Go** (con tutta la dashboard HTML/CSS/JS incorporata nel binario tramite `//go:embed`):
- **[`LenovoCheckup_ARM64.exe`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/LenovoCheckup_ARM64.exe)** (6.3 MB) — Nativo per **Lenovo IdeaPad Slim 5 14Q8X9 (Snapdragon X Plus ARM64)**, non richiede Python né dipendenze esterne! *(Viene anche copiato automaticamente sul Desktop al primo avvio della ISO 26H2).*
- **[`LenovoCheckup_x64.exe`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/LenovoCheckup_x64.exe)** (6.9 MB) — Nativo per PC Windows x64 tradizionali.

Per ricompilarli da sorgente ([`main.go`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/main.go)):
```powershell
$env:GOOS="windows"; $env:GOARCH="arm64"; go build -ldflags="-s -w" -o LenovoCheckup_ARM64.exe main.go
$env:GOOS="windows"; $env:GOARCH="amd64"; go build -ldflags="-s -w" -o LenovoCheckup_x64.exe main.go
```

### Opzione B: Ambiente Python (`.venv`)
```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Come usare (`How to use`)

### Metodo 1: Doppio click diretto sull'eseguibile Go o sul launcher
- Sul Lenovo Snapdragon X Plus fai doppio click direttamente su **[`LenovoCheckup_ARM64.exe`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/LenovoCheckup_ARM64.exe)** (oppure su **[`AVVIA_CHECKUP.bat`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/AVVIA_CHECKUP.bat)** che riconosce automaticamente l'architettura ARM64/x64 e avvia il binario Go corrispondente).
- Il programma avvierà il server locale e aprirà automaticamente il browser su `http://127.0.0.1:8765`.

### Metodo 2: Da terminale PowerShell
```powershell
.\.venv\Scripts\python.exe backend\server.py
```
*(Se stai eseguendo il programma da un altro PC, copia l'intera cartella su una chiavetta USB e lanciala direttamente sul Lenovo IdeaPad Slim 5 14Q8X9).*

---

## Creazione ISO Pulita Windows 11 26H2 (ARM64) Zero-Bloat per Snapdragon X Plus

Il progetto include il generatore ufficiale **UUP Dump** già preconfigurato per scaricare e compilare l'ultima **Windows 11 26H2 ARM64 (Build 26300.9725 Retail - Italiano, Home & Pro)**:

- **Zero Bloatware & Zero Telemetria ([`CustomAppsList.txt`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/iso_builder/uup_pkg/CustomAppsList.txt), [`ConvertConfig.ini`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/iso_builder/uup_pkg/ConvertConfig.ini) & [`autounattend_snapdragon_14Q8X9.xml`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/iso_builder/autounattend_snapdragon_14Q8X9.xml)):**
  - Rimossi tutti i bloatware (Solitaire, Clipchamp, News, Meteo, Teams, Office Hub, Copilot/Widgets, Xbox Game Bar, PC Manager, WinZip e Microsoft Edge preinstallato con `SkipEdge=1` + blocco `EdgeUpdate`).
  - **Programmi Preinstallati di Default (100% Nativi ARM64 per Snapdragon X Plus):** Integrati direttamente nella ISO (`\sources\$OEM$\$$\Temp\OEM_Apps\`) gli installer offline nativi ARM64 di **7-Zip 26.05**, **Brave Browser Standalone**, **VLC Media Player 3.0.24** e **Notepad++ 8.9.8.1**, installati silenziosamente al primo avvio da [`INSTALLA_APP_DEFAULT.cmd`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/iso_builder/oem_apps/INSTALLA_APP_DEFAULT.cmd).
  - Disattivati tutti i servizi di telemetria (`DiagTrack`, `dmwappushservice`, `WerSvc`), le operazioni pianificate CEIP / Compatibility Appraiser, Advertising ID, suggerimenti Bing Cloud, Windows Recall e l'analisi AI in background (`DisableAIDataAnalysis=1`).
- **346 Driver Ufficiali Qualcomm Snapdragon X & Lenovo ARM64 Già Scaricati e Pronti (`iso_builder\uup_pkg\Drivers\`):**
  - Scaricati direttamente dai server ufficiali `download.lenovo.com` (rilascio Settembre 2026) ed estratti in formato `.inf` nativo:
    - **Qualcomm Core BSP8700 & Chipset SoC**
    - **Qualcomm FastConnect 7800 Wi-Fi 7 (DBS) & Bluetooth 5.4**
    - **Qualcomm Adreno X1 GPU (`31.0.160.0`) & Hexagon NPU**
    - **Qualcomm Aqstic Audio & Spectra 695 ISP Camera**
    - **Synaptics / Goodix Fingerprint Reader, WMI ACPI Bridge, Lenovo Power & Battery Management**
  - Include inoltre l'ultimo aggiornamento BIOS ufficiale per IdeaPad Slim 5 14Q8X9 (`83HL`) versione **`PUCN55WW`** nella cartella `BIOS_Update_14Q8X9\`.

### ISO Già Generata / Come Rigenerarla (`Zscaler-Safe & Zero-Admin`):
- **ISO Pronta:** **[`Win11_26H2_ARM64_IT_Lenovo_14Q8X9_Clean.iso`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/Win11_26H2_ARM64_IT_Lenovo_14Q8X9_Clean.iso)** (`6.60 GB`, UEFI ARM64 Bootable, Home + Pro). Scrivila su chiavetta USB con **Rufus** (schema partizione **GPT**, sistema destinazione **UEFI (non CSM)**).
- **Rigenerazione 100% compatibile Zscaler/EDR (senza `reg.exe`, `cscript` o privilegi Admin):**
  - Fai doppio click su **[`CREA_ISO_26H2_ARM64.bat`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/CREA_ISO_26H2_ARM64.bat)** (che esegue [`iso_builder/BUILD_ISO_SAFE.ps1`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/iso_builder/BUILD_ISO_SAFE.ps1) usando esclusivamente `wimlib-imagex.exe`, `offlinereg.exe` e `cdimage.exe` in user-mode).
  - I **346 driver `.inf`** vengono iniettati in `$WinPEDriver$` (caricati automaticamente da Windows Setup in WinPE e nel sistema finale).
  - Il file [`autounattend_snapdragon_14Q8X9.xml`](file:///D:/Lenovo-IdeaPad-Slim-5-14Q8X9/iso_builder/autounattend_snapdragon_14Q8X9.xml) è incorporato nella ISO (`\autounattend.xml` + `\sources\$OEM$\$$\Panther\unattend.xml`) per forzare **sempre la creazione dell'Account Locale** (`BypassNRO=1`, `HideOnlineAccountScreens=1`, `AllowMSA=0`), rimuovere tutto il bloatware/Edge/WinZip e installare **7-Zip, Brave, VLC, Notepad++ e `LenovoCheckup_ARM64.exe`**.
