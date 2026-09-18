<#
.SYNOPSIS
  Fetch the Liquipedia source data for TI1 and TI4-TI8 from a clean IP.

.DESCRIPTION
  The antvelm.net box got itself rate-limited (HTTP 429) pulling this data, so it is
  fetched from elsewhere instead and copied over. Windows PowerShell 5.1 and
  PowerShell 7+ both work; no Python and nothing to install.

  Seven requests: one bulk 'query' for all twelve wikitext pages, then one 'parse'
  per overview page for the participant rosters, spaced 3 seconds apart. That is
  well inside Liquipedia's rate limits - please do not lower the delay.

.EXAMPLE
  git pull
  .\tools\ti_fetch.ps1          # writes source-drop\ti-source.zip
  git add source-drop; git commit -m "source dump"; git push
#>

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'   # the progress bar makes IWR crawl

$ua  = "TIArchive/0.1 (https://github.com/antvelm/dota2_ti_archive; contact: anton@manapotionstudios.com)"
$api = "https://liquipedia.net/dota2/api.php"
# Always land in <repo>/source-drop, whatever directory it is invoked from.
$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$drop = Join-Path $root "source-drop"
$out  = Join-Path $drop "raw"
$zip  = Join-Path $drop "ti-source.zip"

$brackets = @(
  "The International/2011/Playoffs",
  "The International/2014/Main Event",
  "The International/2015/Main Event",
  "The International/2016/Main Event",
  "The International/2017/Main Event",
  "The International/2018/Main Event"
)
$overviews = @(2011, 2014, 2015, 2016, 2017, 2018)
$titles = ($brackets + ($overviews | ForEach-Object { "The International/$_" })) -join "|"

New-Item -ItemType Directory -Force -Path $out | Out-Null
$failed = @()

function Get-Api {
    param([string]$Url, [string]$OutFile)
    Invoke-WebRequest -Uri $Url -Headers @{ "User-Agent" = $ua } `
                      -OutFile $OutFile -UseBasicParsing -TimeoutSec 90
}

Write-Host "1/7  all wikitext in one query request ..." -ForegroundColor Cyan
try {
    $u = "$($api)?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json&titles=" +
         [uri]::EscapeDataString($titles)
    Get-Api -Url $u -OutFile (Join-Path $out "wikitext.json")
    $kb = [math]::Round((Get-Item (Join-Path $out "wikitext.json")).Length / 1KB)
    Write-Host "     ok - $kb KB" -ForegroundColor Green
} catch {
    Write-Host "     FAILED: $($_.Exception.Message)" -ForegroundColor Red
    $failed += "wikitext"
}

$n = 1
foreach ($y in $overviews) {
    $n++
    Start-Sleep -Seconds 3
    Write-Host "$n/7  rosters for The International/$y ..." -ForegroundColor Cyan
    try {
        $p = [uri]::EscapeDataString("The International/$y")
        $f = Join-Path $out "overview-$y.json"
        Get-Api -Url "$($api)?action=parse&page=$p&prop=text&format=json" -OutFile $f
        $kb = [math]::Round((Get-Item $f).Length / 1KB)
        Write-Host "     ok - $kb KB" -ForegroundColor Green
    } catch {
        Write-Host "     FAILED: $($_.Exception.Message)" -ForegroundColor Red
        $failed += "overview-$y"
    }
}

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $out "*") -DestinationPath $zip -Force
$zkb = [math]::Round((Get-Item $zip).Length / 1KB)

Write-Host ""
if ($failed.Count) {
    Write-Host "$($failed.Count) request(s) failed: $($failed -join ', ')" -ForegroundColor Yellow
    Write-Host "A 429 means rate-limited - wait 15 minutes and run it again." -ForegroundColor Yellow
} else {
    Write-Host "All 7 requests succeeded." -ForegroundColor Green
}
Write-Host "wrote $zip ($zkb KB)"
Remove-Item $out -Recurse -Force        # the zip is what gets committed
Write-Host ""
Write-Host "Now push it:" -ForegroundColor Cyan
Write-Host "  git add source-drop"
Write-Host "  git commit -m `"TI1/TI4-TI8 Liquipedia source dump`""
Write-Host "  git push"
