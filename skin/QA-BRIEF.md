# Nalopen van de nieuwe huisstijl "2-rond" op deprijsvergelijker.com

De hele site krijgt een nieuwe huisstijl. Lees eerst `/home/claude/rebrand/STIJLGIDS.md` (bindend) en bekijk
`/home/claude/rebrand/2rond-H2-mobiel.png` en `/home/claude/rebrand/2rond-H2-desktop.png` (het gekozen ontwerp van de homepage).

## Hoe de nieuwe stijl op de site komt
- De site is een Shopify-thema met ruim honderd secties die elk hun eigen opmaak meebrengen.
- Vier onderdelen zijn opnieuw gebouwd in de nieuwe stijl: de kiezer (`.dhk`), de tegels (`.dhr`), de productrijen (`.dsr`,
  knop `.dpvbf`) en "zo werkt het" (`.dwa`). Daar blijf je af; meld alleen wat je ziet.
- Voor al het andere ligt er een laag overheen: `assets/dpv-skin.css`. Die is automatisch gemaakt: per bestaande regel is de
  kleur omgezet (oud groen en oud blauw worden blauw `#2456D6`, paars wordt blauw of donkerblauw, lichte tinten worden
  blauwe tinten) en de letter wordt Montserrat. Een script kleurt elke gekleurde knop waarvan de link naar een aanbieder of
  winkel gaat geel (`a.dpv-geel`). Een paar donkere blokken zijn automatisch licht gemaakt.
- Die automatische laag maakt fouten. Jouw werk: ze vinden en herstellen met extra CSS.

## Wat je hebt
- Thema met de nieuwe stijl (ongepubliceerd): voorvertoning via `?preview_theme_id=190348853576&_fd=0&pb=0` achter elke URL van
  `https://www.deprijsvergelijker.com`.
- Schermafbeeldingen van elke pagina op mobiel (390 breed), oud en nieuw: `/home/claude/skin/voor/shots/<naam>.jpg` en
  `/home/claude/skin/na2/shots/<naam>.jpg`. De naam is het pad met onderstrepingstekens, bijvoorbeeld `pages_sim_only`,
  `blogs_advies_<handle met _>`; de homepage heet `home`.
- `cd /home/claude/skin && python3 naast.py na2 <naam>` zet oud (links) en nieuw (rechts) naast elkaar in stukken van 2400
  pixels en drukt de bestandsnamen af. Bekijk die met de Read-tool.
- Playwright (Node): `require('/home/claude/.npm-global/lib/node_modules/playwright')`, `chromium.launch()`.

## Belangrijk bij het laden van de live site
De site toont bij te veel verzoeken een controlepagina ("Just a moment..."). Omzeil die niet. Laad dus zo weinig mogelijk
live: gebruik eerst de bestaande schermafbeeldingen. Moet je live kijken (om een selector te vinden of een herstel te testen),
laad dan één pagina tegelijk, wacht minstens 4 seconden tussen pagina's, en hergebruik een geopende pagina voor meerdere
metingen. Krijg je de controlepagina, wacht dan 90 seconden.

## Waar je op let
1. Leesbaarheid: tekst die wegvalt (wit of licht op een lichte achtergrond, donker op donker, blauw op blauw).
2. Oude stijl die is blijven staan: fel groen (`#10b981`, `#059669`), paars, de oude donkere vlakken als bovenkant of blok.
   Donker (`#0D1B2A`) mag alleen voor de voet, de Black Friday-band, de balk "iPhone Duo" bovenaan en kleine labels.
   Het groen `#3FAE7A` uit het logo mag voor vinkjes en kleine labels, en voor de balk "iPhone 18 Pro" bovenaan.
3. Geel: een knop die naar een aanbieder of winkel gaat hoort geel te zijn met donkere tekst; een interne knop (zoeken,
   aanmelden, filter, naar een andere pagina van de site) hoort blauw te zijn met witte tekst. Meld of herstel wat andersom is.
   Let op: knoppen die met `<button>` en JavaScript naar een aanbieder gaan pakt het script niet; als je er zo een vindt, geef
   hem in je CSS de gele stijl (achtergrond `#F9C31F`, tekst `#0D1B2A`).
4. Vorm: de nieuwe letter is breder. Zoek afgebroken of overlopende teksten, knoppen waar de tekst niet meer in past,
   horizontaal scrollen, kaarten die uit elkaar vallen.
5. Merkkleuren van aanbieders en supermarkten die onbedoeld zijn omgekleurd (bijvoorbeeld een groen KPN-vlakje dat blauw is
   geworden): terugzetten.
6. Bovenkanten van pagina's horen licht te zijn: het verloop `linear-gradient(180deg,#E3ECFF 0%,#F4F7FF 100%)` met donkere tekst.
7. Kaarten rond (16px), knoppen 12px, labels en keuzeknoppen als pil. Dit hoef je niet overal af te dwingen; herstel wat
   opvallend hoekig of rommelig is.

## Hoe je herstelt
- Schrijf je CSS in je EIGEN bestand `/home/claude/skin/fix/<jouw groepsnaam>.css` (alleen dat bestand; verander verder niets,
  ook niet in het thema of in git).
- Elke regel begint met `html:not(#x) ` voor de selector en elke eigenschap krijgt `!important`, anders wint de oude opmaak.
  Voorbeeld: `html:not(#x) .zk-kop{color:#0D1B2A !important}`
- Gebruik de kleuren uit de stijlgids. Zet boven elk groepje regels een korte Nederlandse opmerking: welke pagina, wat er mis was.
- Vind de juiste selector door de pagina live te openen en met `page.evaluate` het element op te zoeken (klassenaam, berekende
  kleur en achtergrond). Schrijf selectors zo algemeen als verantwoord (op de klasse van de sectie), zodat hetzelfde blok op
  andere pagina's ook goed komt.
- Test je herstel: laad de pagina, voeg je bestand toe met `page.addStyleTag({ path: '/home/claude/skin/fix/<groep>.css' })`,
  maak een schermafbeelding en bekijk die. Het gele doorklikscript draait op de pagina zelf al.
- Problemen die je niet met CSS kunt oplossen (inhoud, afbeeldingen, een ingebedde pagina van een andere server): niet
  forceren, wel melden.

## Oplevering (Nederlands, zonder gedachtestreepjes, beknopt)
- Tabel: pagina of onderdeel, wat er mis was, hersteld ja/nee.
- Wat je niet kon oplossen en waarom.
- Welke pagina's je echt hebt bekeken (schermafbeelding gezien) en welke niet.
- Het pad van je CSS-bestand en hoeveel regels erin staan.
