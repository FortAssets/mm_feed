// Kaartzoeker voor BoosterScout (20 okt 2026): alle Pokémon-sets en -kaarten met Cardmarket-prijzen.
//
// Bronnen:
// - TCGdex (gratis, MIT, geen sleutel): sets, kaarten, zeldzaamheid, afbeelding, het Cardmarket-product (idProduct)
//   en de kaartnamen in het Frans, Duits, Italiaans, Spaans en Portugees.
// - De openbare prijsgids van Cardmarket (één bestand met alle Pokémon-producten, dagelijks vernieuwd):
//   trend, laagste, gemiddelde 1, 7 en 30 dagen, ook voor holo. Lukt die niet, dan de prijzen van TCGdex.
//
// We vragen TCGdex rustig en alleen wat we nog niet hebben: kaartdetails komen in een cache (cache.json op de
// branch tcg-data) en worden alleen opnieuw opgehaald voor sets van de laatste 120 dagen of na 30 dagen.
// Schrijft data/kz/kaarten.json (voor de worker van BoosterScout) en data/kz/cache.json.
import fs from 'node:fs'

const API = 'https://api.tcgdex.net/v2'
const GIDS = 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json'
const TALEN = ['fr', 'de', 'it', 'es', 'pt']
const UA = { 'User-Agent': 'BoosterScout/1.0 (+https://boosterscout.com; kaartzoeker)', Accept: 'application/json' }
const MAP = 'data/kz'
const CACHE = MAP + '/cache.json'
const MAX_MIN = Number(process.env.KZ_MAX_MIN || 240)   // stop netjes na zoveel minuten (de workflow mag 300)
const start = Date.now()
const tijdOp = () => (Date.now() - start) / 60000 > MAX_MIN
const wacht = ms => new Promise(r => setTimeout(r, ms))

async function haal (u, poging = 0) {
  try {
    const r = await fetch(u, { headers: UA })
    if (r.status === 404) return null
    if (r.status === 429) { await wacht(5000 * (poging + 1)); if (poging < 5) return haal(u, poging + 1); return null }
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return await r.json()
  } catch (e) {
    if (poging < 3) { await wacht(1500 * (poging + 1)); return haal(u, poging + 1) }
    console.log('mislukt', u, e.message); return null
  }
}
async function inStukken (lijst, n, f) {
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < lijst.length && !tijdOp()) { const j = i++; await f(lijst[j], j) } }))
}

fs.mkdirSync(MAP, { recursive: true })
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : { sets: {}, kaarten: {}, namen: {} }
cache.sets ||= {}; cache.kaarten ||= {}; cache.namen ||= {}
const vandaag = new Date().toISOString().slice(0, 10)
const recent = d => d && (Date.now() - Date.parse(d)) < 120 * 864e5

// 1. Sets
const lijst = await haal(API + '/en/sets') || []
console.log('sets bij TCGdex:', lijst.length)
const teHalen = lijst.filter(s => { const c = cache.sets[s.id]; return !c || recent(c.datum) || !c.gehaald || (Date.now() - Date.parse(c.gehaald)) > 30 * 864e5 })
await inStukken(teHalen, 6, async s => {
  const d = await haal(API + '/en/sets/' + encodeURIComponent(s.id)); if (!d) return
  cache.sets[s.id] = { id: d.id, naam: d.name, serie: d.serie?.name || '', serieId: d.serie?.id || '', datum: d.releaseDate || '', logo: d.logo || '', symbool: d.symbol || '', officieel: d.cardCount?.official || null, totaal: d.cardCount?.total || null, kaarten: (d.cards || []).map(c => [c.id, c.localId, c.name, c.image || '']), gehaald: new Date().toISOString() }
})
console.log('sets opgehaald:', teHalen.length, 'in cache:', Object.keys(cache.sets).length)

// 2. Kaartdetails (zeldzaamheid, Cardmarket-product, prijzen van TCGdex als reserve)
const alleKaarten = Object.values(cache.sets).flatMap(s => s.kaarten.map(k => ({ id: k[0], set: s.id, datum: s.datum })))
const nodig = alleKaarten.filter(k => { const c = cache.kaarten[k.id]; return !c || c.dex === undefined || (recent(k.datum) && c.g !== vandaag) || (Date.now() - Date.parse(c.g || 0)) > 30 * 864e5 })
console.log('kaarten totaal:', alleKaarten.length, 'details nodig:', nodig.length)
let n = 0
await inStukken(nodig, 8, async k => {
  const d = await haal(API + '/en/cards/' + encodeURIComponent(k.id)); if (!d) return
  const cm = d.pricing?.cardmarket || {}
  cache.kaarten[k.id] = { dex: (d.dexId || [])[0] || 0, r: d.rarity || '', cm: cm.idProduct || null, cat: d.category || '', p: cm.trend != null || cm['trend-holo'] != null ? [cm.trend ?? null, cm.low ?? null, cm.avg1 ?? null, cm.avg7 ?? null, cm.avg30 ?? null, cm['trend-holo'] ?? null] : null, usd: d.pricing?.tcgplayer ? (d.pricing.tcgplayer.holofoil?.marketPrice ?? d.pricing.tcgplayer.normal?.marketPrice ?? d.pricing.tcgplayer['reverse-holofoil']?.marketPrice ?? null) : null, g: vandaag }
  if (++n % 1000 === 0) { console.log('details', n, Math.round((Date.now() - start) / 60000) + ' min'); fs.writeFileSync(CACHE, JSON.stringify(cache)) }
})
console.log('details opgehaald:', n)

// 3. Namen in andere talen (per set, één verzoek per taal)
for (const t of TALEN) {
  cache.namen[t] ||= {}
  const tl = await haal(API + '/' + t + '/sets') || []
  const ids = new Set(tl.map(s => s.id))
  const sets = Object.values(cache.sets).filter(s => ids.has(s.id) && (!cache.namen[t]['_' + s.id] || recent(s.datum)))
  await inStukken(sets, 6, async s => {
    const d = await haal(API + '/' + t + '/sets/' + encodeURIComponent(s.id)); if (!d) return
    for (const c of d.cards || []) if (c.name) cache.namen[t][c.id] = c.name
    cache.namen[t]['_' + s.id] = d.name || 1
  })
  console.log('namen', t, sets.length, 'sets')
}
fs.writeFileSync(CACHE, JSON.stringify(cache))

// 3b. Japanse en Koreaanse sets (20 okt). Eigen id's (jp-m2a, kr-sv4k) zodat ze niet botsen met de Engelse.
// Namen: de Pokémon via het Pokédex-nummer naar het Engels (Ludicolo in plaats van ルンパッパ), met ex/V/GX erachter;
// trainers en energie houden hun eigen naam. Setnamen in het Engels uit onze catalogus, anders de eigen naam.
const dexNaam = new Map()
for (const s2 of Object.values(cache.sets)) for (const [id, , naam] of s2.kaarten) { const c = cache.kaarten[id]; if (c?.dex && !dexNaam.has(c.dex) && !/\b(ex|EX|GX|V|VMAX|VSTAR|BREAK|LV\.X|Prism|δ)\b|'s /.test(naam)) dexNaam.set(c.dex, naam) }
const JPNAMEN = fs.existsSync('data/jp-setnamen.json') ? JSON.parse(fs.readFileSync('data/jp-setnamen.json', 'utf8')) : {}
const SERIE = { M: 'Mega Evolution', SV: 'Scarlet & Violet', S: 'Sword & Shield', SM: 'Sun & Moon', XY: 'XY', BW: 'Black & White' }
cache.azie ||= { sets: {}, kaarten: {} }
for (const [t, pre, label] of [['ja', 'jp', 'Japan'], ['ko', 'kr', 'Korea']]) {
  if (tijdOp()) break
  const tl = await haal(API + '/' + t + '/sets') || []
  const nieuw = tl.filter(s2 => { const c = cache.azie.sets[pre + ':' + s2.id]; return !c || recent(c.datum) || (Date.now() - Date.parse(c.gehaald || 0)) > 30 * 864e5 })
  await inStukken(nieuw, 6, async s2 => {
    const d = await haal(API + '/' + t + '/sets/' + encodeURIComponent(s2.id)); if (!d) return
    cache.azie.sets[pre + ':' + s2.id] = { id: (pre + '-' + s2.id).toLowerCase(), code: s2.id, taal: t, label, eigen: d.name, naam: JPNAMEN[String(s2.id).toUpperCase()] || null, serie: d.serie?.id || '', datum: d.releaseDate || '', officieel: d.cardCount?.official || null, totaal: d.cardCount?.total || null, kaarten: (d.cards || []).map(c => [c.id, c.localId, c.name, c.image || '']), gehaald: new Date().toISOString() }
  })
  const kn = Object.values(cache.azie.sets).filter(s2 => s2.taal === t).flatMap(s2 => s2.kaarten.map(k => ({ id: k[0], datum: s2.datum })))
  const kNodig = kn.filter(k => { const c = cache.azie.kaarten[t + ':' + k.id]; return !c || (recent(k.datum) && c.g !== vandaag) || (Date.now() - Date.parse(c.g || 0)) > 30 * 864e5 })
  console.log(label, 'sets', tl.length, 'kaarten', kn.length, 'details nodig', kNodig.length)
  await inStukken(kNodig, 8, async k => {
    const d = await haal(API + '/' + t + '/cards/' + encodeURIComponent(k.id)); if (!d) return
    const cm = d.pricing?.cardmarket || {}
    cache.azie.kaarten[t + ':' + k.id] = { dex: (d.dexId || [])[0] || 0, r: d.rarity || '', cm: cm.idProduct || null, p: cm.trend != null ? [cm.trend ?? null, cm.low ?? null, cm.avg1 ?? null, cm.avg7 ?? null, cm.avg30 ?? null, cm['trend-holo'] ?? null] : null, g: vandaag }
  })
  fs.writeFileSync(CACHE, JSON.stringify(cache))
}
const engelsVan = (naam, dex) => {
  const en = dex && dexNaam.get(dex); if (!en) return naam
  const suf = (String(naam).match(/\b(ex|EX|GX|VMAX|VSTAR|V|BREAK)\b\s*$/) || [])[1]
  const mega = /^(メガ|MEGA|メガシンカ|M)\s?/i.test(naam) || /メガ/.test(naam)
  return (mega ? 'Mega ' : '') + en + (suf ? ' ' + suf : '')
}

// 4. Prijzen: de prijsgids van Cardmarket
let gids = null
try {
  const r = await fetch(GIDS, { headers: UA })
  if (r.ok) { const j = await r.json(); gids = new Map((j.priceGuides || []).map(p => [p.idProduct, p])); console.log('prijsgids', gids.size, 'producten', j.createdAt || '') }
  else console.log('prijsgids HTTP', r.status)
} catch (e) { console.log('prijsgids mislukt', e.message) }
const r2 = v => v == null || !(v > 0) ? null : Math.round(v * 100) / 100

// 5. Uitvoer: compact, één rij per kaart
const uitSets = Object.values(cache.sets).filter(s => s.kaarten.length).sort((a, b) => (b.datum || '').localeCompare(a.datum || ''))
  .map(s => [s.id, s.naam, s.serie, s.datum, s.logo, s.symbool, s.officieel, s.totaal, Object.fromEntries(TALEN.map(t => [t, typeof cache.namen[t]?.['_' + s.id] === 'string' ? cache.namen[t]['_' + s.id] : null]).filter(x => x[1]))])
let metPrijs = 0
for (const s2 of Object.values(cache.azie?.sets || {})) {
  if (!s2.kaarten.length) continue
  s2.naam = JPNAMEN[String(s2.code).toUpperCase()] || s2.naam
  const naam = s2.naam ? s2.naam + ' (' + s2.label + ')' : s2.label + ' ' + s2.code + ' · ' + s2.eigen
  uitSets.push([s2.id, naam, s2.label + ' · ' + (SERIE[String(s2.serie).replace(/[^A-Z]/gi, '').toUpperCase()] || s2.serie || 'Pokémon'), s2.datum, '', '', s2.officieel, s2.totaal, { [s2.taal]: s2.eigen }])
}
uitSets.sort((a, b) => (b[3] || '').localeCompare(a[3] || ''))
// Sommige kaarten wijzen bij TCGdex naar hetzelfde Cardmarket-product (vaak promo's): dan klopt de prijs
// niet voor allemaal. Die prijzen laten we weg, net als een hoge trend zonder enige aanbieding op dit moment.
const telCm = new Map(); for (const s2 of Object.values(cache.sets)) for (const [id] of s2.kaarten) { const cm = cache.kaarten[id]?.cm; if (cm) telCm.set(cm, (telCm.get(cm) || 0) + 1) }
let weg = 0
const uitKaarten = []
for (const s of Object.values(cache.sets)) {
  for (const [id, nr, naam, img] of s.kaarten) {
    const c = cache.kaarten[id] || {}
    const g = c.cm && gids ? gids.get(c.cm) : null
    // [trend, laag, gem1, gem7, gem30, trendHolo]
    const p = g ? [g.trend, g.low, g.avg1, g.avg7, g.avg30, g['trend-holo']].map(r2) : (c.p || []).map(r2)
    if (c.cm && telCm.get(c.cm) > 1) { p.fill(null); weg++ }
    else if (p[0] > 300 && p[1] == null) { p.fill(null); weg++ }
    if (p.some(x => x != null)) metPrijs++
    const namen = Object.fromEntries(TALEN.map(t => [t, cache.namen[t]?.[id]]).filter(x => x[1] && x[1] !== naam))
    uitKaarten.push([id, s.id, nr, naam, c.r || '', img, c.cm || null, ...(p.length ? p : [null, null, null, null, null, null]), r2(c.usd), Object.keys(namen).length ? namen : 0])
  }
}
for (const s2 of Object.values(cache.azie?.sets || {})) {
  for (const [id, nr, naam, img] of s2.kaarten) {
    const c = cache.azie.kaarten[s2.taal + ':' + id] || {}
    const g = c.cm && gids ? gids.get(c.cm) : null
    let p = g ? [g.trend, g.low, g.avg1, g.avg7, g.avg30, g['trend-holo']].map(r2) : (c.p || []).map(r2)
    if (!p.length) p = [null, null, null, null, null, null]
    if (c.cm && telCm.get(c.cm) > 1) p.fill(null)
    if (p.some(x => x != null)) metPrijs++
    uitKaarten.push([(s2.id + '-' + nr).toLowerCase(), s2.id, nr, engelsVan(naam, c.dex), c.r || '', img, c.cm || null, ...p, null, { [s2.taal]: naam }])
  }
}
const uit = { bijgewerkt: new Date().toISOString(), bron: gids ? 'cardmarket-prijsgids' : 'tcgdex', velden: ['id', 'set', 'nr', 'naam', 'zeldzaam', 'img', 'cm', 'trend', 'laag', 'gem1', 'gem7', 'gem30', 'trendHolo', 'usd', 'namen'], sets: uitSets, kaarten: uitKaarten }
fs.writeFileSync(MAP + '/kaarten.json', JSON.stringify(uit))
console.log('prijs weggelaten (onbetrouwbaar):', weg)
console.log('klaar:', uitSets.length, 'sets,', uitKaarten.length, 'kaarten,', metPrijs, 'met prijs,', (fs.statSync(MAP + '/kaarten.json').size / 1048576).toFixed(1) + ' MB,', Math.round((Date.now() - start) / 60000) + ' min', tijdOp() ? '(tijd op, volgende keer verder)' : '')
