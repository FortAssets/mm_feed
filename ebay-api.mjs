// Gedeelde stukken voor eBay: token, zoeken en de partnerlink.
// Gebruikt door ebay.mjs (productvergelijker) en tcg-feeds.mjs (BoosterScout).
//
// Alleen de Browse API met een applicatietoken (client credentials). Geen
// gebruikerstokens, geen accountgegevens van eBay-leden. Daarvoor hebben we
// vrijstelling van de Marketplace Account Deletion-meldingen.
//
// Secrets: EBAY_CLIENT_ID (App ID) en EBAY_CLIENT_SECRET (Cert ID).
//
// Links lopen via eBay Partner Network bij Impact. De trackinglink van de
// advertentie met ?u=<pagina op eBay> erachter, en subId1 voor waar de klik
// vandaan kwam (dpv-shop, boosterscout).

const ID = process.env.EBAY_CLIENT_ID || ''
const GEHEIM = process.env.EBAY_CLIENT_SECRET || ''
// 20 okt: de Impact-link stuurde door naar app.partner.ebay.com, een domein zonder DNS: elke klik liep dood.
// Nu de klassieke parameters van eBay Partner Network (campagne 5339222386, uit de linkgenerator), per site.
// eBay PL, AT en CH hebben we geen partnerlink voor: een artikel daar openen we op eBay DE (zelfde
// artikelnummer, dezelfde aanbieding). eBay NL en BE doen wel mee; www.ebay.be gaat naar de Nederlandstalige site.
const EPN_CAMP = process.env.EBAY_CAMPID || '5339222386'
const EPN_SITE = { 'www.ebay.nl': ['1346-53482-19255-0', 146], 'www.befr.ebay.be': ['1553-53471-19255-0', 23], 'www.benl.ebay.be': ['1553-53471-19255-0', 123], 'www.ebay.de': ['707-53477-19255-0', 77], 'www.ebay.com': ['711-53200-19255-0', 0], 'www.ebay.co.uk': ['710-53481-19255-0', 3], 'www.ebay.fr': ['709-53476-19255-0', 71], 'www.ebay.es': ['1185-53479-19255-0', 186], 'www.ebay.it': ['724-53478-19255-0', 101], 'www.ebay.ie': ['5282-53468-19255-0', 205], 'www.ebay.ca': ['706-53473-19255-0', 2], 'www.ebay.com.au': ['705-53470-19255-0', 15] }
const NAAR_DE = new Set(['www.ebay.pl', 'www.ebay.at', 'www.ebay.ch'])

export const ebayKlaar = () => !!(ID && GEHEIM)

// Verkopers in de EU. Van buiten de EU betaal je bij levering nog btw en
// inklaringskosten, en die staan niet in de prijs op eBay.
export const EU = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'])

let token = null
let tokenTot = 0
export async function ebayToken () {
  if (token && Date.now() < tokenTot) return token
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(ID + ':' + GEHEIM).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope')
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || !d.access_token) throw new Error('eBay-token: HTTP ' + r.status + ' ' + (d.error_description || d.error || ''))
  token = d.access_token
  tokenTot = Date.now() + (Number(d.expires_in || 7200) - 300) * 1000
  return token
}

export class Limiet extends Error {}

// Een zoekopdracht. Bij 429 even wachten en nog een keer; blijft het 429, of
// zegt eBay dat de dagelijkse limiet op is, dan een Limiet-fout, zodat de
// aanroeper stopt en bewaart wat hij heeft.
export async function ebayZoek (param, markt = 'EBAY_NL') {
  const u = 'https://api.ebay.com/buy/browse/v1/item_summary/search?' + new URLSearchParams(param)
  for (let poging = 1; poging <= 3; poging++) {
    const r = await fetch(u, {
      headers: {
        Authorization: 'Bearer ' + await ebayToken(),
        'X-EBAY-C-MARKETPLACE-ID': markt,
        'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country=NL,zip=1012',
        'Accept-Language': 'nl-NL'
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
      if (/limit|quota/i.test(fout.message || '') && !/categor/i.test(fout.message || '')) throw new Limiet('eBay: ' + fout.message)
      if (r.status >= 500 && poging < 3) { await new Promise(s => setTimeout(s, 2000 * poging)); continue }
      throw new Error('eBay HTTP ' + r.status + ' ' + (fout.message || ''))
    }
    return d
  }
}

// De pagina op eBay zonder de trackingrommel erachter, als partnerlink.
export function ebayLink (itemUrl, sub) {
  let u
  try { u = new URL(String(itemUrl || '')) } catch (e) { return String(itemUrl || '') }
  // Zonder de trackingrommel die eBay er zelf aan hangt; zoekpagina's houden hun zoekterm.
  const zoek = u.pathname.startsWith('/sch/') ? u.search : ''
  if (u.hostname === 'www.ebay.be') u = new URL('https://www.benl.ebay.be' + u.pathname + zoek)
  else if (NAAR_DE.has(u.hostname)) u = new URL('https://www.ebay.de' + u.pathname + zoek)
  else u = new URL(u.origin + u.pathname + zoek)
  const r = EPN_SITE[u.hostname]; if (!r) return u.toString()
  for (const [k, v] of [['mkcid', '1'], ['mkrid', r[0]], ['siteid', String(r[1])], ['campid', EPN_CAMP], ['customid', sub || ''], ['toolid', '10001'], ['mkevt', '1']]) u.searchParams.set(k, v)
  return u.toString()
}

// Een aanbieding uit het zoekresultaat, of null als hij niet bruikbaar is:
// verkoper buiten de EU, te weinig of te slechte beoordelingen, of
// verzendkosten naar Nederland onbekend.
export function ebayAanbod (i, opt = {}) {
  const land = (i.itemLocation && i.itemLocation.country) || ''
  if (!EU.has(land)) return null
  const v = i.seller || {}
  const pct = Number(v.feedbackPercentage || 0)
  const score = Number(v.feedbackScore || 0)
  if (pct < (opt.minPct || 97) || score < (opt.minScore || 10)) return null
  if (!i.price || i.price.currency !== 'EUR') return null
  const prijs = Number(i.price.value)
  if (!(prijs > 0)) return null
  const zo = (i.shippingOptions || [])[0]
  const vz = zo && zo.shippingCost && zo.shippingCost.value != null ? Number(zo.shippingCost.value) : null
  if (vz == null || isNaN(vz)) return null
  return {
    id: String(i.itemId || ''),
    titel: String(i.title || ''),
    prijs: Math.round(prijs * 100) / 100,
    verzend: Math.round(vz * 100) / 100,
    totaal: Math.round((prijs + vz) * 100) / 100,
    land,
    verkoper: String(v.username || ''),
    url: String(i.itemWebUrl || ''),
    im: (i.image && i.image.imageUrl) || ((i.thumbnailImages || [])[0] || {}).imageUrl || ''
  }
}
