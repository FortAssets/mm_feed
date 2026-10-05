// Top van de energievergelijker als los bestand: data/energie-top.json.
//
// De hero op de homepage toont per huishouden de drie goedkoopste contracten.
// De energie-worker geeft alleen een HTML-pagina terug en staat niet toe dat
// een andere site die uitleest. Daarom halen wij hier de pagina op, lezen de
// kaarten uit en zetten de uitkomst in de repo. De homepage leest dat bestand
// via raw.githubusercontent, dat wel door een browser gelezen mag worden.
//
// Draait mee in de workflow van de shop-feed. Lukt het niet, dan blijft het
// vorige bestand staan: liever de cijfers van gisteren dan geen cijfers.
import { writeFileSync, mkdirSync } from 'node:fs'

const WORKER = process.env.ENERGIE_WORKER || 'https://dpv-energie.business-347.workers.dev'
const HUISHOUDENS = [
  ['alleen', 'Alleen'], ['samen', 'Samen'], ['gezin', 'Gezin'], ['groot', 'Groot gezin'],
]
const kaal = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
const getal = (s) => parseInt(String(s || '').replace(/[^\d]/g, ''), 10) || 0

function lees(html) {
  // Dynamische contracten staan in een apart blok en zijn een schatting, geen
  // prijs. Die doen niet mee.
  const vast = html.split('<div class="apart">')[0]
  const kop = /<div class="reskop">.*?<div class="s">(.*?)<\/div>/s.exec(vast)
  const items = []
  for (const blok of vast.split(/<div class="kaart(?: top)?">/).slice(1)) {
    const naam = kaal((/class="naam">(.*?)<\/span>/s.exec(blok) || [])[1])
    const soort = kaal((/class="soort">(.*?)<\/span>/s.exec(blok) || [])[1])
    const prijs = /class="prijs"><b>(.*?)<\/b><span>(.*?)<\/span>/s.exec(blok) || []
    const knop = /<a class="knop" href="([^"]+)"[^>]*rel="([^"]*)"/.exec(blok) || []
    const dom = (/data-dom="([^"]+)"/.exec(blok) || [])[1] || ''
    const check = (/Tarief gecontroleerd op (\d+ \w+ \d{4})/.exec(blok) || [])[1] || ''
    const tags = [...blok.matchAll(/class="tag [^"]*">(.*?)<\/span>/g)].map((m) => kaal(m[1]))
    const jaar = getal(prijs[1]), maand = getal(prijs[2])
    if (!naam || !jaar || !knop[1]) continue
    items.push({
      naam, soort, jaar, maand, dom, check,
      url: knop[1].replace(/&amp;/g, '&'),
      aff: /sponsored/.test(knop[2] || ''),
      soortTag: tags.find((t) => /^(vast|variabel)$/.test(t)) || '',
      korting: tags.find((t) => /welkomstkorting/.test(t)) || '',
    })
  }
  return { verbruik: kaal(kop && kop[1]), items }
}

const uit = { gemaakt: new Date().toISOString(), bron: WORKER + '/energie', huishoudens: [] }
for (const [id, label] of HUISHOUDENS) {
  const r = await fetch(`${WORKER}/energie?huishouden=${id}`)
  if (!r.ok) throw new Error(`energie ${id}: ${r.status}`)
  const html = await r.text()
  const d = lees(html)
  if (d.items.length < 3) throw new Error(`energie ${id}: maar ${d.items.length} contracten gelezen`)
  d.items.sort((a, b) => a.jaar - b.jaar)
  uit.huishoudens.push({ id, label, verbruik: d.verbruik, items: d.items.slice(0, 6) })
  if (!uit.bijgehouden) uit.bijgehouden = (/laatst gecontroleerd op ([\d-]+)/.exec(html) || [])[1] || ''
}
mkdirSync('data', { recursive: true })
writeFileSync('data/energie-top.json', JSON.stringify(uit, null, 1) + '\n')
console.log('energie-top.json: ' + uit.huishoudens.map((h) => `${h.id} ${h.items[0].naam} €${h.items[0].jaar}`).join(' | '))
