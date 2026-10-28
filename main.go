package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io/fs"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed frontend/*
var embeddedFrontend embed.FS

var (
	cachedDiagnostics map[string]any
	cacheMutex        sync.Mutex
)

const psFullDiagnostics = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$cs = Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model, SystemFamily, SystemSKUNumber, TotalPhysicalMemory, HypervisorPresent
$csp = Get-CimInstance Win32_ComputerSystemProduct | Select-Object Name, Vendor, Version, IdentifyingNumber, UUID
$bios = Get-CimInstance Win32_BIOS | Select-Object Manufacturer, SMBIOSBIOSVersion, SerialNumber, ReleaseDate
$board = Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer, Product, SerialNumber, Version
$chassis = Get-CimInstance Win32_SystemEnclosure | Select-Object Manufacturer, SerialNumber, SMBIOSAssetTag, ChassisTypes
$os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture, LastBootUpTime, InstallDate, SerialNumber, TotalVisibleMemorySize, FreePhysicalMemory
$cpu = @(Get-CimInstance Win32_Processor | Select-Object Name, Manufacturer, Description, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, Architecture, ProcessorId, LoadPercentage)
$gpus = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, DriverDate, AdapterRAM, CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate, Status)
$ramSticks = @(Get-CimInstance Win32_PhysicalMemory | Select-Object Manufacturer, PartNumber, SerialNumber, Capacity, ConfiguredClockSpeed, Speed, SMBIOSMemoryType)

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
    PowerOnline = if ($wmiBatStatus) { $wmiBatStatus.PowerOnline } else { $null }
}

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

$batLive = @(Get-CimInstance Win32_Battery | Select-Object Name, Status, BatteryStatus, EstimatedChargeRemaining, EstimatedRunTime, DesignVoltage)

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

$lic = Get-CimInstance SoftwareLicensingProduct -Filter "ApplicationID='55c92734-d682-4d71-983e-d6ec3f16059f' AND PartialProductKey IS NOT NULL" | Select-Object -First 1 Name, LicenseStatus, PartialProductKey
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
`

const psLiveTelemetry = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$os = Get-CimInstance Win32_OperatingSystem
$totalGB = if ($os.TotalVisibleMemorySize) { [math]::Round($os.TotalVisibleMemorySize / 1MB, 2) } else { 0 }
$freeGB = if ($os.FreePhysicalMemory) { [math]::Round($os.FreePhysicalMemory / 1MB, 2) } else { 0 }
$usedGB = [math]::Round($totalGB - $freeGB, 2)
$ramPct = if ($totalGB -gt 0) { [math]::Round(($usedGB / $totalGB) * 100, 1) } else { 0 }
$bat = Get-CimInstance Win32_Battery | Select-Object -First 1
$batPct = if ($bat) { $bat.EstimatedChargeRemaining } else { $null }
$plugged = if ($bat) { ($bat.BatteryStatus -ne 1) } else { $null }
[PSCustomObject]@{
    timestamp = (Get-Date -Format "HH:mm:ss")
    cpu_percent = if ($null -ne $cpu) { [math]::Round($cpu, 1) } else { 0 }
    ram_percent = $ramPct
    ram_used_gb = $usedGB
    ram_total_gb = $totalGB
    battery_percent = $batPct
    power_plugged = $plugged
} | ConvertTo-Json -Compress
`

func runPowerShellJSON(script string) map[string]any {
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script)
	var out bytes.Buffer
	cmd.Stdout = &out
	_ = cmd.Run()
	res := make(map[string]any)
	_ = json.Unmarshal(bytes.TrimSpace(out.Bytes()), &res)
	return res
}

type xmlBatteryReport struct {
	Batteries []struct {
		Id                 string `xml:"Id"`
		Manufacturer       string `xml:"Manufacturer"`
		SerialNumber       string `xml:"SerialNumber"`
		Chemistry          string `xml:"Chemistry"`
		DesignCapacity     int    `xml:"DesignCapacity"`
		FullChargeCapacity int    `xml:"FullChargeCapacity"`
		CycleCount         string `xml:"CycleCount"`
	} `xml:"Batteries>Battery"`
}

func getBatteryReportXML() map[string]any {
	xmlPath := filepath.Join(os.TempDir(), "lenovo_go_battery_report.xml")
	_ = os.Remove(xmlPath)
	_ = exec.Command("powercfg.exe", "/batteryreport", "/output", xmlPath, "/xml").Run()

	info := map[string]any{
		"present":                  false,
		"id":                       nil,
		"manufacturer":             nil,
		"serial_number":            nil,
		"chemistry":                nil,
		"design_capacity_mwh":      0,
		"full_charge_capacity_mwh": 0,
		"cycle_count":              nil,
		"wear_percent":             nil,
		"health_percent":           nil,
		"status_verdict":           "NON RILEVATA",
	}

	rawBytes, err := os.ReadFile(xmlPath)
	if err != nil {
		return info
	}
	var parsed xmlBatteryReport
	if err := xml.Unmarshal(rawBytes, &parsed); err != nil || len(parsed.Batteries) == 0 {
		return info
	}

	b := parsed.Batteries[0]
	info["present"] = true
	info["id"] = strings.TrimSpace(b.Id)
	info["manufacturer"] = strings.TrimSpace(b.Manufacturer)
	info["serial_number"] = strings.TrimSpace(b.SerialNumber)
	info["chemistry"] = strings.TrimSpace(b.Chemistry)
	info["design_capacity_mwh"] = b.DesignCapacity
	info["full_charge_capacity_mwh"] = b.FullChargeCapacity

	if c, err := strconv.Atoi(strings.TrimSpace(b.CycleCount)); err == nil {
		info["cycle_count"] = c
	}

	if b.DesignCapacity > 0 && b.FullChargeCapacity > 0 {
		health := math.Round((float64(b.FullChargeCapacity)/float64(b.DesignCapacity))*1000.0) / 10.0
		wear := math.Round(math.Max(0.0, 100.0-health)*10.0) / 10.0
		info["health_percent"] = health
		info["wear_percent"] = wear
		if health >= 90.0 {
			info["status_verdict"] = "PARI AL NUOVO / OTTIMA"
		} else if health >= 80.0 {
			info["status_verdict"] = "BUONA (USURA NORMALE)"
		} else if health >= 70.0 {
			info["status_verdict"] = "USURA MEDIA"
		} else {
			info["status_verdict"] = "USURA CRITICA (DA SOSTITUIRE)"
		}
	}
	return info
}

func asMap(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return map[string]any{}
}

func asSlice(v any) []any {
	if s, ok := v.([]any); ok {
		return s
	}
	if m, ok := v.(map[string]any); ok && len(m) > 0 {
		return []any{m}
	}
	return []any{}
}

func asString(v any) string {
	if v == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprintf("%v", v))
}

func asFloat(v any) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case int:
		return float64(val)
	case string:
		f, _ := strconv.ParseFloat(val, 64)
		return f
	default:
		return 0
	}
}

func containsAny(s string, patterns ...string) bool {
	up := strings.ToUpper(s)
	for _, p := range patterns {
		if strings.Contains(up, strings.ToUpper(p)) {
			return true
		}
	}
	return false
}

func evaluateOriginality(raw map[string]any, batXML map[string]any, ramTotalGB float64) []map[string]string {
	var checks []map[string]string
	cs := asMap(raw["ComputerSystem"])
	prod := asMap(raw["Product"])
	bios := asMap(raw["BIOS"])
	board := asMap(raw["BaseBoard"])
	chassis := asMap(raw["Chassis"])
	cpus := asSlice(raw["CPUs"])
	disks := asSlice(raw["PhysicalDisks"])
	edids := asSlice(raw["MonitorsEDID"])
	subs := asMap(raw["Subsystems"])

	// 1. Serial match
	biosSN := asString(bios["SerialNumber"])
	prodSN := asString(prod["IdentifyingNumber"])
	chassisSN := asString(chassis["SerialNumber"])
	boardSN := asString(board["SerialNumber"])

	validSet := map[string]bool{}
	for _, s := range []string{biosSN, prodSN, chassisSN} {
		up := strings.ToUpper(s)
		if s != "" && up != "INVALID" && up != "NONE" && up != "DEFAULT STRING" && up != "SYSTEM SERIAL NUMBER" && !strings.Contains(up, "O.E.M") {
			validSet[s] = true
		}
	}

	if len(validSet) == 1 {
		var sn string
		for k := range validSet {
			sn = k
		}
		checks = append(checks, map[string]string{
			"component": "Scheda Madre, Scocca & BIOS",
			"detected":  fmt.Sprintf("Seriale Univoco: %s (Modello: %s)", sn, asString(cs["Model"])),
			"expected":  "Seriale identico tra BIOS, SMBIOS Product e Chassis (8 caratteri Lenovo)",
			"status":    "ORIGINALE",
			"badge":     "ok",
			"note":      fmt.Sprintf("Il numero di serie coincide tra BIOS e Scocca. BaseBoard SN: %s", boardSN),
		})
	} else if len(validSet) > 1 {
		checks = append(checks, map[string]string{
			"component": "Scheda Madre, Scocca & BIOS",
			"detected":  fmt.Sprintf("BIOS: %s | Product: %s | Chassis: %s", biosSN, prodSN, chassisSN),
			"expected":  "Seriali coincidenti",
			"status":    "SOSPETTO / SOSTITUITO",
			"badge":     "danger",
			"note":      "I seriali tra BIOS e Scocca non coincidono! Scheda madre o scocca sostituita.",
		})
	} else {
		checks = append(checks, map[string]string{
			"component": "Scheda Madre, Scocca & BIOS",
			"detected":  fmt.Sprintf("BIOS SN: %s | Board: %s", biosSN, asString(board["Product"])),
			"expected":  "Seriale Lenovo 8 caratteri (Type 83HL)",
			"status":    "PC GENERICO / DIVERSO",
			"badge":     "warn",
			"note":      "Esegui questo binario direttamente sul Lenovo IdeaPad Slim 5 14Q8X9.",
		})
	}

	// 2. CPU & Soldered RAM
	cpuName := "N/D"
	if len(cpus) > 0 {
		cpuName = asString(asMap(cpus[0])["Name"])
	}
	isSnap := containsAny(cpuName, "SNAPDRAGON", "QUALCOMM")
	statusCPU := "HARDWARE DIVERSO"
	badgeCPU := "warn"
	if isSnap {
		statusCPU = "ORIGINALE (SALDATI)"
		badgeCPU = "ok"
	}
	checks = append(checks, map[string]string{
		"component": "SoC CPU & RAM Saldata",
		"detected":  fmt.Sprintf("%s | RAM: %.0f GB", cpuName, math.Round(ramTotalGB)),
		"expected":  "Qualcomm Snapdragon X Plus (X1P-42-100 / X1P-64-100) + 16GB/32GB LPDDR5x-8448",
		"status":    statusCPU,
		"badge":     badgeCPU,
		"note":      "CPU e RAM LPDDR5x sono saldate sulla scheda madre del 14Q8X9.",
	})

	// 3. Battery FRU
	if present, _ := batXML["present"].(bool); present {
		bManuf := strings.ToUpper(asString(batXML["manufacturer"]))
		bID := asString(batXML["id"])
		bDesign := int(asFloat(batXML["design_capacity_mwh"]))
		bFull := int(asFloat(batXML["full_charge_capacity_mwh"]))
		isOEM := containsAny(bManuf, "SUNWODA", "CELXPERT", "SMP", "SIMPLO", "LG", "LGC", "BYD", "COSMX", "NVT", "LENOVO") || containsAny(bID, "L23")
		is57Wh := bDesign >= 53000 && bDesign <= 61500

		bStatus := "POSSIBILE BATTERIA COMPATIBILE / SOSTITUITA"
		bBadge := "warn"
		if isOEM && is57Wh {
			bStatus = "ORIGINALE LENOVO (57Wh)"
			bBadge = "ok"
		} else if isOEM {
			bStatus = "ORIGINALE OEM"
			bBadge = "ok"
		}
		checks = append(checks, map[string]string{
			"component": "Batteria Interna (FRU)",
			"detected":  fmt.Sprintf("%s | ID: %s | Design: %d mWh | Attuale: %d mWh", bManuf, bID, bDesign, bFull),
			"expected":  "57.000 mWh (57Wh Li-Po) — OEM Lenovo (Simplo / Sunwoda / Celxpert / BYD / LG, Serie L23*)",
			"status":    bStatus,
			"badge":     bBadge,
			"note":      "Verifica fornitore ufficiale FRU e capacita' nominale 57Wh da specifica PSREF.",
		})
	} else {
		checks = append(checks, map[string]string{
			"component": "Batteria Interna (FRU)",
			"detected":  "Nessuna batteria rilevata",
			"expected":  "57.000 mWh (57Wh) OEM Lenovo",
			"status":    "ASSENTE",
			"badge":     "warn",
			"note":      "Esegui sul portatile per verificare il produttore e il Part Number FRU della batteria.",
		})
	}

	// 4. SSD NVMe
	for idx, dItem := range disks {
		d := asMap(dItem)
		dName := asString(d["FriendlyName"])
		dSN := asString(d["SerialNumber"])
		dPOH := asString(d["PowerOnHours"])
		isAftermarket := containsAny(dName, "CRUCIAL", "KINGSTON", "LEXAR", "SABRENT", "FANXIANG", "ADATA", "XPG", "CORSAIR", "SILICON POWER", "PATRIOT", "TEAMGROUP", "980 PRO", "990 PRO", "SN850X")
		isOEM := containsAny(dName, "SAMSUNG", "MZAL", "MZVL", "PM9", "BM9", "SK HYNIX", "HYNIX", "HFS", "BC9", "PC8", "MICRON", "MTFD", "WD", "WESTERN DIGITAL", "SN740", "SN560", "SN580", "KIOXIA", "BG5", "BG6", "SOLIDIGM", "UMIS", "UNION MEMORY", "RPJT") && !isAftermarket

		sStatus := "DA VERIFICARE"
		sBadge := "warn"
		sNote := fmt.Sprintf("Disco rilevato: %s (SN: %s). Ore accensione: %s", dName, dSN, dPOH)
		if isAftermarket {
			sStatus = "SOSTITUITO (AFTERMARKET RETAIL)"
			sBadge = "warn"
			sNote = fmt.Sprintf("Il disco %s e' un'unita' retail comprata a parte (non OEM Lenovo). Ore uso: %s", dName, dPOH)
		} else if isOEM {
			sStatus = "ORIGINALE OEM"
			sBadge = "ok"
			sNote = fmt.Sprintf("Unita' NVMe OEM di primo equipaggiamento Lenovo (SN: %s). Ore accensione: %s", dSN, dPOH)
		}
		checks = append(checks, map[string]string{
			"component": fmt.Sprintf("SSD NVMe Principale #%d", idx+1),
			"detected":  fmt.Sprintf("%s (%v GB, %s)", dName, d["SizeGB"], asString(d["BusType"])),
			"expected":  "M.2 2242 PCIe 4.0 x4 OEM (Samsung PM9B1/BM9C1, SK Hynix BC901, WD SN740/SN560, Micron, Kioxia BG6, UMIS)",
			"status":    sStatus,
			"badge":     sBadge,
			"note":      sNote,
		})
	}

	// 5. Display EDID
	for _, mItem := range edids {
		m := asMap(mItem)
		mCode := asString(m["Manufacturer"])
		pCode := asString(m["ProductCode"])
		mName := asString(m["Name"])
		yr := asString(m["YearOfManufacture"])
		isOEMPanel := containsAny(mCode, "SDC", "LEN", "BOE", "AUO", "CSO", "CMN", "LGD", "IVO")
		pStatus := "ESTERNO / SOSTITUITO"
		pBadge := "warn"
		if isOEMPanel {
			pStatus = "ORIGINALE OEM"
			pBadge = "ok"
		}
		checks = append(checks, map[string]string{
			"component": "Pannello Display (EDID)",
			"detected":  fmt.Sprintf("Produttore EDID: %s | Codice Pannello: %s (%s, Anno %s)", mCode, pCode, mName, yr),
			"expected":  "Pannello 14\" WUXGA (1920x1200) OLED (SDC Samsung / LEN) o IPS (BOE / AUO / CSO)",
			"status":    pStatus,
			"badge":     pBadge,
			"note":      "Il codice EDID identifica il produttore fisico del pannello OLED/IPS.",
		})
	}

	// 6. Wi-Fi 7 FastConnect 7800
	netSlice := asSlice(subs["NetworkBluetooth"])
	var netNames []string
	for _, nItem := range netSlice {
		fn := asString(asMap(nItem)["FriendlyName"])
		if fn != "" {
			netNames = append(netNames, fn)
		}
	}
	joinedNet := strings.Join(netNames, " | ")
	hasFC := containsAny(joinedNet, "FASTCONNECT", "QUALCOMM", "WCN")
	wStatus := "DIVERSO / MANCANTE"
	wBadge := "warn"
	if hasFC {
		wStatus = "ORIGINALE"
		wBadge = "ok"
	}
	checks = append(checks, map[string]string{
		"component": "Modulo Wi-Fi 7 & Bluetooth",
		"detected":  joinedNet,
		"expected":  "Qualcomm FastConnect 7800 Wi-Fi 7 Dual Band Simultaneous (DBS) + BT 5.4",
		"status":    wStatus,
		"badge":     wBadge,
		"note":      "Modulo wireless saldato della piattaforma Snapdragon X Plus.",
	})

	return checks
}

func collectFullDiagnostics() map[string]any {
	raw := runPowerShellJSON(psFullDiagnostics)
	batXML := getBatteryReportXML()
	wmiBat := asMap(raw["WmiBattery"])

	if present, _ := batXML["present"].(bool); !present && wmiBat["DesignedCapacity"] != nil {
		dCap := int(asFloat(wmiBat["DesignedCapacity"]))
		fCap := int(asFloat(wmiBat["FullChargedCapacity"]))
		if dCap > 0 {
			batXML["present"] = true
			batXML["design_capacity_mwh"] = dCap
			batXML["full_charge_capacity_mwh"] = fCap
			batXML["manufacturer"] = wmiBat["ManufacturerName"]
			batXML["serial_number"] = wmiBat["SerialNumber"]
			batXML["id"] = wmiBat["DeviceName"]
			batXML["cycle_count"] = wmiBat["CycleCount"]
			if fCap > 0 {
				health := math.Round((float64(fCap)/float64(dCap))*1000.0) / 10.0
				batXML["health_percent"] = health
				batXML["wear_percent"] = math.Round(math.Max(0, 100.0-health)*10.0) / 10.0
			}
		}
	}
	if batXML["cycle_count"] == nil && wmiBat["CycleCount"] != nil {
		batXML["cycle_count"] = wmiBat["CycleCount"]
	}
	batXML["voltage_mv"] = wmiBat["VoltageMv"]
	batXML["charge_rate_mw"] = wmiBat["ChargeRateMw"]
	batXML["discharge_rate_mw"] = wmiBat["DischargeRateMw"]
	batXML["remaining_mwh"] = wmiBat["RemainingCapacityMwh"]

	osMap := asMap(raw["OS"])
	totalMemKB := asFloat(osMap["TotalVisibleMemorySize"])
	freeMemKB := asFloat(osMap["FreePhysicalMemory"])
	ramTotalGB := math.Round((totalMemKB/(1024*1024))*100) / 100
	ramAvailGB := math.Round((freeMemKB/(1024*1024))*100) / 100
	ramPct := 0.0
	if totalMemKB > 0 {
		ramPct = math.Round(((totalMemKB-freeMemKB)/totalMemKB)*1000) / 10
	}

	live := map[string]any{
		"cpu_usage_percent": 0,
		"ram_usage_percent": ramPct,
		"ram_total_gb":      ramTotalGB,
		"ram_available_gb":  ramAvailGB,
	}

	origChecks := evaluateOriginality(raw, batXML, ramTotalGB)

	score := 100
	var alerts []map[string]string

	cs := asMap(raw["ComputerSystem"])
	prod := asMap(raw["Product"])
	cpus := asSlice(raw["CPUs"])
	cpuName := "Unknown CPU"
	if len(cpus) > 0 {
		cpuName = asString(asMap(cpus[0])["Name"])
	}
	modelStr := strings.TrimSpace(fmt.Sprintf("%s %s %s", asString(cs["Model"]), asString(prod["Version"]), asString(cs["SystemFamily"])))

	if containsAny(modelStr, "14Q8X9", "83HL", "83GH", "SLIM 5") || containsAny(cpuName, "SNAPDRAGON", "QUALCOMM") {
		alerts = append(alerts, map[string]string{
			"level":  "ok",
			"title":  "Identita' Hardware Lenovo 14Q8X9 Confermata",
			"detail": fmt.Sprintf("Modello: %s | CPU: %s", modelStr, cpuName),
		})
	} else {
		alerts = append(alerts, map[string]string{
			"level":  "info",
			"title":  "Esecuzione su macchina diversa da IdeaPad 14Q8X9",
			"detail": fmt.Sprintf("Modello attuale: %s (%s). Copia l'eseguibile Go sul Lenovo per il checkup reale.", modelStr, cpuName),
		})
	}

	if present, _ := batXML["present"].(bool); present {
		health := asFloat(batXML["health_percent"])
		wear := asFloat(batXML["wear_percent"])
		cycles := asString(batXML["cycle_count"])
		if cycles == "" {
			cycles = "N/D"
		}
		if health > 0 && health < 75 {
			score -= 25
			alerts = append(alerts, map[string]string{
				"level":  "danger",
				"title":  fmt.Sprintf("Batteria Usurata (Salute: %.1f%% - Usura: %.1f%%)", health, wear),
				"detail": fmt.Sprintf("Capacita' attuale %v mWh su %v mWh di fabbrica. Cicli: %s", batXML["full_charge_capacity_mwh"], batXML["design_capacity_mwh"], cycles),
			})
		} else if health > 0 && health < 85 {
			score -= 10
			alerts = append(alerts, map[string]string{
				"level":  "warn",
				"title":  fmt.Sprintf("Batteria con Usura Moderata (Salute: %.1f%% - Usura: %.1f%%)", health, wear),
				"detail": fmt.Sprintf("Capacita' attuale %v mWh su %v mWh di fabbrica. Cicli: %s", batXML["full_charge_capacity_mwh"], batXML["design_capacity_mwh"], cycles),
			})
		} else {
			alerts = append(alerts, map[string]string{
				"level":  "ok",
				"title":  fmt.Sprintf("Batteria in Ottimo Stato (Salute: %.1f%% - Usura: %.1f%%)", health, wear),
				"detail": fmt.Sprintf("Capacita' %v / %v mWh. Cicli: %s", batXML["full_charge_capacity_mwh"], batXML["design_capacity_mwh"], cycles),
			})
		}
	} else {
		alerts = append(alerts, map[string]string{
			"level":  "warn",
			"title":  "Batteria Non Rilevata",
			"detail": "Nessuna batteria trovata tramite WMI/powercfg (normale su PC fisso, anomalo su portatile).",
		})
	}

	for _, dItem := range asSlice(raw["PhysicalDisks"]) {
		d := asMap(dItem)
		h := strings.ToUpper(asString(d["HealthStatus"]))
		if h != "" && h != "HEALTHY" {
			score -= 30
			alerts = append(alerts, map[string]string{
				"level":  "danger",
				"title":  fmt.Sprintf("Disco %s NON SANO (%s)", asString(d["FriendlyName"]), h),
				"detail": "Attenzione: lo stato SMART del disco segnala anomalie critiche!",
			})
		} else {
			alerts = append(alerts, map[string]string{
				"level":  "ok",
				"title":  fmt.Sprintf("SSD/Disco Sano: %s (%v GB)", asString(d["FriendlyName"]), d["SizeGB"]),
				"detail": fmt.Sprintf("Stato: %s | Bus: %s | Temp: %v C | Ore vita (POH): %v", asString(d["HealthStatus"]), asString(d["BusType"]), d["TemperatureC"], d["PowerOnHours"]),
			})
		}
	}

	devErrs := asSlice(raw["DeviceErrors"])
	if len(devErrs) > 0 {
		deduct := len(devErrs) * 5
		if deduct > 20 {
			deduct = 20
		}
		score -= deduct
		alerts = append(alerts, map[string]string{
			"level":  "warn",
			"title":  fmt.Sprintf("%d Periferiche con Errori Driver in Gestione Dispositivi", len(devErrs)),
			"detail": "Controlla il Tab 2 (Gestione Dispositivi & Driver) per i dettagli.",
		})
	} else {
		alerts = append(alerts, map[string]string{
			"level":  "ok",
			"title":  "Gestione Dispositivi Pulita (0 Errori PnP)",
			"detail": "Tutti i driver e i controller hardware rispondono con codice 0 (OK).",
		})
	}

	lic := asMap(raw["License"])
	if int(asFloat(lic["LicenseStatus"])) == 1 {
		alerts = append(alerts, map[string]string{
			"level":  "ok",
			"title":  "Licenza Windows Attiva e Originale",
			"detail": fmt.Sprintf("%s (Key finale: %s)", asString(lic["Name"]), asString(lic["PartialProductKey"])),
		})
	}

	if score < 0 {
		score = 0
	}

	return map[string]any{
		"timestamp":            time.Now().Format("2006-01-02 15:04:05"),
		"architecture_runtime": fmt.Sprintf("Go %s/%s", runtime.GOOS, runtime.GOARCH),
		"score":                score,
		"alerts":               alerts,
		"originality_checks":   origChecks,
		"battery_report":       batXML,
		"live":                 live,
		"hardware":             raw,
	}
}

func openBrowser(url string) {
	_ = exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", url).Start()
}

func main() {
	port := os.Getenv("CHECKUP_PORT")
	if port == "" {
		port = "8765"
	}
	noBrowser := false
	for _, arg := range os.Args[1:] {
		if arg == "--no-browser" {
			noBrowser = true
		}
	}

	url := fmt.Sprintf("http://127.0.0.1:%s", port)
	fmt.Println("====================================================================")
	fmt.Printf(" LENOVO IDEAPAD SLIM 5 14Q8X9 - CHECKUP SUITE (GO %s/%s)\n", runtime.GOOS, runtime.GOARCH)
	fmt.Println("====================================================================")
	fmt.Println("[*] Scansione iniziale WMI, Batteria FRU, Originalita' e SMART...")

	cacheMutex.Lock()
	cachedDiagnostics = collectFullDiagnostics()
	cacheMutex.Unlock()

	fmt.Printf("[*] Pronto! Interfaccia disponibile su: %s\n", url)
	fmt.Println("[*] Premi CTRL+C per chiudere il programma.")

	subFS, err := fs.Sub(embeddedFrontend, "frontend")
	if err != nil {
		panic(err)
	}
	fileServer := http.FileServer(http.FS(subFS))

	http.HandleFunc("/api/diagnostics", func(w http.ResponseWriter, r *http.Request) {
		refresh := strings.Contains(r.URL.RawQuery, "refresh=1")
		cacheMutex.Lock()
		if cachedDiagnostics == nil || refresh {
			cachedDiagnostics = collectFullDiagnostics()
		}
		data := cachedDiagnostics
		cacheMutex.Unlock()

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(data)
	})

	http.HandleFunc("/api/live", func(w http.ResponseWriter, r *http.Request) {
		data := runPowerShellJSON(psLiveTelemetry)
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(data)
	})

	http.Handle("/", fileServer)

	if !noBrowser {
		go func() {
			time.Sleep(500 * time.Millisecond)
			openBrowser(url)
		}()
	}

	if err := http.ListenAndServe("127.0.0.1:"+port, nil); err != nil {
		fmt.Printf("[!] Porta %s occupata o errore server: %v\n", port, err)
	}
}
