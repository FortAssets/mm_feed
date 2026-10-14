#!/bin/sh
# Amazon bijwerken vanaf je eigen computer (Mac of Linux).
# Amazon weigert servers in een datacenter; een thuisverbinding gaat meestal goed.
#
#   sh amazon-thuis.sh
#
# Wat het doet: de repo bijwerken, populaire producten (Apple, Samsung, Sony,
# PlayStation, Nintendo en meer) en verzamelkaarten bij Amazon opzoeken, de
# prijs en verkoper lezen van wat al gekoppeld is, en het resultaat
# terugzetten op GitHub. Duurt ongeveer een uur. Geeft Amazon geen pagina's
# meer, dan stopt het vanzelf; draai het later gewoon nog een keer.
set -e
cd "$(dirname "$0")"
git pull --rebase --autostash
node amazon.mjs --match=${MATCH:-300} --populair || true
node amazon.mjs --match=${KAART:-200} --cat=kaarten || true
node amazon.mjs --prijzen=${PRIJZEN:-300} || true
git add data/shop/amazon.json
if git diff --staged --quiet; then echo "niets veranderd"; else
  git commit -q -m "Amazon: koppelingen en prijzen $(date +%Y-%m-%dT%H:%M)"
  git pull --rebase --autostash && git push && echo "op GitHub gezet"
fi
