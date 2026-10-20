// Pokémon van eBay voor BoosterScout. Wordt aangeroepen vanuit tcg-feeds.mjs.
//
// Per set zoeken we op de Engelse, Duitse en Franse naam, in de categorie
// Sammelkartenspiele (2536): op eBay Duitsland voor Engels en Duits, op eBay
// Frankrijk voor Frans. Elke titel gaat door dezelfde herkenning als bij de
// voorraadworker (tcg-catalogus.mjs). Wat niet zeker herkend wordt, of
// meerdere sets of talen noemt, laten we liggen.
//
// Strenger dan bij gewone winkels, want op eBay staat veel wat net niet is wat
// de titel belooft:
//   - alleen nieuw, vaste prijs, verkoper in de EU die naar Nederland verstuurt;
//   - verkoper met minstens 98 procent positief en 25 beoordelingen;
//   - geen lots, losse kaarten, repacks, lege dozen, codes of kopieën;
//   - de taal moet in de titel staan, of blijken uit de Duitse of Franse setnaam;
//   - een Engels, Duits of Frans product dat minder kost dan 55 procent van de
//     adviesprijs is verdacht en doet niet mee.
//
// Per product (set, soort, taal) blijft de goedkoopste aanbieding over, met de
// verzendkosten in de prijs. Het id is vast per product (eb:<sleutel>), zodat
// een andere verkoper die goedkoper wordt geen "terug op voorraad" geeft.
//
// Duurt een paar minuten en kost ongeveer 70 zoekopdrachten. Daarom hooguit
// eens per EBAY_TCG_UUR uur; tussendoor gebruikt tcg-feeds de vorige uitkomst.
import fs from 'fs'
import { ebayKlaar, ebayZoek, ebayAanbod, ebayLink, Limiet } from './ebay-api.mjs'
import { SETS, SOORTEN, herken } from './tcg-catalogus.mjs'

const CACHE = 'data/tcg/ebay.json'
const UUR = Number(process.env.EBAY_TCG_UUR || 3)
const CATEGORIE = '2536'   // Sammelkartenspiele / Collectible Card Games

// De taal van elke andere setnaam in tcg-catalogus.mjs. Een naam die hier
// niet staat, gebruiken we niet om op te zoeken.
const NAAM_TAAL = {
  'dunkelnacht': 'de', 'wachsendes chaos': 'de', 'optimale ordnung': 'de', 'fatale flammen': 'de',
  'schwarze blitze': 'de', 'weiße flamme': 'de', 'ewige rivalen': 'de', 'reisegefährten': 'de',
  'prismatische entwicklungen': 'de', 'stürmische funken': 'de', 'stellarkrone': 'de', 'nebel der sagen': 'de',
  'maskerade im zwielicht': 'de', 'gewalten der zeit': 'de', 'paldeas schicksale': 'de', 'paradoxrift': 'de',
  'obsidianflammen': 'de', 'entwicklungen in paldea': 'de',
  'chaos ascendant': 'fr', 'flammes fantasmagoriques': 'fr', 'foudre noire': 'fr', 'flamme blanche': 'fr',
  'rivalités destinées': 'fr', 'aventures ensemble': 'fr', 'évolutions prismatiques': 'fr',
  'étincelles déferlantes': 'fr', 'couronne stellaire': 'fr', 'fable nébuleuse': 'fr', 'mascarade crépusculaire': 'fr',
  'forces temporelles': 'fr', 'destinées de paldea': 'fr', 'faille paradoxe': 'fr', 'flammes obsidiennes': 'fr',
  'évolutions à paldea': 'fr'
}

// Welke taal noemt de titel? Meer dan een: dan weten we het niet.
const TAAL = [
  ['jp', /japan|japanisch|japanese|japonais|\bjpn?\b/],
  ['kr', /korea|coréen|coreen|\bkor\b|\bkr\b/],
  ['cn', /chines|chinois|simplified|\bchn\b/],
  ['fr', /französisch|franzoesisch|french|français|francais|\bfr\b|\bvf\b/],
  ['de', /deutsch|german|allemand|\bdeu\b|\bger\b/],
  ['it', /italienisch|italian|italien|\bita\b/],
  ['es', /spanisch|spanish|espagnol|\besp\b/],
  ['en', /englisch|english|anglais|\beng?\b/]
]
function talen (t, markt) {
  const uit = new Set(TAAL.filter(([, re]) => re.test(t)).map(([k]) => k))
  // "DE" als landcode in een Duitse titel (Versand aus DE, DE-Version).
  if (markt === 'EBAY_DE' && /\bde\b/.test(t) && !uit.has('fr')) uit.add('de')
  return uit
}

const WEG = /\blots?\b|konvolut|sammlung|einzelkarte|single|karte aus|cards? from|aus (dem|der)|repack|mystery|wundertüte|proxy|fake|replica|custom|graded|\bpsa\b|\bcgc\b|\bbgs\b|\bleer\b|leere|\bempty\b|\bvide\b|ohne (booster|karten|inhalt)|sans (booster|cartes)|nur (die )?(box|verpackung|hülle)|code ?card|online.?code|geöffnet|geoeffnet|opened|ouvert|beschädigt|damaged|abîmé|vorbestellung|pre-?order|précommande|\b\d+ ?x\b|\bx ?\d+\b|\bset of\b|\b\d+er (set|pack)\b|\b[2-9]er\b|\b[2-9]er ?pack|\+|bundle[- ]?display|display[- ]?bundle|aus (dem )?display|from (a |the )?display|frisch aus|echantillon|échantillon|loisir|fun ?pack|sample|demi|\bhalb|promo ?pack|not for sale|avant[- ]premi|\bkit\b|artset|schutzbox|schutzhülle|acryl|acrylic|protector|heavy|weighed|gewogen|god ?pack|\d+[.,]\d+ ?g\b/

const vandaag = () => new Date().toISOString()

// Welke sets noemt een titel? "Mega Evolution" telt niet mee: dat is ook de
// naam van de serie ("Mega Evolution: Chaos Rising").
const SETNAMEN = SETS.flatMap(s => [s[1], ...s[4]].map(n => [s[0], n.trim().toLowerCase()])).filter(([k, n]) => n.length >= 4 && !/\d/.test(n) && k !== 'mega-evolution')
function setsIn (t) {
  const uit = new Set()
  for (const [k, n] of SETNAMEN) if (t.includes(n)) uit.add(k)
  return uit
}

function zoekvragen () {
  const v = []
  for (const s of SETS) {
    const [key, naam, , , andere, vast] = s
    if (vast === 'jp') { v.push({ key, q: naam, markt: 'EBAY_DE', taal: 'jp', naam }); continue }
    v.push({ key, q: naam, markt: 'EBAY_DE', taal: 'en', naam })
    for (const a of andere) {
      const n = a.trim().toLowerCase()
      const taal = NAAM_TAAL[n]
      if (!taal) continue
      v.push({ key, q: n, markt: taal === 'fr' ? 'EBAY_FR' : 'EBAY_DE', taal, naam: n })
    }
  }
  // Dubbele (bijvoorbeeld twee Franse schrijfwijzen zonder accent) eruit.
  const gezien = new Set()
  return v.filter(x => { const k = x.markt + '|' + x.key + '|' + x.taal + '|' + x.q.normalize('NFD').replace(/[̀-ͯ]/g, ''); return !gezien.has(k) && gezien.add(k) })
}

const MERK = { en: '', de: ' Deutsch', fr: ' Français', jp: ' Japanese' }

// De producten die BoosterScout al kent. Daar zoeken we prijzen bij; een
// nieuw product beginnen we niet vanuit eBay.
async function catalogus () {
  try {
    const r = await fetch(process.env.BOOSTERSCOUT_API || 'https://boosterscout-voorraad.business-347.workers.dev/api/catalogus')
    const d = await r.json()
    return new Map((d.items || []).map(x => [x.sleutel, { vanaf: Number(x.vanaf || 0), op: Number(x.op || 0) }]))
  } catch (e) { return new Map() }
}

async function haal () {
  const bekend = await catalogus()
  const beste = new Map()   // sleutel -> aanbod
  const vragen = zoekvragen()
  let n = 0; let fouten = 0; let gestopt = ''
  for (const v of vragen) {
    let d
    try {
      d = await ebayZoek({
        q: 'pokemon ' + v.q,
        category_ids: CATEGORIE,
        limit: '200',
        filter: 'buyingOptions:{FIXED_PRICE},conditions:{NEW},deliveryCountry:NL,priceCurrency:EUR'
      }, v.markt)
      n++
    } catch (e) {
      if (e instanceof Limiet) { gestopt = e.message; break }
      fouten++; continue
    }
    for (const it of d.itemSummaries || []) {
      const a = ebayAanbod(it, { minPct: 98, minScore: 25 })
      if (!a) continue
      const t = ' ' + a.titel.toLowerCase().normalize('NFC') + ' '
      if (!t.includes(v.naam.toLowerCase()) || WEG.test(t)) continue
      if (setsIn(t).size > 1) continue                   // twee sets in een titel: een bundel of onduidelijk
      // "Mega Evolution" / "Mega-Entwicklung" is ook de serienaam. Een titel met
      // alleen die naam is vaak een latere set waarvan we de Duitse of Franse
      // naam niet kennen. Alleen met de code ME01 of als Engelse titel.
      if (v.key === 'mega-evolution' && !/\bme ?0?1\b|lucario|gardevoir/.test(t)) continue
      const ts = talen(t, v.markt)
      let taal = v.taal
      if (v.taal === 'jp') { if ([...ts].some(x => x !== 'jp')) continue }
      else if (ts.size > 1) continue
      else if (ts.size === 1) taal = [...ts][0]
      else if (v.taal === 'en') continue                 // Engelse naam zonder taal: kan alles zijn
      if (!['en', 'de', 'fr', 'jp'].includes(taal)) continue
      // De titel zoals de worker hem herkent: met de taal erbij als die er niet stond.
      const naam = a.titel + (ts.size ? '' : MERK[taal])
      const h = herken(naam)
      if (!h || h.set !== v.key || h.taal !== taal) continue
      if (bekend.size && !bekend.has(h.sleutel)) continue  // alleen producten die de catalogus al kent
      const soort = SOORTEN.find(s => s[0] === h.soort)
      if (taal === 'jp' && h.soort === 'booster-box' && a.totaal < 35) continue
      // "Display" zonder aantal is in Duitsland en Frankrijk vaak een 18er.
      if (h.soort === 'booster-box' && (/\bhalb|\b18\b|\b20\b/.test(t) && taal !== 'jp' || ['de', 'fr'].includes(taal) && !/\b36\b/.test(t))) continue
      // Veel goedkoper dan de winkels die het op voorraad hebben: bijna altijd een
      // ander product dan de titel doet denken.
      const k = bekend.get(h.sleutel)
      if (k && k.op > 0 && k.vanaf > 0 && a.totaal < k.vanaf * 0.6) continue
      // Vijf keer de winkelprijs: dan is het bijna altijd iets groters (een box
      // met "Booster" in de titel) en niet wat de catalogus bedoelt.
      if (k && k.vanaf > 0 && a.totaal > k.vanaf * 5) continue
      // Een los pakje of blister met meer pakjes in de titel.
      if (['checklane', 'booster-pack', 'sleeved-booster'].includes(h.soort) && /\b([2-9]|1\d) ?(sealed |x |versiegelte )?(boosters?|packs?|umschläge)\b/.test(t)) continue
      if (soort && soort[2] > 0 && taal !== 'jp' && a.totaal < soort[2] * 0.55) continue
      const oud = beste.get(h.sleutel)
      if (!oud || a.totaal < oud.totaal) beste.set(h.sleutel, { ...a, naam, sleutel: h.sleutel })
    }
  }
  console.log('eBay (TCG): ' + n + ' zoekopdrachten, ' + beste.size + ' producten gevonden' + (fouten ? ', ' + fouten + ' fouten' : '') + (gestopt ? ', gestopt: ' + gestopt : ''))
  return { items: [...beste.values()].map(a => ({
    w: 'eBay',
    id: 'eb:' + a.sleutel,
    naam: a.naam,
    prijs: a.totaal,
    voorraad: 1,
    url: ebayLink(a.url, 'boosterscout'),
    im: a.im,
    land: a.land,
    verzend: null,
    verkoper: a.verkoper
  })), volledig: !gestopt && fouten < 5 }
}

// De eBay-producten voor feeds.json: vers opgehaald als het tijd is, anders de vorige uitkomst.
export async function ebayTcg () {
  let oud = null
  try { oud = JSON.parse(fs.readFileSync(CACHE, 'utf8')) } catch (e) {}
  // 20 okt: links uit een eerdere run opnieuw opbouwen, zodat een nieuwe partnerlink meteen overal geldt.
  if (oud && oud.items) oud.items = oud.items.map(x => ({ ...x, url: ebayLink(x.url, 'boosterscout') }))
  if (!ebayKlaar()) {
    // Zonder sleutels: de vorige uitkomst zolang die niet te oud is.
    const vers = oud && Date.now() - Date.parse(oud.gemaakt) < 6 * 3600e3
    console.log('eBay (TCG): geen EBAY_CLIENT_ID/EBAY_CLIENT_SECRET' + (vers ? ', vorige uitkomst gebruikt' : ''))
    return vers ? oud.items : []
  }
  if (oud && Date.now() - Date.parse(oud.gemaakt) < UUR * 3600e3) {
    console.log('eBay (TCG): vorige uitkomst van ' + oud.gemaakt + ' (' + oud.items.length + ' producten)')
    return oud.items
  }
  try {
    const r = await haal()
    // Een halve ronde (limiet op, storing) niet als nieuwe stand bewaren: dan
    // zou de worker de rest als uitverkocht zien.
    if (!r.volledig && oud) return oud.items
    fs.mkdirSync('data/tcg', { recursive: true })
    fs.writeFileSync(CACHE, JSON.stringify({ gemaakt: vandaag(), items: r.items }))
    return r.items
  } catch (e) {
    console.log('eBay (TCG): ' + e.message)
    return oud ? oud.items : []
  }
}
