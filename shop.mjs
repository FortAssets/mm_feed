// Webshop-feed generator voor deprijsvergelijker.com
//
// Draait in GitHub Actions, niet op Cloudflare. Twee redenen:
//  1. Tradedoubler (MediaMarkt) blokkeert Cloudflare-IP's.
//  2. De brede Awin-feed is 95.000 regels; dat parseer je niet in een worker
//     binnen de CPU-limiet, en al helemaal niet bij elk bezoek.
//
// Uitvoer: data/shop/index.json + data/shop/c-<slug>.json per categorie.
// De worker dpv-shop leest die via jsDelivr en serveert de API.
//
// Producten van verschillende winkels worden samengevoegd op EAN, en als er
// geen EAN is op een genormaliseerde naam. Dan staat hetzelfde product met
// twee of drie prijzen op de vergelijkpagina, en dat is de hele bedoeling.

import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

const UIT = 'data/shop'

// ------------------------------------------------------------------- Amazon
//
// Amazon heeft geen feed en geen API zonder sleutels, en die sleutels komen er
// pas na drie verkopen. Hun prijs halen wij dus niet op; dat mag ook niet,
// want Partnernet staat alleen prijzen toe die via hun eigen koppeling
// binnenkomen en die mogen maximaal 24 uur bewaard worden. Met een
// prijslogboek dat maanden teruggaat gaat dat niet samen.
//
// Wat wel kan is een link met het partnerlabel. Die ziet er zo uit:
//
//   https://www.amazon.nl/<naamslak>/dp/<ASIN>?tag=fortassets-21&linkCode=as4
//
// De naamslak en linkCode zijn versiering; www.amazon.nl/dp/<ASIN>?tag=... doet
// hetzelfde. Het enige dat je echt nodig hebt is het ASIN, en dat is niet uit
// een EAN te berekenen. Daarom staat het hier in een lijst, en vult amazon.mjs
// die lijst bij uit de links die je bij Amazon genereert.
//
// Staat er voor een product geen ASIN, dan zet de pagina een zoeklink op het
// EAN. Dat werkt verrassend goed: 0711719020837 komt bij Amazon uit op
// B0FN7ZG39D, precies de PlayStation 5 Digital Edition. Maar niet altijd:
// 0045496337414 (de Switch 2 van Coolblue) levert bij Amazon niets op, terwijl
// 0045496321444 wel bij B0F2J4SYJ2 uitkomt. Vandaar de handmatige lijst voor de
// producten waar het om gaat.
const AMAZON_LIJST = UIT + '/amazon.json'
let amazonLabel = 'fortassets-21'
const amazonEan = new Map()
// Prijzen van Amazon komen uit amazon.json, daar neergezet door amazon.mjs
// (--prijzen leest ze van de productpagina, --prijs zet er een met de hand).
// Is de verkoper erbij gelezen, dan doet de prijs mee als winkel en gaat hij
// het logboek in. Zonder verkoper staat hij alleen als "gezien op" op de
// kaart. Ouder dan drie dagen telt niet meer: dan draait het script blijkbaar
// niet, en een oude prijs die "goedkoopst" heet is erger dan geen prijs.
const AMAZON_PRIJS_DAGEN = Number(process.env.AMAZON_PRIJS_DAGEN || 3)
const amazonPrijs = new Map()

function leesAmazon () {
  try {
    const d = JSON.parse(fs.readFileSync(AMAZON_LIJST, 'utf8'))
    if (d.label) amazonLabel = String(d.label)
    for (const [ean, asin] of Object.entries(d.ean || {})) {
      if (/^[A-Z0-9]{10}$/.test(String(asin))) amazonEan.set(String(ean), String(asin))
    }
    const grens = Date.now() - AMAZON_PRIJS_DAGEN * 864e5
    for (const [ean, r] of Object.entries(d.prijs || {})) {
      const t = Date.parse((r && r.d) || '')
      if (r && r.p > 0 && t && t >= grens && amazonEan.has(String(ean))) amazonPrijs.set(String(ean), { p: +r.p, d: r.d, vk: r.vk || '', eigen: !!r.eigen })
    }
    console.log('Amazon: ' + amazonEan.size + ' ASIN-koppelingen, ' + amazonPrijs.size + ' met een verse afgelezen prijs')
  } catch (e) { /* nog geen lijst */ }
}

const AWIN_KEY = process.env.AWIN_KEY || ''
const MM_TOKEN = process.env.MM_TOKEN || ''

// 3 okt: de feedlijst van Awin opgehaald en vergeleken met wat hier binnenkomt.
// Twee dingen kwamen eruit.
//
// 1. Drie programma's stonden op "Not Joined" terwijl hun producten wel
//    binnenkwamen: Goedkoopste-Kantoorartikelen (20.456), Bazta (19.733) en
//    Workliving (2.180). Samen 42.369 van de 56.000 producten, oftewel
//    driekwart van de vergelijker, van winkels zonder goedgekeurde
//    samenwerking. Awin laat de feed wel downloaden maar schrijft een klik niet
//    toe. Ze staan in NIET_AANGESLOTEN zodat je ze met een schakelaar weg kunt
//    laten, en zodat het in het log zichtbaar is.
//
// 2. Drie actieve feeds ontbraken: Mobiel.nl toestel en accessoires (19975),
//    Simyo Handset (64283) en PLUS FamilyBlend (92549). De eerste twee horen
//    hier thuis en zijn toegevoegd. PLUS zijn boodschappen en hoort bij de
//    boodschappenpagina, dus die laat ik hier weg.
const AWIN_FIDS = '19979,61111,65453,82771,89758,95829,95830,95831,95833,95834,95835,95836,95839,95886,95887,95888,95889,95890,95892,95893,95894,95895,95896,95897,95898,95902,95903,95904,95927,95929,95932,95938,95939,95940,96487,96636,99064,101992,111946,115421,116143,117541,117569,19975'

// Winkels waar geen goedgekeurde Awin-samenwerking mee is. Een klik daar levert
// niets op. Zet AWIN_ALLEEN_AANGESLOTEN=1 om ze helemaal weg te laten.
const NIET_AANGESLOTEN = new Set(['Goedkoopste-Kantoorartikelen', 'Bazta', 'Workliving'])
// 4 okt: standaard aan. Bazta en Workliving komen terug zodra Awin ze goedkeurt;
// zet dan AWIN_ALLEEN_AANGESLOTEN=0 of haal ze uit de lijst hierboven.
const ALLEEN_AANGESLOTEN = process.env.AWIN_ALLEEN_AANGESLOTEN !== '0'

// Goedkoopste-Kantoorartikelen gaat er helemaal uit, en niet om de commissie.
// De feed heet "Goedkoopste-Kantoorartikelen NL", maar van de 20.456 regels
// wijzen er 20.449 naar goedkoopste-kantoorartikelen.be: het is de Belgische
// webshop, met Belgische prijzen en Belgische verzending. Op een Nederlandse
// prijsvergelijker is dat geen prijs maar ruis, en het was wel 19.263 van de
// 19.410 producten in de categorie kantoor, oftewel de hele categorie. Bij
// controle stond er ook een kalender van 4,10 euro met 9,62 als eerdere prijs,
// dus 57 procent korting, bij een winkel die ik niet kan nabellen.
//
// Bazta (nl.bazta.com) en Workliving zijn wel Nederlands, dus die blijven
// staan tot de aanmelding bij Awin rond is. De links werken; getest op
// 3 oktober, alle drie gaven een 302 naar de juiste productpagina.
// Simyo gaat er ook uit, om een andere reden. De feed "Simyo Handset" (64283)
// die ik op 3 oktober toevoegde zet in het prijsveld het bedrag per maand van
// het abonnement, en in het veld voor de oude prijs wat het toestel in totaal
// kost. In de vergelijker stond daardoor een iPhone 16 voor €6,50 met 99
// procent korting, naast €849 bij de andere winkels. Dat is geen prijs van een
// toestel. Toestellen met abonnement horen in de telecomvergelijker, waar het
// bedrag per maand en de looptijd erbij staan.
const UIT_DE_FEED = new Set(['Goedkoopste-Kantoorartikelen', 'Simyo'])
const AWIN_KOLOMMEN = 'aw_deep_link,product_name,merchant_image_url,search_price,merchant_name,merchant_id,category_name,merchant_category,brand_name,product_type,merchant_product_category_path,rrp_price,store_price,in_stock,ean,data_feed_id,condition,colour,delivery_cost,product_price_old'

// MediaMarkt-feeds. 117525 (telco) zit er niet bij: die houdt generate.mjs,
// want die voedt de sim-only vergelijker en daar wil ik niets aan veranderen.
const MM_FEEDS = [
  { fid: 23777, naam: 'Apple', cat: '' },
  { fid: 258752, naam: 'LEGO', cat: 'speelgoed' },
  { fid: 23270, naam: 'NL aanbiedingen', cat: '' },
  { fid: 23056, naam: 'Saturn NL', cat: '' },
  { fid: 50606, naam: 'Smartphones', cat: 'telefoons' },
  { fid: 50616, naam: 'Headphones', cat: 'audio' },
  { fid: 50615, naam: 'Koelkasten', cat: 'huishoudelijk' },
  { fid: 50617, naam: 'Laptops', cat: 'laptops' },
  { fid: 50618, naam: 'TV', cat: 'tv-beeld' },
  { fid: 50608, naam: 'Haircare', cat: 'verzorging' },
  { fid: 50620, naam: 'Koffiemachines', cat: 'keuken' },
  { fid: 50622, naam: 'Stofzuigers', cat: 'huishoudelijk' },
  { fid: 50619, naam: 'Wassen en drogen', cat: 'huishoudelijk' },
  { fid: 50621, naam: 'Wearables', cat: 'telefoons' }
]

// 9 okt: Nedgame via TradeTracker. Alleen de feed met nieuwe producten; de
// algemene feed bevat ook 12.000 tweedehands artikelen, en een gebruikte game
// hoort niet als laagste prijs naast nieuwe exemplaren. In de URL staat alleen
// het site-ID (aid), geen sleutel. r=feed komt als referentie mee bij elke klik.
const NEDGAME_FEED = process.env.NEDGAME_FEED ||
  'https://pf.tradetracker.net/?aid=512670&encoding=utf-8&type=csv&fid=1607599&filter_html=1&filter_nl=1&r=feed' +
  '&categoryType=2&additionalType=2&csvDelimiter=%3B&csvEnclosure=%22&filter_extended=1'
// De sales-feed: alleen artikelen met korting, elk uur ververst. Bijna alles
// staat ook in de feed hierboven, maar op 9 okt hadden 152 artikelen hier al
// een nieuwere prijs. Daarom wint de prijs uit deze feed als hij er is.
const NEDGAME_SALES = process.env.NEDGAME_SALES ||
  'https://pf.tradetracker.net/?aid=512670&encoding=utf-8&type=csv&fid=1367384&filter_html=1&filter_nl=1&r=feed' +
  '&categoryType=2&additionalType=2&csvDelimiter=%3B&csvEnclosure=%22&filter_extended=1'
// Tweedehands bij Nedgame (12.000 artikelen, vooral oudere platforms). Alleen
// voor de platforms van nu en alleen als er een nieuw exemplaar met hetzelfde
// EAN in de vergelijker staat. Het komt dan als aparte kaart met het label
// Tweedehands, net zoals refurbished bij de andere winkels, en nooit als
// laagste prijs naast nieuwe exemplaren.
const NEDGAME_TWEEDEHANDS = process.env.NEDGAME_TWEEDEHANDS ||
  'https://pf.tradetracker.net/?aid=512670&encoding=utf-8&type=csv&fid=891177&filter_html=1&filter_nl=1&r=feed' +
  '&categoryType=2&additionalType=2&csvDelimiter=%3B&csvEnclosure=%22&filter_extended=1'
// Platforms van nu. Een product van Nedgame dat nog bij geen andere winkel ligt,
// nemen we alleen op als het voor een van deze platforms is. Oudere platforms
// (PS4, PS3, Xbox One, 3DS, Wii) en merchandise komen alleen mee als een andere
// winkel hetzelfde EAN heeft; anders wordt Gaming een rommelzolder.
const NEDGAME_HUIDIG = { 'PlayStation 5': 'PS5', 'Nintendo Switch 2': 'Nintendo Switch 2', 'Nintendo Switch': 'Nintendo Switch', 'Xbox Series X': 'Xbox Series X', 'PC Gaming': 'PC' }

const MM_LOGO = 'https://hst.tradedoubler.com/file/262336/MM-logo.png'

// --------------------------------------------------------------------- bol
//
// bol doet niet mee aan Awin; die heeft een eigen partnerprogramma en een eigen
// API. Daar is geen feed van, alleen een zoek- en een aanbod-endpoint, dus
// bol wordt per EAN opgevraagd bij de producten die wij al uit de andere feeds
// kennen. Dat is meteen de nauwkeurigste koppeling die er is: gelijk EAN is
// gelijk product, zonder naamvergelijking.
//
// Eén regel is hier belangrijker dan alle andere: bol toont standaard het beste
// aanbod, en dat kan van een marktplaatsverkoper zijn. Op 3 oktober stond de
// Xbox Series X daar op €1140 (VF E-Shop) en de PlayStation 5 op €749
// (NBB.com), terwijl die consoles normaal rond de €499 en €549 liggen. bol
// verkoopt die twee niet zelf.
//
// Het veld seller komt alleen mee met include-seller=true, en alleen op de
// route products/{ean}/offers/best. De brede lijst (products/lists/popular)
// stuurt hem niet mee, ook niet met include-seller erbij; getest op 3 oktober
// met include-seller, include-offers en include-all-offers, alle drie zonder
// verkoper in het antwoord. Een route products/{ean}/offers in het meervoud
// bestaat niet (HTTP 404). Er is dus geen manier om de verkoper in bulk te
// krijgen: één product is één verzoek.
//
// Daarom deze verdeling:
//   de brede lijst vindt producten, de losse route bepaalt de prijs.
// Een prijs uit de brede lijst zonder gecontroleerde verkoper komt niet op de
// pagina. Dat is geen overdreven voorzichtigheid, het is gemeten: van tachtig
// aanbiedingen onder de 75 euro die ik nacontroleerde was 62 procent van een
// marktplaatsverkoper, precies dezelfde verhouding als boven de 75 euro
// (210 van 323). Prijs zegt dus niets over wie er verkoopt, en "bol.com" boven
// een prijs van RS Goods of Smartphonehoesjes.nl is simpelweg onwaar.
//
// Wat gecontroleerd is blijft bewaard in data/shop/bol-verkopers.json.gz, dus
// de dekking loopt over de ronden op en begint niet elke keer bij nul.
const BOL_TOKEN_URL = 'https://login.bol.com/token?grant_type=client_credentials'
const BOL_API = 'https://api.bol.com/marketing/catalog/v1/'
const BOL_ID = process.env.BOL_CLIENT_ID || ''
const BOL_GEHEIM = process.env.BOL_CLIENT_SECRET || ''
const BOL_SITE = process.env.BOL_SITE_ID || '1528494'
const BOL_PER_RONDE = Number(process.env.BOL_PER_RONDE || 9000)   // EAN's per run
const BOL_TEGELIJK = 6                                             // parallelle verzoeken
// Harde tijdgrens. bol knijpt na een paar duizend verzoeken af: de eerste
// duizend gaan in ruim een minuut, daarna zakt het naar ongeveer tweehonderd
// per minuut. Met twintig minuten haal je er zo'n drieduizend per ronde, en
// met twee ronden per dag is de hele catalogus in ruim een week rond. Dat is
// prima: de rotatie zorgt dat elke ronde een ander deel aan de beurt is.
const BOL_MINUTEN = Number(process.env.BOL_MINUTEN || 20)
const BOL_CURSOR = UIT + '/bol-cursor.json'

// ------------------------------------------------- wie verkoopt het, onthouden
//
// Een verkoper opvragen kost een verzoek, en bol knijpt af. Het antwoord
// verandert zelden: wie een product verkoopt is een eigenschap van het product,
// niet van de dag. Dus wordt het bewaard en meegecommit, en pas na een paar
// weken opnieuw gecontroleerd.
const BOL_VERKOPERS = UIT + '/bol-verkopers.json.gz'
const BOL_VERS_DAGEN = Number(process.env.BOL_VERS_DAGEN || 14)   // daarna opnieuw nakijken
const BOL_BEWAAR_DAGEN = 120                                      // daarna uit het bestand
const bolVerkopers = new Map()                                    // ean -> { v, bij }
let bolVerkopersGewijzigd = false

function bolLeesVerkopers () {
  try {
    const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(BOL_VERKOPERS)).toString('utf8'))
    const grens = Date.now() - BOL_BEWAAR_DAGEN * 864e5
    for (const [ean, r] of Object.entries(d)) {
      const t = Date.parse(r.bij || '')
      if (!t || t < grens) continue
      bolVerkopers.set(ean, { v: r.v || '', bij: r.bij })
    }
    console.log('bol: ' + bolVerkopers.size + ' verkopers uit eerdere ronden')
  } catch (e) { /* eerste keer */ }
}

function bolSchrijfVerkopers () {
  if (!bolVerkopersGewijzigd) return
  const d = {}
  for (const [ean, r] of bolVerkopers) d[ean] = r
  try {
    fs.mkdirSync(path.dirname(BOL_VERKOPERS), { recursive: true })
    fs.writeFileSync(BOL_VERKOPERS, zlib.gzipSync(Buffer.from(JSON.stringify(d)), { level: 9 }))
    console.log('bol: ' + bolVerkopers.size + ' verkopers bewaard')
  } catch (e) { console.error('bol verkopers niet bewaard: ' + e.message) }
}

function bolOnthou (ean, verkoper) {
  if (!ean || !verkoper) return
  const oud = bolVerkopers.get(ean)
  if (oud && oud.v === verkoper && bolVersGenoeg(oud)) return
  bolVerkopers.set(ean, { v: verkoper, bij: new Date().toISOString().slice(0, 10) })
  bolVerkopersGewijzigd = true
}

function bolVersGenoeg (r) {
  if (!r || !r.bij) return false
  const t = Date.parse(r.bij)
  return !!t && t > Date.now() - BOL_VERS_DAGEN * 864e5
}

// Is dit bol zelf? Alleen te zeggen als het ooit gecontroleerd is.
function bolIsEigen (verkoper) {
  return String(verkoper || '').toLowerCase().replace(/\s+/g, '') === 'bol.com'
}

let bolToken = { waarde: '', tot: 0 }

async function bolHaalToken () {
  if (bolToken.waarde && bolToken.tot > Date.now() + 30000) return bolToken.waarde
  const auth = Buffer.from(BOL_ID + ':' + BOL_GEHEIM).toString('base64')
  const r = await fetch(BOL_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + auth, Accept: 'application/json' }
  })
  if (!r.ok) throw new Error('bol token HTTP ' + r.status + '. Niet opnieuw proberen: bol blokkeert ip-adressen bij herhaalde mislukte pogingen.')
  const d = await r.json()
  bolToken = { waarde: d.access_token, tot: Date.now() + (d.expires_in || 600) * 1000 }
  return bolToken.waarde
}

async function bolAanbod (ean) {
  const t = await bolHaalToken()
  const url = BOL_API + 'products/' + encodeURIComponent(ean) + '/offers/best?country-code=NL&include-seller=true'
  const r = await fetch(url, {
    headers: { Authorization: 'Bearer ' + t, Accept: 'application/json', 'Accept-Language': 'nl-NL' }
  })
  if (r.status === 404) return null          // bol kent dit EAN niet
  if (r.status === 429) { await new Promise(s => setTimeout(s, 2000)); return undefined }  // opnieuw
  if (!r.ok) return null
  const d = await r.json()
  if (!(d && d.price > 0)) return null
  const verkoper = String((d.seller && d.seller.name) || '').trim()
  if (!verkoper) return null                 // geen verkoper = niet te plaatsen
  bolOnthou(ean, verkoper)
  if (String(d.condition || 'NEW').toUpperCase() !== 'NEW') return null
  // Een marktplaatsverkoper gaat er niet meer uit. Hij krijgt een eigen
  // winkelnaam: "bol.com partner", met de verkoper erbij. Een PlayStation 5 van
  // €749 bij NBB.com is een echt aanbod dat je echt via bol kunt kopen, en de
  // kaart moet alleen niet doen alsof het de prijs van bol zelf is.
  return {
    prijs: d.price,
    van: d.strikethroughPrice > d.price ? d.strikethroughPrice : 0,
    url: d.url || '',
    voorraad: /voorraad|in huis|besteld/i.test(d.deliveryDescription || '') ? 1 : 0,
    preorder: !!d.isPreOrder,
    verkoper
  }
}

// ---------------------------------------------------------------- bol breed
//
// De koppeling per EAN hierboven haalt bol alleen op bij producten die ik al
// uit de andere feeds ken. Dat is te smal: bol heeft alleen al in Gaming
// 161.992 producten en 300.000 populair over alles heen, en daar zitten dingen
// bij die bij Coolblue en MediaMarkt niet in de feed staan. De PlayStation 5
// bijvoorbeeld, en de Xbox.
//
// Het endpoint products/lists/popular geeft per categorie vijftig producten per
// verzoek, mét prijs, van-prijs, afbeelding en EAN. Dat is vijftig keer
// efficienter dan per EAN vragen.
//
// De verkoper komt hier niet mee (include-seller werkt alleen op de losse
// aanbod-route). Daarom wordt die apart gecontroleerd voor de aanbiedingen waar
// het uitmaakt, en staat er op de kaart "bol.com partner" als het aanbod van
// een marktplaatsverkoper komt. Niet weglaten dus, wel eerlijk benoemen: een
// PlayStation 5 van 749 euro bij NBB.com is een echt aanbod, maar het is niet
// de prijs van bol zelf.
const BOL_CATS = [
  { id: '3135', naam: 'Gaming', cat: 'gaming' },
  { id: '3136', naam: 'Elektronica', cat: '' },   // te breed voor een vaste categorie, alleen op trefwoord
  { id: '3134', naam: 'Computer', cat: 'laptops' },
  { id: '12001', naam: 'Huishouden', cat: 'huishoudelijk' },
  { id: '11764', naam: 'Koken & Tafelen', cat: 'keuken' },
  { id: '12442', naam: 'Persoonlijke verzorging', cat: 'verzorging' },
  { id: '7934', naam: 'Speelgoed', cat: 'speelgoed' },
  { id: '13155', naam: 'Klussen', cat: 'klussen' }
  // 7 okt: de lijsten Sport, Kantoor & School, Tuin en Wonen zijn eruit. Daar
  // kwam bijna alleen kleding, textiel, schriften en tuinspul uit, en in die
  // categorieen lag geen enkel product bij een tweede winkel. Wat van de
  // overige lijsten binnenkomt gaat door geenApparaat() verderop.
]
const BOL_PAGINAS = Number(process.env.BOL_PAGINAS || 40)   // 50 producten per pagina

async function bolLijst (catId, pagina) {
  const t = await bolHaalToken()
  const url = BOL_API + 'products/lists/popular?country-code=NL&category-id=' + encodeURIComponent(catId) +
    '&page=' + pagina + '&page-size=50&include-offer=true&include-image=true'
  const r = await fetch(url, {
    headers: { Authorization: 'Bearer ' + t, Accept: 'application/json', 'Accept-Language': 'nl-NL' }
  })
  if (r.status === 429) { await new Promise(s => setTimeout(s, 2000)); return undefined }
  if (!r.ok) return null
  const d = await r.json()
  return (d && d.results) || []
}

// Plek in de populaire lijst van bol, per bol-afdeling (1 = populairst). Telt mee
// in de populariteit van een product, zie populariteit() verderop.
const BOL_RANG = new Map()

async function haalBolBreed () {
  if (!BOL_ID || !BOL_GEHEIM) return []
  const uit = []
  const gezien = new Set()
  for (const c of BOL_CATS) {
    let n = 0
    for (let p = 1; p <= BOL_PAGINAS; p++) {
      let rs = await bolLijst(c.id, p)
      if (rs === undefined) rs = await bolLijst(c.id, p)
      if (!rs || !rs.length) break
      for (const x of rs) {
        const ean = String((x && x.ean) || '').trim()
        const o = x && x.offer
        if (!ean || !/^\d{8,14}$/.test(ean) || !o || !(o.price > 0)) continue
        if (gezien.has(ean)) continue
        gezien.add(ean)
        if (!BOL_RANG.has(ean)) BOL_RANG.set(ean, n + 1)
        uit.push({
          ean,
          naam: String(x.title || '').trim(),
          url: x.url || '',
          afb: (x.image && (x.image.url || x.image)) || '',
          prijs: o.price,
          van: o.strikethroughPrice > o.price ? o.strikethroughPrice : 0,
          voorraad: /voorraad|in huis|besteld/i.test(o.deliveryDescription || '') ? 1 : 0,
          bolCat: c.cat
        })
        n++
      }
    }
    console.log('  bol ' + c.naam + ': ' + n + ' producten')
  }
  console.log('bol breed: ' + uit.length + ' producten uit ' + BOL_CATS.length + ' categorieen')
  return uit
}

// Welke brede rijen moeten gecontroleerd worden, en welke niet?
//
// Waar een verkeerd label echt schade doet is de vergelijking. Daar staat de
// bol-prijs naast Coolblue en MediaMarkt, en daar bepaalt hij wie "goedkoopst"
// is. Een PlayStation van NBB.com die daar als bol.com meedoet, verpest de hele
// tabel. Dus: elke bol-prijs bij een product dat ook bij een andere winkel
// ligt, wordt gecontroleerd. Lukt dat niet, dan gaat die prijs eruit en staat
// het product er gewoon zonder bol in.
//
// Bij een product dat alleen bij bol ligt valt er niets te vergelijken. Daar is
// "bol.com" ook niet onwaar: je koopt het op bol.com, met de bestelling, de
// betaling en het retourrecht van bol. Wie het verstuurt staat op de
// productpagina waar de link naartoe gaat. Die rijen gaan er dus zonder
// controle in, en krijgen met de tijd alsnog een verkoper mee als het budget
// het toelaat.
const BOL_CONTROLE_MINUTEN = Number(process.env.BOL_CONTROLE_MINUTEN || 12)
const BOL_CONTROLE_MAX = Number(process.env.BOL_CONTROLE_MAX || 8000)

// Haalt prijs én verkoper op bij de losse route, want die is de enige die de
// verkoper kent, en zijn prijs hoort bij die verkoper. De prijs uit de brede
// lijst is een momentopname van een mogelijk ander aanbod.
async function bolControleer (rijen, bestaandeEans, gedaan) {
  const uitCache = []
  const nodig = []
  for (const r of rijen) {
    const vergelijking = bestaandeEans.has(r.ean)
    const c = bolVerkopers.get(r.ean)
    if (c && bolVersGenoeg(c)) { r.verkoper = c.v; r.gecontroleerd = true; uitCache.push(r); continue }
    if (c) { r.verkoper = c.v; r.gecontroleerd = true }   // oud, maar beter dan niets
    // een vergelijking eerst, daarna het dure spul, daarna de rest
    r.gewicht = (vergelijking ? 1000 : 0) + Math.min(400, r.prijs) + (c ? -200 : 0)
    nodig.push(r)
  }
  nodig.sort((a, b) => b.gewicht - a.gewicht)
  const lijst = nodig.slice(0, BOL_CONTROLE_MAX)
  console.log('bol: ' + uitCache.length + ' verkopers uit de cache, ' + lijst.length +
    ' van ' + nodig.length + ' na te kijken')
  if (!lijst.length) return

  const stop = Date.now() + BOL_CONTROLE_MINUTEN * 60000
  let i = 0; let n = 0; let partner = 0; let weg = 0
  async function werker () {
    while (true) {
      if (Date.now() > stop) return
      const k = i++
      if (k >= lijst.length) return
      const r = lijst[k]
      try {
        let a = await bolAanbod(r.ean)
        if (a === undefined) a = await bolAanbod(r.ean)
        gedaan.add(r.ean)
        if (!a) { weg++; r.weg = true; continue }
        // de losse route is de bron, niet de lijst
        r.prijs = a.prijs
        r.van = a.van
        r.url = a.url || r.url
        r.voorraad = a.voorraad
        r.verkoper = a.verkoper
        r.gecontroleerd = true
        n++
        if (!bolIsEigen(a.verkoper)) partner++
      } catch (e) { /* onbekend blijft onbekend */ }
    }
  }
  await Promise.all(Array.from({ length: BOL_TEGELIJK }, werker))
  console.log('bol: ' + n + ' nagekeken (' + partner + ' marktplaats, ' + weg +
    ' zonder aanbod)' + (i < lijst.length ? ', tijdgrens bereikt bij ' + i : ''))
}

function bolLink (url, naam) {
  if (!url) return ''
  return 'https://partner.bol.com/click/click?p=2&t=url&s=' + BOL_SITE + '&f=TXL&url=' +
    encodeURIComponent(url) + '&name=' + encodeURIComponent(String(naam || '').slice(0, 40))
}

function bolLeesCursor () {
  try { return JSON.parse(fs.readFileSync(BOL_CURSOR, 'utf8')).volgende || 0 } catch (e) { return 0 }
}
function bolSchrijfCursor (n) {
  try {
    fs.mkdirSync(path.dirname(BOL_CURSOR), { recursive: true })
    fs.writeFileSync(BOL_CURSOR, JSON.stringify({ volgende: n, bij: new Date().toISOString() }))
  } catch (e) { /* niet erg */ }
}

// Welke EAN's deze ronde. Niet alles tegelijk: 56.000 losse verzoeken duurt te
// lang en bol zit daar niet op te wachten. Dus eerst waar het meeste aan hangt,
// daarna roterend de rest, zodat de dekking over een paar dagen vanzelf
// compleet wordt.
function bolKies (items) {
  const perEan = new Map()
  for (const it of items) {
    if (!it.ean) continue
    if (!perEan.has(it.ean)) perEan.set(it.ean, { ean: it.ean, cat: it.cat, prijs: it.prijs, winkels: new Set() })
    const e = perEan.get(it.ean)
    e.winkels.add(it.winkel)
    if (it.prijs < e.prijs) e.prijs = it.prijs
  }
  const alle = [...perEan.values()]

  const belangrijk = new Set(['gaming', 'telefoons', 'laptops', 'tv-beeld', 'audio', 'keuken', 'huishoudelijk', 'foto', 'randapparatuur', 'slim-huis'])
  // Waar levert bol het meeste op? Bij een product dat nu maar bij een winkel
  // ligt, want daar maakt bol er een vergelijking van. Bij iets dat al bij twee
  // winkels ligt is bol een derde prijs: nuttig, en hij brengt een van-prijs mee
  // die Coolblue nooit meestuurt, maar het is geen nieuwe vergelijking. Daarom
  // weegt een dure, relevante eenpitter zwaarder dan een goedkoop product dat
  // al vergeleken wordt.
  const score = (e) => {
    let s = 0
    if (belangrijk.has(e.cat)) s += 40
    if (e.prijs >= 50) s += 25
    else if (e.prijs >= 20) s += 12
    if (e.winkels.size > 1) s += 10
    return s
  }
  alle.sort((a, b) => score(b) - score(a) || a.ean.localeCompare(b.ean))

  // de kop van de lijst altijd, de staart roterend
  // De voorrangslijst kan zelf groter zijn dan wat in een ronde past: op 3
  // oktober waren het er 10.166 bij een budget van 9.000. Dan werd de rest
  // stilletjes door de tijdgrens afgekapt, en altijd dezelfde staart. Dus ook
  // binnen de voorrangslijst roteren.
  const alleKop = alle.filter(e => score(e) >= 65)   // belangrijke categorie en minstens 50 euro
  const staart = alle.filter(e => score(e) < 65)
  let kop = alleKop
  if (alleKop.length > BOL_PER_RONDE) {
    const k0 = bolLeesCursor() % alleKop.length
    kop = alleKop.slice(k0, k0 + BOL_PER_RONDE)
    if (kop.length < BOL_PER_RONDE) kop = kop.concat(alleKop.slice(0, BOL_PER_RONDE - kop.length))
  }
  const ruimte = Math.max(0, BOL_PER_RONDE - kop.length)
  const start = staart.length ? bolLeesCursor() % staart.length : 0
  const deel = staart.slice(start, start + ruimte)
  if (deel.length < ruimte) deel.push(...staart.slice(0, ruimte - deel.length))
  bolSchrijfCursor(staart.length ? (start + ruimte) % staart.length : 0)
  return { lijst: kop.concat(deel), kop: kop.length, staart: staart.length, voorrangTotaal: alleKop.length }
}

async function haalBol (items, alGedaan) {
  if (!BOL_ID || !BOL_GEHEIM) {
    console.error('BOL_CLIENT_ID of BOL_CLIENT_SECRET ontbreekt, bol wordt overgeslagen')
    return []
  }
  const gezien = alGedaan || new Set()
  const gekozen = bolKies(items)
  // Wat de brede controle hierboven al heeft opgevraagd hoeft niet opnieuw. Dat
  // waren er op 3 oktober een paar duizend, en dat is zonde van het budget.
  const lijst = gekozen.lijst.filter(e => !gezien.has(e.ean))
  console.log('bol: ' + lijst.length + ' EAN opvragen (' + gekozen.kop + ' met voorrang van ' +
    gekozen.voorrangTotaal + ', ' + gekozen.staart + ' in de roulatie, ' +
    (gekozen.lijst.length - lijst.length) + ' deze ronde al gedaan)')

  const stop = Date.now() + BOL_MINUTEN * 60000
  const uit = []
  let gedaan = 0; let gevonden = 0
  let i = 0

  async function werker () {
    while (true) {
      if (Date.now() > stop) return
      const n = i++
      if (n >= lijst.length) return
      const e = lijst[n]
      let a
      try {
        a = await bolAanbod(e.ean)
        if (a === undefined) a = await bolAanbod(e.ean)   // was 429
      } catch (err) {
        console.error('  bol ' + e.ean + ': ' + String(err.message || err))
        if (String(err.message || '').includes('token')) throw err
        a = null
      }
      gedaan++
      gezien.add(e.ean)
      if (a) { gevonden++; uit.push({ ean: e.ean, aanbod: a }) }
      if (gedaan % 1000 === 0) console.log('  bol: ' + gedaan + ' van ' + lijst.length + ', ' + gevonden + ' gevonden')
    }
  }
  await Promise.all(Array.from({ length: BOL_TEGELIJK }, werker))
  console.log('bol: ' + gedaan + ' opgevraagd, ' + gevonden + ' aanbiedingen' +
    (gedaan < lijst.length ? ' (tijdgrens bereikt bij ' + gedaan + ')' : ''))
  return uit
}

// ---------------------------------------------------------------- categorieen

// volgorde = volgorde van de chips op de pagina
const CATEGORIEEN = [
  { slug: 'gaming', naam: 'Gaming', kop: true },
  { slug: 'telefoons', naam: 'Telefoons & tablets', kop: true },
  { slug: 'laptops', naam: 'Laptops & computers', kop: true },
  { slug: 'tv-beeld', naam: "Tv's & beeld", kop: true },
  { slug: 'audio', naam: 'Audio', kop: true },
  { slug: 'huishoudelijk', naam: 'Huishoudelijk', kop: true },
  { slug: 'keuken', naam: 'Koffie & keuken', kop: true },
  { slug: 'foto', naam: 'Foto & video', kop: true },
  { slug: 'slim-huis', naam: 'Slim huis', kop: true },
  { slug: 'randapparatuur', naam: 'Randapparatuur', kop: true },
  { slug: 'accessoires', naam: 'Accessoires', kop: false },
  { slug: 'verzorging', naam: 'Persoonlijke verzorging', kop: false },
  { slug: 'klussen', naam: 'Klussen & tuin', kop: false },
  { slug: 'speelgoed', naam: 'Speelgoed', kop: false },
  { slug: 'wonen', naam: 'Wonen & meubels', kop: false },
  { slug: 'kantoor', naam: 'Kantoor', kop: false },
  { slug: 'drogisterij', naam: 'Drogisterij', kop: false }
]
const GELDIG = new Set(CATEGORIEEN.map(c => c.slug))

// Coolblue vult product_type netjes; dat is de betrouwbaarste bron die er is.
// Alles wat hier niet in staat valt terug op de trefwoorden verderop.
const TYPE_NAAR_CAT = {
  // gaming
  'consoles': 'gaming', 'games': 'gaming', 'gaming headsets': 'gaming',
  'controllers': 'gaming', 'gaming stoelen': 'gaming', 'racesturen': 'gaming',
  'gaming laptops qwerty': 'gaming', 'gaming laptops azerty': 'gaming',
  'gaming monitoren': 'gaming', 'gaming toetsenborden': 'gaming',
  'gaming muizen': 'gaming', 'vr brillen': 'gaming', 'gaming bureaus': 'gaming',
  'joysticks': 'gaming', 'flightsticks': 'gaming',
  // telefoons
  'mobiele telefoons': 'telefoons', 'refurbished mobiele telefoons': 'telefoons',
  'tablets': 'telefoons', 'refurbished tablets': 'telefoons',
  'smartwatches': 'telefoons', 'refurbished smartwatches': 'telefoons',
  'health trackers': 'telefoons', 'horlogebandjes': 'telefoons',
  'simkaarten': 'telefoons',
  // laptops
  'laptops': 'laptops', 'windows laptops qwerty': 'laptops',
  'windows laptops azerty': 'laptops', 'zakelijke windows laptops qwerty': 'laptops',
  'zakelijke windows laptops azerty': 'laptops', 'macbooks': 'laptops',
  'refurbished laptops': 'laptops', 'chromebooks': 'laptops',
  'desktops': 'laptops', 'all-in-one pcs': 'laptops', 'mini pcs': 'laptops',
  'monitoren': 'laptops', 'laptop sleeves': 'laptops', 'laptoptassen': 'laptops',
  'e-readers': 'laptops', 'laptopstandaarden': 'laptops',
  // tv
  'televisies': 'tv-beeld', 'beamers': 'tv-beeld', 'televisiebeugels': 'tv-beeld',
  'projectieschermen': 'tv-beeld', 'mediaspelers': 'tv-beeld',
  'tv meubels': 'tv-beeld',
  // audio
  'oordopjes': 'audio', 'hoofdtelefoons': 'audio', 'bluetooth speakers': 'audio',
  'soundbars': 'audio', 'wifi speakers': 'audio', 'hifi speakers': 'audio',
  'platenspelers': 'audio', "radio's": 'audio', 'dj controllers': 'audio',
  'studio microfoons': 'audio', 'office headsets': 'audio',
  'versterkers': 'audio', 'receivers': 'audio', 'cd spelers': 'audio',
  'home cinema sets': 'audio', 'draadloze oordopjes': 'audio',
  // randapparatuur
  'toetsenborden': 'randapparatuur', 'muizen': 'randapparatuur',
  'toetsenbord en muis sets': 'randapparatuur',
  'externe harde schijven hdd': 'randapparatuur',
  'solid state drives (ssd)': 'randapparatuur', "externe ssd's": 'randapparatuur',
  'geheugenkaarten': 'randapparatuur', 'usb sticks': 'randapparatuur',
  'routers': 'randapparatuur', 'netwerk switches': 'randapparatuur',
  'access points': 'randapparatuur', 'nas': 'randapparatuur',
  'printers': 'randapparatuur', 'toners': 'randapparatuur',
  'cartridges': 'randapparatuur', 'datakabels': 'randapparatuur',
  'webcams': 'randapparatuur', 'docking stations': 'randapparatuur',
  'moederborden': 'randapparatuur', 'videokaarten': 'randapparatuur',
  'processoren': 'randapparatuur', 'werkgeheugen': 'randapparatuur',
  'behuizingen': 'randapparatuur', 'voedingen': 'randapparatuur',
  'cpu koelers': 'randapparatuur', 'computerkasten': 'randapparatuur',
  // huishoudelijk
  'koelkasten': 'huishoudelijk', 'wasmachines': 'huishoudelijk',
  'wasdrogers': 'huishoudelijk', 'was-droogcombinaties': 'huishoudelijk',
  'vaatwassers': 'huishoudelijk', 'vriezers': 'huishoudelijk',
  'stofzuigers': 'huishoudelijk', 'robotstofzuigers': 'huishoudelijk',
  'bouwstofzuigers': 'huishoudelijk', 'steelstofzuigers': 'huishoudelijk',
  'ovens': 'huishoudelijk', 'kookplaten': 'huishoudelijk',
  'afzuigkappen': 'huishoudelijk', 'fornuizen': 'huishoudelijk',
  'magnetrons': 'huishoudelijk', 'strijkijzers': 'huishoudelijk',
  'luchtbevochtigers': 'huishoudelijk', 'luchtreinigers': 'huishoudelijk',
  'airco': 'huishoudelijk', 'ventilatoren': 'huishoudelijk',
  'prullenbakken': 'huishoudelijk', 'elektrische kachels': 'huishoudelijk',
  'droogtrommels': 'huishoudelijk', 'wasrekken': 'huishoudelijk',
  'stoomreinigers': 'huishoudelijk',
  // keuken
  'cup- en padmachines': 'keuken', 'volautomatische espressomachines': 'keuken',
  'halfautomatische espressomachines': 'keuken', 'filterkoffieapparaten': 'keuken',
  'koffiemolens': 'keuken', 'pannen': 'keuken', 'friteuses': 'keuken',
  'airfryers': 'keuken', 'blenders': 'keuken', 'keukenmixers': 'keuken',
  'staafmixers': 'keuken', 'waterkokers': 'keuken', 'contactgrills': 'keuken',
  'foodprocessors': 'keuken', 'kokend water kranen reservoirs': 'keuken',
  'barbecues': 'keuken', 'hoezen voor barbecues': 'keuken',
  'pannensets': 'keuken', 'messen': 'keuken', 'slowjuicers': 'keuken',
  'broodbakmachines': 'keuken', 'sapcentrifuges': 'keuken',
  'keukenweegschalen': 'keuken', 'wijnklimaatkasten': 'keuken',
  // foto
  "systeemcamera's": 'foto', 'cameralenzen': 'foto', "compactcamera's": 'foto',
  "action camera's": 'foto', "360 graden camera's": 'foto',
  'lensfilters': 'foto', 'cameratassen': 'foto', 'statieven': 'foto',
  "accu's voor camera's": 'foto', 'cameramicrofoons': 'foto',
  'studiolampen': 'foto', 'drones': 'foto', 'dashcams': 'foto',
  'verrekijkers': 'foto', "spiegelreflexcamera's": 'foto',
  'cameraflitsers': 'foto', 'gimbals': 'foto',
  // slim huis
  'smart lampen': 'slim-huis', "ip-camera's": 'slim-huis',
  'thermostaten': 'slim-huis', 'rookmelders': 'slim-huis',
  'deurbellen': 'slim-huis', 'deursloten': 'slim-huis',
  'babyfoons': 'slim-huis', 'stroomstekkers': 'slim-huis',
  'slimme stekkers': 'slim-huis', 'bewegingssensoren': 'slim-huis',
  'koolmonoxidemeters': 'slim-huis', 'slimme speakers': 'slim-huis',
  'lampen': 'slim-huis',
  // accessoires
  'telefoonhoesjes': 'accessoires',
  'screenprotectors voor mobiele telefoons': 'accessoires',
  'tablet hoesjes': 'accessoires', 'thuisladers': 'accessoires',
  'powerbanks': 'accessoires', 'koffers': 'accessoires',
  'autoladers': 'accessoires', 'draadloze laders': 'accessoires',
  'telefoonhouders': 'accessoires', 'rugzakken': 'accessoires',
  // verzorging
  'elektrische tandenborstels': 'verzorging', 'scheerapparaten': 'verzorging',
  'fohns': 'verzorging', 'krulborstels': 'verzorging', 'tondeuses': 'verzorging',
  'personenweegschalen': 'verzorging', 'handmassage apparaten': 'verzorging',
  'stijltangen': 'verzorging', 'epilators': 'verzorging',
  'monddouches': 'verzorging', 'baardtrimmers': 'verzorging',
  // klussen
  'boormachines': 'klussen', 'schuurmachines': 'klussen',
  'hogedrukreinigers': 'klussen', 'bladblazers': 'klussen',
  'fiets helmen': 'klussen', 'accuschroevendraaiers': 'klussen',
  'cirkelzagen': 'klussen', 'grasmaaiers': 'klussen',
  'heggenscharen': 'klussen', 'gereedschapssets': 'klussen',
  'elektrische steps': 'klussen', 'elektrische fietsen': 'klussen',
  // speelgoed
  'lego': 'speelgoed', 'speelgoed': 'speelgoed', 'knuffels': 'speelgoed',
  'bouwsets': 'speelgoed', 'puzzels': 'speelgoed', 'gezelschapsspellen': 'speelgoed'
}

// Alleen gebruikt als product_type leeg of onbekend is. Volgorde is belangrijk:
// de eerste die raakt wint, dus specifiek boven algemeen.
const TREFWOORDEN = [
  ['gaming', /\b(playstation|ps5|ps4|xbox|nintendo|switch\s?2?|steam deck|dualsense|joy-?con|amiibo|gta|fifa\s?\d|ea sports fc|call of duty|zelda|mario|pokemon|game ?controller)\b/i],
  ['telefoons', /\b(iphone|galaxy s\d|galaxy a\d|galaxy z|pixel \d|smartphone|ipad|galaxy tab|smartwatch|apple watch|galaxy watch)\b/i],
  // "monitor \d" stond hier ook, maar daarmee werd de Xiaomi "Temperature and
  // Humidity Monitor 3" een laptop. Monitoren komen bij Coolblue netjes uit
  // product_type, dus het trefwoord is niet nodig.
  ['laptops', /\b(macbook|laptop|notebook|chromebook|imac|mac mini|mac studio|beeldscherm)\b/i],
  ['tv-beeld', /\b(oled|qled|smart ?tv|televisie|\d{2} inch tv|beamer|projector)\b/i],
  ['audio', /\b(airpods|koptelefoon|oordopjes|earbuds|soundbar|speaker|platenspeler|versterker)\b/i],
  ['keuken', /\b(espresso|koffiezet|koffiemachine|nespresso|dolce gusto|senseo|airfryer|friteuse|blender|waterkoker|pannenset|koekenpan)\b/i],
  ['huishoudelijk', /\b(koelkast|wasmachine|wasdroger|vaatwasser|stofzuiger|vriezer|oven|magnetron|afzuigkap|kookplaat|strijkijzer|airco|ventilator)\b/i],
  ['verzorging', /\b(tandenborstel|scheerapparaat|haardroger|fohn|stijltang|tondeuse|trimmer|epilator|shampoo|conditioner)\b/i],
  ['foto', /\b(camera|objectief|lens \d|dslr|gopro|drone|statief|dashcam)\b/i],
  ['slim-huis', /\b(philips hue|slimme lamp|smart lamp|thermostaat|rookmelder|deurbel|babyfoon|slimme stekker|humidity monitor|temperatuursensor|luchtkwaliteit)\b/i],
  ['randapparatuur', /\b(toetsenbord|keyboard|muis|mouse|ssd|harde schijf|usb-stick|geheugenkaart|microsd|router|wifi|printer|toner|cartridge|videokaart|rtx \d|processor|moederbord)\b/i],
  ['accessoires', /\b(hoesje|case voor|screenprotector|powerbank|oplader|usb-c kabel|adapter|telefoonhouder)\b/i],
  ['speelgoed', /\b(lego|playmobil|barbie|knuffel|puzzel \d|speelgoed)\b/i],
  ['drogisterij', /\b(eau de parfum|eau de toilette|parfum|deodorant|crème|creme|lotion|mascara|lippenstift|nagellak)\b/i],
  ['wonen', /\b(bureau|bureaustoel|eetkamerstoel|fauteuil|barkruk|vergadertafel|kast|bed |matras|dekbed|parasol|tuinset)\b/i],
  ['kantoor', /\b(balpen|stift|marker|etiket|map |ordner|papier a4|nietmachine|perforator|papiervernietiger)\b/i]
]

// MediaMarkt levert geen product_type zoals Coolblue dat doet, dus daar leid ik
// de soort af uit de categorienamen. Dat geeft twee soorten rommel in de
// filterchips, en die ruim ik hier op.
//
// Ten eerste afdelingsnamen die hetzelfde zeggen als mijn categorie: een chip
// "Gaming" binnen de categorie gaming filtert niets en staat alleen in de weg.
// Die gaan eruit; dat product heeft dan geen soort en valt netjes buiten de
// soortchips in plaats van een eigen nietszeggende chip te krijgen.
const SOORT_WEG = new Set([
  'gaming', 'computer', 'audio', 'tv', 'huishouden', 'telefonie & wearables',
  'smart home & wonen', 'speelgoed & entertainment', 'foto & video',
  'verzorging & beweging', 'games & software', 'grote keukenapparatuur',
  'kleine keukenapparatuur', 'kabels & adapters', 'overig', 'overige',
  'diversen', 'accessoires', 'not available', 'wonen', 'keuken', 'telefonie'
])

// Ten tweede enkelvouden en synoniemen naast de woorden die Coolblue gebruikt.
// Zonder deze staan "televisies", "tv" en "smart-tv" als drie chips naast
// elkaar voor hetzelfde ding.
const SOORT_GELIJK = {
  smartphone: 'mobiele telefoons', gsm: 'mobiele telefoons',
  smartphones: 'mobiele telefoons',
  'smart-tv': 'televisies', 'led-tv': 'televisies', 'oled-tv': 'televisies',
  laptop: 'laptops', 'zakelijke laptop': 'laptops', 'zakelijke laptops': 'laptops',
  'gaming-laptop': 'gaming laptops qwerty', 'gaming laptop': 'gaming laptops qwerty',
  tablet: 'tablets', 'android-tablets': 'tablets', 'android-tablet': 'tablets',
  hoofdtelefoon: 'hoofdtelefoons', 'draadloze hoofdtelefoon': 'hoofdtelefoons',
  koptelefoon: 'hoofdtelefoons',
  oordopje: 'oordopjes', 'draadloze oordopjes': 'oordopjes',
  smartwatch: 'smartwatches', horlogebandje: 'horlogebandjes',
  telefoonhoesje: 'telefoonhoesjes', cover: 'telefoonhoesjes',
  screenprotector: 'screenprotectors voor mobiele telefoons',
  thuislader: 'thuisladers', 'usb-kabel': 'datakabels', usbkabel: 'datakabels',
  powerbank: 'powerbanks',
  'koel-vriescombinatie': 'koelkasten', koelkast: 'koelkasten',
  wasmachine: 'wasmachines', warmtepompdroger: 'wasdrogers', wasdroger: 'wasdrogers',
  vaatwasser: 'vaatwassers', stofzuiger: 'stofzuigers',
  robotstofzuiger: 'robotstofzuigers',
  'steelstofzuiger incl. kruimelzuiger': 'stofzuigers', steelstofzuiger: 'stofzuigers',
  oven: 'ovens', magnetron: 'magnetrons', vriezer: 'vriezers',
  'volautomatische espressomachine': 'volautomatische espressomachines',
  espressomachine: 'halfautomatische espressomachines',
  koffiemachine: 'volautomatische espressomachines',
  waterkoker: 'waterkokers', friteuse: 'friteuses', airfryer: 'friteuses',
  blender: 'blenders', 'fohn': 'fohns', 'föhn': 'fohns', krultang: 'krulborstels',
  scheerapparaat: 'scheerapparaten', tondeuse: 'tondeuses',
  tandenborstel: 'elektrische tandenborstels',
  monitor: 'monitoren', printer: 'printers', router: 'routers',
  toetsenbord: 'toetsenborden', muis: 'muizen', beamer: 'beamers',
  console: 'consoles', controller: 'controllers', game: 'games',
  'gaming headset': 'gaming headsets', 'gaming stoel': 'gaming stoelen',
  'vr bril': 'vr brillen', 'vr-bril': 'vr brillen', racestuur: 'racesturen',
  ssd: 'solid state drives (ssd)', 'externe ssd': "externe ssd's",
  'externe harde schijf': 'externe harde schijven hdd',
  geheugenkaart: 'geheugenkaarten', soundbar: 'soundbars',
  'bluetooth speaker': 'bluetooth speakers', speaker: 'bluetooth speakers',
  camera: "systeemcamera's", 'systeemcamera': "systeemcamera's",
  objectief: 'cameralenzen', cameralens: 'cameralenzen', drone: 'drones',
  'smart lamp': 'smart lampen', thermostaat: 'thermostaten',
  rookmelder: 'rookmelders', deurbel: 'deurbellen', babyfoon: 'babyfoons'
}

function nettSoort (soort, cat, catNaam) {
  let s = String(soort || '').trim().toLowerCase()
  if (!s) return ''
  if (SOORT_GELIJK[s]) s = SOORT_GELIJK[s]
  if (SOORT_WEG.has(s)) return ''
  // een soort die hetzelfde heet als de categorie zegt niets extra
  if (slug(s) === cat || s === String(catNaam || '').toLowerCase()) return ''
  if (s.length > 44) return ''
  return s
}

function catUitMerchant (merchant, merchantCat) {
  const m = (merchant || '').toLowerCase()
  const mc = (merchantCat || '').toLowerCase()
  if (m.includes('kantoorartikelen')) return 'kantoor'
  if (m.includes('workliving')) return 'wonen'
  if (m.includes('mobiel.nl') || m.includes('dutch-plaza')) return 'telefoons'
  if (m.includes('bazta')) {
    if (/speelgoed|activiteiten/.test(mc)) return 'speelgoed'
    if (/fragrance|parfum|make|verzorging|huidverzorging|hygi/.test(mc)) return 'drogisterij'
    if (/schoonmaak|wassen|huis|tuin|badkamer/.test(mc)) return 'huishoudelijk'
    return 'drogisterij'
  }
  if (m.includes('2dekansje')) {
    if (/speelgoed|kerst/.test(mc)) return 'speelgoed'
    if (/keukenapparaten|koken/.test(mc)) return 'keuken'
    if (/stofzuig|schoonmaak/.test(mc)) return 'huishoudelijk'
    if (/wonen|meubel|tafel|stoel|kast|bed|verlichting|tuin|parasol/.test(mc)) return 'wonen'
    return ''
  }
  if (m.includes('action')) {
    if (/speelgoed|vrije-tijd/.test(mc)) return 'speelgoed'
    if (/multimedia/.test(mc)) return 'randapparatuur'
    if (/keuken/.test(mc)) return 'keuken'
    if (/wonen|slapen|tuin/.test(mc)) return 'wonen'
    if (/verzorging/.test(mc)) return 'verzorging'
    return ''
  }
  return ''
}

function bepaalCat (type, naam, merchant, merchantCat) {
  const t = (type || '').trim().toLowerCase()
  if (t && TYPE_NAAR_CAT[t]) return TYPE_NAAR_CAT[t]
  const n = String(naam || '')
  for (const [cat, re] of TREFWOORDEN) if (re.test(n)) return cat
  const uitM = catUitMerchant(merchant, merchantCat)
  if (uitM) return uitM
  // laatste kans: losse woorden uit het product_type zelf
  if (t) {
    for (const [cat, re] of TREFWOORDEN) if (re.test(t)) return cat
  }
  return ''
}

// ------------------------------------------------------------------ hulpjes

function num (s) {
  const v = parseFloat(String(s == null ? '' : s).replace(/[^\d,.\-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
  return isNaN(v) ? 0 : v
}

// Product-id's werden eerder op 44 tekens afgekapt, en dan kunnen twee
// verschillende naamgroepen hetzelfde id krijgen. Dat is niet alleen een
// rommelige lijst: het prijslogboek loopt op dat id, dus dan erven twee
// producten elkaars prijsverloop. Daarom nu een hash van de volle sleutel, met
// de lengte erachter zodat twee verschillende teksten niet zo snel botsen.
function hash (s) {
  let h = 0x811c9dc5
  const t = String(s)
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h.toString(36) + t.length.toString(36)
}

// Verandert de manier waarop naamsleutels gemaakt worden, dan verwijzen oude
// regels in het prijslogboek naar iets anders dan nu. Met dit nummer erbij
// gooien we die regels weg in plaats van ze stil door elkaar te laten lopen.
const SLEUTEL_VERSIE = 2

function slug (s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Sleutel om hetzelfde product bij verschillende winkels te herkennen als er
// geen EAN is. Merknaam plus de betekenisvolle woorden uit de titel, zonder
// winkelspecifieke rommel als "nu met gratis", kleurnamen en jaartallen.
const RUIS = /\b(nieuw|nieuwe|new|gratis|incl|inclusief|met|voor|en|de|het|een|van|tot|model|editie|edition|versie|eu|nl|be|refurbished|tweedehands|outlet|aanbieding|actie|bundel|bundle|pack|set|zwart|wit|blauw|groen|rood|roze|paars|geel|goud|zilver|grijs|oranje|beige|bruin|black|white|blue|green|red|pink|purple|yellow|gold|silver|grey|gray|titanium|graphite|grafiet|antraciet|midnight|starlight|cream|creme)\b/g

// Let op: de merknaam zit hier met opzet niet in. Coolblue vult brand_name wel
// en MediaMarkt soms niet, en dan valt hetzelfde product in twee groepen. Dat
// gebeurde met "Grand Theft Auto VI (GTA 6) PS5", die twee keer in de lijst
// stond. Merken die echt botsen worden in koppel() alsnog uit elkaar gehaald.
function naamSleutel (naam) {
  const s = String(naam || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(RUIS, ' ')
    .replace(/\s+/g, ' ').trim()
  const woorden = s.split(' ').filter(w => w.length > 1)
  if (woorden.length < 2) return ''
  // Alle woorden meenemen, niet de eerste vier. Met vier woorden kregen
  // "Grand Theft Auto VI PS5" en "Grand Theft Auto VI Xbox Series X" dezelfde
  // sleutel, want het onderscheid staat pas op plek vijf. Die botsing wees naar
  // twee verschillende EAN's en daardoor viel de koppeling helemaal weg.
  const kern = woorden.slice(0, 12).sort().join('-')
  return kern.slice(0, 64)
}

function parseCsvText (text, sep = ',') {
  const rows = []
  let field = ''; let row = []; let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false } else field += c
    } else {
      if (c === '"') inQ = true
      else if (c === sep) { row.push(field); field = '' } else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' } else if (c === '\r') { /* skip */ } else field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

// ------------------------------------------------------------------- inlezen

async function haalAwin () {
  // LOKAAL_AWIN laat je testen op een al gedownloade feed, zonder Awin te belasten
  if (process.env.LOKAAL_AWIN) {
    const text = zlib.gunzipSync(fs.readFileSync(process.env.LOKAAL_AWIN)).toString('utf8')
    const rows = parseCsvText(text)
    const hdr = rows[0]
    const uit = []
    for (let i = 1; i < rows.length; i++) {
      const o = {}
      for (let j = 0; j < hdr.length; j++) o[hdr[j]] = (rows[i][j] || '').trim()
      uit.push(o)
    }
    console.log('Awin (lokaal):', uit.length, 'regels')
    return uit
  }
  // Zonder Awin blijft er alleen MediaMarkt over, en dat is een vijfde van de
  // producten. Dan is er geen koppeling op EAN meer tussen twee winkels en
  // vergelijkt de pagina niets. Liever hier stoppen dan een halve dataset
  // wegschrijven die het prijslogboek overschrijft.
  if (!AWIN_KEY) {
    throw new Error('AWIN_KEY ontbreekt. Zet die als repository secret, of geef ' +
      'LOKAAL_AWIN=<pad naar feed.csv.gz> mee om op een eerder gedownloade feed te werken.')
  }
  const url = 'https://productdata.awin.com/datafeed/download/apikey/' + AWIN_KEY +
    '/language/nl/fid/' + AWIN_FIDS + '/rid/0/hasEnhancedFeeds/0/columns/' + AWIN_KOLOMMEN +
    '/format/csv/delimiter/%2C/compression/gzip/adultcontent/1/'
  console.log('Awin ophalen...')
  const r = await fetch(url, { headers: { 'User-Agent': 'dpv-feed-bot/1.0' } })
  if (!r.ok) throw new Error('Awin HTTP ' + r.status)
  const gz = Buffer.from(await r.arrayBuffer())
  const text = zlib.gunzipSync(gz).toString('utf8')
  const rows = parseCsvText(text)
  const hdr = rows[0]
  const uit = []
  for (let i = 1; i < rows.length; i++) {
    const o = {}
    for (let j = 0; j < hdr.length; j++) o[hdr[j]] = (rows[i][j] || '').trim()
    uit.push(o)
  }
  console.log('Awin:', uit.length, 'regels')
  return uit
}

// Tradedoubler weigert elke query met een offset van 1000 of hoger: page 11 bij
// pageSize 100 geeft HTTP 400, en pageSize groter dan 100 ook. Een feed met
// 12.865 producten levert zo maar 1000 producten op. Oplossing: de feed in
// prijsbanden opdelen en elke band die boven de 1000 uitkomt verder splitsen,
// tot elke band binnen de limiet past. Prijzen liggen logaritmisch verdeeld,
// dus splitsen gaat op de meetkundige helft en niet op het midden.
const TD_LIMIET = 1000
const TD_START_BANDEN = [[0, 10], [10, 25], [25, 50], [50, 100], [100, 200], [200, 400], [400, 800], [800, 1600], [1600, 0]]

async function tdQuery (fid, pagina, min, max) {
  let q = 'page=' + pagina + ';pageSize=100'
  if (min > 0) q += ';minPrice=' + min
  if (max > 0) q += ';maxPrice=' + max
  const url = 'https://api.tradedoubler.com/1.0/products.json;' + q + ';fid=' + fid + '?token=' + MM_TOKEN
  for (let poging = 1; poging <= 3; poging++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (feed-bot) Chrome/120', Accept: 'application/json' } })
      if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 1500 * poging)); continue }
      if (!r.ok) return { fout: 'HTTP ' + r.status, producten: [], totaal: 0 }
      const d = await r.json()
      return { producten: d.products || [], totaal: (d.productHeader && d.productHeader.totalHits) || 0 }
    } catch (e) {
      if (poging === 3) return { fout: String(e.message || e), producten: [], totaal: 0 }
      await new Promise(s => setTimeout(s, 1500 * poging))
    }
  }
  return { producten: [], totaal: 0 }
}

async function haalBand (fid, min, max, diep, gezien, uit, tel) {
  const eerste = await tdQuery(fid, 1, min, max)
  tel.n++
  if (eerste.fout) { console.error('  fid', fid, min + '-' + (max || 'oo'), eerste.fout); return }
  const totaal = eerste.totaal
  if (!totaal) return

  if (totaal > TD_LIMIET && diep < 9) {
    // meetkundig splitsen; bij een open bovengrens eerst een plafond prikken
    const bovengrens = max > 0 ? max : Math.max(min * 4, min + 1000)
    const onder = Math.max(min, 1)
    const midden = Math.round(Math.sqrt(onder * bovengrens))
    if (midden > min && (max === 0 || midden < max)) {
      await haalBand(fid, min, midden, diep + 1, gezien, uit, tel)
      await haalBand(fid, midden, max, diep + 1, gezien, uit, tel)
      return
    }
    if (max === 0) { await haalBand(fid, min, bovengrens, diep + 1, gezien, uit, tel); await haalBand(fid, bovengrens, 0, diep + 1, gezien, uit, tel); return }
    // niet verder te splitsen (alle producten dezelfde prijs): pak wat kan
  }

  const neem = (ps) => {
    for (const q of ps) {
      let sid = ''
      try { sid = String(q.offers[0].sourceProductId || '') } catch (e) { sid = '' }
      const k = sid || ((q.identifiers && q.identifiers.ean) || '') || (q.name || '')
      if (!k || gezien.has(k)) continue
      gezien.add(k)
      uit.push(q)
    }
  }
  neem(eerste.producten)
  if (eerste.producten.length < 100) return

  const maxPagina = Math.min(10, Math.ceil(Math.min(totaal, TD_LIMIET) / 100))
  for (let p = 2; p <= maxPagina; p++) {
    const r = await tdQuery(fid, p, min, max)
    tel.n++
    if (r.fout) { console.error('  fid', fid, min + '-' + (max || 'oo'), 'p' + p, r.fout); break }
    neem(r.producten)
    if (r.producten.length < 100) break
  }
}

async function haalMmFeed (fid) {
  const uit = []
  const gezien = new Set()
  const tel = { n: 0 }
  // eerst kijken of de feed uberhaupt boven de limiet uitkomt
  const peil = await tdQuery(fid, 1, 0, 0)
  tel.n++
  if (peil.fout) { console.error('  fid', fid, peil.fout); return uit }
  if (peil.totaal <= TD_LIMIET) {
    const neem = (ps) => { for (const q of ps) uit.push(q) }
    neem(peil.producten)
    const maxPagina = Math.ceil(peil.totaal / 100)
    for (let p = 2; p <= Math.min(10, maxPagina); p++) {
      const r = await tdQuery(fid, p, 0, 0)
      tel.n++
      if (r.fout) break
      neem(r.producten)
      if (r.producten.length < 100) break
    }
    return uit
  }
  console.log('  fid', fid, 'heeft', peil.totaal, 'producten, dus in prijsbanden')
  for (const [a, b] of TD_START_BANDEN) await haalBand(fid, a, b, 0, gezien, uit, tel)
  console.log('  fid', fid, '->', uit.length, 'van', peil.totaal, 'in', tel.n, 'verzoeken')
  return uit
}

// ---------------------------------------------------------------- normaliseren

function uitAwin (r) {
  const prijs = num(r.search_price)
  if (!(prijs > 0)) return null
  const naam = (r.product_name || '').trim()
  if (!naam) return null
  // Awin zet het land achter de winkelnaam, soms met een streepje ervoor
  // ("Dutch-Plaza - NL"). Zonder dat laatste op te ruimen stond er "Dutch-Plaza -"
  // als winkelnaam op de kaarten.
  const merchant = (r.merchant_name || '')
    .replace(/[\s-]+(NL|NL-BE|BE|NL\/BE)$/i, '')
    .replace(/[\s-]+$/, '')
    .trim()
  const cat = bepaalCat(r.product_type, naam, r.merchant_name, r.merchant_category || r.merchant_product_category_path)
  if (!GELDIG.has(cat)) return null
  // "van"-prijs: alleen als hij echt hoger is. rrp_price is in deze feed in
  // 0 van de 95.000 regels gevuld, product_price_old in ongeveer 2 procent.
  let van = num(r.product_price_old) || num(r.store_price) || num(r.rrp_price)
  if (!(van > prijs * 1.01)) van = 0
  if (UIT_DE_FEED.has(merchant)) return null
  if (ALLEEN_AANGESLOTEN && NIET_AANGESLOTEN.has(merchant)) return null
  return {
    bron: 'awin',
    aangesloten: !NIET_AANGESLOTEN.has(merchant),
    naam,
    merk: (r.brand_name || '').trim(),
    prijs,
    van,
    winkel: merchant || 'Onbekend',
    url: (r.aw_deep_link || '').trim(),
    afb: (r.merchant_image_url || '').trim(),
    ean: /^\d{8,14}$/.test(r.ean || '') ? r.ean : '',
    type: (r.product_type || '').trim(),
    cat,
    voorraad: /^(1|true|yes|ja|in stock)$/i.test(r.in_stock || '') ? 1 : 0,
    // "Second chance" is hoe Coolblue zijn retouren noemt, en dat stond tot nu
    // toe als nieuw in de vergelijker: 4.428 regels in de feed van 3 oktober.
    // Daar zat de PlayStation 5 Slim Digital Edition bij, voor €611, terwijl
    // die nieuw rond de €499 ligt. Een gebruikt apparaat dat duurder is dan
    // nieuw, zonder dat er iets bij staat. Vandaar deze woorden erbij.
    staat: /refurb|gebruikt|tweedehands|used|second.?chance|tweede.?kans|open.?box|zo goed als nieuw/i
      .test((r.condition || '') + ' ' + (r.product_type || '') + ' ' + (r.merchant_category || ''))
      ? 'refurbished' : 'nieuw',
    kleur: (r.colour || '').trim(),
    verzend: num(r.delivery_cost)
  }
}

function uitMm (q, feed) {
  const f = {}
  for (const x of (q.fields || [])) if (x && x.name != null && x.value != null) f[x.name] = x.value
  const aanbod = (q.offers || [])[0]
  if (!aanbod) return null
  let prijs = 0
  try { prijs = num(aanbod.priceHistory[0].price.value) } catch (e) { prijs = 0 }
  if (!(prijs > 0)) return null
  const naam = (q.name || '').trim()
  if (!naam) return null
  const catNamen = (q.categories || []).map(c => c && c.name).filter(Boolean)
    .filter(s => !/^not available$/i.test(s)).join(' ')
  let cat = feed.cat
  if (!cat) {
    cat = bepaalCat(f.product_type || '', naam + ' ' + catNamen, 'MediaMarkt', catNamen)
  }
  if (!GELDIG.has(cat)) return null

  // Soort voor de filterchips. product_type is bij MediaMarkt niet altijd
  // gevuld (de Saturn-feed heeft hem nergens en zet zijn categorieen op
  // "Not available"), dus dan de laatste categorienaam pakken.
  let soort = (f.product_type || '').trim()
  if (!soort) {
    const kandidaten = []
    for (const c of (q.categories || [])) {
      if (!c || !c.name || /^not available$/i.test(c.name)) continue
      for (const deel of String(c.name).split(';')) if (deel.trim()) kandidaten.push(deel.trim())
    }
    soort = kandidaten.length ? kandidaten[kandidaten.length - 1] : (f.category2 || f.category1 || '').trim()
  }
  soort = nettSoort(soort, cat, '')
  let van = num(f.old_price) || num(f.previous_price)
  if (!(van > prijs * 1.01)) van = 0
  return {
    bron: 'mm',
    naam,
    merk: (q.brand || '').trim(),
    prijs,
    van,
    winkel: (aanbod.programName || 'MediaMarkt').trim(),
    url: (aanbod.productUrl || f.product_url || '').trim(),
    afb: (f.image_link || (q.productImage && q.productImage.url) || '').trim(),
    ean: /^\d{8,14}$/.test((q.identifiers && q.identifiers.ean) || '') ? q.identifiers.ean : '',
    type: soort,
    cat,
    voorraad: /voorraad|beschikbaar|in stock/i.test(aanbod.availability || f.in_stock || '') ? 1 : 0,
    staat: 'nieuw',
    kleur: (f.color || f.colour || '').trim(),
    verzend: num(aanbod.shippingCost)
  }
}

async function leesTtFeed (url, lokaal) {
  let text
  if (lokaal) text = fs.readFileSync(lokaal, 'utf8')
  else {
    const r = await fetch(url, { headers: { 'User-Agent': 'dpv-feed-bot/1.0' } })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    text = await r.text()
  }
  const rows = parseCsvText(text, ';')
  const hdr = rows[0] || []
  const uit = []
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].length < hdr.length - 2) continue
    const o = {}
    for (let j = 0; j < hdr.length; j++) o[hdr[j]] = (rows[i][j] || '').trim()
    uit.push(o)
  }
  return uit
}

async function haalNedgame () {
  try {
    const uit = await leesTtFeed(NEDGAME_FEED, process.env.LOKAAL_NEDGAME)
    console.log('Nedgame:', uit.length, 'regels')
    let sales = []
    try { sales = await leesTtFeed(NEDGAME_SALES, process.env.LOKAAL_NEDGAME_SALES) } catch (e) {
      console.log('Nedgame sales-feed niet opgehaald (' + e.message + ')')
    }
    if (sales.length) {
      // Op EAN: het 'product ID' is per feed anders.
      const perEan = new Map()
      for (const s of sales) if (s.EAN) perEan.set(s.EAN, s)
      let anders = 0
      for (const o of uit) {
        const s = o.EAN ? perEan.get(o.EAN) : undefined
        if (!s) continue
        if (s.price && s.price !== o.price) anders++
        if (num(s.price) > 0) o.price = s.price
        if (s.fromPrice) o.fromPrice = s.fromPrice
      }
      console.log('Nedgame sales:', sales.length, 'regels,', anders, 'met een nieuwere prijs')
    }
    return uit
  } catch (e) {
    // Valt Nedgame weg, dan gaat de rest gewoon door. Liever een winkel minder
    // dan geen nieuwe prijzen voor de hele site.
    console.log('Nedgame niet opgehaald (' + e.message + '), verder zonder')
    return []
  }
}

// basis: een product van een andere winkel met hetzelfde EAN, of undefined.
function uitNedgame (r, basis) {
  const prijs = num(r.price)
  if (!(prijs > 0)) return null
  let naam = (r.name || '').trim()
  if (!naam) return null
  if (r.condition && !/^nieuw$/i.test(r.condition)) return null
  // UPC-codes (12 of 11 cijfers) staan bij de andere winkels als EAN-13 met
  // voorloopnullen. Zonder aanvullen vielen 21 koppelingen weg.
  let ean = /^\d{8,14}$/.test(r.EAN || '') ? r.EAN : ''
  if (ean.length === 11 || ean.length === 12) ean = ean.padStart(13, '0')
  const pad = String(r.categoryPath || '')
  const [top, sub = ''] = pad.split(' > ').map(s => s.trim())
  const platform = NEDGAME_HUIDIG[top]
  let cat
  if (basis) cat = basis.cat
  else {
    if (!platform) return null
    if (/digitaal/i.test(sub)) return null          // downloadcodes: niet naast een doos zetten
    cat = 'gaming'
  }
  if (!GELDIG.has(cat)) return null
  let type = ''
  if (/^games/i.test(sub)) type = 'games'
  else if (/spelcomputers/i.test(sub)) type = 'consoles'
  else if (/pre-?paid/i.test(sub)) type = 'waardekaarten'
  else if (/controller/i.test(sub)) type = 'controllers'
  // Nedgame zet het platform niet in de naam van een game ("Just Dance 2022").
  // Zonder platform is niet te zien welke versie het is, en zoeken op "PS5"
  // vindt hem niet. Dus erachter zetten, zoals de andere winkels doen.
  if (type === 'games' && platform && !/\b(ps5|ps4|playstation|switch|xbox|pc)\b/i.test(naam)) naam += ' - ' + platform
  let van = num(r.fromPrice)
  if (!(van > prijs * 1.01)) van = 0
  return {
    bron: 'nedgame',
    naam: basis ? basis.naam : naam,
    merk: (r.brand || r.platform_brand || '').trim(),
    prijs,
    van,
    winkel: 'Nedgame',
    url: (r.productURL || '').trim(),
    afb: (r.imageURL || '').trim(),
    ean,
    type: basis ? basis.type : type,
    cat,
    voorraad: 1,
    staat: 'nieuw',
    kleur: '',
    verzend: num(r.deliveryCosts)
  }
}

// ------------------------------------------------------------------ koppelen

let ongecontroleerdUitVergelijking = 0
let onmogelijkePrijzen = 0
let onmogelijkeKortingen = 0

function koppel (items) {
  // Eerst de EAN-groepen, en per naamsleutel bijhouden welke EAN daarbij hoort.
  // Zonder die tweede stap valt eenzelfde product uiteen zodra de ene winkel een
  // EAN meestuurt en de andere niet: "Grand Theft Auto VI PS5" stond daardoor
  // twee keer in de lijst, een keer met alleen Coolblue en een keer met Coolblue
  // en MediaMarkt samen. Een naamsleutel die naar twee verschillende EAN's wijst
  // blijft buiten de brug, want dan weet ik niet welke de juiste is.
  const naamNaarEan = new Map()
  for (const it of items) {
    if (!it.ean) continue
    const ns = naamSleutel(it.naam)
    if (!ns) continue
    const sl = it.cat + '|' + ns
    const al = naamNaarEan.get(sl)
    if (al === undefined) naamNaarEan.set(sl, it.ean)
    else if (al !== it.ean) naamNaarEan.set(sl, null)
  }

  // 4 okt: de brug op naam koppelde verschillende uitvoeringen aan elkaar.
  // Coolblue noemt elke MacBook Air "MacBook Air 13\" M5", welke opslag of kleur
  // het ook is, en stuurt bij de meeste geen EAN mee. Een daarvan had wel een
  // EAN (16 GB, 1 TB), en daardoor kwam de goedkoopste van allemaal (512 GB,
  // 1.349 euro) in die groep terecht, naast 1.759 euro bij MediaMarkt voor het
  // model met 1 TB. Twee regels:
  //  - heeft een winkel onder dezelfde naam meer dan een artikel met een andere
  //    prijs, dan zegt die naam niet welk product het is en gaat de brug dicht;
  //  - een prijs die meer dan 30 procent onder of 40 procent boven de laagste
  //    prijs van de EAN-groep ligt, gaat er ook niet in.
  const perWinkelNaam = new Map()
  const eanLaagste = new Map()
  for (const it of items) {
    if (it.ean && it.staat !== 'refurbished') {
      const l = eanLaagste.get(it.ean)
      if (l === undefined || it.prijs < l) eanLaagste.set(it.ean, it.prijs)
    }
    const ns = naamSleutel(it.naam)
    if (!ns) continue
    const wk = it.winkel + '|' + it.cat + '|' + ns
    let set = perWinkelNaam.get(wk)
    if (!set) { set = new Set(); perWinkelNaam.set(wk, set) }
    if (set.size < 4) set.add(Math.round(it.prijs))
  }
  const meerduidig = new Set()
  for (const [wk, set] of perWinkelNaam) {
    if (set.size < 2) continue
    const ps = [...set]
    if (Math.max(...ps) > Math.min(...ps) * 1.03) meerduidig.add(wk.slice(wk.indexOf('|') + 1))
  }
  let brugDicht = 0

  const perSleutel = new Map()
  let los = 0
  let viaBrug = 0
  for (const it of items) {
    let k
    if (it.ean) k = 'e' + it.ean
    else {
      const ns = naamSleutel(it.naam)
      const sl = ns ? it.cat + '|' + ns : ''
      let ean = sl ? naamNaarEan.get(sl) : undefined
      if (ean) {
        const laag = eanLaagste.get(ean)
        if (meerduidig.has(sl) || (laag && (it.prijs < laag * 0.7 || it.prijs > laag * 1.4))) { ean = undefined; brugDicht++ }
      }
      if (ean) { k = 'e' + ean; viaBrug++ } else k = sl ? 'n' + hash(sl) : 'u' + (los++)
    }
    // Een tweedekansexemplaar is een ander product dan een nieuw exemplaar,
    // ook bij hetzelfde EAN. Zaten ze in dezelfde groep, dan hield de goedkoopste
    // per winkel over, en dat werd dan het gebruikte apparaat tegen een prijs
    // die naast nieuwe prijzen kwam te staan. Dus apart groeperen, met de
    // aanduiding "tweedekans" erbij op de kaart.
    if (it.staat === 'refurbished') k += '~r'
    if (!perSleutel.has(k)) perSleutel.set(k, [])
    perSleutel.get(k).push(it)
  }
  if (viaBrug) console.log('  ' + viaBrug + ' aanbiedingen zonder EAN op naam aan een EAN-groep gekoppeld')
  if (brugDicht) console.log('  ' + brugDicht + ' keer niet op naam gekoppeld: naam meerduidig of prijs te ver van de groep')
  ongecontroleerdUitVergelijking = 0
  onmogelijkePrijzen = 0
  onmogelijkeKortingen = 0

  // Binnen een naamgroep nog splitsen op merk: staat er bij twee producten een
  // verschillend merk, dan zijn het twee producten. Een leeg merk doet mee met
  // het merk dat in de groep het meest voorkomt.
  const groepen = []
  for (const [k, groep] of perSleutel) {
    if (k[0] === 'e' || groep.length < 2) { groepen.push([k, groep]); continue }
    const telMerk = new Map()
    for (const it of groep) { const m = slug(it.merk); if (m) telMerk.set(m, (telMerk.get(m) || 0) + 1) }
    if (telMerk.size < 2) { groepen.push([k, groep]); continue }
    const hoofdMerk = [...telMerk.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const perMerk = new Map()
    for (const it of groep) {
      const m = slug(it.merk) || hoofdMerk
      if (!perMerk.has(m)) perMerk.set(m, [])
      perMerk.get(m).push(it)
    }
    for (const [m, g] of perMerk) groepen.push([k + '~' + hash(m), g])
  }

  const uit = []
  for (const [k, groep] of groepen) {
    // per winkel alleen het goedkoopste aanbod; dubbele varianten van dezelfde
    // winkel maken de vergelijking alleen onleesbaar
    const perWinkel = new Map()
    for (const it of groep) {
      const w = it.winkel
      const b = perWinkel.get(w)
      if (!b || it.prijs < b.prijs) perWinkel.set(w, it)
    }
    let aanbod = [...perWinkel.values()].sort((a, b) => a.prijs - b.prijs)
    // Hier staat of valt de betrouwbaarheid van de tabel. Een bol-prijs waarvan
    // niet gecontroleerd is wie er verkoopt, mag niet naast Coolblue en
    // MediaMarkt staan: dan doet een marktplaatsverkoper mee alsof het de prijs
    // van bol zelf is, en bepaalt hij wie "goedkoopst" heet. Ligt het product
    // alleen bij bol, dan valt er niets te vergelijken en blijft hij staan.
    // Vangnet voor een prijs die niet bij dit product kan horen. Staat een
    // product bij drie of meer winkels en zit er een onder een derde van de
    // middelste prijs, bij iets van honderd euro of meer, dan is dat geen
    // aanbieding maar een ander soort bedrag: een maandprijs, een aanbetaling,
    // een los onderdeel. Zo'n regel hoort niet in de vergelijking, en al
    // helemaal niet bovenaan als goedkoopste.
    if (aanbod.length >= 3) {
      const midden = aanbod[Math.floor(aanbod.length / 2)].prijs
      if (midden >= 100) {
        const over = aanbod.filter(a => a.prijs >= midden / 3)
        if (over.length < aanbod.length && over.length) { onmogelijkePrijzen += aanbod.length - over.length; aanbod = over }
      }
    }
    if (aanbod.length > 1 && aanbod.some(a => a.bolOnbekend)) {
      const schoon = aanbod.filter(a => !a.bolOnbekend)
      if (schoon.length) { ongecontroleerdUitVergelijking += aanbod.length - schoon.length; aanbod = schoon }
    }
    const beste = aanbod[0]
    const metAfb = aanbod.find(a => a.afb) || beste
    const metMerk = aanbod.find(a => a.merk) || beste
    // Coolblue's product_type is de nettere woordenlijst, dus die eerst
    const metType = aanbod.find(a => a.type && a.bron === 'awin') || aanbod.find(a => a.type) || beste

    uit.push({
      i: k,
      // 9 okt: een gebruikt of refurbished exemplaar moet je aan de naam zien.
      // Alleen de winkelpagina zette er een label bij; op de homepage, in de
      // productrijen, bij zoeken en op de productpagina stond niets. Dus in de
      // naam zelf, tenzij die het al zegt.
      n: (beste.staat === 'refurbished' && !/refurb|tweedehands|gebruikt|second.?chance|tweede.?kans/i.test(beste.naam)
        ? beste.naam.slice(0, 104) + (beste.gebruikt ? ' (tweedehands)' : ' (refurbished)')
        : beste.naam.slice(0, 120)),
      b: (metMerk.merk || '').slice(0, 30),
      c: beste.cat,
      t: nettSoort(metType.type, beste.cat, ''),
      p: Math.round(beste.prijs * 100) / 100,
      // Een doorgestreepte prijs die meer dan vijf keer de prijs is (meer dan
      // tachtig procent korting) nemen wij niet over. Dat komt in de feeds
      // alleen voor als er iets anders in het veld staat dan een oude prijs.
      v: (beste.van && beste.van <= beste.prijs * 5) ? Math.round(beste.van * 100) / 100 : ((beste.van ? onmogelijkeKortingen++ : 0), 0),
      im: metAfb.afb,
      e: beste.ean,
      s: beste.staat === 'refurbished' ? 'r' : 'n',
      // Tweedehands (Nedgame) in plaats van refurbished: dan zet de site er
      // "Tweedehands" bij en niet "Refurbished".
      g: beste.gebruikt ? 1 : undefined,
      // Het ASIN bij Amazon, als wij dat weten. Een tweedekansexemplaar krijgt
      // er geen: dat is bij Amazon een ander product.
      az: (beste.ean && beste.staat !== 'refurbished' && amazonEan.get(beste.ean)) || undefined,
      // Alleen als de prijs niet als winkel meedoet: dan is hij wel gezien maar
      // weten wij niet wie er verkoopt.
      azp: (beste.ean && beste.staat !== 'refurbished' && !(amazonPrijs.get(beste.ean) || {}).vk && amazonPrijs.get(beste.ean) || {}).p,
      azd: (beste.ean && beste.staat !== 'refurbished' && !(amazonPrijs.get(beste.ean) || {}).vk && amazonPrijs.get(beste.ean) || {}).d,
      o: aanbod.map(a => ({
        w: a.winkel,
        vk: a.verkoper || undefined,
        p: Math.round(a.prijs * 100) / 100,
        v: (a.van && a.van <= a.prijs * 5) ? Math.round(a.van * 100) / 100 : 0,
        u: a.url,
        vz: a.verzend || 0,
        vr: a.voorraad
      }))
    })
  }
  return uit
}

// ------------------------------------------------------------------ wegschrijven

// De categoriebestanden gaan gezipt de repo in. Onverpakt is dit ruim 20 MB per
// run, en bij twee runs per dag loopt de repo dan vol met oude versies. Gezipt
// is het ongeveer een zesde daarvan. zlib met een vaste stand geeft bij gelijke
// invoer exact dezelfde bytes, dus een run zonder prijswijzigingen levert geen
// commit op. De worker pakt het uit met DecompressionStream('gzip').
function schrijf (bestand, data, zip) {
  fs.mkdirSync(path.dirname(bestand), { recursive: true })
  const json = Buffer.from(JSON.stringify(data), 'utf8')
  if (zip) {
    const gz = zlib.gzipSync(json, { level: 9, mtime: 0 })
    fs.writeFileSync(bestand + '.gz', gz)
    console.log('  ' + bestand + '.gz  ' + Math.round(gz.length / 1024) + ' KB  (' + Math.round(json.length / 1024) + ' KB onverpakt)')
  } else {
    fs.writeFileSync(bestand, json)
    console.log('  ' + bestand + '  ' + Math.round(json.length / 1024) + ' KB')
  }
}

// ---------------------------------------------------------------- prijslogboek
//
// Het prijslogboek hoort hier en niet in de worker. Een worker heeft een
// limiet op het aantal subverzoeken, en elke losse D1-opdracht telt mee. Daar
// is het logboek van de zorgpremies in september stil op stukgelopen: hij vond
// 2313 prijzen en schreef er nul weg, twee weken lang, zonder dat iemand het
// zag. Deze Action heeft die limiet niet en kan de vorige stand gewoon uit de
// repo lezen, dus hier kan het niet stil misgaan.
//
// Per winkel en per product wordt alleen een regel toegevoegd als de prijs
// afwijkt van de laatst bekende. Een product dat weken op dezelfde prijs staat
// kost dus een enkele regel. Dat is precies wat je nodig hebt om te zien of
// een Black Friday-korting echt is: stond die prijs er in oktober ook al?

const HIST_MAX = 120          // hoogstens zoveel wijzigingen per product/winkel
const HIST_DIR = UIT + '/hist'

function leesHist (slugNaam) {
  for (const p of [HIST_DIR + '/' + slugNaam + '.json.gz', HIST_DIR + '/' + slugNaam + '.json']) {
    try {
      if (!fs.existsSync(p)) continue
      const rauw = fs.readFileSync(p)
      const json = p.endsWith('.gz') ? zlib.gunzipSync(rauw) : rauw
      const d = JSON.parse(json.toString('utf8'))
      if (!d || !d.h) continue

      // Is de manier waarop naamsleutels gemaakt worden veranderd, dan wijzen de
      // regels op zo'n sleutel naar een ander product dan nu. EAN-sleutels zijn
      // wel te vertrouwen, want een EAN blijft een EAN. De rest gaat eruit; dan
      // begint dat product opnieuw met meten in plaats van met een verleden dat
      // bij iets anders hoort.
      if ((d.v || 1) !== SLEUTEL_VERSIE) {
        let weg = 0
        for (const k of Object.keys(d.h)) if (k[0] !== 'e') { delete d.h[k]; weg++ }
        if (weg) console.error('  logboek ' + slugNaam + ': sleutelversie gewijzigd, ' + weg + ' regels op naam weggegooid')
      }
      return d.h
    } catch (e) { console.error('  logboek', slugNaam, 'onleesbaar:', String(e.message || e)) }
  }
  return {}
}

// ------------------------------------------------------- buiten het aanbod
//
// De populaire lijsten van bol (Wonen, Sport, Huishouden) en de feeds van
// 2dekansje en Action brengen ook dingen mee die niets met een prijsvergelijker
// voor elektronica en apparaten te maken hebben: een trainingspak, een
// dekbedovertrek, een wandspiegel, een droogrek. Die gaan eruit.
//
// Voorzichtig gehouden, want een woordenlijst vergist zich snel ("jack" is ook
// een stekker, "pet" ook een stofzuiger voor huisdieren):
//  - alleen in de categorieen waar deze spullen binnenkomen, niet in tech;
//  - nooit een product van Coolblue of MediaMarkt, die voeren dit niet;
//  - nooit een product dat bij twee of meer winkels ligt, want dat is een
//    echte vergelijking.
const BUITEN_CATS = new Set(['wonen', 'klussen', 'huishoudelijk', 'keuken', 'speelgoed', 'verzorging', 'drogisterij', 'kantoor'])
const BUITEN_WOORDEN = [
  // kleding en sport
  'trainingspak', 'trainingsbroek', 'joggingbroek', 'sportbroek', 'broek', 't-shirt', 'tshirt', 'shirt', 'voetbalshirt', 'trui', 'sweater', 'hoodie',
  'jas', 'regenjas', 'regenpak', 'poncho', 'jurk', 'blouse', 'overhemd', 'sokken', 'sokjes', 'kousen', 'panty', 'ondergoed', 'boxershort', 'boxershorts',
  'onderbroek', 'onderbroeken', 'bh', 'legging', 'lederhose', 'dirndl', 'schoenen', 'sneakers', 'laarzen', 'slippers', 'sandalen', 'pantoffels', 'sloffen',
  'veters', 'muts', 'sjaal', 'handschoenen', 'wanten', 'pyjama', 'badjas', 'zwembroek', 'badpak', 'tenue',
  'scheenbeschermer', 'scheenbeschermers', 'kniebrace', 'enkelbrace', 'polsbrace', 'bandage', 'compressiekousen', 'compressiesokken',
  // bed, bad en raam
  'dekbedovertrek', 'dekbed', 'overtrek', 'hoeslaken', 'laken', 'lakens', 'kussensloop', 'hoofdkussen', 'sierkussen', 'handdoek', 'handdoeken',
  'gastendoek', 'gastendoeken', 'theedoek', 'theedoeken', 'vaatdoek', 'vaatdoeken', 'washandjes', 'badmat', 'badlaken', 'molton', 'matrasbeschermer',
  'gordijn', 'gordijnen', 'vitrage', 'vliegengordijn', 'tafelkleed', 'tafelzeil', 'placemat', 'placemats', 'plaid', 'sprei', 'vloerkleed', 'tapijt',
  'deurmat', 'hemeltje',
  // decoratie
  'wanddecoratie', 'muurdecoratie', 'wandspiegel', 'spiegel', 'schilderij', 'schilderijen', 'poster', 'fotolijst', 'fotolijsten', 'vaas', 'vazen',
  'kunstplant', 'kunstplanten', 'kunstbloemen', 'kaars', 'kaarsen', 'geurkaars', 'geurkaarsen', 'kandelaar', 'waxinelichtjes', 'kerstboom',
  'kerstballen', 'slinger', 'ballonnen', 'behang', 'wandsticker', 'muursticker',
  // huisraad zonder stekker
  'droogrek', 'wasrek', 'wanddroogrek', 'droogmolen', 'kledinghanger', 'kledinghangers', 'kleerhanger', 'kleerhangers', 'kledingrek', 'wasmand',
  'wasmandkast', 'waszak', 'strijkplank', 'schoenenrek', 'kapstok'
]
const BUITEN_RE = new RegExp('(?<![\\w-])(' + BUITEN_WOORDEN.join('|') + ')(?![\\w-])', 'i')
// Lego en ander speelgoed noemt soms een jurk of een kerstboom; dat blijft speelgoed.
// En wat een stekker, accu of motor heeft is een apparaat, ook als er "tapijt" of "droogrek" in de naam staat
// (een robotstofzuiger voor tapijt, een pastamachine met droogrek).
const BUITEN_NIET = /\b(lego|playmobil|barbie|digitale fotolijst|robotstofzuiger|stofzuiger|stoomreiniger|hogedrukreiniger|\w*machine|elektrische?|oplaadbaar|oplaadbare|accu|led|usb)\b/i

// Daarbovenop, voor wat alleen bij bol, 2dekansje of Action ligt: buiten tech en
// speelgoed blijft alleen staan wat een apparaat is. Shampoo, tandpasta,
// balpennen, agenda's, pannen, scheenbeschermers en vliegengordijnen gaan eruit;
// een fohn, een airfryer, een accuboormachine en een slimme deurbel blijven.
// Bij Klussen houdt dat alleen elektrisch gereedschap over.
//
// Een apparaat herken ik aan de soort (stofzuiger, blender), aan stroom in de
// naam (accu, 1200 W, usb) of aan een merk dat alleen apparaten maakt. Er wordt
// alleen naar het begin van de naam gekeken: verkopers op bol plakken er een
// rij zoekwoorden achter ("geschikt voor oven en magnetron").
const APPARAAT_CATS = new Set(['wonen', 'klussen', 'huishoudelijk', 'keuken', 'verzorging', 'drogisterij', 'kantoor'])
const BREDE_WINKEL = /^(bol\.com|2dekansje|action)/i
const AP_STROOM = /(?<![\w-])(elektrische?|accu|accu-\w+|oplaadba(ar|re)|usb|usb-c|snoerloos|snoerloze|draadloze?|bluetooth|wifi|wi-fi|smart|slimme (stekker|lamp|deurbel|thermostaat|speaker|weegschaal)|digitale?|led|sensor|thermostaat|\d+ ?(w|watt|v|volt|mah|pa|bar)|\d+(?:[.,]\d+)? ?(kw|ah))(?![\w-])/i
const AP_SOORT = /(?<![\w-])(\w*machine|\w*apparaat|\w*apparaten|robot\w*|\w*stofzuiger|kruimeldief|stoomreiniger|\w*strijkijzer|stoomgenerator|kledingstomer|steamer|airfryer|friteuse|\w*blender|\w*mixer|waterkoker|broodrooster|tosti-ijzer|contactgrill|gourmetset|magnetron|\w*oven|koelkast|vriezer|vrieskist|vaatwasser|wasdroger|droogkast|afzuigkap|kookplaat|\w*ventilator|airco|\w*kachel|heater|luchtreiniger|luchtbevochtiger|luchtontvochtiger|ontvochtiger|diffuser|haakse slijper|multislijper|rechte slijper|\w*zaag|\w*frees|multitool|hogedrukreiniger|bladblazer|\w*maaier|heggenschaar|grastrimmer|kettingzaag|compressor|multimeter|kruislijnlaser|afstandsmeter|\w*tandenborstel|opzetborstels?|monddouche|scheerapparaat|scheerkop\w*|tondeuse|\w*trimmer|epilator|f[oö]hn|haardroger|stijltang|krultang|warmteborstel|airstyler|ipl|massagepistool|massagegun|\w*weegschaal|bloeddrukmeter|thermometer|stekkerdoos|verlengsnoer|deurbel|rookmelder|koolmonoxidemelder|batterijen|batterij|oplader|rekenmachine|papiervernietiger|labelprinter|labelwriter|printer|soundbar|wekker|wekkerradio|radio|zaklamp|hoofdlamp|looplamp|bouwlamp|werklamp|schemerschakelaar|tijdschakelaar|dimmer|bewegingsmelder|laadpaal|omvormer|powerstation|zonnepaneel|zonnepanelen)(?![\w-])/i
const AP_MERK = /^(bosch|makita|dewalt|einhell|k[aä]rcher|black ?\+ ?decker|ryobi|metabo|hikoki|festool|worx|milwaukee|philips|braun|oral-b|babyliss|remington|dyson|shark|rowenta|sage|de'?longhi|nespresso|krups|senseo|kitchenaid|ninja|princess|tristar|russell hobbs|severin|bestron|inventum|aeg|miele|siemens|samsung|lg|xiaomi|roborock|eufy|dreame|irobot|ecovacs|tineco|bissell|klikaanklikuit|calex|hombli|texas instruments|casio|hp|brother|dymo|panasonic|varta|duracell|energizer|ghd|foreo|beurer|medisana|omron|wahl|moser)\b/i

function geenApparaat (p) {
  if (!APPARAAT_CATS.has(p.c)) return false
  if ((p.o || []).length !== 1) return false
  if (!BREDE_WINKEL.test(p.o[0].w || '')) return false
  const n = String(p.n || '').trim()
  const kop = n.slice(0, 75)
  return !(AP_SOORT.test(kop) || AP_STROOM.test(kop) || AP_MERK.test(n))
}

// ---------------------------------------------------------------- populariteit
//
// Een score per product voor de sortering "Populair" en de lijst onder "Alles".
// Er is geen verkoopcijfer, dus het is een optelsom van wat wel bekend is:
//  - de soort: een console, tv of telefoon zoeken meer mensen dan een hoesje;
//  - grote titels en modellen (GTA VI, PlayStation 5, Switch 2, iPhone);
//  - de plek in de populaire lijst van bol;
//  - bij hoeveel winkels hij ligt, en of Coolblue of MediaMarkt hem voert;
//  - korting.
// Refurbished, heel goedkope spullen en accessoires zakken.
const POP_SOORT = [
  [/^consoles$/, 60], [/^(televisies|smart-tv's|4k-tv's|mini-led-tv|led-tv's|samsung oled)$/, 50], [/^mobiele telefoons$/, 45],
  [/^(playstation 5-games|pre-ordergames|nintendo switch 2-games)$/, 40], [/laptops qwerty$|^macbooks/, 35], [/^(friteuses|airfryers|ninja-airfryers)$/, 35],
  [/^(tablets|oordopjes|hoofdtelefoons|robotstofzuigers|volautomatische espressomachines)$/, 30],
  [/^(nintendo switch-games|xbox-games|games|smartwatches|soundbars|wasmachines|cup- en padmachines|lego)$/, 25],
  [/^(stofzuigers|koelkasten|vaatwassers|wasdrogers|monitoren|e-readers|bluetooth speakers|systeemcamera's|drones|action camera's|elektrische tandenborstels|controllers|playstation 5-controllers)$/, 20],
  [/^(beamers|scheerapparaten|fohns|health trackers|deurbellen|smart lampen|gaming headsets|desktops)$/, 15],
  [/hoesjes|hoezen|screenprotector|lens protector|kabel|bandjes|opladers?$|lader$|toners|cartridges|houders?$|sleeves|tassen|accessoire|beugels|afstandsbediening|filters$|opzetborstels/, -30]
]
const POP_NAAM = [
  [/grand theft auto vi\b|\bgta (vi|6)\b/i, 120],
  [/playstation 5 (pro|slim|digital)|\bps5 (pro|slim)\b|nintendo switch 2\b|xbox series [xs]\b/i, 30],
  [/iphone 1[789]\b|galaxy s2[67]\b|galaxy z (fold|flip)|pixel 1[012]\b|airpods|apple watch|\bipad\b|macbook/i, 25],
  [/ea sports fc 2[67]|call of duty|battlefield 6|mario kart|pok[eé]mon|zelda|minecraft|ghost of y[oō]tei|assassin'?s creed|elden ring/i, 25],
  [/\b(oled|qled)\b/i, 10]
]
const POP_ACCESSOIRE = /\b(hoes|hoesje|case|cover|screenprotector|beschermglas|tempered glass|kabel|adapter|oplader|houder|standaard|bandje|skin|sticker|thumb grips?)\b/i
function populariteit (p) {
  let r = 0
  const t = String(p.t || '').toLowerCase()
  const kop = String(p.n || '').slice(0, 90)
  for (const [re, w] of POP_SOORT) if (re.test(t)) { r += w; break }
  if (!t && POP_ACCESSOIRE.test(kop)) r -= 30
  for (const [re, w] of POP_NAAM) if (re.test(kop)) { r += w; break }
  const bol = p.e ? BOL_RANG.get(String(p.e)) : 0
  if (bol) r += Math.max(0, 50 - Math.floor(bol / 10))
  r += Math.min(48, 12 * Math.max(0, (p.o || []).length - 1))
  if ((p.o || []).some(o => /^(coolblue|mediamarkt)/i.test(o.w || ''))) r += 10
  if (p.v > p.p && p.p > 0) r += Math.min(15, Math.round(40 * (1 - p.p / p.v)))
  if (p.s === 'r') r -= 30
  if (p.p < 10) r -= 40; else if (p.p < 25) r -= 15
  if ((p.o || []).length === 1 && /^2dekansje/i.test(p.o[0].w || '')) r -= 10
  return Math.round(r)
}

// Zelfde toestel in tien kleuren en drie geheugens: alleen de eerste houdt zijn
// score, de volgende zakken telkens 25 punten. Anders staat "Populair" vol met
// dezelfde Galaxy.
const KLEUREN = /\b(zwart|wit|white|black|blauw|blue|sky blue|zilver|silver|grijs|gray|grey|graphite|groen|green|rood|red|roze|pink|paars|purple|violet|cobalt|goud|gold|titanium|natural|navy|mint|lavender|lila|geel|yellow|oranje|orange|beige|creme|cream|brons|bronze|jetblack|obsidian|porcelain|hazel|koraalroze|deep blue|cosmic orange|space black|starlight|midnight)\b/gi
function familie (p) {
  return String(p.n || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\b\d+\s?(gb|tb)\b/g, ' ').replace(KLEUREN, ' ')
    .replace(/\b(5g|4g|wifi|wi-fi|dual sim|los toestel|nieuw)\b/g, ' ').replace(/[^a-z0-9+ ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 5).join(' ')
}
function spreidFamilies (lijst) {
  const gezien = new Map()
  for (const p of lijst.slice().sort((a, b) => b.r - a.r || a.p - b.p)) {
    const f = p.c + '|' + familie(p)
    const k = gezien.get(f) || 0
    if (k) p.r -= 25 * k
    gezien.set(f, k + 1)
  }
}

// Een paar soorten die er bij elke winkel uit gaan, ook bij Coolblue en MediaMarkt
// en ook als ze bij meer winkels liggen: fietshelmen, flosdraad, olie in een
// flesje, harken en etiketten. Wat stroom heeft blijft (een elektrische hark).
const ALTIJD_TYPE = /^(fiets ?helmen|helmen|labels|etiketten)$/i
const ALTIJD_NAAM = /(?<![\w-])((fiets|ebike|e-bike|veiligheids|skate|ski|kinder|baby|bouw|motor)?-?helm(en)?|flosdraad|floss|tandzijde|(tuin|blad|bladeren|gras|gazon|hand|multi|verticuteer|vericuteer|grind|hooi)?-?hark(en|je)?|etiket|etiketten|labeltape|labelrol|labels)(?![\w-])|(?<![\w-])\w*olie(?![\w-])\s*[-–,]?\s*\d+(?:[.,]\d+)?\s?ml\b|(?<![\w-])(tondeuse|onderhouds|smeer|naaimachine)\s?-?olie(?![\w-])/i
const ALTIJD_NIET = /(?<![\w-])(elektrische?|accu|oplaadba(ar|re)|labelprinter|labelmaker|\d+ ?(w|watt|v|volt))(?![\w-])/i
function altijdBuiten (p) {
  if (!APPARAAT_CATS.has(p.c)) return false
  if (ALTIJD_TYPE.test(String(p.t || '').trim())) return true
  const kop = String(p.n || '').slice(0, 75)
  return ALTIJD_NAAM.test(kop) && !ALTIJD_NIET.test(kop)
}

function buitenAanbod (p) {
  if (altijdBuiten(p)) return true
  if (!BUITEN_CATS.has(p.c)) return false
  if ((p.o || []).length !== 1) return false
  if (/^(coolblue|mediamarkt)/i.test(p.o[0].w || '')) return false
  if (geenApparaat(p)) return true
  const n = String(p.n || '')
  return BUITEN_RE.test(n) && !BUITEN_NIET.test(n)
}

// Ondergrens waaronder we het logboek met rust laten. Loopt het ophalen van een
// feed mis, dan komt de generator hier aan met een handvol producten en zou hij
// het logboek overschrijven met bijna niets. Dat is onherstelbaar: de
// geschiedenis van gisteren is dan weg. De workflow weigert zo'n run ook te
// pushen, maar die rem hoort hier ook te zitten, al is het alleen voor wie het
// script met de hand draait.
const LOG_ONDERGRENS = 5000

function prijslogboek (producten) {
  if (producten.length < LOG_ONDERGRENS) {
    console.error('\n!! Maar ' + producten.length + ' producten (ondergrens ' + LOG_ONDERGRENS + ').' +
      '\n!! Het prijslogboek wordt NIET bijgewerkt, want dan zou de geschiedenis' +
      '\n!! overschreven worden met een halve run. Kijk eerst wat er misging bij' +
      '\n!! het ophalen van de feeds.\n')
    return
  }
  const vandaag = new Date().toISOString().slice(0, 10)
  const perCat = new Map()
  for (const p of producten) {
    if (!perCat.has(p.c)) perCat.set(p.c, [])
    perCat.get(p.c).push(p)
  }

  let nieuw = 0; let gelijk = 0; let regels = 0
  for (const c of CATEGORIEEN) {
    const lijst = perCat.get(c.slug)
    if (!lijst || !lijst.length) continue
    const hist = leesHist(c.slug)

    for (const p of lijst) {
      for (const o of p.o) {
        const k = p.i + '|' + o.w
        let r = hist[k]
        if (!Array.isArray(r)) r = hist[k] = []
        const laatste = r.length ? r[r.length - 1] : null
        if (laatste && Math.abs(laatste[1] - o.p) < 0.005) {
          // zelfde prijs: alleen de datum van de laatste meting bijwerken, zodat
          // je weet dat hij vandaag nog gold en niet gewoon uit de feed verdween
          laatste[2] = vandaag
          gelijk++
        } else {
          r.push([vandaag, o.p, vandaag])
          if (r.length > HIST_MAX) r.splice(0, r.length - HIST_MAX)
          nieuw++
        }

        // Wat de pagina mag beweren over deze prijs, en niets meer dan dat.
        // lp = laagst gemeten prijs, lpd = datum daarvan, sinds = sinds wanneer
        // de huidige prijs geldt, mt = aantal keer gemeten.
        let lp = r[0][1]; let lpd = r[0][0]
        for (const e of r) if (e[1] < lp) { lp = e[1]; lpd = e[0] }
        o.lp = Math.round(lp * 100) / 100
        o.lpd = lpd
        o.sinds = r[r.length - 1][0]
        o.mt = r.length
      }

      // op productniveau het beste aanbod samenvatten
      const b = p.o[0]
      if (b) {
        p.lp = b.lp
        p.sinds = b.sinds
        p.dg = Math.max(0, Math.round((Date.parse(vandaag) - Date.parse(b.sinds)) / 864e5))
        p.mt = b.mt
      }
    }

    // producten die uit de feed verdwenen houden we een tijdje aan, daarna weg
    const grens = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10)
    for (const k of Object.keys(hist)) {
      const r = hist[k]
      if (!Array.isArray(r) || !r.length) { delete hist[k]; continue }
      const gezien = r[r.length - 1][2] || r[r.length - 1][0]
      if (gezien < grens) { delete hist[k]; continue }
      regels += r.length
    }

    schrijf(HIST_DIR + '/' + c.slug + '.json', { cat: c.slug, v: SLEUTEL_VERSIE, bij: vandaag, h: hist }, true)
  }
  console.log('Prijslogboek: ' + nieuw + ' nieuwe prijspunten, ' + gelijk +
    ' onveranderd, ' + regels + ' regels in totaal')
}

async function main () {
  const rauw = []
  bolLeesVerkopers()
  leesAmazon()

  const awin = await haalAwin()
  for (const r of awin) { const it = uitAwin(r); if (it) rauw.push(it) }

  if (!MM_TOKEN) {
    throw new Error('MM_TOKEN ontbreekt. Zet die als repository secret ' +
      '(Settings -> Secrets and variables -> Actions).')
  }
  let mmAantal = 0
  for (const feed of MM_FEEDS) {
    const ps = await haalMmFeed(feed.fid)
    let n = 0
    for (const q of ps) { const it = uitMm(q, feed); if (it) { rauw.push(it); n++ } }
    mmAantal += n
    console.log('MediaMarkt', feed.naam, '(' + feed.fid + '):', ps.length, 'op', n, 'bruikbaar')
  }

  // Zonder MediaMarkt is er niets om Coolblue mee te vergelijken: de koppeling
  // op EAN heeft twee winkels nodig. De run van 3 oktober 10:38 liep zo: hij
  // leverde 47.727 producten op en nul die bij meer dan een winkel lagen, omdat
  // MM_TOKEN niet als secret stond. De controle in de workflow keek alleen naar
  // het totaal en liet dat dus door. Daarom hier een eigen ondergrens.
  const MM_ONDERGRENS = 3000
  if (mmAantal < MM_ONDERGRENS) {
    throw new Error('Maar ' + mmAantal + ' bruikbare producten van MediaMarkt (ondergrens ' +
      MM_ONDERGRENS + '). Staat er HTTP 403 of 401 hierboven, dan is MM_TOKEN verlopen of ' +
      'gedraaid. Zonder MediaMarkt valt er niets te vergelijken, dus hier stoppen.')
  }

  // Nedgame, voor bol: zo neemt bol de EAN's van Nedgame mee in zijn ronde, en
  // krijgt een game die alleen Nedgame had er een bol-prijs naast.
  {
    const ng = await haalNedgame()
    const perEan = new Map()
    for (const it of rauw) if (it.ean && it.staat !== 'refurbished' && !perEan.has(it.ean)) perEan.set(it.ean, it)
    let bij = 0; let nieuw = 0
    for (const r of ng) {
      const e = /^\d{11,12}$/.test(r.EAN || '') ? r.EAN.padStart(13, '0') : r.EAN
      const basis = e ? perEan.get(e) : undefined
      const it = uitNedgame(r, basis)
      if (!it) continue
      rauw.push(it)
      if (basis) bij++; else nieuw++
    }
    console.log('Nedgame: ' + bij + ' bij bestaande producten, ' + nieuw + ' nieuwe producten')

    let th = []
    try { th = await leesTtFeed(NEDGAME_TWEEDEHANDS, process.env.LOKAAL_NEDGAME_TWEEDEHANDS) } catch (e) {
      console.log('Nedgame tweedehands niet opgehaald (' + e.message + ')')
    }
    for (const it of rauw) if (it.ean && it.staat !== 'refurbished' && !perEan.has(it.ean)) perEan.set(it.ean, it)
    let gebruikt = 0
    for (const r of th) {
      const top = String(r.categoryPath || '').split(' > ')[0].trim()
      if (!NEDGAME_HUIDIG[top]) continue
      const e = /^\d{11,12}$/.test(r.EAN || '') ? r.EAN.padStart(13, '0') : r.EAN
      const basis = e ? perEan.get(e) : undefined
      if (!basis) continue
      const it = uitNedgame(Object.assign({}, r, { condition: 'Nieuw', fromPrice: '' }), basis)
      if (!it) continue
      // Duurder dan nieuw is geen aanbieding; dat komt bij oude voorraad voor.
      if (it.prijs >= basis.prijs) continue
      it.staat = 'refurbished'
      it.gebruikt = 1
      rauw.push(it)
      gebruikt++
    }
    console.log('Nedgame tweedehands: ' + th.length + ' regels, ' + gebruikt + ' naast een nieuw exemplaar')
  }

  // bol breed: per categorie ophalen, vijftig tegelijk, met prijs erbij. Dit
  // levert ook producten op die bij de andere winkels niet in de feed staan,
  // zoals de PlayStation 5 en de Xbox.
  const bolBreed = await haalBolBreed()
  const bolGedaan = new Set()          // deze ronde al bij de losse route geweest
  if (bolBreed.length) {
    const perEanBestaand = new Map()
    for (const it of rauw) if (it.ean && !perEanBestaand.has(it.ean)) perEanBestaand.set(it.ean, it)
    await bolControleer(bolBreed, new Set(perEanBestaand.keys()), bolGedaan)
    let nieuwe = 0; let erbij = 0; let ongecontroleerd = 0
    for (const b of bolBreed) {
      if (b.weg) continue                        // bol heeft hier geen aanbod meer
      const basis = perEanBestaand.get(b.ean)
      const eigen = bolIsEigen(b.verkoper)
      // Een marktplaatsverkoper krijgt een eigen winkelnaam. Dan staat er op de
      // kaart "bol.com partner" met de verkoper erbij, en niet "bol.com", want
      // dat is een ander aanbod met een andere prijs en soms een andere
      // levertijd. Weglaten doe ik ze niet: je kunt ze echt kopen.
      const winkel = b.gecontroleerd && !eigen ? 'bol.com partner' : 'bol.com'
      if (!b.gecontroleerd) ongecontroleerd++
      // Eerst op de productnaam proberen, want dat is nauwkeuriger dan de
      // afdeling waar bol hem onder hangt. Lukt dat niet, dan de categorie van
      // de bol-afdeling. Zonder die terugval viel 14.000 van de 22.688
      // producten weg omdat de naam geen trefwoord bevatte.
      let cat = basis ? basis.cat : bepaalCat('', b.naam, 'bol.com', '')
      if (!GELDIG.has(cat) && b.bolCat) cat = b.bolCat
      if (!GELDIG.has(cat)) continue
      if (basis) erbij++; else nieuwe++
      rauw.push({
        bron: 'bol',
        naam: basis ? basis.naam : b.naam,
        merk: basis ? basis.merk : '',
        prijs: b.prijs,
        van: b.van,
        winkel,
        verkoper: eigen ? '' : (b.verkoper || ''),
        // Niet gecontroleerd betekent: deze prijs mag niet meedoen in een
        // vergelijking. koppel() haalt hem daar uit.
        bolOnbekend: !b.gecontroleerd,
        url: bolLink(b.url, b.naam),
        afb: (basis && basis.afb) || b.afb,
        ean: b.ean,
        type: basis ? basis.type : '',
        cat,
        voorraad: b.voorraad,
        staat: 'nieuw',
        kleur: '',
        verzend: 0
      })
    }
    console.log('bol breed: ' + erbij + ' bij bestaande producten, ' + nieuwe +
      ' nieuwe producten, ' + ongecontroleerd + ' zonder gecontroleerde verkoper')
  }

  // bol erbij, op EAN. Dit kan niet eerder: bolKies gebruikt wat de andere
  // feeds al opgeleverd hebben om te bepalen welke EAN's de moeite waard zijn.
  const bolRijen = await haalBol(rauw, bolGedaan)
  if (bolRijen.length) {
    const perEan = new Map()
    for (const it of rauw) if (it.ean && !perEan.has(it.ean)) perEan.set(it.ean, it)
    for (const b of bolRijen) {
      const basis = perEan.get(b.ean)
      if (!basis) continue
      const eigen = bolIsEigen(b.aanbod.verkoper)
      rauw.push({
        bron: 'bol',
        naam: basis.naam,
        merk: basis.merk,
        prijs: b.aanbod.prijs,
        van: b.aanbod.van,
        winkel: eigen ? 'bol.com' : 'bol.com partner',
        verkoper: eigen ? '' : b.aanbod.verkoper,
        url: bolLink(b.aanbod.url, basis.merk || basis.naam),
        afb: basis.afb,
        ean: b.ean,
        type: basis.type,
        cat: basis.cat,
        voorraad: b.aanbod.voorraad,
        staat: 'nieuw',
        kleur: '',
        verzend: 0
      })
    }
    console.log('bol: ' + bolRijen.length + ' aanbiedingen aan bestaande producten gekoppeld (' +
      bolRijen.filter(b => !bolIsEigen(b.aanbod.verkoper)).length + ' via een partner)')
  }

  // Amazon als winkel. Alleen een prijs waarvan de verkoper gelezen is, en
  // dezelfde regel als bij bol: verkoopt Amazon zelf, dan heet de winkel
  // Amazon; is het een marktplaatsverkoper, dan Amazon partner met de naam
  // erbij. Vanaf hier doet hij gewoon mee: in de vergelijking, in wie
  // goedkoopst is, en in het prijslogboek.
  if (amazonPrijs.size) {
    const perEan = new Map()
    for (const it of rauw) if (it.ean && it.staat !== 'refurbished' && !perEan.has(it.ean)) perEan.set(it.ean, it)
    let n = 0
    for (const [ean, a] of amazonPrijs) {
      const basis = perEan.get(ean)
      if (!basis || !a.vk) continue
      rauw.push({
        bron: 'amazon',
        naam: basis.naam,
        merk: basis.merk,
        prijs: a.p,
        van: 0,
        winkel: a.eigen ? 'Amazon' : 'Amazon partner',
        verkoper: a.eigen ? '' : a.vk,
        url: 'https://www.amazon.nl/dp/' + amazonEan.get(ean) + '?tag=' + encodeURIComponent(amazonLabel),
        afb: basis.afb,
        ean,
        type: basis.type,
        cat: basis.cat,
        voorraad: 1,
        staat: 'nieuw',
        kleur: '',
        verzend: 0
      })
      n++
    }
    console.log('Amazon: ' + n + ' prijzen als winkel in de vergelijking')
  }

  console.log('Totaal bruikbaar:', rauw.length)
  const gekoppeld = koppel(rauw)
  const producten = gekoppeld.filter(p => !buitenAanbod(p))
  for (const p of producten) p.r = populariteit(p)
  spreidFamilies(producten)
  if (producten.length < gekoppeld.length) console.log('Buiten het aanbod gehouden (geen apparaat, of kleding, textiel, decoratie, huisraad):', gekoppeld.length - producten.length)
  console.log('Na koppelen:', producten.length, 'producten,',
    producten.filter(p => p.o.length > 1).length, 'met meer dan een winkel')
  if (onmogelijkePrijzen) console.log('  ' + onmogelijkePrijzen + ' prijzen uit een vergelijking gehouden omdat ze onder een derde van de middelste prijs lagen')
  if (onmogelijkeKortingen) console.log('  ' + onmogelijkeKortingen + ' doorgestreepte prijzen niet overgenomen (meer dan 80 procent korting)')
  if (ongecontroleerdUitVergelijking) {
    console.log('  ' + ongecontroleerdUitVergelijking + ' bol-prijzen uit een vergelijking gehouden ' +
      'omdat de verkoper niet gecontroleerd was')
  }
  bolSchrijfVerkopers()

  // Eerst het logboek, want dat vult per product de laagst gemeten prijs en
  // sinds wanneer de huidige prijs geldt. Die velden horen in de bestanden die
  // de worker leest, anders moet die het logboek erbij ophalen voor elk product.
  prijslogboek(producten)

  // per categorie wegschrijven, gesorteerd op prijs
  // De commit erbij, zodat de worker de grote bestanden bij jsDelivr op precies
  // deze versie kan opvragen. Een URL met een commit mag jsDelivr voor altijd
  // cachen; een URL met @main cachet hij twaalf uur en dan loopt de pagina
  // achter op de feed.
  const index = {
    gemaakt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || '',
    categorieen: [],
    winkels: {},
    totaal: producten.length,
    zoekBuiten: ['kantoor', 'drogisterij']
  }
  const perCat = new Map()
  for (const p of producten) {
    if (!perCat.has(p.c)) perCat.set(p.c, [])
    perCat.get(p.c).push(p)
  }

  // Alleen de categoriebestanden opruimen. Niet de hele map: data/shop/hist
  // staat hieronder en dat is het prijslogboek, dat juist moet blijven staan.
  try {
    for (const f of fs.readdirSync(UIT)) {
      if (/^c-.*\.json(\.gz)?$/.test(f)) fs.rmSync(path.join(UIT, f), { force: true })
    }
  } catch (e) { /* map bestaat nog niet */ }

  for (const c of CATEGORIEEN) {
    const lijst = (perCat.get(c.slug) || []).sort((a, b) => a.p - b.p)
    if (!lijst.length) continue

    const merken = {}
    const winkels = {}
    const types = {}
    for (const p of lijst) {
      if (p.b) merken[p.b] = (merken[p.b] || 0) + 1
      if (p.t) types[p.t] = (types[p.t] || 0) + 1
      for (const o of p.o) winkels[o.w] = (winkels[o.w] || 0) + 1
    }
    const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, v])

    schrijf(UIT + '/c-' + c.slug + '.json', {
      slug: c.slug, naam: c.naam, gemaakt: index.gemaakt, aantal: lijst.length, p: lijst
    }, true)

    index.categorieen.push({
      slug: c.slug,
      naam: c.naam,
      kop: !!c.kop,
      aantal: lijst.length,
      vanaf: lijst[0] ? lijst[0].p : 0,
      tot: lijst[lijst.length - 1] ? lijst[lijst.length - 1].p : 0,
      korting: lijst.filter(p => p.v > p.p).length,
      multi: lijst.filter(p => p.o.length > 1).length,
      merken: top(merken, 30),
      winkels: top(winkels, 12),
      types: top(types, 40)
    })
    for (const [w, n] of Object.entries(winkels)) index.winkels[w] = (index.winkels[w] || 0) + n
  }

  // "Alles": de populairste producten over alle categorieen, zodat de pagina daar
  // kan openen met wat de meeste mensen zoeken (consoles, tv's, nieuwe games).
  // Niet alle 38.000: dat bestand zou de worker bij elke koude start te zwaar
  // vallen. Per categorie maximaal 900, zodat het niet een lijst vol hoesjes wordt.
  {
    // Om en om uit de categorieen, met meer beurten voor wat het meest gezocht wordt,
    // zodat de eerste pagina een mix is van games, consoles, tv's, telefoons en meer.
    const BEURTEN = { gaming: 3, telefoons: 2, 'tv-beeld': 2, laptops: 1, audio: 1, keuken: 1, huishoudelijk: 1, speelgoed: 1, foto: 0.5, verzorging: 0.5, 'slim-huis': 0.5, randapparatuur: 0.5, klussen: 0.25 }
    const rij = {}
    for (const p of producten) if (p.r > 0 && BEURTEN[p.c]) (rij[p.c] = rij[p.c] || []).push(p)
    for (const k of Object.keys(rij)) rij[k] = rij[k].sort((a, b) => b.r - a.r || a.p - b.p).slice(0, 900)
    const alles = []; const tegoed = {}
    while (alles.length < 4000 && Object.values(rij).some(l => l.length)) {
      for (const [k, w] of Object.entries(BEURTEN)) {
        if (!rij[k] || !rij[k].length) continue
        tegoed[k] = (tegoed[k] || 0) + w
        while (tegoed[k] >= 1 && rij[k].length && alles.length < 4000) { alles.push(rij[k].shift()); tegoed[k] -= 1 }
      }
    }
    // In dit bestand is r de plek in deze volgorde, zodat "Populair" de mix laat staan.
    for (let i = 0; i < alles.length; i++) alles[i] = { ...alles[i], r: alles.length - i }
    if (alles.length) {
      const merken = {}; const winkels = {}; const types = {}
      for (const p of alles) {
        if (p.b) merken[p.b] = (merken[p.b] || 0) + 1
        if (p.t) types[p.t] = (types[p.t] || 0) + 1
        for (const o of p.o) winkels[o.w] = (winkels[o.w] || 0) + 1
      }
      const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n)
      schrijf(UIT + '/c-alles.json', { slug: 'alles', naam: 'Populair', gemaakt: index.gemaakt, aantal: alles.length, p: alles }, true)
      index.categorieen.push({
        slug: 'alles', naam: 'Populair', kop: false, alles: true, aantal: alles.length,
        vanaf: Math.min(...alles.map(p => p.p)), tot: Math.max(...alles.map(p => p.p)),
        korting: alles.filter(p => p.v > p.p).length, multi: alles.filter(p => p.o.length > 1).length,
        merken: top(merken, 30), winkels: top(winkels, 12), types: top(types, 40)
      })
      console.log('Alles (populair): ' + alles.length + ' producten, bovenaan: ' + alles.slice(0, 5).map(p => p.n.slice(0, 40)).join(' | '))
    }
  }

  // Zichtbaar maken wat er van winkels zonder samenwerking komt. Niet om het
  // te verbergen, wel om te kunnen zien hoeveel van de vergelijker geld kan
  // opleveren en hoeveel niet.
  const zonder = {}
  for (const p of producten) for (const o of p.o) if (NIET_AANGESLOTEN.has(o.w)) zonder[o.w] = (zonder[o.w] || 0) + 1
  index.nietAangesloten = zonder
  if (Object.keys(zonder).length) {
    const n = Object.values(zonder).reduce((a, b) => a + b, 0)
    console.log('Let op: ' + n + ' aanbiedingen komen van winkels zonder Awin-samenwerking (' +
      Object.keys(zonder).join(', ') + '). Een klik daar levert geen commissie op.')
  }

  schrijf(UIT + '/index.json', index)

  // Lichte zoekindex over alle categorieen heen. Zonder deze zou zoeken zonder
  // categorie alle zeventien bestanden moeten openen.
  //
  // Kantoorartikelen en drogisterij blijven hier buiten: dat zijn samen bijna
  // 24.000 pennen, toners en parfums, en met hen erbij wordt de index 5,4 MB.
  // Dat is te zwaar om bij elke koude start van de worker te ontleden. Binnen
  // hun eigen chip blijven ze gewoon doorzoekbaar, want daar leest de worker
  // het categoriebestand zelf.
  const BUITEN_ZOEK = new Set(index.zoekBuiten)
  const zoekbaar = producten.filter(p => !BUITEN_ZOEK.has(p.c))
  schrijf(UIT + '/zoek.json', {
    gemaakt: index.gemaakt,
    buiten: [...BUITEN_ZOEK],
    p: zoekbaar.map(p => [p.i, p.n.slice(0, 80), p.c, p.p, p.o.length])
  }, true)

  // Aparte lijst met alles waar nu een echte "van"-prijs op staat. Dit is de
  // basis voor de Black Friday-pagina: een korting die de winkel zelf opgeeft.
  // Of die korting echt is, controleer ik met mijn eigen prijslogboek.
  const deals = producten.filter(p => p.v > p.p)
    .map(p => Object.assign({}, p, { k: Math.round((1 - p.p / p.v) * 100) }))
    .sort((a, b) => b.k - a.k)
    .slice(0, 3000)
  schrijf(UIT + '/deals.json', { gemaakt: index.gemaakt, aantal: deals.length, p: deals }, true)

  // Producten die bij meer dan een winkel liggen: daar is vergelijken zinvol.
  const vgl = producten.filter(p => p.o.length > 1)
    .sort((a, b) => (b.o[b.o.length - 1].p - b.o[0].p) - (a.o[a.o.length - 1].p - a.o[0].p))
    .slice(0, 2000)
  schrijf(UIT + '/vergelijk.json', { gemaakt: index.gemaakt, aantal: vgl.length, p: vgl }, true)

  console.log('\nKlaar.')
  for (const c of index.categorieen) {
    console.log(String(c.aantal).padStart(6), c.slug, '| korting', c.korting, '| multi-winkel', c.multi)
  }
  const samengevouwen = rauw.length - producten.reduce((s, p) => s + p.o.length, 0)
  if (samengevouwen > 0) console.log('(' + samengevouwen + ' dubbele varianten samengevouwen)')
}

main().catch(e => { console.error(e); process.exit(1) })
