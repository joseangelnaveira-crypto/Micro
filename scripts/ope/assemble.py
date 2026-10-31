import json, re, sys
S = sys.argv[1]
sys.path.insert(0, S)
from parse_exam import parse_key

def rd(f): return json.load(open(f"{S}/{f}", encoding='utf-8'))
def kv(s):  # "A1 B2" -> dict
    return {i + 1: c for i, c in enumerate(s.split())}

exams = []
# --- SAS (clave definitiva, ya parseada)
for f, label, date in [("out_sas2018.json", "OPE SAS oct-2018", "2018-10"),
                       ("out_sas2019.json", "OPE SAS ene-2019 (aplazada)", "2019-01"),
                       ("out_sas2021.json", "OPE SAS 2021", "2021"),
                       ("out_sas2023.json", "OPE SAS 2023", "2023"),
                       ("out_sas2025.json", "OPE SAS 2025", "2025")]:
    d = rd(f)
    key = {int(n): v for n, v in d['key'].items()}
    exams.append(dict(label=label, date=date, qs=d['questions'], key=key, keytype='definitiva'))

# --- Castilla y León 2021 (plantilla + correcciones)
t = open(f"{S}/pdf/cyl2021_resp.txt", encoding='utf-8').read()
key = {}
for m in re.finditer(r'(?<!\d)(\d{1,3})\s+([ABCD])\b', t):
    n = int(m.group(1))
    if n not in key and 1 <= n <= 165: key[n] = m.group(2)
for n, v in {73: 'B', 107: 'B', 127: 'B', 48: 'C'}.items(): key[n] = v
exams.append(dict(label="OPE Castilla y León 2021", date="2021-06", qs=rd("q_cyl2021.json"), key=key, keytype='plantilla corregida'))

# --- Valencia CO/52/22 (definitiva, transcrita de la imagen)
val = kv("C D D A D D A D X A D B C C B A D D B B C D D C B C A B C B A B C A B C A B C C B C B B B C B A D A C D C D A D A A D D C A D D D A B X D D C A D D B C D D D X".replace("X", "ANULADA"))
exams.append(dict(label="OPE Valencia CHGUV 2025", date="2025-06", qs=rd("q_val2025.json"), key=val, keytype='definitiva'))

# --- Madrid 2024 (plantilla PROVISIONAL, transcrita)
mad = kv("D B D B B A D C D B C A D C C A B A C C C C C C C B C B C "
         "B C A B A D D B A B B C B C A D A C C C B D C A A B D B D "
         "D B D B C C D B B C A C D D B D D B C D C A A A B C B A D "
         "C A B B A C B D D B A D D D B D B C B A A D C A B A A D B "
         "D C D C C B C C C D D D D A C B C D D B A D A C B D C A C "
         "A D B A A C A A C B B B C D C")
exams.append(dict(label="OPE Madrid 2024", date="2024-12", qs=rd("q_mad2024.json"), key=mad, keytype='PROVISIONAL'))

out = []
for e in exams:
    for q in e['qs']:
        a = e['key'].get(q['n'])
        out.append(dict(exam=e['label'], date=e['date'], keytype=e['keytype'], n=q['n'], page=q.get('page'),
                        stem=q['stem'], opts=q['opts'], ans=a))
    print(e['label'], len(e['qs']), 'preguntas', len(e['key']), 'claves', sum(1 for v in e['key'].values() if v == 'ANULADA'), 'anuladas')
json.dump(out, open(f"{S}/all_raw.json", 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(out))
