import re, json, sys
from parse_exam import load, clean_pages

NUM = re.compile(r'^\s*(\d{1,3})\s*[\.\-\)]+\s*(\S.*)$')
NUM_BARE = re.compile(r'^\s*(\d{1,3})\s+(\S.*)$')
OPT_PAREN = re.compile(r'^\s*([A-Da-d])\s*[\)\.]\s*(.*)$')
OPT_BARE = re.compile(r'^(\s{5,})([A-D])\s+(\S.*)$')
SKIP = re.compile(r'^\s*(BLOQUE\s+\d+|CONOCIMIENTOS\s+\w+|PARTE\s+\w+|P\s*á\s*g\s*i\s*n\s*a.*)\s*$', re.I)

def join(parts):
    out = ''
    for p in parts:
        p = p.strip()
        if not p: continue
        if out.endswith('-') and p[:1].islower() and len(out) > 1 and out[-2].isalpha():
            out = out[:-1] + p
        else:
            out = (out + ' ' + p) if out else p
    return out

def parse(path, first=1, bare=False, nopts=4, numre=None):
    lines = clean_pages(load(path))
    numre = numre or NUM
    qs, cur, expected = [], None, first
    letters = 'ABCD'[:nopts]
    for pg, s in lines:
        if not s.strip() or SKIP.match(s): continue
        m = numre.match(s)
        if m and int(m.group(1)) == expected and (cur is None or len(cur['opts']) >= nopts - 1):
            cur = {'n': expected, 'page': pg, 'stem': [m.group(2)], 'opts': {}, 'last': 'stem'}
            qs.append(cur); expected += 1
            continue
        if cur is None: continue
        if bare:
            mo = OPT_BARE.match(s)
            letter, txt = (mo.group(2), mo.group(3)) if mo else (None, None)
        else:
            mo = OPT_PAREN.match(s)
            letter, txt = (mo.group(1).upper(), mo.group(2)) if mo else (None, None)
        if letter and len(cur['opts']) < nopts and letter == letters[len(cur['opts'])]:
            cur['opts'][letter] = [txt]; cur['last'] = letter
            continue
        if cur['last'] == 'stem': cur['stem'].append(s)
        else: cur['opts'][cur['last']].append(s)
    return [{'n': q['n'], 'page': q['page'], 'stem': join(q['stem']),
             'opts': {k: join(v) for k, v in q['opts'].items()}} for q in qs]

if __name__ == '__main__':
    path, out = sys.argv[1], sys.argv[2]
    kw = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
    qs = parse(path, **kw)
    bad = [q['n'] for q in qs if len(q['opts']) != kw.get('nopts', 4)]
    print(f"{path}: {len(qs)} preguntas; mal formadas={bad[:20]}")
    json.dump(qs, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
