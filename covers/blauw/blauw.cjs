const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs');
const INKT = '#0D1B2A', BLAUW = '#2456D6', GROEN = '#3FAE7A', GEEL = '#F9C31F';
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const mime = b => b[0] === 0x89 ? 'image/png' : b[0] === 0xff ? 'image/jpeg' : b.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : b[0] === 0x47 ? 'image/gif' : 'image/png';
const uri = f => { const b = fs.readFileSync(f); return `data:${mime(b)};base64,${b.toString('base64')}`; };
const F = {
  'apple iphone 18 pro': 'dpv-po-pro.webp', 'apple iphone 18 pro dark cherry': 'dpv-po-pro.webp', 'apple iphone 18 pro light blue': 'dpv-po-promax.webp',
  'apple iphone 18 pro max': 'dpv-po-promax.webp', 'apple iphone duo': 'dpv-po-duo-groot.webp', 'apple iphone ultra': 'dpv-po-duo-groot.webp',
  'apple iphone 17 pro': 'vg-iphone-17-pro.img', 'apple iphone 17 pro max': 'vg-iphone-17-pro-max.img', 'apple iphone 17': 'vg-iphone-17.img', 'apple iphone': 'vg-iphone-17.img',
  'apple iphone 17e': 'vg-iphone-17e.img', 'apple iphone air': 'vg-iphone-air.img', 'google pixel 10': 'vg-pixel-10.img',
  'samsung galaxy z fold 8': 't-samsung-galaxy-z-fold-8.img', 'samsung galaxy z fold 8 ultra': 't-samsung-galaxy-z-fold-8.img', 'samsung galaxy z flip 8': 't-samsung-galaxy-z-flip-8.img',
  'samsung galaxy': 'vg-galaxy-s26.img', 'samsung galaxy s26': 'vg-galaxy-s26.img', 'samsung galaxy s26 ultra': 'vg-galaxy-s26-ultra.img', 'samsung galaxy s26 fe': 'vg-galaxy-s26-fe.img',
  'nintendo switch 2': 'oud-sw2.img', 'playstation portal': 'portal-0.img', 'ea sports fc 27 ps5': 'oud-fc-ps5.png', 'ea sports fc 27 nintendo switch': 'oud-fc-switch2.png',
  'gta 6 ps5': 'oud-gta.img', 'gta 6 xbox': 'oud-gtax.img', 'mario kart world nintendo switch 2': 'oud-mk.img', 'apple airpods pro': 'airpods-1.img', 'sony koptelefoon': 'sony-3.img',
  'siemens wasmachine': 'wasmachine-2.img', 'steelstofzuiger': 'stofzuiger-2.img', 'playstation 5': 'ps5-2.img', 'apple macbook': 'macbook-0.img', 'asus vivobook': 'vivobook-1.img',
  'philips airfryer': 'airfryer-3.img', "de'longhi magnifica s": 'delonghi-1.img', 'samsung oled tv 65 inch': 'samsungtv-0.img', 'lg oled tv 55 inch': 'lgtv-1.img', 'oneplus 15': 'oneplus-0.img'
};
const S = `fill="none" stroke="${BLAUW}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"`;
const ICO = {
  zon: `<circle cx="150" cy="46" r="22" ${S}/><path d="M150 6v10M150 76v10M110 46h10M180 46h10M122 18l7 7M171 67l7 7M178 18l-7 7" ${S}/><path d="M34 176l22-76h108l22 76z" ${S}/><path d="M45 138h130M92 100l-10 76M128 100l10 76" ${S}/>`,
  stekker: `<path d="M84 30v44M136 30v44" ${S}/><path d="M60 74h100v34a50 50 0 0 1-100 0z" ${S}/><path d="M110 158v16a22 22 0 0 0 44 0v-6a20 20 0 0 1 40 0" ${S}/><path d="M116 92l-14 22h18l-12 20" ${S}/>`,
  schild: `<path d="M110 14l74 26v56c0 46-32 78-74 94-42-16-74-48-74-94V40z" ${S}/><path d="M110 70v60M80 100h60" ${S}/>`,
  kalender: `<rect x="26" y="40" width="168" height="146" rx="18" ${S}/><path d="M26 82h168M72 22v34M148 22v34" ${S}/><circle cx="110" cy="134" r="30" ${S}/><path d="M110 116v18l12 8" ${S}/>`,
  euro: `<circle cx="110" cy="104" r="84" ${S}/><path d="M146 66a44 44 0 1 0 0 76M62 92h56M62 116h50" ${S}/>`,
  telefoon: `<rect x="62" y="10" width="96" height="180" rx="20" ${S}/><path d="M96 164h28" ${S}/><path d="M92 86l14 14 24-28" ${S}/>`,
  koffer: `<rect x="20" y="62" width="180" height="116" rx="18" ${S}/><path d="M78 62V44a14 14 0 0 1 14-14h36a14 14 0 0 1 14 14v18M20 112h180M98 112v16h24v-16" ${S}/>`,
  grafiek: `<path d="M24 20v156h176" ${S}/><path d="M52 140l40-40 30 22 58-70" ${S}/><path d="M150 52h30v30" ${S}/>`,
  router: `<rect x="24" y="118" width="172" height="58" rx="16" ${S}/><path d="M56 147h.1M84 147h.1M112 147h.1" ${S} stroke-width="10"/><path d="M160 118V86" ${S}/><path d="M132 66a40 40 0 0 1 56 0M116 48a64 64 0 0 1 88 0" ${S}/>`,
  winkelwagen: `<path d="M18 30h28l22 96h100l20-68H58" ${S}/><circle cx="82" cy="162" r="13" ${S}/><circle cx="156" cy="162" r="13" ${S}/>`,
  tv: `<rect x="20" y="30" width="180" height="112" rx="14" ${S}/><path d="M76 176h68M110 142v34" ${S}/>`,
  sim: `<path d="M60 14h64l40 40v118a14 14 0 0 1-14 14H60a14 14 0 0 1-14-14V28a14 14 0 0 1 14-14z" ${S}/><rect x="74" y="94" width="62" height="62" rx="10" ${S}/><path d="M74 125h62M105 94v62" ${S}/>`
};
const svg = k => `<svg viewBox="0 0 220 200">${ICO[k] || ICO.euro}</svg>`;
const logo = `<div class="lg"><svg viewBox="0 0 64 64" width="50" height="50"><rect width="64" height="64" rx="14" fill="#fff"/><path d="M14 44V20h9.5c5.8 0 9.6 3.4 9.6 8.7 0 5.2-3.8 8.6-9.6 8.6H20v6.7h-6Zm6-11.8h3c2.4 0 3.9-1.3 3.9-3.5S25.400 25.200 23 25.200h-3v7Z" fill="#2456D6"/><circle cx="46" cy="44" r="9" fill="#3FAE7A"/></svg><b>De<i>Prijs</i>vergelijker</b></div>`;
function kop(c) {
  let k = esc(c.kop); const a = esc(c.accent || '');
  if (a && k.includes(a)) { const i = k.lastIndexOf(a); k = k.slice(0, i) + '<em>' + a + '</em>' + k.slice(i + a.length); }
  const n = c.kop.length; const fs_ = n <= 30 ? 88 : n <= 42 ? 78 : n <= 54 ? 68 : 60;
  return `<h1 style="font-size:${fs_}px">${k}</h1>`;
}
function foto(n) { const f = F[String(n).toLowerCase()]; if (!f) return null; return uri('foto/' + f); }
function rechts(c) {
  if (c.type === 'foto' || c.type === 'vs') {
    const im = (c.fotos || []).map(foto).filter(Boolean);
    if (c.type === 'vs' && im.length === 2) return `<div class="foto f1 hoog"><img src="${im[0]}"></div><span class="vs">vs</span><div class="foto f2 hoog"><img src="${im[1]}"></div>`;
    if (im.length >= 2) return `<div class="foto f1"><img src="${im[0]}"></div><div class="foto f2"><img src="${im[1]}"></div>`;
    if (im.length === 1) return `<div class="foto een"><img src="${im[0]}"></div>`;
    c.type = 'label'; c.ico = c.ico || 'telefoon'; c.bij = c.bij || c.pil;
  }
  if (c.type === 'cijfer') { const n = String(c.cijfer).length; return `<div class="cijfer">${svg(c.ico)}<b style="font-size:${n <= 5 ? 104 : n <= 8 ? 84 : 66}px">${esc(c.cijfer)}</b><span>${esc(c.bij)}</span></div>`; }
  if (c.type === 'rijen') return `<div class="rijen">${(c.rijen || []).map(r => `<div><b>${esc(r[0])}</b><span>${esc(r[1])}</span></div>`).join('')}</div>`;
  return `<div class="cijfer lab">${svg(c.ico)}<span class="lb">${esc(c.bij)}</span></div>`;
}
const html = c => `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Bricolage+Grotesque:opsz,wght@12..96,800&display=swap" rel="stylesheet"><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:Montserrat,sans-serif;width:1600px;height:900px;overflow:hidden}
.cv{width:1600px;height:900px;color:#fff;background:linear-gradient(150deg,#2F66E8 0%,#2456D6 55%,#1B45B4 100%);display:grid;grid-template-columns:800px 1fr;gap:20px;padding:72px 80px;position:relative;overflow:hidden}
.l{display:flex;flex-direction:column;min-width:0}.pil{align-self:flex-start;background:rgba(255,255,255,.16);color:#fff;font-weight:800;font-size:26px;border-radius:999px;padding:13px 26px;white-space:nowrap}
h1{line-height:1.05;letter-spacing:-.035em;font-weight:800;margin-top:36px;overflow-wrap:break-word}h1 em{font-style:normal;color:${GEEL}}
.lg{margin-top:auto;display:flex;align-items:center;gap:14px}.lg b{font:800 33px 'Bricolage Grotesque';color:#fff;letter-spacing:-.02em}.lg i{font-style:normal;color:#9EE7C3}
.r{position:relative;display:flex;align-items:center;justify-content:center}
.foto{background:#fff;border-radius:34px;display:flex;align-items:center;justify-content:center;position:absolute}.foto img{max-width:82%;max-height:84%;object-fit:contain}
.f1{width:440px;height:400px;left:0;top:40px;box-shadow:18px 18px 0 ${GROEN}}.f2{width:400px;height:360px;right:0;bottom:40px;box-shadow:18px 18px 0 ${GEEL}}
.een{width:540px;height:600px;position:relative;box-shadow:20px 20px 0 ${GROEN}}
.hoog.f1{width:300px;height:560px;left:10px;top:90px;transform:rotate(-4deg)}.hoog.f2{width:300px;height:560px;right:10px;top:110px;bottom:auto;transform:rotate(4deg)}
.vs{position:absolute;z-index:2;background:${GEEL};color:${INKT};font-weight:800;font-size:30px;width:88px;height:88px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:7px solid ${BLAUW}}
.cijfer{color:${INKT};background:#fff;border-radius:40px;width:540px;padding:52px 40px;box-shadow:20px 20px 0 ${GROEN};text-align:center}.cijfer svg{width:150px;height:136px}
.cijfer b{display:block;font-weight:800;letter-spacing:-.035em;margin:16px 0 12px;white-space:nowrap;line-height:1.05}.cijfer span{font-size:29px;font-weight:600;color:#4A5A70;line-height:1.25;display:block}
.cijfer.lab svg{width:190px;height:172px}.cijfer .lb{font-size:44px;font-weight:800;color:${INKT};letter-spacing:-.02em;margin-top:22px;line-height:1.12}
.rijen{background:#fff;color:${INKT};border-radius:36px;width:600px;padding:22px 40px;box-shadow:20px 20px 0 ${GROEN}}.rijen div{padding:26px 0;border-bottom:2px solid #E6EBF2}.rijen div:last-child{border:0}
.rijen b{display:block;font-size:44px;font-weight:800;color:${BLAUW};letter-spacing:-.02em}.rijen span{font-size:27px;font-weight:600;color:#4A5A70}
</style></head><body><div class="cv"><div class="l"><span class="pil">${esc(c.pil)}</span>${kop(c)}${logo}</div><div class="r">${rechts(c)}</div></div></body></html>`;
(async () => {
  const lijst = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const alleen = process.argv[3] ? process.argv[3].split(',') : null;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 900 } }); const mis = [];
  for (const c of lijst) { if (alleen && !alleen.includes(c.handle)) continue;
    for (const n of (c.fotos || [])) if (!F[String(n).toLowerCase()]) mis.push(c.handle + ': ' + n);
    await p.setContent(html(c), { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready);
    const ov = await p.evaluate(() => { const l = document.querySelector('.l'), h = document.querySelector('h1'), g = document.querySelector('.lg'); return (h.getBoundingClientRect().bottom > g.getBoundingClientRect().top - 16) || h.scrollWidth > l.clientWidth + 2 || document.querySelector('.pil').getBoundingClientRect().right > 880; });
    if (ov) mis.push(c.handle + ': TEKST PAST NIET');
    const cz = await p.evaluate(() => { const e = document.querySelector('.cijfer b'); return e ? e.scrollWidth > e.parentElement.clientWidth - 60 : false; }); if (cz) mis.push(c.handle + ': CIJFER TE BREED');
    await p.screenshot({ path: 'nieuw/' + c.handle + '.jpg', type: 'jpeg', quality: 86 }); }
  await b.close(); console.log(mis.join('\n') || 'geen problemen');
})();
