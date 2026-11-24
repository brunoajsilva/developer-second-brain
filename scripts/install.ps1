# Installs (or updates) Developer SecondBrain on Windows from the latest GitHub release.
# Usage (PowerShell):  irm https://raw.githubusercontent.com/brunoajsilva/developer-second-brain/main/scripts/install.ps1 | iex
$ErrorActionPreference = 'Stop'
$repo = 'brunoajsilva/developer-second-brain'
$dir = Join-Path $env:LOCALAPPDATA 'SecondBrain'
$exe = Join-Path $dir 'secondbrain.exe'

New-Item -ItemType Directory -Force $dir | Out-Null
Write-Host 'Looking for the latest version...'
$release = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'secondbrain-installer' }
$asset = $release.assets | Where-Object { $_.name -eq 'secondbrain.exe' } | Select-Object -First 1
if (-not $asset) { throw "Release $($release.tag_name) has no secondbrain.exe file." }

Get-Process -Name 'secondbrain' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "Downloading $($release.tag_name)..."
Invoke-WebRequest $asset.browser_download_url -OutFile $exe
Unblock-File $exe

# "secondbrain" command in every new terminal
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($userPath -split ';') -notcontains $dir) { [Environment]::SetEnvironmentVariable('Path', ($userPath.TrimEnd(';') + ';' + $dir), 'User') }

# Start menu shortcut
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'Developer SecondBrain.lnk'
$link = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcut)
$link.TargetPath = $exe; $link.WorkingDirectory = $dir; $link.Save()

Write-Host "Done: $($release.tag_name) installed in $dir"
Write-Host 'Open a new terminal and type: secondbrain   (or search "Developer SecondBrain" in the Start menu)'
