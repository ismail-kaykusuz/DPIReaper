# DPIReaper release derleyici — installer (.exe) uretir
# Cikti: src-tauri\target\release\bundle\nsis\DPIReaper_1.0.0_x64-setup.exe
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path "$PSScriptRoot\..").Path

Set-Location $Root
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

Write-Host "=== DPIReaper Release Build ===" -ForegroundColor Cyan
Write-Host "Proje: $Root"

$proxySidecar = Join-Path $Root "src-tauri\binaries\dpireaper-proxy-x86_64-pc-windows-msvc.exe"
if (-not (Test-Path $proxySidecar)) {
    Write-Host "dpireaper-proxy eksik - derleniyor..." -ForegroundColor Yellow
    & npm run build-proxy
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# Visual Studio C++ ortam degiskenleri (msvcrt.lib icin)
$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
    $vsPath = & $vswhere -version '[17,18)' -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if (-not $vsPath) {
        $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    }
    if ($vsPath) {
        $vcvars = Join-Path $vsPath "VC\Auxiliary\Build\vcvars64.bat"
        if (Test-Path $vcvars) {
            Write-Host "VS ortami yukleniyor: $vsPath" -ForegroundColor Gray
            cmd /c "`"$vcvars`" >nul 2>&1 && set" | ForEach-Object {
                if ($_ -match '^([^=]+)=(.*)$') {
                    Set-Item -Path "env:$($matches[1])" -Value $matches[2]
                }
            }
        } else {
            Write-Host "UYARI: vcvars64.bat bulunamadi: $vcvars" -ForegroundColor Yellow
        }
    } else {
        Write-Host "UYARI: VS 2022 C++ Build Tools bulunamadi." -ForegroundColor Yellow
    }
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "HATA: Rust (cargo) PATH'te yok. Yeni terminal acin veya Rust'i kurun." -ForegroundColor Red
    exit 1
}

Write-Host "Tauri release build baslatiliyor (10-20 dk surebilir)..." -ForegroundColor Green
npm run tauri build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$nsisPath = Join-Path $Root "src-tauri\target\release\bundle\nsis"
$msiPath  = Join-Path $Root "src-tauri\target\release\bundle\msi"

Write-Host ""
Write-Host "=== BUILD TAMAMLANDI ===" -ForegroundColor Green
if (Test-Path $nsisPath) {
    Write-Host "NSIS Installer:" -ForegroundColor Cyan
    Get-ChildItem $nsisPath -Filter "*.exe" | ForEach-Object { Write-Host "  $($_.FullName)" }
}
if (Test-Path $msiPath) {
    Write-Host "MSI Installer:" -ForegroundColor Cyan
    Get-ChildItem $msiPath -Filter "*.msi" | ForEach-Object { Write-Host "  $($_.FullName)" }
}
