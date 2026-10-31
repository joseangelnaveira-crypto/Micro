import re, sys, json, collections

def load(path):
    t = open(path, encoding='utf-8', errors='replace').read()
    return t.split('\f')

def clean_pages(pages):
    # líneas que se repiten en muchas páginas = cabeceras/pies -> fuera
    cnt = collections.Counter()
    for p in pages:
        for l in set(x.strip() for x in p.split('\n') if x.strip()):
            cnt[l] += 1
    n = len(pages)
    boiler = {l for l, c in cnt.items() if c >= max(4, n * 0.25) and not re.match(r'^[A-Da-d][\)\.]', l)}
    out = []
    for pi, p in enumerate(pages):
        for l in p.split('\n'):
            s = l.rstrip()
            if s.strip() in boiler: continue
            if re.match(r'^\s*P[áa]gina\s+\d+\s+de\s+\d+\s*$', s): continue
            out.append((pi + 1, s))
    return out

OPT = re.compile(r'^\s*([A-Da-d])\s*[\)\.]\s*(.*)$')

def parse(path, first=1):
    lines = clean_pages(load(path))
    qs = []
    cur = None
    expected = first
    for pg, s in lines:
        if not s.strip():
            if cur: cur['_blank'] = True
            continue
        m = re.match(r'^\s*(\d{1,3})\s*[\.\-\)]?\s+(\S.*)$', s)
        # nueva pregunta: número esperado y la pregunta anterior ya tiene opciones (o es la primera)
        if m and int(m.group(1)) == expected and (cur is None or len(cur['opts']) >= 3):
            cur = {'n': expected, 'page': pg, 'stem': [m.group(2).strip()], 'opts': {}, 'last': 'stem'}
            qs.append(cur); expected += 1
            continue
        if cur is None: continue
        mo = OPT.match(s)
        if mo and len(cur['opts']) < 4 and mo.group(1).upper() == 'ABCD'[len(cur['opts'])]:
            cur['opts'][mo.group(1).upper()] = [mo.group(2).strip()]
            cur['last'] = mo.group(1).upper()
            continue
        # continuación
        if cur['last'] == 'stem':
            cur['stem'].append(s.strip())
        else:
            cur['opts'][cur['last']].append(s.strip())
    res = []
    for q in qs:
        res.append({'n': q['n'], 'page': q['page'],
                    'stem': ' '.join(q['stem']).strip(),
                    'opts': {k: ' '.join(v).strip() for k, v in q['opts'].items()}})
    return res

def parse_key(path):
    t = open(path, encoding='utf-8', errors='replace').read()
    key = {}
    for m in re.finditer(r'(?<![\d])(\d{1,3})\s+(ANULADA|[ABCD])\b', t, flags=re.I):
        n = int(m.group(1)); v = m.group(2).upper()
        if n not in key: key[n] = v
    return key

if __name__ == '__main__':
    exam, keyf = sys.argv[1], sys.argv[2]
    qs = parse(exam); key = parse_key(keyf)
    bad = [q['n'] for q in qs if len(q['opts']) != 4]
    print(f"{exam}: {len(qs)} preguntas, {len(key)} en plantilla, mal formadas={bad[:20]}, anuladas={[n for n,v in key.items() if v=='ANULADA']}")
    json.dump({'questions': qs, 'key': key}, open(sys.argv[3], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
