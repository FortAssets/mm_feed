# MediaMarkt feed voor deprijsvergelijker.com

Tradedoubler blokkeert Cloudflare-IP's, dus de worker kan de MediaMarkt-feed niet
direct ophalen. Deze GitHub Action draait op een schoon IP, haalt de feed op,
filtert 'm tot compacte JSON en pusht die naar `data/`. De worker leest de bestanden
via jsDelivr CDN.

## Eenmalige setup
1. Maak een **nieuwe (private mag) GitHub-repo**, bijv. `mm-feed`.
2. Upload deze drie bestanden met dezelfde mappenstructuur:
   - `generate.mjs`
   - `.github/workflows/mm-feed.yml`
   - `data/` (met de eerste JSON's, of leeg — de Action vult ze)
3. Repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - Naam: `MM_TOKEN`  Waarde: `FC04F9EAC08F46AB8394D3645F6FED3536266625`
4. Repo → **Actions**-tab → kies "MediaMarkt feed" → **Run workflow** (handmatig, eerste keer).
5. Controleer dat `data/mm-simonly.json` en `data/mm-devices.json` gevuld zijn.

## Worker-URL's (jsDelivr)
Vervang `GEBRUIKER/REPO` door je eigen GitHub-gebruikersnaam en repo-naam:
```
https://cdn.jsdelivr.net/gh/GEBRUIKER/REPO@main/data/mm-simonly.json
https://cdn.jsdelivr.net/gh/GEBRUIKER/REPO@main/data/mm-devices.json
```
Geef deze twee door, dan zet ik ze in de worker.
