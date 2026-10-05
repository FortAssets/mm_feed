# Specificaties opzoeken voor een telefoonvergelijker (deprijsvergelijker.com)

Per model schrijf je een JSON-bestand /home/claude/vg/specs/<slug>.json. Elke waarde moet uit een bron komen die je in deze sessie hebt geopend
(WebSearch/WebFetch): eerst de fabrikant (apple.com/nl, samsung.com/nl, store.google.com), anders GSMArena, Tweakers Pricewatch, Kimovil of een
grote techsite. Gebruik GEEN waarden uit je geheugen. Vind je een waarde niet in een bron, zet dan null. Twijfel tussen bronnen: neem de fabrikant,
en noteer het in "opmerking". Het gaat om de Nederlandse/Europese uitvoering.

Formaat (alle velden verplicht, null als onbekend):
{
 "slug": "iphone-17", "naam": "Apple iPhone 17", "kort": "iPhone 17", "merk": "Apple",
 "release": "september 2025",            // maand + jaar van release
 "scherm_inch": 6.3, "scherm_type": "OLED (LTPO)", "scherm_hz": 120, "helderheid_nits": 3000,
 "chip": "Apple A19", "ram_gb": 8, "opslag_gb": [256, 512],
 "camera_achter": "48 MP hoofd + 48 MP ultragroothoek", "tele_zoom": null,   // optische zoom als getal (bijv. 5) of null als er geen telelens is
 "camera_voor_mp": 18,
 "accu_mah": 3692, "laden_w": 40, "draadloos_w": 25,
 "gewicht_g": 177, "dikte_mm": 7.95, "ip": "IP68",
 "updates_jaren": null,                 // toegezegde jaren software-updates, alleen als de fabrikant het noemt
 "vouwbaar": false,
 "sterk": ["...", "..."],               // 2 of 3 korte, feitelijke pluspunten in het Nederlands, afgeleid van de specs hierboven
 "zwak": ["..."],                        // 1 of 2 feitelijke minpunten
 "bronnen": ["https://...", "https://..."],   // minstens 2 URL's die je echt hebt geopend
 "opmerking": ""
}
(De getallen in dit voorbeeld zijn alleen ter illustratie van het formaat; zoek ze zelf op.)
Geen gedachtestreepjes in teksten. Controleer aan het eind dat elk bestand geldige JSON is (python3 -m json.tool).
Rapporteer in maximaal 6 regels: per model welke velden null bleven en waar bronnen elkaar tegenspraken.
