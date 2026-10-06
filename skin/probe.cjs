// Eén lading per pagina op 390 breed: zoekt donkere vlakken, velden, en geeft de HTML van opgegeven selectors.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs');
const [pad, naam, ...sels] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  if (process.env.CSS) await c.route(/dpv-skin\.css/, r => r.fulfill({ contentType: 'text/css', body: fs.readFileSync(process.env.CSS, 'utf8') }));
  const p = await c.newPage();
  await p.goto('https://www.deprijsvergelijker.com' + pad + (pad.includes('?') ? '&' : '?') + 'preview_theme_id=190374052168&_fd=0&pb=0', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.waitForTimeout(2500);
  const t = await p.title();
  if (/Just a moment|Verifying your connection/i.test(t)) { console.log('CONTROLEPAGINA, gestopt'); await b.close(); process.exit(2); }
  const pan = await p.evaluate(() => { const e = document.getElementById('dpvai-paneel'); if (!e) return null; const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { top: Math.round(r.top), h: Math.round(r.height), vh: innerHeight, vis: s.visibility, disp: s.display, tr: s.transform, op: s.opacity, kl: e.className }; }); console.log('paneel', JSON.stringify(pan));
  await p.evaluate(async () => { for (let y = 0, i = 0; y < document.documentElement.scrollHeight && i < 60; y += 700, i++) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); });
  await p.waitForTimeout(1500);
  const d = await p.evaluate((sels) => {
    const pd = e => { const u = []; let q = e; for (let i = 0; q && q !== document.body && i < 5; i++, q = q.parentElement) u.unshift(q.tagName.toLowerCase() + (q.id ? '#' + q.id : '') + (typeof q.className === 'string' && q.className.trim() ? '.' + q.className.trim().split(/\s+/).join('.') : '')); return u.join(' > '); };
    const cs = e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return { bg: s.backgroundColor, img: s.backgroundImage.slice(0, 60), kleur: s.color, rand: s.borderTopWidth + ' ' + s.borderTopColor, rad: s.borderTopLeftRadius, sch: s.boxShadow.slice(0, 50), font: s.fontFamily.slice(0, 30), w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.top + scrollY) }; };
    const uit = { titel: document.title, overloop: document.documentElement.scrollWidth - innerWidth, hoogte: document.documentElement.scrollHeight, sel: {}, donker: [], velden: [], koppen: [] };
    sels.forEach(s => { uit.sel[s] = [...document.querySelectorAll(s)].slice(0, 3).map(e => ({ pad: pd(e), cs: cs(e), stijl: e.getAttribute('style'), html: e.outerHTML.slice(0, 900) })); });
    document.querySelectorAll('main *, #MainContent *').forEach(e => { const s = getComputedStyle(e), m = s.backgroundColor.match(/[\d.]+/g); if (!m) return; const a = m.length > 3 ? +m[3] : 1; const r = e.getBoundingClientRect(); if (a > .5 && (+m[0] + +m[1] + +m[2]) < 200 && r.width > 100 && r.height > 36 && !/^(A|BUTTON)$/.test(e.tagName)) uit.donker.push({ pad: pd(e), cs: cs(e), stijl: (e.getAttribute('style') || '').slice(0, 200) }); });
    document.querySelectorAll('input,select,textarea').forEach(e => { if (/hidden|checkbox|radio|submit/.test(e.type) || !e.offsetParent) return; uit.velden.push({ pad: pd(e), cs: cs(e), ouder: cs(e.parentElement) }); });
    document.querySelectorAll('main h1,main h2').forEach(e => uit.koppen.push(getComputedStyle(e).fontFamily.slice(0, 22) + ' | ' + e.textContent.trim().slice(0, 40)));
    return uit;
  }, sels);
  fs.writeFileSync((process.env.UIT||'k/t2')+'/' + naam + '.json', JSON.stringify(d, null, 1));
  await p.screenshot({ path: (process.env.UIT||'k/t2')+'/' + naam + '.jpg', type: 'jpeg', quality: 65, fullPage: true, clip: { x: 0, y: 0, width: 390, height: Math.min(d.hoogte, 14000) } });
  console.log('ok', naam, d.titel, 'overloop', d.overloop, 'h', d.hoogte, 'donker', d.donker.length, 'velden', d.velden.length);
  await b.close(); process.exit(0);
})();
