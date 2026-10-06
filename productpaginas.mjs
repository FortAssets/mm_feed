// Productpagina's in Shopify bijwerken (metaobject "productpagina").
//
// Voor elk product dat bij minstens twee winkels te koop is, bestaat een eigen
// pagina op /pages/product/<handle>. Dit script maakt de pagina's aan, houdt de
// prijzen bij en vult de specificaties aan via de catalogus van bol.
//
// Bron van de producten: de eigen shop-API (shop.deprijsvergelijker.com), dus
// dezelfde gegevens als de vergelijker op de site.
//
// Nodig in de omgeving:
//   SHOPIFY_TOKEN        Admin API-token met read_metaobjects en write_metaobjects
//   SHOPIFY_SHOP         standaard a954c1.myshopify.com
//   BOL_CLIENT_ID / BOL_CLIENT_SECRET   alleen voor de specificaties
//
// Opties:
//   --droog              niets schrijven, alleen tellen wat er zou gebeuren
//   MAX_NIEUW=500        hoogstens zoveel nieuwe pagina's per run (standaard 5000)
//   SPECS_MAX=300        hoogstens zoveel specificaties per run (standaard 300)
//
// De stand staat in data/productpaginas-stand.json: per product de handle, de
// peildatum, een vingerafdruk van het aanbod en of de specificaties er zijn.
// Zo schrijft een run alleen wat veranderd is.

import fs from 'node:fs'
import crypto from 'node:crypto'

const SHOP = process.env.SHOPIFY_SHOP || 'a954c1.myshopify.com'
const TOKEN = process.env.SHOPIFY_TOKEN || ''
const VERSIE = '2026-01'
const DROOG = process.argv.includes('--droog') || !TOKEN
const MAX_NIEUW = Number(process.env.MAX_NIEUW || 5000)
const SPECS_MAX = Number(process.env.SPECS_MAX || 300)
const VERS_DAGEN = 7                      // ongewijzigde pagina's krijgen na zoveel dagen een nieuwe peildatum
const STAND = 'data/productpaginas-stand.json'
// De kaart {id: handle} die het thema leest om kaarten aan hun pagina te koppelen.
const KAART = 'data/productpaginas.json'
const API = 'https://shop.deprijsvergelijker.com/api/shop/'
const TYPE = 'productpagina'

const wacht = ms => new Promise(r => setTimeout(r, ms))
const vandaag = new Date().toISOString().slice(0, 10)

// ---- hulpjes ----------------------------------------------------------------
function slug (n) {
  return String(n).normalize('NFKD').replace(/[^\x00-\x7F]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/^-+|-+$/g, '')
}
const schoon = n => String(n).split(' | ')[0].replace(/\s+/g, ' ').trim()
const getal = p => (Number(p) === Math.round(p) ? String(Math.round(p)) : Number(p).toFixed(2))
const euro = p => '€' + (Number(p) === Math.round(p) ? String(Math.round(p)) : Number(p).toFixed(2).replace('.', ','))
const afdruk = s => crypto.createHash('md5').update(s).digest('hex').slice(0, 10)

async function haalJson (url, pogingen = 3) {
  let fout
  for (let k = 0; k < pogingen; k++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'dpv-productpaginas' } })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return await r.json()
    } catch (e) { fout = e; await wacht(2000 + 2000 * k) }
  }
  throw fout
}

// ---- producten uit de shop-API ----------------------------------------------
async function haalProducten () {
  const index = await haalJson(API + 'index')
  const alle = new Map()
  for (const c of index.categorieen || []) {
    if (!c.multi) continue
    for (let p = 1; ; p++) {
      const d = await haalJson(API + 'lijst?cat=' + encodeURIComponent(c.slug) + '&multi=1&n=60&p=' + p)
      for (const x of d.items || []) if ((x.o || []).length > 1) alle.set(x.i, { ...x, _cat: c.slug, _catnaam: c.naam })
      if (p >= (d.paginas || 1)) break
      await wacht(150)
    }
  }
  return { gemaakt: index.gemaakt, items: [...alle.values()] }
}

function maakRij (x) {
  const o = [...x.o].sort((a, b) => a.p - b.p)
  const naam = schoon(x.n)
  const f = {
    naam: naam.slice(0, 250),
    merk: x.b || '',
    categorie: x._cat,
    categorie_naam: x._catnaam,
    soort: x.t || '',
    ean: x.e || '',
    shop_id: x.i,
    afbeelding: /^https?:\/\//.test(x.im || '') ? x.im : '',
    prijs: getal(o[0].p),
    hoogste: getal(o[o.length - 1].p),
    winkels: String(o.length),
    aanbod: JSON.stringify(o.map(w => ({ w: w.w, p: w.p }))),
    peildatum: vandaag,
    seo_titel: naam.slice(0, 200) + ': prijzen vergelijken',
    seo_omschrijving: 'Vergelijk de prijs van ' + naam.slice(0, 150) + ' bij ' + o.length + ' winkels, vanaf ' + euro(o[0].p) +
      '. Met prijsverloop per winkel en een eerlijk oordeel over de huidige prijs.'
  }
  return { id: x.i, naam, f, vinger: afdruk(f.aanbod + '|' + f.naam + '|' + f.afbeelding) }
}

// ---- Shopify ------------------------------------------------------------------
async function gql (query, variables) {
  for (let k = 0; k < 6; k++) {
    const r = await fetch('https://' + SHOP + '/admin/api/' + VERSIE + '/graphql.json', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-shopify-access-token': TOKEN },
      body: JSON.stringify({ query, variables })
    })
    if (r.status === 401 || r.status === 403) throw new Error('Shopify weigert het token (' + r.status + '). Controleer SHOPIFY_TOKEN en de rechten read_metaobjects en write_metaobjects.')
    if (r.status === 429 || r.status >= 500) { await wacht(3000 * (k + 1)); continue }
    const j = await r.json()
    const gesmoord = (j.errors || []).some(e => (e.extensions || {}).code === 'THROTTLED')
    if (gesmoord) { await wacht(4000); continue }
    if (j.errors) throw new Error('GraphQL: ' + JSON.stringify(j.errors).slice(0, 400))
    const over = j.extensions && j.extensions.cost && j.extensions.cost.throttleStatus
    if (over && over.currentlyAvailable < 400) await wacht(2500)
    return j.data
  }
  throw new Error('Shopify bleef onbereikbaar')
}

// Eerste run: wat staat er al? Handle, product-id en of er specificaties zijn.
async function haalBestaande () {
  const uit = {}
  let na = null
  for (;;) {
    const d = await gql('query($na: String) { metaobjects(type: "' + TYPE + '", first: 50, after: $na) { nodes { handle shop: field(key: "shop_id") { value } specs: field(key: "specs") { value } } pageInfo { hasNextPage endCursor } } }', { na })
    for (const n of d.metaobjects.nodes) {
      const id = n.shop && n.shop.value
      if (id) uit[id] = { h: n.handle, d: '', v: '', s: n.specs && n.specs.value ? 1 : 0 }
    }
    if (!d.metaobjects.pageInfo.hasNextPage) break
    na = d.metaobjects.pageInfo.endCursor
  }
  return uit
}

async function upsert (items) {
  // items: [{ handle, fields: [{key, value}], actief }]
  const decl = items.map((_, i) => '$h' + i + ': MetaobjectHandleInput!, $m' + i + ': MetaobjectUpsertInput!').join(', ')
  const body = items.map((_, i) => 'a' + i + ': metaobjectUpsert(handle: $h' + i + ', metaobject: $m' + i + ') { metaobject { handle } userErrors { field message } }').join('\n')
  const vars = {}
  items.forEach((it, i) => {
    vars['h' + i] = { type: TYPE, handle: it.handle }
    vars['m' + i] = it.actief ? { capabilities: { publishable: { status: 'ACTIVE' } }, fields: it.fields } : { fields: it.fields }
  })
  const d = await gql('mutation(' + decl + ') {\n' + body + '\n}', vars)
  const fouten = []
  items.forEach((it, i) => {
    const r = d['a' + i]
    if (!r || !r.metaobject || (r.userErrors || []).length) fouten.push(it.handle + ': ' + JSON.stringify((r && r.userErrors) || 'geen antwoord').slice(0, 200))
  })
  return fouten
}

// ---- specificaties van bol ----------------------------------------------------
const GROEP_WEG = new Set(['Mogelijke vereisten instellen en gebruik', 'Introductie en ondersteuning', 'Informatie over de fabrikant', 'Overige kenmerken', 'EAN'])
const SLEUTEL_WEG = /^(EAN|Mpn|Warranty .*|Weight|Length|Width|Height|Packaging|Package Content.*|Number Pieces In Package|Whats In The Box|Accessoires Included|Additional Guarantees|Aftersales Service\(s\)|Manufacturer Name|Language Instructions|Radiation Indication|Introduction Month)$/i

let bolToken = null
async function bolLogin () {
  const id = process.env.BOL_CLIENT_ID; const geheim = process.env.BOL_CLIENT_SECRET
  if (!id || !geheim) return false
  // Eén poging. bol blokkeert een adres na herhaald mislukte tokenverzoeken,
  // dus bij een fout stoppen we met de specificaties voor deze run.
  const r = await fetch('https://login.bol.com/token?grant_type=client_credentials', {
    method: 'POST',
    headers: { authorization: 'Basic ' + Buffer.from(id + ':' + geheim).toString('base64'), accept: 'application/json' }
  })
  if (!r.ok) { console.error('bol: geen token (' + r.status + '), specificaties overgeslagen'); return false }
  bolToken = (await r.json()).access_token
  return !!bolToken
}

async function bolSpecs (ean) {
  const r = await fetch('https://api.bol.com/marketing/catalog/v1/products/' + encodeURIComponent(ean) +
    '?country-code=NL&include-specifications=true&include-rating=true', {
    headers: { authorization: 'Bearer ' + bolToken, accept: 'application/json', 'accept-language': 'nl' }
  })
  if (r.status === 404) return { geen: true }
  if (r.status === 401 || r.status === 403) return { stop: true }
  if (r.status === 429) return { rem: true }
  if (!r.ok) return { fout: r.status }
  const d = await r.json()
  const g = []
  let rijen = 0
  for (const groep of d.specificationGroups || []) {
    if (GROEP_WEG.has(groep.title) || g.length >= 12) continue
    const r2 = []
    for (const s of groep.specifications || []) {
      if (SLEUTEL_WEG.test(s.key || '') || r2.length >= 9 || rijen >= 48) continue
      const waarde = (s.values || []).join(', ').trim()
      if (!s.name || !waarde) continue
      r2.push([s.name, waarde.slice(0, 160)]); rijen++
    }
    if (r2.length) g.push({ t: groep.title, r: r2 })
  }
  if (!g.length) return { geen: true }
  const uit = { bron: 'bol.com', g }
  const score = d.rating
  if (typeof score === 'number' && score > 0) uit.score = Math.round(score * 10) / 10
  return { specs: uit }
}

// ---- hoofdlijn ----------------------------------------------------------------
const { gemaakt, items } = await haalProducten()
console.log('shop-API: ' + items.length + ' producten bij twee of meer winkels (feed van ' + gemaakt + ')')
if (items.length < 300) { console.error('te weinig producten, er mist een feed; niets geschreven'); process.exit(1) }

let stand = null
try { stand = JSON.parse(fs.readFileSync(STAND, 'utf8')) } catch (e) { /* eerste keer */ }
if (!stand) {
  if (!DROOG) stand = await haalBestaande()
  else {
    // Zonder sleutel: neem de kaart als uitgangspunt, zodat de telling klopt.
    stand = {}
    try { for (const [id, h] of Object.entries(JSON.parse(fs.readFileSync(KAART, 'utf8')))) stand[id] = { h, d: '', v: '', s: 0 } } catch (e) { /* geen kaart */ }
  }
  console.log('eerste run: ' + Object.keys(stand).length + ' bestaande pagina\'s gevonden' + (DROOG ? ' in de kaart' : ' in Shopify'))
}

const bezet = new Set(Object.values(stand).map(s => s.h))
const teDoen = []
let nieuw = 0; let gewijzigd = 0; let ververst = 0
// Meeste winkels en hoogste prijs eerst, zodat een begrensde run de beste pagina's maakt.
items.sort((a, b) => (b.o.length - a.o.length) || (b.p - a.p))
for (const x of items) {
  const rij = maakRij(x)
  let s = stand[rij.id]
  if (!s) {
    if (nieuw >= MAX_NIEUW) continue
    let h = slug(rij.naam)
    if (!h || bezet.has(h)) h = (h.slice(0, 55).replace(/-+$/, '') + '-' + String(x.e || x.i).replace(/\D/g, '')).slice(0, 70).replace(/^-+|-+$/g, '')
    if (!h || bezet.has(h)) continue
    bezet.add(h)
    s = stand[rij.id] = { h, d: '', v: '', s: 0, nieuw: 1 }
    nieuw++
  } else if (s.v !== rij.vinger) gewijzigd++
  else if (!s.d || (Date.parse(vandaag) - Date.parse(s.d)) / 864e5 >= VERS_DAGEN) ververst++
  else continue
  teDoen.push({ rij, s })
}
console.log('nieuw: ' + nieuw + ' | prijs of aanbod gewijzigd: ' + gewijzigd + ' | peildatum verversen: ' + ververst)

let geschreven = 0; const fouten = []
if (!DROOG) {
  for (let i = 0; i < teDoen.length; i += 20) {
    const deel = teDoen.slice(i, i + 20)
    const f = await upsert(deel.map(({ rij, s }) => ({
      handle: s.h, actief: true,
      fields: Object.entries(rij.f).filter(([, v]) => v !== '').map(([key, value]) => ({ key, value }))
    })))
    fouten.push(...f)
    const mis = new Set(f.map(t => t.split(':')[0]))
    for (const { rij, s } of deel) {
      if (mis.has(s.h)) { if (s.nieuw) delete stand[rij.id]; continue }
      s.d = vandaag; s.v = rij.vinger; delete s.nieuw; geschreven++
    }
    if (i % 400 === 0) console.log('  geschreven: ' + geschreven + ' van ' + teDoen.length)
  }
  console.log('pagina\'s geschreven: ' + geschreven + (fouten.length ? ' | fouten: ' + fouten.length : ''))
  for (const f of fouten.slice(0, 15)) console.error('  ' + f)
} else {
  console.log('droog: er is niets geschreven' + (TOKEN ? '' : ' (geen SHOPIFY_TOKEN)'))
  for (const { rij, s } of teDoen.slice(0, 5)) console.log('  ' + s.h + ' | ' + rij.f.prijs + ' | ' + rij.f.winkels + ' winkels')
}

// Specificaties: alleen pagina's die bestaan, een EAN hebben en nog geen specs.
let specsGezet = 0
if (!DROOG && SPECS_MAX > 0 && await bolLogin()) {
  const kandidaten = items.filter(x => {
    const s = stand[x.i]
    return s && s.d && !s.s && x.e && !(s.x && (Date.parse(vandaag) - Date.parse(s.x)) / 864e5 < 30)
  }).slice(0, SPECS_MAX)
  let wachtrij = []
  const schrijf = async () => {
    if (!wachtrij.length) return
    const f = await upsert(wachtrij.map(w => ({ handle: w.s.h, actief: false, fields: [{ key: 'specs', value: JSON.stringify(w.specs) }] })))
    const mis = new Set(f.map(t => t.split(':')[0]))
    for (const w of wachtrij) if (!mis.has(w.s.h)) { w.s.s = 1; specsGezet++ }
    fouten.push(...f); wachtrij = []
  }
  for (const x of kandidaten) {
    const s = stand[x.i]
    const r = await bolSpecs(x.e)
    if (r.stop) { console.error('bol: toegang geweigerd, specificaties gestopt'); break }
    if (r.rem) { await wacht(20000); continue }
    if (r.geen) s.x = vandaag
    if (r.specs) { wachtrij.push({ s, specs: r.specs }); if (wachtrij.length >= 8) await schrijf() }
    await wacht(350)
  }
  await schrijf()
  console.log('specificaties gezet: ' + specsGezet + ' van ' + kandidaten.length + ' geprobeerd')
}

if (!DROOG) {
  fs.mkdirSync('data', { recursive: true })
  fs.writeFileSync(STAND, JSON.stringify(stand))
  // Alleen pagina's die echt bestaan komen in de kaart, anders linkt een kaart naar een 404.
  const kaart = {}
  for (const [id, s] of Object.entries(stand)) if (s.h && (s.d || !s.nieuw)) kaart[id] = s.h
  fs.writeFileSync(KAART, JSON.stringify(kaart))
  const totaal = Object.values(stand).filter(s => s.d).length
  console.log('stand bewaard: ' + totaal + ' pagina\'s, waarvan ' + Object.values(stand).filter(s => s.s).length + ' met specificaties')
}
if (fouten.length > 50) process.exit(1)
