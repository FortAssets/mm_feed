# Voegt alle regels uit de crawl samen tot een lijst unieke bladen (per bron), met op welke pagina's ze voorkomen.
import json,glob,hashlib,collections,re
bladen={}; waar=collections.defaultdict(set); extern=set(); stijlen=collections.Counter()
for f in glob.glob('voor/data/*.json'):
    d=json.load(open(f))
    if d['titel'].startswith('Just a moment'): continue
    for b in d['bladen']:
        t='\n'.join(b['regels']); h=hashlib.md5(t.encode()).hexdigest()[:10]
        bladen[h]={'bron':b['bron'],'eigenaar':b['eigenaar'],'css':t}; waar[h].add(f.split('/')[-1][:-5])
    extern.update(d['extern'])
    for k,v in d['stijlen'].items(): stijlen[k]+=v
json.dump({h:dict(bladen[h],paginas=sorted(waar[h])) for h in bladen},open('bladen.json','w'))
json.dump(stijlen.most_common(),open('stijlen.json','w'),ensure_ascii=False)
tot=sum(len(b['css']) for b in bladen.values())
print('unieke bladen',len(bladen),'tekens',tot,'extern',len(extern))
for e in sorted(extern)[:20]: print(' ext',e[:110])
grote=sorted(bladen.items(),key=lambda x:-len(x[1]['css']))[:25]
for h,b in grote: print(h,len(b['css']),len(waar[h]),b['bron'][-60:],b['eigenaar'][-50:])
kl=collections.Counter()
for b in bladen.values():
    for m in re.finditer(r'(background(?:-color)?|color|border(?:-[a-z]+)?-color|border(?:-[a-z]+)?|fill|stroke|box-shadow|outline(?:-color)?)\s*:\s*([^;}]+)',b['css']):
        for c in re.findall(r'rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b',m.group(2)):
            kl[(m.group(1).split('-')[0] if not m.group(1).startswith('background') else 'background',c.lower().replace(' ',''))]+=1
json.dump([[k[0],k[1],v] for k,v in kl.most_common()],open('kleuren.json','w'))
print('kleurcombinaties',len(kl))
for k,v in kl.most_common(70): print(v,k)
ff=collections.Counter(re.sub(r'\s+',' ',m).strip()[:60] for b in bladen.values() for m in re.findall(r'font-family\s*:\s*([^;}]+)',b['css']))
print(ff.most_common(14))
