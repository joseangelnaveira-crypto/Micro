import json, re, sys
S = sys.argv[1]
qs = json.load(open(f"{S}/cases_all.json", encoding='utf-8'))
rv = json.load(open(f"{S}/review_cases.json", encoding='utf-8'))
byexam = {}
for q in qs: byexam.setdefault(q['exam'], {})[q['n']] = q
CUT = re.compile(r'\s*(SERMAS D24.*|ABRIR SOLAMENTE.*|SAS_FEA.*|INSTRUCCIONES PARA.*|PREGUNTAS DE RESERVA.*)$', re.S)
def clean(t): return re.sub(r'\s+', ' ', CUT.sub('', t)).strip()
out, issues = [], []
for q in qs:
    i = q['id']
    if str(i) in rv['drop']: continue
    case = q['case']
    if '2019' in q['exam']:
        case = ''
        if str(i) in rv.get('chain', {}):
            case = ' '.join(byexam[q['exam']][n]['stem'] for n in rv['chain'][str(i)])
    stem, opts = clean(q['stem']), {k: clean(v) for k, v in q['opts'].items()}
    case = clean(case)
    for a, b in rv['fix'].get(str(i), []):
        stem = stem.replace(a, b); case = case.replace(a, b); opts = {k: v.replace(a, b) for k, v in opts.items()}
    full = (case + '\n\n' + stem) if case else stem
    if len(full) > 2600 or any(len(v) > 700 for v in opts.values()): issues.append((i, 'largo', len(full)))
    if any(not v for v in opts.values()): issues.append((i, 'vacia'))
    out.append(dict(id=i, exam=q['exam'], n=q['n'], stem=full, opts=opts, ans=q['ans']))
print('casos finales:', len(out), 'incidencias:', issues)
from collections import Counter
print(Counter(q['exam'] for q in out))
import os
os.makedirs(f"{S}/lotes_casos", exist_ok=True)
by = {}
for q in out: by.setdefault(q['exam'], []).append(q)
for src, lst in by.items():
    fn = re.sub(r'[^A-Za-z0-9]+', '_', src).strip('_') + '.txt'
    blocks = []
    for q in lst:
        o = q['opts']
        # el texto del caso y la pregunta van en una sola línea separados por " ¶ " -> se convierte a salto doble al importar
        blocks.append(f"PREGUNTA: {q['stem'].replace(chr(10)+chr(10), ' ¶ ')}\nA) {o['A']}\nB) {o['B']}\nC) {o['C']}\nD) {o['D']}\nCORRECTA: {q['ans']}\nEXPLICACION: \nFUENTE: {src}")
    open(f"{S}/lotes_casos/{fn}", 'w', encoding='utf-8').write('\n====\n'.join(blocks) + '\n')
json.dump(out, open(f"{S}/final_cases.json", 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
