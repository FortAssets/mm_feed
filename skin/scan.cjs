// Loopt pagina's af en meldt (1) tekst met te weinig contrast en (2) oude huisstijlkleuren die zijn blijven staan.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'), crypto = require('crypto');
const THEMA = process.env.THEMA || '190348853576', UIT = process.env.UIT || 'scan';
let urls = fs.readFileSync('urls.txt', 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
['/search?q=iphone', '/dit-bestaat-niet', '/cart', '/collections/all', '/pages/mijn-contracten', '/pages/bevestigen', '/pages/afmelden', '/pages/mijn-aanbiedingen', '/blogs/advies?onderwerp=telefoon', '/pages/vergelijken?cat=gaming', '/pages/vergelijken?cat=telefoons&q=iphone%2017'].forEach(e => urls.push('https://www.deprijsvergelijker.com' + e));
const alleen = process.argv[2] ? new RegExp(process.argv[2]) : null;
urls = [...new Set(urls)].filter(u => !alleen || alleen.test(u));
const naam = u => (new URL(u).pathname.replace(/\W+/g, '_').replace(/^_|_$/g, '') || 'home') + (new URL(u).search ? '_' + crypto.createHash('md5').update(u).digest('hex').slice(0, 5) : '');
fs.mkdirSync(UIT, { recursive: true });
const inPagina = () => {
  const OUD = [[5,150,105],[16,185,129],[4,120,87],[15,168,118],[11,125,92],[127,227,188],[27,63,160],[37,99,235],[30,58,138],[27,16,51],[45,27,82],[61,35,112],[109,40,217],[122,62,157],[195,174,240],[0,182,122],[236,253,245],[240,253,244],[167,243,208]];
  const p = c => { const m = (c || '').match(/[\d.]+/g); return m && m.length >= 3 ? [+m[0], +m[1], +m[2], m.length > 3 ? +m[3] : 1] : null; };
  const L = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const isOud = c => c && c[3] > .3 && OUD.some(o => Math.abs(o[0] - c[0]) < 3 && Math.abs(o[1] - c[1]) < 3 && Math.abs(o[2] - c[2]) < 3);
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
    if (e.closest('#dpvai-paneel,[class*="Avada"],#shopify-pc__banner,script,style,noscript,svg,.dhk-verborgen,[hidden]')) return;
    const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return;
    const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < .3) return;
    const tekst = [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim().length > 1).map(n => n.textContent.trim()).join(' ');
    if (tekst) {
      const fg = p(cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color ? cs.webkitTextFillColor : cs.color), bg = achtergrond(e);
      if (fg && bg && fg[3] > .3) { const a = L(fg), b = L(bg), c = (Math.max(a, b) + .05) / (Math.min(a, b) + .05); const groot = parseFloat(cs.fontSize) >= 18.5 || (parseFloat(cs.fontSize) >= 14 && +cs.fontWeight >= 700); if (c < (groot ? 2.9 : 3.9)) zie(contrast, pad(e) + '|' + fg.slice(0, 3) + '|' + bg.slice(0, 3), { c: +c.toFixed(2), t: tekst.slice(0, 40) }); }
      if (isOud(p(cs.color))) zie(oud, 'tekst ' + pad(e) + '|' + p(cs.color).slice(0, 3), { t: tekst.slice(0, 30) });
    }
    const bg = p(cs.backgroundColor); if (isOud(bg)) zie(oud, 'vlak ' + pad(e) + '|' + bg.slice(0, 3), { t: (e.textContent || '').trim().slice(0, 30) });
    if (parseFloat(cs.borderTopWidth) > 0 && isOud(p(cs.borderTopColor))) zie(oud, 'rand ' + pad(e) + '|' + p(cs.borderTopColor).slice(0, 3), {});
    const ff = cs.fontFamily; if (tekst && !/Montserrat/.test(ff) && !/Bricolage/.test(ff)) zie(oud, 'letter ' + pad(e) + '|' + ff.slice(0, 30), { t: tekst.slice(0, 30) });
  });
  return { contrast, oud, overloop: document.documentElement.scrollWidth - innerWidth, titel: document.title };
};
(async () => {
  const b = await chromium.launch(); let i = 0;
  async function werker() {
    const ctx = await b.newContext(process.env.BREED ? { viewport: { width: 1280, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    while (i < urls.length) {
      const u = urls[i++], n = naam(u), f = `${UIT}/${n}.json`;
      if (fs.existsSync(f)) { try { if (!/Just a moment/.test(JSON.parse(fs.readFileSync(f, 'utf8')).titel)) continue; } catch (e) {} }
      const p = await ctx.newPage(); const fouten = []; p.on('pageerror', e => fouten.push(e.message.slice(0, 120)));
      try {
        await p.goto(u + (u.includes('?') ? '&' : '?') + 'preview_theme_id=' + THEMA + '&_fd=0&pb=0', { waitUntil: 'domcontentloaded', timeout: 45000 });
        await p.waitForTimeout(2500);
        await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 110)); } scrollTo(0, 0); });
        await p.waitForTimeout(1200);
        const d = await p.evaluate(inPagina); d.url = u; d.fouten = fouten;
        fs.writeFileSync(f, JSON.stringify(d)); console.log('ok', n, Object.keys(d.contrast).length, Object.keys(d.oud).length, d.overloop);
      } catch (e) { console.log('FOUT', n, e.message.slice(0, 80)); }
      await p.close(); await new Promise(r => setTimeout(r, 2500));
    }
    await ctx.close();
  }
  await Promise.all([werker(), werker()]);
  await b.close(); process.exit(0);
})();
