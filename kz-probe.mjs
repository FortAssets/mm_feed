// Eenmalig: wat heeft TCGdex voor Japans, Koreaans en Chinees (sets, namen, prijzen)?
import fs from 'node:fs'
const API = 'https://api.tcgdex.net/v2'
const h = async u => { const r = await fetch(u); return r.ok ? r.json() : { fout: r.status } }
const uit = {}
for (const t of ['ja', 'ko', 'zh-tw', 'zh-cn']) {
  const sets = await h(API + '/' + t + '/sets')
  uit[t] = { n: sets.length, laatste: (sets || []).slice(-25).map(s => [s.id, s.name, s.cardCount]) }
  const s = sets.slice(-3)[0]
  if (s) { const d = await h(API + '/' + t + '/sets/' + s.id); uit[t].set = { id: d.id, name: d.name, serie: d.serie, releaseDate: d.releaseDate, logo: d.logo, n: (d.cards || []).length, eerste: (d.cards || []).slice(0, 3) }
    const c = d.cards && d.cards.find(x => x.localId > '080') || (d.cards || [])[0]; if (c) uit[t].kaart = await h(API + '/' + t + '/cards/' + c.id) }
}
fs.mkdirSync('data/kz', { recursive: true }); fs.writeFileSync('data/kz/probe.json', JSON.stringify(uit, null, 1))
