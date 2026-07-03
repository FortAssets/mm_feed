// MediaMarkt feed-generator (draait in GitHub Actions op een schoon IP dat
// Tradedoubler toestaat). Repliceert exact de parsing van de worker en schrijft
// data/mm-simonly.json en data/mm-devices.json. De worker leest deze via jsDelivr.
import fs from 'fs'

const MM_TOKEN = process.env.MM_TOKEN || 'FC04F9EAC08F46AB8394D3645F6FED3536266625'
const MM_TELCO_FID = '117525'
const MM_DEVICE_FID = '50606'
const MM_LOGO = 'https://hst.tradedoubler.com/file/262336/MM-logo.png'

const DEVICE_COLORS = ['Middernacht','Sterrenlicht','Donkerblauw','Lichtblauw','Donkergroen','Lichtgroen','Mintgroen','Titanium','Graphite','Grafiet','Antraciet','Aubergine','Lavendel','Phantom Black','Phantom','Awesome','Cream','Creme','Zwart','Wit','Blauw','Groen','Rood','Roze','Paars','Geel','Goud','Zilver','Grijs','Oranje','Beige','Bruin','Zwarte','Witte','Black','White','Blue','Green','Red','Pink','Purple','Yellow','Gold','Silver','Grey','Gray','Orange','Beige','Brown','Midnight','Starlight','Graphite','Lavender','Mint','Teal','Coral','Navy','Space','Natural','Desert','Ultramarine']
const MOBIELNL_COLORS = ['Middernachtblauw','Middernacht','Sterrenlicht','Donkerblauw','Lichtblauw','Hemelsblauw','Donkergroen','Lichtgroen','Mintgroen','Zeegroen','Olijfgroen','Titaniumblauw','Titaniumzwart','Titaniumwit','Titaniumnatuur','Natuurtitanium','Zwarttitanium','Wittitanium','Titanium','Grafiet','Antraciet','Aubergine','Lavendel','Korenbloem','Zwart','Wit','Blauw','Groen','Rood','Roze','Paars','Geel','Goud','Zilver','Grijs','Oranje','Beige','Bruin','Crème','Creme','Mint','Koraal','Marine','Lila','Perzik','Zand','Grafietgrijs']

function mmNum(s){const v=parseFloat(String(s||'').replace(/[^\d,\.]/g,'').replace(',','.'));return isNaN(v)?0:v}
function mmDataGB(s){s=String(s||'');if(/onbeperkt|unlimited/i.test(s))return 999;let m=s.match(/([\d.,]+)\s*GB/i);if(m)return Math.round(parseFloat(m[1].replace(',','.')));m=s.match(/([\d.,]+)\s*MB/i);if(m)return Math.round(parseFloat(m[1].replace(',','.'))/1000);return 0}
function mmTitleCase(s){s=String(s||'').trim();if(!s)return s;if(s===s.toUpperCase()){return s.charAt(0)+s.slice(1).toLowerCase()}return s}

// CSV-parser (robuust, quotes + multiline), identiek aan worker.
function parseCsvText(text){
  const rows=[];let field='',row=[],inQ=false
  for(let i=0;i<text.length;i++){const c=text[i]
    if(inQ){if(c==='"'){if(text[i+1]==='"'){field+='"';i++}else inQ=false}else field+=c}
    else{if(c==='"')inQ=true;else if(c===','){row.push(field);field=''}
    else if(c==='\n'){row.push(field);rows.push(row);row=[];field=''}
    else if(c==='\r'){}else field+=c}}
  if(field.length||row.length){row.push(field);rows.push(row)}
  return rows
}

async function fetchRows(fid,maxPages){
  const out=[];let hdr=null
  for(let p=1;p<=maxPages;p++){
    const url='https://api.tradedoubler.com/1.0/products.csv;page='+p+';pageSize=100;csvFlattenFields=true;fid='+fid+'?token='+MM_TOKEN
    const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (feed-bot) Chrome/120','Accept':'text/csv,*/*'}})
    if(!r.ok){console.error('fid',fid,'page',p,'HTTP',r.status);break}
    const text=await r.text();if(text.length<50)break
    const rows=parseCsvText(text);if(rows.length<2)break
    if(!hdr)hdr=rows[0]
    for(let i=1;i<rows.length;i++){const o={};for(let j=0;j<hdr.length;j++)o[hdr[j]]=(rows[i][j]||'').trim();out.push(o)}
    if(rows.length-1<100)break
  }
  return out
}

function buildSimonly(rows){
  const items=[]
  for(const r of rows){
    const prov=(r['(field)provider_name']||'').trim()
    const month=mmNum(r['(field)totaalprijs_per_maand']||r['(field)monthly_price'])
    if(!prov||month<=0||month>130)continue
    const dur=mmNum(r['(field)subscription_duration'])||24
    items.push({
      id:'mm_'+(r['TDProductId']||r['tdId']||Math.random().toString(36).slice(2,9)),
      name:(r['name']||'').trim(),model:'',brand:'',colour:'',storage:'',storageGB:0,condition:'nieuw',
      price:month,displayPrice:'\u20ac'+(month%1===0?String(month):month.toFixed(2).replace('.',',')),
      baseMonthlyCost:month,deviceMonthlyCost:0,deviceDownPayment:0,deviceTotalPrice:0,deviceCashPrice:0,deviceTotalExBtw:0,
      initialCost:0,eenmaligBron:'',image:(r['imageUrl']||'').trim(),affiliateUrl:(r['productUrl']||'').trim(),
      merchantName:'MediaMarkt',reseller:'MediaMarkt',resellerLogo:MM_LOGO,network:prov,
      dataGB:mmDataGB(r['(field)mobile_data_specs']),speedMbit:0,hasTV:false,
      contractMonths:dur,contractLabel:dur+' maanden',minutesLabel:(r['(field)minute_sms_specs']||'').trim(),
      effectiveMonthly:month,paymentType:'maandelijks',promo:(r['promoText']||'').trim(),isZakelijk:false,source:'mediamarkt'
    })
  }
  return items
}

function parseDevice(r){
  const rawName=(r['name']||'').trim()
  const brand=mmTitleCase(r['brand']||'')
  const isRefurb=/refurb|renewed|tweedehands/i.test(rawName)
  const condition=isRefurb?'refurbished':'nieuw'
  let clean=rawName.replace(/\s*\(\s*refurbished\s*\)\s*/ig,' ').replace(/\brefurbished\b/ig,' ').replace(/\d+(?:[.,]\d+)?\s*["\u2033\u201d]/g,' ').replace(/\b\d+\+\d+\s*GB\b/ig,' ').replace(/\bSmartphone\b/ig,' ').replace(/\bRugged\b/ig,' ').replace(/\s*-\s*/g,' ').replace(/\s+/g,' ').trim()
  let storage='',storageGB=0,m,re=/(\d+)\s*(TB|GB)\b/ig,last=null
  while((m=re.exec(clean))!==null)last=m
  if(last){const val=parseInt(last[1],10);const unit=last[2].toUpperCase();storageGB=unit==='TB'?val*1024:val;storage=val+' '+unit}
  let colour=''
  const palette=MOBIELNL_COLORS.concat(DEVICE_COLORS).slice().sort((a,b)=>b.length-a.length)
  for(let i=0;i<palette.length;i++){const c=palette[i];if(new RegExp('\\b'+c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(clean)){colour=c;break}}
  const fieldCol=(r['(field)color']||'').trim();if(!colour&&fieldCol)colour=fieldCol
  let model=clean
  if(storage)model=model.replace(/\d+\s*(TB|GB)\b/ig,' ')
  if(colour)model=model.replace(new RegExp('\\b'+colour.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','ig'),' ')
  model=model.replace(/\b[45]G\b/ig,' ')
  const bl=brand.toLowerCase()
  if(bl&&model.toLowerCase().indexOf(bl+' ')===0)model=model.slice(brand.length+1)
  else if(bl&&model.toLowerCase().indexOf(bl)===0)model=model.slice(brand.length)
  model=model.replace(/\s+/g,' ').replace(/^[\s\-\u2013]+|[\s\-\u2013]+$/g,'').trim()
  const fullName=((brand+' '+model).replace(/\s+/g,' ')).trim()
  const price=mmNum(r['price'])
  return {brand,model,fullName,storage,storageGB,colour,condition,grade:'',battery:0,ean:(r['ean']||'').replace(/\D/g,''),price,image:(r['imageUrl']||r['productImage']||'').trim(),url:(r['productUrl']||'#').trim()}
}

function buildDevices(rows){
  const out=[]
  for(const r of rows){
    if(/ \+ /.test(r['name']||''))continue
    const p=parseDevice(r)
    if(p.price>0&&p.storageGB>0)out.push(p)
  }
  return out
}

;(async()=>{
  const telcoRows=await fetchRows(MM_TELCO_FID,15)
  const devRows=await fetchRows(MM_DEVICE_FID,8)
  const simonly=buildSimonly(telcoRows)
  const devices=buildDevices(devRows)
  fs.writeFileSync('mm-simonly.json',JSON.stringify(simonly))
  fs.writeFileSync('mm-devices.json',JSON.stringify(devices))
  const meta={updated:new Date().toISOString(),simonly:simonly.length,devices:devices.length}
  fs.writeFileSync('mm-meta.json',JSON.stringify(meta,null,2))
  console.log('OK:',JSON.stringify(meta))
})()
