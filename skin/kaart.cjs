// Tweede stap: zet de laag "2-rond" (gen.css, inline.css, na.css) om naar de stijl "Prijskaartjes"
// (STIJLGIDS-KAARTJES.md) en maakt uit de oorspronkelijke opmaak (bladen.json) de vormregels voor
// kaarten en invoervelden. Schrijft k-basis.css en k-vorm.css; bouw.sh plakt alles aan elkaar.
const fs = require('fs'), postcss = require('postcss');
const VELD = '#CBD3DF', INKT = '#0D1B2A', ZACHT = '#4A5A70', GRIJS = '#F1F3F8', LIJN = '#E3E8F0', BLAUW = '#2456D6', GEEL = '#F9C31F';
const KOP = "'Bricolage Grotesque','Instrument Sans',system-ui,sans-serif", TEKST = "'Instrument Sans',system-ui,-apple-system,'Segoe UI',sans-serif";
const KLEUR = /#([0-9a-fA-F]{6})\b|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g;
const isKop = (sel) => /(^|[\s>+~,(])h[1-3]\b|titel|title|\bkop\b|-kop\b|heading|prijs|price|bedrag|-pr\b|amount/i.test(sel);
const isLink = (sel) => sel.split(',').every((s) => /(^|[\s>+~])a(:(hover|visited|focus|active|link|not\([^)]*\)))*$/.test(s.trim()));
function soortVan(prop) {
  if (/^(color|fill|stroke|caret-color|text-decoration(-color)?|-webkit-text-fill-color)$/.test(prop)) return 'tekst';
  if (/^background/.test(prop)) return 'vlak';
  if (/shadow/.test(prop)) return 'schaduw';
  if (/^(border|outline|column-rule|accent-color)/.test(prop)) return 'rand';
  return null;
}
const rgba = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function kaartKleur(x, a, soort, prop, sel) {
  x = x.toUpperCase();
  const blauw = x === '2456D6' || x === '1B45B4' || x === '1B3FA0' || x === '2563EB' || x === '1E3A8A' || x === '1D4ED8';
  const tintD = x === 'DCE7FF' || x === 'EAF1FF' || x === 'DBE4FF', tintL = x === 'F3F7FF' || x === 'F4F7FF' || x === 'E3ECFF' || x === 'EFF4FF' || x === 'EEF2FB';
  if (soort === 'schaduw') { if (blauw) return rgba(INKT, 0); return null; }
  if (soort === 'vlak') {
    if (blauw) return a >= 0.5 ? INKT : a >= 0.04 ? GRIJS : rgba(INKT, 0);
    if (x === '1D3A6B' || x === '14273D') return INKT;
    if (tintD) return a >= 0.5 ? GRIJS : rgba('#F1F3F8', a);
    if (tintL) return a >= 0.5 ? '#FFFFFF' : rgba('#FFFFFF', a);
    return null;
  }
  if (soort === 'tekst') {
    if (blauw) { if (prop === 'color' && isLink(sel)) return null; return a >= 1 ? INKT : rgba(INKT, a); }
    if (x === 'A9C4FF') return '#C9D3E0';
    if (x === 'DCE7FF') return '#E3E8F0';
    if (x === '5B6B80') return ZACHT;
    return null;
  }
  // rand
  if (blauw) return a >= 0.5 ? INKT : rgba(INKT, a);
  if (x === 'C9D8FA' || tintD) return /^(border|border-color|outline|outline-color)$/.test(prop) ? VELD : LIJN;
  if (x === 'D9E1EC' || tintL) return LIJN;
  return null;
}
function zetOm(css, naam) {
  const root = postcss.parse(css); let n = 0;
  root.walkRules((rule) => {
    if (rule.parent && rule.parent.type === 'atrule' && /keyframes/.test(rule.parent.name)) return;
    const sel = rule.selector;
    rule.walkDecls((d) => {
      if (d.prop === 'font-family') { if (/Montserrat/.test(d.value)) { d.value = isKop(sel) ? KOP : TEKST; n++; } return; }
      const soort = d.prop.startsWith('--') ? (/bg|back|fill|surface|tint/i.test(d.prop) ? 'vlak' : /border|line|rand/i.test(d.prop) ? 'rand' : 'tekst') : soortVan(d.prop);
      if (!soort) return;
      const band = soort === 'vlak' && /E3ECFF 0%?,\s*#F4F7FF 100%\)/i.test(d.value);
      let alle = true, soorten = new Set(), anders = false;
      let v = d.value.replace(KLEUR, (m, hx, r, g, b, a) => {
        const x = hx || [r, g, b].map((q) => (+q).toString(16).padStart(2, '0')).join('');
        const nw = kaartKleur(x, a === undefined ? 1 : +a, soort, d.prop, sel);
        if (nw === null) { alle = false; soorten.add(m.toUpperCase()); return m; }
        anders = true; soorten.add(nw); return nw;
      });
      if (!anders) return;
      // een verloop waarvan alle kleuren zijn omgezet wordt een egaal vlak
      if (soort === 'vlak' && /gradient/.test(v) && !/url\(/.test(v)) {
        const k = [...soorten];
        if (alle && k.every((c) => c === INKT)) v = INKT;
        else if (k.every((c) => /^(#FFFFFF|#F1F3F8|#FFF|RGB\(255, ?255, ?255\))$/i.test(c))) v = k.includes(GRIJS) && !k.some((c) => /FFF/i.test(c)) ? GRIJS : '#FFFFFF';
      }
      if (band) { v = GRIJS; if (!/::|:hover/.test(sel)) rule.append({ prop: 'border-bottom', value: '1px solid ' + LIJN, important: true }); }
      d.value = v; n++;
    });
    // gele knoppen uit de herstellingen krijgen de vorm van de doorklikknop
    if (rule.some((d) => d.type === 'decl' && /^background(-color)?$/.test(d.prop) && /#F9C31F/i.test(d.value)) && !/:hover/.test(sel) && !/dpv-geel/.test(sel)) {
      rule.append({ prop: 'border', value: '1.5px solid ' + INKT, important: true }, { prop: 'box-shadow', value: '3px 3px 0 ' + INKT, important: true }, { prop: 'border-radius', value: '10px', important: true });
      rule.walkDecls(/^border-color$/, (d) => { if (/F9C31F/i.test(d.value)) d.remove(); });
    }
  });
  console.log(naam, 'omgezet', n);
  return root.toString();
}
const basis = ['gen.css', 'inline.css', 'na.css'].map((f) => `/* --- ${f} --- */\n` + zetOm(fs.readFileSync(f, 'utf8'), f)).join('\n');
fs.writeFileSync('k-basis.css', basis);

// ---------- vormen uit de oorspronkelijke opmaak ----------
const B = JSON.parse(fs.readFileSync('bladen.json', 'utf8'));
const OVERSLAAN_BLAD = /dpv-skin\.css|shopifycloud|emrldtp|pagefly|fonts\.googleapis|accelerated-checkout|shopify_pay|portable-wallets/;
const OVERSLAAN_SEL = /\.dhk|\.dhr|\.dsr|#dsr-|\.dwa|\.dpvbf|Avada|\.pf-|__pf|shopify-payment|\.pvnav|\.pvf|\.pvs\b|\.pvs-|\.pvz2-|#shopify-pc|\.shopify-pc|gravity|\.dpv-skin|\.dhd|\.dpp\b|#dpp|:not\(#x\)|dpvai|::(before|after)|\.bfr|\.bf-|blackfriday/;
const RGB = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/;
function hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); } return [s, l]; }
const VARLICHT = /var\(--(rd|line|lijn|rand|border|bd|grens|ln)\b/;
const lichteRand = (v) => { if (VARLICHT.test(v)) return true; const m = RGB.exec(v); if (!m) return false; const a = m[4] === undefined ? 1 : +m[4]; const [s, l] = hsl(+m[1], +m[2], +m[3]); return a > 0.5 && l > 0.78 && (s < 0.5 || (l > 0.8)) && !(+m[1] > 240 && +m[2] > 240 && +m[3] > 240); };
const witVlak = (v) => { if (/var\(--(wit|white|bg|kaart|card|surface)\b/.test(v) || /^(#fff|white)\b/i.test(v.trim())) return true; const m = RGB.exec(v); if (!m || /gradient/.test(v)) return false; const a = m[4] === undefined ? 1 : +m[4]; return a > 0.8 && +m[1] > 243 && +m[2] > 243 && +m[3] > 243; };
const grijzeSchaduw = (v) => { if (/inset|var\(/.test(v) || v === 'none') return false; const ms = v.match(new RegExp(RGB.source, 'g')); if (!ms) return false; return ms.every((c) => { const m = RGB.exec(c); const [s, l] = hsl(+m[1], +m[2], +m[3]); return l < 0.45 || s < 0.3; }); };
const px = (v) => { const m = /^([\d.]+)(px|rem)?/.exec(v.trim()); if (!m) return 0; if (/%/.test(v)) return 999; return +m[1] * (m[2] === 'rem' ? 10 : 1); };
const uit = postcss.root(), gezien = new Set(); let nv = 0;
const hoger = (s) => { s = s.trim(); return /^(html|:root)\b/.test(s) ? s.replace(/^(html|:root)/, '$1:not(#x)') : 'html:not(#x) ' + s; };
for (const blad of Object.values(B)) {
  if (OVERSLAAN_BLAD.test(blad.bron)) continue;
  let root; try { root = postcss.parse(blad.css); } catch (e) { continue; }
  root.walkRules((rule) => {
    if (rule.parent && rule.parent.type === 'atrule' && /keyframes/.test(rule.parent.name)) return;
    const sels = rule.selectors.filter((s) => !OVERSLAAN_SEL.test(s)); if (!sels.length) return;
    const sel = sels.join(',');
    const D = {}; rule.walkDecls((d) => { if (d.parent === rule) D[d.prop] = d.value; });
    const nieuw = [];
    const veld = sels.every((s) => /(^|[\s>+~.])(input|select|textarea)(?![\w-])(?!\[type=.?(checkbox|radio|range|submit|button))/i.test(s.split(/[\s>+~]/).pop()) || /(^|[\s>+~])(input|select|textarea)\b/.test(s.split(/\s+/).pop()));
    const rand = D.border, straal = D['border-radius'] ? px(D['border-radius']) : -1;
    const bg = D.background || D['background-color'];
    const hover = /:hover|:focus|:active|\.actief|\.active|\.on\b|\.sel\b|\[aria-(selected|pressed|current)|:checked/.test(sel);
    if (veld && rand && !/none|^0/.test(rand)) { nieuw.push(['border-color', VELD], ['border-width', '1px'], ['border-radius', '10px']); if (D['box-shadow']) nieuw.push(['box-shadow', 'none']); }
    else {
      if (rand && lichteRand(rand) && !/none|^0|dashed|dotted/.test(rand) && px(rand) <= 2 && (straal >= 6 || (straal < 0 && bg && witVlak(bg) && D.padding))) {
        const kaart = straal >= 12 && straal <= 28;
        if (!hover) nieuw.push(['border-color', kaart || straal < 0 ? LIJN : VELD]); if (px(rand) > 1) nieuw.push(['border-width', '1px']);
        if (kaart && (!bg || witVlak(bg))) nieuw.push(['border-radius', '14px']);
      }
      if (D['box-shadow'] && grijzeSchaduw(D['box-shadow'])) {
        // een kaart zonder rand maar met schaduw krijgt een inktlijn van schaduw (verandert de maat niet)
        if (!hover && bg && witVlak(bg) && (!rand || /none|^0/.test(rand)) && straal >= 8 && !/fixed|sticky/.test(D.position || '')) nieuw.push(['box-shadow', '0 0 0 1px ' + LIJN]);
        else if (!/fixed|sticky|absolute/.test(D.position || '')) nieuw.push(['box-shadow', hover && !rand ? null : 'none']);
      }
    }
    const nw = nieuw.filter((x) => x[1] !== null); if (!nw.length) return;
    const keten = []; let p = rule.parent; while (p && p.type === 'atrule') { keten.unshift(p); p = p.parent; }
    const sleutel = keten.map((k) => k.name + k.params).join('|') + '§' + sel + '§' + nw.map((x) => x.join(':')).join(';');
    if (gezien.has(sleutel)) return; gezien.add(sleutel);
    let doel = uit; for (const k of keten) { const a = postcss.atRule({ name: k.name, params: k.params }); doel.append(a); doel = a; }
    const r = postcss.rule({ selector: sels.map(hoger).join(',') }); nw.forEach(([prop, value]) => r.append({ prop, value, important: true })); doel.append(r); nv++;
  });
}
fs.writeFileSync('k-vorm.css', '/* --- vormen: kaarten en velden met een fijne lijn (variant E), geen grijze schaduw (kaart.cjs) --- */\n' + uit.toString().replace(/\n\s*/g, '').replace(/;\}/g, '}'));
console.log('vormregels', nv);
