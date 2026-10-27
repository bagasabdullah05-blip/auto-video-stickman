param([string]$toolsDir)
$ErrorActionPreference = 'Stop'
if (-not $toolsDir) { $toolsDir = Join-Path (Get-Location) 'tools' }
$versi = $null
try {
  $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 90
  $versi = ($index | Where-Object { $_.version -like 'v22.*' -and $_.lts } | Select-Object -First 1).version
  if (-not $versi) { $versi = ($index | Where-Object { $_.version -like 'v22.*' } | Select-Object -First 1).version }
} catch { }
if (-not $versi) { $versi = 'v22.12.0' }
Write-Host "Node.js: $versi"

$zip = Join-Path $env:TEMP 'vvs-node-dl.zip'
$ok = $false
foreach ($mirror in @("https://nodejs.org/dist/$versi/node-$versi-win-x64.zip", "https://npmmirror.com/mirrors/node/$versi/node-$versi-win-x64.zip")) {
  try {
    Write-Host "Mengunduh: $mirror"
    if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $mirror -OutFile $zip -TimeoutSec 600
    if ((Get-Item $zip).Length -gt 10MB) { $ok = $true; break }
  } catch {
    Write-Host "  gagal: $($_.Exception.Message)"
  }
}
if (-not $ok) { Write-Host '  GAGAL mengunduh Node.js'; exit 1 }

$tmp = Join-Path $toolsDir '_node_tmp'
if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
$inner = Get-ChildItem -LiteralPath $tmp -Directory | Select-Object -First 1
$dest = Join-Path $toolsDir 'node'
if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
Move-Item -LiteralPath $inner.FullName -Destination $dest
Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue

$exe = Join-Path $dest 'node.exe'
if (-not (Test-Path -LiteralPath $exe)) { Write-Host '  GAGAL: node.exe tidak ditemukan setelah ekstrak'; exit 1 }
$v = & $exe --version
Write-Host "  terpasang: $v"
exit 0
