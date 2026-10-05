# Vergelijkingsteksten schrijven (deprijsvergelijker.com, Nederlands)

Je schrijft per combinatie van twee telefoons een JSON-bestand /home/claude/vg/tekst/<handle>.json. De pagina zelf wordt door een script opgebouwd:
productkaarten met live prijzen en winkelknoppen, en de specificatietabel komen automatisch. Jij schrijft ALLEEN de tekstlaag. Die moet per
combinatie echt anders zijn (dit is waar de pagina op gevonden wordt), dus geen zinnen die je bij een andere combinatie kunt hergebruiken.

Bron voor alle feiten: /home/claude/vg/telefoons.json (specs per model, plus "prijs" = laagste prijs van vandaag, "winkels", "variant_gb" = de
uitvoering waar de prijs bij hoort, "sterk", "zwak", "opmerking", "release"). Gebruik UITSLUITEND feiten uit dat bestand. Geen testresultaten,
geen meningen over fotokwaliteit of snelheid die niet uit een spec volgen, geen andere prijzen. Is een waarde null, noem die spec dan niet.
Let op de opmerkingen (bijv. accu van EU-uitvoering, helderheid niet 1-op-1 vergelijkbaar).

Prijzen noem je NOOIT als vast getal. Gebruik deze tokens, het script vult ze live in:
 {{prijs_a}}  {{prijs_b}}  = laagste prijs van model a / b      {{verschil}} = het prijsverschil in euro's (positief getal)
 {{winkel_a}} {{winkel_b}} = winkel met de laagste prijs
Zeg alleen "goedkoper" als het verschil vandaag meer dan 10% is; anders "kosten ongeveer hetzelfde". Noem bij de prijs de uitvoering
(bijv. "256 GB, los toestel"). Vergelijk je twee verschillende opslaggroottes (variant_gb verschilt), zeg dat er dan eerlijk bij.

Formaat:
{
 "handle": "<a>-vs-<b>", "a": "<slug a>", "b": "<slug b>",
 "title": "…",              // max 65 tekens, bevat beide modelnamen (kort) en een zoekwoord: vergelijken / verschillen / of
 "seo_title": "…",          // max 60 tekens
 "seo_description": "…",    // max 155 tekens, geen prijzen
 "summary": "…",            // 1 of 2 zinnen, geen tokens, geen vaste prijzen
 "lead": "…",               // HTML, 2 of 3 zinnen. Eerste zin tussen <strong></strong> met het antwoord en {{verschil}} of de tokens. 
 "secties": [ {"kop": "…", "tekst": "<p>…</p>"} ],   // 5 secties: scherm, camera, accu en laden, prestaties en opslag, formaat en gewicht.
                                                     // kop bevat het onderwerp en liefst een modelnaam; tekst 60 tot 100 woorden, mag <strong> gebruiken.
 "kies_a": ["…","…","…"],   // 3 korte redenen (max 14 woorden elk) om model a te kiezen, feitelijk
 "kies_b": ["…","…","…"],
 "wachten": "<p>…</p>",     // 50 tot 80 woorden: nu kopen of wachten tot Black Friday (vrijdag 27 november 2026). Winkels mogen als van-prijs alleen
                            // de laagste prijs van de afgelopen 30 dagen tonen; wij meten elke nacht, dus op de dag zelf zie je of de korting echt is.
                            // Betrek de leeftijd van de modellen (release) erbij.
 "faq": [ {"v": "…", "a": "…"} ]   // 4 vragen zoals mensen ze zoeken ("Wat is het verschil tussen …", "Is de … het meerwaard?", "Welke heeft de beste accu?"),
                                   // antwoord 25 tot 45 woorden, feitelijk, tokens toegestaan.
}
Stijl: je-vorm, nuchter, concreet, korte zinnen. GEEN gedachtestreepjes (— of –). Getallen Nederlands (6,3 inch; 4.300 mAh). Schrijf "telelens met 5x zoom"
alleen als tele_zoom gevuld is. Noem modellen bij hun korte naam ("kort").

Controleer aan het eind met een script: geldige JSON, lengtes binnen de limieten, geen — of –, geen bedrag met €-teken buiten de tokens,
5 secties, 3+3 redenen, 4 vragen. Rapporteer in maximaal 5 regels.
