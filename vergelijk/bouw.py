#!/usr/bin/env python3
"""Bouwt per combinatie de artikel-body uit telefoons.json (specs + feed) en tekst/<handle>.json."""
import json, html, sys, os, urllib.parse
M = json.load(open('telefoons.json'))
GO = 'https://shop.deprijsvergelijker.com/api/shop/go'
def eur(n):
    n = round(float(n), 2)
    s = ('%d' % n) if n == int(n) else ('%.2f' % n).replace('.', ',')
    if n >= 1000: 
        heel, _, rest = s.partition(','); heel = f"{int(heel):,}".replace(',', '.'); s = heel + (',' + rest if rest else '')
    return '€' + s
def nl(x):
    if x is None: return None
    if isinstance(x, float) and x != int(x): return str(x).replace('.', ',')
    x = int(x); return f"{x:,}".replace(',', '.') if x >= 10000 else str(x) if x < 1000 else f"{x:,}".replace(',', '.')
def link(m, w=None):
    u = GO + '?cat=' + m['cat'] + '&amp;i=' + m['id'] + ('&amp;w=' + urllib.parse.quote(w) if w else '')
    return u
W = ' class="win"'
A = 'target="_blank" rel="sponsored nofollow noopener"'
def winkelnaam(w): return 'bol.com (partner)' if w == 'bol.com partner' else w
def kaart(m, kant):
    rij = ''.join(f'<a class="vg-wr{" eerste" if n == 0 else ""}" href="{link(m, w)}" {A}><span>{html.escape(winkelnaam(w))}</span><b>{eur(p)}</b><i>›</i></a>' for n, (w, p) in enumerate(m['winkels'][:4]))
    var = f"{m['variant_gb']} GB, los toestel" if m.get('variant_gb') else 'los toestel'
    return (f'<div class="vg-k"><a href="{link(m)}" {A}><img class="vg-im" src="{html.escape(m["im"])}" alt="{html.escape(m["naam"])}" loading="lazy"></a>'
            f'<strong class="vg-n">{html.escape(m["kort"])}</strong><span class="vg-var">{var}</span>'
            f'<div class="vg-w" data-vgw="{kant}">{rij}</div></div>')
# (label, sleutel, opmaak, richting)  richting: 1 = hoger is beter, -1 = lager is beter, 0 = geen winnaar
RIJEN = [
 ('Uitgebracht', 'release', lambda m: m['release'], 0),
 ('Scherm', None, lambda m: f"{nl(m['scherm_inch'])} inch {m['scherm_type']}" if m.get('scherm_inch') else None, 0),
 ('Verversing', 'scherm_hz', lambda m: f"{m['scherm_hz']} Hz", 1),
 ('Piekhelderheid', 'helderheid_nits', lambda m: f"{nl(m['helderheid_nits'])} nits", 1),
 ('Chip', None, lambda m: m.get('chip'), 0),
 ('Werkgeheugen', 'ram_gb', lambda m: f"{m['ram_gb']} GB", 1),
 ('Opslag', None, lambda m: ', '.join(('%d TB' % (g // 1024)) if g >= 1024 else f'{g} GB' for g in m['opslag_gb']) if m.get('opslag_gb') else None, 0),
 ("Camera's achter", None, lambda m: m.get('camera_achter'), 0),
 ('Telelens', 'tele_zoom', lambda m: f"{nl(m['tele_zoom'])}x optische zoom" if m.get('tele_zoom') else 'geen telelens', 2),
 ('Selfiecamera', 'camera_voor_mp', lambda m: f"{nl(m['camera_voor_mp'])} MP", 1),
 ('Accu', 'accu_mah', lambda m: f"{nl(m['accu_mah'])} mAh", 1),
 ('Opladen met kabel', 'laden_w', lambda m: f"{nl(m['laden_w'])} W", 1),
 ('Draadloos opladen', 'draadloos_w', lambda m: f"{nl(m['draadloos_w'])} W", 1),
 ('Gewicht', 'gewicht_g', lambda m: f"{nl(m['gewicht_g'])} gram", -1),
 ('Dikte', 'dikte_mm', lambda m: f"{nl(m['dikte_mm'])} mm", -1),
 ('Waterbestendig', None, lambda m: m.get('ip'), 0),
 ('Software-updates', 'updates_jaren', lambda m: f"{m['updates_jaren']} jaar", 1),
]
def tabel(a, b):
    r = ''
    for lab, k, f, richting in RIJEN:
        va = a.get(k) if k else True; vb = b.get(k) if k else True
        if k and richting != 2 and (va is None or vb is None): continue
        try: ta, tb = f(a), f(b)
        except Exception: continue
        if not ta or not tb: continue
        wa = wb = False
        if richting in (1, -1) and va != vb: wa = (va > vb) if richting == 1 else (va < vb); wb = not wa
        if richting == 2: wa, wb = bool(va) and not vb, bool(vb) and not va
        r += f'<tr><td>{lab}</td><td{W if wa else ""}>{html.escape(str(ta))}</td><td{W if wb else ""}>{html.escape(str(tb))}</td></tr>'
    pa, pb = a['prijs'], b['prijs']
    r += f'<tr><td>Laagste prijs nu</td><td data-vgp="a"{W if pa < pb else ""}>{eur(pa)}</td><td data-vgp="b"{W if pb < pa else ""}>{eur(pb)}</td></tr>'
    return f'<div class="vg-t"><table><thead><tr><th></th><th>{html.escape(a["kort"])}</th><th>{html.escape(b["kort"])}</th></tr></thead><tbody>{r}</tbody></table></div>'
def tokens(t, a, b):
    rep = {'prijs_a': eur(a['prijs']), 'prijs_b': eur(b['prijs']), 'verschil': eur(abs(a['prijs'] - b['prijs'])).replace('€', ''),
           'winkel_a': winkelnaam(a['winkels'][0][0]), 'winkel_b': winkelnaam(b['winkels'][0][0])}
    for k, v in rep.items(): t = t.replace('{{' + k + '}}', f'<span data-vgt="{k}">{html.escape(v)}</span>')
    assert '{{' not in t, t[:200]
    return t
CSS = open('vg.css').read()
def body(T):
    a, b = M[T['a']], M[T['b']]
    tk = lambda s: tokens(s, a, b)
    bronnen = []
    for m in (a, b):
        for u in m.get('bronnen', [])[:3]:
            if u not in bronnen: bronnen.append(u)
    h = [f'<style>{CSS}</style>',
         f'<div class="vg" data-vg data-cat="{a["cat"]}" data-a="{a["id"]}" data-b="{b["id"]}" data-sa="{T["a"]}" data-sb="{T["b"]}">',
         f'<p class="vg-lead">{tk(T["lead"])}</p>',
         f'<div class="vg-duo">{kaart(a, "a")}<span class="vg-vs">vs</span>{kaart(b, "b")}</div>',
         '<p class="vg-f">De knoppen gaan naar de winkel. Prijzen worden elke nacht bijgewerkt; koop je iets, dan ontvangen wij een vergoeding en betaal jij hetzelfde.</p>',
         f'<h2>{html.escape(a["kort"])} en {html.escape(b["kort"])}: specificaties naast elkaar</h2>', tabel(a, b),
         '<p class="vg-f">Groen is de betere waarde op dat onderdeel.</p>']
    for s in T['secties']: h += [f'<h2>{html.escape(s["kop"])}</h2>', tk(s['tekst'])]
    li = lambda xs: ''.join(f'<li>{tk(html.escape(x))}</li>' for x in xs)
    h += ['<h2>Welke past bij jou?</h2>',
          f'<div class="vg-kies"><div class="vg-ka"><strong>Kies de {html.escape(a["kort"])} als</strong><ul>{li(T["kies_a"])}</ul><a class="vg-knop" href="{link(a)}" {A}>Bekijk de {html.escape(a["kort"])} bij <span data-vgt="winkel_a">{html.escape(winkelnaam(a["winkels"][0][0]))}</span></a></div>'
          f'<div class="vg-kb"><strong>Kies de {html.escape(b["kort"])} als</strong><ul>{li(T["kies_b"])}</ul><a class="vg-knop" href="{link(b)}" {A}>Bekijk de {html.escape(b["kort"])} bij <span data-vgt="winkel_b">{html.escape(winkelnaam(b["winkels"][0][0]))}</span></a></div></div>',
          '<h2>Nu kopen of wachten tot Black Friday?</h2>', tk(T['wachten']),
          '<h2>Veelgestelde vragen</h2>']
    for q in T['faq']: h += [f'<h3>{html.escape(q["v"])}</h3>', f'<p>{tk(html.escape(q["a"]))}</p>']
    h += ['<p class="vg-f">Specificaties van de Europese uitvoering, nagelopen op 5 oktober 2026. Bronnen: ' +
          ', '.join(f'<a href="{html.escape(u)}" rel="nofollow noopener" target="_blank">{urllib.parse.urlparse(u).netloc.replace("www.", "")}</a>' for u in bronnen) +
          '. Meer vergelijken: <a href="/blogs/vergelijk">alle vergelijkingen</a>, <a href="/pages/vergelijken?cat=telefoons">alle telefoons</a>, <a href="/blogs/advies/goedkoopste-smartphone-black-friday-2026">koopgids smartphones</a>.</p>', '</div>']
    return '\n'.join(h)
if __name__ == '__main__':
    os.makedirs('uit', exist_ok=True)
    for c in json.load(open('combos.json')):
        f = f'tekst/{c["handle"]}.json'
        if not os.path.exists(f): print('ontbreekt', f); continue
        T = json.load(open(f)); b = body(T)
        assert '—' not in b and '–' not in b, c['handle']
        open(f'uit/{c["handle"]}.html', 'w').write(b)
        a, bb = M[T['a']], M[T['b']]
        meta = {'handle': c['handle'], 'title': T['title'], 'summary': T['summary'], 'seo_title': T['seo_title'], 'seo_description': T['seo_description'],
                'tags': ['vergelijking', 'cat|telefoons|Telefoons', f'A|{T["a"]}|{a["kort"]}', f'B|{T["b"]}|{bb["kort"]}', 'telefoon', a['merk'].lower(), bb['merk'].lower()]}
        json.dump(meta, open(f'uit/{c["handle"]}.meta.json', 'w'), ensure_ascii=False, indent=1)
        print(c['handle'], len(b), b.count('rel="sponsored'))
