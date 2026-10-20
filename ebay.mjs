// eBay als winkel in de productvergelijker.
//
// Draait in shop-feed.yml vlak voor shop.mjs. Zoekt per EAN op eBay naar een
// nieuw exemplaar met een vaste prijs, van een verkoper in de EU die naar
// Nederland verstuurt, en bewaart de goedkoopste (prijs plus verzending) in
// data/shop/ebay.json. shop.mjs leest dat bestand en zet eBay als winkel bij
// het product, net als bij Amazon.
//
// Waarom alleen eBay Nederland (EBAY_NL): in een proef met 120 producten vond
// eBay Duitsland niets wat eBay Nederland niet ook vond. Het zoekt over de
// grens heen, zolang de verkoper naar Nederland verstuurt.
//
// eBay staat ongeveer 5.000 zoekopdrachten per dag toe, en BoosterScout
// gebruikt er ook een deel van (tcg-feeds.mjs). Daarom per run hooguit
// EBAY_PER_RONDE producten, en in deze volgorde:
//   1. nooit nagekeken, populairste eerst;
//   2. eerder gevonden, prijs ouder dan EBAY_HERCHECK_DAGEN;
//   3. eerder niet gevonden, ouder dan EBAY_LEEG_DAGEN.
//
// Bijna alles op eBay is duurder dan in de winkel, en dat is prima: dan staat
// eBay onderaan. Prijzen ver onder de rest haalt koppel() in shop.mjs eruit.
import fs from 'fs'
import zlib from 'zlib'
import { ebayKlaar, ebayZoek, ebayAanbod, ebayLink, Limiet } from './ebay-api.mjs'

const UIT = 'data/shop/ebay.json'
const PER_RONDE = Number(process.env.EBAY_PER_RONDE || 900)
const TEGELIJK = 4
const MARKT = process.env.EBAY_MARKT || 'EBAY_NL'
const HERCHECK_DAGEN = Number(process.env.EBAY_HERCHECK_DAGEN || 2)
const LEEG_DAGEN = Number(process.env.EBAY_LEEG_DAGEN || 30)
const MAX_MINUTEN = Number(process.env.EBAY_MINUTEN || 15)
// Categorieen waar eBay vaker iets heeft (uit de proef): die gaan voor.
const VOORRANG = { gaming: 40, speelgoed: 30, randapparatuur: 15, audio: 10, telefoons: 10, kaarten: 30 }
// Wat op eBay als nieuw te koop staat maar het niet is, of geen los product.
const WEG = /refurb|gebraucht|gebruikt|\bused\b|defekt|defect|ersatzteil|onderdelen|for parts|ohne ovp|zonder doos|b-ware|vitrine|\bdemo\b|\bset of\b|\b\d+ ?x |bundle mit|nur (die |das )?(hülle|case|box)|\s\+\s|\+ ?(game|spiel|gioco|jeu|code|accessor)|accessories|accessori|zubehör|zubehoer|\binkl\.? (spiel|game)|riparazion|reparatur|repair|reparatie|\bnur\b|\bonly\b|seulement|uniquement|\bsolo\b|ladecase|charging case|boîtier|\blinks\b|\brechts\b|\bleft\b|\bright\b|droit|gauche|compatib|kompatib|ersatz|replacement|remplacement|sostituzion/i

const vandaag = () => new Date().toISOString().slice(0, 10)
const dagenOud = d => d ? (Date.now() - Date.parse(d)) / 864e5 : Infinity

function lees () {
  try { return JSON.parse(fs.readFileSync(UIT, 'utf8')) } catch (e) { return { prijs: {}, gezien: {} } }
}

// De producten van de vorige run: welke EAN's er zijn en hoe populair.
function producten () {
  const uit = []
  for (const f of fs.readdirSync('data/shop')) {
    if (!/^c-.*\.json\.gz$/.test(f) || f === 'c-alles.json.gz') continue
    let d
    try { d = JSON.parse(zlib.gunzipSync(fs.readFileSync('data/shop/' + f))) } catch (e) { continue }
    for (const p of d.p || []) {
      const ean = String(p.e || (p.i || '').replace(/^e/, ''))
      if (!/^\d{8,14}$/.test(ean) || p.s === 'r') continue
      uit.push({ ean, r: Number(p.r || 0) + (VOORRANG[p.c] || 0), n: p.n, prijs: p.p })
    }
  }
  return uit
}

async function main () {
  if (!ebayKlaar()) { console.log('eBay: geen EBAY_CLIENT_ID/EBAY_CLIENT_SECRET, overgeslagen'); return }
  const data = lees()
  data.prijs = data.prijs || {}
  // 20 okt: bestaande links opnieuw opbouwen (nieuwe partnerlink geldt dan meteen voor alles).
  for (const x of Object.values(data.prijs)) if (x && x.u) x.u = ebayLink(x.u, 'dpv-shop')
  data.gezien = data.gezien || {}

  const lijst = producten()
  const nooit = []; const gevonden = []; const leeg = []
  for (const p of lijst) {
    const g = data.gezien[p.ean]
    if (!g) nooit.push(p)
    else if (data.prijs[p.ean]) { if (dagenOud(g) >= HERCHECK_DAGEN) gevonden.push(p) }
    else if (dagenOud(g) >= LEEG_DAGEN) leeg.push(p)
  }
  const opR = (a, b) => b.r - a.r
  // Eerder gevonden gaat voor: anders wordt een eBay-prijs oud terwijl de
  // nieuwe zoektochten bijna allemaal niets opleveren (ongeveer 7 procent raak).
  const beurt = [...gevonden.sort(opR), ...nooit.sort(opR), ...leeg.sort(opR)].slice(0, PER_RONDE)
  console.log('eBay: ' + lijst.length + ' producten met EAN, nu aan de beurt ' + beurt.length +
    ' (' + gevonden.length + ' opnieuw, ' + nooit.length + ' nooit nagekeken, ' + leeg.length + ' eerder niets)')

  const eind = Date.now() + MAX_MINUTEN * 60e3
  let raak = 0; let gedaan = 0; let fouten = 0; let gestopt = ''
  let i = 0
  async function werker () {
    while (i < beurt.length && !gestopt) {
      if (Date.now() > eind) { gestopt = 'tijd op'; break }
      const p = beurt[i++]
      try {
        const d = await ebayZoek({
          gtin: p.ean,
          limit: '20',
          sort: 'price',
          filter: 'buyingOptions:{FIXED_PRICE},conditions:{NEW},deliveryCountry:NL,priceCurrency:EUR'
        }, MARKT)
        let beste = null
        for (const it of d.itemSummaries || []) {
          const a = ebayAanbod(it)
          if (!a || WEG.test(a.titel)) continue
          // Veel goedkoper dan de goedkoopste winkel: bijna altijd namaak, een
          // los onderdeel of iets anders dan de EAN belooft.
          if (p.prijs > 0 && a.totaal < p.prijs * 0.6) continue
          if (!beste || a.totaal < beste.totaal) beste = a
        }
        gedaan++
        data.gezien[p.ean] = vandaag()
        if (beste) {
          raak++
          data.prijs[p.ean] = { p: beste.prijs, vz: beste.verzend, u: ebayLink(beste.url, 'dpv-shop'), vk: beste.verkoper, land: beste.land, t: beste.titel.slice(0, 120), d: vandaag() }
        } else delete data.prijs[p.ean]
      } catch (e) {
        if (e instanceof Limiet) { gestopt = e.message; break }
        fouten++
        if (fouten <= 5) console.log('eBay ' + p.ean + ': ' + e.message)
      }
    }
  }
  await Promise.all(Array.from({ length: TEGELIJK }, werker))

  // Niet eindeloos laten groeien: wat lang niet meer nagekeken is, vergeten.
  for (const [ean, g] of Object.entries(data.gezien)) if (dagenOud(g) > 120) { delete data.gezien[ean]; delete data.prijs[ean] }
  data.gemaakt = new Date().toISOString()
  data.markt = MARKT
  fs.writeFileSync(UIT, JSON.stringify(data))
  console.log('eBay: ' + gedaan + ' nagekeken, ' + raak + ' gevonden, ' + fouten + ' fouten' + (gestopt ? ', gestopt: ' + gestopt : '') +
    '. In het bestand: ' + Object.keys(data.prijs).length + ' prijzen, ' + Object.keys(data.gezien).length + ' nagekeken')
}

main().catch(e => { console.error('eBay:', e.message); process.exit(0) })
