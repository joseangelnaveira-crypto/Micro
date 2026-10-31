import re, json, sys
sys.path.insert(0, sys.argv[1])
from parse_exam import load, clean_pages
from parse2 import join, OPT_PAREN
NUM = re.compile(r'^\s*(\d{1,3})\s*[.\-)]?\s+(\S.*)$')

JUNK = re.compile(r'(FEA\s+MICROBIOLOG|FACULTATIVO\s+ESPECIALISTA|CUESTIONARIO|^\s*PARASITOLOG[ÍI]A|^\s*MICROBIOLOG[ÍI]A\s+Y\s*$|PR[ÁA]CTICO\s*$|OEP\s*20\d\d|ESTABILIZACI|TURNO\s+LIBRE|^\s*LIBRE\s*$|SAS_FEA|^\s*RESERVA\s*$|\d{4}\s*/\s*LIBRE|P[ÁA]GINA\s+\d+)', re.I)
CASE_MARK = re.compile(r'^\s*CASO\s+PR[ÁA]CTICO\s+\d+\s*:?\s*(.*)$', re.I)

def parse(path):
    lines = clean_pages(load(path))
    qs, cur, expected = [], None, 1
    case, collecting = None, False
    for pg, s in lines:
        if not s.strip(): continue
        indent = len(s) - len(s.lstrip())
        m = NUM.match(s)
        if m and int(m.group(1)) == expected and (cur is None or len(cur['opts']) >= 3):
            if collecting:
                case = join(case_lines); collecting = False
            if expected > 150: case = None
            cur = {'n': expected, 'case': case, 'stem': [m.group(2)], 'opts': {}, 'last': 'stem', 'page': pg}
            qs.append(cur); expected += 1
            continue
        if cur is None: continue
        if collecting:
            if not JUNK.search(s):
                cm = CASE_MARK.match(s)
                case_lines.append(cm.group(1) if cm else s)
            continue
        mo = OPT_PAREN.match(s)
        if mo and len(cur['opts']) < 4 and mo.group(1).upper() == 'ABCD'[len(cur['opts'])]:
            cur['opts'][mo.group(1).upper()] = [mo.group(2)]; cur['last'] = mo.group(1).upper(); continue
        cm = CASE_MARK.match(s)
        if cur['last'] != 'stem' and len(cur['opts']) == 4 and (cm or (indent <= 2 and not JUNK.search(s)) or JUNK.search(s)) and 100 <= expected <= 151:
            # posible inicio de caso (solo en la zona práctica)
            collecting = True; case_lines = []
            if cm and cm.group(1): case_lines.append(cm.group(1))
            elif not JUNK.search(s): case_lines.append(s)
            case = None
            continue
        if cur['last'] == 'stem': cur['stem'].append(s)
        else: cur['opts'][cur['last']].append(s)
    return [{'n': q['n'], 'case': q['case'], 'page': q['page'], 'stem': join(q['stem']),
             'opts': {k: join(v) for k, v in q['opts'].items()}} for q in qs]

if __name__ == '__main__':
    S = sys.argv[1]
    for f, out in [('sas2018b_examen','c_sas2018'),('sas2019_examen','c_sas2019'),('sas2021_examen','c_sas2021'),('sas2023_examen','c_sas2023'),('sas2025_examen','c_sas2025')]:
        qs = parse(f"{S}/pdf/{f}.txt")
        pr = [q for q in qs if 101 <= q['n'] <= 150]
        nocase = [q['n'] for q in pr if not q['case']]
        print(f, len(qs), 'prácticas', len(pr), 'sin caso:', nocase)
        json.dump(qs, open(f"{S}/{out}.json", 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
