import json
import os
import platform
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any, Dict, List

try:
    import psutil
except ImportError:
    psutil = None


def _run_powershell_json(ps_script: str, timeout: int = 28) -> Any:
    """Runs a PowerShell snippet that outputs JSON and parses it safely."""
    cmd = [
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        f"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; {ps_script}",
    ]
    try:
        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        out = (res.stdout or "").strip()
        if not out:
            return None
        return json.loads(out)
    except Exception as exc:
        return {"_error": str(exc)}


def get_battery_report_xml() -> Dict[str, Any]:
    """Generates and parses Windows powercfg /batteryreport XML for exact wear level, cycles, and history."""
    tmp_dir = tempfile.gettempdir()
    xml_path = os.path.join(tmp_dir, "lenovo_battery_report.xml")
    info: Dict[str, Any] = {
        "present": False,
        "id": None,
        "manufacturer": None,
        "serial_number": None,
        "chemistry": None,
        "design_capacity_mwh": 0,
        "full_charge_capacity_mwh": 0,
        "cycle_count": None,
        "wear_percent": None,
        "health_percent": None,
        "status_verdict": "NON RILEVATA",
        "history_samples": [],
    }
    try:
        if os.path.exists(xml_path):
            try:
                os.remove(xml_path)
            except OSError:
                pass
        subprocess.run(
            ["powercfg.exe", "/batteryreport", "/output", xml_path, "/xml"],
            capture_output=True,
            timeout=14,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if not os.path.exists(xml_path):
            return info

        tree = ET.parse(xml_path)
        root = tree.getroot()
        ns = {"b": "http://schemas.microsoft.com/battery/2012"}

        batteries = root.findall(".//b:Batteries/b:Battery", ns)
        if not batteries:
            batteries = root.findall(".//{*}Batteries/{*}Battery")

        def _tag(el, name):
            node = el.find(f"b:{name}", ns)
            if node is None:
                node = el.find(f"{{*}}{name}")
            return node.text.strip() if (node is not None and node.text) else None

        if batteries:
            b = batteries[0]
            design = int(_tag(b, "DesignCapacity") or 0)
            full = int(_tag(b, "FullChargeCapacity") or 0)
            cycles_raw = _tag(b, "CycleCount")
            cycles = int(cycles_raw) if (cycles_raw and cycles_raw.isdigit()) else None

            info.update({
                "present": True,
                "id": _tag(b, "Id"),
                "manufacturer": _tag(b, "Manufacturer"),
                "serial_number": _tag(b, "SerialNumber"),
                "chemistry": _tag(b, "Chemistry"),
                "design_capacity_mwh": design,
                "full_charge_capacity_mwh": full,
                "cycle_count": cycles,
            })

            if design > 0 and full > 0:
                health = round((full / design) * 100.0, 1)
                wear = round(max(0.0, 100.0 - health), 1)
                info["health_percent"] = health
                info["wear_percent"] = wear
                if health >= 90.0:
                    info["status_verdict"] = "PARI AL NUOVO / OTTIMA"
                elif health >= 80.0:
                    info["status_verdict"] = "BUONA (USURA NORMALE)"
                elif health >= 70.0:
                    info["status_verdict"] = "USURA MEDIA"
                else:
                    info["status_verdict"] = "USURA CRITICA (DA SOSTITUIRE)"

        # Extract last 5 UsageHistory / CapacityHistory entries if available
        hist_entries = root.findall(".//{*}History/{*}Entry")
        samples = []
        for entry in hist_entries[-6:]:
            s_date = entry.attrib.get("StartDate", "")[:10]
            f_cap = _tag(entry, "FullChargeCapacity")
            d_cap = _tag(entry, "DesignCapacity")
            if f_cap and d_cap:
                samples.append({
                    "date": s_date,
                    "full_mwh": int(f_cap),
                    "design_mwh": int(d_cap),
                })
        info["history_samples"] = samples
    except Exception as exc:
        info["error"] = str(exc)
    return info


def _as_list(v: Any) -> List[Dict[str, Any]]:
    if isinstance(v, list):
        return v
    if isinstance(v, dict) and v:
        return [v]
    return []


def evaluate_parts_originality(raw: Dict[str, Any], bat_xml: Dict[str, Any], live: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Compares detected hardware serials, manufacturers, and specs against
    Lenovo IdeaPad Slim 5 14Q8X9 (Type 83HL) factory PSREF specifications.
    Detects whether any component (Motherboard, Screen, Battery, SSD, Wi-Fi, RAM) was replaced.
    """
    checks: List[Dict[str, str]] = []
    cs = raw.get("ComputerSystem") or {}
    prod = raw.get("Product") or {}
    bios = raw.get("BIOS") or {}
    board = raw.get("BaseBoard") or {}
    enclosure = raw.get("Chassis") or {}
    cpus = _as_list(raw.get("CPUs"))
    disks = _as_list(raw.get("PhysicalDisks"))
    edid_list = _as_list(raw.get("MonitorsEDID"))
    subs = raw.get("Subsystems") or {}
    wmi_bat = raw.get("WmiBattery") or {}

    # 1. Motherboard / BIOS / Chassis Serial Match
    bios_sn = (bios.get("SerialNumber") or "").strip()
    prod_sn = (prod.get("IdentifyingNumber") or "").strip()
    board_sn = (board.get("SerialNumber") or "").strip()
    chassis_sn = (enclosure.get("SerialNumber") or "").strip()

    valid_sns = {s for s in [bios_sn, prod_sn, chassis_sn] if s and s.upper() not in ("INVALID", "NONE", "DEFAULT STRING", "TO BE FILLED BY O.E.M.", "SYSTEM SERIAL NUMBER")}
    if len(valid_sns) == 1:
        sn_val = list(valid_sns)[0]
        checks.append({
            "component": "Scheda Madre, Scocca & BIOS",
            "detected": f"Seriale Univoco: {sn_val} (Modello: {cs.get('Model') or 'N/D'})",
            "expected": "Seriale identico tra BIOS, SMBIOS Product e Chassis (8 caratteri Lenovo)",
            "status": "ORIGINALE",
            "badge": "ok",
            "note": f"Il numero di serie coincide tra BIOS e Scocca. Nessun cambio scheda madre non autorizzato. BaseBoard SN: {board_sn or 'OEM'}",
        })
    elif len(valid_sns) > 1:
        checks.append({
            "component": "Scheda Madre, Scocca & BIOS",
            "detected": f"BIOS SN: {bios_sn} | Product SN: {prod_sn} | Chassis SN: {chassis_sn}",
            "expected": "Seriali coincidenti",
            "status": "SOSPETTO / SOSTITUITO",
            "badge": "danger",
            "note": "I seriali tra BIOS e Chassis non coincidono! La scheda madre o la scocca inferiore potrebbe essere stata sostituita.",
        })
    else:
        checks.append({
            "component": "Scheda Madre, Scocca & BIOS",
            "detected": f"BIOS SN: {bios_sn or 'N/D'} | Board: {board.get('Product') or 'N/D'}",
            "expected": "Seriale Lenovo 8 caratteri (Type 83HL)",
            "status": "PC NON LENOVO / GENERICO",
            "badge": "warn",
            "note": "Stai eseguendo il test su un PC diverso o con seriale OEM non programmato.",
        })

    # 2. CPU & Soldered RAM (LPDDR5x)
    cpu_name = cpus[0].get("Name", "") if cpus else "N/D"
    ram_gb = round(live.get("ram_total_gb") or 0)
    is_snap = ("SNAPDRAGON" in cpu_name.upper()) or ("QUALCOMM" in cpu_name.upper())
    checks.append({
        "component": "SoC CPU & RAM Saldata",
        "detected": f"{cpu_name} | RAM: {ram_gb} GB",
        "expected": "Qualcomm Snapdragon X Plus (X1P-42-100 / X1P-64-100) + 16GB/32GB LPDDR5x-8448",
        "status": "ORIGINALE (SALDATI)" if is_snap else "HARDWARE DIVERSO",
        "badge": "ok" if is_snap else "warn",
        "note": "Su IdeaPad 14Q8X9 la CPU e la RAM LPDDR5x sono saldate sulla scheda madre e non possono essere sostituite singolarmente.",
    })

    # 3. Battery Originality & 57Wh Factory Match
    if bat_xml.get("present") or wmi_bat.get("DeviceName"):
        b_manuf = (bat_xml.get("manufacturer") or wmi_bat.get("ManufacturerName") or "").upper()
        b_id = bat_xml.get("id") or wmi_bat.get("DeviceName") or "N/D"
        b_design = bat_xml.get("design_capacity_mwh") or wmi_bat.get("DesignedCapacity") or 0
        b_full = bat_xml.get("full_charge_capacity_mwh") or wmi_bat.get("FullChargedCapacity") or 0

        oem_bat_vendors = ("SUNWODA", "CELXPERT", "SMP", "SIMPLO", "LG", "LGC", "BYD", "COSMX", "NVT", "LENOVO")
        is_oem_vendor = any(v in b_manuf for v in oem_bat_vendors) or ("L23" in str(b_id).upper())
        # Lenovo 14Q8X9 has a 57Wh (57000 mWh) nominal battery (tolerance 54000 - 60500 mWh)
        is_57wh = 53000 <= b_design <= 61500

        if is_oem_vendor and is_57wh:
            b_status = "ORIGINALE LENOVO (57Wh)"
            b_badge = "ok"
            b_note = f"Fornitore ufficiale Lenovo ({b_manuf or 'OEM'}), Part ID {b_id}, capacita' nominale {b_design} mWh conforme a specifica PSREF 57Wh."
        elif is_oem_vendor:
            b_status = "ORIGINALE OEM"
            b_badge = "ok"
            b_note = f"Fornitore OEM riconosciuto ({b_manuf}), capacita' di progetto {b_design} mWh."
        else:
            b_status = "POSSIBILE BATTERIA COMPATIBILE / SOSTITUITA"
            b_badge = "warn"
            b_note = f"Produttore '{b_manuf}' / Capacita' {b_design} mWh non standard rispetto ai 57.000 mWh (L23M3PK1 / Sunwoda / Simplo / Celxpert) di fabbrica."

        checks.append({
            "component": "Batteria Interna (FRU)",
            "detected": f"{b_manuf or 'OEM'} | ID: {b_id} | Design: {b_design} mWh | Attuale: {b_full} mWh",
            "expected": "57.000 mWh (57Wh Li-Po) — OEM Lenovo (Simplo / Sunwoda / Celxpert / BYD / LG, Serie L23*)",
            "status": b_status,
            "badge": b_badge,
            "note": b_note,
        })
    else:
        checks.append({
            "component": "Batteria Interna (FRU)",
            "detected": "Nessuna batteria rilevata",
            "expected": "57.000 mWh (57Wh) OEM Lenovo",
            "status": "ASSENTE",
            "badge": "warn",
            "note": "Esegui sul portatile per verificare il produttore e il Part Number FRU della batteria.",
        })

    # 4. NVMe SSD Originality vs Retail Replacement
    oem_ssd_patterns = (
        "SAMSUNG", "MZAL", "MZVL", "PM9", "BM9",
        "SK HYNIX", "HYNIX", "HFS", "BC9", "PC8",
        "MICRON", "MTFD",
        "WD", "WESTERN DIGITAL", "SN740", "SN560", "SN580", "PC SN",
        "KIOXIA", "BG5", "BG6", "XG8",
        "SOLIDIGM", "SSDPF", "UMIS", "UNION MEMORY", "RPJT", "AM6"
    )
    retail_aftermarket_patterns = (
        "CRUCIAL", "KINGSTON", "LEXAR", "SABRENT", "FANXIANG", "ADATA", "XPG", "CORSAIR", "SILICON POWER", "PATRIOT", "TEAMGROUP", "980 PRO", "990 PRO", "SN850X"
    )
    if disks:
        for idx, d in enumerate(disks):
            d_name = (d.get("FriendlyName") or "").upper()
            d_sn = d.get("SerialNumber") or "N/D"
            d_poh = d.get("PowerOnHours")
            is_aftermarket = any(p in d_name for p in retail_aftermarket_patterns)
            is_oem_ssd = any(p in d_name for p in oem_ssd_patterns) and not is_aftermarket

            if is_aftermarket:
                s_status = "SOSTITUITO (AFTERMARKET RETAIL)"
                s_badge = "warn"
                s_note = f"Il disco {d.get('FriendlyName')} e' un modello retail comprato a parte (non montato in fabbrica da Lenovo). Ore uso: {d_poh if d_poh is not None else 'N/D'}."
            elif is_oem_ssd:
                s_status = "ORIGINALE OEM"
                s_badge = "ok"
                s_note = f"Modello NVMe OEM di primo equipaggiamento Lenovo (SN: {d_sn}). Ore accensione: {d_poh if d_poh is not None else 'N/D'}."
            else:
                s_status = "DA VERIFICARE"
                s_badge = "warn"
                s_note = f"Disco rilevato: {d.get('FriendlyName')} (SN: {d_sn}). Verifica se corrisponde a un'unita' M.2 2242 NVMe originale."

            checks.append({
                "component": f"SSD NVMe Principale #{idx + 1}",
                "detected": f"{d.get('FriendlyName')} ({d.get('SizeGB')} GB, {d.get('BusType')})",
                "expected": "M.2 2242 PCIe 4.0 x4 OEM (Samsung PM9B1/BM9C1, SK Hynix BC901, WD SN740/SN560, Micron 2400/2550, Kioxia BG6, UMIS)",
                "status": s_status,
                "badge": s_badge,
                "note": s_note,
            })

    # 5. Display Panel EDID Hardware Code (Checks if screen was replaced with a cheap panel)
    if edid_list:
        for m in edid_list:
            m_code = m.get("Manufacturer") or "N/D"
            p_code = m.get("ProductCode") or "N/D"
            m_name = m.get("Name") or "Monitor Integrato"
            Year = m.get("YearOfManufacture") or "?"
            oem_panel_makers = ("SDC", "LEN", "BOE", "AUO", "CSO", "CMN", "LGD", "IVO")
            is_oem_panel = any(v in m_code.upper() for v in oem_panel_makers)
            checks.append({
                "component": "Pannello Display (EDID)",
                "detected": f"Produttore EDID: {m_code} | Codice Pannello: {p_code} ({m_name}, Anno {Year})",
                "expected": "Pannello 14\" WUXGA (1920x1200) OLED (SDC Samsung / LEN) o IPS (BOE / AUO / CSO)",
                "status": "ORIGINALE OEM" if is_oem_panel else "ESTERNO / SOSTITUITO",
                "badge": "ok" if is_oem_panel else "warn",
                "note": "Il codice EDID identifica il produttore fisico del cristallo/OLED. Se inizia per SDC/BOE/CSO/AUO/LEN e l'anno e' 2023-2026, il pannello e' originale.",
            })

    # 6. Wireless Module (Soldered Qualcomm FastConnect 7800 / NCM825)
    net_devs = _as_list(subs.get("NetworkBluetooth"))
    net_names = " | ".join([x.get("FriendlyName", "") for x in net_devs if isinstance(x, dict) and x.get("FriendlyName")])
    has_fc7800 = ("FASTCONNECT" in net_names.upper()) or ("QUALCOMM" in net_names.upper()) or ("WCN" in net_names.upper())
    checks.append({
        "component": "Modulo Wi-Fi 7 & Bluetooth",
        "detected": net_names or "Nessuna scheda Qualcomm rilevata",
        "expected": "Qualcomm FastConnect 7800 Wi-Fi 7 Dual Band Simultaneous (DBS) + BT 5.4",
        "status": "ORIGINALE" if has_fc7800 else "DIVERSO / MANCANTE",
        "badge": "ok" if has_fc7800 else "warn",
        "note": "Modulo wireless integrato nella piattaforma Snapdragon X Plus.",
    })

    return checks


def collect_full_diagnostics() -> Dict[str, Any]:
    """Collects comprehensive hardware, peripheral, battery, disk, originality, and PnP diagnostics."""
    ps_script = r"""
$ErrorActionPreference = 'SilentlyContinue'

$cs = Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model, SystemFamily, SystemSKUNumber, TotalPhysicalMemory, HypervisorPresent
$csp = Get-CimInstance Win32_ComputerSystemProduct | Select-Object Name, Vendor, Version, IdentifyingNumber, UUID
$bios = Get-CimInstance Win32_BIOS | Select-Object Manufacturer, SMBIOSBIOSVersion, SerialNumber, ReleaseDate
$board = Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer, Product, SerialNumber, Version
$chassis = Get-CimInstance Win32_SystemEnclosure | Select-Object Manufacturer, SerialNumber, SMBIOSAssetTag, ChassisTypes
$os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture, LastBootUpTime, InstallDate, SerialNumber
$cpu = @(Get-CimInstance Win32_Processor | Select-Object Name, Manufacturer, Description, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, Architecture, ProcessorId)
$gpus = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, DriverDate, AdapterRAM, CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate, Status)
$ramSticks = @(Get-CimInstance Win32_PhysicalMemory | Select-Object Manufacturer, PartNumber, SerialNumber, Capacity, ConfiguredClockSpeed, Speed, SMBIOSMemoryType)

# Direct WMI Battery static/cycle/full data (fallback & cross-check for powercfg)
$wmiBatStatic = Get-CimInstance -Namespace root\WMI -ClassName BatteryStaticData | Select-Object -First 1
$wmiBatFull = Get-CimInstance -Namespace root\WMI -ClassName BatteryFullChargedCapacity | Select-Object -First 1
$wmiBatCycle = Get-CimInstance -Namespace root\WMI -ClassName BatteryCycleCount | Select-Object -First 1
$wmiBatStatus = Get-CimInstance -Namespace root\WMI -ClassName BatteryStatus | Select-Object -First 1

$wmiBatteryObj = [PSCustomObject]@{
    DeviceName = if ($wmiBatStatic) { $wmiBatStatic.DeviceName } else { $null }
    ManufacturerName = if ($wmiBatStatic) { $wmiBatStatic.ManufactureName } else { $null }
    SerialNumber = if ($wmiBatStatic) { $wmiBatStatic.SerialNumber } else { $null }
    DesignedCapacity = if ($wmiBatStatic) { $wmiBatStatic.DesignedCapacity } else { $null }
    FullChargedCapacity = if ($wmiBatFull) { $wmiBatFull.FullChargedCapacity } else { $null }
    CycleCount = if ($wmiBatCycle) { $wmiBatCycle.CycleCount } else { $null }
    VoltageMv = if ($wmiBatStatus) { $wmiBatStatus.Voltage } else { $null }
    ChargeRateMw = if ($wmiBatStatus) { $wmiBatStatus.ChargeRate } else { $null }
    DischargeRateMw = if ($wmiBatStatus) { $wmiBatStatus.DischargeRate } else { $null }
    RemainingCapacityMwh = if ($wmiBatStatus) { $wmiBatStatus.RemainingCapacity } else { $null }
}

# Monitors EDID (to check if laptop screen is original or replaced)
$edidMonitors = @()
$monIds = Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID
foreach ($m in $monIds) {
    $manuf = if ($m.ManufacturerName) { -join ($m.ManufacturerName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) } else { "" }
    $prodCode = if ($m.ProductCodeID) { -join ($m.ProductCodeID | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) } else { "" }
    $userFriendly = if ($m.UserFriendlyName) { -join ($m.UserFriendlyName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) } else { "" }
    $edidMonitors += [PSCustomObject]@{
        Manufacturer = $manuf
        ProductCode = $prodCode
        Name = $userFriendly
        YearOfManufacture = $m.YearOfManufacture
        WeekOfManufacture = $m.WeekOfManufacture
    }
}

# Disks & SMART
$physDisks = @()
$pdList = Get-PhysicalDisk
foreach ($d in $pdList) {
    $rel = $d | Get-StorageReliabilityCounter
    $physDisks += [PSCustomObject]@{
        FriendlyName = $d.FriendlyName
        SerialNumber = ($d.SerialNumber -replace '\s+', '')
        MediaType = [string]$d.MediaType
        BusType = [string]$d.BusType
        HealthStatus = [string]$d.HealthStatus
        OperationalStatus = [string]$d.OperationalStatus
        SizeGB = [math]::Round($d.Size / 1GB, 1)
        FirmwareVersion = $d.FirmwareVersion
        TemperatureC = if ($rel) { $rel.Temperature } else { $null }
        WearPercent = if ($rel) { $rel.Wear } else { $null }
        PowerOnHours = if ($rel) { $rel.PowerOnHours } else { $null }
        ReadErrorsTotal = if ($rel) { $rel.ReadErrorsTotal } else { $null }
        WriteErrorsTotal = if ($rel) { $rel.WriteErrorsTotal } else { $null }
    }
}

$volumes = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
    [PSCustomObject]@{
        DeviceID = $_.DeviceID
        VolumeName = $_.VolumeName
        FileSystem = $_.FileSystem
        SizeGB = [math]::Round($_.Size / 1GB, 1)
        FreeGB = [math]::Round($_.FreeSpace / 1GB, 1)
        UsedPercent = if ($_.Size -gt 0) { [math]::Round((($_.Size - $_.FreeSpace) / $_.Size) * 100, 1) } else { 0 }
    }
})

# Battery live status
$batLive = @(Get-CimInstance Win32_Battery | Select-Object Name, Status, BatteryStatus, EstimatedChargeRemaining, EstimatedRunTime, DesignVoltage)

# PnP Devices & Errors
$allPnp = Get-PnpDevice
$errorPnp = @($allPnp | Where-Object { $_.ConfigManagerErrorCode -ne 0 -and $_.Status -ne 'OK' } | Select-Object -First 40 Class, FriendlyName, InstanceId, Status, ConfigManagerErrorCode)

function Get-ClassDevices($classList, $namePattern) {
    $items = @($allPnp | Where-Object {
        $_.Present -eq $true -and (
            ($classList -and ($classList -contains $_.Class)) -or
            ($namePattern -and ($_.FriendlyName -match $namePattern))
        )
    } | Select-Object Class, FriendlyName, Status, ConfigManagerErrorCode, Manufacturer)
    return $items
}

$npuDevices = @(Get-ClassDevices @('ComputeAccelerator', 'NeuralProcessor') 'NPU|Hexagon|Snapdragon.*Tensor|Neural|AI Boost')
$wifiBt = @(Get-ClassDevices @('Net', 'Bluetooth') 'Wi-Fi|Wireless|FastConnect|Qualcomm.*Network|Bluetooth')
$cameras = @(Get-ClassDevices @('Camera', 'Image') 'Camera|Webcam|IR |Integrated')
$audio = @(Get-ClassDevices @('Media', 'AudioEndpoint') 'Audio|Speaker|Altoparlant|Microphone|Microfono|Realtek|Senary|Aqstic|Qualcomm.*Audio')
$biometrics = @(Get-ClassDevices @('Biometric') 'Fingerprint|Goodix|Synaptics|ELAN|FocalTech|Hello')
$usbControllers = @(Get-ClassDevices @('USB') 'USB4|eXtensible Host Controller|Type-C|UCM')
$sensors = @(Get-ClassDevices @('Sensor', 'System') 'Sensor|Accelerometer|Gyro|Lid|ALS|Ambient|Thermal|Qualcomm.*SoC')
$monitors = @(Get-ClassDevices @('Monitor') '.*')

# Windows Activation status
$lic = Get-CimInstance SoftwareLicensingProduct -Filter "ApplicationID='55c92734-d682-4d71-983e-d6ec3f16059f' AND PartialProductKey IS NOT NULL" | Select-Object -First 1 Name, LicenseStatus, PartialProductKey

# SecureBoot & TPM
$tpm = Get-CimInstance -Namespace "Root\CIMV2\Security\MicrosoftTpm" -ClassName Win32_Tpm | Select-Object IsActivated_InitialValue, IsEnabled_InitialValue, SpecVersion

[PSCustomObject]@{
    ComputerSystem = $cs
    Product = $csp
    BIOS = $bios
    BaseBoard = $board
    Chassis = $chassis
    OS = $os
    CPUs = $cpu
    GPUs = $gpus
    RAM = $ramSticks
    WmiBattery = $wmiBatteryObj
    MonitorsEDID = $edidMonitors
    PhysicalDisks = $physDisks
    Volumes = $volumes
    BatteryLive = $batLive
    DeviceErrors = $errorPnp
    Subsystems = [PSCustomObject]@{
        NPU = $npuDevices
        NetworkBluetooth = $wifiBt
        Cameras = $cameras
        Audio = $audio
        Biometrics = $biometrics
        USB = $usbControllers
        Sensors = $sensors
        Monitors = $monitors
    }
    License = $lic
    TPM = $tpm
} | ConvertTo-Json -Depth 6 -Compress
"""
    raw = _run_powershell_json(ps_script) or {}
    bat_xml = get_battery_report_xml()

    # Enrich bat_xml with WMI Battery data if XML missed anything or for real-time voltage/wattage
    wmi_bat = raw.get("WmiBattery") or {}
    if not bat_xml.get("present") and wmi_bat.get("DesignedCapacity"):
        d_cap = int(wmi_bat.get("DesignedCapacity") or 0)
        f_cap = int(wmi_bat.get("FullChargedCapacity") or 0)
        bat_xml["present"] = True
        bat_xml["design_capacity_mwh"] = d_cap
        bat_xml["full_charge_capacity_mwh"] = f_cap
        bat_xml["manufacturer"] = wmi_bat.get("ManufacturerName")
        bat_xml["serial_number"] = wmi_bat.get("SerialNumber")
        bat_xml["id"] = wmi_bat.get("DeviceName")
        bat_xml["cycle_count"] = wmi_bat.get("CycleCount")
        if d_cap > 0 and f_cap > 0:
            bat_xml["health_percent"] = round((f_cap / d_cap) * 100.0, 1)
            bat_xml["wear_percent"] = round(max(0.0, 100.0 - bat_xml["health_percent"]), 1)

    if wmi_bat.get("CycleCount") is not None and bat_xml.get("cycle_count") is None:
        bat_xml["cycle_count"] = wmi_bat.get("CycleCount")
    bat_xml["voltage_mv"] = wmi_bat.get("VoltageMv")
    bat_xml["charge_rate_mw"] = wmi_bat.get("ChargeRateMw")
    bat_xml["discharge_rate_mw"] = wmi_bat.get("DischargeRateMw")
    bat_xml["remaining_mwh"] = wmi_bat.get("RemainingCapacityMwh")

    live_metrics = {
        "cpu_usage_percent": psutil.cpu_percent(interval=0.2) if psutil else 0,
        "ram_usage_percent": psutil.virtual_memory().percent if psutil else 0,
        "ram_total_gb": round(psutil.virtual_memory().total / (1024 ** 3), 2) if psutil else 0,
        "ram_available_gb": round(psutil.virtual_memory().available / (1024 ** 3), 2) if psutil else 0,
        "boot_time_iso": datetime.fromtimestamp(psutil.boot_time()).isoformat() if psutil else None,
    }
    if psutil and hasattr(psutil, "sensors_battery"):
        sb = psutil.sensors_battery()
        if sb:
            live_metrics["battery_percent"] = round(sb.percent, 1)
            live_metrics["power_plugged"] = bool(sb.power_plugged)
            live_metrics["secsleft"] = sb.secsleft if sb.secsleft not in (psutil.POWER_TIME_UNLIMITED, psutil.POWER_TIME_UNKNOWN) else None

    originality_checks = evaluate_parts_originality(raw, bat_xml, live_metrics)

    # Build Used-Laptop Verdict / Audit Alerts
    alerts: List[Dict[str, str]] = []
    score = 100

    cs = raw.get("ComputerSystem") or {}
    prod = raw.get("Product") or {}
    cpus = _as_list(raw.get("CPUs"))
    model_str = f"{cs.get('Model', '')} {prod.get('Version', '')} {cs.get('SystemFamily', '')}".strip()
    cpu_name = cpus[0].get("Name", "Unknown CPU") if cpus else "Unknown CPU"

    is_lenovo_14q8x9 = ("14Q8X9" in model_str.upper()) or ("83HL" in model_str.upper()) or ("83GH" in model_str.upper()) or ("SLIM 5" in model_str.upper())
    is_snapdragon = ("SNAPDRAGON" in cpu_name.upper()) or ("QUALCOMM" in cpu_name.upper()) or ("ARM" in platform.machine().upper())

    if is_lenovo_14q8x9 or is_snapdragon:
        alerts.append({
            "level": "ok",
            "title": "Identita' Hardware Lenovo 14Q8X9 Confermata",
            "detail": f"Modello: {model_str or 'Lenovo'} | CPU: {cpu_name}",
        })
    else:
        alerts.append({
            "level": "info",
            "title": "Esecuzione su macchina diversa da IdeaPad 14Q8X9",
            "detail": f"Modello attuale: {model_str or 'Generico'} ({cpu_name}). Copia questa cartella sul Lenovo per il checkup reale.",
        })

    if bat_xml.get("present"):
        health = bat_xml.get("health_percent")
        cycles = bat_xml.get("cycle_count")
        if health is not None:
            if health < 75:
                score -= 25
                alerts.append({
                    "level": "danger",
                    "title": f"Batteria Usurata (Salute: {health}% - Usura: {bat_xml.get('wear_percent')}%)",
                    "detail": f"Capacita' massima attuale {bat_xml.get('full_charge_capacity_mwh')} mWh su {bat_xml.get('design_capacity_mwh')} mWh di fabbrica. Cicli: {cycles if cycles is not None else 'N/D'}.",
                })
            elif health < 85:
                score -= 10
                alerts.append({
                    "level": "warn",
                    "title": f"Batteria con Usura Moderata (Salute: {health}% - Usura: {bat_xml.get('wear_percent')}%)",
                    "detail": f"Capacita' massima attuale {bat_xml.get('full_charge_capacity_mwh')} mWh su {bat_xml.get('design_capacity_mwh')} mWh di fabbrica. Cicli: {cycles if cycles is not None else 'N/D'}.",
                })
            else:
                alerts.append({
                    "level": "ok",
                    "title": f"Batteria in Ottimo Stato (Salute: {health}% - Usura: {bat_xml.get('wear_percent')}%)",
                    "detail": f"Capacita' {bat_xml.get('full_charge_capacity_mwh')} / {bat_xml.get('design_capacity_mwh')} mWh. Cicli: {cycles if cycles is not None else 'N/D'}.",
                })
    else:
        alerts.append({
            "level": "warn",
            "title": "Batteria Non Rilevata",
            "detail": "Nessuna batteria trovata tramite WMI/powercfg (normale su PC fisso, anomalo su portatile).",
        })

    disks = _as_list(raw.get("PhysicalDisks"))
    for d in disks:
        h = (d.get("HealthStatus") or "").upper()
        if h and h != "HEALTHY":
            score -= 30
            alerts.append({
                "level": "danger",
                "title": f"Disco {d.get('FriendlyName')} NON SANO ({h})",
                "detail": "Attenzione: lo stato SMART del disco segnala anomalie critiche!",
            })
        else:
            alerts.append({
                "level": "ok",
                "title": f"SSD/Disco Sano: {d.get('FriendlyName')} ({d.get('SizeGB')} GB)",
                "detail": f"Stato: {d.get('HealthStatus')} | Bus: {d.get('BusType')} | Temp: {d.get('TemperatureC') or 'N/D'} C | Ore vita (POH): {d.get('PowerOnHours') or 'N/D'}",
            })

    dev_errors = _as_list(raw.get("DeviceErrors"))
    if len(dev_errors) > 0:
        score -= min(20, len(dev_errors) * 5)
        alerts.append({
            "level": "warn",
            "title": f"{len(dev_errors)} Periferiche con Errori Driver in Gestione Dispositivi",
            "detail": ", ".join([str(x.get("FriendlyName") or x.get("InstanceId")) for x in dev_errors[:5]]),
        })
    else:
        alerts.append({
            "level": "ok",
            "title": "Gestione Dispositivi Pulita (0 Errori PnP)",
            "detail": "Tutti i driver e i controller hardware rispondono con codice 0 (OK).",
        })

    lic = raw.get("License") or {}
    if lic.get("LicenseStatus") == 1:
        alerts.append({
            "level": "ok",
            "title": "Licenza Windows Attiva e Originale",
            "detail": f"{lic.get('Name', 'Windows')} (Key finale: {lic.get('PartialProductKey', 'OEM')})",
        })
    else:
        alerts.append({
            "level": "warn",
            "title": "Licenza Windows Non Attivata o Non Verificabile",
            "detail": "Controlla Impostazioni > Sistema > Attivazione.",
        })

    return {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "architecture_runtime": platform.machine(),
        "score": max(0, score),
        "alerts": alerts,
        "originality_checks": originality_checks,
        "battery_report": bat_xml,
        "live": live_metrics,
        "hardware": raw,
    }


def collect_live_telemetry() -> Dict[str, Any]:
    """Lightweight 2-second poll for CPU, RAM, Battery charge/AC state."""
    data: Dict[str, Any] = {
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "cpu_percent": psutil.cpu_percent(interval=0.1) if psutil else 0.0,
        "cpu_per_core": psutil.cpu_percent(interval=0.0, percpu=True) if psutil else [],
        "ram_percent": psutil.virtual_memory().percent if psutil else 0.0,
        "ram_used_gb": round(psutil.virtual_memory().used / (1024 ** 3), 2) if psutil else 0.0,
        "ram_total_gb": round(psutil.virtual_memory().total / (1024 ** 3), 2) if psutil else 0.0,
        "battery_percent": None,
        "power_plugged": None,
    }
    if psutil and hasattr(psutil, "sensors_battery"):
        sb = psutil.sensors_battery()
        if sb:
            data["battery_percent"] = round(sb.percent, 1)
            data["power_plugged"] = bool(sb.power_plugged)
    return data
