// Graded prijzen voor de kaartzoeker van BoosterScout (20 okt 2026): eigen meting op eBay.
//
// Voor de duurste kaarten zoeken we elke dag gegradeerde aanbiedingen (PSA, BGS/Beckett, CGC, SGC, ACE, TAG)
// op eBay.com en eBay.de, alleen 'Nu kopen', en lezen grader en cijfer uit de titel. Per kaart en cijfer:
// - vraag: de mediaan van de vraagprijzen van nu;
// - verkocht: een schatting. Een aanbieding die we eerder zagen en die verdwijnt, is meestal verkocht.
//   De mediaan daarvan over 60 dagen noemen we 'geschatte verkoopprijs'.
// Dollars rekenen we om met de koers van de ECB van vandaag. Alleen de Browse API met een applicatietoken.
import fs from 'node:fs'
import { ebayKlaar, ebayZoek, Limiet } from './ebay-api.mjs'

const MAP = 'data/kz'
const CACHE = MAP + '/graded-cache.json'
const AANTAL = Number(process.env.GRADED_AANTAL || 300)
const MARKTEN = [['EBAY_US', 'USD'], ['EBAY_DE', 'EUR']]
if (!ebayKlaar()) { console.log('geen eBay-sleutels, overgeslagen'); process.exit(0) }
const kz = JSON.parse(fs.readFileSync(MAP + '/kaarten.json', 'utf8'))
const ix = Object.fromEntries(kz.velden.map((v, i) => [v, i]))
const setVan = new Map(kz.sets.map(s => [s[0], s]))
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : { items: {}, verkocht: {} }
cache.items ||= {}; cache.verkocht ||= {}
const vandaag = new Date().toISOString().slice(0, 10)

// Koers USD -> EUR (ECB). Lukt dat niet: 0,92.
let usdEur = 0.92
try {
  const x = await (await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml')).text()
  const m = x.match(/currency='USD' rate='([\d.]+)'/); if (m) usdEur = 1 / Number(m[1])
} catch (e) {}
console.log('koers 1 USD =', usdEur.toFixed(4), 'EUR')

const GRADER = /\b(PSA|BGS|BECKETT|CGC|SGC|ACE|TAG)\b[\s-]*(?:GEM[\s-]*MINT|GEM MT|MINT|PRISTINE|NM[\s-]*MT|PERFECT)?[\s-]*(10|9\.5|9|8\.5|8|7)\b/i
const WEG = /\b(lot|bundle|proxy|custom|reprint|fake|orica|digital|ungraded|not graded|raw|ready to grade|choose|pick|you pick|multiple|set of|sealed|booster|empty|case only|slab only|label only|sticker|playmat|sleeve|binder|metal)\b/i
const kaarten = kz.kaarten.filter(k => (k[ix.trend] || 0) >= 15).sort((a, b) => b[ix.trend] - a[ix.trend]).slice(0, AANTAL)
console.log('kaarten om te meten:', kaarten.length)

const med = a => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null }
const r2 = v => Math.round(v * 100) / 100
const uit = {}
let calls = 0, gestopt = false
for (const k of kaarten) {
  if (gestopt) break
  const id = k[ix.id], s = setVan.get(k[ix.set]) || []
  const nr = String(k[ix.nr]).replace(/^0+/, ''), van = s[6]
  const nu = {}   // grade -> [[prijsEUR, itemId]]
  for (const [markt, munt] of MARKTEN) {
    let d
    try {
      d = await ebayZoek({ q: `${k[ix.naam]} ${nr}${van ? '/' + van : ''} (psa,bgs,beckett,cgc,sgc,ace,tag)`, category_ids: '183454', filter: 'buyingOptions:{FIXED_PRICE}', limit: '100' }, markt)
      calls++
    } catch (e) { if (e instanceof Limiet) { console.log(e.message); gestopt = true; break } console.log('fout', id, markt, e.message); continue }
    for (const i of d.itemSummaries || []) {
      const t = String(i.title || '')
      if (WEG.test(t)) continue
      // Het kaartnummer moet erin staan (161 of 161/131), anders is het waarschijnlijk een andere kaart.
      if (!new RegExp('(^|\\D)0*' + nr + '(\\D|$)').test(t)) continue
      // Nummer met het setaantal (149/147) of de setnaam moet erin staan; alleen het nummer is te los.
      const setWoord = String(s[1] || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3)
      const metVan = van && new RegExp('(^|\\D)0*' + nr + '\\s*/\\s*0*' + van + '(\\D|$)').test(t)
      if (!metVan && !(setWoord.length && setWoord.every(w => t.toLowerCase().includes(w)))) continue
      if (!t.toLowerCase().includes(String(k[ix.naam]).toLowerCase().split(' ')[0])) continue
      const m = t.match(GRADER); if (!m) continue
      const g = (m[1].toUpperCase() === 'BECKETT' ? 'BGS' : m[1].toUpperCase()) + ' ' + m[2]
      if (!i.price || !(Number(i.price.value) > 0)) continue
      const eur = i.price.currency === 'EUR' ? Number(i.price.value) : i.price.currency === 'USD' ? Number(i.price.value) * usdEur : null
      if (!eur) continue
      ;(nu[g] ||= []).push([r2(eur), String(i.itemId)])
    }
  }
  // Verdwenen aanbiedingen sinds de vorige meting: waarschijnlijk verkocht.
  const oud = cache.items[id] || {}, nieuw = {}
  for (const [g, lijst] of Object.entries(nu)) for (const [p, iid] of lijst) nieuw[iid] = [g, p, (oud[iid] && oud[iid][2]) || vandaag]
  for (const [iid, [g, p, sinds]] of Object.entries(oud)) {
    if (nieuw[iid]) continue
    if (sinds === vandaag) continue
    ;((cache.verkocht[id] ||= {})[g] ||= []).push([p, vandaag])
  }
  cache.items[id] = nieuw
  // Alleen verkopen van de laatste 60 dagen bewaren.
  const grens = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)
  for (const g of Object.keys(cache.verkocht[id] || {})) cache.verkocht[id][g] = cache.verkocht[id][g].filter(x => x[1] >= grens)
  const res = {}
  for (const g of new Set([...Object.keys(nu), ...Object.keys(cache.verkocht[id] || {})])) {
    const v = (nu[g] || []).map(x => x[0]), vk = ((cache.verkocht[id] || {})[g] || []).map(x => x[0])
    if (v.length < 2 && vk.length < 2) continue
    res[g] = { vraag: v.length >= 2 ? r2(med(v)) : null, n: v.length, laag: v.length ? r2(Math.min(...v)) : null, verkocht: vk.length >= 2 ? r2(med(vk)) : null, nv: vk.length }
  }
  if (Object.keys(res).length) uit[id] = res
}
fs.writeFileSync(CACHE, JSON.stringify(cache))
fs.writeFileSync(MAP + '/graded.json', JSON.stringify({ bijgewerkt: new Date().toISOString(), koers: usdEur, bron: 'eigen meting eBay (Nu kopen, eBay.com en eBay.de)', kaarten: uit }))
console.log('klaar:', Object.keys(uit).length, 'kaarten met graded prijzen,', calls, 'zoekopdrachten')
