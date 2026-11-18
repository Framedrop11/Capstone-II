param(
  [ValidateSet('backup', 'verify-restore')]
  [string]$Mode = 'backup',
  [string]$ArchivePath
)

$ErrorActionPreference = 'Stop'
$container = 'carelens-mongo-1'
$containerArchive = '/tmp/carelens-demo.archive.gz'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backupDirectory = Join-Path $projectRoot '.backups'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker CLI is required.' }
if (-not $ArchivePath) {
  if ($Mode -eq 'backup') {
    $ArchivePath = Join-Path $backupDirectory ('carelens-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + '.archive.gz')
  } else {
    $latest = Get-ChildItem -LiteralPath $backupDirectory -Filter 'carelens-*.archive.gz' -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if (-not $latest) { throw 'No ignored CareLens archive was found in .backups.' }
    $ArchivePath = $latest.FullName
  }
}
$ArchivePath = [System.IO.Path]::GetFullPath($ArchivePath)

function Invoke-DockerChecked([string[]]$DockerArgs) {
  & docker @DockerArgs
  if ($LASTEXITCODE -ne 0) { throw "Docker operation failed with exit code $LASTEXITCODE." }
}

if ($Mode -eq 'backup') {
  New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
  Invoke-DockerChecked @('exec', $container, 'sh', '-lc', 'mongodump --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db carelens --archive=/tmp/carelens-demo.archive.gz --gzip')
  try {
    Invoke-DockerChecked @('cp', "${container}:$containerArchive", $ArchivePath)
  } finally {
    & docker exec $container rm -f $containerArchive | Out-Null
  }
  Write-Output "Backup archive created: $ArchivePath"
  Write-Output 'The archive contains the local CareLens database; keep it private and out of Git.'
  exit 0
}

if (-not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)) { throw 'The specified archive does not exist.' }
$containerDbCount = 'db.getSiblingDB("carelens").getCollectionNames().reduce((n,c)=>n+db.getSiblingDB("carelens").getCollection(c).countDocuments(),0)'
$restoreDbCount = 'db.getSiblingDB("carelens_restore_drill").getCollectionNames().reduce((n,c)=>n+db.getSiblingDB("carelens_restore_drill").getCollection(c).countDocuments(),0)'
$sourceCount = 0
try {
  Invoke-DockerChecked @('cp', $ArchivePath, "${container}:$containerArchive")
  $sourceRaw = & docker exec $container sh -lc "mongosh --quiet --username `"`$MONGO_INITDB_ROOT_USERNAME`" --password `"`$MONGO_INITDB_ROOT_PASSWORD`" --authenticationDatabase admin --eval '$containerDbCount'"
  if ($LASTEXITCODE -ne 0 -or -not [int]::TryParse(($sourceRaw | Select-Object -Last 1), [ref]$sourceCount)) { throw 'Could not read the source document count.' }
  Invoke-DockerChecked @('exec', $container, 'sh', '-lc', 'mongorestore --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --gzip --archive=/tmp/carelens-demo.archive.gz --nsFrom="carelens.*" --nsTo="carelens_restore_drill.*" --drop')
  $restoredRaw = & docker exec $container sh -lc "mongosh --quiet --username `"`$MONGO_INITDB_ROOT_USERNAME`" --password `"`$MONGO_INITDB_ROOT_PASSWORD`" --authenticationDatabase admin --eval '$restoreDbCount'"
  $restoredCount = 0
  if ($LASTEXITCODE -ne 0 -or -not [int]::TryParse(($restoredRaw | Select-Object -Last 1), [ref]$restoredCount)) { throw 'Could not read the restored document count.' }
  if ($restoredCount -lt $sourceCount) { throw "Restore count check failed: source=$sourceCount restored=$restoredCount." }
  Write-Output "Restore verified: $restoredCount documents restored from $sourceCount source documents."
} finally {
  & docker exec $container sh -lc 'mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "db.getSiblingDB(\"carelens_restore_drill\").dropDatabase()"' | Out-Null
  & docker exec $container rm -f $containerArchive | Out-Null
}
