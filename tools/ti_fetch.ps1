<#
.SYNOPSIS
  Fetch the Liquipedia source data for TI1 and TI4-TI8 from a clean IP.

.DESCRIPTION
  Run this when the usual machine has been rate-limited, then commit the result and
  push, so that machine can pull it instead of calling Liquipedia at all.

  Seven requests: one bulk 'query' for all twelve wikitext pages, then one 'parse'
  per overview page for the participant rosters, spaced 3 seconds apart. That is
  well inside Liquipedia's rate limits - please do not lower the delay.

  Liquipedia REQUIRES gzip: a request without an Accept-Encoding header is answered
  406 Not Acceptable, whatever else is right about it. Invoke-WebRequest does not
  send one, so this uses HttpClient with AutomaticDecompression, which both sends
  the header and unpacks the reply. Works on Windows PowerShell 5.1 and PowerShell 7+.

.EXAMPLE
  git pull
  .\tools\ti_fetch.ps1          # writes source-drop\ti-source.zip
  git add source-drop; git commit -m "source dump"; git push
#>

$ErrorActionPreference = 'Stop'

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

try { Add-Type -AssemblyName System.Net.Http } catch { }   # already loaded on PS 7
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor
                                  [System.Net.DecompressionMethods]::Deflate
$client = [System.Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(120)
$client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", $ua) | Out-Null

function Get-Api {
    param([string]$Url, [string]$OutFile)
    $resp = $client.GetAsync($Url).GetAwaiter().GetResult()
    if (-not $resp.IsSuccessStatusCode) {
        throw "HTTP $([int]$resp.StatusCode) $($resp.ReasonPhrase)"
    }
    $text = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    [System.IO.File]::WriteAllText($OutFile, $text, [System.Text.UTF8Encoding]::new($false))
    return $text.Length
}

New-Item -ItemType Directory -Force -Path $out | Out-Null
$failed = @()
$ok = 0

Write-Host "1/7  all wikitext in one query request ..." -ForegroundColor Cyan
try {
    $u = "$($api)?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json&titles=" +
         [uri]::EscapeDataString($titles)
    $n = Get-Api -Url $u -OutFile (Join-Path $out "wikitext.json")
    Write-Host "     ok - $([math]::Round($n / 1KB)) KB" -ForegroundColor Green
    $ok++
} catch {
    Write-Host "     FAILED: $($_.Exception.Message)" -ForegroundColor Red
    $failed += "wikitext"
}

$i = 1
foreach ($y in $overviews) {
    $i++
    Start-Sleep -Seconds 3
    Write-Host "$i/7  rosters for The International/$y ..." -ForegroundColor Cyan
    try {
        $p = [uri]::EscapeDataString("The International/$y")
        $n = Get-Api -Url "$($api)?action=parse&page=$p&prop=text&format=json" `
                     -OutFile (Join-Path $out "overview-$y.json")
        Write-Host "     ok - $([math]::Round($n / 1KB)) KB" -ForegroundColor Green
        $ok++
    } catch {
        Write-Host "     FAILED: $($_.Exception.Message)" -ForegroundColor Red
        $failed += "overview-$y"
    }
}

Write-Host ""
if ($ok -eq 0) {
    Write-Host "Every request failed - nothing to zip." -ForegroundColor Red
    Write-Host "406 means the gzip header did not go out; 429 means rate-limited, wait 15 min." -ForegroundColor Yellow
    Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
}
if ($failed.Count) {
    Write-Host "$($failed.Count) of 7 failed: $($failed -join ', ')" -ForegroundColor Yellow
} else {
    Write-Host "All 7 requests succeeded." -ForegroundColor Green
}

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $out "*") -DestinationPath $zip -Force
Remove-Item $out -Recurse -Force            # the zip is what gets committed
Write-Host "wrote $zip ($([math]::Round((Get-Item $zip).Length / 1KB)) KB)"
Write-Host ""
Write-Host "Now push it:" -ForegroundColor Cyan
Write-Host "  git add source-drop"
Write-Host "  git commit -m `"TI1/TI4-TI8 Liquipedia source dump`""
Write-Host "  git push"
