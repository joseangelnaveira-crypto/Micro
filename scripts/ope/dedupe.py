import json, re, sys, unicodedata
S = sys.argv[1]
def norm(s):
    s = unicodedata.normalize('NFD', s.lower()); s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.findall(r'[a-z0-9]{3,}', s)
keep = json.load(open(f"{S}/keep.json", encoding='utf-8'))
bank = json.load(open(f"{S}/bank_existing.json", encoding='utf-8'))
bank_sets = [(set(norm(b['question'])), b) for b in bank]
def jac(a, b):
    return len(a & b) / max(1, len(a | b))
# duplicados contra el banco Murray
vs_bank = []
for q in keep:
    s = set(norm(q['stem']))
    best, bb = 0, None
    for bs, b in bank_sets:
        if not (s & bs): continue
        j = jac(s, bs)
        if j > best: best, bb = j, b
    q['bank_sim'] = round(best, 2)
    if best >= 0.6: vs_bank.append((q, bb, best))
print('similares al banco (>=0.6):', len(vs_bank))
for q, b, j in sorted(vs_bank, key=lambda x: -x[2])[:25]:
    print(f"  {j:.2f} [{q['exam']} #{q['n']}] {q['stem'][:90]}\n       BANCO: {b['question'][:90]}")
# duplicados entre exámenes
seen, dups = [], []
res = []
for q in keep:
    s = set(norm(q['stem'] + ' ' + q['opts'][q['ans']]))
    d = None
    for t, o in seen:
        if jac(s, t) >= 0.75: d = o; break
    if d: dups.append((q, d))
    else: seen.append((s, q)); res.append(q)
print('duplicados entre exámenes:', len(dups))
for q, d in dups[:40]: print(f"  [{q['exam']} #{q['n']}] ~ [{d['exam']} #{d['n']}]  {q['stem'][:80]}")
json.dump(res, open(f"{S}/keep_dedup.json", 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('tras dedupe interno:', len(res))
