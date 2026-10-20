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
// 20 okt: elke dag de kaarten die het langst niet gemeten zijn (uit de 2000 duurste), zodat na een paar dagen
// alle kaarten van 15 euro of meer graded prijzen hebben. Uitkomsten blijven 21 dagen staan.
const AANTAL = Number(process.env.GRADED_AANTAL || 450)
const POOL = Number(process.env.GRADED_POOL || 2000)
const MARKTEN = [['EBAY_US', 'USD'], ['EBAY_DE', 'EUR']]
if (!ebayKlaar()) { console.log('geen eBay-sleutels, overgeslagen'); process.exit(0) }
const kz = JSON.parse(fs.readFileSync(MAP + '/kaarten.json', 'utf8'))
const ix = Object.fromEntries(kz.velden.map((v, i) => [v, i]))
const setVan = new Map(kz.sets.map(s => [s[0], s]))
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : { items: {}, verkocht: {} }
cache.items ||= {}; cache.verkocht ||= {}; cache.gemeten ||= {}; cache.res ||= {}
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
const pool = kz.kaarten.filter(k => (k[ix.trend] || 0) >= 15).sort((a, b) => b[ix.trend] - a[ix.trend]).slice(0, POOL)
const kaarten = pool.slice().sort((a, b) => String(cache.gemeten[a[ix.id]] || '').localeCompare(String(cache.gemeten[b[ix.id]] || '')) || b[ix.trend] - a[ix.trend]).slice(0, AANTAL)
console.log('kaarten om te meten:', kaarten.length)

const AI = process.env.ANTHROPIC_API_KEY || ''
const AI_MODEL = process.env.GRADED_MODEL || 'claude-haiku-5-5'
let aiN = 0
async function aiCheck (naam, nummer, set, kand) {
  const lijst = kand.slice(0, 80).map((x, j) => j + ': ' + x.t).join('\n')
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': AI, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: 1200,  system: 'You check eBay listing titles for a Pokémon card price tracker. Answer with JSON only.', messages: [{ role: 'user', content: `Card: ${naam}, number ${nummer}, set ${set}.\nWhich of these listing titles are a single graded copy of exactly this card (same Pokémon, same number, same set; any language is fine)? Exclude other cards, lots, bundles, reprints, proxies, custom or fake slabs, and listings where the grade in the title is unclear.\nReturn {"ok":[indices]}.\n\n${lijst}` }] }) })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const d = await r.json(); const t = (d.content || []).map(c => c.text || '').join(''); const m = t.match(/\{[\s\S]*\}/)
  if (!m) return null
  return new Set((JSON.parse(m[0]).ok || []).map(Number))
}
const med = a => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null }
// Vraagprijzen hebben uitschieters (een verkoper die 'm voor de gein op een ton zet). Weg wat ver boven de mediaan ligt,
// en de geschatte prijs is het 25e percentiel: daar wordt in de praktijk gekocht.
const schoon = a => { if (a.length < 4) return a; const m = med(a); return a.filter(x => x <= m * 2.5) }
const p25 = a => { const s = a.slice().sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * 0.25, l = Math.floor(i), h = Math.ceil(i); return s[l] + (s[h] - s[l]) * (i - l) }
const r2 = v => Math.round(v * 100) / 100
const uit = {}
let calls = 0, gestopt = false
for (const k of kaarten) {
  if (gestopt) break
  const id = k[ix.id], s = setVan.get(k[ix.set]) || []
  const nr = String(k[ix.nr]).replace(/^0+/, ''), van = s[6]
  const nu = {}   // grade -> [[prijsEUR, itemId]]
  const kand = []
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
      kand.push({ t, g, eur: r2(eur), iid: String(i.itemId) })
    }
  }
  // 20 okt: met Claude (Haiku) nakijken welke titels echt deze kaart in dit cijfer zijn (geen andere kaart,
  // geen lot, geen reprint). Zonder sleutel of bij een fout: de regels hierboven blijven gelden.
  let goed = kand
  if (AI && kand.length) {
    try { const ok = await aiCheck(k[ix.naam], nr + (van ? '/' + van : ''), s[1] || '', kand); if (ok) { goed = kand.filter((x, j) => ok.has(j)); aiN++ } } catch (e) { console.log('ai', e.message) }
  }
  for (const x of goed) (nu[x.g] ||= []).push([x.eur, x.iid])
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
    const v = schoon((nu[g] || []).map(x => x[0])), vk = schoon(((cache.verkocht[id] || {})[g] || []).map(x => x[0]))
    if (!v.length && vk.length < 2) continue
    res[g] = { vraag: v.length >= 2 ? r2(med(v)) : null, n: v.length, laag: v.length ? r2(Math.min(...v)) : null, schat: v.length >= 2 ? r2(p25(v)) : v.length ? r2(v[0]) : null, verkocht: vk.length >= 2 ? r2(med(vk)) : null, nv: vk.length }
  }
  cache.gemeten[id] = vandaag
  if (Object.keys(res).length) cache.res[id] = { d: vandaag, r: res }; else delete cache.res[id]
}
// Alles wat de afgelopen 21 dagen gemeten is, gaat mee naar de site.
const oudGrens = new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10)
for (const [id, x] of Object.entries(cache.res)) if (x.d >= oudGrens) uit[id] = x.r; else delete cache.res[id]
fs.writeFileSync(CACHE, JSON.stringify(cache))
fs.writeFileSync(MAP + '/graded.json', JSON.stringify({ bijgewerkt: new Date().toISOString(), koers: usdEur, bron: 'eigen meting eBay (Nu kopen, eBay.com en eBay.de)', kaarten: uit }))
console.log('klaar:', Object.keys(uit).length, 'kaarten met graded prijzen,', calls, 'zoekopdrachten,', aiN, 'keer nagekeken met Claude')
