#!/bin/bash
# Bouwt assets/dpv-skin.css in de stijl "Prijskaartjes":
#   hand-k.css   handgeschreven basis (letters, gele doorklikknop)
#   k-basis.css  skin.cjs maakt gen.css en inline.css (kleur en letter per bestaande regel, nog in de tussenstijl);
#                kaart.cjs zet die samen met na.css (de herstellingen) om naar inkt, wit en lichtgrijs
#   k-vorm.css   kaart.cjs: inktrand op kaarten en velden, geen grijze schaduwen
#   kaartjes.css handgeschreven: vormen en herstellingen die bij het nalopen nodig bleken
cd /home/claude/skin && node skin.cjs && node kaart.cjs && cat hand-k.css k-basis.css k-vorm.css kaartjes.css > ${DOEL:-/home/claude/mm_feed/theme/assets/dpv-skin.css}
[ -z "$DOEL" ] && cp skin.cjs kaart.cjs kijk.cjs hand.css hand-k.css kaartjes.css na.css crawl.cjs verzamel.py bouw.sh /home/claude/mm_feed/skin/ 2>/dev/null
wc -c ${DOEL:-/home/claude/mm_feed/theme/assets/dpv-skin.css}
