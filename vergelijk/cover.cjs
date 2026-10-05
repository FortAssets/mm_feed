const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'); const { execSync } = require('child_process');
const b64 = f => fs.readFileSync(f).toString('base64');
const font = b64('/mnt/skills/examples/canvas-design/canvas-fonts/BricolageGrotesque-Bold.ttf');
const logo = b64('/home/claude/covers/logo-donker.png');
const M = JSON.parse(fs.readFileSync('telefoons.json', 'utf8'));
const combos = JSON.parse(fs.readFileSync('combos.json', 'utf8'));
const foto = s => { const f = 'img/' + s + '.img'; if (!fs.existsSync(f)) execSync(`curl -sL -o ${f} "${M[s].im}"`); return 'data:image/jpeg;base64,' + b64(f); };
const html = c => { const a = M[c.a], b = M[c.b]; return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:BG;src:url(data:font/ttf;base64,${font});font-weight:700 800}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;font-family:BG,sans-serif;color:#fff;overflow:hidden;position:relative;
 background:radial-gradient(700px 520px at 78% 55%,#24407a 0%,rgba(36,64,122,0) 70%),linear-gradient(135deg,#132a55 0%,#0b1b38 55%,#091530 100%)}
.in{position:absolute;left:60px;top:54px;width:500px}
.pil{display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);border-radius:99px;padding:8px 20px 9px 16px;font-size:21px}
.pil i{width:9px;height:9px;border-radius:50%;background:#34d399;display:block}
h1{font-size:56px;line-height:1.08;letter-spacing:-1.5px;margin:26px 0 0;font-weight:800}
h1 span{color:#6ee7b7}
.logo{position:absolute;left:60px;bottom:44px;height:56px;width:232px;overflow:hidden}.logo img{height:56px;display:block}
.k{position:absolute;top:110px;width:250px;height:400px;border-radius:34px;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 40px 70px -20px rgba(0,0,0,.6)}
.k img{max-width:200px;max-height:330px}
.k1{right:330px;transform:rotate(-4deg)}.k2{right:60px;transform:rotate(4deg);top:130px}
.vs{position:absolute;right:284px;top:270px;width:76px;height:76px;border-radius:50%;background:#10b981;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;box-shadow:0 10px 30px rgba(0,0,0,.4);z-index:3}
</style></head><body>
<div class="k k1"><img src="${foto(c.a)}"></div><div class="k k2"><img src="${foto(c.b)}"></div><div class="vs">vs</div>
<div class="in"><span class="pil"><i></i>Vergelijking</span><h1>${a.kort} <span>of</span> ${b.kort}?</h1></div>
<div class="logo"><img src="data:image/png;base64,${logo}"></div></body></html>`; };
(async () => { const br = await chromium.launch(); const pg = await br.newPage({ viewport: { width: 1200, height: 630 } });
  for (const c of combos) { await pg.setContent(html(c), { waitUntil: 'load' }); await pg.waitForTimeout(250); await pg.screenshot({ path: '/home/claude/mm_feed/covers/vg-' + c.handle + '.jpg', type: 'jpeg', quality: 88 }); }
  await br.close(); console.log('klaar'); })();
