// Pokémon-producten uit de partnerfeeds voor BoosterScout.
// Draait via .github/workflows/tcg-feeds.yml, elk kwartier. Schrijft data/tcg/feeds.json (de workflow zet die op de branch tcg-data),
// dat de voorraadworker van BoosterScout elke 5 minuten leest.
//
// Waarom hier en niet in de worker: Tradedoubler (MediaMarkt) weigert Cloudflare-IP's,
// en de Awin-feed (Coolblue, Top1Toys, ...) is te groot voor een worker.
//
// MediaMarkt: elke run, via de producten-API met een zoekvraag (licht).
// Awin: hooguit elke 4 uur, want dat is de volledige feed.
import fs from 'fs'
import zlib from 'zlib'

const MM_TOKEN = process.env.MM_TOKEN || ''
const AWIN_KEY = process.env.AWIN_KEY || ''
const UIT = 'data/tcg/feeds.json'
const AWIN_CACHE = 'data/tcg/awin.json'

// De Awin-instellingen staan al in shop.mjs; die lezen we, zodat er één lijst blijft.
const SHOP = fs.readFileSync('shop.mjs', 'utf8')
const AWIN_FIDS = (SHOP.match(/const AWIN_FIDS = '([^']+)'/) || [])[1] || ''
const AWIN_KOLOMMEN = (SHOP.match(/const AWIN_KOLOMMEN = '([^']+)'/) || [])[1] || ''

// Sealed Pokémon: wel boosters, boxen, displays, bundels, blisters, tins en collecties;
// geen sleeves, mappen, knuffels of losse kaarten.
const IS_TCG = n => /pok[eé]mon/i.test(n) && /booster|elite trainer|top.?trainer|display|bundle|blister|\btin\b|collection|build ?& ?battle|\betb\b|premium|deck/i.test(n) &&
  !/sleeve|binder|map\b|portfolio|knuffel|pluche|plush|figuur|figure|kostuum|puzzel|lego|switch|nintendo|game\b|videogame|deck ?box|speelmat|playmat/i.test(n)
const num = v => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(x) ? 0 : x }

async function mediamarkt () {
  if (!MM_TOKEN) { console.log('MediaMarkt: geen MM_TOKEN'); return [] }
  const uit = []; const gezien = new Set()
  for (const q of ['pokemon', 'pokémon']) {
    for (let p = 1; p <= 10; p++) {
      const url = 'https://api.tradedoubler.com/1.0/products.json;q=' + encodeURIComponent(q) + ';page=' + p + ';pageSize=100?token=' + MM_TOKEN
      let d = null
      for (let poging = 1; poging <= 3 && !d; poging++) {
        try {
          const r = await fetch(url, { headers: { 'User-Agent': 'dpv-feed-bot/1.0', Accept: 'application/json' } })
          if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 1500 * poging)); continue }
          if (!r.ok) { console.log('MediaMarkt HTTP', r.status); break }
          d = await r.json()
        } catch (e) { await new Promise(s => setTimeout(s, 1500 * poging)) }
      }
      const ps = (d && d.products) || []
      for (const x of ps) {
        const a = (x.offers || [])[0]; if (!a) continue
        const naam = String(x.name || '').trim(); if (!IS_TCG(naam)) continue
        if (!/media ?markt|saturn/i.test(a.programName || '')) continue
        let prijs = 0; try { prijs = num(a.priceHistory[0].price.value) } catch (e) {}
        if (!(prijs > 0)) continue
        const ean = (x.identifiers && x.identifiers.ean) || ''
        const id = /^\d{8,14}$/.test(ean) ? ean : 'mm:' + (a.id || x.name)
        if (gezien.has(id)) continue; gezien.add(id)
        const f = {}; for (const v of (x.fields || [])) if (v && v.name != null) f[v.name] = v.value
        uit.push({ w: 'MediaMarkt', id, naam, prijs, voorraad: /voorraad|beschikbaar|in stock|available/i.test(a.availability || f.in_stock || '') ? 1 : 0, url: a.productUrl || '', im: f.image_link || (x.productImage && x.productImage.url) || '', verzend: num(a.shippingCost) || null })
      }
      if (ps.length < 100) break
    }
  }
  console.log('MediaMarkt:', uit.length, 'Pokémon-producten')
  return uit
}

function csv (text) {
  const rows = []; let f = ''; let row = []; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(f); f = '' }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = '' }
    else if (c !== '\r') f += c
  }
  if (f || row.length) { row.push(f); rows.push(row) }
  return rows
}

async function awin () {
  // De volledige feed hooguit elke 4 uur; daartussen de vorige uitkomst.
  try { const c = JSON.parse(fs.readFileSync(AWIN_CACHE, 'utf8')); if (Date.now() - Date.parse(c.gemaakt) < 4 * 3600e3) { console.log('Awin: uit cache,', c.items.length); return c.items } } catch (e) {}
  if (!AWIN_KEY || !AWIN_FIDS) { console.log('Awin: geen AWIN_KEY'); return [] }
  const url = 'https://productdata.awin.com/datafeed/download/apikey/' + AWIN_KEY + '/language/nl/fid/' + AWIN_FIDS + '/rid/0/hasEnhancedFeeds/0/columns/' + AWIN_KOLOMMEN + '/format/csv/delimiter/%2C/compression/gzip/adultcontent/1/'
  const r = await fetch(url, { headers: { 'User-Agent': 'dpv-feed-bot/1.0' } })
  if (!r.ok) { console.log('Awin HTTP', r.status); return [] }
  const rows = csv(zlib.gunzipSync(Buffer.from(await r.arrayBuffer())).toString('utf8'))
  const h = rows[0]; const uit = []
  const k = n => h.indexOf(n)
  for (let i = 1; i < rows.length; i++) {
    const v = rows[i]; const naam = (v[k('product_name')] || '').trim()
    if (!IS_TCG(naam)) continue
    const prijs = num(v[k('search_price')]); if (!(prijs > 0)) continue
    const w = (v[k('merchant_name')] || '').replace(/[\s-]+(NL|NL-BE|BE|NL\/BE)$/i, '').replace(/[\s-]+$/, '').trim()
    if (/second.?chance|tweede.?kans|refurb/i.test((v[k('product_type')] || '') + ' ' + (v[k('merchant_category')] || ''))) continue
    const ean = (v[k('ean')] || '').trim()
    uit.push({ w, id: /^\d{8,14}$/.test(ean) ? ean : 'aw:' + (v[k('aw_deep_link')] || naam).slice(-40), naam, prijs, voorraad: /^(1|true|yes|ja|in stock)$/i.test(v[k('in_stock')] || '') ? 1 : 0, url: (v[k('aw_deep_link')] || '').trim(), im: (v[k('merchant_image_url')] || '').trim(), verzend: num(v[k('delivery_cost')]) || null })
  }
  fs.mkdirSync('data/tcg', { recursive: true })
  fs.writeFileSync(AWIN_CACHE, JSON.stringify({ gemaakt: new Date().toISOString(), items: uit }))
  console.log('Awin:', uit.length, 'Pokémon-producten bij', [...new Set(uit.map(x => x.w))].join(', '))
  return uit
}

const items = [...await mediamarkt(), ...await awin()]
fs.mkdirSync('data/tcg', { recursive: true })
// Alleen wegschrijven als er iets veranderd is aan de producten, zodat niet elke run een commit wordt.
let oud = null; try { oud = JSON.parse(fs.readFileSync(UIT, 'utf8')) } catch (e) {}
const zelfde = oud && JSON.stringify(oud.items) === JSON.stringify(items) && Date.now() - Date.parse(oud.gemaakt) < 3 * 3600e3
if (!zelfde) fs.writeFileSync(UIT, JSON.stringify({ gemaakt: new Date().toISOString(), items }))
console.log('klaar:', items.length, 'producten', zelfde ? '(ongewijzigd)' : '(weggeschreven)')
