// Kaartjesstijl: laadt pagina's van de themakopie een voor een (minstens 4,5 s ertussen), maakt een schermafbeelding
// op mobiel (390) en desktop (1366), en meldt contrast, oude kleuren, verkeerde letters en horizontale scroll.
// CSS=<bestand>  vervangt assets/dpv-skin.css door een lokaal bestand (testen voor het uploaden).
// DATA=1 bewaart ook alle CSS-regels van de pagina (voor bladen.json).
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'), crypto = require('crypto');
const THEMA = process.env.THEMA || '190374052168', UIT = process.env.UIT || 'k/uit', CSS = process.env.CSS, BREEDTES = (process.env.B || 'm,d').split(',');
const paden = process.argv.slice(2).flatMap(a => a.startsWith('@') ? fs.readFileSync(a.slice(1), 'utf8').split('\n').map(s => s.trim()).filter(Boolean) : [a]).map(p => p.replace('https://www.deprijsvergelijker.com', '') || '/');
const naam = p => { const u = new URL('https://x' + p); return (u.pathname.replace(/\W+/g, '_').replace(/^_|_$/g, '') || 'home') + (u.search ? '_' + crypto.createHash('md5').update(p).digest('hex').slice(0, 5) : ''); };
fs.mkdirSync(UIT, { recursive: true });
const slaap = ms => new Promise(r => setTimeout(r, ms));
const inPagina = () => {
  const OUD = [[5,150,105],[16,185,129],[4,120,87],[15,168,118],[11,125,92],[127,227,188],[27,63,160],[37,99,235],[30,58,138],[27,16,51],[45,27,82],[61,35,112],[109,40,217],[122,62,157],[195,174,240],[0,182,122],[236,253,245],[240,253,244],[167,243,208],
    [36,86,214],[27,69,180],[234,241,255],[243,247,255],[244,247,255],[220,231,255],[227,236,255],[201,216,250],[169,196,255]];
  const p = c => { const m = (c || '').match(/[\d.]+/g); return m && m.length >= 3 ? [+m[0], +m[1], +m[2], m.length > 3 ? +m[3] : 1] : null; };
  const L = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const isOud = c => c && c[3] > .3 && OUD.some(o => Math.abs(o[0] - c[0]) < 3 && Math.abs(o[1] - c[1]) < 3 && Math.abs(o[2] - c[2]) < 3);
  const isBlauw = c => c && Math.abs(c[0] - 36) < 3 && Math.abs(c[1] - 86) < 3 && Math.abs(c[2] - 214) < 3;
  const pad = e => { const d = x => x.tagName.toLowerCase() + (x.id && !/\d{5}/.test(x.id) ? '#' + x.id : '') + (typeof x.className === 'string' && x.className.trim() ? '.' + x.className.trim().split(/\s+/).slice(0, 2).join('.') : ''); const uit = [d(e)]; let q = e.parentElement; for (let i = 0; q && i < 2; i++, q = q.parentElement) uit.unshift(d(q)); return uit.join(' > '); };
  function achtergrond(e) {
    for (let q = e; q; q = q.parentElement) {
      const cs = getComputedStyle(q);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') { if (/url\(/.test(cs.backgroundImage)) return null; const c = p((cs.backgroundImage.match(/rgba?\([^)]*\)/) || [])[0]); if (c && c[3] > .5) return c; }
      const c = p(cs.backgroundColor); if (c && c[3] > .5) return c;
    }
    return [255, 255, 255, 1];
  }
  const contrast = {}, oud = {};
  const zie = (o, k, v) => { if (!o[k]) o[k] = Object.assign({ n: 0 }, v); o[k].n++; };
  document.querySelectorAll('body *').forEach(e => {
    if (e.closest('#dpvai-paneel,[class*="Avada"],#shopify-pc__banner,script,style,noscript,svg,.dhk-verborgen,[hidden],.dhd')) return;
    const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return;
    const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < .3) return;
    const tekst = [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim().length > 1).map(n => n.textContent.trim()).join(' ');
    if (tekst) {
      const fg = p(cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color ? cs.webkitTextFillColor : cs.color), bg = achtergrond(e);
      if (fg && bg && fg[3] > .3) { const a = L(fg), b = L(bg), c = (Math.max(a, b) + .05) / (Math.min(a, b) + .05); const groot = parseFloat(cs.fontSize) >= 18.5 || (parseFloat(cs.fontSize) >= 14 && +cs.fontWeight >= 700); if (c < (groot ? 2.9 : 3.9)) zie(contrast, pad(e) + '|' + fg.slice(0, 3) + '|' + bg.slice(0, 3), { c: +c.toFixed(2), t: tekst.slice(0, 40) }); }
      // blauwe tekst mag alleen nog als tekstlink
      const kc = p(cs.color); if (isOud(kc) && !(isBlauw(kc) && e.closest('a') && !isOud(p(getComputedStyle(e.closest('a')).backgroundColor)))) zie(oud, 'tekst ' + pad(e) + '|' + kc.slice(0, 3), { t: tekst.slice(0, 30) });
    }
    const bg = p(cs.backgroundColor); if (isOud(bg)) zie(oud, 'vlak ' + pad(e) + '|' + bg.slice(0, 3), { t: (e.textContent || '').trim().slice(0, 30) });
    if (cs.backgroundImage.includes('gradient') && r.width > 200 && r.height > 60) zie(oud, 'verloop ' + pad(e) + '|' + cs.backgroundImage.slice(0, 60), {});
    if (parseFloat(cs.borderTopWidth) > 0 && isOud(p(cs.borderTopColor))) zie(oud, 'rand ' + pad(e) + '|' + p(cs.borderTopColor).slice(0, 3), {});
    const ff = cs.fontFamily; if (tekst && !/^"?(Instrument Sans|Bricolage Grotesque)/.test(ff)) zie(oud, 'letter ' + pad(e) + '|' + ff.slice(0, 30), { t: tekst.slice(0, 30) });
    if (r.right > innerWidth + 2 && r.left < innerWidth && !e.closest('[style*="overflow"]')) { let sc = false; for (let q = e.parentElement; q && q !== document.body; q = q.parentElement) { const o = getComputedStyle(q).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') { sc = true; break; } } if (!sc) zie(oud, 'breed ' + pad(e) + '|' + Math.round(r.right - innerWidth), {}); }
  });
  // vormen: kaarten zonder inktrand, dubbele of dikke randen, donkere vlakken, velden en knoppen in de verkeerde vorm
  const vorm = {};
  const hsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); } return [s, l]; };
  const isInkt = c => c && c[3] > .6 && c[0] < 40 && c[1] < 50 && c[2] < 70;
  document.querySelectorAll('body *').forEach(e => {
    if (e.closest('#dpvai-paneel,[class*="Avada"],#shopify-pc__banner,script,style,noscript,svg,[hidden],.dhd,.pvnav,footer.pvf,.pvs')) return;
    const r = e.getBoundingClientRect(); if (r.width < 24 || r.height < 20) return;
    const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < .3) return;
    const bg = p(cs.backgroundColor), bw = parseFloat(cs.borderTopWidth) || 0, bc = p(cs.borderTopColor), rad = parseFloat(cs.borderTopLeftRadius) || 0, sh = cs.boxShadow;
    const k = pad(e);
    const zichtbaarVlak = bg && bg[3] > .5;
    if (zichtbaarVlak) { const [s, l] = hsl(bg);
      if (l < .28 && r.width > 280 && r.height > 140) zie(vorm, 'donker ' + k + '|' + bg.slice(0, 3) + '|' + Math.round(r.width) + 'x' + Math.round(r.height), {});
      if (/^(A|BUTTON)$/.test(e.tagName) || e.getAttribute('role') === 'button' || (e.tagName === 'INPUT' && /submit|button/.test(e.type))) {
        const geel = bg[0] > 230 && bg[1] > 170 && bg[2] < 80;
        if (s > .3 && l < .75 && !geel) zie(vorm, 'knopkleur ' + k + '|' + bg.slice(0, 3), { t: (e.textContent || '').trim().slice(0, 24) });
        if (geel && (!isInkt(bc) || bw < 1 || !/3px 3px/.test(sh))) zie(vorm, 'geelvorm ' + k + '|' + bw + '|' + sh.slice(0, 30), { t: (e.textContent || '').trim().slice(0, 24) });
        if (geel && r.height < 40) zie(vorm, 'geelklein ' + k + '|' + Math.round(r.height), {});
      }
    }
    if (bw >= 2.5 && isInkt(bc) && r.width > 120) zie(vorm, 'dikrand ' + k + '|' + bw, {});
    if (bw >= 1 && isInkt(bc) && /0px 0px 0px 1\.5px/.test(sh)) zie(vorm, 'dubbelrand ' + k, {});
    if (zichtbaarVlak && bg[0] > 243 && bg[1] > 243 && bg[2] > 243 && rad >= 8 && r.width > 150 && r.height > 70 && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|IMG)$/.test(e.tagName)) {
      const ring = /0px 0px 0px 1\.5px/.test(sh);
      if (!(bw >= 1 && isInkt(bc)) && !ring) zie(vorm, 'kaart ' + k + '|rand ' + bw + ' ' + (bc ? bc.slice(0, 3) : '') + '|r' + rad, {});
    }
    if (sh && sh !== 'none' && !/3px 3px 0px|0px 0px 0px|10px 10px 0px|8px 8px 0px|inset/.test(sh) && r.width > 80 && cs.position !== 'fixed') zie(vorm, 'schaduw ' + k + '|' + sh.slice(0, 44), {});
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && !/checkbox|radio|range|hidden|submit|button/.test(e.type || '')) { if (!(bw >= 1 && isInkt(bc)) && !(e.parentElement && isInkt(p(getComputedStyle(e.parentElement).borderTopColor)) && parseFloat(getComputedStyle(e.parentElement).borderTopWidth) >= 1)) zie(vorm, 'veld ' + k + '|' + bw + ' ' + (bc ? bc.slice(0, 3) : ''), {}); }
  });
  // variant E: welke elementen hebben nog een inktrand (de gele knop, de beste keuze en gekozen keuzes mogen dat)
  const inkt = {};
  document.querySelectorAll('body *').forEach(e => {
    if (e.closest('.dhd,.pvnav,footer,#dpvai-paneel,svg,[class*="Avada"],#shopify-pc__banner,.pvs')) return;
    const r = e.getBoundingClientRect(); if (r.width < 20 || r.height < 14) return;
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const bc = p(cs.borderTopColor), sh = cs.boxShadow;
    const rand = (parseFloat(cs.borderTopWidth) > 0 && isInkt(bc)) || /rgb\(13, 27, 42\) 0px 0px 0px/.test(sh); if (!rand) return;
    const bg = p(cs.backgroundColor); if (bg && bg[3] > .5 && (isInkt(bg) || (bg[0] > 230 && bg[1] > 170 && bg[2] < 80))) return;
    if (/3FAE7A|63, 174, 122/i.test(sh)) return;
    if (e.matches('.on,.aan,.actief,.active,.sel,[aria-pressed="true"],[aria-selected="true"],[aria-current]')) return;
    zie(inkt, pad(e), {});
  });
  return { inkt, vorm, contrast, oud, overloop: document.documentElement.scrollWidth - innerWidth, titel: document.title };
};
(async () => {
  const b = await chromium.launch();
  const ctxs = {
    m: await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }),
    d: await b.newContext({ viewport: { width: 1366, height: 900 } }) };
  for (const k of Object.keys(ctxs)) if (CSS) {
    await ctxs[k].route(/dpv-skin\.css/, r => r.fulfill({ contentType: 'text/css', body: fs.readFileSync(CSS, 'utf8') }));
    if (process.env.GEENMONT) await ctxs[k].route(/fonts\.googleapis\.com\/css2\?family=Montserrat/, r => r.fulfill({ contentType: 'text/css', body: '' }));
  }
  let laatst = 0;
  for (const pd of paden) for (const w of BREEDTES) {
    const n = naam(pd) + '-' + w, f = `${UIT}/${n}.json`;
    if (fs.existsSync(f) && !process.env.OPNIEUW) continue;
    for (let poging = 0; poging < 2; poging++) {
      const wacht = 4600 - (Date.now() - laatst); if (wacht > 0) await slaap(wacht);
      const p = await ctxs[w].newPage(); const fouten = []; p.on('pageerror', e => fouten.push(e.message.slice(0, 120)));
      let blok = false;
      try {
        laatst = Date.now();
        await p.goto('https://www.deprijsvergelijker.com' + pd + (pd.includes('?') ? '&' : '?') + 'preview_theme_id=' + THEMA + '&_fd=0&pb=0', { waitUntil: 'domcontentloaded', timeout: 45000 });
        await p.waitForTimeout(2500);
        const titel = await p.title();
        if (/Just a moment|Verifying your connection/i.test(titel) || /Verifying your connection/i.test(await p.evaluate(() => document.body.innerText.slice(0, 400)))) { blok = true; console.log('CONTROLE', n, 'wacht 90 s'); }
        else {
          await p.evaluate(async () => { for (let y = 0, i = 0; y < document.documentElement.scrollHeight && i < 60; y += 700, i++) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); });
          await p.waitForTimeout(1500);
          if (process.env.NA) await p.evaluate(process.env.NA);
          const d = await Promise.race([p.evaluate(inPagina), new Promise((_, nee) => setTimeout(() => nee(new Error('te lang bezig met meten')), 40000))]); d.pad = pd; d.fouten = fouten;
          d.hoogte = await p.evaluate(() => document.documentElement.scrollHeight);
          if (process.env.DATA) Object.assign(d, await p.evaluate(() => {
            const bladen = []; [...document.styleSheets].forEach(s => { try { bladen.push({ bron: s.href || 'inline', eigenaar: (s.ownerNode && (s.ownerNode.closest('[id^="shopify-section"]') || {}).id) || '', regels: [...s.cssRules].map(x => x.cssText) }); } catch (e) {} });
            const stijlen = {}; document.querySelectorAll('[style]').forEach(e => { const v = e.getAttribute('style'); if (/#|rgb|background|color|border/i.test(v)) stijlen[v] = (stijlen[v] || 0) + 1; });
            return { bladen, stijlen };
          }));
          fs.writeFileSync(f, JSON.stringify(d));
          await p.screenshot({ timeout: 30000, path: `${UIT}/${n}.jpg`, type: 'jpeg', quality: 62, fullPage: true, clip: { x: 0, y: 0, width: w === 'm' ? 390 : 1366, height: Math.min(d.hoogte, w === 'm' ? 12000 : 9000) } });
          console.log('ok', n, 'contrast', Object.keys(d.contrast).length, 'oud', Object.keys(d.oud).length, 'inkt', Object.keys(d.inkt).length, 'overloop', d.overloop, 'h', d.hoogte);
        }
      } catch (e) { console.log('FOUT', n, e.message.slice(0, 90)); }
      await Promise.race([p.close(), slaap(8000)]);
      if (!blok) break; await slaap(90000);
    }
  }
  await b.close(); process.exit(0);
})();
