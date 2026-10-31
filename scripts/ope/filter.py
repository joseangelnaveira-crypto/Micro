import json, re, sys
S = sys.argv[1]
qs = json.load(open(f"{S}/all_raw.json", encoding='utf-8'))
LEGAL = re.compile(r'\b(ley|leyes|constituci[oó]n|estatuto|decreto|real decreto|orden \d|ministerio|consejer[ií]a|servicio andaluz|servicio madrile|boe|bocm|boja|parlamento|funcionari|derechos? (de|del) (los )?pacientes|autonom[ií]a del paciente|protecci[oó]n de datos|transparencia|igualdad|violencia de g[eé]nero|riesgos laborales|carrera profesional|personal estatutario|tribunal constitucional|cortes generales|comunidad aut[oó]noma|gobierno|sindical|huelga|jornada|retribucion|incompatibilidad|procedimiento administrativo|contrataci[oó]n|presupuest|consentimiento informado|historia cl[ií]nica|mapa sanitario|[aá]rea de salud|zona b[aá]sica|plan de salud|calidad asistencial|EFQM|SNS|sistema nacional de salud|acoso|conciliaci[oó]n|permiso|vacaciones|excedencia|licencia|libertad sindical|regimen disciplinario|falta (leve|grave|muy grave)|sanci[oó]n)\b', re.I)
MICRO = re.compile(r'(bacter|virus|v[ií]ric|hongo|f[uú]ngic|levadura|par[aá]sit|antibi|antimicrob|antif[uú]ng|antivir|cultivo|\bPCR\b|microb|patóg|pat[oó]g|cepa\b|gram|coccus|cocos|bacilo|staphyl|estafilo|strepto|estrepto|candida|aspergill|plasmod|leishman|toxoplas|tripan|mycobac|micobac|tubercul|salmonel|escherich|klebsiell|pseudomon|\bVIH\b|hepatitis|herpes|esporul|aglutin|serolog|anticuerpo|vacuna|hemocultivo|MALDI|secuenci|genoma|pl[aá]smido|pared celular|\bagar\b|tinci[oó]n|helmint|nem[aá]todo|cest[oó]|trem[aá]tod|protozoo|artr[oó]podo|garrapata|mosquito|entamoeba|giardia|cryptospor|ameba|mic[oó]sis|dermatofit|prion|carbapenem|betalact|lactamasa|antibiograma|CMI\b|infecci[oó]n|enterobact|neisseria|legionell|clostrid|listeri|brucel|borreli|treponem|rickett|chlamyd|mycoplasm|ureaplasm|bordetell|haemophil|vibrio|campylobac|helicobac|cryptococ|pneumocyst|histoplasm|coccidio|schisto|filaria|oncocerc|ascaris|trichur|taenia|echinococ|anisakis|sarcopt|pediculo|adenovir|rotavir|norovir|enterovir|coronavir|SARS|influenza|VRS|papiloma|citomegalovirus|epstein|varicela|sarampi|rubeola|rub[eé]ola|parvovir|polioma|retrovir|flavivir|arbovir|dengue|ébola|ebola|zika|rabia|mpox|viruela)', re.I)
IMG = re.compile(r'\b(imagen|figura|fotograf[ií]a|observe|se muestra|adjunta|siguiente (gr[aá]fic|tabla|esquema|dibujo))\b', re.I)

STAT = re.compile(r'(distribuci[oó]n normal|box-?plot|coste-|esperanza de vida|varianza|mediana|desviaci[oó]n (t[ií]pica|est[aá]ndar)|intervalo de confianza|odds|riesgo relativo|estudios? (de )?(cohorte|casos y controles)|ensayo cl[ií]nico|bioestad|muestreo|regresi[oó]n|prescripci[oó]n electr|DIRAYA)', re.I)
CTX = re.compile(r'(este (caso|paciente|supuesto|cuadro)|caso anterior|el paciente anterior|anteriormente|a la vista (del|de los)|estos resultados|ante estos|en el supuesto|dicho paciente|dicho caso|del antibiograma|ante este)', re.I)
keep, dropped, imgq, annul = [], [], [], 0
for q in qs:
    text = q['stem'] + ' ' + ' '.join(q['opts'].values())
    if q['ans'] in (None, 'ANULADA'):
        annul += 1; q['why'] = 'anulada/sin clave'; dropped.append(q); continue
    if len(q['opts']) != 4:
        q['why'] = 'opciones'; dropped.append(q); continue
    if q['exam'].startswith('OPE SAS') and 101 <= q['n'] <= 150:
        q['why'] = 'caso-clinico(SAS 101-150)'; dropped.append(q); continue
    if CTX.search(q['stem']):
        q['why'] = 'contexto'; dropped.append(q); continue
    if STAT.search(q['stem']):
        q['why'] = 'estadistica/gestion'; dropped.append(q); continue
    legal = bool(LEGAL.search(q['stem'])); micro = bool(MICRO.search(text))
    if legal and not micro:
        q['why'] = 'legal'; dropped.append(q); continue
    if not micro:
        q['why'] = 'sin-micro'; dropped.append(q); continue
    if IMG.search(q['stem']):
        q['why'] = 'imagen?'; imgq.append(q); continue
    keep.append(q)
print('total', len(qs), 'keep', len(keep), 'imagen?', len(imgq), 'drop', len(dropped), 'anuladas', annul)
json.dump(keep, open(f"{S}/keep.json", 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(imgq, open(f"{S}/imgq.json", 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dropped, open(f"{S}/dropped.json", 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
from collections import Counter
print(Counter((q['exam'], q['why']) for q in dropped))
