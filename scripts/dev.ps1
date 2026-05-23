# DPIReaper gelistirme ortami baslaticisi
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path "$PSScriptRoot\..").Path

Set-Location $Root
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

Write-Host "=== DPIReaper Dev ===" -ForegroundColor Cyan
Write-Host "Proje: $Root"

$proxySidecar = Join-Path $Root "src-tauri\binaries\dpireaper-proxy-x86_64-pc-windows-msvc.exe"
if (-not (Test-Path $proxySidecar)) {
    Write-Host "dpireaper-proxy eksik - derleniyor..." -ForegroundColor Yellow
    $go122 = Join-Path $Root "_tools\go122\bin\go.exe"
    if (-not (Test-Path $go122)) {
        Write-Host "HATA: Go 1.22 bulunamadi. Once: npm run build-proxy" -ForegroundColor Red
        exit 1
    }
    & npm run build-proxy
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# Visual Studio C++ ortam degiskenleri (msvcrt.lib icin)
$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
    # VS 2022 Build Tools oncelikli (Insiders linker/SDK sorunlarini onler)
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
        }
    }
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "HATA: Rust (cargo) PATH'te yok. Yeni terminal acin veya Rust'i kurun." -ForegroundColor Red
    exit 1
}

Write-Host "Tauri dev baslatiliyor (ilk derleme 5-15 dk surebilir)..." -ForegroundColor Green
npm run tauri dev
