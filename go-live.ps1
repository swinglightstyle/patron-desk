<#
  go-live: schedule the coming week's posts on Patreon, after Beth says yes.

  Run it from this folder (right click, Run with PowerShell), or:
      powershell -ExecutionPolicy Bypass -File go-live.ps1
  Options:
      -Days 7          how many days after today the batch covers (default 7)
      -PreviewOnly     show the batch and its preview page, approve nothing
      -NoOpen          with -PreviewOnly: do not open the preview page (for checks)

  What it does:
  1. Lists the posts dated from today to the days ahead that are not yet
     scheduled, and opens a preview page with every post in full.
  2. Asks Beth to type yes. Typing yes approves this batch only: the
     approval file names each post and its fingerprint, so a post changed
     afterwards is not scheduled.
  3. Opens the browser on Patreon's new post page with the batch marker.
     The extension opens its desk; Beth presses "Start the batch" there.

  No server, nothing listening, no login kept. The browser is the one in
  places.json, signed in as Beth already is.

  On a Mac, go-live.sh does the same.
#>
param(
    [int]$Days = 7,
    [switch]$PreviewOnly,
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$python = $null
foreach ($name in @("python", "py")) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { $python = $cmd.Source; break }
}
if (-not $python) {
    Write-Host "Python was not found. It is needed to read the packages."
    exit 2
}

function Run-Desk([string[]]$DeskArgs) {
    $out = & $python -B desk.py @DeskArgs
    $script:deskCode = $LASTEXITCODE
    return $out
}

function Line-After([object[]]$Lines, [string]$Prefix) {
    $hit = $Lines | Where-Object { $_ -like "$Prefix *" } | Select-Object -Last 1
    if ($hit) { return $hit.Substring($Prefix.Length + 1) }
    return $null
}

$shown = Run-Desk @("batch", "--days", "$Days")
$shown | Where-Object { $_ -notlike "PREVIEW *" -and $_ -notlike "BATCH *" } | ForEach-Object { Write-Host $_ }
if ($deskCode -ne 0) {
    Write-Host ""
    Write-Host "Nothing to approve."
    exit $deskCode
}
$batch = Line-After $shown "BATCH"
$preview = Line-After $shown "PREVIEW"
Write-Host ""
Write-Host "Batch $batch. The preview page is opening: read every post in it."
if (-not ($PreviewOnly -and $NoOpen)) { Start-Process -FilePath $preview }

if ($PreviewOnly) { exit 0 }

Write-Host ""
$answer = Read-Host "Type yes to approve this batch and schedule it on Patreon (anything else stops)"
if ($answer.Trim().ToLower() -ne "yes") {
    Write-Host "Nothing approved. Nothing scheduled."
    exit 1
}

$approved = Run-Desk @("approve", "--days", "$Days", "--batch-id", $batch)
$approved | Where-Object { $_ -notlike "OPEN *" } | ForEach-Object { Write-Host $_ }
if ($deskCode -ne 0) { exit $deskCode }
$url = Line-After $approved "OPEN"

$found = Run-Desk @("browser")
if ($deskCode -ne 0) { $found | ForEach-Object { Write-Host $_ }; exit $deskCode }
$browser = Line-After $found "BROWSER"
$browserProfile = Line-After $found "PROFILE"
$browserArgs = @()
if ($browserProfile) { $browserArgs += "--profile-directory=$browserProfile" }
$browserArgs += $url
Start-Process -FilePath $browser -ArgumentList $browserArgs

Write-Host ""
Write-Host "Patreon is opening. The patron desk opens beside it."
Write-Host "Press 'Start the batch' in the desk. The first time, choose the packages folder there first."
Write-Host "The desk schedules each post only when every check passes, and stops on any miss."
