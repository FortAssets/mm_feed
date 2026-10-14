@echo off
rem Amazon bijwerken vanaf je eigen Windows-computer. Dubbelklikken of: amazon-thuis.cmd
rem Zoekt populaire producten en verzamelkaarten op bij Amazon, leest prijzen van
rem wat al gekoppeld is en zet het resultaat terug op GitHub. Duurt ongeveer een uur.
cd /d "%~dp0"
git pull --rebase --autostash
node amazon.mjs --match=300 --populair
node amazon.mjs --match=200 --cat=kaarten
node amazon.mjs --prijzen=300
git add data/shop/amazon.json
git diff --staged --quiet && (echo niets veranderd) || (git commit -q -m "Amazon: koppelingen en prijzen" && git pull --rebase --autostash && git push && echo op GitHub gezet)
pause
