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
async function bevestigViaEan (asin, kandidaten) {
  const uit = []
  for (const k of kandidaten) {
    try {
      const r = await fetch('https://www.amazon.nl/s?k=' + encodeURIComponent(k.ean), { headers: KOP })
      if (!r.ok) continue
      const t = await r.text()
      const asins = new Set((t.match(/data-asin="[A-Z0-9]{10}"/g) || [])
        .map(s => s.slice(12, 22)))
      if (asins.has(asin)) uit.push(k)
    } catch (e) { /* volgende */ }
    if (uit.length) break
    await new Promise(s => setTimeout(s, 1500))
  }
  return uit
}

async function main () {
  const args = process.argv.slice(2)
  const d = lees()

  if (args.includes('--lijst') || !args.length) {
    const n = Object.keys(d.ean || {}).length
    console.log('Partnerlabel: ' + (d.label || '(geen)'))
    console.log(n + ' koppelingen in ' + LIJST)
    for (const [ean, asin] of Object.entries(d.ean || {})) console.log('  ' + ean + '  ' + asin)
    if (!args.length) console.log('\nGebruik: node amazon.mjs <link> [--ean=<ean>]')
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
