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

const AWIN_KEY = process.env.AWIN_KEY || ''
const MM_TOKEN = process.env.MM_TOKEN || ''

const AWIN_FIDS = '19979,61111,65453,82771,89758,95829,95830,95831,95833,95834,95835,95836,95839,95886,95887,95888,95889,95890,95892,95893,95894,95895,95896,95897,95898,95902,95903,95904,95927,95929,95932,95938,95939,95940,96487,96636,99064,101992,111946,115421,116143,117541,117569'
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

const MM_LOGO = 'https://hst.tradedoubler.com/file/262336/MM-logo.png'

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
  ['laptops', /\b(macbook|laptop|notebook|chromebook|imac|mac mini|mac studio|monitor \d|beeldscherm)\b/i],
  ['tv-beeld', /\b(oled|qled|smart ?tv|televisie|\d{2} inch tv|beamer|projector)\b/i],
  ['audio', /\b(airpods|koptelefoon|oordopjes|earbuds|soundbar|speaker|platenspeler|versterker)\b/i],
  ['keuken', /\b(espresso|koffiezet|koffiemachine|nespresso|dolce gusto|senseo|airfryer|friteuse|blender|waterkoker|pannenset|koekenpan)\b/i],
  ['huishoudelijk', /\b(koelkast|wasmachine|wasdroger|vaatwasser|stofzuiger|vriezer|oven|magnetron|afzuigkap|kookplaat|strijkijzer|airco|ventilator)\b/i],
  ['verzorging', /\b(tandenborstel|scheerapparaat|haardroger|fohn|stijltang|tondeuse|trimmer|epilator|shampoo|conditioner)\b/i],
  ['foto', /\b(camera|objectief|lens \d|dslr|gopro|drone|statief|dashcam)\b/i],
  ['slim-huis', /\b(philips hue|slimme lamp|smart lamp|thermostaat|rookmelder|deurbel|babyfoon|slimme stekker)\b/i],
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

function parseCsvText (text) {
  const rows = []
  let field = ''; let row = []; let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false } else field += c
    } else {
      if (c === '"') inQ = true
      else if (c === ',') { row.push(field); field = '' } else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' } else if (c === '\r') { /* skip */ } else field += c
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
  const merchant = (r.merchant_name || '').replace(/\s+(NL|NL-BE|BE)$/i, '').trim()
  const cat = bepaalCat(r.product_type, naam, r.merchant_name, r.merchant_category || r.merchant_product_category_path)
  if (!GELDIG.has(cat)) return null
  // "van"-prijs: alleen als hij echt hoger is. rrp_price is in deze feed in
  // 0 van de 95.000 regels gevuld, product_price_old in ongeveer 2 procent.
  let van = num(r.product_price_old) || num(r.store_price) || num(r.rrp_price)
  if (!(van > prijs * 1.01)) van = 0
  return {
    bron: 'awin',
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
    staat: /refurb|gebruikt|tweedehands|used/i.test((r.condition || '') + ' ' + (r.product_type || '')) ? 'refurbished' : 'nieuw',
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

// ------------------------------------------------------------------ koppelen

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

  const perSleutel = new Map()
  let los = 0
  let viaBrug = 0
  for (const it of items) {
    let k
    if (it.ean) k = 'e' + it.ean
    else {
      const ns = naamSleutel(it.naam)
      const sl = ns ? it.cat + '|' + ns : ''
      const ean = sl ? naamNaarEan.get(sl) : undefined
      if (ean) { k = 'e' + ean; viaBrug++ } else k = sl ? 'n' + hash(sl) : 'u' + (los++)
    }
    if (!perSleutel.has(k)) perSleutel.set(k, [])
    perSleutel.get(k).push(it)
  }
  if (viaBrug) console.log('  ' + viaBrug + ' aanbiedingen zonder EAN op naam aan een EAN-groep gekoppeld')

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
    const aanbod = [...perWinkel.values()].sort((a, b) => a.prijs - b.prijs)
    const beste = aanbod[0]
    const metAfb = aanbod.find(a => a.afb) || beste
    const metMerk = aanbod.find(a => a.merk) || beste
    // Coolblue's product_type is de nettere woordenlijst, dus die eerst
    const metType = aanbod.find(a => a.type && a.bron === 'awin') || aanbod.find(a => a.type) || beste

    uit.push({
      i: k,
      n: beste.naam.slice(0, 120),
      b: (metMerk.merk || '').slice(0, 30),
      c: beste.cat,
      t: nettSoort(metType.type, beste.cat, ''),
      p: Math.round(beste.prijs * 100) / 100,
      v: beste.van ? Math.round(beste.van * 100) / 100 : 0,
      im: metAfb.afb,
      e: beste.ean,
      s: beste.staat === 'refurbished' ? 'r' : 'n',
      o: aanbod.map(a => ({
        w: a.winkel,
        p: Math.round(a.prijs * 100) / 100,
        v: a.van ? Math.round(a.van * 100) / 100 : 0,
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

  const awin = await haalAwin()
  for (const r of awin) { const it = uitAwin(r); if (it) rauw.push(it) }

  if (MM_TOKEN) {
    for (const feed of MM_FEEDS) {
      const ps = await haalMmFeed(feed.fid)
      let n = 0
      for (const q of ps) { const it = uitMm(q, feed); if (it) { rauw.push(it); n++ } }
      console.log('MediaMarkt', feed.naam, '(' + feed.fid + '):', ps.length, 'op', n, 'bruikbaar')
    }
  } else {
    console.error('MM_TOKEN ontbreekt, MediaMarkt wordt overgeslagen')
  }

  console.log('Totaal bruikbaar:', rauw.length)
  const producten = koppel(rauw)
  console.log('Na koppelen:', producten.length, 'producten,',
    producten.filter(p => p.o.length > 1).length, 'met meer dan een winkel')

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
  const zonder = rauw.length - producten.reduce((s, p) => s + p.o.length, 0)
  if (zonder > 0) console.log('(' + zonder + ' dubbele varianten samengevouwen)')
}

main().catch(e => { console.error(e); process.exit(1) })
