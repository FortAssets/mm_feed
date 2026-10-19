// Duurste losse Pokémonkaarten per set, met de Cardmarket-prijs uit TCGdex (19 okt 2026).
// Eén keer per dag (pokemon-kaarten.yml). Schrijft data/tcg/kaarten.json; die gaat naar de branch tcg-data
// en wordt op de Pokémonpagina van deprijsvergelijker (en later BoosterScout) in de browser opgehaald.
// TCGdex is gratis en open source, zonder sleutel; we vragen rustig op (zes tegelijk) en alleen de nieuwste sets.
import fs from 'node:fs';
const API = 'https://api.tcgdex.net/v2/en';
const AANTAL_SETS = 10;         // nieuwste hoofdsets met prijzen
const PER_SET = 12;             // duurste kaarten per set
const TOP = 24;                 // duurste kaarten over alle sets
const MIN_PRIJS = 5;            // onder €5 laten we weg
const UIT = 'data/tcg/kaarten.json';
const wacht = ms => new Promise(r => setTimeout(r, ms));
async function haal(pad, poging = 0) {
  try {
    const r = await fetch(API + pad, { headers: { 'User-Agent': 'DePrijsvergelijker/1.0 (+https://www.deprijsvergelijker.com)', Accept: 'application/json' } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) {
    if (poging < 3) { await wacht(1500 * (poging + 1)); return haal(pad, poging + 1); }
    console.log('mislukt', pad, e.message); return null;
  }
}
async function inStukken(lijst, n, f) {
  const uit = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < lijst.length) { const j = i++; uit[j] = await f(lijst[j]); } }));
  return uit;
}
// Sets: alleen hoofdsets met een releasedatum, nieuwste eerst. Promo's, Pocket en "Classic Collection" overslaan.
const alle = await haal('/sets') || [];
const kandidaten = alle.slice(-40).reverse();
const details = (await inStukken(kandidaten, 6, s => haal('/sets/' + encodeURIComponent(s.id)))).filter(Boolean);
const vandaag = new Date().toISOString().slice(0, 10);
const sets = details
  .filter(s => s.releaseDate && s.releaseDate <= vandaag && (s.cardCount?.official || 0) >= 60 && !/promo|pocket|classic|mcdonald|trainer kit/i.test(s.name + ' ' + (s.serie?.name || '')))
  .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
  .slice(0, AANTAL_SETS + 4);
console.log('sets', sets.map(s => s.id + ' ' + s.name + ' ' + s.releaseDate).join(' | '));
const uit = { bijgewerkt: new Date().toISOString(), bron: 'TCGdex, prijzen van Cardmarket in euro', sets: [], top: [] };
for (const s of sets) {
  if (uit.sets.length >= AANTAL_SETS) break;
  const kaarten = (await inStukken(s.cards || [], 6, c => haal('/cards/' + encodeURIComponent(c.id)))).filter(Boolean);
  const met = kaarten.map(c => {
    const cm = c.pricing?.cardmarket || {};
    const trend = cm.trend || cm['trend-holo'] || cm.avg || 0;
    return { id: c.id, naam: c.name, nr: c.localId, van: s.cardCount?.official || null, zeldzaam: c.rarity || '', img: c.image ? c.image + '/high.webp' : null,
      trend: Math.round(trend * 100) / 100, laag: cm.low || null, gem7: cm.avg7 || null, gem30: cm.avg30 || null, cm: cm.idProduct || null, set: s.id, setnaam: s.name };
  }).filter(c => c.trend >= MIN_PRIJS && c.img).sort((a, b) => b.trend - a.trend);
  if (!met.length) { console.log(s.id, 'nog geen prijzen, overgeslagen'); continue; }
  uit.sets.push({ id: s.id, naam: s.name, serie: s.serie?.name || '', datum: s.releaseDate, logo: s.logo ? s.logo + '.webp' : null, kaarten: s.cardCount?.official || null, top: met.slice(0, PER_SET) });
  uit.top.push(...met.slice(0, PER_SET));
  console.log(s.id, kaarten.length, 'kaarten,', met.length, 'boven €' + MIN_PRIJS, met[0] ? met[0].naam + ' €' + met[0].trend : '');
}
uit.top = uit.top.sort((a, b) => b.trend - a.trend).slice(0, TOP);
if (!uit.sets.length || !uit.top.length) { console.log('niets gevonden, vorige versie blijft staan'); process.exit(0); }
fs.mkdirSync('data/tcg', { recursive: true });
fs.writeFileSync(UIT, JSON.stringify(uit));
console.log('geschreven', UIT, (fs.statSync(UIT).size / 1024).toFixed(0) + ' kB');
