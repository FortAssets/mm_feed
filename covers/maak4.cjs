const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs');
const b64 = f => fs.readFileSync(f).toString('base64');
const font = b64('/mnt/skills/examples/canvas-design/canvas-fonts/BricolageGrotesque-Bold.ttf');
const logo = b64('logo-donker.png');
const S = 'fill="none" stroke="url(#g)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"';
const ICO = {
  zon: `<circle cx="150" cy="46" r="22" ${S}/><path d="M150 6v10M150 76v10M110 46h10M180 46h10M122 18l7 7M171 67l7 7M178 18l-7 7" ${S}/><path d="M34 176l22-76h108l22 76z" ${S}/><path d="M45 138h130M92 100l-10 76M128 100l10 76" ${S}/>`,
  stekker: `<path d="M84 30v44M136 30v44" ${S}/><path d="M60 74h100v34a50 50 0 0 1-100 0z" ${S}/><path d="M110 158v16a22 22 0 0 0 44 0v-6a20 20 0 0 1 40 0" ${S}/><path d="M116 92l-14 22h18l-12 20" ${S}/>`,
  schild: `<path d="M110 14l74 26v56c0 46-32 78-74 94-42-16-74-48-74-94V40z" ${S}/><path d="M110 70v60M80 100h60" ${S}/>`,
  kalender: `<rect x="26" y="40" width="168" height="146" rx="18" ${S}/><path d="M26 82h168M72 22v34M148 22v34" ${S}/><circle cx="110" cy="134" r="30" ${S}/><path d="M110 116v18l12 8" ${S}/>`,
  euro: `<circle cx="110" cy="104" r="84" ${S}/><path d="M146 66a44 44 0 1 0 0 76M62 92h56M62 116h50" ${S}/>`,
  telefoon: `<rect x="62" y="10" width="96" height="180" rx="20" ${S}/><path d="M96 164h28" ${S}/><path d="M92 86l14 14 24-28" ${S}/>`,
  koffer: `<rect x="20" y="62" width="180" height="116" rx="18" ${S}/><path d="M78 62V44a14 14 0 0 1 14-14h36a14 14 0 0 1 14 14v18M20 112h180M98 112v16h24v-16" ${S}/>`,
  grafiek: `<path d="M24 20v156h176" ${S}/><path d="M52 140l40-40 30 22 58-70" ${S}/><path d="M150 52h30v30" ${S}/>`,
  router: `<rect x="24" y="118" width="172" height="58" rx="16" ${S}/><path d="M56 147h.1M84 147h.1M112 147h.1" ${S} stroke-width="9"/><path d="M160 118V86" ${S}/><path d="M132 66a40 40 0 0 1 56 0M116 48a64 64 0 0 1 88 0" ${S}/>`
};
// ico, cijfer (groot), bij (klein eronder)
const covers = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const html = c => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:BG;src:url(data:font/ttf;base64,${font});font-weight:700 800}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;font-family:BG,sans-serif;color:#fff;overflow:hidden;position:relative;
 background:radial-gradient(700px 520px at 78% 55%,#24407a 0%,rgba(36,64,122,0) 70%),linear-gradient(135deg,#132a55 0%,#0b1b38 55%,#091530 100%)}
.in{position:absolute;left:60px;top:54px;width:560px}
.pil{display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);border-radius:99px;padding:8px 20px 9px 16px;font-size:21px}
.pil i{width:9px;height:9px;border-radius:50%;background:#34d399;display:block}
h1{font-size:${c.kop.length > 44 ? 50 : 58}px;line-height:1.1;letter-spacing:-1.5px;margin:26px 0 0;font-weight:800}
.logo{position:absolute;left:60px;bottom:44px;height:56px;width:232px;overflow:hidden}.logo img{height:56px;display:block}
.krt{position:absolute;right:70px;top:86px;width:400px;height:458px;border-radius:44px;transform:rotate(4deg);
 background:linear-gradient(160deg,rgba(255,255,255,.14),rgba(255,255,255,.04));border:1.5px solid rgba(255,255,255,.2);
 box-shadow:0 40px 70px -20px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.25);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
.krt svg{width:210px;height:200px;filter:drop-shadow(0 0 26px rgba(52,211,153,.35))}
.cf{font-size:${(c.cijfer || '').length > 6 ? 62 : 84}px;line-height:1;letter-spacing:-2px;font-weight:800;background:linear-gradient(90deg,#6ee7b7,#7dd3fc);-webkit-background-clip:text;color:transparent;white-space:nowrap}
.bij{font-size:22px;color:#c7d5ee;text-align:center;padding:0 26px;line-height:1.25}
.gl{position:absolute;right:20px;top:60px;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,rgba(52,211,153,.16),transparent 65%)}
</style></head><body>
<div class="gl"></div>
<div class="krt"><svg viewBox="0 0 220 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6ee7b7"/><stop offset="1" stop-color="#7dd3fc"/></linearGradient></defs>${ICO[c.ico]}</svg>
<div class="cf">${c.cijfer}</div><div class="bij">${c.bij}</div></div>
<div class="in"><span class="pil"><i></i>${c.pil}</span><h1>${c.kop}</h1></div>
<div class="logo"><img src="data:image/png;base64,${logo}"></div>
</body></html>`;
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1200, height: 630 } });
  for (const c of covers) {
    await pg.setContent(html(c), { waitUntil: 'load' });
    await pg.waitForTimeout(250);
    await pg.screenshot({ path: '/home/claude/mm_feed/covers/' + c.f + '-3.jpg', type: 'jpeg', quality: 88 });
  }
  await br.close(); console.log('klaar');
})();
