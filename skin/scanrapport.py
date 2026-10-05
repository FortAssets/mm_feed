import json,glob,collections,sys
d=sys.argv[1]; C=collections.defaultdict(lambda:{'n':0,'p':set()}); O=collections.defaultdict(lambda:{'n':0,'p':set()}); ov=[]; ft=collections.Counter(); blok=0
for f in glob.glob(d+'/*.json'):
    j=json.load(open(f)); n=f.split('/')[-1][:-5]
    if j['titel'].startswith('Just a moment'): blok+=1; continue
    for k,v in j['contrast'].items(): C[k]['n']+=v['n']; C[k]['p'].add(n); C[k]['c']=v['c']; C[k]['t']=v['t']
    for k,v in j['oud'].items(): O[k]['n']+=v['n']; O[k]['p'].add(n); O[k]['t']=v.get('t','')
    if j['overloop']>2: ov.append((n,j['overloop']))
    for e in j['fouten']: ft[e]+=1
N=int(sys.argv[2]) if len(sys.argv)>2 else 60
print('paginas',len(glob.glob(d+'/*.json')),'geblokkeerd',blok)
print('== CONTRAST',len(C))
for k,v in sorted(C.items(),key=lambda x:(-len(x[1]['p']),-x[1]['n']))[:N]: print(len(v['p']),v['n'],v['c'],k[:150],'|',v['t'][:30],'|',sorted(v['p'])[0][:30])
print('== OUD',len(O))
for k,v in sorted(O.items(),key=lambda x:(-len(x[1]['p']),-x[1]['n']))[:N]: print(len(v['p']),v['n'],k[:150],'|',v['t'][:25],'|',sorted(v['p'])[0][:30])
print('== OVERLOOP',ov[:30]); print('== FOUTEN',ft.most_common(8))
