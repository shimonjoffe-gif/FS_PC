# Sync local data/projects.db + data/uploads to Railway volume (/data).
# Requires: railway CLI linked to FS_PC_Server, OpenSSH (Windows 10+).
param(
  [string]$Service = 'FS_PC_Server',
  [string]$RemoteData = '/data'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Db = Join-Path $Root 'data\projects.db'
$Uploads = Join-Path $Root 'data\uploads'

if (-not (Test-Path $Db)) { throw "Missing $Db" }
if (-not (Test-Path $Uploads)) { throw "Missing $Uploads" }

Write-Host 'Checkpoint local SQLite WAL...'
node (Join-Path $PSScriptRoot 'checkpoint-db.mjs')

Write-Host 'Configure SSH for Railway...'
railway.cmd ssh config -s $Service | Out-Null

$sshDir = Join-Path $env:USERPROFILE '.ssh'
$cfg = Join-Path $sshDir 'config'
$key = Join-Path $sshDir 'id_ed25519'
$known = Join-Path $sshDir 'known_hosts'
if (-not (Test-Path $cfg)) { throw "SSH config not found: $cfg" }
if (-not (Test-Path $key)) { throw "SSH private key not found: $key" }
if (-not (Test-Path $known)) { New-Item -ItemType File -Path $known -Force | Out-Null }
cmd /c "ssh-keyscan ssh.railway.com 2>nul >> `"$known`""

$hostLine = Get-Content $cfg | Where-Object { $_ -match '^\s*Host\s+railway-' } | Select-Object -Last 1
if (-not $hostLine) { throw 'Host entry not found in Railway ssh-config' }
$sshHost = ($hostLine -replace '^\s*Host\s+', '').Trim()
Write-Host "SSH host: $sshHost"

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$remoteDbNew = "$RemoteData/projects.db.$stamp"
$remoteDb = "$RemoteData/projects.db"

Write-Host 'Upload projects.db...'
scp -o BatchMode=yes -F $cfg -i $key $Db "${sshHost}:$remoteDbNew"
railway.cmd ssh -s $Service -- "rm -f '$RemoteData/projects.db-wal' '$RemoteData/projects.db-shm' && mv '$remoteDbNew' '$remoteDb' && ls -lh '$remoteDb'"

Write-Host 'Upload uploads/ (tar.gz)...'
$archive = Join-Path $env:TEMP "fs-pc-uploads-$stamp.tgz"
if (Test-Path $archive) { Remove-Item $archive -Force }
Push-Location (Join-Path $Root 'data')
tar -czf $archive uploads
Pop-Location
scp -o BatchMode=yes -F $cfg -i $key $archive "${sshHost}:$RemoteData/uploads-sync.tgz"
railway.cmd ssh -s $Service -- "cd '$RemoteData' && rm -rf uploads && tar -xzf uploads-sync.tgz && rm uploads-sync.tgz && ls -lh uploads/widgets | head -5"

Remove-Item $archive -Force -ErrorAction SilentlyContinue

Write-Host 'Verify remote counts...'
railway.cmd ssh -s $Service -- "node -e `"const Database=require('better-sqlite3');const db=new Database('/data/projects.db',{readonly:true});for(const t of ['segments','stakeholder_roles','widgets'])console.log(t,db.prepare('SELECT COUNT(*) c FROM '+t).get().c);const img=db.prepare(\\\`SELECT COUNT(*) c FROM widgets WHERE image_path IS NOT NULL AND trim(image_path)<>''\\\`).get().c;console.log('widgets_with_image',img);db.close();`""

Write-Host 'Done. Redeploy or restart FS_PC_Server if API still serves old files.'
