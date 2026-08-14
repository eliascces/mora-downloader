$ErrorActionPreference = 'Stop'
$dest = Join-Path $PSScriptRoot '..\assets\resources'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Write-Host '==> Descargando yt-dlp.exe (GitHub official)...'
$ytUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
& curl.exe -L --fail --retry 3 -o (Join-Path $dest 'yt-dlp.exe') $ytUrl
if ($LASTEXITCODE -ne 0) { throw 'Fallo al descargar yt-dlp (curl exit code ' + $LASTEXITCODE + ')' }

Write-Host '==> Descargando ffmpeg (BtbN/FFmpeg-Builds on GitHub, shared)...'
$zip = Join-Path $env:TEMP 'ffmpeg-master-win64-gpl-shared.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
& curl.exe -L --fail --retry 3 -o $zip 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip'
if ($LASTEXITCODE -ne 0) { throw 'Fallo al descargar ffmpeg (curl exit code ' + $LASTEXITCODE + ')' }
$ffDest = Join-Path $env:TEMP 'ffmpeg-btbn-extract'
if (Test-Path $ffDest) { Remove-Item $ffDest -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $ffDest -Force
$binDir = Get-ChildItem -Path $ffDest -Recurse -Directory -Filter 'bin' | Select-Object -First 1
Get-ChildItem $binDir.FullName | Copy-Item -Destination $dest -Force

Write-Host '==> Descargando deno.exe (JavaScript runtime para yt-dlp EJS)...'
$denoZip = Join-Path $env:TEMP 'deno-x86_64-pc-windows-msvc.zip'
if (Test-Path $denoZip) { Remove-Item $denoZip -Force }
& curl.exe -L --fail --retry 3 -o $denoZip 'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip'
if ($LASTEXITCODE -ne 0) { throw 'Fallo al descargar deno (curl exit code ' + $LASTEXITCODE + ')' }
$denoDest = Join-Path $env:TEMP 'deno-extract'
if (Test-Path $denoDest) { Remove-Item $denoDest -Recurse -Force }
Expand-Archive -Path $denoZip -DestinationPath $denoDest -Force
Copy-Item (Join-Path $denoDest 'deno.exe') -Destination $dest -Force

Write-Host '==> Binarios listos en assets/resources:'
Get-ChildItem $dest | Select-Object Name, @{N='MB';E={[math]::Round($_.Length/1MB,1)}} | Format-Table -AutoSize
