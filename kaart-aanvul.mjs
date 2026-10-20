// Kaartzoeker BoosterScout: aanvullen na kaartzoeker.mjs (20 okt 2026).
//
// 1. Namen: Japanse en Koreaanse kaarten die geen Pokémon zijn (trainers, energie, items) houden in de data hun
//    eigen naam (リーリエ). Claude Haiku zet die om naar de officiële Engelse kaartnaam (Lillie). Eén keer per naam,
//    daarna uit de cache.
// 2. Afbeeldingen, in deze volgorde:
//    a. TCGdex (zit er al in);
//    b. pokemontcg.io voor Engelse kaarten die TCGdex niet heeft (Shiny Vault, Trainer Gallery, McDonald's...);
//    c. de Cardmarket-API (Dedicated App van het pro-account): de officiële productafbeelding per idProduct;
//    d. eBay (Browse API, eBay Partner Network): de foto van een actuele aanbieding van precies die kaart
//       (naam en nummer in de titel, nagekeken met Haiku). Op de site staat daar 'foto van aanbieding' bij.
//    Per dag een vast aantal eBay-zoekopdrachten (de dure kaarten eerst); wat niets oplevert, proberen we na 30
//    dagen opnieuw.
// Leest en schrijft data/kz/kaarten.json; cache in data/kz/aanvul-cache.json.
import fs from 'node:fs'
import crypto from 'node:crypto'
import { ebayKlaar, ebayZoek, Limiet } from './ebay-api.mjs'

const MAP = 'data/kz'
const CACHE = MAP + '/aanvul-cache.json'
const EBAY_MAX = Number(process.env.AANVUL_EBAY || 1500)
const AI = process.env.ANTHROPIC_API_KEY || ''
const MODEL = process.env.AANVUL_MODEL || 'claude-haiku-5-5'
const kz = JSON.parse(fs.readFileSync(MAP + '/kaarten.json', 'utf8'))
const ix = Object.fromEntries(kz.velden.map((v, i) => [v, i]))
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {}
cache.vertaal ||= {}; cache.ptcg ||= {}; cache.ebay ||= {}; cache.cm ||= {}
const nu = Date.now(), vandaag = new Date().toISOString().slice(0, 10)
const dagen = d => (nu - Date.parse(d || 0)) / 864e5
const setVan = new Map(kz.sets.map(s => [s[0], s]))
const azie = id => /^(jp|kr)-/.test(id)
const VREEMD = /[぀-ヿ㐀-鿿가-힯]/

async function claude (vraag, max = 4000) {
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': AI, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: max, system: 'You help a Pokémon TCG price site. Reply with one JSON object only, no explanation, no code fences.', messages: [{ role: 'user', content: vraag }] }) })
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 150))
  const d = await r.json(); const t = (d.content || []).map(c => c.text || '').join(''); const m = t.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('geen JSON')
  return JSON.parse(m[0])
}

// ---------------------------------------------------------------- 1. namen
if (AI) {
  const open = [...new Set(kz.kaarten.filter(k => azie(k[ix.id]) && VREEMD.test(k[ix.naam])).map(k => k[ix.naam]))].filter(n => !(n in cache.vertaal))
  console.log('namen te vertalen:', open.length)
  let ok = 0
  for (let i = 0; i < open.length && i < 3000; i += 120) {
    const deel = open.slice(i, i + 120)
    try {
      const j = await claude('Translate these Japanese or Korean Pokémon TCG card names into the official English card name as printed on the English release (for example リーリエ -> Lillie, ふしぎなアメ -> Rare Candy, 基本炎エネルギー -> Basic Fire Energy, ピカチュウ&ゼクロムGX -> Pikachu & Zekrom-GX). If a card was never released in English, give the usual English fan translation. Keep ex, GX, V, VMAX, VSTAR suffixes.\nReturn {"0":"English", "1":"English", ...}.\n\n' + deel.map((n, j2) => j2 + ': ' + n).join('\n'), 6000)
      deel.forEach((n, j2) => { const e = j[String(j2)]; if (typeof e === 'string' && e.trim() && !VREEMD.test(e)) { cache.vertaal[n] = e.trim(); ok++ } })
    } catch (e) { console.log('vertalen', e.message); if (/HTTP 4/.test(e.message)) break }
  }
  console.log('vertaald:', ok)
}
let vertaald = 0
for (const k of kz.kaarten) { const e = cache.vertaal[k[ix.naam]]; if (e && azie(k[ix.id])) { k[ix.naam] = e; vertaald++ } }

// ---------------------------------------------------------------- 2b. pokemontcg.io
const norm = s => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '')
const nrSleutel = nr => String(nr).toUpperCase().replace(/^([A-Z]*)0*(\d+)/, '$1$2')
const HANDMATIG = { svp: 'svp', sve: 'sve', '30th-c': 'me55c', hgssp: 'hsp', bog: 'bp', mep: 'mep', mee: 'mee' }
async function ptcg (pad) {
  for (let p = 0; p < 4; p++) {
    try { const r = await fetch('https://api.pokemontcg.io/v2/' + pad, { headers: process.env.PTCG_KEY ? { 'X-Api-Key': process.env.PTCG_KEY } : {} }); if (r.ok) return await r.json(); if (r.status === 404) return null } catch (e) {}
    await new Promise(s => setTimeout(s, 3000 * (p + 1)))
  }
  return null
}
const zonderBeeld = kz.kaarten.filter(k => !k[ix.img])
const enSets = [...new Set(zonderBeeld.filter(k => !azie(k[ix.id])).map(k => k[ix.set]))]
if (enSets.length) {
  if (!cache.ptcgSets || dagen(cache.ptcgSets.t) > 7) { const d = await ptcg('sets?pageSize=250&select=id,name,releaseDate'); if (d) cache.ptcgSets = { t: new Date().toISOString(), lijst: d.data.map(x => [x.id, x.name, x.releaseDate.replace(/\//g, '-')]) } }
  const ps = cache.ptcgSets?.lijst || []
  const opNaam = new Map(ps.map(x => [norm(x[1]), x[0]])), ptcgIds = new Set(ps.map(x => x[0]))
  for (const sid of enSets) {
    const s = setVan.get(sid); if (!s) continue
    const pid = (HANDMATIG[sid] && ptcgIds.has(HANDMATIG[sid]) && HANDMATIG[sid]) || opNaam.get(norm(s[1])) || (ptcgIds.has(sid.replace('.', '')) ? sid.replace('.', '') : null)
    if (!pid) { console.log('ptcg geen set voor', sid, s[1]); continue }
    const c = cache.ptcg[sid]
    if (c && dagen(c.t) < 30) continue
    const d = await ptcg('cards?q=set.id:' + pid + '&pageSize=250&select=number,images')
    if (d) cache.ptcg[sid] = { t: new Date().toISOString(), pid, kaarten: Object.fromEntries((d.data || []).map(x => [nrSleutel(x.number), x.images?.large || x.images?.small || ''])) }
  }
}
let viaPtcg = 0
for (const k of kz.kaarten) {
  if (k[ix.img] || azie(k[ix.id])) continue
  const u = cache.ptcg[k[ix.set]]?.kaarten?.[nrSleutel(k[ix.nr])]
  if (u) { k[ix.img] = u; viaPtcg++ }
}
console.log('beelden via pokemontcg.io:', viaPtcg)

// ---------------------------------------------------------------- 2c. Cardmarket-API (als de sleutels er zijn)
const CM = { app: process.env.CM_APP_TOKEN, appGeheim: process.env.CM_APP_SECRET, tok: process.env.CM_ACCESS_TOKEN, tokGeheim: process.env.CM_ACCESS_SECRET }
const CM_MAX = Number(process.env.AANVUL_CM || 3000)
const enc = v => encodeURIComponent(v).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
async function cmHaal (url) {
  const o = { oauth_consumer_key: CM.app, oauth_token: CM.tok, oauth_nonce: crypto.randomBytes(12).toString('hex'), oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_signature_method: 'HMAC-SHA1', oauth_version: '1.0' }
  const basis = 'GET&' + enc(url) + '&' + enc(Object.keys(o).sort().map(k => enc(k) + '=' + enc(o[k])).join('&'))
  o.oauth_signature = crypto.createHmac('sha1', enc(CM.appGeheim) + '&' + enc(CM.tokGeheim)).update(basis).digest('base64')
  const r = await fetch(url, { headers: { Authorization: 'OAuth realm="' + url + '", ' + Object.entries(o).map(([k, v]) => k + '="' + enc(v) + '"').join(', ') } })
  if (r.status === 429) throw new Limiet('cardmarket 429')
  if (r.status === 404 || r.status === 204) return null
  if (!r.ok) throw new Error('cardmarket HTTP ' + r.status)
  return r.json()
}
let viaCm = 0, cmN = 0
if (CM.app && CM.appGeheim && CM.tok && CM.tokGeheim) {
  const teDoen = kz.kaarten.filter(k => !k[ix.img] && k[ix.cm]).filter(k => { const c = cache.cm[k[ix.cm]]; return !c || (!c[0] && dagen(c[1]) > 30) })
    .sort((a, b) => ((b[ix.trend] || b[ix.trendHolo] || 0) - (a[ix.trend] || a[ix.trendHolo] || 0)))
  console.log('cardmarket: te proberen', teDoen.length)
  for (const k of teDoen.slice(0, CM_MAX)) {
    try {
      const d = await cmHaal('https://api.cardmarket.com/ws/v2.0/output.json/products/' + k[ix.cm]); cmN++
      let u = d?.product?.image || ''
      if (u.startsWith('//')) u = 'https:' + u
      else if (u.startsWith('./')) u = 'https://www.cardmarket.com/' + u.slice(2)
      cache.cm[k[ix.cm]] = [/^https:\/\//.test(u) && !/nopic|noimage/i.test(u) ? u : 0, vandaag]
    } catch (e) { console.log(e.message); if (e instanceof Limiet || /HTTP 40[13]/.test(e.message)) break }
    await new Promise(s => setTimeout(s, 150))
  }
}
for (const k of kz.kaarten) { if (k[ix.img] || !k[ix.cm]) continue; const c = cache.cm[k[ix.cm]]; if (c && c[0]) { k[ix.img] = c[0]; viaCm++ } }
console.log('beelden via Cardmarket:', viaCm, '(', cmN, 'verzoeken)')

// ---------------------------------------------------------------- 2d. eBay
const WEG = /\b(lot|bundle|proxy|custom|reprint|fake|orica|digital|choose|pick|you pick|multiple|set of|sealed|booster|empty|playmat|sleeve|binder|metal|complete set|full set|mystery)\b/i
let zoekN = 0, gevonden = 0
if (ebayKlaar()) {
  const teDoen = kz.kaarten.filter(k => !k[ix.img]).filter(k => { const c = cache.ebay[k[ix.id]]; return !c || (c[0] === 0 && dagen(c[2]) > 30) || (c[0] && dagen(c[2]) > 60) })
    .sort((a, b) => ((b[ix.trend] || b[ix.trendHolo] || 0) - (a[ix.trend] || a[ix.trendHolo] || 0)))
  console.log('eBay: zonder beeld', teDoen.length, 'nu maximaal', EBAY_MAX)
  const keuzes = []
  for (const k of teDoen.slice(0, EBAY_MAX)) {
    const s = setVan.get(k[ix.set]) || []
    const nr = String(k[ix.nr]).replace(/^0+(?=\d)/, ''), van = s[6]
    const taal = k[ix.id].startsWith('jp-') ? 'japanese' : k[ix.id].startsWith('kr-') ? 'korean' : ''
    const naam = String(k[ix.naam])
    let d
    try { d = await ebayZoek({ q: `pokemon ${naam} ${nr}${van ? '/' + van : ''} ${taal}`.trim(), category_ids: '183454', limit: '50' }, 'EBAY_US'); zoekN++ } catch (e) { if (e instanceof Limiet) { console.log(e.message); break } console.log('ebay', k[ix.id], e.message); continue }
    const eerste = naam.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).find(w => w.length > 2) || ''
    const kand = (d.itemSummaries || []).filter(i => {
      const t = String(i.title || ''), tl = t.toLowerCase()
      if (!i.image?.imageUrl || WEG.test(t)) return false
      if (!new RegExp('(^|\\D)0*' + nr.replace(/[^\w]/g, '') + '(\\D|$)', 'i').test(t)) return false
      if (eerste && !tl.includes(eerste)) return false
      if (taal === 'japanese' && !/japan|jpn|\bjp\b|日本/i.test(t)) return false
      if (taal === 'korean' && !/korea|\bkr\b|\bkor\b/i.test(t)) return false
      if (!taal && /japan|jpn|\bjp\b|korea|chinese/i.test(t)) return false
      return true
    })
    // Liefst een losse kaart (geen slab) met het setaantal in de titel.
    kand.sort((a, b) => { const sc = i => (van && new RegExp(nr + '\\s*/\\s*0*' + van).test(i.title) ? 2 : 0) + (/\b(psa|bgs|cgc|sgc|beckett|graded)\b/i.test(i.title) ? 0 : 1); return sc(b) - sc(a) })
    if (!kand.length) { cache.ebay[k[ix.id]] = [0, '', vandaag]; continue }
    keuzes.push({ k, i: kand[0], s })
  }
  // Nakijken met Haiku: is de titel echt deze kaart?
  let afgekeurd = 0
  for (let a = 0; a < keuzes.length; a += 60) {
    const deel = keuzes.slice(a, a + 60)
    let fout = new Set()
    if (AI) {
      try {
        const j = await claude('Each line is a Pokémon card we track and an eBay listing title we want to use as its photo. Which listings are NOT a single copy of exactly that card (other card, other number, other set, lot, proxy, code card, other language than stated)? If unsure, mark it wrong.\nReturn {"wrong":[indices]}.\n\n' + deel.map((x, j2) => `${j2}: CARD "${x.k[ix.naam]}" #${x.k[ix.nr]} set "${x.s[1] || ''}" | LISTING "${x.i.title}"`).join('\n'), 1500)
        fout = new Set((j.wrong || []).map(Number))
      } catch (e) { console.log('nakijken', e.message) }
    }
    deel.forEach((x, j2) => {
      if (fout.has(j2)) { cache.ebay[x.k[ix.id]] = [0, '', vandaag]; afgekeurd++; return }
      cache.ebay[x.k[ix.id]] = [String(x.i.image.imageUrl).replace(/s-l\d+\./, 's-l500.'), String(x.i.itemId || ''), vandaag]
      gevonden++
    })
  }
  console.log('eBay: zoekopdrachten', zoekN, 'foto gevonden', gevonden, 'afgekeurd door Haiku', afgekeurd)
}
let viaEbay = 0
for (const k of kz.kaarten) { if (k[ix.img]) continue; const c = cache.ebay[k[ix.id]]; if (c && c[0]) { k[ix.img] = c[0]; viaEbay++ } }

fs.writeFileSync(CACHE, JSON.stringify(cache))
fs.writeFileSync(MAP + '/kaarten.json', JSON.stringify(kz))
const zonder = kz.kaarten.filter(k => !k[ix.img]).length
console.log('klaar: namen vertaald', vertaald, '| beelden pokemontcg.io', viaPtcg, 'Cardmarket', viaCm, 'eBay', viaEbay, '| nog zonder beeld', zonder, 'van', kz.kaarten.length)
