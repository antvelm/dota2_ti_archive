<#
.SYNOPSIS
  Fetch the Liquipedia source data for TI9-TI15 (2019, 2021-2026) from a clean IP.

.DESCRIPTION
  The PowerShell twin of tools/ti_fetch2.py - run whichever is easier on the machine
  you have. Run this when the usual machine has been rate-limited, then commit the
  result and push, so that machine can pull it instead of calling Liquipedia at all.

  One bulk 'query' for every wikitext page at once, then one 'parse' per page that
  exists, 3 seconds apart. That is well inside Liquipedia's rate limits - please do
  not lower the delay.

  It takes the rendered HTML as well as the wikitext because from about 2022 the
  brackets live in Liquipedia's database and the page text is only a placeholder:
  match ids, winners, lengths and VOD links appear once the page is rendered.

  Liquipedia REQUIRES gzip: a request without an Accept-Encoding header is answered
  406 Not Acceptable, whatever else is right about it. Invoke-WebRequest does not
  send one, so this uses HttpClient with AutomaticDecompression, which both sends
  the header and unpacks the reply. Works on Windows PowerShell 5.1 and PowerShell 7+.

  Optional: a free API key from https://api.liquipedia.net reads the database rows
  behind the 2022+ brackets directly - per game the Valve match id, the winner, the
  length and every VOD link, Russian included - instead of leaving them to be scraped
  out of HTML. Set $env:LIQUIPEDIA_API_KEY before running. Without one the script
  still works and simply skips that step.

.EXAMPLE
  git pull
  .\tools\ti_fetch2.ps1         # writes source-drop\ti-source-2.zip
  git add source-drop; git commit -m "Liquipedia source dump: TI9-TI15"; git push
#>

$ErrorActionPreference = 'Stop'

$ua  = "TIArchive/0.1 (https://github.com/antvelm/dota2_ti_archive; contact: anton@manapotionstudios.com)"
$api = "https://liquipedia.net/dota2/api.php"
$v3  = "https://api.liquipedia.net/api/v3/match"
$pause = 3

# Always land in <repo>/source-drop, whatever directory it is invoked from.
$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$drop = Join-Path $root "source-drop"
$out  = Join-Path $drop "raw2"
$zip  = Join-Path $drop "ti-source-2.zip"

$years = @(2019, 2021, 2022, 2023, 2024, 2025, 2026)
# Liquipedia has renamed the playoff subpage over the years and no single guess covers
# all seven, so ask for every name any of them might use. Asking costs nothing: they all
# travel in the one bulk request and the ones that do not exist come back marked missing.
$subpages = @("Main Event", "Playoffs", "Finals")

$wanted = foreach ($y in $years) {
    "The International/$y"
    foreach ($s in $subpages) { "The International/$y/$s" }
}

try { Add-Type -AssemblyName System.Net.Http } catch { }   # already loaded on PS 7
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor
                                  [System.Net.DecompressionMethods]::Deflate
$client = [System.Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(180)
$client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", $ua) | Out-Null

function Get-Api {
    param([string]$Url, [string]$OutFile, [string]$ApiKey)
    $req = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, $Url)
    if ($ApiKey) { $req.Headers.TryAddWithoutValidation("Authorization", "Apikey $ApiKey") | Out-Null }
    $resp = $client.SendAsync($req).GetAwaiter().GetResult()
    if (-not $resp.IsSuccessStatusCode) {
        throw "HTTP $([int]$resp.StatusCode) $($resp.ReasonPhrase)"
    }
    $text = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if ($OutFile) { [System.IO.File]::WriteAllText($OutFile, $text, [System.Text.UTF8Encoding]::new($false)) }
    return $text
}

# A page title is not a file name: "The International/2024/Main Event" -> "2024-Main-Event".
function Slugify([string]$title) {
    ($title -replace "^The International/", "" -replace "[\\/\s]+", "-")
}

New-Item -ItemType Directory -Force -Path $out | Out-Null

Write-Host "1.  all $($wanted.Count) wikitext pages in one query request ..." -ForegroundColor Cyan
$u = "$($api)?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json&titles=" +
     [uri]::EscapeDataString(($wanted -join "|"))
try {
    $text = Get-Api -Url $u -OutFile (Join-Path $out "wikitext.json")
} catch {
    Write-Host "    FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "    406 means the gzip header did not go out; 429 means rate-limited -" -ForegroundColor Yellow
    Write-Host "    wait a good while, do not retry on a timer." -ForegroundColor Yellow
    Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
}
$pages = ($text | ConvertFrom-Json).query.pages
$found = @()
foreach ($p in $pages.PSObject.Properties.Value) {
    if ($p.revisions) { $found += $p.title }
}
$found = @($found | Sort-Object)
Write-Host "    $($found.Count) of $($wanted.Count) exist" -ForegroundColor Green
$found | ForEach-Object { Write-Host "      $_" }
if ($found.Count -eq 0) {
    Write-Host "    nothing came back - stop here rather than retrying." -ForegroundColor Red
    exit 1
}

$mins = [math]::Ceiling($found.Count * $pause / 60)
Write-Host ""
Write-Host "2.  rendered HTML, one parse request each, ${pause}s apart (~$mins min) ..." -ForegroundColor Cyan
$i = 0
$failed = @()
foreach ($title in $found) {
    $i++
    Start-Sleep -Seconds $pause
    try {
        $n = (Get-Api -Url "$($api)?action=parse&page=$([uri]::EscapeDataString($title))&prop=text&format=json" `
                      -OutFile (Join-Path $out "html-$(Slugify $title).json")).Length
        Write-Host ("    {0}/{1}  {2,-44} {3,9:N0} chars" -f $i, $found.Count, $title, $n) -ForegroundColor Green
    } catch {
        Write-Host ("    {0}/{1}  {2,-44} FAILED: {3}" -f $i, $found.Count, $title, $_.Exception.Message) -ForegroundColor Red
        $failed += $title
    }
}

Write-Host ""
if (-not $env:LIQUIPEDIA_API_KEY) {
    Write-Host "3.  no LIQUIPEDIA_API_KEY set - skipping the database rows." -ForegroundColor Yellow
    Write-Host "    A free key from https://api.liquipedia.net turns the 2022+ brackets from"
    Write-Host "    HTML to be scraped into clean per-game JSON. Worth five minutes."
} else {
    $brackets = @($found | Where-Object { $_ -match "^The International/\d+/" })
    Write-Host "3.  match2 rows for $($brackets.Count) bracket pages ..." -ForegroundColor Cyan
    $i = 0
    foreach ($title in $brackets) {
        $i++
        Start-Sleep -Seconds $pause
        $cond = [uri]::EscapeDataString("[[pagename::$($title -replace ' ', '_')]]")
        try {
            $n = (Get-Api -Url "$($v3)?wiki=dota2&limit=500&conditions=$cond" `
                          -OutFile (Join-Path $out "v3-$(Slugify $title).json") `
                          -ApiKey $env:LIQUIPEDIA_API_KEY).Length
            Write-Host ("    {0}/{1}  {2,-44} {3,9:N0} chars" -f $i, $brackets.Count, $title, $n) -ForegroundColor Green
        } catch {
            Write-Host ("    {0}/{1}  {2,-44} FAILED: {3}" -f $i, $brackets.Count, $title, $_.Exception.Message) -ForegroundColor Red
        }
    }
}

Write-Host ""
if ($failed.Count) { Write-Host "$($failed.Count) page(s) failed: $($failed -join ', ')" -ForegroundColor Yellow }
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $out "*") -DestinationPath $zip -Force
Remove-Item $out -Recurse -Force            # the zip is what gets committed
Write-Host "wrote $zip ($([math]::Round((Get-Item $zip).Length / 1KB)) KB)"
Write-Host ""
Write-Host "Now push it:" -ForegroundColor Cyan
Write-Host "  git add source-drop"
Write-Host '  git commit -m "Liquipedia source dump: TI9-TI15"'
Write-Host "  git push"
