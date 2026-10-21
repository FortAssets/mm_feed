// eBay US-prijzen voor The Price Pickr (thepricepickr.com).
//
// Draait in us-tech.yml, los van de rest van mm_feed. Zoekt per product uit
// PRODUCTEN op eBay US naar de goedkoopste nieuwe aanbieding met vaste prijs,
// van een verkoper in de VS met goede beoordelingen, en bewaart die in
// us/tech.json op de branch us-data. De Worker van thepricepickr leest dat
// bestand via raw.githubusercontent.com en zet de kaarten server-side op de site.
//
// Prijsgeschiedenis: per product de laagste totaalprijs per dag, 120 dagen.
// Daaruit komt de "90-day low". Die is pas eerlijk na een tijdje meten; tot
// die tijd zegt de site "tracking since <datum>".
//
// eBay-quotum (ca. 5.000 per dag) delen we met ebay.mjs en tcg-feeds.mjs.
// Deze job gebruikt een paar dozijn zoekopdrachten per run, 4 runs per dag.
import fs from 'fs'
import { ebayKlaar, ebayToken, ebayLink, Limiet } from './ebay-api.mjs'

const VORIG = process.env.US_VORIG || '/tmp/tech-vorig.json'
const UIT = process.env.US_UIT || 'out/us/tech.json'

// q: zoekterm. moet: titel moet hierop passen. niet: titel mag hier niet op passen.
// msrp: adviesprijs in dollars (gecontroleerd 21 okt 2026, na de prijsverhogingen van 2026), voor de plausibiliteit (0,6x tot 1,5x) en "was".
const PRODUCTEN = [
  { id: 'airpods-pro-3', rubriek: /headphone|headset/i, naam: 'AirPods Pro 3', cat: 'Audio', q: 'Apple AirPods Pro 3rd generation', moet: /airpods pro 3|airpods pro \(3rd|airpods pro 3rd/i, niet: /pro 2|2nd gen/i, msrp: 249 },
  { id: 'airpods-5', rubriek: /headphone|headset/i, naam: 'AirPods 5', cat: 'Audio', q: 'Apple AirPods 5', moet: /airpods 5|airpods \(5th/i, niet: /pro|airpods 4/i, msrp: 129 },
  { id: 'sony-wh-1000xm6', rubriek: /headphone|headset/i, naam: 'Sony WH-1000XM6', cat: 'Audio', q: 'Sony WH-1000XM6', moet: /1000xm6/i, msrp: 449.99 },
  { id: 'bose-qc-ultra-2', rubriek: /headphone|headset/i, naam: 'Bose QuietComfort Ultra Headphones (2nd Gen)', cat: 'Audio', q: 'Bose QuietComfort Ultra Headphones 2nd Gen', moet: /quietcomfort ultra/i, niet: /earbuds/i, msrp: 449 },
  { id: 'switch-2', cid: '139971', rubriek: /video game consoles|mixed lots/i, naam: 'Nintendo Switch 2', cat: 'Gaming', q: 'Nintendo Switch 2 console', moet: /switch 2/i, niet: /\bgame only\b|controller only|pro controller|joy-?con (pair|only)|\bcase\b|dock only|amiibo/i, msrp: 499.99 },
  { id: 'ps5-pro', rubriek: /video game consoles|mixed lots/i, naam: 'PlayStation 5 Pro', cat: 'Gaming', q: 'PlayStation 5 Pro console', moet: /ps5 pro|playstation 5 pro/i, niet: /controller|stand only|disc drive|cover|faceplate|plates|thrustmaster|ps4|ps3|wheel|\brw\b|bundle of|lot/i, msrp: 899.99 },
  { id: 'xbox-series-x', cid: '139971', rubriek: /video game consoles|mixed lots/i, naam: 'Xbox Series X', cat: 'Gaming', q: 'Xbox Series X console 1TB', moet: /series x/i, niet: /controller only|stand only|series s\b|x\/s|x \/ s|x or s/i, msrp: 749.99 },
  { id: 'steam-deck-oled', cid: '139971', rubriek: /video game consoles|mixed lots/i, naam: 'Steam Deck OLED', cat: 'Gaming', q: 'Steam Deck OLED 512GB', moet: /steam deck oled/i, msrp: 789 },
  { id: 'meta-quest-3s', rubriek: /virtual reality|vr /i, naam: 'Meta Quest 3S', cat: 'Gaming', q: 'Meta Quest 3S 128GB', moet: /quest 3s/i, msrp: 349.99 },
  { id: 'apple-watch-12', rubriek: /smart ?watch/i, naam: 'Apple Watch Series 12', cat: 'Wearables', q: 'Apple Watch Series 12 GPS', moet: /series 12/i, niet: /band only|strap only/i, msrp: 399 },
  { id: 'galaxy-watch-9', rubriek: /smart ?watch/i, naam: 'Samsung Galaxy Watch 9', cat: 'Wearables', q: 'Samsung Galaxy Watch 9', moet: /galaxy watch ?9/i, niet: /classic|ultra|band only/i, msrp: 379 },
  { id: 'ipad-a16', rubriek: /tablet/i, naam: 'iPad 11" (A16)', cat: 'Tablets', q: 'Apple iPad 11th generation A16 128GB', moet: /ipad/i, niet: /air|pro|mini|case|keyboard/i, msrp: 449 },
  { id: 'ipad-air-m4', rubriek: /tablet/i, naam: 'iPad Air 11" (M4)', cat: 'Tablets', q: 'Apple iPad Air 11 M4 128GB', moet: /ipad air.*m4|m4.*ipad air/i, niet: /case|keyboard|13"|13-inch|13 inch/i, msrp: 749 },
  { id: 'macbook-air-m5', rubriek: /laptop/i, naam: 'MacBook Air 13" (M5)', cat: 'Laptops', q: 'Apple MacBook Air 13 M5 16GB 512GB', moet: /macbook air.*m5|m5.*macbook air/i, niet: /15"|15-inch|15 inch|case|skin/i, msrp: 1299 },
  { id: 'kindle-paperwhite', rubriek: /ebook|e-book|tablet/i, naam: 'Kindle Paperwhite (2024)', cat: 'E-readers', q: 'Kindle Paperwhite 2024 16GB', moet: /paperwhite/i, niet: /case|cover|signature|kids/i, msrp: 199 },
  { id: 'pixel-11-pro', cid: '9355', rubriek: /cell phones|smartphone/i, naam: 'Google Pixel 11 Pro (unlocked)', cat: 'Phones', q: 'Google Pixel 11 Pro unlocked 256GB', moet: /pixel 11 pro/i, niet: /xl|fold|case|screen/i, msrp: 1099 },
  { id: 'galaxy-s26-ultra', cid: '9355', rubriek: /cell phones|smartphone/i, naam: 'Samsung Galaxy S26 Ultra (unlocked)', cat: 'Phones', q: 'Samsung Galaxy S26 Ultra unlocked 256GB', moet: /s26 ultra/i, niet: /case|screen|protector/i, msrp: 1399.99 },
  { id: 'gopro-hero13', rubriek: /camera|camcorder/i, naam: 'GoPro HERO13 Black', cat: 'Cameras', q: 'GoPro HERO13 Black', moet: /hero ?13/i, niet: /battery only|mount only|housing/i, msrp: 399.99 },
  { id: 'dji-mini-4-pro', rubriek: /drone/i, naam: 'DJI Mini 4 Pro', cat: 'Cameras', q: 'DJI Mini 4 Pro', moet: /mini 4 pro/i, niet: /battery only|propeller|controller|remote|\brc[ -]?(2|n\d)|goggles|charging hub|for (dji )?mini/i, msrp: 759 },
  { id: 'airtag-4-pack', naam: 'Apple AirTag 2nd gen (4-pack)', cat: 'Accessories', q: 'Apple AirTag 2nd generation 4 pack', moet: /airtag/i, niet: /holder|case|keychain|cover|1 pack|single|2 pack|loop|wallet|\bjapan\b|lunar|year of|engrav|limited/i, msrp: 99 }
]

// Wat als nieuw te koop staat maar het niet is, of geen los product.
const WEG = /refurb|renewed|\bused\b|pre-?owned|open box|for parts|not working|read description|box only|empty box|\bdemo\b|display model|replacement|compatible|\bcase only\b|\bskin\b|screen protector|\bdecal\b|\blot of\b|\b\d+ ?x |\bcharging case only\b|\bleft\b.*\bonly\b|\bright\b.*\bonly\b|\bsticker\b|\bcopy\b|\bclone\b|\breplica\b|\bdummy\b|\bmanual only\b|\bbox and\b|\bshell\b|\bwheel\b|expansion card|goggles|headset only|no controllers?|very good|\bgood\b|excellent|\bfair\b|grade [abc]|\bstand\b|faceplate|\bcharger\b|\bcable\b|\bfor ps5\b|\bfor xbox\b|\bfor switch\b|japanese|japan (version|only)|\bjp\b|chinese version|hk version|asia version|condition|battery health|\d+% ?batt|unlocked.*\bgood\b/i

const vandaag = () => new Date().toISOString().slice(0, 10)

// Een oude prijs alleen bewaren als hij hooguit 3 dagen oud is en de titel nog door de huidige regels komt.
function nogGoed (oud, p) {
  if (!oud || !oud.d || Date.now() - Date.parse(oud.d) > 3 * 864e5) return null
  const t = String(oud.titel || '')
  if (WEG.test(t) || !p.moet.test(t) || (p.niet && p.niet.test(t))) return null
  return oud
}

function leesVorig () {
  try { const d = JSON.parse(fs.readFileSync(VORIG, 'utf8')); return d && d.hist ? d : { hist: {}, sinds: {} } } catch (e) { return { hist: {}, sinds: {} } }
}

async function zoek (q, prijsVan, prijsTot, cid) {
  const param = new URLSearchParams({
    ...(cid ? { category_ids: cid } : {}),
    q,
    limit: '200',
    sort: 'price',
    filter: 'buyingOptions:{FIXED_PRICE},conditions:{NEW},deliveryCountry:US,itemLocationCountry:US,priceCurrency:USD,price:[' + prijsVan + '..' + prijsTot + ']'
  })
  const u = 'https://api.ebay.com/buy/browse/v1/item_summary/search?' + param
  for (let poging = 1; poging <= 3; poging++) {
    const r = await fetch(u, {
      headers: {
        Authorization: 'Bearer ' + await ebayToken(),
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'X-EBAY-C-ENDUSERCTX': 'contextualLocation=' + encodeURIComponent('country=US,zip=10001') + ',affiliateCampaignId=5339222386,affiliateReferenceId=pricepickr',
        'Accept-Language': 'en-US'
      }
    })
    if (r.status === 429) {
      if (poging === 3) throw new Limiet('eBay: te veel verzoeken (429)')
      await new Promise(s => setTimeout(s, 3000 * poging))
      continue
    }
    const d = await r.json().catch(() => ({}))
    if (!r.ok) {
      const fout = (d.errors && d.errors[0]) || {}
      if (/limit|quota/i.test(fout.message || '')) throw new Limiet('eBay: ' + fout.message)
      if (r.status >= 500 && poging < 3) { await new Promise(s => setTimeout(s, 2000 * poging)); continue }
      throw new Error('eBay HTTP ' + r.status + ' ' + (fout.message || ''))
    }
    return d
  }
}

function aanbod (i, p, waarom = {}) {
  const titel = String(i.title || '')
  const nee = r => { waarom[r] = (waarom[r] || 0) + 1; return null }
  const rub = (i.categories || []).map(c => c.categoryName || '').join(' | ')
  if (p.rubriek && !p.rubriek.test(rub)) return nee('rubriek')
  if (!p.moet.test(titel) || (p.niet && p.niet.test(titel))) return nee('titel')
  if (WEG.test(titel)) return nee('weg')
  const v = i.seller || {}
  const pct = Number(v.feedbackPercentage || 0)
  const score = Number(v.feedbackScore || 0)
  if (pct < 98 || score < 100) return nee('verkoper')
  if (!i.price || i.price.currency !== 'USD') return nee('valuta')
  const prijs = Number(i.price.value)
  const zo = (i.shippingOptions || [])[0]
  const vz = zo && zo.shippingCost && zo.shippingCost.value != null ? Number(zo.shippingCost.value) : null
  if (!(prijs > 0) || vz == null || isNaN(vz)) return nee('verzending')
  const totaal = Math.round((prijs + vz) * 100) / 100
  if (totaal < p.msrp * 0.6 || totaal > p.msrp * 1.5) return nee('prijs')
  return {
    prijs: Math.round(prijs * 100) / 100,
    vz: Math.round(vz * 100) / 100,
    totaal,
    titel: titel.slice(0, 140),
    vk: String(v.username || ''),
    pct,
    score,
    url: ebayLink(String(i.itemWebUrl || ''), 'pricepickr'),
    im: ((i.image && i.image.imageUrl) || ((i.thumbnailImages || [])[0] || {}).imageUrl || '').replace(/^http:/, 'https:')
  }
}

async function main () {
  fs.mkdirSync(UIT.replace(/\/[^/]+$/, ''), { recursive: true })
  const vorig = leesVorig()
  const hist = vorig.hist || {}
  const sinds = vorig.sinds || {}
  const oudItems = new Map((vorig.items || []).map(x => [x.id, x]))
  if (!ebayKlaar()) {
    console.log('eBay: geen EBAY_CLIENT_ID/EBAY_CLIENT_SECRET, vorige data blijft staan')
    fs.writeFileSync(UIT, JSON.stringify(vorig.items ? vorig : { gemaakt: new Date().toISOString(), items: [], hist, sinds }))
    return
  }
  const dag = vandaag()
  const items = []
  let gestopt = ''
  for (const p of PRODUCTEN) {
    if (gestopt) { { const o = nogGoed(oudItems.get(p.id), p); if (o) items.push(o) }; continue }
    try {
      const d = await zoek(p.q, Math.floor(p.msrp * 0.6), Math.ceil(p.msrp * 1.5), p.cid)
      const waarom = {}
      const goed = (d.itemSummaries || []).map(i => aanbod(i, p, waarom)).filter(Boolean).sort((a, b) => a.totaal - b.totaal)
      if (!goed.length) {
        console.log(p.id + ': niets bruikbaars (' + (d.total || 0) + ' resultaten) ' + JSON.stringify(waarom))
        for (const i of (d.itemSummaries || []).slice(0, 4)) console.log('   - ' + String(i.title).slice(0, 80) + ' [' + (i.categories || []).map(c => c.categoryName).join('/') + ']')
        { const o = nogGoed(oudItems.get(p.id), p); if (o) items.push(o) }
        continue
      }
      const b = goed[0]
      const h = hist[p.id] = hist[p.id] || {}
      h[dag] = h[dag] == null ? b.totaal : Math.min(h[dag], b.totaal)
      if (!sinds[p.id]) sinds[p.id] = dag
      // Laagste in 90 dagen, alleen over dagen die we echt gemeten hebben.
      const grens = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
      let low = null; let lowDag = null
      for (const [k, v] of Object.entries(h)) if (k >= grens && (low == null || v < low)) { low = v; lowDag = k }
      items.push({ id: p.id, naam: p.naam, cat: p.cat, msrp: p.msrp, ...b, n: goed.length, low90: low, low90dag: lowDag, sinds: sinds[p.id], d: new Date().toISOString() })
      console.log(p.id + ': $' + b.totaal + ' (' + goed.length + ' bruikbaar van ' + (d.itemSummaries || []).length + ') ' + b.titel.slice(0, 70) + ' ' + JSON.stringify(waarom))
    } catch (e) {
      if (e instanceof Limiet) { gestopt = e.message; console.log('gestopt: ' + e.message) } else console.log(p.id + ': ' + e.message)
      { const o = nogGoed(oudItems.get(p.id), p); if (o) items.push(o) }
    }
  }
  // Geschiedenis niet eindeloos laten groeien.
  const oud = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10)
  for (const h of Object.values(hist)) for (const k of Object.keys(h)) if (k < oud) delete h[k]
  if (!items.length && vorig.items && vorig.items.length) { console.log('Niets gevonden: vorige data blijft staan'); fs.writeFileSync(UIT, JSON.stringify(vorig)); return }
  fs.writeFileSync(UIT, JSON.stringify({ gemaakt: new Date().toISOString(), markt: 'EBAY_US', items, hist, sinds }))
  console.log('Klaar: ' + items.length + ' van ' + PRODUCTEN.length + ' producten met een prijs')
}

main().catch(e => { console.error('us-tech:', e.message); process.exit(1) })
