import json, re, sys
S = sys.argv[1]
qs = json.load(open(f"{S}/keep_dedup.json", encoding='utf-8'))
rv = json.load(open(f"{S}/review.json", encoding='utf-8'))
CUT = re.compile(r'\s*(SERMAS D24.*|ABRIR SOLAMENTE.*|SAS_FEA.*|FEA MICROBIOLOG[ÍI]A\s*[-Y].*|INSTRUCCIONES PARA.*|PREGUNTAS DE RESERVA.*|NORMATIVA SANITARIA.*|BLOQUE \d.*|FEA MICROBIOLOG[ÍI]A Y.*)$', re.S)
def clean(t):
    t = CUT.sub('', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t
out, issues = [], []
for i, q in enumerate(qs):
    if str(i) in rv['drop']: continue
    stem = clean(q['stem']); opts = {k: clean(v) for k, v in q['opts'].items()}
    for a, b in rv['fix'].get(str(i), []):
        stem = stem.replace(a, b); opts = {k: v.replace(a, b) for k, v in opts.items()}
    # chequeos
    if len(stem) > 700 or any(len(v) > 700 for v in opts.values()): issues.append((i, 'largo'))
    if any(not v for v in opts.values()): issues.append((i, 'opcion vacia'))
    if re.search(r'[�ÃÂ]', stem + ''.join(opts.values())): issues.append((i, 'codificacion'))
    if len(set(opts.values())) < 4: issues.append((i, 'opciones repetidas'))
    out.append(dict(id=i, exam=q['exam'], n=q['n'], keytype=q['keytype'], stem=stem, opts=opts, ans=q['ans']))
print('finales:', len(out)); print('incidencias:', issues)
json.dump(out, open(f"{S}/final.json", 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
from collections import Counter
print(Counter(q['exam'] for q in out))
print(Counter(q['ans'] for q in out))
