# Feeds voor deprijsvergelijker.com

Twee Actions die hier draaien, los van elkaar:

| Action | Bestand | Draait | Voedt |
|---|---|---|---|
| MediaMarkt feed | `generate.mjs` | elke 6 uur | de sim-only vergelijker (worker `awin`) |
| Shop feed | `shop.mjs` | 2x per dag | de productvergelijker (worker `dpv-shop`) |

Waarom dit in GitHub Actions staat en niet in een worker:

1. Tradedoubler (MediaMarkt) blokkeert Cloudflare-IP's. Vanaf GitHub lukt het wel.
2. De brede Awin-feed is 95.000 regels. Dat parseert een worker niet binnen zijn
   CPU-limiet, en al helemaal niet bij elk bezoek.
3. Het prijslogboek. Elke losse D1-opdracht is een subverzoek, en daar is het
   prijslogboek van de zorgpremies in september stil op stukgelopen: het vond
   2313 prijzen en schreef er nul weg, twee weken lang, zonder foutmelding. Hier
   bestaat die limiet niet en kan het logboek niet stil omvallen.

## Eenmalige setup

### Secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Naam | Waarvoor |
|---|---|
| `MM_TOKEN` | het Tradedoubler-token (staat al ingesteld) |
| `AWIN_KEY` | de Awin API-sleutel — nieuw, moet je nog toevoegen |

> Draai die Awin-sleutel eerst om in je Awin-account (Toolbox → API credentials),
> want de oude heeft twee keer in een chat gestaan. Zet de nieuwe hier neer. Hij
> staat nergens in de code: `shop.mjs` leest alleen `process.env.AWIN_KEY`.

### Eerste run

Repo → **Actions** → "Shop feed" → **Run workflow**. Duurt ongeveer tien minuten,
grotendeels wachten op Tradedoubler. Daarna staat `data/shop/` gevuld.

Wat er na die run moet staan:

```
data/shop/index.json              ongeveer 21 KB, leesbaar in GitHub
data/shop/c-*.json.gz             17 categoriebestanden
data/shop/hist/*.json.gz          het prijslogboek
data/shop/zoek.json.gz            zoekindex
data/shop/deals.json.gz           alles met een van-prijs
data/shop/vergelijk.json.gz       alles dat bij meer dan een winkel ligt
```

## Wat `shop.mjs` doet

1. Haalt de brede Awin-feed op (43 feeds, 95.000 regels, 9 winkels).
2. Haalt veertien MediaMarkt-feeds op bij Tradedoubler.
3. Zet alles in zeventien eigen categorieen, op `product_type` waar die gevuld is
   (Coolblue doet dat netjes) en anders op trefwoorden uit de productnaam.
4. Koppelt producten van verschillende winkels **op EAN**, en als er geen EAN is
   op een genormaliseerde naam. Hetzelfde product staat dan met twee of drie
   prijzen naast elkaar, en dat is het hele punt van de pagina.
5. Werkt het prijslogboek bij: per product en winkel alleen een nieuwe regel als
   de prijs afwijkt van de vorige. Een product dat weken op dezelfde prijs staat
   kost dus een enkele regel.
6. Schrijft per categorie een gezipt JSON-bestand weg.

### De Tradedoubler-limiet

Tradedoubler weigert elke query voorbij rij 1000: `PF_430 Can't paginate beyond`.
Een feed met 12.641 producten gaf dus 1000 producten. Dat gold ook voor
`generate.mjs`: feed 117525 heeft 1206 sim-only aanbiedingen en daarvan kwamen er
206 nooit in de vergelijker terecht.

Opgelost door de feed in prijsbanden op te halen (`minPrice`/`maxPrice`) en elke
band die boven de 1000 uitkomt verder te splitsen. Saturn NL komt zo met 149
verzoeken volledig binnen, en sim-only staat weer op 1206 in plaats van 1000.

### Waarom gezipt

Onverpakt is de uitvoer ruim 20 MB per run. Bij twee runs per dag loopt de repo
dan vol met oude versies. Gezipt is het ongeveer 5 MB. `zlib` met een vaste stand
geeft bij gelijke invoer exact dezelfde bytes, dus een run zonder prijswijziging
levert geen commit op.

Wordt de repo over een jaar toch te groot, dan is de volgende stap een losse
`data`-branch waar de Action met `--force` naartoe pusht; oude versies worden dan
opgeruimd. Nu nog niet nodig.

## Worker-URL's

De worker `dpv-shop` leest `index.json` bij raw.githubusercontent (korte cache,
dus altijd vers) en haalt daar de commit uit. De grote bestanden vraagt hij
daarna bij jsDelivr op met die commit erin, want een URL met een commit mag
jsDelivr voor altijd cachen:

```
https://raw.githubusercontent.com/FortAssets/mm_feed/main/data/shop/index.json
https://cdn.jsdelivr.net/gh/FortAssets/mm_feed@<commit>/data/shop/c-gaming.json.gz
```

Met `@main` in plaats van een commit cachet jsDelivr twaalf uur, en dan loopt de
pagina achter op de feed. Daarom staat `GITHUB_SHA` in de workflow.

De sim-only bestanden van `generate.mjs` staan in de hoofdmap:

```
https://cdn.jsdelivr.net/gh/FortAssets/mm_feed@main/mm-simonly.json
https://cdn.jsdelivr.net/gh/FortAssets/mm_feed@main/mm-devices.json
```

## Lokaal testen

```bash
# zonder Awin te belasten, op een eerder gedownloade feed
LOKAAL_AWIN=feed.csv.gz MM_TOKEN=... node --max-old-space-size=3072 shop.mjs

# volledig
AWIN_KEY=... MM_TOKEN=... node --max-old-space-size=3072 shop.mjs
```

De uitvoer eindigt met een telling per categorie, met hoeveel producten er
afgeprijsd zijn en hoeveel er bij meer dan een winkel liggen. Staat daar overal
0 bij multi-winkel, dan is de koppeling op EAN stuk.
