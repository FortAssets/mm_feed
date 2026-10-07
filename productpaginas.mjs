// Productpagina's in Shopify bijwerken (metaobject "productpagina").
//
// Voor elk product dat bij minstens twee winkels te koop is, bestaat een eigen
// pagina op /pages/product/<handle>. Een product bij een winkel krijgt er ook
// een, als het 40 euro of meer kost en er specificaties van te vinden zijn
// (zie "producten bij een winkel" onderaan). Dit script maakt de pagina's aan, houdt de
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
//   EEN_MAX=1500         hoogstens zoveel nieuwe pagina's voor producten bij een winkel
//   EEN_ZOEK=2000        hoogstens zoveel daarvan opzoeken bij Icecat en bol
//   EEN_VANAF=40         ondergrens in euro's voor een product bij een winkel
//   --proef              het deel "bij een winkel" doorlopen zonder iets te schrijven
//
// De stand staat in data/productpaginas-stand.json: per product de handle, de
// peildatum, een vingerafdruk van het aanbod en of de specificaties er zijn.
// Zo schrijft een run alleen wat veranderd is.

import fs from 'node:fs'
import crypto from 'node:crypto'
import { mmSpecs } from './specs-mm.mjs'

const SHOP = process.env.SHOPIFY_SHOP || 'a954c1.myshopify.com'
// Twee manieren om binnen te komen. Een vast token (oude eigen app, begint met
// shpat_), of client-id en geheim van een app uit het Dev Dashboard: daarmee
// haalt het script zelf een token dat een dag geldig is.
let TOKEN = process.env.SHOPIFY_TOKEN || ''
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || ''
const CLIENT_GEHEIM = process.env.SHOPIFY_CLIENT_SECRET || ''
if (!TOKEN && CLIENT_ID && CLIENT_GEHEIM && !process.argv.includes('--droog')) {
  // Een poging. Lukt het niet, dan stopt de run met een duidelijke melding.
  const r = await fetch('https://' + SHOP + '/admin/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_GEHEIM })
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.access_token) {
    console.error('Shopify gaf geen token (' + r.status + '). Controleer SHOPIFY_CLIENT_ID en SHOPIFY_CLIENT_SECRET, en of de app op de winkel is geinstalleerd met read_metaobjects en write_metaobjects.')
    process.exit(1)
  }
  TOKEN = j.access_token
}
const VERSIE = '2026-01'
const DROOG = process.argv.includes('--droog') || !TOKEN
const MAX_NIEUW = Number(process.env.MAX_NIEUW || 5000)
const SPECS_MAX = Number(process.env.SPECS_MAX || 300)
const EEN_MAX = Number(process.env.EEN_MAX || 1500)
const EEN_ZOEK = Number(process.env.EEN_ZOEK || 2000)
const EEN_VANAF = Number(process.env.EEN_VANAF || 40)
const PROEF = process.argv.includes('--proef')
// Producten bij een winkel waar geen enkele bron specificaties van had, met de datum.
const EEN_STAND = 'data/productpaginas-een.json'
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
  // Alles, niet alleen wat bij twee winkels ligt: een pagina blijft bestaan als
  // een product naar een winkel zakt en moet dan nog steeds de prijs van vandaag
  // krijgen, en producten bij een winkel kunnen zelf een pagina krijgen.
  for (const c of index.categorieen || []) {
    for (let p = 1; ; p++) {
      const d = await haalJson(API + 'lijst?cat=' + encodeURIComponent(c.slug) + '&n=60&p=' + p)
      for (const x of d.items || []) if ((x.o || []).length) alle.set(x.i, { ...x, _cat: c.slug, _catnaam: c.naam })
      if (p >= (d.paginas || 1)) break
      await wacht(120)
    }
  }
  return { gemaakt: index.gemaakt, alle: [...alle.values()] }
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
    seo_titel: naam.slice(0, 200) + (o.length > 1 ? ': prijzen vergelijken' : ': prijs en specificaties'),
    seo_omschrijving: o.length > 1
      ? 'Vergelijk de prijs van ' + naam.slice(0, 150) + ' bij ' + o.length + ' winkels, vanaf ' + euro(o[0].p) +
        '. Met prijsverloop per winkel en een eerlijk oordeel over de huidige prijs.'
      : naam.slice(0, 150) + ' voor ' + euro(o[0].p) + ' bij ' + o[0].w + '. Met alle specificaties, het prijsverloop en een eerlijk oordeel over de huidige prijs.'
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
let bolGeprobeerd = false
async function bolLogin () {
  // Hoogstens een poging per run, ook als twee delen van het script erom vragen.
  if (bolGeprobeerd) return !!bolToken
  bolGeprobeerd = true
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

// ---- velden uit de MediaMarkt-feed ---------------------------------------------
// Dezelfde feeds als shop.mjs. Per EAN alle velden, samengevoegd over de feeds:
// hetzelfde product heeft in de ene feed meer velden dan in de andere.
const MM_FIDS = [23777, 258752, 23270, 23056, 50606, 50616, 50615, 50617, 50618, 50608, 50620, 50622, 50619, 50621]
const MM_BANDEN = [[0, 10], [10, 25], [25, 50], [50, 100], [100, 200], [200, 400], [400, 800], [800, 1600], [1600, 0]]
async function haalMmVelden () {
  const token = process.env.MM_TOKEN
  if (!token) return null
  const uit = new Map()
  let verzoeken = 0; let mislukt = 0
  const vraag = async (fid, pagina, min, max) => {
    let q = 'page=' + pagina + ';pageSize=100'
    if (min > 0) q += ';minPrice=' + min
    if (max > 0) q += ';maxPrice=' + max
    for (let k = 0; k < 3; k++) {
      try {
        verzoeken++
        const r = await fetch('https://api.tradedoubler.com/1.0/products.json;' + q + ';fid=' + fid + '?token=' + token,
          { headers: { 'User-Agent': 'Mozilla/5.0 (feed-bot) Chrome/120', Accept: 'application/json' } })
        if (r.status === 401 || r.status === 403) return null
        if (r.ok) return (await r.json()).products || []
      } catch (e) { /* opnieuw */ }
      await wacht(2500 * (k + 1))
    }
    mislukt++
    return []
  }
  const band = async (fid, min, max, diepte) => {
    for (let p = 1; p <= 10; p++) {
      const ps = await vraag(fid, p, min, max)
      if (ps === null) return false
      for (const q of ps) {
        const ean = String((q.identifiers && q.identifiers.ean) || '').replace(/^0+/, '')
        if (!/^\d{7,14}$/.test(ean)) continue
        const f = uit.get(ean) || {}
        for (const x of (q.fields || [])) if (x && x.name && x.value != null && x.value !== '') f[x.name] = x.value
        uit.set(ean, f)
      }
      if (ps.length < 100) return true
      // Tien volle pagina's: de band is te breed, dus splitsen op de meetkundige helft.
      if (p === 10 && diepte < 4) {
        const boven = max > 0 ? max : Math.max(min * 4, 6400)
        const mid = Math.round(Math.sqrt(Math.max(min, 1) * boven))
        if (mid > min && (max === 0 || mid < max)) { await band(fid, min, mid, diepte + 1); await band(fid, mid, max, diepte + 1) }
      }
      await wacht(150)
    }
    return true
  }
  for (const fid of MM_FIDS) {
    for (const [min, max] of MM_BANDEN) {
      if (await band(fid, min, max, 0) === false) { console.error('MediaMarkt-feed: toegang geweigerd, overgeslagen'); return uit.size ? uit : null }
    }
  }
  console.log('MediaMarkt-feed: velden van ' + uit.size + ' producten (' + verzoeken + ' verzoeken' + (mislukt ? ', ' + mislukt + ' mislukt' : '') + ')')
  return uit.size ? uit : null
}

// ---- specificaties van Icecat --------------------------------------------------
// Open Icecat: gratis, Nederlandstalig, per EAN. Dekt de merken die Icecat
// sponsoren (laptops vrijwel volledig, telefoons en audio deels). Met de
// tokens van het eigen account als ze er zijn, anders de open toegang.
const ICE_GROEP_WEG = new Set(['Berichten', 'Logistieke gegevens', 'Overige specificaties', 'Technische details', 'Certificaten', 'Verpakkingsgegevens'])
async function icecatSpecs (ean) {
  const api = process.env.ICECAT_API_TOKEN; const inhoud = process.env.ICECAT_CONTENT_TOKEN
  const metToken = !!(api && inhoud)
  let r
  try {
    r = await fetch('https://live.icecat.biz/api?lang=nl&GTIN=' + encodeURIComponent(ean) + '&content=' + (metToken ? '' : '&shopname=openIcecat-live'),
      { headers: metToken ? { 'api-token': api, 'content-token': inhoud } : {} })
  } catch (e) { return { fout: 'net' } }
  if (r.status === 429) return { rem: true }
  if (r.status === 401) return { stop: true }
  // 400, 403 en 404: onbekende EAN, of een merk buiten de open catalogus.
  if (!r.ok) return { geen: true }
  const d = ((await r.json().catch(() => ({}))) || {}).data || {}
  const g = []
  let rijen = 0
  for (const groep of d.FeaturesGroups || []) {
    const titel = (((groep.FeatureGroup || {}).Name || {}).Value || '').trim()
    if (!titel || ICE_GROEP_WEG.has(titel) || g.length >= 12) continue
    const r2 = []
    for (const f of groep.Features || []) {
      if (r2.length >= 6 || rijen >= 60) break
      const naam = ((((f.Feature || {}).Name || {}).Value) || '').trim()
      const waarde = String(f.PresentationValue == null ? '' : f.PresentationValue).trim()
      if (!naam || !waarde || waarde.length > 160) continue
      r2.push([naam, waarde]); rijen++
    }
    if (r2.length) g.push({ t: titel, r: r2 })
  }
  if (!g.length) return { geen: true }
  return { specs: { g } }
}

// ---- hoofdlijn ----------------------------------------------------------------
const { gemaakt, alle } = await haalProducten()
const aantalMulti = alle.filter(x => x.o.length > 1).length
console.log('shop-API: ' + alle.length + ' producten, waarvan ' + aantalMulti + ' bij twee of meer winkels (feed van ' + gemaakt + ')')
if (aantalMulti < 300) { console.error('te weinig producten, er mist een feed; niets geschreven'); process.exit(1) }

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

// Bij te houden: alles bij twee of meer winkels, en wat bij een winkel ligt en al een pagina heeft.
const items = alle.filter(x => x.o.length > 1 || (stand[x.i] && stand[x.i].h))
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
  console.log('droog: er is niets geschreven' + (TOKEN ? '' : ' (geen Shopify-sleutel)'))
  for (const { rij, s } of teDoen.slice(0, 5)) console.log('  ' + s.h + ' | ' + rij.f.prijs + ' | ' + rij.f.winkels + ' winkels')
}

// Specificaties: de meest complete bron wint.
//  1. De MediaMarkt-feed is in een keer binnen, dus die vult meteen elke pagina
//     die nog niets heeft.
//  2. Daarna gaat elk product een keer langs Icecat. Heeft Icecat meer regels
//     dan wat er staat, dan vervangt dat de MediaMarkt-lijst.
//  3. Staat er dan nog niets, dan bol.
// In de stand: s = er staan specs, m = aantal regels uit de MediaMarkt-feed,
// i = Icecat is geprobeerd, x = datum waarop geen enkele bron iets had.
const telRijen = sp => sp.g.reduce((n, g) => n + g.r.length, 0)
let mmGeladen; let mmVelden = null
const mmLaad = async () => { if (!mmGeladen) { mmGeladen = true; mmVelden = await haalMmVelden() } return mmVelden }
let iceDicht = false; let bolDicht = false
let specsGezet = 0
if (!DROOG && SPECS_MAX > 0) {
  const uitBron = { MediaMarkt: 0, Icecat: 0, 'bol.com': 0 }
  const metEan = items.filter(x => { const s = stand[x.i]; return s && s.d && x.e })
  let wachtrij = []
  const schrijf = async () => {
    if (!wachtrij.length) return
    const f = await upsert(wachtrij.map(w => ({ handle: w.s.h, actief: false, fields: [{ key: 'specs', value: JSON.stringify(w.specs) }] })))
    const mis = new Set(f.map(t => t.split(':')[0]))
    for (const w of wachtrij) {
      if (mis.has(w.s.h)) continue
      w.s.s = 1; specsGezet++; uitBron[w.bron]++
      if (w.bron === 'MediaMarkt') w.s.m = telRijen(w.specs); else delete w.s.m
    }
    fouten.push(...f); wachtrij = []
  }

  // 1. MediaMarkt
  const zonder = metEan.filter(x => !stand[x.i].s)
  const mm = zonder.length ? await mmLaad() : null
  if (mm) {
    for (const x of zonder) {
      const sp = mmSpecs(mm.get(String(x.e).replace(/^0+/, '')))
      if (!sp) continue
      wachtrij.push({ s: stand[x.i], specs: sp, bron: 'MediaMarkt' })
      if (wachtrij.length >= 8) await schrijf()
    }
    await schrijf()
  }

  // 2. Icecat en 3. bol: een verzoek per product, dus begrensd per run.
  // Pagina's zonder specs gaan voor op pagina's die al een MediaMarkt-lijst hebben.
  const metBol = await bolLogin()
  let iceAan = true; let bolAan = metBol
  const kandidaten = metEan.filter(x => {
    const s = stand[x.i]
    if (s.s) return !!s.m && !s.i
    return !(s.x && (Date.parse(vandaag) - Date.parse(s.x)) / 864e5 < 30)
  }).sort((a, b) => (stand[a.i].s || 0) - (stand[b.i].s || 0)).slice(0, SPECS_MAX)
  for (const x of kandidaten) {
    const s = stand[x.i]
    if (!iceAan && !(bolAan && !s.s)) { if (!iceAan && !bolAan) break; continue }
    let r = iceAan ? await icecatSpecs(x.e) : { geen: true }
    let bron = 'Icecat'
    if (r.stop) { console.error('Icecat: toegang geweigerd, verder zonder Icecat'); iceAan = false; iceDicht = true; r = { fout: 'icecat' } }
    if (r.rem) { await wacht(20000); continue }
    // Een antwoord van Icecat, ja of nee: niet nog eens vragen.
    if (r.specs || r.geen) s.i = 1
    // Icecat vervangt een bestaande lijst alleen als hij completer is.
    if (r.specs && s.m && telRijen(r.specs) <= s.m) r = { al: true }
    if (!r.specs && !s.s && bolAan) {
      r = await bolSpecs(x.e); bron = 'bol.com'
      if (r.stop) { console.error('bol: toegang geweigerd, verder zonder bol'); bolAan = false; bolDicht = true; r = { fout: 'bol' } }
      if (r.rem) { await wacht(20000); continue }
    }
    // Geen enkele bron had iets: over een maand opnieuw proberen.
    if (r.geen && !s.s) { s.x = vandaag; delete s.i }
    if (r.specs) { wachtrij.push({ s, specs: r.specs, bron }); if (wachtrij.length >= 8) await schrijf() }
    await wacht(350)
  }
  await schrijf()
  console.log('specificaties gezet: ' + specsGezet + ' (MediaMarkt ' + uitBron.MediaMarkt + ', Icecat ' + uitBron.Icecat + ', bol ' + uitBron['bol.com'] + ') | langs Icecat deze run: ' + kandidaten.length)
}

// ---- producten bij een winkel ---------------------------------------------------
// Een pagina "prijzen vergelijken" met een winkel is alleen de moeite waard als
// er meer op staat dan die ene prijs. Daarom krijgt zo'n product alleen een
// pagina als er specificaties van zijn: uit de MediaMarkt-feed, van Icecat of
// van bol. Verder: nieuw (geen tweedekans), met EAN, en EEN_VANAF euro of meer.
// Producten uit de MediaMarkt-feed gaan voor, want daar zijn de specificaties
// al binnen; daarna de duurste eerst. Had geen bron iets, dan staat dat een
// maand in EEN_STAND en vragen we het niet elke dag opnieuw.
let eenGemaakt = 0
if (EEN_MAX > 0) {
  let geen = {}
  try { geen = JSON.parse(fs.readFileSync(EEN_STAND, 'utf8')) } catch (e) { /* eerste keer */ }
  const recent = d => d && (Date.parse(vandaag) - Date.parse(d)) / 864e5 < 30
  const kand = alle.filter(x => x.o.length === 1 && x.e && x.s !== 'r' && !/^2dekansje/i.test(x.o[0].w || '') &&
    Number(x.p) >= EEN_VANAF && !stand[x.i] && !recent(geen[x.i]))
  console.log('bij een winkel: ' + kand.length + ' kandidaten vanaf ' + euro(EEN_VANAF) + ' zonder pagina')
  if (!DROOG || PROEF) {
    const mm = PROEF ? null : await mmLaad()
    const ean = x => String(x.e).replace(/^0+/, '')
    const inMm = x => (mm && mm.has(ean(x)) ? 1 : 0)
    kand.sort((a, b) => (inMm(b) - inMm(a)) || (b.p - a.p))
    let iceAan = !iceDicht
    let bolAan = !bolDicht && !PROEF && await bolLogin()
    const uitBron = { MediaMarkt: 0, Icecat: 0, 'bol.com': 0 }
    let gezocht = 0; let zonder = 0; let wachtrij = []
    const schrijf = async () => {
      if (!wachtrij.length) return
      const f = PROEF ? [] : await upsert(wachtrij.map(w => ({
        handle: w.h, actief: true,
        fields: Object.entries(w.rij.f).filter(([, val]) => val !== '').map(([key, value]) => ({ key, value }))
          .concat([{ key: 'specs', value: JSON.stringify(w.specs) }])
      })))
      const mis = new Set(f.map(t => t.split(':')[0]))
      for (const w of wachtrij) {
        if (mis.has(w.h)) { bezet.delete(w.h); continue }
        const s = { h: w.h, d: vandaag, v: w.rij.vinger, s: 1 }
        if (w.bron === 'MediaMarkt') s.m = telRijen(w.specs); else s.i = 1
        stand[w.rij.id] = s
        eenGemaakt++; uitBron[w.bron]++
        if (PROEF) console.log('  proef: ' + w.h + ' | ' + w.rij.f.prijs + ' | ' + w.bron + ' | ' + telRijen(w.specs) + ' regels | ' + w.rij.f.seo_omschrijving.slice(0, 90))
      }
      fouten.push(...f); wachtrij = []
    }
    for (const x of kand) {
      if (eenGemaakt + wachtrij.length >= EEN_MAX) break
      let specs = mm ? mmSpecs(mm.get(ean(x))) : null
      let bron = 'MediaMarkt'
      if (!specs) {
        if (gezocht >= EEN_ZOEK || (!iceAan && !bolAan)) { if (!inMm(x)) break; continue }
        gezocht++
        let r = iceAan ? await icecatSpecs(x.e) : { geen: true }
        bron = 'Icecat'
        if (r.stop) { console.error('Icecat: toegang geweigerd, verder zonder Icecat'); iceAan = false; r = { fout: 'icecat' } }
        if (r.rem) { await wacht(20000); continue }
        if (!r.specs && bolAan) {
          r = await bolSpecs(x.e); bron = 'bol.com'
          if (r.stop) { console.error('bol: toegang geweigerd, verder zonder bol'); bolAan = false; r = { fout: 'bol' } }
          if (r.rem) { await wacht(20000); continue }
        }
        if (r.geen) { geen[x.i] = vandaag; zonder++ }
        specs = r.specs || null
        await wacht(350)
      }
      if (!specs) continue
      const rij = maakRij(x)
      let h = slug(rij.naam)
      if (!h || bezet.has(h)) h = (h.slice(0, 55).replace(/-+$/, '') + '-' + String(x.e || x.i).replace(/\D/g, '')).slice(0, 70).replace(/^-+|-+$/g, '')
      if (!h || bezet.has(h)) continue
      bezet.add(h)
      wachtrij.push({ h, rij, specs, bron })
      if (wachtrij.length >= 8) await schrijf()
    }
    await schrijf()
    console.log('bij een winkel: ' + eenGemaakt + ' pagina\'s gemaakt (MediaMarkt ' + uitBron.MediaMarkt + ', Icecat ' + uitBron.Icecat + ', bol ' + uitBron['bol.com'] +
      ') | opgezocht: ' + gezocht + ', zonder specificaties: ' + zonder)
    if (!PROEF) { fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(EEN_STAND, JSON.stringify(geen)) }
  }
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
