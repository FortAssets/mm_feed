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
  { id: 'pixel-11-pro', cid: '9355', rubriek: /cell phones|smartphone/i, naam: 'Google Pixel 11 Pro (unlocked)', cat: 'Phones', q: 'Google Pixel 11 Pro unlocked 256GB', moet: /pixel 11 pro.*unlocked|unlocked.*pixel 11 pro/i, niet: /xl|fold|case|screen|verizon|vzw|at&t|t-mobile|tmobile|locked to/i, msrp: 1099 },
  { id: 'galaxy-s26-ultra', cid: '9355', rubriek: /cell phones|smartphone/i, naam: 'Samsung Galaxy S26 Ultra (unlocked)', cat: 'Phones', q: 'Samsung Galaxy S26 Ultra unlocked 256GB', moet: /s26 ultra.*unlocked|unlocked.*s26 ultra/i, niet: /case|screen|protector|verizon|vzw|at&t|t-mobile|tmobile|locked to/i, msrp: 1399.99 },
  { id: 'gopro-hero13', rubriek: /camera|camcorder/i, naam: 'GoPro HERO13 Black', cat: 'Cameras', q: 'GoPro HERO13 Black', moet: /hero ?13/i, niet: /battery only|mount only|housing/i, msrp: 399.99 },
  { id: 'dji-mini-4-pro', rubriek: /drone/i, naam: 'DJI Mini 4 Pro', cat: 'Cameras', q: 'DJI Mini 4 Pro', moet: /mini 4 pro/i, niet: /battery only|propeller|controller|remote|\brc[ -]?(2|n\d)|goggles|charging hub|for (dji )?mini|combo|fly more/i, msrp: 759 },
  { id: 'airtag-4-pack', naam: 'Apple AirTag 2nd gen (4-pack)', cat: 'Accessories', q: 'Apple AirTag 2nd generation 4 pack', moet: /airtag.*(4[- ]?pack|4pk|pack of 4|4 count)|(4[- ]?pack|4pk|pack of 4).*airtag/i, niet: /holder|case|keychain|cover|\b1[- ]?pack|\b2[- ]?pack|single|loop|wallet|\bjapan\b|lunar|year of|engrav|limited/i, msrp: 99 },
  // ---------- Toegevoegd 24 okt 2026 (adviesprijzen gecontroleerd 24 okt 2026, zie thepricepickr research) ----------
  { id: 'airpods-max-2', rubriek: /headphone|headset/i, naam: 'AirPods Max 2', cat: 'Audio', q: 'Apple AirPods Max 2', moet: /airpods max 2|airpods max \(2nd|airpods max 2nd/i, niet: /lightning|cushion|ear ?pads?|1st gen/i, msrp: 549 },
  { id: 'sony-wf-1000xm6', rubriek: /headphone|headset/i, naam: 'Sony WF-1000XM6', cat: 'Audio', q: 'Sony WF-1000XM6', moet: /wf-?1000 ?xm6/i, niet: /xm5|xm4/i, msrp: 329.99 },
  { id: 'bose-qc-ultra-earbuds-2', rubriek: /headphone|headset/i, naam: 'Bose QuietComfort Ultra Earbuds (2nd Gen)', cat: 'Audio', q: 'Bose QuietComfort Ultra Earbuds 2nd Gen', moet: /ultra earbuds.*2nd|2nd gen.*ultra earbuds/i, niet: /1st|open/i, msrp: 299 },
  { id: 'galaxy-buds4-pro', rubriek: /headphone|headset/i, naam: 'Samsung Galaxy Buds4 Pro', cat: 'Audio', q: 'Samsung Galaxy Buds4 Pro', moet: /buds ?4 pro/i, niet: /buds ?3|\bfe\b/i, msrp: 249.99 },
  { id: 'powerbeats-pro-2', rubriek: /headphone|headset/i, naam: 'Powerbeats Pro 2', cat: 'Audio', q: 'Beats Powerbeats Pro 2', moet: /powerbeats pro 2|powerbeats pro \(2nd|powerbeats pro 2nd/i, niet: /\bfit\b/i, msrp: 249.99 },
  { id: 'beats-360', rubriek: /headphone|headset/i, naam: 'Beats 360', cat: 'Audio', q: 'Beats 360 headphones', moet: /beats 360/i, niet: /studio|solo|buds/i, msrp: 349.99 },
  { id: 'sonos-arc-ultra', naam: 'Sonos Arc Ultra', cat: 'Audio', q: 'Sonos Arc Ultra soundbar', moet: /arc ultra/i, niet: /mount|bracket|\bsub\b|\bera\b|beam|\bset\b|bundle/i, msrp: 1099 },
  { id: 'ps5-digital', cid: '139971', rubriek: /video game consoles|mixed lots/i, naam: 'PlayStation 5 Digital Edition (1TB)', cat: 'Gaming', q: 'PlayStation 5 Digital Edition slim 1TB console', moet: /(ps5|playstation 5).*digital|digital.*(ps5|playstation 5)/i, niet: /\bpro\b|disc drive|disc edition|portal|cfi-1[01]|controller only|faceplate|cover/i, msrp: 599.99 },
  { id: 'ps-portal', naam: 'PlayStation Portal', cat: 'Gaming', q: 'PlayStation Portal remote player', moet: /playstation portal|ps portal/i, niet: /pulse|grip|\bcase\b/i, msrp: 249.99 },
  { id: 'xbox-series-s-512', cid: '139971', rubriek: /video game consoles|mixed lots/i, naam: 'Xbox Series S (512GB)', cat: 'Gaming', q: 'Xbox Series S 512GB console', moet: /series s.*512|512.*series s/i, niet: /1 ?tb|series x|2 ?tb|controller only/i, msrp: 499.99 },
  { id: 'meta-quest-3-512', rubriek: /virtual reality|vr /i, naam: 'Meta Quest 3 (512GB)', cat: 'Gaming', q: 'Meta Quest 3 512GB', moet: /quest 3\b.*512|512.*quest 3\b/i, niet: /3s|quest 2|\bpro\b|128|256/i, msrp: 599.99 },
  { id: 'steam-machine-512', naam: 'Steam Machine (512GB)', cat: 'Gaming', q: 'Valve Steam Machine 512GB', moet: /steam machine.*512|512.*steam machine/i, niet: /2 ?tb|\bdeck\b|controller only/i, msrp: 1049 },
  { id: 'apple-watch-ultra-4', rubriek: /smart ?watch/i, naam: 'Apple Watch Ultra 4', cat: 'Wearables', q: 'Apple Watch Ultra 4 49mm', moet: /watch ultra 4/i, niet: /ultra 3|ultra 2|band only|strap only/i, msrp: 799 },
  { id: 'apple-watch-se-3', rubriek: /smart ?watch/i, naam: 'Apple Watch SE 3 (GPS, 40mm)', cat: 'Wearables', q: 'Apple Watch SE 3 40mm GPS', moet: /^(?=.*watch se)(?=.*\b(3|3rd)\b)(?=.*40 ?mm)/i, niet: /44 ?mm|cellular|\blte\b|2nd|2022|band only/i, msrp: 249 },
  { id: 'pixel-watch-5', rubriek: /smart ?watch/i, naam: 'Google Pixel Watch 5 (41mm)', cat: 'Wearables', q: 'Google Pixel Watch 5 41mm', moet: /^(?=.*pixel watch 5)(?=.*41 ?mm)/i, niet: /45 ?mm|\blte\b|watch 4|band only/i, msrp: 399 },
  { id: 'galaxy-watch-ultra-2', rubriek: /smart ?watch/i, naam: 'Samsung Galaxy Watch Ultra2', cat: 'Wearables', q: 'Samsung Galaxy Watch Ultra 2 47mm', moet: /watch ultra ?2/i, niet: /band only|strap only|watch ?9|watch ?8/i, msrp: 699.99 },
  { id: 'oura-ring-5', naam: 'Oura Ring 5', cat: 'Wearables', q: 'Oura Ring 5', moet: /oura ring 5|oura ring gen ?5/i, niet: /ring 4|gen 3|sizing kit|charger/i, msrp: 399 },
  { id: 'ray-ban-meta-gen3', naam: 'Ray-Ban Meta (Gen 3)', cat: 'Wearables', q: 'Ray-Ban Meta Gen 3 smart glasses', moet: /ray-?ban meta.*(gen ?3|3rd gen)/i, niet: /gen ?2|gen ?1|display|oakley/i, msrp: 449 },
  { id: 'ipad-pro-11-m5', rubriek: /tablet/i, naam: 'iPad Pro 11" (M5)', cat: 'Tablets', q: 'Apple iPad Pro 11 M5 256GB WiFi', moet: /^(?=.*ipad pro)(?=.*\b11)(?=.*m5)(?=.*256)/i, niet: /\b13\b|m4|m2|cellular|5g|512|1 ?tb|case|keyboard|pencil/i, msrp: 1199 },
  { id: 'ipad-air-13-m4', rubriek: /tablet/i, naam: 'iPad Air 13" (M4)', cat: 'Tablets', q: 'Apple iPad Air 13 M4 128GB', moet: /^(?=.*ipad air)(?=.*\b13)(?=.*m4)/i, niet: /\b11\b|m3|m2|cellular|5g|case|keyboard/i, msrp: 949 },
  { id: 'galaxy-tab-s11', rubriek: /tablet/i, naam: 'Samsung Galaxy Tab S11', cat: 'Tablets', q: 'Samsung Galaxy Tab S11 128GB WiFi', moet: /^(?=.*tab s11)(?=.*128)/i, niet: /ultra|\bfe\b|s10|5g|case|keyboard|cover/i, msrp: 999.99 },
  { id: 'macbook-neo', rubriek: /laptop/i, naam: 'MacBook Neo', cat: 'Laptops', q: 'Apple MacBook Neo', moet: /macbook neo/i, niet: /case|skin|sleeve|charger/i, msrp: 699 },
  { id: 'macbook-air-15-m5', rubriek: /laptop/i, naam: 'MacBook Air 15" (M5)', cat: 'Laptops', q: 'Apple MacBook Air 15 M5', moet: /^(?=.*macbook air)(?=.*\b15)(?=.*m5)/i, niet: /\b13\b|m4|m3|case|skin/i, msrp: 1499 },
  { id: 'surface-laptop-8', rubriek: /laptop/i, naam: 'Surface Laptop 13.8" (8th Edition)', cat: 'Laptops', q: 'Microsoft Surface Laptop 8th Edition 13.8 16GB 512GB', moet: /surface laptop.*(8th|x2)/i, niet: /7th|x elite|15"|15-inch|business|13-inch/i, msrp: 1599.99 },
  { id: 'iphone-18-pro', cid: '9355', rubriek: /cell phones|smartphone/i, naam: 'iPhone 18 Pro 256GB (unlocked)', cat: 'Phones', q: 'iPhone 18 Pro 256GB unlocked', moet: /^(?=.*iphone 18 pro)(?=.*256)(?=.*unlocked)/i, niet: /\bmax\b|iphone 17|512|1 ?tb|2 ?tb|verizon|vzw|at&t|t-mobile|tmobile|locked to|case|screen|protector/i, msrp: 1199 },
  { id: 'iphone-18-pro-max', cid: '9355', rubriek: /cell phones|smartphone/i, naam: 'iPhone 18 Pro Max 256GB (unlocked)', cat: 'Phones', q: 'iPhone 18 Pro Max 256GB unlocked', moet: /^(?=.*iphone 18 pro max)(?=.*256)(?=.*unlocked)/i, niet: /iphone 17|512|1 ?tb|2 ?tb|verizon|vzw|at&t|t-mobile|tmobile|locked to|case|screen|protector/i, msrp: 1299 },
  { id: 'iphone-duo', cid: '9355', rubriek: /cell phones|smartphone/i, naam: 'iPhone Duo 256GB (unlocked)', cat: 'Phones', q: 'iPhone Duo 256GB unlocked', moet: /^(?=.*iphone duo)(?=.*256)(?=.*unlocked)/i, niet: /512|1 ?tb|2 ?tb|verizon|vzw|at&t|t-mobile|tmobile|locked to|case|screen|protector/i, msrp: 1999 },
  { id: 'iphone-17e', cid: '9355', rubriek: /cell phones|smartphone/i, naam: 'iPhone 17e 256GB (unlocked)', cat: 'Phones', q: 'iPhone 17e 256GB unlocked', moet: /^(?=.*iphone 17e)(?=.*256)(?=.*unlocked)/i, niet: /16e|17 pro|\bair\b|512|verizon|vzw|at&t|t-mobile|tmobile|locked to|case|screen|protector/i, msrp: 599 },
  { id: 'galaxy-s26', cid: '9355', rubriek: /cell phones|smartphone/i, naam: 'Samsung Galaxy S26 256GB (unlocked)', cat: 'Phones', q: 'Samsung Galaxy S26 256GB unlocked', moet: /^(?=.*galaxy s26\b)(?=.*256)(?=.*unlocked)/i, niet: /ultra|plus|s26\+|\bfe\b|edge|s25|512|verizon|vzw|at&t|t-mobile|tmobile|locked to|case|screen|protector/i, msrp: 999.99 },
  { id: 'galaxy-z-fold8', cid: '9355', rubriek: /cell phones|smartphone/i, naam: 'Samsung Galaxy Z Fold8 256GB (unlocked)', cat: 'Phones', q: 'Samsung Galaxy Z Fold8 256GB unlocked', moet: /^(?=.*fold ?8)(?=.*256)(?=.*unlocked)/i, niet: /ultra|fold ?7|flip|512|1 ?tb|verizon|vzw|at&t|t-mobile|tmobile|locked to|case|screen|protector/i, msrp: 1899.99 },
  { id: 'galaxy-z-flip8', cid: '9355', rubriek: /cell phones|smartphone/i, naam: 'Samsung Galaxy Z Flip8 256GB (unlocked)', cat: 'Phones', q: 'Samsung Galaxy Z Flip8 256GB unlocked', moet: /^(?=.*flip ?8)(?=.*256)(?=.*unlocked)/i, niet: /flip ?7|\bfe\b|fold|512|verizon|vzw|at&t|t-mobile|tmobile|locked to|case|screen|protector/i, msrp: 1199.99 },
  { id: 'pixel-11', cid: '9355', rubriek: /cell phones|smartphone/i, naam: 'Google Pixel 11 256GB (unlocked)', cat: 'Phones', q: 'Google Pixel 11 256GB unlocked', moet: /^(?=.*pixel 11\b)(?=.*256)(?=.*unlocked)/i, niet: /\bpro\b|\bxl\b|fold|11a|pixel 10|verizon|vzw|at&t|t-mobile|tmobile|locked to|case|screen|protector/i, msrp: 899 },
  { id: 'insta360-x6', rubriek: /camera|camcorder/i, naam: 'Insta360 X6', cat: 'Cameras', q: 'Insta360 X6 360 camera', moet: /insta360 x6/i, niet: /x5|x4|x3|creator|ultimate|bundle|\bkit\b|lens guard/i, msrp: 699.99 },
  { id: 'gopro-max2', rubriek: /camera|camcorder/i, naam: 'GoPro MAX2', cat: 'Cameras', q: 'GoPro MAX2 360 camera', moet: /gopro.*max ?2|max ?2.*gopro/i, niet: /hero|lens|mount|battery only/i, msrp: 499.99 },
  { id: 'kindle-colorsoft-2026', rubriek: /ebook|e-book|tablet/i, naam: 'Kindle Colorsoft (2026)', cat: 'E-readers', q: 'Kindle Colorsoft 2026 16GB', moet: /colorsoft.*2026|2026.*colorsoft/i, niet: /signature|kids|scribe|2024|32 ?gb|cover/i, msrp: 289.99 },
  { id: 'kobo-libra-colour', rubriek: /ebook|e-book|tablet/i, naam: 'Kobo Libra Colour', cat: 'E-readers', q: 'Kobo Libra Colour', moet: /libra colou?r/i, niet: /libra 2|clara|h2o|cover|sleep/i, msrp: 259.99 },
  { id: 'apple-tv-4k-2026', naam: 'Apple TV 4K (4th gen)', cat: 'TV & home', q: 'Apple TV 4K 4th generation 2026', moet: /apple tv 4k.*(4th|2026)|(4th|2026).*apple tv 4k/i, niet: /3rd|2022|2021|remote only/i, msrp: 299 },
  { id: 'google-tv-streamer', naam: 'Google TV Streamer', cat: 'TV & home', q: 'Google TV Streamer 4K', moet: /google tv streamer/i, niet: /chromecast|remote only/i, msrp: 149.99 },
  { id: 'fire-tv-stick-4k-2026', naam: 'Fire TV Stick 4K (2026)', cat: 'TV & home', q: 'Fire TV Stick 4K 2026', moet: /fire tv stick 4k.*(2026|newest|latest)|2026.*fire tv stick 4k/i, niet: /\bmax\b|plus|select|\bhd\b|2018|2023/i, msrp: 59.99 },
  { id: 'ring-battery-doorbell-2', naam: 'Ring Battery Doorbell (2nd Gen)', cat: 'TV & home', q: 'Ring Battery Doorbell 2nd Gen', moet: /ring battery doorbell.*(2nd|2026|gen ?2)/i, niet: /plus|\bpro\b|wired|2024|chime|bundle/i, msrp: 99.99 }
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
  // Alleen echt nieuw (conditie 1000), en geen variatie-advertenties: daar hoort de prijs bij de goedkoopste variant, niet bij dit product.
  if (String(i.conditionId || '') !== '1000') return nee('conditie')
  if (i.itemGroupType || i.itemGroupHref) return nee('variaties')
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
