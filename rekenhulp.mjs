// Rekenhulp "toestel + abonnement of sim only + losse telefoon" (19 okt 2026).
// Eén keer per dag (rekenhulp.yml). Schrijft data/rekenhulp.json, een klein bestand
// dat de sectie dpv-rekenhulp in de browser ophaalt.
//
// Per telefoonmodel (de modellen die het vaakst in de abonnementenfeed staan):
//  - de goedkoopste losse prijs, nieuw, uit de productvergelijker (c-telefoons);
//  - per databundel (minstens 1, 10 of 30 GB) het goedkoopste toestel met
//    abonnement over 24 maanden, alles bij elkaar opgeteld (effectiveMonthly x 24);
//  - en apart per bundel de goedkoopste sim only over 24 maanden.
// Twee varianten per bundel: alle bundels en alleen onbeperkt bellen.
//
// Alleen consumentenaanbod (geen zakelijk), alleen nieuw, alleen 24 maanden bij
// het toestel; sim only mag 1, 12 of 24 maanden zijn, gerekend over 24 maanden.
// De verkoper noemen we bij naam behalve als dat een tussenpersoon is; dan staat
// alleen het netwerk erbij.
import fs from 'node:fs'
import zlib from 'node:zlib'

const FEED = 'https://go.deprijsvergelijker.com/api/feed/'
const SHOP = 'https://raw.githubusercontent.com/FortAssets/mm_feed/main/data/shop/c-telefoons.json.gz'
const UIT = 'data/rekenhulp.json'
const MAX_MODELLEN = 60
const MAANDEN = 24
const NIET_NOEMEN = /mobiel\.nl/i

async function haal (u) {
  const r = await fetch(u, { headers: { 'User-Agent': 'DePrijsvergelijker-rekenhulp/1.0' } })
  if (!r.ok) throw new Error(u + ' ' + r.status)
  return r
}
const feed = async c => ((await (await haal(FEED + c)).json()).data) || []

function norm (s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/(\d+)\s*(gb|tb)\b/g, '$1$2').replace(/[^a-z0-9+ ]+/g, ' ').replace(/\s+/g, ' ').trim()
}
const OPSLAG = /^\d+(gb|tb)$/
// woorden die een ander model maken: zonder deze controle telt een iPhone 17 Pro als iPhone 17
const ANDERS = new Set(['pro', 'max', 'plus', 'ultra', 'mini', 'fe', 'lite', 'fold', 'flip', 'air', 'duo', 'edge', 'neo', 'xl', 'a', 'e', 's'])
const RUIS = /hoes|case|cover|screenprotector|glass|oplader|kabel|refurbished|tweedehands|gebruikt|renewed|houder|pasjes|bumper/i

// Wat je minstens nodig hebt: w = elke bundel, g = 10 GB of meer, v = 30 GB of meer.
// Een grotere bundel voor minder geld telt dus gewoon mee.
const GRENS = { w: 1, g: 10, v: 30 }
const onbeperkt = x => /onbeperkt|unlimited/i.test(x.minutesLabel || '')
const via = x => (NIET_NOEMEN.test(x.merchantName || '') ? '' : String(x.merchantName || '').replace(/\s+NL$/, ''))

function kort (x, soort) {
  const totaal = Math.round(x.effectiveMonthly * MAANDEN * 100) / 100
  const o = {
    t: totaal, pm: Math.round(x.effectiveMonthly * 100) / 100, net: x.network || '', via: via(x),
    gb: x.dataGB, min: x.minutesLabel || '', mnd: x.contractMonths || null, u: x.affiliateUrl || ''
  }
  if (soort === 'abo') { o.eenmalig = Math.round((x.deviceDownPayment || x.initialCost || 0) * 100) / 100; o.abo = x.price; o.betaal = x.paymentType || '' }
  else o.abo = x.price
  return o
}

function goedkoopste (lijst, soort) {
  const uit = {}
  for (const b of ['w', 'g', 'v']) {
    const in_b = lijst.filter(x => x.dataGB >= GRENS[b])
    const min = l => l.reduce((a, x) => (!a || x.effectiveMonthly < a.effectiveMonthly ? x : a), null)
    const a = min(in_b); const o = min(in_b.filter(onbeperkt))
    uit[b] = { alle: a ? kort(a, soort) : null, onb: o ? kort(o, soort) : null }
  }
  return uit
}

const tel = (await feed('telefoon')).filter(x => x.condition === 'nieuw' && x.isZakelijk === false &&
  x.contractMonths === MAANDEN && x.effectiveMonthly > 0 && x.brand && x.model && x.dataGB > 0 && !/zakelijk/i.test(x.merchantName || ''))
const sim = (await feed('simonly')).filter(x => x.isZakelijk !== true && !/zakelijk/i.test(x.merchantName || '') &&
  [1, 12, 24].includes(x.contractMonths) && x.effectiveMonthly > 0 && x.dataGB > 0)
console.log('toestel met abonnement', tel.length, 'sim only', sim.length)

// losse telefoons uit de productvergelijker
const shop = JSON.parse(zlib.gunzipSync(Buffer.from(await (await haal(SHOP)).arrayBuffer())).toString('utf8'))
const losse = (shop.p || []).filter(p => p.s === 'n' && p.p >= 80 && !RUIS.test(p.n)).map(p => ({ p, n: ' ' + norm(p.n) + ' ' }))
console.log('losse telefoons', losse.length)

// modellen op volgorde van hoe vaak ze in de feed staan
const groepen = new Map()
for (const x of tel) {
  const k = norm(x.brand + ' ' + x.model)
  if (!groepen.has(k)) groepen.set(k, [])
  groepen.get(k).push(x)
}
const modellen = []
for (const [k, lijst] of [...groepen].sort((a, b) => b[1].length - a[1].length)) {
  if (modellen.length >= MAX_MODELLEN) break
  if (lijst.length < 3) continue
  const w = k.split(' ')
  const opslag = w.find(t => OPSLAG.test(t))
  if (!opslag) continue
  const merk = norm(lijst[0].brand)
  const kern = w.filter(t => t !== merk)
  // losse prijs: alle woorden van het model, geen woord dat er een ander model van maakt
  const raak = losse.filter(l => kern.every(t => l.n.includes(' ' + t + ' ')) &&
    !l.n.split(' ').some(t => ANDERS.has(t) && !kern.includes(t) && !merk.split(' ').includes(t)))
  // tegen fouten in de feed: niet onder de helft van wat de providers voor het toestel los vragen
  const los1 = lijst.filter(x => x.paymentType === 'oneoff' && x.deviceDownPayment > 50).map(x => x.deviceDownPayment).sort((a, b) => a - b)
  const ondergrens = los1.length ? los1[Math.floor(los1.length / 2)] * 0.5 : 80
  // per product de goedkoopste winkel die wij bij naam mogen noemen
  const kies = p => (p.o || []).find(o => !NIET_NOEMEN.test(o.w || '') && o.p >= ondergrens)
  const los = raak.map(l => l.p).filter(p => kies(p)).sort((a, b) => kies(a).p - kies(b).p)[0]
  if (!los) continue
  const o = kies(los)
  modellen.push({
    k, merk: lijst[0].brand, naam: lijst[0].brand + ' ' + lijst[0].model, opslag: opslag.toUpperCase().replace(/(\d)(GB|TB)/, '$1 $2'),
    img: los.im || lijst[0].image || '',
    los: { p: o.p, w: o.w, i: los.i, c: 'telefoons', nw: los.o.length },
    abo: goedkoopste(lijst, 'abo'), aantal: lijst.length
  })
}
modellen.sort((a, b) => a.merk.localeCompare(b.merk) || a.naam.localeCompare(b.naam, 'nl', { numeric: true }))
const uit = { gemaakt: new Date().toISOString(), maanden: MAANDEN, sim: goedkoopste(sim, 'sim'), modellen }
if (modellen.length < 10) { console.log('te weinig modellen (' + modellen.length + '), vorige versie blijft staan'); process.exit(0) }
fs.mkdirSync('data', { recursive: true })
fs.writeFileSync(UIT, JSON.stringify(uit))
console.log('geschreven', UIT, modellen.length, 'modellen,', (fs.statSync(UIT).size / 1024).toFixed(0) + ' kB')
for (const m of modellen.slice(0, 60)) console.log(m.naam.padEnd(40), 'los', m.los.p, m.los.w.padEnd(18), 'abo g', m.abo.g.alle ? m.abo.g.alle.t : '-', ' sim g', uit.sim.g.alle.t)
