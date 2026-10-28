# ==============================================================================
# BUILD_ISO_SAFE.ps1 - Builder ISO Windows 11 26H2 ARM64 Zero-Admin / Zscaler-Safe
# Target: Lenovo IdeaPad Slim 5 14Q8X9 (Type 83HL - Qualcomm Snapdragon X Plus)
# Nessun uso di reg.exe, cscript.exe, VBScript/WSF o Image File Execution Options
# ==============================================================================
$ErrorActionPreference = "Stop"
$uupPkg = Join-Path $PSScriptRoot "uup_pkg"
Set-Location $uupPkg

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host " LENOVO IDEAPAD SLIM 5 14Q8X9 - BUILDER ISO WIN11 26H2 ARM64 SAFE" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan

if (-not (Test-Path "UUPs\core_it-it.esd")) {
    Write-Host "[*] Download pacchetti UUP 26H2 ARM64 da Microsoft..." -ForegroundColor Yellow
    .\bin\aria2c.exe --no-conf --console-log-level=warn --log-level=info --log="aria2_download.log" -x16 -s16 -j5 -c -R -d"UUPs" -i"files\uup_download_windows.txt"
}

# Controlla spazio libero sul drive corrente; se < 12 GB, sposta UUPs in C:\UUP_Staging_14Q8X9 con Junction
$driveLetter = (Get-Location).Drive.Name
$freeGB = [math]::Round((Get-PSDrive $driveLetter).Free / 1GB, 2)
if ($freeGB -lt 12 -and $driveLetter -ne "C") {
    Write-Host "[*] Spazio su ${driveLetter}: ($freeGB GB) ridotto. Spostamento cache UUPs su C:\UUP_Staging_14Q8X9..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "C:\UUP_Staging_14Q8X9" -Force | Out-Null
    if ((Test-Path "UUPs") -and (-not ((Get-Item "UUPs").Attributes -band [IO.FileAttributes]::ReparsePoint))) {
        if (Test-Path "C:\UUP_Staging_14Q8X9\UUPs") { Remove-Item "C:\UUP_Staging_14Q8X9\UUPs" -Recurse -Force }
        Move-Item "UUPs" "C:\UUP_Staging_14Q8X9\UUPs" -Force
        New-Item -ItemType Junction -Path "UUPs" -Target "C:\UUP_Staging_14Q8X9\UUPs" | Out-Null
    }
}

Write-Host "[1/6] Creazione struttura ISOFOLDER..." -ForegroundColor Green
if (Test-Path "ISOFOLDER") { Remove-Item "ISOFOLDER" -Recurse -Force }
New-Item -ItemType Directory -Path "ISOFOLDER" -Force | Out-Null
.\bin\wimlib-imagex.exe apply "UUPs\core_it-it.esd" 1 "ISOFOLDER\" --no-acls --no-attributes
if (Test-Path "ISOFOLDER\MediaMeta.xml") { Remove-Item "ISOFOLDER\MediaMeta.xml" -Force }

Write-Host "[2/6] Conversione pacchetti FoD .CAB in .ESD di riferimento..." -ForegroundColor Green
if (Test-Path "temp") { Remove-Item "temp" -Recurse -Force }
New-Item -ItemType Directory -Path "temp" -Force | Out-Null
Get-ChildItem "UUPs\*.cab" | Where-Object {
    $_.Name -notmatch "AggregatedMetadata|DesktopDeployment|Windows11\.0-KB"
} | ForEach-Object {
    $base = $_.BaseName
    $tmpDir = Join-Path "temp" $base
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
    expand.exe -f:* $_.FullName $tmpDir | Out-Null
    .\bin\wimlib-imagex.exe capture $tmpDir "temp\$base.esd" --compress=none | Out-Null
    Remove-Item $tmpDir -Recurse -Force
}

Write-Host "[3/6] Esportazione install.wim (Windows 11 Home + Windows 11 Pro 26H2 ARM64)..." -ForegroundColor Green
.\bin\wimlib-imagex.exe export "UUPs\core_it-it.esd" 3 "ISOFOLDER\sources\install.wim" --ref="UUPs\*.esd" --ref="temp\*.esd" --compress=LZX
.\bin\wimlib-imagex.exe info "ISOFOLDER\sources\install.wim" 1 --image-property DISPLAYNAME="Windows 11 Home" --image-property DISPLAYDESCRIPTION="Windows 11 Home" --image-property FLAGS=Core
.\bin\wimlib-imagex.exe export "UUPs\professional_it-it.esd" 3 "ISOFOLDER\sources\install.wim" --ref="UUPs\*.esd" --ref="temp\*.esd" --compress=LZX
.\bin\wimlib-imagex.exe info "ISOFOLDER\sources\install.wim" 2 --image-property DISPLAYNAME="Windows 11 Pro" --image-property DISPLAYDESCRIPTION="Windows 11 Pro" --image-property FLAGS=Professional

Write-Host "[4/6] Creazione winre.wim e boot.wim (WinPE + Windows Setup ARM64)..." -ForegroundColor Green
.\bin\wimlib-imagex.exe export "UUPs\core_it-it.esd" 2 "temp\winre.wim" --compress=LZX --boot
.\bin\wimlib-imagex.exe update "ISOFOLDER\sources\install.wim" 1 --command="add 'temp\winre.wim' '\windows\system32\recovery\winre.wim'"
.\bin\wimlib-imagex.exe update "ISOFOLDER\sources\install.wim" 2 --command="add 'temp\winre.wim' '\windows\system32\recovery\winre.wim'"

Copy-Item "temp\winre.wim" "ISOFOLDER\sources\boot.wim" -Force
.\bin\wimlib-imagex.exe info "ISOFOLDER\sources\boot.wim" 1 "Microsoft Windows PE (arm64)" "Microsoft Windows PE (arm64)" --image-property FLAGS=9
.\bin\wimlib-imagex.exe update "ISOFOLDER\sources\boot.wim" 1 --command="delete '\Windows\system32\winpeshl.ini'"

if (Test-Path "bin\temp") { Remove-Item "bin\temp" -Recurse -Force }
New-Item -ItemType Directory -Path "bin\temp" -Force | Out-Null
$wper = "Microsoft\Windows NT\CurrentVersion\WinPE"
.\bin\wimlib-imagex.exe extract "ISOFOLDER\sources\boot.wim" 1 "Windows\System32\config\SOFTWARE" --dest-dir=".\bin\temp" --no-acls --no-attributes
.\bin\offlinereg.exe ".\bin\temp\SOFTWARE" "Microsoft\Windows NT\CurrentVersion" setvalue SystemRoot "X:\`$windows.~bt\Windows"
.\bin\offlinereg.exe ".\bin\temp\SOFTWARE.new" "$wper" setvalue InstRoot "X:\`$windows.~bt\"
.\bin\offlinereg.exe ".\bin\temp\SOFTWARE.new" "$wper" setvalue CustomBackground "%SystemRoot%\System32\winre.jpg" 2
.\bin\offlinereg.exe ".\bin\temp\SOFTWARE.new" "$wper" deletevalue CustomShell

.\bin\wimlib-imagex.exe extract "ISOFOLDER\sources\boot.wim" 1 "Windows\System32\winpe.jpg" --dest-dir="ISOFOLDER\sources" --no-acls --no-attributes --nullglob
.\bin\wimlib-imagex.exe extract "ISOFOLDER\sources\boot.wim" 1 "Windows\System32\winre.jpg" --dest-dir="ISOFOLDER\sources" --no-acls --no-attributes --nullglob

$bkimg = $null
foreach ($candidate in @("background_cli.bmp", "background_svr.bmp", "background_cli.png", "background_svr.png", "winpe.jpg")) {
    if ((Test-Path "ISOFOLDER\sources\$candidate") -and (-not $bkimg)) { $bkimg = $candidate }
}

$bootWimCmd1 = @("add 'bin\temp\SOFTWARE.new' '\Windows\System32\config\SOFTWARE'")
if ($bkimg -and (-not (Test-Path "ISOFOLDER\sources\winre.jpg"))) {
    $bootWimCmd1 += "add 'ISOFOLDER\sources\$bkimg' '\Windows\system32\winre.jpg'"
}
$bootWimCmd1 | Set-Content -Path "bin\boot-wim.txt" -Encoding ASCII
Get-Content "bin\boot-wim.txt" | .\bin\wimlib-imagex.exe update "ISOFOLDER\sources\boot.wim" 1
Remove-Item "bin\temp" -Recurse -Force

.\bin\wimlib-imagex.exe extract "UUPs\core_it-it.esd" 3 "Windows\system32\xmllite.dll" --dest-dir="ISOFOLDER\sources" --no-acls --no-attributes
$bootWimCmd2 = @(
    "delete '\Windows\system32\winpeshl.ini'",
    "add 'ISOFOLDER\setup.exe' '\setup.exe'",
    "add 'ISOFOLDER\sources\inf\setup.cfg' '\sources\inf\setup.cfg'"
)
if ($bkimg) {
    $bootWimCmd2 += "add 'ISOFOLDER\sources\$bkimg' '\sources\background.bmp'"
    $bootWimCmd2 += "add 'ISOFOLDER\sources\$bkimg' '\Windows\system32\setup.bmp'"
    if (-not (Test-Path "ISOFOLDER\sources\winpe.jpg")) { $bootWimCmd2 += "add 'ISOFOLDER\sources\$bkimg' '\Windows\system32\winpe.jpg'" }
    if (-not (Test-Path "ISOFOLDER\sources\winre.jpg")) { $bootWimCmd2 += "add 'ISOFOLDER\sources\$bkimg' '\Windows\system32\winre.jpg'" }
}
foreach ($line in (Get-Content "bin\bootwim.txt")) {
    $f = $line.Trim()
    if ($f -and (Test-Path "ISOFOLDER\sources\$f")) { $bootWimCmd2 += "add 'ISOFOLDER\sources\$f' '\sources\$f'" }
}
foreach ($line in (Get-Content "bin\bootmui.txt")) {
    $f = $line.Trim()
    if ($f -and (Test-Path "ISOFOLDER\sources\it-it\$f")) { $bootWimCmd2 += "add 'ISOFOLDER\sources\it-it\$f' '\sources\it-it\$f'" }
}
.\bin\wimlib-imagex.exe export "temp\winre.wim" 1 "ISOFOLDER\sources\boot.wim" "Microsoft Windows Setup (arm64)" "Microsoft Windows Setup (arm64)" --boot
New-Item -ItemType Directory -Path "bin\temp" -Force | Out-Null
.\bin\wimlib-imagex.exe extract "ISOFOLDER\sources\boot.wim" 2 "Windows\System32\config\SOFTWARE" --dest-dir=".\bin\temp" --no-acls --no-attributes
.\bin\offlinereg.exe ".\bin\temp\SOFTWARE" "$wper" setvalue CustomBackground "%SystemRoot%\System32\setup.bmp" 2
.\bin\offlinereg.exe ".\bin\temp\SOFTWARE.new" "$wper" deletevalue CustomShell
$bootWimCmd2 += "add 'bin\temp\SOFTWARE.new' '\Windows\System32\config\SOFTWARE'"
$bootWimCmd2 | Set-Content -Path "bin\boot-wim.txt" -Encoding ASCII
Get-Content "bin\boot-wim.txt" | .\bin\wimlib-imagex.exe update "ISOFOLDER\sources\boot.wim" 2
.\bin\wimlib-imagex.exe info "ISOFOLDER\sources\boot.wim" 2 --image-property FLAGS=2
if ($bkimg) {
    .\bin\wimlib-imagex.exe update "ISOFOLDER\sources\boot.wim" 1 --command="add 'ISOFOLDER\sources\$bkimg' '\Windows\system32\winpe.jpg'"
}
Remove-Item "bin\boot-wim.txt", "ISOFOLDER\sources\xmllite.dll", "ISOFOLDER\sources\winpe.jpg", "ISOFOLDER\sources\winre.jpg" -Force -ErrorAction SilentlyContinue
Remove-Item "bin\temp", "temp" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "[5/6] Iniezione 346 Driver Qualcomm/Lenovo ARM64, Autounattend e App Default..." -ForegroundColor Green
.\bin\wimlib-imagex.exe extract "UUPs\core_it-it.esd" 3 "Windows\Boot\Fonts\*" --dest-dir="ISOFOLDER\boot\fonts" --no-acls --no-attributes
New-Item -ItemType Directory -Path "ISOFOLDER\efi\microsoft\boot\fonts" -Force | Out-Null
Copy-Item "ISOFOLDER\boot\fonts\*" "ISOFOLDER\efi\microsoft\boot\fonts\" -Force

New-Item -ItemType Directory -Path "ISOFOLDER\`$WinPEDriver`$" -Force | Out-Null
Copy-Item "Drivers\WinPE\*" "ISOFOLDER\`$WinPEDriver`$\" -Recurse -Force
Copy-Item "Drivers\ALL\*" "ISOFOLDER\`$WinPEDriver`$\" -Recurse -Force

Copy-Item "..\autounattend_snapdragon_14Q8X9.xml" "ISOFOLDER\autounattend.xml" -Force
New-Item -ItemType Directory -Path "ISOFOLDER\sources\`$OEM`$\`$`$\Panther" -Force | Out-Null
Copy-Item "..\autounattend_snapdragon_14Q8X9.xml" "ISOFOLDER\sources\`$OEM`$\`$`$\Panther\unattend.xml" -Force

New-Item -ItemType Directory -Path "ISOFOLDER\sources\`$OEM`$\`$`$\Temp\OEM_Apps" -Force | Out-Null
Copy-Item "..\oem_apps\*" "ISOFOLDER\sources\`$OEM`$\`$`$\Temp\OEM_Apps\" -Recurse -Force

Write-Host "[6/6] Generazione ISO UEFI ARM64 con cdimage.exe..." -ForegroundColor Green
$isoOut = Join-Path (Split-Path $PSScriptRoot -Parent) "Win11_26H2_ARM64_IT_Lenovo_14Q8X9_Clean.iso"
if (Test-Path $isoOut) { Remove-Item $isoOut -Force }
.\bin\cdimage.exe -bootdata:1#pEF,e,b"ISOFOLDER\efi\Microsoft\boot\efisys.bin" -o -m -u2 -udfver102 -lCCSA_ARM64FRE_IT-IT_DV9 ISOFOLDER "$isoOut"

Write-Host ""
Write-Host "[OK] ISO CREATA CON SUCCESSO:" -ForegroundColor Green
Get-Item $isoOut | Select-Object FullName, @{N="SizeGB";E={[math]::Round($_.Length/1GB, 2)}}, LastWriteTime
