import json,glob,collections,sys,re
d=sys.argv[1]; C=collections.defaultdict(lambda:{'n':0,'p':set()}); O=collections.defaultdict(lambda:{'n':0,'p':set()}); blok=0; tot=0
for f in glob.glob(d+'/*.json'):
    j=json.load(open(f)); n=f.split('/')[-1][:-5]; tot+=1
    if j['titel'].startswith('Just a moment'): blok+=1; continue
    for k,v in j['contrast'].items():
        if 'chakra' in k or 'css-' in k: continue
        s=re.sub(r'#c[a-z0-9]{7}','',k.split('|')[0]).split(' > ')[-1]+'|'+'|'.join(k.split('|')[1:])
        C[s]['n']+=v['n']; C[s]['p'].add(n); C[s]['c']=v['c']; C[s]['t']=v['t']
    for k,v in j['oud'].items():
        if 'chakra' in k or 'css-' in k or 'pvnav-woord' in k or 'ZkFont' in k: continue
        s=k.split(' ')[0]+' '+re.sub(r'#c[a-z0-9]{7}','',k.split('|')[0]).split(' > ')[-1]+'|'+k.split('|')[-1][:22]
        O[s]['n']+=v['n']; O[s]['p'].add(n); O[s]['t']=v.get('t','')
N=int(sys.argv[2]) if len(sys.argv)>2 else 40
print('paginas',tot,'geblokkeerd',blok,'| contrast',len(C),'| oud',len(O))
for k,v in sorted(C.items(),key=lambda x:(-len(x[1]['p']),-x[1]['n']))[:N]: print('C',len(v['p']),v['c'],k[:95],'|',v['t'][:22],'|',sorted(v['p'])[0][:26])
for k,v in sorted(O.items(),key=lambda x:(-len(x[1]['p']),-x[1]['n']))[:N]: print('O',len(v['p']),k[:95],'|',v['t'][:20],'|',sorted(v['p'])[0][:26])
