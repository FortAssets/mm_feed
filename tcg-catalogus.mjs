// KOPIE van worker/catalogus.mjs uit de repo FortAssets/boosterscout (die is privé,
// dus de Action kan hem niet ophalen). Gebruikt door ebay-tcg.mjs om eBay-titels
// op dezelfde manier te herkennen als de voorraadworker. Pas je daar sets of
// soorten aan, kopieer het bestand dan hierheen.

// Pokémon-catalogus: vaste sets en vaste soorten producten, zoals TCGRadar.
// Elke aanbieding van een winkel wordt herkend als set + soort + taal. Wat niet
// zeker herkend wordt, krijgt null: dat gaat nooit verkeerd samen.
// Gebruikt door de voorraadworker en door bouw.mjs (de pagina's).

// [sleutel, Engelse naam, code, releasedatum, andere namen (DE/FR/NL) en codes]
export const SETS = [
  ['delta-reign', 'Delta Reign', 'ME06', '2026-11-06', ['me06', 'me 06', 'me6', 'règne delta', 'regne delta', 'delta-herrschaft', 'delta herrschaft']],
  ['30th-celebration', '30th Celebration', '30th', '2026-09-16', ['30th celebration', '30th anniversary', '30 jaar']],
  ['pitch-black', 'Pitch Black', 'ME05', '2026-07-17', ['dunkelnacht', 'me05', 'me5', 'nuit noire']],
  ['chaos-rising', 'Chaos Rising', 'ME04', '2026-05-22', ['me04', 'me4', 'chaos ascendant', 'wachsendes chaos']],
  ['perfect-order', 'Perfect Order', 'ME03', '2026-03-27', ['optimale ordnung', 'me03', 'me3', 'équilibre parfait', 'equilibre parfait']],
  ['ascended-heroes', 'Ascended Heroes', 'ME2.5', '2026-01-30', ['me2.5', 'me02.5', 'héros transcendants', 'héros transcendant', 'heros transcendants', 'heros transcendant', 'héro transcendant']],
  ['phantasmal-flames', 'Phantasmal Flames', 'ME02', '2025-11-14', ['me02', 'me2', 'flammes fantasmagoriques', 'fatale flammen']],
  ['mega-evolution', 'Mega Evolution', 'ME01', '2025-09-26', ['mega-entwicklung', 'méga-évolution', 'mega-evolution', 'me01', 'me1']],
  ['black-bolt', 'Black Bolt', 'SV10.5', '2025-07-18', ['foudre noire', 'schwarze blitze']],
  ['white-flare', 'White Flare', 'SV10.5', '2025-07-18', ['flamme blanche', 'weiße flamme', 'weisse flamme']],
  ['destined-rivals', 'Destined Rivals', 'SV10', '2025-05-30', ['rivalités destinées', 'rivalites destinees', 'ewige rivalen', 'sv10', 'ev10']],
  ['journey-together', 'Journey Together', 'SV09', '2025-03-28', ['aventures ensemble', 'reisegefährten', 'sv09', 'ev09']],
  ['prismatic-evolutions', 'Prismatic Evolutions', 'SV8.5', '2025-01-17', ['évolutions prismatiques', 'evolutions prismatiques', 'prismatische entwicklungen', 'sv8.5', 'ev8.5', 'ev08.5', 'sv08.5']],
  ['surging-sparks', 'Surging Sparks', 'SV08', '2024-11-08', ['étincelles déferlantes', 'etincelles deferlantes', 'stürmische funken', 'sv08', 'ev08']],
  ['stellar-crown', 'Stellar Crown', 'SV07', '2024-09-13', ['couronne stellaire', 'stellarkrone', 'sv07', 'ev07']],
  ['shrouded-fable', 'Shrouded Fable', 'SV6.5', '2024-08-02', ['fable nébuleuse', 'fable nebuleuse', 'nebel der sagen', 'sv6.5', 'ev6.5', 'ev06.5', 'sv06.5']],
  ['twilight-masquerade', 'Twilight Masquerade', 'SV06', '2024-05-24', ['mascarade crépusculaire', 'maskerade im zwielicht', 'sv06', 'ev06']],
  ['temporal-forces', 'Temporal Forces', 'SV05', '2024-03-22', ['forces temporelles', 'gewalten der zeit', 'sv05', 'ev05']],
  ['paldean-fates', 'Paldean Fates', 'SV4.5', '2024-01-26', ['destinées de paldea', 'paldeas schicksale', 'sv4.5', 'ev4.5', 'ev04.5', 'sv04.5']],
  ['paradox-rift', 'Paradox Rift', 'SV04', '2023-11-03', ['faille paradoxe', 'paradoxrift', 'sv04', 'ev04']],
  ['151', '151', 'SV3.5', '2023-09-22', ['scarlet & violet 151', 'scarlet and violet 151', 'écarlate et violet 151', 'sv3.5', 'ev3.5', 'ev03.5', 'sv03.5', ' 151 ']],
  ['obsidian-flames', 'Obsidian Flames', 'SV03', '2023-08-11', ['flammes obsidiennes', 'obsidianflammen', 'sv03', 'ev03']],
  ['paldea-evolved', 'Paldea Evolved', 'SV02', '2023-06-09', ['évolutions à paldea', 'entwicklungen in paldea', 'sv02', 'ev02']],
  // Japanse sets: eigen namen, altijd taal jp.
  ['jp-storm-emeralda', 'Storm Emeralda', 'M5a', '', ['storm emeralda'], 'jp'],
  ['jp-abyss-eye', 'Abyss Eye', 'M5', '', ['abyss eye'], 'jp'],
  ['jp-nihil-zero', 'Nihil Zero', 'M3', '', ['nihil zero'], 'jp'],
  ['jp-mega-dream', 'Mega Dream ex', 'M2a', '', ['mega dream ex', 'mega dream'], 'jp'],
  ['jp-inferno-x', 'Inferno X', 'M2', '', ['inferno x'], 'jp'],
  ['jp-mega-brave', 'Mega Brave', 'M1L', '', ['mega brave'], 'jp'],
  ['jp-mega-symphonia', 'Mega Symphonia', 'M1S', '', ['mega symphonia'], 'jp'],
  ['jp-heat-wave-arena', 'Heat Wave Arena', 'SV9a', '', ['heat wave arena'], 'jp'],
  ['jp-battle-partners', 'Battle Partners', 'SV9', '', ['battle partners'], 'jp'],
  ['jp-glory-team-rocket', 'The Glory of Team Rocket', 'SV10', '', ['glory of team rocket'], 'jp'],
  ['jp-super-electric-breaker', 'Super Electric Breaker', 'SV8', '', ['super electric breaker'], 'jp'],
  ['jp-terastal-festival', 'Terastal Festival ex', 'SV8a', '', ['terastal festival'], 'jp']
]

// [sleutel, Engelse naam, adviesprijs (EN, huidige sets), herkenning]
// Volgorde telt: de eerste die past wint.
export const SOORTEN = [
  ['pc-etb', 'Pokémon Center Elite Trainer Box', 0, t => /pok[eé]mon ?center/.test(t) && /elite ?trainer|\betb\b/.test(t)],
  ['etb', 'Elite Trainer Box', 54.99, t => /elite[- ]?trainer[- ]?box|top[- ]?trainer[- ]?box|\betb\b|coffret dresseur d.?élite|dresseur d.?elite/.test(t)],
  ['build-battle', 'Build & Battle Box', 0, t => /build ?(&|and|en|\+) ?battle|kit d.?avant-premi|prerelease/.test(t)],
  ['booster-bundle', 'Booster Bundle', 29.99, t => (/booster[- ]?bundle|bundle de 6|boosterbundle|booster bundel|bundle 6 boosters/.test(t) || / bundle (pok[eé]mon )?(me|ev|sv)\d/.test(t)) && !/display|10[- ]?pack|case|costco/.test(t)],
  ['half-booster-box', 'Half Booster Box (18)', 89.82, t => /half (booster )?(box|display)|\b18 ?(booster|boosters|packs?)\b|18[- ]?pack|18er|boite de 18/.test(t) && /box|display|boite|pack/.test(t)],
  ['enhanced-booster-box', 'Enhanced Booster Box', 0, t => /enhanced booster ?(box|display)|booster box enhanced/.test(t)],
  ['booster-box', 'Booster Box (36)', 179.64, t => (/booster ?(box|display)|\bdisplay\b|boite de 36|36 ?(booster|boosters|packs?)\b|36er/.test(t)) && !/collector display|card display|frame display|card frame/.test(t)],
  ['sleeved-booster', 'Sleeved Booster', 4.99, t => /sleeved booster/.test(t)],
  ['blister-3', '3-Pack Blister', 15.99, t => /\b3[- ]?pack|tri-?pack|3 ?booster ?blister|3-booster|blister 3/.test(t)],
  ['checklane', 'Checklane Blister', 0, t => /checklane|single pack blister|1[- ]?pack blister|\bblister\b/.test(t)],
  ['booster-pack', 'Booster Pack', 4.99, t => /booster ?pack|boosterpack|\bbooster\b/.test(t)]
]

// Wat geen kernproduct van een set is, of meer dan één stuk.
const NIET = /\bsleeves\b|deck ?box|binder|portfolio|playmat|speelmat|toploader|plush|knuffel|pluche|figur|blind box|\btin\b|tins\b|collection|collectie|coffret(?! dresseur)|case\b|\bcases\b|\b\d+ ?x\b|\bx ?\d+\b|leeg|empty|graded|\bpsa\b|\bcgc\b|bundelset|rugtas|poster|sticker|munt|coin|dice|dobbel|album|single card|losse kaart|proxy|replica|code card|online code|lot\b|bundle of|set van \d/

export const TALEN = [
  ['jp', /japan|japans|japanese|\bjp\b|\(jp\)|japanse/],
  ['kr', /korea|koreaans/],
  ['cn', /chinese|chinees|simplified|traditional/],
  // Expliciet Engels gaat voor een Franse of Duitse setnaam ("Delta-Herrschaft ... englisch").
  ['en', /englisch|english|anglaise?\b|\bengels\b/],
  ['fr', /\bfr\b|- fr$|français|francais|french|frans\b|coffret|dresseur|pr[ée]commande|r[èe]gne delta|nuit noire|chaos ascendant|[ée]quilibre parfait|h[ée]ros? transcendants?|flammes fantasmagoriques|m[ée]ga-[ée]volution|[ée]carlate|destin[ée]es|[ée]tincelles|aventures ensemble|rivalit[ée]s/],
  ['de', /\bde\b|deutsch|german|duits|mega-entwicklung|delta-herrschaft|dunkelnacht|optimale ordnung|fatale flammen/],
  ['it', /\bit\b|italian|italiano/],
  ['es', /\bes\b|spanish|español|espanol|spaans/],
  ['en', /.*/]
]

export const norm = s => ' ' + String(s || '').toLowerCase().replace(/&#8211;|–|—/g, '-').replace(/&amp;/g, '&').replace(/[()[\],|:]/g, ' ').replace(/\s+/g, ' ').trim() + ' '

export function herken (titel) {
  const t = norm(titel)
  // Franse en Duitse winkels zetten vaak alleen de setnaam of -code in de titel, zonder "Pokémon".
  if (!/pok[eé]mon|elite trainer|booster|ex box/.test(t) && !SETS.some(s => t.includes(' ' + s[1].toLowerCase() + ' ') || s[4].some(n => n.trim().length >= 4 && t.includes(n.trim())))) return null
  if (/one piece|lorcana|yu-?gi-?oh|magic|mtg|digimon|dragon ball|star wars|flesh and blood|adrenalyn|panini|weiss|union arena/.test(t)) return null
  let soort = null
  for (const s of SOORTEN) if (s[3](t)) { soort = s; break }
  if (!soort) return null
  if (NIET.test(t.replace(/sleeved booster/g, '')) && !(soort[0] === 'checklane' && /premium checklane/.test(t))) return null
  // De set: de langste naam of code die in de titel staat.
  // "Mega Evolution" is ook de naam van de serie ("Mega Evolution: Chaos Rising"):
  // staat er een andere set in de titel, dan wint die.
  const hits = []
  for (const s of SETS) {
    for (const n of [s[1].toLowerCase(), ...s[4]]) {
      const hit = n.startsWith(' ') ? t.includes(n) : new RegExp('(^|[^a-z0-9])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(t)
      if (hit) hits.push([s, n.length])
    }
  }
  const zonderSerie = hits.filter(h => h[0][0] !== 'mega-evolution')
  const kies = (zonderSerie.length ? zonderSerie : hits).sort((a, b) => b[1] - a[1])[0]
  const set = kies ? kies[0] : null
  if (!set) return null
  const taal = set[5] || TALEN.find(([, re]) => re.test(t))[0]
  return { set: set[0], soort: soort[0], taal, sleutel: set[0] + '/' + soort[0] + '/' + taal }
}

export const setNaam = k => (SETS.find(s => s[0] === k) || [])[1] || k
export const soortNaam = k => (SOORTEN.find(s => s[0] === k) || [])[1] || k
// Adviesprijs alleen voor Engelstalige producten van sets sinds 2025.
export function adviesVan (sleutel) {
  const [set, soort, taal] = String(sleutel).split('/')
  const s = SETS.find(x => x[0] === set); const o = SOORTEN.find(x => x[0] === soort)
  if (!s || !o || taal !== 'en' || s[3] < '2025-01-01' || set === '30th-celebration' && soort !== 'etb') return 0
  return o[2]
}
