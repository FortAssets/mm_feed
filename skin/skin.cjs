// Maakt de huisstijllaag "2-rond": leest alle CSS-regels die de site gebruikt (bladen.json uit de crawl)
// en schrijft per regel alleen de eigenschappen opnieuw waarvan de kleur of de letter verandert.
// Secties die al in de nieuwe stijl zijn gebouwd (dhk, dhr, dsr, dwa, dpvbf) slaan we over.
const fs = require('fs'), postcss = require('postcss');
const B = JSON.parse(fs.readFileSync('bladen.json', 'utf8'));
const INKT = '#0D1B2A', BLAUW = '#2456D6', BLAUW_D = '#1B45B4', GEEL = '#F9C31F', GROEN = '#3FAE7A';
const OVERSLAAN_BLAD = /shopifycloud|emrldtp|pagefly|fonts\.googleapis|accelerated-checkout|shopify_pay|portable-wallets/;
const OVERSLAAN_SEL = /\.dhk|\.dhr|\.dsr|#dsr-|\.dwa|\.dpvbf|Avada|\.pf-|__pf|shopify-payment|\.pvnav-woord|\.pvnav-merk|\.pvf-logo|\.pvz2-|#shopify-pc|\.shopify-pc|gravity|\.dpv-skin/;
const MERK_VAST = /\.pvz2-/; // Vodafone-rood blijft
const FONT = "'Montserrat',system-ui,-apple-system,'Segoe UI',sans-serif";

function hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; }
const hex = (h, a) => { if (a === undefined || a >= 1) return h; const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const prijs = (sel) => /prijs|price|bedrag|euro|-pr\b|\.pr\b|-p\b|amount|kosten|totaal/i.test(sel);

// soort: tekst | vlak | rand | schaduw
function kleur(r, g, b, a, soort, sel) {
  const [h, s, l] = hsl(r, g, b);
  if ((r === 63 && g === 174 && b === 122) || (r === 74 && g === 191 && b === 135)) return null; // het groen van het logo blijft
  const groen = h >= 135 && h <= 178 && s >= 0.25 && l >= 0.16;
  const blauw = h >= 205 && h <= 240 && l >= 0.30 && (l > 0.8 ? s >= 0.55 : s >= 0.35);
  const paars = h > 240 && h <= 300 && s >= 0.14;
  if (!groen && !blauw && !paars) return null;
  if (soort === 'schaduw') return hex(BLAUW, Math.min(a, 0.25));
  if (groen) {
    if (soort === 'vlak') { if (l <= 0.55) return hex(BLAUW, a); if (l < 0.88) return hex('#DCE7FF', a); return hex(l < 0.955 ? '#EAF1FF' : '#F3F7FF', a); }
    if (soort === 'tekst') { if (l <= 0.5) return hex(prijs(sel) ? INKT : BLAUW, a); return hex('#A9C4FF', a); }
    return hex(l <= 0.55 ? BLAUW : '#C9D8FA', a);
  }
  if (blauw) {
    if (soort === 'vlak') { if (l <= 0.6) return hex(l < 0.36 ? BLAUW_D : BLAUW, a); if (l < 0.88) return hex('#DCE7FF', a); return hex(l < 0.955 ? '#EAF1FF' : '#F3F7FF', a); }
    if (soort === 'tekst') return l <= 0.6 ? hex(BLAUW, a) : hex('#A9C4FF', a);
    return hex(l <= 0.6 ? BLAUW : '#C9D8FA', a);
  }
  // paars
  if (l < 0.30) return hex(l < 0.14 ? '#0D1B2A' : l < 0.22 ? '#14273D' : '#1D3A6B', a);
  if (soort === 'vlak') { if (l <= 0.62) return hex(BLAUW, a); if (l < 0.9) return hex('#DCE7FF', a); return hex(l < 0.96 ? '#EAF1FF' : '#F3F7FF', a); }
  if (soort === 'tekst') return l <= 0.6 ? hex(BLAUW, a) : hex(l < 0.8 ? '#A9C4FF' : '#DCE7FF', a);
  return hex(l <= 0.6 ? BLAUW : '#C9D8FA', a);
}
function soortVan(prop) {
  if (/^(color|fill|stroke|caret-color|text-decoration(-color)?|-webkit-text-fill-color)$/.test(prop)) return 'tekst';
  if (/^background/.test(prop)) return 'vlak';
  if (/shadow/.test(prop)) return 'schaduw';
  if (/^(border|outline|column-rule|accent-color)/.test(prop)) return 'rand';
  return null;
}
const HEX6 = /#([0-9a-fA-F]{6})\b/g, hexRgb = (m, x) => { const n = parseInt(x, 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
const RGB = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g;
function vervang(waarde, soort, sel) {
  let anders = false;
  const uit = waarde.replace(RGB, (m, r, g, b, a) => { const n = kleur(+r, +g, +b, a === undefined ? 1 : +a, soort, sel); if (n === null) return m; anders = true; return n; });
  return anders ? uit : null;
}
function hoger(sel) { // zelfde selector, maar sterker dan het origineel
  sel = sel.trim();
  if (/^(html|:root)\b/.test(sel)) return sel.replace(/^(html|:root)/, '$1:not(#x)');
  return 'html:not(#x) ' + sel;
}
// Donkere blokken die licht worden. WORTEL: de selector van het vlak zelf en wat het wordt.
const TOP = 'linear-gradient(180deg,#E3ECFF 0%,#F4F7FF 100%)';
const WORTEL = [[/^\.zhb-in$/, '#F4F7FF'], [/^\.dan-in$/, '#F4F7FF'], [/^\.ap-hero$/, TOP], [/^\.dg-hero$/, TOP], [/^\.dg-hero::after$/, 'none']];
const LICHT = /\.zhb|\.ap-hero|\.ap-eyebrow|\.ap-sprong|\.dg-hero|\.dg-eyebrow|\.dg-sub|\.dg-c\b|\.dan-/;
function eigenVlak(rule) { // heeft deze regel zelf een gekleurd vlak (een knop)? dan blijft de tekst zoals hij is
  let ja = false;
  rule.walkDecls(/^background(-color)?$/, (d) => { const m = RGB.exec(d.value); RGB.lastIndex = 0; if (!m) return; const a = m[4] === undefined ? 1 : +m[4]; const [, sat, l] = hsl(+m[1], +m[2], +m[3]); if (a > 0.5 && l < 0.7 && sat > 0.3) ja = true; });
  return ja;
}
function licht(waarde, soort, knop) {
  let anders = false;
  const uit = waarde.replace(RGB, (m, r, g, b, a) => {
    a = a === undefined ? 1 : +a; const [h, sat, l] = hsl(+r, +g, +b);
    let n = null;
    if (soort === 'vlak') { if (l > 0.6 && a < 0.5) n = '#FFFFFF'; }
    else if (soort === 'tekst') { if (!knop && l > 0.6) n = (sat > 0.3 && l < 0.92 && !(h > 195 && h < 235 && sat < 0.45)) ? BLAUW : (a < 1 || l < 0.9 ? '#4A5A70' : INKT); }
    else if (soort === 'rand') { if (l > 0.6 && a < 0.6) n = sat > 0.3 ? '#C9D8FA' : '#D9E1EC'; }
    if (n === null) return m; anders = true; return n;
  });
  return anders ? uit : null;
}
const teller = { regels: 0, decls: 0 }, gezien = new Set();
const uitRoot = postcss.root();
uitRoot.append(postcss.comment({ text: ' Huisstijllaag 2-rond. Gegenereerd door skin.cjs uit de opmaak van alle paginas; niet met de hand bewerken. ' }));
for (const [h, blad] of Object.entries(B)) {
  if (OVERSLAAN_BLAD.test(blad.bron)) continue;
  let root; try { root = postcss.parse(blad.css); } catch (e) { continue; }
  root.walkRules((rule) => {
    if (rule.parent && rule.parent.type === 'atrule' && /keyframes/.test(rule.parent.name)) return;
    const sels = rule.selectors.filter((s) => !OVERSLAAN_SEL.test(s));
    if (!sels.length) return;
    const sel = sels.join(',');
    const nieuw = [];
    const wortel = WORTEL.find((w) => sels.some((x) => w[0].test(x.trim())));
    const isLicht = LICHT.test(sel), knop = isLicht && !wortel && eigenVlak(rule);
    rule.walkDecls((d) => {
      if (d.parent !== rule) return;
      if (wortel && /^background(-image)?$/.test(d.prop)) { nieuw.push([d.prop, wortel[1]]); return; }
      if (wortel && d.prop === 'color') { nieuw.push(['color', INKT]); return; }
      if (isLicht && !d.prop.startsWith('--') && d.prop !== 'font-family') {
        const so = soortVan(d.prop);
        if (so) { const lv = licht(d.value, so, knop); if (lv) { nieuw.push([d.prop, vervang(lv.replace(HEX6, hexRgb), so, sel) || lv]); return; } }
      }
      if (d.prop === 'font-family') {
        if (/Jakarta|Bricolage|Inter\b|Syne|--font-(body|heading)-family|Playfair|Lato|Source Sans|Noto Sans|Roboto/.test(d.value)) nieuw.push(['font-family', FONT]);
        return;
      }
      if (d.prop.startsWith('--')) { // eigen variabelen met een kleur erin (de browser laat hex hier staan)
        d.value = d.value.replace(HEX6, hexRgb).replace(/#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])\b/g, (m, x, y, z) => hexRgb(m, x + x + y + y + z + z));
        // Een lichte waarde is bijna altijd een vlak (tint), een donkere een tekst- of knopkleur.
        const eerste = RGB.exec(d.value); RGB.lastIndex = 0;
        const lichtje = eerste ? hsl(+eerste[1], +eerste[2], +eerste[3])[2] > 0.8 : false;
        const s2 = /bg|back|fill|surface/i.test(d.prop) || lichtje ? 'vlak' : /border|line|rand/i.test(d.prop) ? 'rand' : 'tekst';
        const v = vervang(d.value, s2, sel); if (v) nieuw.push([d.prop, v]); return;
      }
      const soort = soortVan(d.prop); if (!soort) return;
      const v = vervang(d.value, soort, sel); if (v) nieuw.push([d.prop, v]);
    });
    if (nieuw.some(([p, v]) => /^background/.test(p) && (v.includes(BLAUW) || v.includes(BLAUW_D)) && !v.includes('gradient'))) {
      rule.walkDecls('color', (d) => { const m = RGB.exec(d.value); RGB.lastIndex = 0; if (!m) return; const [, , l] = hsl(+m[1], +m[2], +m[3]); if (l < 0.3 && !nieuw.some((n) => n[0] === 'color')) nieuw.push(['color', '#FFFFFF']); });
    }
    if (!nieuw.length) return;
    // keten van @media en dergelijke bewaren
    const keten = []; let p = rule.parent; while (p && p.type === 'atrule') { keten.unshift(p); p = p.parent; }
    const sleutel = keten.map((k) => k.name + k.params).join('|') + '§' + sel + '§' + nieuw.map((n) => n.join(':')).join(';');
    if (gezien.has(sleutel)) return; gezien.add(sleutel);
    let doel = uitRoot;
    for (const k of keten) { const a = postcss.atRule({ name: k.name, params: k.params }); doel.append(a); doel = a; }
    const r = postcss.rule({ selector: sels.map(hoger).join(',') });
    nieuw.forEach(([prop, value]) => r.append({ prop, value, important: true }));
    doel.append(r); teller.regels++; teller.decls += nieuw.length;
  });
}
let css = uitRoot.toString().replace(/\n\s*/g, '').replace(/;\}/g, '}');
// opeenvolgende gelijke @media samenvoegen scheelt weinig; laat zo.
fs.writeFileSync('gen.css', css);
console.log(teller, 'bytes', css.length);

// ---------- inline stijlen (style="...") ----------
const S = JSON.parse(fs.readFileSync('stijlen.json', 'utf8'));
const HEX = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
function naarRgb(v) { return v.replace(HEX, (m, x) => { if (x.length === 3) x = x.split('').map((c) => c + c).join(''); const n = parseInt(x, 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; }); }
const EIGEN = /#(10b981|059669|047857|0b7d5c|0fa876|065f46|1b3fa0|2563eb|1e3a8a|1d4ed8|ecfdf5|f0fdf4|a7f3d0|d1fae5|7fe3bc|6d28d9|7a3e9d|eaf7f1|e7f6ef|eef2fb|dbe4ff|eff4ff)/i;
const inl = new Map();
for (const [stijl] of S) {
  for (const deel of stijl.split(';')) {
    const i = deel.indexOf(':'); if (i < 0) continue;
    const prop = deel.slice(0, i).trim().toLowerCase(), ruw = deel.slice(i + 1).trim();
    if (!ruw || ruw.length > 140 || /url\(/.test(ruw)) continue;
    const soort = soortVan(prop); if (!soort) continue;
    if (!EIGEN.test(ruw)) continue; // alleen onze eigen oude kleuren, niet die van merken
    const v = vervang(naarRgb(ruw), soort, ''); if (!v) continue;
    const frag = deel.trim().replace(/"/g, '\\"');
    const doelProp = /^border/.test(prop) && !/color/.test(prop) ? prop : prop;
    let sels;
    if (prop === 'color') sels = [`[style^="${frag}"]`, `[style*=";${frag}"]`, `[style*="; ${frag}"]`];
    else sels = [`[style*="${frag}"]`];
    inl.set(frag, sels.map((s) => 'html:not(#x) ' + s).join(',') + `{${doelProp}:${v}!important}`);
  }
}
fs.writeFileSync('inline.css', [...inl.values()].join(''));
console.log('inline regels', inl.size);
