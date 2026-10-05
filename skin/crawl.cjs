// Loopt alle pagina's van het thema af en verzamelt elke CSS-regel die de browser echt gebruikt
// (ook wat secties met JavaScript toevoegen), plus inline stijlen en een schermafbeelding.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'), crypto = require('crypto');
const THEMA = process.env.THEMA || '190348853576', UIT = process.env.UIT || 'voor';
const urls = fs.readFileSync('urls.txt', 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
const extra = ['/search?q=iphone', '/dit-bestaat-niet', '/cart', '/collections/all', '/policies/privacy-policy', '/policies/terms-of-service', '/pages/mijn-contracten', '/pages/bevestigen', '/pages/afmelden', '/pages/mijn-aanbiedingen', '/blogs/advies?onderwerp=telefoon', '/pages/vergelijken?cat=gaming', '/pages/vergelijken?cat=telefoons&q=iphone%2017'];
extra.forEach(e => urls.push('https://www.deprijsvergelijker.com' + e));
const naam = u => (new URL(u).pathname.replace(/\W+/g, '_').replace(/^_|_$/g, '') || 'home') + (new URL(u).search ? '_' + crypto.createHash('md5').update(u).digest('hex').slice(0, 5) : '');
fs.mkdirSync(UIT + '/shots', { recursive: true }); fs.mkdirSync(UIT + '/data', { recursive: true });
const alleen = process.argv[2] ? new RegExp(process.argv[2]) : null;
(async () => {
  const b = await chromium.launch();
  const lijst = [...new Set(urls)].filter(u => !alleen || alleen.test(u));
  let i = 0;
  async function werker() {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    while (i < lijst.length) {
      const u = lijst[i++], n = naam(u);
      if (fs.existsSync(`${UIT}/data/${n}.json`) && !process.env.OPNIEUW) continue;
      const p = await ctx.newPage();
      try {
        const sep = u.includes('?') ? '&' : '?';
        await p.goto(u + sep + 'preview_theme_id=' + THEMA + '&_fd=0&pb=0', { waitUntil: 'domcontentloaded', timeout: 45000 });
        await p.waitForTimeout(2500);
        await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); });
        await p.waitForTimeout(1500);
        const d = await p.evaluate(() => {
          const bladen = [], extern = [];
          [...document.styleSheets].forEach((s, k) => {
            try { const r = [...s.cssRules].map(x => x.cssText); bladen.push({ bron: s.href || 'inline', eigenaar: (s.ownerNode && (s.ownerNode.closest('[id^="shopify-section"]') || {}).id) || '', regels: r }); }
            catch (e) { if (s.href) extern.push(s.href); }
          });
          const stijlen = {};
          document.querySelectorAll('[style]').forEach(e => { const v = e.getAttribute('style'); if (/#|rgb|background|color|border/i.test(v)) stijlen[v] = (stijlen[v] || 0) + 1; });
          const secties = [...document.querySelectorAll('[id^="shopify-section"]')].map(e => e.id + ' ' + [...e.classList].join('.'));
          return { bladen, extern, stijlen, secties, hoogte: document.documentElement.scrollHeight, titel: document.title };
        });
        d.url = u;
        fs.writeFileSync(`${UIT}/data/${n}.json`, JSON.stringify(d));
        await p.screenshot({ path: `${UIT}/shots/${n}.jpg`, type: 'jpeg', quality: 55, fullPage: true, clip: { x: 0, y: 0, width: 390, height: Math.min(d.hoogte, 9000) } });
        console.log('ok', n, d.bladen.length, d.hoogte);
      } catch (e) { console.log('FOUT', n, e.message.slice(0, 90)); }
      await p.close();
      if (process.env.EEN) await new Promise(r => setTimeout(r, 3000));
    }
    await ctx.close();
  }
  await Promise.all(process.env.EEN ? [werker()] : [werker(), werker(), werker(), werker()]);
  await b.close(); process.exit(0);
})();
