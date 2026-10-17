# Launch a "record-only" Chrome window.
#
# Why a separate profile instead of your everyday Chrome:
#   1. Your running Chrome has no remote debugging port, so it cannot be driven.
#   2. More importantly - automated clicks would happen on your REAL logged-in
#      account. One mis-tap (e.g. hitting "Post") publishes for real and cannot
#      be undone. A separate profile isolates that risk completely.
#
# The extension is loaded into this window, so the AI panel really works.
# You only need to log in to X once in this window; the session persists in
# this profile, so future runs need no login.
#
# NOTE: keep this file pure ASCII. PowerShell 5.1 reads .ps1 as ANSI (GBK here),
# so UTF-8 Chinese comments get mis-decoded and break parsing.

$ErrorActionPreference = "Stop"

$ProjectRoot = "C:\Users\onlyo\WorkBuddy\X-AI-replay"
$ProfileDir  = Join-Path $ProjectRoot ".wb-browser"
$Chrome      = "C:\Program Files\Google\Chrome\Application\chrome.exe"

if (-not (Test-Path $Chrome)) {
    Write-Host "Chrome not found: $Chrome" -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null

# Args:
#   --user-data-dir              dedicated profile (does not touch your daily one)
#   --load-extension             load the unpacked extension (dir with manifest.json)
#   --disable-extensions-except  enable only our extension, avoid interference
#   --remote-debugging-port      open CDP so scripts can drive this browser
#   --new-window                 open a window instead of a tab
#
# Do NOT hand-write quotes inside the array. Paths have no spaces and PowerShell
# passes each element as one argument. Writing "--flag=`"$dir`"" passes literal
# quote characters and Chrome then fails on the quoted path.
$args = @(
    "--user-data-dir=$ProfileDir",
    "--load-extension=$ProjectRoot",
    "--disable-extensions-except=$ProjectRoot",
    "--remote-debugging-port=9222",
    "--enable-logging",
    "--v=1",
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    "https://x.com/home"
)

Write-Host "Launching record-only Chrome..."
Write-Host "  profile : $ProfileDir"
Write-Host "  ext     : $ProjectRoot"
Write-Host "  cdp port: 9222"
Write-Host ""
Write-Host "After it opens, in THAT window:" -ForegroundColor Yellow
Write-Host "  1. Log in to your X account (one time only, it is remembered)"
Write-Host "  2. Keep the window open, then tell me 'ready'"
Write-Host ""

Start-Process -FilePath $Chrome -ArgumentList $args
Start-Sleep -Seconds 3

$ok = $false
$body = ""
for ($i = 0; $i -lt 10; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:9222/json/version" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $ok = $true; $body = $r.Content; break }
    } catch {
        Start-Sleep -Seconds 2
    }
}

if ($ok) {
    Write-Host "OK - CDP port 9222 is listening, browser is drivable." -ForegroundColor Green
    Write-Host $body
} else {
    Write-Host "WARN - port 9222 not listening. Chrome may have exited." -ForegroundColor Red
    Write-Host "Tip: make sure no other Chrome is already using that profile dir."
}
