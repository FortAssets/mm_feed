# Amazon bijwerken vanaf een Windows-server
#
# Wat dit doet, elke keer dat het draait:
#   1. de repo bijwerken
#   2. de prijs en de verkoper lezen van elk product waar een ASIN bij staat
#   3. een klein aantal nieuwe producten uit de vergelijker bij Amazon opzoeken
#   4. het resultaat (data/shop/amazon.json) terugzetten in de repo
#
# De eerstvolgende build van de shop-feed neemt de prijzen mee.
#
# Eenmalig klaarzetten (PowerShell als beheerder):
#
#   winget install OpenJS.NodeJS.LTS
#   winget install Git.Git
#   cd C:\
#   git clone https://github.com/FortAssets/mm_feed.git
#   cd C:\mm_feed
#   git config user.name  "amazon-vps"
#   git config user.email "bot@users.noreply.github.com"
#
# Bij de eerste push vraagt Git om in te loggen. Gebruik een fine-grained
# token van GitHub met alleen "Contents: read and write" op deze ene repo.
# Git onthoudt hem daarna (Git Credential Manager).
#
# curl zit standaard in Windows Server 2019 en nieuwer. Het script gebruikt
# curl omdat Amazon de fetch van Node weigert.
#
# Inplannen, twee keer per dag, een uur voor de build van de shop-feed
# (die draait om 06:07 en 18:37 Nederlandse tijd):
#
#   $actie = New-ScheduledTaskAction -Execute "powershell.exe" `
#     -Argument "-NoProfile -ExecutionPolicy Bypass -File C:\mm_feed\amazon-vps.ps1"
#   $tijden = @(
#     (New-ScheduledTaskTrigger -Daily -At 05:05),
#     (New-ScheduledTaskTrigger -Daily -At 17:35)
#   )
#   Register-ScheduledTask -TaskName "Amazon prijzen" -Action $actie -Trigger $tijden `
#     -User "SYSTEM" -RunLevel Highest
#
# Let op bij SYSTEM: dat account heeft je opgeslagen GitHub-login niet. Draai
# de taak dan onder je eigen gebruiker ("Run whether user is logged on or
# not"), of zet het token in de remote-url.
#
# Wat dit niet doet: een blokkade omzeilen. Geeft Amazon drie keer achter
# elkaar geen pagina, dan stopt het script en probeert het de volgende keer
# opnieuw. Een server in een datacenter wordt sneller geweigerd dan een
# thuisverbinding; gebeurt dat steeds, draai het dan op je eigen computer.

param(
  [int]$Prijzen = 200,   # hoeveel gekoppelde producten per keer
  [int]$Match   = 25,    # hoeveel nieuwe producten opzoeken per keer
  [string]$Map  = "C:\mm_feed"
)

$ErrorActionPreference = "Stop"
Set-Location $Map
$log = Join-Path $Map "amazon-vps.log"
function Schrijf($t) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $t" | Tee-Object -FilePath $log -Append }

try {
  Schrijf "start"
  git pull --rebase --autostash 2>&1 | Out-Null

  node amazon.mjs --prijzen=$Prijzen --match=$Match 2>&1 | ForEach-Object { Schrijf $_ }

  git add data/shop/amazon.json
  git diff --staged --quiet
  if ($LASTEXITCODE -ne 0) {
    git commit -q -m "Amazon: prijzen en koppelingen $(Get-Date -Format 'yyyy-MM-ddTHH:mm')"
    git pull --rebase --autostash 2>&1 | Out-Null
    git push 2>&1 | Out-Null
    Schrijf "gepusht"
  } else {
    Schrijf "niets veranderd"
  }
} catch {
  Schrijf "FOUT: $($_.Exception.Message)"
  exit 1
}
