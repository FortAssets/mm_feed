// Amazon-links omzetten naar een ASIN-koppeling
//
// Je genereert bij Amazon een link met SiteStripe. Die ziet er zo uit:
//
//   https://amzn.to/4AJCSvn
//   https://www.amazon.nl/NINTENDO-SWITCH-10015151-Nintendo-Switch/dp/B0F2J4SYJ2?tag=fortassets-21&linkCode=as4&ref_=onb_gen_lnk
//
// Het enige dat telt is het ASIN (B0F2J4SYJ2) en bij welk product van ons dat
// hoort. Het ASIN is niet uit een EAN te berekenen en staat ook niet op de
// Amazon-pagina als EAN, dus die koppeling moet een keer met de hand gelegd
// worden. Daarna staat hij in data/shop/amazon.json en hoef je er nooit meer
// naar te kijken.
//
// Dit script doet het werk eromheen: het volgt de verkorte link, haalt het ASIN
// en de titel eruit, zoekt in de gebouwde categoriebestanden welk product dat
// kan zijn, en schrijft de koppeling weg.
//
//   node amazon.mjs https://amzn.to/4AJCSvn
//   node amazon.mjs https://amzn.to/4AJCSvn --ean=0045496321444
//   node amazon.mjs --lijst
//
// Zonder --ean zoekt hij zelf. Vindt hij er precies een, dan schrijft hij die
// weg. Vindt hij meer, dan zet hij de kandidaten met hun EAN op het scherm en
// kies je met --ean. Zo komt er nooit een gokje in het bestand.

import fs from 'fs'
import zlib from 'zlib'
import { execFileSync } from 'child_process'

const UIT = 'data/shop'
const LIJST = UIT + '/amazon.json'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Safari/605.1.15'

// Amazon geeft een kale fetch een 503. Met deze koppen niet. Geen
// Accept-Encoding erbij zetten: dan stuurt hij brotli terug en levert fetch
// bytes op die niemand uitpakt, en lijkt de pagina leeg (2 kB in plaats van
// 340 kB).
const KOP = {
  'User-Agent': UA,
  'Accept-Language': 'nl-NL,nl;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Upgrade-Insecure-Requests': '1'
}

function lees () {
  try { return JSON.parse(fs.readFileSync(LIJST, 'utf8')) } catch (e) {
    return { uitleg: 'ASIN per EAN. Vul bij met: node amazon.mjs <link>', label: 'fortassets-21', ean: {} }
  }
}

function schrijf (d) {
  fs.writeFileSync(LIJST, JSON.stringify(d, null, 2) + '\n')
}

// Het ASIN uit een link halen. Een amzn.to-link is een 301 naar de echte url,
// dus die eerst volgen. Niet met redirect follow: het antwoord zelf hebben we
// niet nodig, alleen de locatie.
async function asinUit (link) {
  let url = link
  if (/amzn\.(to|eu)\//.test(url)) {
    const r = await fetch(url, { redirect: 'manual', headers: KOP })
    const l = r.headers.get('location')
    if (!l) throw new Error('verkorte link gaf geen doorverwijzing: ' + link)
    url = l
  }
  const m = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/.exec(url)
  if (!m) throw new Error('geen ASIN in ' + url.slice(0, 90))
  const label = (/[?&]tag=([^&]+)/.exec(url) || [])[1] || ''
  // De naamslak voor het /dp/ is wat Amazon zelf als titel gebruikt. Met de
  // streepjes eruit is dat een bruikbare zoekterm.
  const slak = (/amazon\.[a-z.]+\/([^/]+)\/dp\//.exec(url) || [])[1] || ''
  const titel = decodeURIComponent(slak).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return { asin: m[1], label, titel, url }
}

// Welk product van ons kan dit zijn? Zoeken op de woorden uit de Amazon-titel
// die ergens in onze productnaam voorkomen. Alleen producten met een EAN, want
// zonder EAN is er niets om de koppeling aan vast te maken.
function zoekProduct (titel, alleWoorden) {
  const woorden = titel.toLowerCase().split(/[^a-z0-9]+/i)
    .filter(w => w.length >= 2 && !/^(the|voor|met|van|edition|gb|tb)$/.test(w))
  if (!woorden.length) return []
  const treffers = []
  for (const f of fs.readdirSync(UIT).filter(x => x.startsWith('c-') && x.endsWith('.json.gz'))) {
    const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(UIT + '/' + f)).toString('utf8'))
    for (const p of d.p) {
      if (!p.e || p.s === 'r') continue
      const n = (p.n || '').toLowerCase()
      let raak = 0
      for (const w of woorden) if (n.includes(w)) raak++
      // Met --zoek moet elk woord erin staan. Dat is de bedoeling van een
      // eigen zoekterm: jij weet welk product het is, de lijst mag kort zijn.
      if (alleWoorden ? raak < woorden.length : raak < Math.min(2, woorden.length)) continue
      treffers.push({ score: raak / woorden.length, ean: p.e, naam: p.n, prijs: p.p, cat: p.c, winkels: p.o.length })
    }
  }
  // Bij gelijke score de kortste naam eerst: "Nintendo Switch 2 - Zwart" is
  // eerder het apparaat zelf dan "Nintendo Switch 2 + Mario Kart World + hoes".
  treffers.sort((a, b) => b.score - a.score || a.naam.length - b.naam.length || b.winkels - a.winkels)
  const perEan = new Map()
  for (const t of treffers) if (!perEan.has(t.ean)) perEan.set(t.ean, t)
  return [...perEan.values()].slice(0, 30)
}

// De zekere weg. Amazon neemt een EAN als zoekterm aan, en geeft dan het
// product terug waar dat EAN bij hoort. Dus: van onze kandidaten elk EAN daar
// opzoeken en kijken welke dit ASIN oplevert. Dat is geen naamvergelijking
// maar een bevestiging, en daarom mag het resultaat zonder navragen het
// bestand in.
//
// Dit werkt niet altijd: 0045496337414 (de Switch 2 zoals Coolblue hem in de
// feed zet) levert bij Amazon niets op, terwijl 0045496321444 wel bij
// B0F2J4SYJ2 uitkomt. Twee EAN's voor hetzelfde apparaat. Vindt hij niets, dan
// vraagt hij het gewoon.
// Amazon geeft de fetch van Node een 503 en curl niet; dat zit in de manier
// waarop de verbinding wordt opgezet, niet in de koppen. Dus curl.
function haalPagina (url) {
  try {
    return execFileSync('curl', ['-s', '--compressed', '--max-time', '30', '-A', UA,
      '-H', 'Accept-Language: nl-NL,nl;q=0.9', url], { maxBuffer: 20 * 1024 * 1024 }).toString('utf8')
  } catch (e) { return '' }
}

// Wat geeft Amazon terug als je op een EAN zoekt? Alleen de gewone
// resultaten tellen, geen gesponsorde: die staan er los van je zoekterm.
// Antwoord: lijst van { asin, titel }, of null als de pagina niet kwam.
function zoekOpEan (ean) {
  const t = haalPagina('https://www.amazon.nl/s?k=' + encodeURIComponent(ean))
  if (t.length < 20000) return null
  const uit = []
  for (const b of t.split('data-component-type="s-search-result"').slice(1)) {
    if (/Gesponsord|Sponsored/.test(b.slice(0, 8000))) continue
    const a = /\/dp\/([A-Z0-9]{10})/.exec(b)
    if (!a || uit.some(x => x.asin === a[1])) continue
    const ti = /<h2[^>]*aria-label="([^"]{3,200})/.exec(b)
    uit.push({ asin: a[1], titel: ti ? ti[1].replace(/&[a-z#0-9]+;/g, ' ') : '' })
  }
  return uit
}

async function bevestigViaEan (asin, kandidaten) {
  for (const k of kandidaten) {
    const r = zoekOpEan(k.ean)
    if (r && r.some(x => x.asin === asin)) return [k]
    await new Promise(s => setTimeout(s, 2500))
  }
  return []
}

// Prijs en verkoper van een productpagina. Dezelfde regel als bij bol: een
// prijs zonder bekende verkoper telt niet. Amazon zet onder "Verzender /
// Verkoper" wie het verkoopt; is dat Amazon zelf, dan staat er Amazon, en bij
// een marktplaatsverkoper staat daar de naam van die verkoper.
function leesProduct (html) {
  if (!html || html.length < 50000) return null
  if (!/id="buybox"/.test(html)) return { fout: 'geen koopblok' }
  // De prijs staat op meer dan een plek, en niet elke bezoeker krijgt dezelfde
  // opmaak. Eerst het getal uit de paginagegevens, anders het prijsblok zelf.
  let pr = /"priceAmount":\s*([\d.]+)/.exec(html)
  if (!pr) {
    const k = html.indexOf('id="corePrice')
    const blok = k > -1 ? html.slice(k, k + 4000) : ''
    const m = /a-price-whole">([\d.]+)[\s\S]{0,200}?a-price-fraction">(\d{2})/.exec(blok)
    if (m) pr = [0, m[1].replace(/\./g, '') + '.' + m[2]]
  }
  if (!pr || !(+pr[1] > 0)) return { fout: 'geen prijs' }
  const i = html.indexOf('odf-feature-text-desktop-merchant-info')
  if (i < 0) return { fout: 'geen verkoper' }
  const blok = html.slice(i, i + 2500)
  const vk = (/id="sellerProfileTriggerId"[^>]*>([^<]{1,80})</.exec(blok) ||
    /offer-display-feature-text-message">([^<]{1,80})</.exec(blok) || [])[1]
  if (!vk) return { fout: 'geen verkoper' }
  const verkoper = vk.replace(/&amp;/g, '&').trim()
  // Tweedehands via het koopblok komt voor; die prijs hoort niet tussen nieuw.
  if (/id="usedBuySection"/.test(html) && !/id="newAccordionRow/.test(html) && /Tweedehands|Gebruikt/.test(html.slice(i - 6000, i))) {
    return { fout: 'alleen tweedehands' }
  }
  return { prijs: +pr[1], verkoper, eigen: /^amazon(\.nl)?$/i.test(verkoper) }
}

// De prijs van elk gekoppeld product ophalen, langst geleden eerst.
// Rustig aan: een pagina per vijf tot negen seconden, en stoppen zodra Amazon
// drie keer achter elkaar geen pagina geeft. Er zit geen omweg in voor een
// blokkade, en dat is expres.
async function prijsRonde (d, aantal) {
  d.prijs = d.prijs || {}
  const vandaag = new Date().toISOString().slice(0, 10)
  const lijst = Object.keys(d.ean)
    .sort((a, b) => String((d.prijs[a] || {}).d || '').localeCompare(String((d.prijs[b] || {}).d || '')))
    .slice(0, aantal)
  let ok = 0; let dicht = 0; let weg = 0
  for (const ean of lijst) {
    const r = leesProduct(haalPagina('https://www.amazon.nl/dp/' + d.ean[ean]))
    if (r === null) {
      dicht++
      if (dicht >= 3) { console.log('  Amazon geeft geen pagina meer, hier stoppen.'); break }
      await new Promise(s => setTimeout(s, 20000))
      continue
    }
    dicht = 0
    // Een mislukte lezing gooit de vorige prijs niet weg; die verloopt vanzelf.
    if (r.fout) { weg++; console.log('  ' + ean + ' ' + d.ean[ean] + ': ' + r.fout) } else {
      d.prijs[ean] = { p: r.prijs, d: vandaag, vk: r.verkoper, eigen: r.eigen }
      ok++
      console.log('  ' + ean + ' ' + d.ean[ean] + '  EUR ' + r.prijs + '  ' + (r.eigen ? 'Amazon' : 'partner: ' + r.verkoper))
    }
    schrijf(d)
    await new Promise(s => setTimeout(s, 5000 + Math.random() * 4000))
  }
  console.log('prijs gelezen ' + ok + ', zonder bruikbare prijs ' + weg + ', van ' + lijst.length)
}

// Lijkt de titel van Amazon op onze naam? Een EAN dat bij Amazon aan het
// verkeerde product hangt komt voor, dus een tweede controle: minstens twee
// woorden gemeen, of het merk.
function lijktOp (onze, merk, hunne) {
  const w = x => new Set(String(x).toLowerCase().split(/[^a-z0-9]+/).filter(y => y.length >= 3))
  const a = w(onze); const b = w(hunne)
  let n = 0
  for (const x of a) if (b.has(x)) n++
  return n >= 2 || (merk && b.has(String(merk).toLowerCase()) && n >= 1)
}

// Producten uit de vergelijker bij Amazon opzoeken. Eerst wat het meeste
// oplevert: wat al bij meer winkels ligt, en daarbinnen het duurste.
// Een koppeling komt er alleen als Amazon precies een gewoon resultaat geeft
// en de titel op de onze lijkt. Twijfel is overslaan.
async function matchRonde (d, aantal, cat) {
  d.geen = d.geen || {}
  const lijst = []
  for (const f of fs.readdirSync(UIT).filter(x => x.startsWith('c-') && x.endsWith('.json.gz'))) {
    if (cat && f !== 'c-' + cat + '.json.gz') continue
    const c = JSON.parse(zlib.gunzipSync(fs.readFileSync(UIT + '/' + f)).toString('utf8'))
    for (const p of c.p) {
      if (!p.e || p.s === 'r' || d.ean[p.e] || d.geen[p.e]) continue
      if (p.o.length < 2 && p.p < 150) continue
      lijst.push(p)
    }
  }
  lijst.sort((a, b) => b.o.length - a.o.length || b.p - a.p)
  console.log(lijst.length + ' producten zonder koppeling, deze ronde ' + Math.min(aantal, lijst.length))
  let raak = 0; let mis = 0; let twijfel = 0; let dicht = 0
  const vandaag = new Date().toISOString().slice(0, 10)
  for (const p of lijst.slice(0, aantal)) {
    const r = zoekOpEan(p.e)
    if (r === null) {
      dicht++
      if (dicht >= 3) { console.log('  Amazon geeft geen pagina meer, hier stoppen.'); break }
      await new Promise(s => setTimeout(s, 15000))
      continue
    }
    dicht = 0
    if (!r.length) { mis++; d.geen[p.e] = vandaag }
    else if (r.length === 1 && lijktOp(p.n, p.b, r[0].titel)) {
      d.ean[p.e] = r[0].asin; raak++
      console.log('  ' + p.e + ' ' + r[0].asin + '  ' + p.n.slice(0, 44) + '  <->  ' + r[0].titel.slice(0, 44))
    } else { twijfel++; d.geen[p.e] = vandaag }
    schrijf(d)
    await new Promise(s => setTimeout(s, 3500 + Math.random() * 2500))
  }
  console.log('gekoppeld ' + raak + ', niet bij Amazon ' + mis + ', twijfel overgeslagen ' + twijfel)
}

async function main () {
  const args = process.argv.slice(2)
  const d = lees()

  if (args.includes('--lijst') || !args.length) {
    d.prijs = d.prijs || {}
    const n = Object.keys(d.ean || {}).length
    console.log('Partnerlabel: ' + (d.label || '(geen)'))
    console.log(n + ' koppelingen in ' + LIJST)
    for (const [ean, asin] of Object.entries(d.ean || {})) console.log('  ' + ean + '  ' + asin + (d.prijs[ean] ? '  EUR ' + d.prijs[ean].p + ' gezien ' + d.prijs[ean].d : ''))
    if (!args.length) console.log('\nGebruik: node amazon.mjs <link> [--ean=<ean>]')
    return
  }

  // Wat krijgt deze computer eigenlijk van Amazon? Zet de feiten op een rij
  // en bewaart de pagina, zodat je kunt zien waarom er geen prijs uitkomt.
  //   node amazon.mjs --debug=B0FN7ZG39D
  const dbg = (args.find(a => a.startsWith('--debug=')) || '').slice(8)
  if (dbg) {
    const h = haalPagina('https://www.amazon.nl/dp/' + dbg)
    fs.writeFileSync('amazon-debug.html', h)
    const heeft = (re) => re.test(h) ? 'ja' : 'nee'
    console.log('grootte        ' + h.length)
    console.log('titel          ' + ((/<title>([^<]{0,90})/.exec(h) || [])[1] || '(geen)').trim())
    console.log('koopblok       ' + heeft(/id="buybox"/))
    console.log('priceAmount    ' + heeft(/"priceAmount"/))
    console.log('prijsblok      ' + heeft(/id="corePrice/))
    console.log('verkoperblok   ' + heeft(/odf-feature-text-desktop-merchant-info/))
    console.log('niet leverbaar ' + heeft(/id="outOfStock"|Momenteel niet verkrijgbaar|Currently unavailable/))
    console.log('bezorgadres    ' + ((/id="glow-ingress-line2"[^>]*>\s*([^<]{0,60})/.exec(h) || [])[1] || '(onbekend)').trim())
    console.log('robotcontrole  ' + heeft(/captcha|Geef de tekens|not a robot/i))
    console.log('uitkomst       ' + JSON.stringify(leesProduct(h)))
    console.log('pagina bewaard in amazon-debug.html')
    return
  }

  const proef = (args.find(a => a.startsWith('--proef=')) || '').slice(8)
  if (proef) { console.log(leesProduct(fs.readFileSync(proef, 'utf8'))); return }

  const pz = args.find(a => a === '--prijzen' || a.startsWith('--prijzen='))
  if (pz) {
    await prijsRonde(d, Number(pz.split('=')[1]) || 200)
    schrijf(d)
    if (!args.some(a => a.startsWith('--match='))) return
  }

  const m = args.find(a => a.startsWith('--match='))
  if (m) {
    const cat = (args.find(a => a.startsWith('--cat=')) || '').slice(6)
    await matchRonde(d, Number(m.slice(8)) || 40, cat)
    schrijf(d)
    console.log(Object.keys(d.ean).length + ' koppelingen in ' + LIJST)
    return
  }

  // Een prijs die jij bij Amazon hebt afgelezen. Met de datum erbij, want hij
  // staat alleen op de pagina zolang hij vers is.
  //   node amazon.mjs --ean=0711719020837 --prijs=675
  const prijs = Number((args.find(a => a.startsWith('--prijs=')) || '').slice(8).replace(',', '.')) || 0
  const eanArg = (args.find(a => a.startsWith('--ean=')) || '').slice(6)
  if (prijs && eanArg && !args.some(a => /^https?:/.test(a))) {
    if (!d.ean[eanArg]) throw new Error('voor EAN ' + eanArg + ' is nog geen ASIN bekend, koppel eerst de link')
    d.prijs = d.prijs || {}
    d.prijs[eanArg] = { p: prijs, d: new Date().toISOString().slice(0, 10) }
    schrijf(d)
    console.log('prijs ' + prijs + ' bij ' + eanArg + ' gezet, gezien op ' + d.prijs[eanArg].d)
    return
  }

  const vast = (args.find(a => a.startsWith('--ean=')) || '').slice(6)
  const zoek = (args.find(a => a.startsWith('--zoek=')) || '').slice(7).replace(/^["']|["']$/g, '')
  const kies = Number((args.find(a => a.startsWith('--kies=')) || '').slice(7)) || 0
  const links = args.filter(a => /^https?:\/\//.test(a))
  if (!links.length) throw new Error('geen link meegegeven')

  for (const link of links) {
    const a = await asinUit(link)
    console.log('\n' + a.asin + '  ' + (a.titel || '(geen titel in de link)'))
    if (a.label && d.label && a.label !== d.label) {
      console.log('  let op: deze link draagt het label ' + a.label + ' en niet ' + d.label)
    }
    if (vast) {
      d.ean[vast] = a.asin
      console.log('  gekoppeld aan EAN ' + vast)
      continue
    }
    const k = zoek ? zoekProduct(zoek, true) : zoekProduct(a.titel)
    if (!k.length) {
      console.log('  geen product gevonden. Geef het EAN met --ean=<ean>, of zoek met --zoek="<woorden>".')
      continue
    }
    if (kies) {
      const t = k[kies - 1]
      if (!t) { console.log('  er is geen kandidaat ' + kies + ', er zijn er ' + k.length); continue }
      d.ean[t.ean] = a.asin
      console.log('  gekoppeld aan ' + t.ean + '  ' + t.naam.slice(0, 60))
      continue
    }
    if (k.length === 1) {
      d.ean[k[0].ean] = a.asin
      console.log('  gekoppeld aan ' + k[0].ean + '  ' + k[0].naam.slice(0, 60))
      continue
    }
    // Amazon zelf kan het bevestigen: een EAN als zoekterm geeft het product
    // waar dat EAN bij hoort. Alleen leunt dat op hun zoekpagina, en die geeft
    // na een paar verzoeken een 503. Lukt het niet, dan kies jij; dit is een
    // extraatje en nooit een blokkade.
    console.log('  ' + k.length + ' kandidaten, eerst bij Amazon nakijken welk EAN dit ASIN geeft...')
    const zeker = await bevestigViaEan(a.asin, k.slice(0, 6))
    if (zeker.length === 1) {
      d.ean[zeker[0].ean] = a.asin
      console.log('  bevestigd en gekoppeld aan ' + zeker[0].ean + '  ' + zeker[0].naam.slice(0, 60))
      continue
    }
    console.log('  Amazon gaf geen uitsluitsel. Kies met --kies=<nummer> of --ean=<ean>:')
    k.slice(0, 12).forEach((t, i) => {
      console.log('    ' + String(i + 1).padStart(2) + '  ' + t.ean + '  EUR ' +
        String(t.prijs).padStart(7) + '  ' + t.winkels + ' winkel(s)  ' + t.naam.slice(0, 52))
    })
  }
  schrijf(d)
  console.log('\n' + Object.keys(d.ean).length + ' koppelingen bewaard in ' + LIJST)
}

main().catch(e => { console.error('Fout: ' + (e.message || e)); process.exit(1) })
