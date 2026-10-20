// SEO-teksten voor de kaartzoeker van BoosterScout (20 okt 2026), met Claude (Anthropic API).
//
// Per set en per waardevolle kaart één korte, feitelijke tekst in 8 talen, geschreven op basis van onze eigen
// data (Cardmarket-prijzen, prijsverloop, zeldzaamheid, graded prijzen). Eén verzoek per set of kaart levert
// alle talen tegelijk. Teksten blijven staan; we schrijven ze alleen opnieuw als de prijs flink veranderde of
// na 90 dagen. Een vast maximum per run houdt het tegoed in de hand.
//
// Secret: ANTHROPIC_API_KEY (Console-organisatie die aan het Max-abonnement gekoppeld is).
import fs from 'node:fs'

const SLEUTEL = process.env.ANTHROPIC_API_KEY || ''
if (!SLEUTEL) { console.log('geen ANTHROPIC_API_KEY, teksten overgeslagen'); process.exit(0) }
const MODEL = process.env.KZ_TEKST_MODEL || 'claude-sonnet-5-5'
const MAX = Number(process.env.KZ_TEKST_MAX || 300)          // verzoeken per run
const TOP = Number(process.env.KZ_TEKST_TOP || 1500)        // zoveel waardevolste kaarten krijgen een tekst
const MAP = 'data/kz'
const BESTAND = MAP + '/teksten.json'
const TALEN = { nl: 'Dutch', en: 'English', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', pt: 'European Portuguese', pl: 'Polish' }

const kz = JSON.parse(fs.readFileSync(MAP + '/kaarten.json', 'utf8'))
const gr = fs.existsSync(MAP + '/graded.json') ? JSON.parse(fs.readFileSync(MAP + '/graded.json', 'utf8')).kaarten || {} : {}
const ix = Object.fromEntries(kz.velden.map((v, i) => [v, i]))
const sets = new Map(kz.sets.map(s => [s[0], s]))
const oud = fs.existsSync(BESTAND) ? JSON.parse(fs.readFileSync(BESTAND, 'utf8')) : { sets: {}, kaarten: {} }
oud.sets ||= {}; oud.kaarten ||= {}
const nu = new Date().toISOString().slice(0, 10)
const dagenOud = d => d ? (Date.now() - Date.parse(d)) / 864e5 : 1e9

const REGELS = `You write short SEO texts for BoosterScout, a European Pokémon TCG price comparison site. Rules:
- Use ONLY the facts given. Never invent attacks, artists, print runs, history or prices. If a fact is not given, leave it out.
- Neutral and factual. No investment advice, no "buy now", no predictions, no hype words like "must-have" or "insane".
- Write each language natively (not a literal translation), as a native collector would. Use the localized card and set names given for that language.
- 60 to 95 words per language, 2 or 3 sentences, plain text, no headings, no lists, no emoji, no quotes around names.
- Mention that prices are Cardmarket trend prices where relevant. Use euro amounts as given, formatted for that language.
- Never use em dashes or en dashes. Use commas or full stops instead.
Return ONLY a JSON object with the keys nl, en, de, fr, es, it, pt, pl.`

async function claude (feiten) {
  for (let poging = 1; poging <= 3; poging++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': SLEUTEL, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 2400, system: REGELS, messages: [{ role: 'user', content: 'Facts (JSON):\n' + JSON.stringify(feiten) + '\n\nWrite the texts. Languages: ' + JSON.stringify(TALEN) }] })
    })
    if (r.status === 429 || r.status >= 500) { await new Promise(z => setTimeout(z, 4000 * poging)); continue }
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error('Anthropic HTTP ' + r.status + ' ' + JSON.stringify(d.error || d).slice(0, 200))
    const t = (d.content || []).map(c => c.text || '').join('')
    const m = t.match(/\{[\s\S]*\}/); if (!m) throw new Error('geen JSON')
    const j = JSON.parse(m[0])
    const uit = {}
    for (const k of Object.keys(TALEN)) { if (typeof j[k] !== 'string' || j[k].length < 40) throw new Error('taal ontbreekt: ' + k); uit[k] = j[k].replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim() }
    return { uit, tokens: d.usage || {} }
  }
  throw new Error('Anthropic: te vaak 429/5xx')
}

const eur = v => v > 0 ? '€' + v.toFixed(2) : null
const kaartenVanSet = new Map()
for (const k of kz.kaarten) { const a = kaartenVanSet.get(k[ix.set]) || []; a.push(k); kaartenVanSet.set(k[ix.set], a) }

// Wat moet er (opnieuw) geschreven worden? Sets eerst, dan de waardevolste kaarten.
const taken = []
for (const s of kz.sets) {
  const o = oud.sets[s[0]]
  if (!o || dagenOud(o.d) > 120) taken.push(['set', s[0]])
}
const top = kz.kaarten.filter(k => k[ix.trend] > 0).sort((a, b) => b[ix.trend] - a[ix.trend]).slice(0, TOP)
for (const k of top) {
  const o = oud.kaarten[k[ix.id]]
  const p = k[ix.trend]
  if (!o || dagenOud(o.d) > 90 || (o.p && Math.abs(p / o.p - 1) > 0.4)) taken.push(['kaart', k[ix.id], k])
}
console.log('model', MODEL, 'taken', taken.length, 'maximaal', MAX)

let n = 0, fout = 0, inT = 0, uitT = 0
for (const [soort, id, k] of taken) {
  if (n >= MAX) break
  try {
    let feiten
    if (soort === 'set') {
      const s = sets.get(id), ks = (kaartenVanSet.get(id) || []).filter(x => x[ix.trend] > 0).sort((a, b) => b[ix.trend] - a[ix.trend])
      feiten = { type: 'set page', set: s[1], series: s[2], releaseDate: s[3], officialCards: s[6], totalCards: s[7], localizedSetNames: s[8] || {}, setValueEur: eur(ks.reduce((a, x) => a + x[ix.trend], 0)), mostValuable: ks.slice(0, 5).map(x => ({ name: x[ix.naam], number: x[ix.nr], rarity: x[ix.zeldzaam], trendEur: eur(x[ix.trend]), localizedNames: x[ix.namen] || {} })) }
    } else {
      const s = sets.get(k[ix.set]) || [], g = gr[id] || {}
      feiten = { type: 'card page', card: k[ix.naam], localizedNames: k[ix.namen] || {}, number: k[ix.nr] + (s[6] ? '/' + s[6] : ''), set: s[1], localizedSetNames: s[8] || {}, series: s[2], setReleaseDate: s[3], rarity: k[ix.zeldzaam],
        cardmarketTrendEur: eur(k[ix.trend]), lowestListingEur: eur(k[ix.laag]), avg7Eur: eur(k[ix.gem7]), avg30Eur: eur(k[ix.gem30]), holoTrendEur: eur(k[ix.trendHolo]), tcgplayerUsd: k[ix.usd] || null,
        graded: Object.fromEntries(Object.entries(g).filter(([, x]) => x.vraag || x.verkocht).slice(0, 6).map(([gg, x]) => [gg, { askingMedianEur: eur(x.vraag), estimatedSoldEur: eur(x.verkocht), listings: x.n }])) }
    }
    const { uit, tokens } = await claude(feiten)
    inT += tokens.input_tokens || 0; uitT += tokens.output_tokens || 0
    if (soort === 'set') oud.sets[id] = { d: nu, t: uit }
    else oud.kaarten[id] = { d: nu, p: k[ix.trend], t: uit }
    n++
    if (n % 25 === 0) { fs.writeFileSync(BESTAND, JSON.stringify(oud)); console.log(n, 'klaar, tokens in/uit', inT, uitT) }
  } catch (e) { fout++; console.log('fout', soort, id, e.message); if (/HTTP 40[13]|credit|billing/i.test(e.message)) break }
}
fs.writeFileSync(BESTAND, JSON.stringify(oud))
console.log('teksten geschreven:', n, 'fouten:', fout, 'tokens in/uit:', inT, uitT, 'totaal sets', Object.keys(oud.sets).length, 'kaarten', Object.keys(oud.kaarten).length)
