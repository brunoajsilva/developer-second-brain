# Instala (ou atualiza) o Developer SecondBrain no Windows, a partir da última release do GitHub.
# Uso (PowerShell):  irm https://raw.githubusercontent.com/brunoajsilva/developer-second-brain/main/scripts/instalar.ps1 | iex
$ErrorActionPreference = 'Stop'
$repo = 'brunoajsilva/developer-second-brain'
$dir = Join-Path $env:LOCALAPPDATA 'SecondBrain'
$exe = Join-Path $dir 'secondbrain.exe'

New-Item -ItemType Directory -Force $dir | Out-Null
Write-Host 'A procurar a última versão...'
$rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'secondbrain-instalador' }
$asset = $rel.assets | Where-Object { $_.name -eq 'secondbrain.exe' } | Select-Object -First 1
if (-not $asset) { throw "A release $($rel.tag_name) não tem o ficheiro secondbrain.exe." }

Get-Process -Name 'secondbrain' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "A descarregar $($rel.tag_name)..."
Invoke-WebRequest $asset.browser_download_url -OutFile $exe
Unblock-File $exe

# comando "secondbrain" em qualquer terminal novo
$p = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($p -split ';') -notcontains $dir) { [Environment]::SetEnvironmentVariable('Path', ($p.TrimEnd(';') + ';' + $dir), 'User') }

# atalho no menu Iniciar
$atalho = Join-Path ([Environment]::GetFolderPath('Programs')) 'Developer SecondBrain.lnk'
$l = (New-Object -ComObject WScript.Shell).CreateShortcut($atalho)
$l.TargetPath = $exe; $l.WorkingDirectory = $dir; $l.Save()

Write-Host "Pronto: $($rel.tag_name) instalado em $dir"
Write-Host 'Abre um terminal novo e escreve: secondbrain   (ou procura "Developer SecondBrain" no menu Iniciar)'
